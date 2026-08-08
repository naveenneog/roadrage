import './styles.css';

import { GameLoop } from './core/loop.ts';
import { Input, type InputSnapshot } from './core/input.ts';
import { defaultSave, loadSave, writeSave, type SaveData } from './core/storage.ts';
import { AudioDirector, type EngineTarget } from './audio/director.ts';
import { AUTO_LIVERIES, AUTO_RICKSHAW, getBike } from './data/bikes.ts';
import { CAREER_ORDER, getCircuit } from './data/circuits.ts';
import type { CircuitSpec } from './data/types.ts';
import { Race } from './game/race.ts';
import { tierForDifficulty } from './game/ai.ts';
import { engineBroadcast, musicIntensity } from './game/broadcast.ts';
import { canEnter, nextEvent, payEntry, purchase, selectBike } from './game/career.ts';
import type { Controls } from './game/physics.ts';
import { Hud } from './render/hud.ts';
import { Renderer } from './render/renderer.ts';
import { warmForRace } from './render/warmup.ts';
import { getTraffic } from './data/traffic.ts';
import { attachPresentation } from './ui/presenter.ts';
import { buildDebugSnapshot, type DebugSnapshot } from './ui/debug.ts';
import { buildFinish } from './ui/results.ts';
import {
  bindShellEvents, fitCanvas, resolveQuality, ResolutionGovernor, type QualityLevel,
} from './ui/viewport.ts';
import {
  CAMPAIGN_CHAPTERS, Screens, type CampaignChapter, type ScreenId,
} from './ui/screens.ts';

type Mode = 'menu' | 'racing' | 'paused' | 'results';

const canvas = document.getElementById('stage') as HTMLCanvasElement | null;
const uiRoot = document.getElementById('ui');
const rotateHint = document.getElementById('rotate-hint');
if (!canvas || !uiRoot) throw new Error('Missing #stage or #ui in the document');

const ctx = canvas.getContext('2d', { alpha: false });
if (!ctx) throw new Error('This browser cannot provide a 2D canvas context');

/**
 * The application shell.
 *
 * Owns the loop, the canvas, and which of the three worlds (menu, race,
 * results) is currently on screen. All game rules live in `game/`; this file
 * only decides what to show and when to save.
 */
class Game {
  private save: SaveData = loadSave();
  private mode: Mode = 'menu';
  private race: Race | null = null;
  private circuit: CircuitSpec | null = null;
  private chapter: CampaignChapter | null = null;
  private detachAudio: (() => void) | null = null;

  private readonly renderer: Renderer;
  private readonly hud = new Hud();
  private readonly audio = new AudioDirector();
  private readonly input: Input;
  private readonly screens: Screens;
  private readonly loop: GameLoop;

