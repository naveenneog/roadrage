import { clamp, kmhToUnits, remap } from '../core/math.ts';
import type { BikeSpec } from '../data/types.ts';

/**
 * Turns real-world specifications into handling numbers.
 *
 * Every value below is derived, not hand-tuned per bike. That means the garage
 * ordering can never drift out of sync with the spec sheet, and adding a bike is
 * a data change rather than a balancing exercise.
 */
export interface Handling {
  /** Top speed in simulation units per second. */
  maxSpeed: number;
  /** Units per second squared at zero speed; falls away toward the top end. */
  accel: number;
  /** Engine braking and drag when off the throttle. */
  decel: number;
  /** Brake authority. */
  braking: number;
  /** Extra drag when both wheels are off the tarmac. */
  offRoadDecel: number;
  /** Speed you can always maintain off-road, however hard the drag. */
  offRoadLimit: number;
  /** Lateral road-widths per second at full speed and full lock. */
  steering: number;
  /** How hard a bend throws you toward the outside. */
  centrifugal: number;
  /** Collision resistance, 0..1 — heavy steel shrugs off a shunt. */
  toughness: number;
  /** How much a hit shoves you sideways; the inverse of mass. */
  shoveability: number;
  /** Melee reach and force, 0..1 — a tall classic gets more leverage. */
  clout: number;
  /** Nitro-equivalent: a short overrev burst. Fraction of max speed added. */
  overrev: number;
}

/** Reference power-to-weight band across the roster, in bhp per kg. */
const PTW_MIN = 0.025;
const PTW_MAX = 0.29;
const WEIGHT_LIGHT = 100;
const WEIGHT_HEAVY = 390;
const WHEELBASE_SHORT = 1220;
const WHEELBASE_LONG = 2000;

export const powerToWeight = (spec: BikeSpec): number => spec.bhp / spec.weightKg;

export const deriveHandling = (spec: BikeSpec): Handling => {
  const ptw = powerToWeight(spec);
  const maxSpeed = kmhToUnits(spec.topSpeedKmh);

  // Acceleration tracks power-to-weight, with torque giving low-end shove.
  const ptwScore = remap(ptw, PTW_MIN, PTW_MAX, 0.16, 1);
  const torqueScore = remap(spec.torqueNm / spec.weightKg, 0.04, 0.32, 0.2, 1);
  const accelScore = ptwScore * 0.72 + torqueScore * 0.28;

  // Agility falls with both mass and wheelbase; a three-wheeler is penalised hard.
  const massAgility = remap(spec.weightKg, WEIGHT_HEAVY, WEIGHT_LIGHT, 0.2, 1);
  const geometryAgility = remap(spec.wheelbaseMm, WHEELBASE_LONG, WHEELBASE_SHORT, 0.25, 1);
  const agility = clamp(massAgility * 0.55 + geometryAgility * 0.45, 0.12, 1);

  const toughness = clamp(remap(spec.weightKg, WEIGHT_LIGHT, WEIGHT_HEAVY, 0.22, 1), 0.1, 1);

  return {
    maxSpeed,
    accel: maxSpeed * (0.42 + accelScore * 0.78),
    decel: -maxSpeed * 0.22,
    braking: -maxSpeed * (0.95 + toughness * 0.5),
    offRoadDecel: -maxSpeed * 0.85,
    offRoadLimit: maxSpeed * (spec.class === 'auto' ? 0.30 : 0.24),
    steering: 1.05 + agility * 1.55,
    // Long, heavy machines run wide. This is what makes the Bullet feel like a Bullet.
    centrifugal: 0.24 + (1 - agility) * 0.34,
    toughness,
    shoveability: clamp(remap(spec.weightKg, WEIGHT_HEAVY, WEIGHT_LIGHT, 0.35, 1.5), 0.3, 1.6),
    clout: clamp(0.32 + toughness * 0.5 + (spec.class === 'classic' ? 0.14 : 0), 0.2, 1),
    overrev: clamp(0.14 + ptwScore * 0.16, 0.1, 0.34),
  };
};

/** 0..1 bars for the garage screen. Same derivation, presented for humans. */
export interface StatBars {
  speed: number;
  accel: number;
  handling: number;
  toughness: number;
}

export const statBars = (spec: BikeSpec, roster: readonly BikeSpec[]): StatBars => {
  const speeds = roster.map((b) => b.topSpeedKmh);
  const ptws = roster.map(powerToWeight);
  const handling = deriveHandling(spec);
  const steerings = roster.map((b) => deriveHandling(b).steering);
  return {
    speed: remap(spec.topSpeedKmh, Math.min(...speeds), Math.max(...speeds), 0.12, 1),
    accel: remap(powerToWeight(spec), Math.min(...ptws), Math.max(...ptws), 0.12, 1),
    handling: remap(handling.steering, Math.min(...steerings), Math.max(...steerings), 0.12, 1),
    toughness: handling.toughness,
  };
};
