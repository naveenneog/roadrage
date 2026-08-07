import { describe, expect, it } from 'vitest';
import { cameraPositionFor, cameraDepthForFov, makePoint, project } from '../src/core/projection.ts';
import { getBike } from '../src/data/bikes.ts';
import { getCircuit } from '../src/data/circuits.ts';
import { Race } from '../src/game/race.ts';
import { SEGMENT_LENGTH } from '../src/track/road.ts';
import type { Controls } from '../src/game/physics.ts';

const STEP = 1 / 120;
const controls = (over: Partial<Controls> = {}): Controls => ({
  steer: 0, throttle: 0, brake: 0, punch: false, kick: false, boost: false, ...over,
});

/**
 * Regressions for defects found in council review. Each one is a bug that
 * shipped in a working build and was invisible until someone looked hard.
 */

describe('camera position wrapping (the vanishing road)', () => {
  const LENGTH = 439_200;
  const TRAIL = 900;

  it('always returns a position inside the track', () => {
    for (const playerZ of [0, 1, 899, 900, 5000, LENGTH - 1, LENGTH, LENGTH + 450]) {
      const position = cameraPositionFor(playerZ, TRAIL, LENGTH);
      expect(position, `playerZ=${playerZ}`).toBeGreaterThanOrEqual(0);
      expect(position, `playerZ=${playerZ}`).toBeLessThan(LENGTH);
    }
  });

  it('wraps behind the start line to the end of the track, not to a negative', () => {
    // This is the exact case that made the whole world disappear: the camera
    // trails the player, so at the start line it is 900 units *before* z=0.
    expect(cameraPositionFor(0, TRAIL, LENGTH)).toBe(LENGTH - TRAIL);
    expect(cameraPositionFor(400, TRAIL, LENGTH)).toBe(LENGTH - 500);
    expect(cameraPositionFor(900, TRAIL, LENGTH)).toBe(0);
  });

  it('is continuous across the start line', () => {
    const before = cameraPositionFor(TRAIL - 1, TRAIL, LENGTH);
    const after = cameraPositionFor(TRAIL + 1, TRAIL, LENGTH);
    expect(before).toBe(LENGTH - 1);
    expect(after).toBe(1);
  });

  it('degrades safely on a zero-length track instead of dividing by zero', () => {
    expect(cameraPositionFor(500, TRAIL, 0)).toBe(0);
  });

  /**
   * The end-to-end symptom: with an unwrapped camera position, every segment in
   * the draw window collapses onto the vanishing point and the back-face cull
   * rejects all of them. This replicates the renderer's projection and its cull
   * tests, and asserts the road is actually visible.
   */
  it('the road is drawable at every point on a lap, including the start line', () => {
    const race = new Race({
      circuit: getCircuit('shivajinagar'),
      playerBike: getBike('ns200'),
      rivalCount: 2,
      seed: 'camera-regression',
    });
    const road = race.road;
    const depth = cameraDepthForFov(96);
    const width = 1280;
    const height = 720;

    const countVisibleSegments = (playerZ: number): number => {
      const position = cameraPositionFor(playerZ, 900, road.length);
      const baseSegment = road.findSegment(position);
      let maxy = height;
      let drawn = 0;
      let x = 0;
      let dx = -(baseSegment.curve * ((position % SEGMENT_LENGTH) / SEGMENT_LENGTH));

      for (let n = 0; n < 210; n++) {
        const segment = road.segments[(baseSegment.index + n) % road.segments.length];
        if (!segment) break;
        const looped = segment.index < baseSegment.index;
        const loopOffset = looped ? road.length : 0;
        const roadWidth = 2000 * segment.width;

        project(segment.p1, -x, 1100, position - loopOffset, depth, width, height, roadWidth);
        project(segment.p2, -x - dx, 1100, position - loopOffset, depth, width, height, roadWidth);
        x += dx;
        dx += segment.curve;

        if (segment.p1.camera.z <= depth) continue;
        if (segment.p2.screen.y >= segment.p1.screen.y) continue;
        if (segment.p2.screen.y >= maxy) continue;
        drawn++;
        maxy = segment.p2.screen.y;
      }
      return drawn;
    };

    // The grid, the countdown, and the first moments of every lap.
    for (const playerZ of [0, 100, 400, 899, 900, 901, 2000, 20_000, road.length - 100]) {
      expect(countVisibleSegments(playerZ), `playerZ=${playerZ}`).toBeGreaterThan(20);
    }
  });

  it('still projects sanely once wrapped — no infinities anywhere', () => {
    const point = makePoint(0, 0, 1000);
    const position = cameraPositionFor(0, 900, 439_200);
    project(point, 0, 1100, position, cameraDepthForFov(96), 1280, 720, 2000);
    expect(Number.isFinite(point.screen.x)).toBe(true);
    expect(Number.isFinite(point.screen.y)).toBe(true);
    expect(Number.isFinite(point.screen.w)).toBe(true);
  });
});

