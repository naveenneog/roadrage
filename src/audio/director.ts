import type { EventBus, GameEvents } from '../core/events.ts';
import { clamp } from '../core/math.ts';
import type { BikeSpec } from '../data/types.ts';
import { AudioBus } from './bus.ts';
import { EngineSound } from './engine-sound.ts';
import { Music, type MOODS } from './music.ts';
import { Sfx } from './sfx.ts';

export interface EngineTarget {
  id: number;
  bike: BikeSpec;
  throttle: number;
  speedPercent: number;
  pan: number;
  /** 0 = at the camera, 1 = out of earshot. */
  distance: number;
}

/**
 * Wires the simulation's events to the mix.
 *
 * The director never reads game state directly — it receives events and plain
 * parameter objects. That is what lets the whole simulation run in a test with
 * no AudioContext anywhere near it.
 */
export class AudioDirector {
  readonly bus = new AudioBus();
  readonly sfx: Sfx;
  readonly music: Music;

  private engines = new Map<number, EngineSound>();
  private unsubscribes: Array<() => void> = [];
  private sirenTimer = 0;
  private policeLevel = 0;

  constructor() {
    this.sfx = new Sfx(this.bus);
    this.music = new Music(this.bus);
  }

  async unlock(): Promise<void> {
    await this.bus.unlock();
  }

  get ready(): boolean {
    return this.bus.ready;
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.bus.setVolumes(master, music, sfx);
  }

  /** Subscribe to a race's event bus. Returns a teardown for when the race ends. */
  attach(events: EventBus<GameEvents>): () => void {
    const on = <K extends keyof GameEvents>(
      key: K,
      handler: (payload: GameEvents[K]) => void,
    ) => {
      this.unsubscribes.push(events.on(key, handler));
    };

    on('impact', ({ kind, power, pan }) => {
      switch (kind) {
        case 'punch': this.sfx.punch(power, pan); break;
        case 'kick': this.sfx.kick(power, pan); break;
        case 'weapon': this.sfx.weapon(power, pan); break;
        case 'block': this.sfx.block(pan); break;
        case 'shunt': this.sfx.scrape(power, pan); break;
        case 'traffic':
        case 'wall': this.sfx.crash(power, pan); break;
      }
    });

    on('rider:down', ({ pan }) => this.sfx.spill(pan));
    on('bike:crash', () => this.sfx.crash(1, 0));
    on('horn', ({ kind, pan }) => this.sfx.horn(kind, pan));
    on('race:countdown', ({ count }) => this.sfx.beep(count <= 0));
    on('weapon:pickup', () => this.sfx.chime(true));
    on('cop:spotted', ({ level }) => {
      this.policeLevel = level;
      this.sfx.siren(0);
    });
    on('cop:evaded', () => {
      this.policeLevel = 0;
    });
    on('cop:busted', () => this.sfx.chime(false));
    on('race:finish', ({ position }) => this.sfx.chime(position === 1));
    on('nitro', ({ active }) => {
      if (active) this.sfx.skid(0.5, 0);
    });

    return () => this.detach();
  }

  detach(): void {
    for (const off of this.unsubscribes) off();
    this.unsubscribes = [];
    for (const engine of this.engines.values()) engine.dispose();
    this.engines.clear();
    this.policeLevel = 0;
  }

  /**
   * Update every audible engine. Voices are created and disposed as bikes come
   * into and out of earshot, so a twenty-bike field never costs twenty voices.
   */
  updateEngines(targets: readonly EngineTarget[], dt: number): void {
    if (!this.bus.ready) return;
    const seen = new Set<number>();

    for (const target of targets) {
      if (target.distance > 1) continue;
      seen.add(target.id);
      let engine = this.engines.get(target.id);
      if (!engine) {
        engine = new EngineSound(this.bus, target.bike.voice, this.bus.engine);
        this.engines.set(target.id, engine);
      }
      engine.update(
        target.throttle,
        target.speedPercent,
        target.bike.gears,
        target.pan,
        target.distance,
        dt,
      );
    }

    for (const [id, engine] of this.engines) {
      if (seen.has(id)) continue;
      engine.dispose();
      this.engines.delete(id);
    }

    if (this.policeLevel > 0) {
      this.sirenTimer -= dt;
      if (this.sirenTimer <= 0) {
        this.sirenTimer = 2.4 - this.policeLevel * 0.4;
        this.sfx.siren(Math.sin(this.bus.now) * 0.5);
      }
    }
  }

  /** Music mood follows the race, not the menu. */
  playMusic(mood: keyof typeof MOODS): void {
    if (!this.bus.ready) return;
    this.music.start(mood);
    this.music.setMood(mood);
  }

  updateMusic(dt: number, intensity: number): void {
    this.music.update(dt, clamp(intensity, 0.2, 1));
  }

  stopMusic(): void {
    this.music.stop();
  }
}
