import type { BikeSpec } from '../data/types.ts';
import { deriveHandling, type Handling } from './tuning.ts';

export type RacerKind = 'player' | 'rival' | 'cop';
export type WeaponKind = 'chain' | 'bat' | 'lathi' | 'helmet';

export type AttackKind = 'punch' | 'kick' | 'weapon';

export interface AttackState {
  kind: AttackKind;
  /** -1 = attacking to the left, +1 = to the right. */
  direction: number;
  /** Seconds elapsed since the swing began. */
  elapsed: number;
  /** True once this swing has already connected — one hit per swing. */
  resolved: boolean;
}

export interface AttackProfile {
  windup: number;
  active: number;
  recover: number;
  reach: number;
  damage: number;
  stagger: number;
  stamina: number;
  /** Lateral shove applied to the victim, in road half-widths per second. */
  shove: number;
}

export const ATTACKS: Record<AttackKind, AttackProfile> = {
  // Fast, cheap, chips away — the jab you spam while jostling for a line.
  punch: { windup: 0.07, active: 0.10, recover: 0.14, reach: 0.30, damage: 7, stagger: 0.22, stamina: 8, shove: 0.55 },
  // Slow and committing, but it puts riders in the gravel.
  kick:  { windup: 0.15, active: 0.13, recover: 0.28, reach: 0.42, damage: 17, stagger: 0.55, stamina: 22, shove: 1.35 },
  weapon:{ windup: 0.12, active: 0.16, recover: 0.24, reach: 0.58, damage: 26, stagger: 0.70, stamina: 16, shove: 1.05 },
};

export const WEAPON_BONUS: Record<WeaponKind, { damage: number; reach: number; uses: number }> = {
  chain:  { damage: 1.35, reach: 1.25, uses: 14 },
  bat:    { damage: 1.55, reach: 1.10, uses: 10 },
  lathi:  { damage: 1.20, reach: 1.40, uses: 16 },
  helmet: { damage: 1.15, reach: 0.85, uses: 8 },
};

export interface AiProfile {
  /** 0..1 — how hard they push the throttle into bends. */
  aggression: number;
  /** 0..1 — how often they throw hands rather than race clean. */
  violence: number;
  /** 0..1 — reaction quality; low skill means late lines and pothole hits. */
  skill: number;
  /** Preferred racing line, in road half-widths. */
  line: number;
  /** Seconds between line re-evaluations. */
  thinkEvery: number;
}

export class Racer {
  readonly handling: Handling;

  /** Distance along the track centre line, in world units. */
  z = 0;
  /** Lateral position in road half-widths: -1..1 is tarmac. */
  x = 0;
  speed = 0;
  /** Height above the road surface. Non-zero means airborne. */
  y = 0;
  vy = 0;
  /** Visual body roll, -1..1. */
  lean = 0;
  /** Front-wheel wobble after a hit, purely cosmetic. */
  wobble = 0;

  bikeDamage = 0;
  riderHealth = 100;
  stamina = 100;

  attack: AttackState | null = null;
  stagger = 0;
  /** Seconds remaining face-down on the road. */
  downTimer = 0;
  weapon: WeaponKind | null = null;
  weaponUses = 0;

  lap = 0;
  /** Monotonic distance travelled, used for standings — z alone wraps. */
  distance = 0;
  place = 1;
  finished = false;
  finishTime = 0;
  /** Seconds of boost left. */
  boost = 0;
  boostCooldown = 0;

  /** Set while the three-wheeler is up on two wheels; tips over if it maxes out. */
  tilt = 0;

  thinkTimer = 0;
  targetLine = 0;

  constructor(
    readonly id: number,
    readonly kind: RacerKind,
    readonly name: string,
    readonly bike: BikeSpec,
    readonly ai: AiProfile | null = null,
  ) {
    this.handling = deriveHandling(bike);
  }

  get speedPercent(): number {
    return this.handling.maxSpeed > 0 ? this.speed / this.handling.maxSpeed : 0;
  }

  get isDown(): boolean {
    return this.downTimer > 0;
  }

  get isWrecked(): boolean {
    return this.bikeDamage >= 100 || this.riderHealth <= 0;
  }

  get isBusy(): boolean {
    return this.attack !== null || this.stagger > 0 || this.downTimer > 0;
  }

  /** Total attack reach including whatever is in the rider's hand. */
  reachFor(kind: AttackKind): number {
    const base = ATTACKS[kind].reach;
    if (kind !== 'weapon' || !this.weapon) return base;
    return base * WEAPON_BONUS[this.weapon].reach;
  }

  damageFor(kind: AttackKind): number {
    const profile = ATTACKS[kind];
    const clout = 0.65 + this.handling.clout * 0.7;
    if (kind !== 'weapon' || !this.weapon) return profile.damage * clout;
    return profile.damage * clout * WEAPON_BONUS[this.weapon].damage;
  }

  reset(z: number, x: number): void {
    this.z = z;
    this.x = x;
    this.speed = 0;
    this.y = 0;
    this.vy = 0;
    this.lean = 0;
    this.wobble = 0;
    this.bikeDamage = 0;
    this.riderHealth = 100;
    this.stamina = 100;
    this.attack = null;
    this.stagger = 0;
    this.downTimer = 0;
    this.weapon = null;
    this.weaponUses = 0;
    this.lap = 0;
    this.distance = 0;
    this.place = 1;
    this.finished = false;
    this.finishTime = 0;
    this.boost = 0;
    this.boostCooldown = 0;
    this.tilt = 0;
    this.thinkTimer = 0;
    this.targetLine = x;
  }
}
