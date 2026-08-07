import { clamp, kmhToUnits, lerp, loopDelta } from '../core/math.ts';
import { Rng } from '../core/rng.ts';
import { getTraffic } from '../data/traffic.ts';
import type { CircuitSpec, TrafficSpec } from '../data/types.ts';
import { Road } from '../track/road.ts';
import type { Racer } from './racer.ts';
import { knockDown } from './physics.ts';

export class TrafficVehicle {
  z = 0;
  x = 0;
  speed = 0;
  /** Drives the lateral weave so each vehicle wanders on its own rhythm. */
  phase = 0;
  weaveAmount = 0;
  active = false;

  constructor(public spec: TrafficSpec) {}
}

/** How far ahead of the player traffic is spawned, and how far behind it is recycled. */
const SPAWN_AHEAD = 42000;
const RECYCLE_BEHIND = 7000;
/**
 * Longitudinal spacing between vehicles, interpolated by the circuit's density.
 * At ~9000 units/second these give a vehicle to deal with every 1–3 seconds,
 * which is dense enough to be Indian traffic and sparse enough to be dodgeable.
 */
const SPACING_SPARSE = 26000;
const SPACING_DENSE = 9000;

/**
 * A recycled pool of vehicles that lives in a window around the player.
 *
 * Traffic is never simulated for the whole track — only the stretch you can see
 * plus a margin — so density can be high on Chandni Chowk without costing frames.
 */
export class TrafficField {
  readonly vehicles: TrafficVehicle[] = [];
  private readonly weights: Array<{ spec: TrafficSpec; weight: number }>;
  private totalWeight = 0;
  private readonly spacing: number;

  constructor(
    private readonly road: Road,
    circuit: CircuitSpec,
    private readonly rng: Rng,
    capacity = 14,
  ) {
    this.weights = circuit.traffic.map((entry) => {
      const spec = getTraffic(entry.id);
      this.totalWeight += entry.weight;
      return { spec, weight: entry.weight };
    });
    const density = clamp(circuit.trafficDensity, 0.1, 1);
    this.spacing = lerp(SPACING_SPARSE, SPACING_DENSE, density);
    // Only ever simulate enough vehicles to fill the visible window plus a margin.
    const needed = Math.ceil((SPAWN_AHEAD + RECYCLE_BEHIND) / this.spacing) + 2;
    const size = clamp(needed, 3, capacity);
    for (let i = 0; i < size; i++) this.vehicles.push(new TrafficVehicle(this.pickSpec()));
  }

  private pickSpec(): TrafficSpec {
    let roll = this.rng.next() * this.totalWeight;
    for (const entry of this.weights) {
      roll -= entry.weight;
      if (roll <= 0) return entry.spec;
    }
    return (this.weights[0] as { spec: TrafficSpec }).spec;
  }

  /** Lay traffic out across the road ahead of the grid before the lights go out. */
  seed(playerZ: number): void {
    let z = playerZ + this.spacing * 0.6;
    for (const vehicle of this.vehicles) {
      this.respawn(vehicle, z);
      z += this.rng.range(this.spacing * 0.7, this.spacing * 1.4);
    }
  }

  private respawn(vehicle: TrafficVehicle, z: number): void {
    vehicle.spec = this.pickSpec();
    vehicle.z = z % this.road.length;
    const halfWidth = Math.max(0.4, this.road.widthAt(vehicle.z) - vehicle.spec.width);
    vehicle.x = this.rng.range(-halfWidth, halfWidth);
    vehicle.speed = kmhToUnits(this.rng.range(vehicle.spec.minKmh, vehicle.spec.maxKmh));
    vehicle.phase = this.rng.range(0, Math.PI * 2);
    vehicle.weaveAmount = vehicle.spec.weaves * this.rng.range(0.3, 1);
    vehicle.active = true;
  }