  private readonly qualityLevel: QualityLevel;
  private lastSnapshot: InputSnapshot | null = null;
  private takedowns = 0;
  private topSpeed = 0;
  private storyBeatsFired = new Set<string>();
  /** Capture-only: slows the simulation without slowing the render loop. */
  private timeScale = 1;
  /** Capture-only: keeps the player upright so footage never ends on a wreck. */
  private invincible = false;
  /** Adaptive resolution, driven by the measured frame rate. */
  private readonly governor = new ResolutionGovernor();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    uiRoot: HTMLElement,
  ) {
    const quality = resolveQuality(this.save.settings.quality);
    this.qualityLevel = quality;
    this.renderer = new Renderer(ctx, quality);
    this.input = new Input(canvas);
    this.input.attach();
    this.input.options.tilt = this.save.settings.tiltSteering;

    this.screens = new Screens(uiRoot, {
      startRace: (circuitId, bikeId) => this.beginRace(circuitId, bikeId),
      startCampaign: (index) => this.beginChapter(index),
      show: (screen) => this.screens.show(screen),
      buyBike: (id) => this.buyBike(id),
      selectBike: (id) => this.selectBike(id),
      resume: () => this.resume(),
      quitToTitle: () => this.quitToTitle(),
      retry: () => this.retry(),
      next: () => this.nextEvent(),
      updateSettings: (patch) => this.updateSettings(patch),
      save: () => this.save,
      inRace: () => this.race !== null && this.mode !== 'menu' && this.mode !== 'results',
      enableTilt: () => this.input.requestTilt(),
    });

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.draw(),
    }, 120);

    this.bindGlobalEvents();
    this.resize();
    this.applyVolumes();
    this.screens.show('title');
    this.loop.start();
  }

  /* ─────────────────────────── setup ─────────────────────────── */

  private bindGlobalEvents(): void {
    bindShellEvents({
      onResize: () => this.resize(),
      onFirstGesture: async () => {
        await this.audio.unlock();
        this.applyVolumes();
        this.audio.playMusic('menu');
      },
      onHidden: () => {
        if (this.mode === 'racing') this.pause();
      },
    });
  }

  private resize(): void {
    const size = fitCanvas(this.canvas, this.qualityLevel, this.governor.value);
    this.renderer.resize(size.pixelWidth, size.pixelHeight);
    if (this.circuit && this.race) this.renderer.prepare(this.circuit, this.race.road);
    if (rotateHint) rotateHint.hidden = !size.needsRotation;
  }

  private applyVolumes(): void {
    const s = this.save.settings;
    this.audio.setVolumes(s.masterVolume, s.musicVolume, s.sfxVolume);
  }

  private persist(): void {
    writeSave(this.save);
  }

  /* ─────────────────────────── race lifecycle ─────────────────────────── */

  private beginRace(circuitId: string, bikeId: string): void {
    const circuit = getCircuit(circuitId);
    if (!canEnter(this.save, circuit)) return;
    this.save = payEntry(this.save, circuit);
    this.chapter = null;
    this.launch(circuit, getBike(bikeId), 5, undefined);
  }

  private beginChapter(index: number): void {
    const chapter = CAMPAIGN_CHAPTERS[index];
    if (!chapter || index > this.save.storyChapter) return;
    const circuit = getCircuit(chapter.circuitId);

    this.screens.show('story', {
      title: chapter.title,
      lines: chapter.opening,
      cta: 'Drive',
      onContinue: () => {
        this.chapter = chapter;
        // Night, always. The campaign owns the hour regardless of the circuit.
        const night: CircuitSpec = { ...circuit, timeOfDay: 'night', laps: Math.max(1, circuit.laps - 1) };
        this.launch(night, AUTO_RICKSHAW, chapter.hunters, chapter);
      },
    });
  }

  private launch(
    circuit: CircuitSpec,
    bike: ReturnType<typeof getBike>,
    rivals: number,
    chapter: CampaignChapter | undefined,
  ): void {
    this.detachAudio?.();
    this.circuit = circuit;
    this.takedowns = 0;
    this.topSpeed = 0;
    this.storyBeatsFired.clear();
    this.hud.clear();

    const race = new Race({
      circuit,
      playerBike: bike,
      rivalCount: rivals,
      seed: `${circuit.id}:${bike.id}:${chapter ? chapter.title : 'thrash'}`,
      policeEnabled: !chapter,
    });
    this.race = race;

    // In the campaign the field are not racers, they are hunters: maximum
    // aggression, maximum violence, and they never let you settle.
    if (chapter) {
      const tier = tierForDifficulty(5);
      for (const racer of race.racers) {
        if (!racer.ai) continue;
        racer.ai.aggression = 1;
        racer.ai.violence = Math.max(tier.violence, 0.85);
        racer.ai.skill = tier.skill;
      }
    }

    this.wireRaceEvents(race, circuit, chapter);

    // Rasterise every sprite this circuit can show before the flag drops, so no
    // frame during the race pays for a first-time draw.
    warmForRace(
      this.renderer, circuit, race.road, bike,
      race.racers.map((r) => r.bike),
      circuit.traffic.map((t) => getTraffic(t.id)),
      bike.threeWheeler ? AUTO_LIVERIES[circuit.city] ?? AUTO_LIVERIES.mumbai : undefined,
    );

    this.screens.hide();
    this.mode = 'racing';
    race.start();
    this.audio.playMusic(chapter ? 'thriller' : circuit.difficulty >= 4 ? 'hard' : 'race');
  }

  private wireRaceEvents(race: Race, circuit: CircuitSpec, chapter?: CampaignChapter): void {
    const detachAudio = this.audio.attach(race.bus);
    const detachPresentation = attachPresentation(race.bus, {
      hud: this.hud,
      renderer: this.renderer,
      impactOrigin: () => ({ x: this.canvas.width / 2, y: this.canvas.height * 0.72 }),
      onTakedown: () => { this.takedowns++; },
      onFinish: (payload) => this.finish(payload, circuit, chapter),
    });
    this.detachAudio = () => {
      detachAudio();
      detachPresentation();
    };
  }

  /* ─────────────────────────── frame ─────────────────────────── */

  private update(dt: number): void {
    const snapshot = this.input.sample();
    this.lastSnapshot = snapshot;
    this.hud.update(dt);

    if (snapshot.pressed.pause) {
      if (this.mode === 'racing') this.pause();
      else if (this.mode === 'paused') this.resume();
    }

    if (this.mode !== 'racing' || !this.race || !this.circuit) {
      this.audio.updateMusic(dt, 0.5);
      return;
    }

    const race = this.race;
    const controls: Controls = {
      steer: snapshot.steer,
      throttle: snapshot.throttle,
      brake: snapshot.brake,
      punch: snapshot.pressed.punch,
      kick: snapshot.pressed.kick,
      boost: snapshot.pressed.nitro,
    };

    race.update(dt * this.timeScale, controls);
    if (this.invincible) {
      race.player.bikeDamage = Math.min(race.player.bikeDamage, 60);
      race.player.riderHealth = Math.max(race.player.riderHealth, 40);
    }

    if (snapshot.pressed.horn) {
      race.bus.emit('horn', { pan: 0, kind: race.player.bike.threeWheeler ? 'auto' : 'bike' });
    }

    this.topSpeed = Math.max(this.topSpeed, race.player.speed);
    this.fireStoryBeats(race);
    this.updateAudio(race, dt);
    if (this.governor.update(dt, this.loop.stats.fps)) this.resize();
  }

  private fireStoryBeats(race: Race): void {
    if (!this.chapter) return;
    for (const beat of this.chapter.beats) {
      const key = `${beat.atLap}:${beat.line}`;
      if (this.storyBeatsFired.has(key)) continue;
      if (race.player.lap < beat.atLap) continue;
      // Space the beats out so two never overlap in the subtitle band.
      if (race.elapsed < 3 + this.storyBeatsFired.size * 9) continue;
      this.storyBeatsFired.add(key);
      race.bus.emit('story:beat', { id: key, speaker: beat.speaker, line: beat.line, durationMs: 5200 });
    }
  }

  private readonly engineTargets: EngineTarget[] = [];

  private updateAudio(race: Race, dt: number): void {
    // The simulation broadcasts plain data; audio never reaches into game state.
    engineBroadcast(race, this.lastSnapshot?.throttle ?? 0, this.engineTargets);
    this.audio.updateEngines(this.engineTargets, dt);
    this.audio.updateMusic(dt, musicIntensity(race));
  }

  private draw(): void {
    const { ctx } = this;
    if (this.mode === 'menu' && !this.race) {
      // Nothing to render behind the menus: a flat wash is cheaper and calmer
      // than an idling race the player cannot interact with.
      ctx.fillStyle = '#05070b';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    if (!this.race || !this.circuit) return;

    const dt = 1 / 60;
    this.renderer.render(this.race, this.circuit, dt, this.save.settings.showFps);

    if (this.mode === 'racing' || this.mode === 'paused') {
      this.hud.draw(
        ctx,
        this.race,
        this.circuit,
        this.canvas.width,
        this.canvas.height,
        this.lastSnapshot?.touchActive ?? false,
        this.loop.stats.fps,
        this.save.settings.showFps,
      );
    }
  }

  /* ─────────────────────────── transitions ─────────────────────────── */

  private pause(): void {
    if (this.mode !== 'racing') return;
    this.mode = 'paused';
    this.screens.show('paused');
  }

  private resume(): void {
    if (this.mode !== 'paused') return;
    this.mode = 'racing';
    this.screens.hide();
  }

  private retry(): void {
    if (!this.circuit) return;
    const bike = this.race?.player.bike ?? getBike(this.save.currentBike);
    this.launch(this.circuit, bike, this.race?.racers.length ? this.race.racers.length - 1 : 5, this.chapter ?? undefined);
  }

  private quitToTitle(): void {
    this.detachAudio?.();
    this.detachAudio = null;
    this.race = null;
    this.circuit = null;
    this.chapter = null;
    this.mode = 'menu';
    this.audio.playMusic('menu');
    this.screens.show('title');
  }

  private nextEvent(): void {
    const currentId = this.circuit?.id;
    const nextId = currentId ? nextEvent(this.save, currentId, CAREER_ORDER) : null;
    if (nextId) this.beginRace(nextId, this.save.currentBike);
    else this.screens.show('circuits');
  }

  private finish(
    payload: { position: number; timeSeconds: number; cash: number },
    circuit: CircuitSpec,
    chapter?: CampaignChapter,
  ): void {
    const race = this.race;
    if (!race) return;
    this.mode = 'results';

    const wrecked = race.phase === 'wrecked';
    const { change, results } = buildFinish(this.save, payload, {
      circuit,
      chapter,
      wrecked,
      fieldSize: race.racers.length,
      takedowns: this.takedowns,
      damage: race.player.bikeDamage,
      topSpeed: this.topSpeed,
      careerOrder: CAREER_ORDER,
      nameOf: (id) => getCircuit(id).name,
    });

    this.save = change.save;
    this.persist();
    this.audio.playMusic(payload.position === 1 && !wrecked ? 'victory' : 'menu');
    this.screens.show('results', results);
  }

  /* ─────────────────────────── save actions ─────────────────────────── */

  private buyBike(id: string): boolean {
    const result = purchase(this.save, getBike(id));
    if (result.reason === 'already-owned') return true;
    if (!result.bought) return false;
    this.save = result.save;
    this.persist();
    this.audio.sfx.chime(true);
    return true;
  }

  private selectBike(id: string): void {
    const next = selectBike(this.save, id);
    if (next === this.save) return;
    this.save = next;
    this.persist();
    this.audio.sfx.tick();
  }

  private updateSettings(patch: Partial<SaveData['settings']>): void {
    Object.assign(this.save.settings, patch);
    this.input.options.tilt = this.save.settings.tiltSteering;
    this.applyVolumes();
    this.persist();
  }

  /** Exposed for the automation harnesses. Not a public API. */
  debugState(): DebugSnapshot {
    return buildDebugSnapshot(
      this.mode, this.screens.visible, this.loop, this.renderer.atlas,
      this.save.cash, this.circuit?.id ?? null, this.race,
    );
  }

  /**
   * Slow the whole simulation for video capture.
   *
   * Playwright records at a hard 25 fps, so smooth footage is produced by
   * running the game at half speed, recording for twice as long, and speeding
   * the result back up — which yields an effective 50 fps.
   */
  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0.05, Math.min(4, scale));
  }

  /** Make the player immortal, so a capture run can never end on a wreck. */
  setInvincible(on: boolean): void {
    this.invincible = on;
  }

  resetSave(): void {
    this.save = defaultSave();
    this.persist();
    this.quitToTitle();
  }
}

const game = new Game(canvas, ctx, uiRoot);

// A tiny surface for the automated QA harness. Not a public API.
(window as unknown as { __game: unknown }).__game = {
  state: () => game.debugState(),
  reset: () => game.resetSave(),
  timeScale: (v: number) => game.setTimeScale(v),
  invincible: (v: boolean) => game.setInvincible(v),
};

export type { ScreenId };
