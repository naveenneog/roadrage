import { clamp, damp, loopDelta } from '../core/math.ts';
import type { Rng } from '../core/rng.ts';
import { Road } from '../track/road.ts';
import { beginAttack } from './combat.ts';
import type { Controls } from './physics.ts';
import { Racer, type AiProfile } from './racer.ts';
import type { TrafficField } from './traffic.ts';

export const RIVAL_NAMES: readonly string[] = [
  'Kaale Khan', 'Chotu', 'Bhau', 'Anna', 'Pintya', 'Shabbir', 'Munna',
  'Dada', 'Salim Bhai', 'Gullu', 'Raju Petrol', 'Bunty', 'Chikna',
  'Tinku', 'Bablu', 'Lala', 'Sardar', 'Bittu', 'Nana', 'Kittu',
];

/** Difficulty presets. Aggression and violence are separated on purpose:
 *  a fast clean rider and a slow thug are different problems to solve. */
export const AI_TIERS: readonly AiProfile[] = [
  { aggression: 0.62, violence: 0.18, skill: 0.42, line: 0, thinkEvery: 0.55 },
  { aggression: 0.72, violence: 0.30, skill: 0.55, line: 0, thinkEvery: 0.45 },
  { aggression: 0.82, violence: 0.45, skill: 0.68, line: 0, thinkEvery: 0.36 },
  { aggression: 0.90, violence: 0.62, skill: 0.80, line: 0, thinkEvery: 0.28 },
  { aggression: 0.97, violence: 0.78, skill: 0.92, line: 0, thinkEvery: 0.22 },
];

export const tierForDifficulty = (difficulty: number): AiProfile =>
  AI_TIERS[clamp(difficulty - 1, 0, AI_TIERS.length - 1)] as AiProfile;

/** How far ahead a rider reads the road, in segments, scaled by skill. */
const LOOKAHEAD_MIN = 12;
const LOOKAHEAD_MAX = 34;

const scratch: Controls = {
  steer: 0, throttle: 0, brake: 0, punch: false, kick: false, boost: false,
};

/**
 * Decide one rival's inputs for this step.
 *
 * The AI drives through the same `Controls` struct as the player and through the
 * same physics — it has no private handling multipliers. If a rival beats you, it
 * out-drove you on identical rules.
 */
export const think = (
  racer: Racer,
  road: Road,
  field: readonly Racer[],
  player: Racer,
  dt: number,
  rng: Rng,
  traffic: TrafficField | null = null,
): Controls => {
  const ai = racer.ai;
  scratch.steer = 0;
  scratch.throttle = 0;
  scratch.brake = 0;
  scratch.punch = false;
  scratch.kick = false;
  scratch.boost = false;
  if (!ai || racer.isDown || racer.finished) return scratch;

  racer.thinkTimer -= dt;
  if (racer.thinkTimer <= 0) {
    racer.thinkTimer = ai.thinkEvery;
    racer.targetLine = chooseLine(racer, road, field, player, ai, rng);
  }

  // Traffic is re-checked every step, not on the think timer: a bus appearing
  // 40 metres ahead is not something to reconsider in a third of a second.
  const avoid = traffic ? avoidTraffic(racer, road, traffic, ai) : null;
  const line = avoid ?? racer.targetLine;

  // Read the road ahead and lift for what's coming, in proportion to skill.
  const lookahead = LOOKAHEAD_MIN + (LOOKAHEAD_MAX - LOOKAHEAD_MIN) * ai.skill;
  const upcoming = road.findSegment(racer.z + lookahead * 200);
  const bendSeverity = Math.abs(upcoming.curve) / 9;
  const narrowness = 1 - clamp(upcoming.width, 0.4, 1);

  // A skilled rider carries more speed into a bend; a clumsy one panics or doesn't notice.
  const cornerCeiling = clamp(1 - bendSeverity * (0.62 - ai.skill * 0.32) - narrowness * 0.2, 0.32, 1);
  // Rivals run essentially flat out on the straights. The difference between
  // tiers is where they lift, not how fast they are willing to go.
  const wants = Math.min(1, cornerCeiling * (0.84 + ai.aggression * 0.24));

  if (racer.speedPercent < wants) {
    scratch.throttle = 1;
  } else if (racer.speedPercent > wants + 0.1) {
    scratch.brake = clamp((racer.speedPercent - wants) * 3, 0, 1);
  } else {
    scratch.throttle = 0.55;
  }

  // Boost on the exit of something long and straight, if the tier is aggressive enough.
  if (Math.abs(upcoming.curve) < 1 && racer.speedPercent > 0.6 && rng.chance(ai.aggression * dt * 1.5)) {
    scratch.boost = true;
  }

  const error = line - racer.x;
  // Low-skill riders steer coarsely and overshoot, which reads as human sloppiness.
  const precision = 0.55 + ai.skill * 0.45;
  scratch.steer = clamp(error * 3.2 * precision, -1, 1);

  // Lift off when something slow is directly ahead and there is nowhere to go.
  if (avoid !== null && Math.abs(avoid - racer.x) > 0.5) {
    scratch.throttle = Math.min(scratch.throttle, 0.55);
    scratch.brake = Math.max(scratch.brake, 0.2 * ai.skill);
  }

  decideViolence(racer, field, player, ai, road, rng, dt);

  return scratch;
};

/**
 * Look for the nearest vehicle on a collision course and pick a side to pass.
 * Returns the lateral target, or null when the road ahead is clear.
 */
