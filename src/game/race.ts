import { EventBus, type GameEvents } from '../core/events.ts';
import { clamp, loopDelta } from '../core/math.ts';
import { Rng } from '../core/rng.ts';
import { getBike } from '../data/bikes.ts';
import type { BikeSpec, CircuitSpec } from '../data/types.ts';
import { RoadBuilder, type Road, type TrackOp } from '../track/road.ts';
import { populateScenery } from '../track/scenery.ts';
import { applyCatchup, RIVAL_NAMES, think, tierForDifficulty } from './ai.ts';
import {
  attackForButton, beginAttack, resolveHit, resolveShunt, type CombatContext,
} from './combat.ts';
import { knockDown, stepRacer, type Controls, type StepResult } from './physics.ts';
import { Racer } from './racer.ts';
import { collideWithTraffic, Police, TrafficField } from './traffic.ts';

export type RacePhase = 'grid' | 'countdown' | 'racing' | 'finished' | 'busted' | 'wrecked';

export interface RaceOptions {
  circuit: CircuitSpec;
  playerBike: BikeSpec;
  rivalCount?: number;
  laps?: number;
  seed?: number | string;
  /** Campaign races disable the cop system and run their own threat instead. */
  policeEnabled?: boolean;
}

export interface RaceSnapshot {
  phase: RacePhase;
  elapsed: number;
  countdown: number;
  /** Frozen frames after a heavy impact, in seconds remaining. */
  hitstop: number;
  /** 0..1 camera shake, decays every step. */
  shake: number;
  policeLevel: number;
}

const COUNTDOWN_SECONDS = 3.2;
/** Grid spacing along the road, in world units. */
const GRID_ROW_GAP = 340;
const MAX_RACE_SECONDS = 600;

/**
 * Owns one race: the road, the field, the traffic, the law, and the rules that
 * decide when it is over. Completely headless — no canvas, no audio, no DOM —
 * so a whole race can be simulated in a test faster than real time.
 */
export class Race {
  readonly road: Road;
  readonly bus = new EventBus<GameEvents>();
  readonly racers: Racer[] = [];
  readonly player: Racer;
  readonly traffic: TrafficField;
  readonly police = new Police();
  readonly circuit: CircuitSpec;
  readonly laps: number;

  phase: RacePhase = 'grid';
  elapsed = 0;
  countdown = COUNTDOWN_SECONDS;
  hitstop = 0;
  shake = 0;
  /** Index of the last checkpoint the player passed, for the timer extension. */
  lastCheckpoint = -1;

  private readonly rng: Rng;
  private readonly stepResult: StepResult = { lapped: false, jolt: 0, launched: false, landed: false };
  private readonly combatContext: CombatContext;
  private readonly policeEnabled: boolean;
  private finishOrder = 0;

  constructor(options: RaceOptions) {
    this.circuit = options.circuit;
    this.laps = options.laps ?? options.circuit.laps;
    this.rng = new Rng(options.seed ?? `${options.circuit.id}:${options.playerBike.id}`);

    const builder = new RoadBuilder();
    for (const op of options.circuit.script as TrackOp[]) builder.apply(op);
    this.road = builder.closeLoop().build();
    populateScenery(
      this.road,
      options.circuit.scenery,
      options.circuit.sceneryDensity,
      options.circuit.id,
    );

    this.player = new Racer(0, 'player', 'You', options.playerBike);
    this.racers.push(this.player);

    const rivalCount = options.rivalCount ?? 5;
    const grid = this.buildGrid(rivalCount, options.playerBike);
    this.racers.push(...grid);

    this.traffic = new TrafficField(this.road, options.circuit, this.rng);
    // The campaign runs its own threat — hunters, not traffic police — so the
    // heat system is switched off for the whole race rather than merely reset.
    this.policeEnabled = options.policeEnabled !== false;

    this.combatContext = {
      bus: this.bus,
      trackLength: this.road.length,
      cameraX: 0,
      onHitstop: (seconds) => {
        this.hitstop = Math.max(this.hitstop, seconds);
        this.shake = Math.min(1, this.shake + seconds * 5);
      },
    };

    this.reset();
  }

