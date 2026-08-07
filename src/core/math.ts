/**
 * Pure maths shared by the simulation and the renderer.
 * No DOM, no state — everything here is a function of its arguments.
 */

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Framerate-independent approach: pulls `a` toward `b` at a half-life measured in seconds. */
export const damp = (a: number, b: number, halfLife: number, dt: number): number =>
  halfLife <= 0 ? b : b + (a - b) * Math.pow(2, -dt / halfLife);

export const easeIn = (a: number, b: number, t: number): number => a + (b - a) * t * t;

export const easeOut = (a: number, b: number, t: number): number =>
  a + (b - a) * (1 - Math.pow(1 - t, 2));

export const easeInOut = (a: number, b: number, t: number): number =>
  a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);

/** How far through a `total`-sized bucket `n` sits, as 0..1. Used to blend across road segments. */
export const percentRemaining = (n: number, total: number): number => (n % total) / total;

/** Advance `start` by `increment`, wrapping into [0, max). Keeps track position on a looped circuit. */
export const increase = (start: number, increment: number, max: number): number => {
  let result = (start + increment) % max;
  while (result < 0) result += max;
  return result;
};

/** Shortest signed distance from `a` to `b` on a loop of length `max`. */
export const loopDelta = (a: number, b: number, max: number): number => {
  const raw = ((b - a) % max + max) % max;
  return raw > max / 2 ? raw - max : raw;
};

/** Do two centred spans overlap? `tolerance` shrinks both widths (1 = full width). */
export const overlap = (
  x1: number,
  w1: number,
  x2: number,
  w2: number,
  tolerance = 1,
): boolean => {
  const half = tolerance / 2;
  const min1 = x1 - w1 * half;
  const max1 = x1 + w1 * half;
  const min2 = x2 - w2 * half;
  const max2 = x2 + w2 * half;
  return !(max1 < min2 || min1 > max2);
};

/** Map `v` from one range to another, clamped to the destination range. */
export const remap = (
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number => {
  if (inMax === inMin) return outMin;
  return clamp(outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin),
    Math.min(outMin, outMax), Math.max(outMin, outMax));
};

/** Smooth 0..1 ramp. */
export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
};

export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Move `value` toward `target` by at most `maxDelta`. */
export const approach = (value: number, target: number, maxDelta: number): number => {
  const diff = target - value;
  if (Math.abs(diff) <= maxDelta) return target;
  return value + sign(diff) * maxDelta;
};

/**
 * Simulation speed unit -> km/h. Chosen so a top-tier bike runs ~60 road segments
 * per second, which is where the ribbon stops reading as steps and starts reading
 * as speed.
 */
export const KMH_PER_UNIT = 0.015;

/** km/h -> simulation units, so bike data can be authored in real-world numbers. */
export const kmhToUnits = (kmh: number): number => kmh / KMH_PER_UNIT;

/** Simulation speed units -> km/h, so the HUD can show a number a rider would recognise. */
export const toKmh = (speed: number): number => Math.round(speed * KMH_PER_UNIT);

export const formatTime = (seconds: number): string => {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};

export const ordinal = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
};
