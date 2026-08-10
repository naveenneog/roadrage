import { clamp, damp, percentRemaining, sign } from '../core/math.ts';
import { Road, SEGMENT_LENGTH, type Segment } from '../track/road.ts';
import { ATTACKS, Racer } from './racer.ts';

export interface Controls {
  /** -1..1 */
  steer: number;
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  punch: boolean;
  kick: boolean;
  boost: boolean;
}

export const NO_CONTROLS: Controls = {
  steer: 0, throttle: 0, brake: 0, punch: false, kick: false, boost: false,
};

/** Downward pull on an airborne bike, in road-height units per second squared. */
const GRAVITY = 4200;
/** Speed above which a speed breaker actually launches you. */
const LAUNCH_SPEED_PERCENT = 0.42;
const BOOST_DURATION = 1.8;
const BOOST_COOLDOWN = 7;
const STAMINA_REGEN_PER_SEC = 15;
/**
 * Rider condition recovers slowly while you are upright and not being hit.
 * Without this, any sufficiently long race is lost to attrition no matter how
 * well it is ridden, which makes the health bar a countdown rather than a risk.
 */
const RIDER_REGEN_PER_SEC = 2;
const OFF_ROAD_EDGE = 1;
/** Beyond this you are in the drain, the hoarding or the crowd. */
const WORLD_EDGE = 2.6;

export interface SurfaceEffect {
  /** Multiplier on grip, 1 = dry tarmac. */
  grip: number;
  /** Extra drag as a fraction of max speed per second. */
  drag: number;
  /** Vertical rattle amplitude for the camera. */
  rattle: number;
}

const SURFACE_EFFECTS: Record<Segment['surface'], SurfaceEffect> = {
  tarmac:   { grip: 1.00, drag: 0.00, rattle: 0.0 },
  concrete: { grip: 0.97, drag: 0.01, rattle: 0.2 },
  broken:   { grip: 0.82, drag: 0.10, rattle: 1.0 },
  cobble:   { grip: 0.78, drag: 0.13, rattle: 1.3 },
  mud:      { grip: 0.55, drag: 0.30, rattle: 0.7 },
  wet:      { grip: 0.66, drag: 0.05, rattle: 0.1 },
};

export const surfaceEffect = (surface: Segment['surface']): SurfaceEffect =>
  SURFACE_EFFECTS[surface];

export interface StepResult {
  /** Set when the racer crossed the start line this step. */
  lapped: boolean;
  /** Set when the racer just hit a pothole, breaker or the verge. */
  jolt: number;
  /** Set on the frame the racer leaves the ground. */
  launched: boolean;
  /** Set on the frame the racer lands. */
  landed: boolean;
}

const EMPTY_RESULT = (): StepResult => ({ lapped: false, jolt: 0, launched: false, landed: false });

/**
 * One fixed physics step for a single racer.
 *
 * Deliberately a free function over a mutable entity: the whole field is stepped
 * every frame and this must not allocate.
 */
export const stepRacer = (
  racer: Racer,
  road: Road,
  controls: Controls,
  dt: number,
  result: StepResult = EMPTY_RESULT(),
): StepResult => {
  result.lapped = false;
  result.jolt = 0;
  result.launched = false;
  result.landed = false;

  const previousZ = racer.z;
  const segment = road.findSegment(racer.z);
  const roadHalfWidth = segment.width;
  const surface = surfaceEffect(segment.surface);

  tickTimers(racer, dt);

  if (racer.isDown) {
    // Sliding to a halt on the tarmac. No steering, no throttle, no dignity.
    racer.speed = Math.max(0, racer.speed - racer.handling.maxSpeed * 1.6 * dt);
    racer.z += racer.speed * dt;
    racer.distance += racer.speed * dt;
    racer.lean = damp(racer.lean, sign(racer.lean) * 1.4, 0.08, dt);
    return finishStep(racer, road, previousZ, result);
  }

  const staggered = racer.stagger > 0;
  const control = staggered ? 0.25 : 1;

  applyLongitudinal(racer, controls, surface, dt, control);
  applySteering(racer, controls, segment, surface, dt, control, roadHalfWidth);
  applyVertical(racer, road, dt, result);
  applyHazards(racer, segment, roadHalfWidth, dt, result);
  applyEdges(racer, roadHalfWidth, dt, result);

  racer.z += racer.speed * dt;
  racer.distance += racer.speed * dt;

  return finishStep(racer, road, previousZ, result);
};