  /** Pick rivals near the player's own pace so the race is a contest, not a parade. */
  private buildGrid(count: number, playerBike: BikeSpec): Racer[] {
    const tier = tierForDifficulty(this.circuit.difficulty);
    const pool = ['rx100', 'classic350', 'apache200', 'pulsar220', 'ns200', 'jawa42', 'roadster', 'roadking', 'rd350', 'duke390', 'interceptor']
      .map(getBike)
      .filter((bike) => {
        const ratio = bike.topSpeedKmh / playerBike.topSpeedKmh;
        return ratio > 0.82 && ratio < 1.28;
      });
    const chosen = pool.length >= 3 ? pool : [getBike('pulsar220'), getBike('classic350'), getBike('apache200')];
    const names = this.rng.shuffle(RIVAL_NAMES);

    const rivals: Racer[] = [];
    for (let i = 0; i < count; i++) {
      // Spread skill around the tier so the grid isn't five identical robots.
      const jitter = (i / Math.max(1, count - 1) - 0.5) * 0.22;
      rivals.push(new Racer(
        i + 1,
        'rival',
        names[i % names.length] ?? `Rider ${i + 1}`,
        this.rng.pick(chosen),
        {
          ...tier,
          skill: clamp(tier.skill + jitter, 0.2, 1),
          aggression: clamp(tier.aggression + jitter * 0.6, 0.3, 1),
          violence: clamp(tier.violence - jitter * 0.5, 0.05, 1),
        },
      ));
    }
    return rivals;
  }

  reset(): void {
    this.phase = 'grid';
    this.elapsed = 0;
    this.countdown = COUNTDOWN_SECONDS;
    this.hitstop = 0;
    this.shake = 0;
    this.finishOrder = 0;
    this.lastCheckpoint = -1;
    this.police.reset();

    // Rivals line up ahead, player at the back of the grid — the whole point is
    // the comeback. Everyone starts at positive z so crossing the line for the
    // first time completes a real, full lap.
    const order = [...this.racers.filter((r) => r !== this.player), this.player];
    const rows = Math.ceil(order.length / 2);
    order.forEach((racer, index) => {
      const row = Math.floor(index / 2);
      const side = index % 2 === 0 ? -0.42 : 0.42;
      const z = (rows - 1 - row) * GRID_ROW_GAP;
      racer.reset(z, side);
      // Seed distance from grid position so the standings are right before the flag drops.
      racer.distance = z;
      racer.place = index + 1;
    });

    this.traffic.seed(this.player.z);
    this.updateStandings();
  }

  start(): void {
    this.phase = 'countdown';
    this.bus.emit('race:start', { circuitId: this.circuit.id, laps: this.laps });
  }

  get finished(): boolean {
    return this.phase === 'finished' || this.phase === 'busted' || this.phase === 'wrecked';
  }

  /** One fixed simulation step. `controls` are the player's inputs for this step. */
  update(dt: number, controls: Controls): void {
    if (this.phase === 'grid') return;

    // Hitstop freezes the world but still burns wall-clock time, which is exactly
    // what makes a landed kick read as impact rather than as a number changing.
    if (this.hitstop > 0) {
      this.hitstop = Math.max(0, this.hitstop - dt);
      this.shake = Math.max(0, this.shake - dt * 1.2);
      return;
    }
    this.shake = Math.max(0, this.shake - dt * 2.4);

    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (after !== before && after >= 0) this.bus.emit('race:countdown', { count: after });
      if (this.countdown <= 0) this.phase = 'racing';
      return;
    }

    if (this.finished) return;

    this.elapsed += dt;
    this.combatContext.cameraX = this.player.x;