const avoidTraffic = (
  racer: Racer,
  road: Road,
  traffic: TrafficField,
  ai: AiProfile,
): number | null => {
  // A better rider looks further up the road.
  const horizon = 4500 + ai.skill * 6500;
  let nearest: { dz: number; x: number; width: number } | null = null;

  for (const vehicle of traffic.vehicles) {
    if (!vehicle.active) continue;
    const dz = loopDelta(racer.z, vehicle.z, road.length);
    if (dz < 60 || dz > horizon) continue;
    // Oncoming traffic is always a threat regardless of its speed, and it is
    // closing far faster than the gap suggests.
    if (!vehicle.oncoming && vehicle.speed >= racer.speed) continue;
    const urgency = vehicle.oncoming ? dz * 0.55 : dz;
    if (!nearest || urgency < nearest.dz) {
      nearest = { dz: urgency, x: vehicle.x, width: vehicle.spec.width };
    }
  }

  if (!nearest) return null;
  const clearance = nearest.width * 0.5 + 0.3;
  if (Math.abs(nearest.x - racer.x) > clearance) return null;

  const halfWidth = Math.max(0.4, road.widthAt(racer.z + nearest.dz) - 0.1);
  // Go around the side with more room; if both sides are tight, take the outside.
  const leftRoom = nearest.x + halfWidth;
  const rightRoom = halfWidth - nearest.x;
  const side = leftRoom > rightRoom ? -1 : 1;
  return clamp(nearest.x + side * (clearance + 0.25), -halfWidth, halfWidth);
};

const chooseLine = (
  racer: Racer,
  road: Road,
  field: readonly Racer[],
  player: Racer,
  ai: AiProfile,
  rng: Rng,
): number => {
  const segment = road.findSegment(racer.z + 1600);
  const halfWidth = Math.max(0.35, segment.width - 0.14);

  // Take the inside of the bend, in proportion to skill, but bias toward the
  // left-of-centre racing line — the opposing lane belongs to oncoming traffic.
  const apex = clamp(-Math.sign(segment.curve) * Math.min(1, Math.abs(segment.curve) / 6) * ai.skill, -1, 1);
  let line = clamp(apex * halfWidth * 0.7 + 0.18 * halfWidth, -halfWidth, halfWidth);

  // Bullies drift toward the player when they're close enough to do something about it.
  const gapToPlayer = loopDelta(racer.z, player.z, road.length);
  if (!player.isDown && Math.abs(gapToPlayer) < 600 && rng.chance(ai.violence)) {
    line = clamp(player.x, -halfWidth, halfWidth);
  }

  // Avoid sitting inside somebody else's back wheel.
  for (const other of field) {
    if (other === racer || other.isDown) continue;
    const dz = loopDelta(racer.z, other.z, road.length);
    if (dz > 40 && dz < 520 && Math.abs(other.x - line) < 0.3) {
      const escape = other.x > 0 ? -1 : 1;
      line = clamp(other.x + escape * 0.42, -halfWidth, halfWidth);
      break;
    }
  }

  // Dodge the pothole you can see, if you're good enough to see it.
  const hazardSegment = road.findSegment(racer.z + 900);
  if (hazardSegment.hazard === 'pothole' && rng.chance(ai.skill)) {
    if (Math.abs(hazardSegment.hazardOffset - line) < 0.3) {
      line = clamp(hazardSegment.hazardOffset > 0 ? line - 0.5 : line + 0.5, -halfWidth, halfWidth);
    }
  }

  return line + rng.range(-0.06, 0.06) * (1 - ai.skill);
};

const decideViolence = (
  racer: Racer,
  field: readonly Racer[],
  player: Racer,
  ai: AiProfile,
  road: Road,
  rng: Rng,
  dt: number,
): void => {
  if (racer.isBusy || racer.stamina < 30) return;

  let bestTarget: Racer | null = null;
  let bestDx = 0;
  for (const other of field) {
    if (other === racer || other.isDown || other.finished) continue;
    const dz = loopDelta(racer.z, other.z, road.length);
    if (dz < -120 || dz > 300) continue;
    const dx = other.x - racer.x;
    if (Math.abs(dx) > racer.reachFor('kick')) continue;
    // Rivals prefer to hit the player: it is more fun to be the target than to watch.
    const priority = other === player ? 2 : 1;
    if (!bestTarget || priority > 1) {
      bestTarget = other;
      bestDx = dx;
      if (priority > 1) break;
    }
  }

  if (!bestTarget) return;
  const willSwing = rng.chance(ai.violence * dt * 6.5);
  if (!willSwing) return;

  const kind = racer.weapon ? 'weapon' : rng.chance(0.35 + ai.violence * 0.3) ? 'kick' : 'punch';
  beginAttack(racer, kind, Math.sign(bestDx) || 1);
};

/**
 * Rubber-banding, applied honestly: rivals far behind get a small top-end bonus and
 * rivals far ahead lose a little, so the pack stays racing without anyone teleporting.
 * The band is deliberately narrow enough that a good run still runs away with it.
 */
export const applyCatchup = (racer: Racer, player: Racer, road: Road, dt: number): void => {
  if (!racer.ai || racer.finished) return;
  const gap = loopDelta(player.z, racer.z, road.length);
  const normalised = clamp(gap / 6000, -1, 1);
  const target = 1 - normalised * 0.09;
  racer.catchup = damp(racer.catchup, target, 0.8, dt);
};