const tickTimers = (racer: Racer, dt: number): void => {
  if (racer.stagger > 0) racer.stagger = Math.max(0, racer.stagger - dt);
  if (racer.invuln > 0) racer.invuln = Math.max(0, racer.invuln - dt);
  if (racer.shuntCooldown > 0) racer.shuntCooldown = Math.max(0, racer.shuntCooldown - dt);
  if (racer.trafficCooldown > 0) racer.trafficCooldown = Math.max(0, racer.trafficCooldown - dt);
  if (racer.downTimer > 0) {
    racer.downTimer = Math.max(0, racer.downTimer - dt);
    // Getting back on the bike is part of the physics step, not something the
    // race loop has to remember to do. Missing it strands a rider forever.
    if (racer.downTimer === 0) remount(racer);
  }
  if (racer.boost > 0) racer.boost = Math.max(0, racer.boost - dt);
  if (racer.boostCooldown > 0) racer.boostCooldown = Math.max(0, racer.boostCooldown - dt);
  if (racer.wobble > 0) racer.wobble = Math.max(0, racer.wobble - dt * 2.2);

  if (racer.attack) {
    racer.attack.elapsed += dt;
    const profile = ATTACKS[racer.attack.kind];
    if (racer.attack.elapsed >= profile.windup + profile.active + profile.recover) {
      racer.attack = null;
    }
  }

  // Stamina only comes back when you are not swinging.
  if (!racer.attack) {
    racer.stamina = clamp(racer.stamina + STAMINA_REGEN_PER_SEC * dt, 0, 100);
  }

  // Condition comes back only while upright and unmolested.
  if (!racer.isDown && racer.stagger <= 0) {
    racer.riderHealth = clamp(racer.riderHealth + RIDER_REGEN_PER_SEC * dt, 0, 100);
  }
};

const applyLongitudinal = (
  racer: Racer,
  controls: Controls,
  surface: SurfaceEffect,
  dt: number,
  control: number,
): void => {
  const h = racer.handling;

  if (controls.boost && racer.boost <= 0 && racer.boostCooldown <= 0 && racer.speedPercent > 0.35) {
    racer.boost = BOOST_DURATION;
    racer.boostCooldown = BOOST_COOLDOWN + BOOST_DURATION;
  }

  const ceiling = h.maxSpeed * racer.catchup * (1 + (racer.boost > 0 ? h.overrev : 0));

  if (controls.throttle > 0 && !racer.isDown) {
    // Power tails off as revs climb, which is what makes the last 20 km/h feel earned.
    const headroom = clamp(1 - Math.pow(racer.speed / ceiling, 1.7), 0, 1);
    const boostFactor = racer.boost > 0 ? 1.6 : 1;
    racer.speed += h.accel * headroom * controls.throttle * boostFactor * control * dt;
  } else if (controls.brake > 0) {
    racer.speed += h.braking * controls.brake * dt;
  } else {
    racer.speed += h.decel * dt;
  }

  racer.speed -= h.maxSpeed * surface.drag * dt;

  const offRoad = Math.abs(racer.x) > OFF_ROAD_EDGE;
  if (offRoad && racer.y <= 0) {
    if (racer.speed > h.offRoadLimit) racer.speed += h.offRoadDecel * dt;
  }

  racer.speed = clamp(racer.speed, 0, ceiling);
};

const applySteering = (
  racer: Racer,
  controls: Controls,
  segment: Segment,
  surface: SurfaceEffect,
  dt: number,
  control: number,
  roadHalfWidth: number,
): void => {
  const h = racer.handling;
  const speedPercent = racer.speedPercent;

  // Lateral travel scales with speed: at a crawl you can barely change line.
  const authority = dt * h.steering * speedPercent * surface.grip * control;
  // Airborne you have almost no control — that is the price of a jump.
  const airFactor = racer.y > 0 ? 0.25 : 1;

  const steerInput = clamp(controls.steer, -1, 1);
  racer.x += steerInput * authority * airFactor;

  // Fake-curve centrifugal force, the thing that makes a bend cost you.
  if (racer.y <= 0) {
    racer.x -= authority * speedPercent * segment.curve * h.centrifugal;
  }

  racer.x = clamp(racer.x, -WORLD_EDGE, WORLD_EDGE);

  // Three-wheelers tip. Lateral acceleration builds tilt; straightening sheds it.
  if (racer.bike.threeWheeler) {
    const lateralLoad = Math.abs(steerInput * speedPercent) + Math.abs(segment.curve) * speedPercent * 0.12;
    racer.tilt = clamp(damp(racer.tilt, lateralLoad, 0.35, dt), 0, 1.4);
  }

  const targetLean = clamp(steerInput * 0.85 + segment.curve * speedPercent * 0.1, -1, 1);
  racer.lean = damp(racer.lean, targetLean, 0.07, dt);

  void roadHalfWidth;
};