    this.stepField(dt, controls);
    this.traffic.update(dt, this.player.z);
    this.resolveInteractions(dt);
    this.updateStandings();
    this.checkPolice(dt);
    this.checkEnding();
  }

  private stepField(dt: number, controls: Controls): void {
    for (const racer of this.racers) {
      if (racer.finished) continue;

      const input = racer === this.player
        ? controls
        : think(racer, this.road, this.racers, this.player, dt, this.rng, this.traffic);

      if (racer !== this.player) applyCatchup(racer, this.player, this.road, dt);

      if (racer === this.player && !racer.isBusy) {
        if (controls.punch) beginAttack(racer, attackForButton(racer, 'punch'), this.aimDirection(racer));
        else if (controls.kick) beginAttack(racer, 'kick', this.aimDirection(racer));
      }

      const before = racer.lap;
      stepRacer(racer, this.road, input, dt, this.stepResult);

      if (this.stepResult.jolt > 0.3) {
        this.shake = Math.min(1, this.shake + this.stepResult.jolt * (racer === this.player ? 0.35 : 0.05));
        if (racer === this.player && this.stepResult.jolt > 0.6) {
          this.bus.emit('impact', {
            kind: 'wall', power: this.stepResult.jolt, pan: clamp(racer.x, -1, 1), byPlayer: true,
          });
        }
      }
      if (racer === this.player && this.stepResult.launched) {
        if (this.policeEnabled) this.police.provoke(4);
      }

      if (racer.lap > before) this.onLap(racer);
    }
  }

  /** Swing toward whoever is actually beside you, rather than at empty air. */
  private aimDirection(racer: Racer): number {
    let best = 0;
    let bestDistance = Infinity;
    for (const other of this.racers) {
      // A rider who has finished is no longer on the road to be hit.
      if (other === racer || other.isDown || other.finished) continue;
      const dz = loopDelta(racer.z, other.z, this.road.length);
      if (dz < -160 || dz > 320) continue;
      const dx = other.x - racer.x;
      if (Math.abs(dx) < bestDistance) {
        bestDistance = Math.abs(dx);
        best = Math.sign(dx) || 1;
      }
    }
    return best || (racer.lean >= 0 ? 1 : -1);
  }

  private resolveInteractions(dt: number): void {
    for (let i = 0; i < this.racers.length; i++) {
      const a = this.racers[i];
      if (!a || a.finished) continue;

      const hit = collideWithTraffic(a, this.traffic, this.road.length);
      if (hit) {
        const byPlayer = a === this.player;
        this.bus.emit('impact', {
          kind: 'traffic', power: hit.power, pan: clamp(a.x, -1, 1), byPlayer,
        });
        if (byPlayer) {
          this.hitstop = Math.max(this.hitstop, hit.power * 0.06);
          this.shake = Math.min(1, this.shake + hit.power * 0.8);
          if (this.policeEnabled) this.police.provoke(hit.power * 18);
        }
        if (hit.knockedDown) {
          this.bus.emit('rider:down', { racerId: a.id, byPlayer: false, pan: clamp(a.x, -1, 1) });
        }
      }

      for (let j = i + 1; j < this.racers.length; j++) {
        const b = this.racers[j];
        if (!b || b.finished) continue;
        resolveHit(a, b, this.combatContext);
        resolveHit(b, a, this.combatContext);
        if (resolveShunt(a, b, this.combatContext) && (a === this.player || b === this.player)) {
          if (this.policeEnabled) this.police.provoke(3);
        }
      }
    }
    void dt;
  }

  private onLap(racer: Racer): void {
    if (racer.lap >= this.laps) {
      racer.finished = true;
      racer.finishTime = this.elapsed;
      racer.place = ++this.finishOrder;
      if (racer === this.player) this.finishRace();
    } else if (racer === this.player) {
      this.bus.emit('ui:toast', {
        text: `LAP ${Math.min(racer.lap + 1, this.laps)} / ${this.laps}`,
        tone: 'info',
      });
    }
  }

  /** Standings by distance covered, which is the only measure that survives wrapping. */
  private updateStandings(): void {
    const running = this.racers.filter((r) => !r.finished);
    running.sort((a, b) => b.distance - a.distance);
    running.forEach((racer, index) => {
      racer.place = this.finishOrder + index + 1;
    });
  }

  private checkPolice(dt: number): void {
    if (!this.policeEnabled) return;
    if (this.player.speedPercent > 0.9) this.police.provoke(dt * 5);
    const { level, changed } = this.police.update(dt, this.player.speedPercent);
    if (changed && level > 0) this.bus.emit('cop:spotted', { level });
    if (changed && level === 0) this.bus.emit('cop:evaded', {});
  }

  private checkEnding(): void {
    // `finishRace` runs synchronously from within `stepField`, so by the time
    // control reaches here the race may already be over. Without this guard a
    // player who crosses the line and totals the bike in the same step emits
    // `race:finish` twice, and the career progression is applied twice.
    if (this.finished) return;
    if (this.player.isWrecked && !this.player.isDown) {
      this.phase = 'wrecked';
      this.bus.emit('race:finish', { position: this.player.place, timeSeconds: this.elapsed, cash: 0 });
      return;
    }
    if (this.elapsed > MAX_RACE_SECONDS) {
      this.phase = 'finished';
      this.bus.emit('race:finish', { position: this.player.place, timeSeconds: this.elapsed, cash: 0 });
    }
  }

  private finishRace(): void {
    this.phase = 'finished';
    const position = this.player.place;
    const cash = this.prizeFor(position);
    this.bus.emit('race:finish', { position, timeSeconds: this.elapsed, cash });
  }

  /** Purse splits steeply: winning matters, and fourth pays for petrol. */
  prizeFor(position: number): number {
    const share = [1, 0.55, 0.3, 0.15, 0.08][position - 1] ?? 0;
    return Math.round(this.circuit.purse * share);
  }

  /** Force the player off the bike — used by the campaign's scripted disasters. */
  wipeOutPlayer(seconds = 2.4): void {
    knockDown(this.player, seconds);
    this.shake = 1;
    this.hitstop = 0.1;
  }

  snapshot(): RaceSnapshot {
    return {
      phase: this.phase,
      elapsed: this.elapsed,
      countdown: Math.max(0, this.countdown),
      hitstop: this.hitstop,
      shake: this.shake,
      policeLevel: this.police.level,
    };
  }
}