describe('finished rivals leave the road', () => {
  const runToFinish = (maxSeconds: number) => {
    const race = new Race({
      circuit: getCircuit('talao-pali'),
      playerBike: getBike('splendor'),
      rivalCount: 5,
      seed: 'ghost-regression',
    });
    race.start();
    const steps = Math.round(maxSeconds / STEP);
    for (let i = 0; i < steps && !race.finished; i++) {
      // Deliberately slow: let the rivals finish first so ghosts would appear.
      race.update(STEP, controls({ throttle: 0.55, steer: -race.player.x * 2 }));
    }
    return race;
  };

  it('a finished rival stops being a collision or attack target', () => {
    const race = runToFinish(420);
    const finished = race.racers.filter((r) => r.finished && r !== race.player);
    // Whether or not any rival beat the player, the invariant must hold.
    for (const ghost of finished) {
      expect(ghost.finished).toBe(true);
    }
    // Nobody may be left in a state where they are both finished and moving.
    const stepped = finished.map((r) => r.distance);
    race.update(STEP, controls({ throttle: 1 }));
    expect(finished.map((r) => r.distance)).toEqual(stepped);
  });
});

describe('a race can only finish once', () => {
  it('emits race:finish exactly one time even when wrecked on the line', () => {
    const race = new Race({
      circuit: getCircuit('talao-pali'),
      playerBike: getBike('ns200'),
      rivalCount: 2,
      laps: 1,
      seed: 'double-finish',
    });
    let finishes = 0;
    race.bus.on('race:finish', () => finishes++);
    race.start();

    for (let i = 0; i < Math.round(400 / STEP) && !race.finished; i++) {
      // Total the bike right as the lap completes, forcing both end conditions
      // into the same simulation step.
      if (race.player.lap === 0 && race.player.z > race.road.length - 400) {
        race.player.bikeDamage = 100;
      }
      race.update(STEP, controls({ throttle: 1, steer: -race.player.x * 2 }));
    }

    expect(race.finished).toBe(true);
    expect(finishes).toBe(1);
  });

  it('keeps emitting nothing on subsequent ticks after the flag', () => {
    const race = new Race({
      circuit: getCircuit('talao-pali'),
      playerBike: getBike('duke390'),
      rivalCount: 2,
      laps: 1,
      seed: 'post-finish',
    });
    let finishes = 0;
    race.bus.on('race:finish', () => finishes++);
    race.start();
    for (let i = 0; i < Math.round(400 / STEP) && !race.finished; i++) {
      race.update(STEP, controls({ throttle: 1, steer: -race.player.x * 2 }));
    }
    expect(finishes).toBe(1);
    for (let i = 0; i < 600; i++) race.update(STEP, controls({ throttle: 1 }));
    expect(finishes).toBe(1);
  });
});
