import { clamp, loopDelta } from '../core/math.ts';
import type { BikeSpec } from '../data/types.ts';
import type { Race } from './race.ts';

/**
 * What the presentation layers need to know each frame, as plain data.
 *
 * The simulation cannot import audio or render, so instead it broadcasts: these
 * are structurally compatible with `audio/director.ts`'s `EngineTarget` without
 * either module knowing the other exists.
 */
export interface EngineBroadcast {
  id: number;
  bike: BikeSpec;
  throttle: number;
  speedPercent: number;
  /** -1..1, relative to the camera. */
  pan: number;
  /** 0 = at the camera, 1 = out of earshot. */
  distance: number;
}

/** Beyond this the engine is inaudible under your own, so it gets no voice. */
export const EARSHOT = 6000;
/** Voices are expensive; only the nearest few rivals are worth synthesising. */
export const MAX_RIVAL_VOICES = 4;

/**
 * Build the frame's audible engine list: the player, plus the nearest rivals.
 *
 * Reused buffers rather than fresh arrays — this runs sixty times a second.
 */
export const engineBroadcast = (
  race: Race,
  playerThrottle: number,
  into: EngineBroadcast[] = [],
): EngineBroadcast[] => {
  into.length = 0;
  const player = race.player;

  into.push({
    id: player.id,
    bike: player.bike,
    throttle: playerThrottle,
    speedPercent: player.speedPercent,
    pan: 0,
    distance: 0,
  });

  const nearby: Array<{ id: number; bike: BikeSpec; speedPercent: number; x: number; gap: number; down: boolean }> = [];
  for (const racer of race.racers) {
    if (racer === player || racer.finished) continue;
    const gap = loopDelta(player.z, racer.z, race.road.length);
    if (Math.abs(gap) >= EARSHOT) continue;
    nearby.push({
      id: racer.id,
      bike: racer.bike,
      speedPercent: racer.speedPercent,
      x: racer.x,
      gap,
      down: racer.isDown,
    });
  }
  nearby.sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));

  for (let i = 0; i < Math.min(MAX_RIVAL_VOICES, nearby.length); i++) {
    const entry = nearby[i];
    if (!entry) continue;
    into.push({
      id: entry.id,
      bike: entry.bike,
      throttle: entry.down ? 0 : 0.7,
      speedPercent: entry.speedPercent,
      pan: clamp((entry.x - player.x) * 0.8, -1, 1),
      distance: clamp(Math.abs(entry.gap) / EARSHOT, 0, 1),
    });
  }

  return into;
};

/**
 * How hard the music should push, 0..1.
 *
 * Rises with speed and with how close the nearest rival is — the soundtrack
 * should know when you are in a fight even though it cannot see one.
 */
export const musicIntensity = (race: Race): number => {
  const player = race.player;
  let nearest = Infinity;
  for (const racer of race.racers) {
    if (racer === player || racer.finished) continue;
    const gap = Math.abs(loopDelta(player.z, racer.z, race.road.length));
    if (gap < nearest) nearest = gap;
  }
  const pressure = nearest === Infinity ? 0 : 1 - clamp(nearest / EARSHOT, 0, 1);
  return clamp(0.45 + player.speedPercent * 0.35 + pressure * 0.25, 0.2, 1);
};