  update(dt: number, playerZ: number): void {
    for (const vehicle of this.vehicles) {
      if (!vehicle.active) continue;
      vehicle.z += vehicle.speed * dt;
      if (vehicle.z >= this.road.length) vehicle.z -= this.road.length;

      // The weave is what makes Indian traffic Indian: nobody holds a lane.
      vehicle.phase += dt * (0.4 + vehicle.weaveAmount * 0.9);
      const halfWidth = Math.max(0.35, this.road.widthAt(vehicle.z) - vehicle.spec.width);
      const drift = Math.sin(vehicle.phase) * vehicle.weaveAmount * 0.55;
      vehicle.x = clamp(vehicle.x * 0.985 + drift * dt * 2.2, -halfWidth, halfWidth);

      const gap = loopDelta(playerZ, vehicle.z, this.road.length);
      if (gap < -RECYCLE_BEHIND || gap > SPAWN_AHEAD * 1.4) {
        this.respawn(vehicle, playerZ + SPAWN_AHEAD + this.rng.range(0, this.spacing));
      }
    }
  }
}

export interface TrafficHit {
  vehicle: TrafficVehicle;
  power: number;
  knockedDown: boolean;
}

/**
 * Resolve a racer against the traffic field.
 *
 * Hitting a bullock cart at 140 km/h should end your race; clipping a scooter at
 * 40 should cost you a place. Severity therefore scales with closing speed *and*
 * the mass of what you hit, against the toughness of what you are riding.
 */
export const collideWithTraffic = (
  racer: Racer,
  field: TrafficField,
  trackLength: number,
): TrafficHit | null => {
  if (racer.isDown || racer.y > 0 || racer.trafficCooldown > 0) return null;

  for (const vehicle of field.vehicles) {
    if (!vehicle.active) continue;
    const dz = loopDelta(racer.z, vehicle.z, trackLength);
    if (dz < -110 || dz > 190) continue;
    if (Math.abs(vehicle.x - racer.x) > vehicle.spec.width * 0.5 + 0.16) continue;

    const closing = Math.max(0, racer.speed - vehicle.speed);
    if (closing < 50) continue;

    // One collision per encounter, not one per frame while overlapping.
    racer.trafficCooldown = 0.7;

    // Severity is closing speed against the mass of what you hit, resisted by
    // what you are riding. Calibrated so a clean hit on a bus costs you the
    // corner and a place, while a bullock cart at full chat puts you down.
    const power = clamp((closing / 11000) * (0.45 + vehicle.spec.mass * 0.55), 0.05, 1);
    const resisted = power * (1.15 - racer.handling.toughness * 0.45);

    racer.speed = Math.max(vehicle.speed * 0.65, racer.speed * (1 - resisted * 0.75));
    // Deliberately survivable: a bad hit should cost you the race, not end it.
    // Totalling a bike takes a sustained inability to read the road.
    racer.bikeDamage = clamp(racer.bikeDamage + resisted * 6, 0, 100);
    racer.wobble = Math.min(1, racer.wobble + resisted * 1.6);
    // Push past rather than through: you get squeezed out around the obstacle.
    racer.x = clamp(racer.x + Math.sign(racer.x - vehicle.x || 1) * 0.18, -2.6, 2.6);

    const goesDown = resisted > 0.62;
    if (goesDown) knockDown(racer, 2.4);

    return { vehicle, power, knockedDown: goesDown };
  }
  return null;
};

/**
 * The law. Escalates by "heat" rather than instantly: you earn attention by
 * riding badly in front of them, and lose it by being somewhere else.
 */
export class Police {
  heat = 0;
  /** 0 = nobody watching, 3 = a Bolero and two Bullets. */
  level = 0;
  private announced = -1;

  constructor(private readonly maxLevel = 3) {}

  /** Called whenever the player does something worth noticing. */
  provoke(amount: number): void {
    this.heat = clamp(this.heat + amount, 0, 100);
  }

  update(dt: number, playerSpeedPercent: number): { level: number; changed: boolean } {
    // Sustained speed keeps you interesting; backing off cools it down.
    const decay = playerSpeedPercent > 0.75 ? -1.5 : 9;
    this.heat = clamp(this.heat + (playerSpeedPercent > 0.75 ? 2.5 : 0) * dt - decay * dt * 0.6, 0, 100);
    this.level = Math.min(this.maxLevel, Math.floor(this.heat / 26));
    const changed = this.level !== this.announced;
    this.announced = this.level;
    return { level: this.level, changed };
  }

  reset(): void {
    this.heat = 0;
    this.level = 0;
    this.announced = -1;
  }
}
