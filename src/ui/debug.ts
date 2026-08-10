import type { GameLoop } from '../core/loop.ts';
import type { Race } from '../game/race.ts';
import { attackPhase } from '../game/racer.ts';
import { SEGMENT_LENGTH } from '../track/road.ts';
import type { SpriteAtlas } from '../render/atlas.ts';

/**
 * The automation surface.
 *
 * Everything the QA, performance and recording harnesses need to drive the game
 * and judge what they see — kept out of the app shell because none of it is
 * gameplay, and it should be obvious at a glance exactly how much of the
 * internals is exposed. This is not a public API.
 */
export interface DebugSnapshot {
  mode: string;
  screen: string | null;
  fps: number;
  circuit: string | null;
  phase: string | null;
  speed: number;
  place: number;
  x: number;
  lap: number;
  down: boolean;
  /** Which part of a swing the player is in, or null when not swinging. */
  attack: string | null;
  /** Which attack is being thrown, so harnesses can tell a punch from a kick. */
  attackKind: string | null;
  stamina: number;
  /** Distance to the nearest vehicle ahead, or -1 when the road is clear. */
  hazardDz: number;
  hazardX: number;
  hazardWidth: number;
  /** True when that vehicle is coming the other way, and so closing far faster. */
  hazardOncoming: boolean;
  /** Nearest road-surface hazard ahead: 'pothole', 'breaker', 'warn' or null. */
  roadHazard: string | null;
  /** Segments to that hazard, or -1 when the road ahead is clean. */
  roadHazardIn: number;
  simMs: number;
  drawMs: number;
  sprites: number;
  cash: number;
}

/** How far ahead the harnesses are told about, in world units. */
const HAZARD_HORIZON = 12_000;

export const buildDebugSnapshot = (
  mode: string,
  screen: string | null,
  loop: GameLoop,
  atlas: SpriteAtlas,
  cash: number,
  circuitId: string | null,
  race: Race | null,
): DebugSnapshot => {
  let hazardDz = Infinity;
  let hazardX = 0;
  let hazardWidth = 0;
  let hazardOncoming = false;

  if (race) {
    for (const vehicle of race.traffic.vehicles) {
      if (!vehicle.active) continue;
      let dz = vehicle.z - race.player.z;
      if (dz < -race.road.length / 2) dz += race.road.length;
      if (dz < 0 || dz > HAZARD_HORIZON) continue;
      // Weight oncoming traffic as nearer than it is: it closes at the sum of
      // both speeds, so a bot that treats it by raw distance meets it head-on.
      const urgency = vehicle.oncoming ? dz * 0.5 : dz;
      if (urgency >= hazardDz) continue;
      hazardDz = urgency;
      hazardX = vehicle.x;
      hazardWidth = vehicle.spec.width;
      hazardOncoming = vehicle.oncoming;
    }
  }

  let roadHazard: string | null = null;
  let roadHazardIn = -1;
  if (race) {
    // Look the same distance ahead a rider would be reading the road at speed.
    const segs = race.road.segments;
    const base = Math.floor(race.player.z / SEGMENT_LENGTH);
    for (let k = 2; k < 40; k++) {
      const s = segs[(base + k) % segs.length];
      if (!s) continue;
      if (s.hazard === 'pothole' || s.hazard === 'breaker') {
        roadHazard = s.hazard;
        roadHazardIn = k;
        break;
      }
      if (s.warn > 0.5 && roadHazard === null) {
        roadHazard = 'warn';
        roadHazardIn = k;
      }
    }
  }

  return {
    mode,
    screen,
    fps: loop.stats.fps,
    circuit: circuitId,
    phase: race?.phase ?? null,
    speed: race?.player.speed ?? 0,
    place: race?.player.place ?? 0,
    x: race?.player.x ?? 0,
    lap: race?.player.lap ?? 0,
    down: race?.player.isDown ?? false,
    attack: race ? attackPhase(race.player) : null,
    attackKind: race?.player.attack?.kind ?? null,
    stamina: Math.round(race?.player.stamina ?? 0),
    hazardDz: Number.isFinite(hazardDz) ? Math.round(hazardDz) : -1,
    hazardX,
    hazardWidth,
    hazardOncoming,
    roadHazard,
    roadHazardIn,
    simMs: Number(loop.stats.simMs.toFixed(2)),
    drawMs: Number(loop.stats.drawMs.toFixed(2)),
    sprites: atlas.size,
    cash,
  };
};