const applyVertical = (racer: Racer, road: Road, dt: number, result: StepResult): void => {
  if (racer.y <= 0 && racer.vy <= 0) return;
  racer.vy -= GRAVITY * dt;
  racer.y += racer.vy * dt;
  if (racer.y <= 0) {
    racer.y = 0;
    // A hard landing costs speed and shakes the bars.
    const impact = Math.min(1, Math.abs(racer.vy) / 2600);
    racer.speed *= 1 - impact * 0.22;
    racer.wobble = Math.max(racer.wobble, impact);
    racer.bikeDamage = clamp(racer.bikeDamage + impact * 6, 0, 100);
    racer.vy = 0;
    result.landed = true;
    result.jolt = Math.max(result.jolt, impact);
  }
  void road;
};

const applyHazards = (
  racer: Racer,
  segment: Segment,
  roadHalfWidth: number,
  dt: number,
  result: StepResult,
): void => {
  if (!segment.hazard || racer.y > 0) return;
  const withinLane = Math.abs(racer.x) <= roadHalfWidth + 0.15;
  if (!withinLane) return;

  switch (segment.hazard) {
    case 'breaker': {
      if (racer.speedPercent > LAUNCH_SPEED_PERCENT) {
        racer.vy = 900 + racer.speedPercent * 1500;
        racer.y = 1;
        result.launched = true;
        result.jolt = Math.max(result.jolt, racer.speedPercent);
      } else {
        racer.speed *= 1 - 0.9 * dt;
        result.jolt = Math.max(result.jolt, 0.2);
      }
      break;
    }
    case 'pothole': {
      if (Math.abs(racer.x - segment.hazardOffset) < 0.24) {
        racer.speed *= 1 - 2.2 * dt;
        racer.wobble = Math.min(1, racer.wobble + 2.5 * dt);
        racer.bikeDamage = clamp(racer.bikeDamage + 9 * dt, 0, 100);
        result.jolt = Math.max(result.jolt, 0.45);
      }
      break;
    }
    case 'oil':
    case 'puddle': {
      // No speed loss — you just stop being able to steer, which is worse.
      racer.x += Math.sin(racer.z * 0.01) * dt * 1.4;
      result.jolt = Math.max(result.jolt, 0.15);
      break;
    }
    case 'gravel': {
      racer.speed *= 1 - 0.8 * dt;
      result.jolt = Math.max(result.jolt, 0.25);
      break;
    }
  }
};

const applyEdges = (
  racer: Racer,
  roadHalfWidth: number,
  dt: number,
  result: StepResult,
): void => {
  const limit = roadHalfWidth;
  if (Math.abs(racer.x) <= limit) return;

  const beyond = Math.abs(racer.x) - limit;
  if (racer.y <= 0) {
    racer.wobble = Math.min(1, racer.wobble + beyond * 1.4 * dt);
    result.jolt = Math.max(result.jolt, Math.min(0.4, beyond));
  }

  // Hit the hoarding, the drain or the crowd barrier and you are off the bike.
  if (Math.abs(racer.x) >= WORLD_EDGE - 0.01 && racer.speedPercent > 0.25) {
    knockDown(racer, 1.6);
    result.jolt = 1;
  }
};

const finishStep = (racer: Racer, road: Road, previousZ: number, result: StepResult): StepResult => {
  const length = road.length;
  if (racer.z >= length) {
    racer.z -= length;
    racer.lap++;
    result.lapped = true;
  } else if (Math.floor(previousZ / length) < Math.floor(racer.z / length)) {
    result.lapped = true;
  }
  return result;
};

/** Put a rider on the tarmac. Shared by collisions, combat and hitting the scenery. */
export const knockDown = (racer: Racer, seconds: number): void => {
  if (racer.isDown || racer.invuln > 0) return;
  racer.downTimer = seconds;
  racer.downTotal = seconds;
  racer.stagger = 0;
  racer.attack = null;
  racer.riderHealth = clamp(racer.riderHealth - 12, 0, 100);
  racer.bikeDamage = clamp(racer.bikeDamage + 5, 0, 100);
  racer.tilt = 0;
};

/** Recover a downed rider: speed penalty, and you rejoin on the racing line. */
export const remount = (racer: Racer): void => {
  racer.downTimer = 0;
  racer.speed = racer.handling.maxSpeed * 0.18;
  racer.x = clamp(racer.x, -0.8, 0.8);
  racer.lean = 0;
  racer.stamina = Math.max(racer.stamina, 45);
  // Brief grace: rejoining into the middle of the pack must not mean going
  // straight back down, which is how a race turns into a softlock.
  racer.invuln = 1.6;
  racer.shuntCooldown = 0.5;
  racer.trafficCooldown = 0.5;
};

/** Where the racer sits vertically in the world, including hills and air time. */
export const racerGroundY = (racer: Racer, road: Road): number => {
  const segment = road.findSegment(racer.z);
  const t = percentRemaining(racer.z, SEGMENT_LENGTH);
  return segment.p1.world.y + (segment.p2.world.y - segment.p1.world.y) * t + racer.y;
};
