import { describe, expect, it } from 'vitest';
import { cameraDepthForFov, fogFactor, makePoint, project } from '../src/core/projection.ts';

const WIDTH = 1024;
const HEIGHT = 640;
const ROAD_WIDTH = 2000;

describe('cameraDepthForFov', () => {
  it('a 90 degree field of view puts the projection plane one unit away', () => {
    expect(cameraDepthForFov(90)).toBeCloseTo(1, 6);
  });

  it('narrowing the field of view pushes the plane further out (zooms in)', () => {
    expect(cameraDepthForFov(60)).toBeGreaterThan(cameraDepthForFov(100));
  });
});

describe('project', () => {
  const depth = cameraDepthForFov(100);

  it('puts a point on the camera axis at the centre of the screen', () => {
    const p = makePoint(0, 0, 1000);
    project(p, 0, 0, 0, depth, WIDTH, HEIGHT, ROAD_WIDTH);
    expect(p.screen.x).toBe(WIDTH / 2);
    expect(p.screen.y).toBe(HEIGHT / 2);
  });

  it('shrinks the road with distance — the whole point of the technique', () => {
    const near = makePoint(0, 0, 1000);
    const far = makePoint(0, 0, 8000);
    project(near, 0, 0, 0, depth, WIDTH, HEIGHT, ROAD_WIDTH);
    project(far, 0, 0, 0, depth, WIDTH, HEIGHT, ROAD_WIDTH);
    expect(far.screen.w).toBeLessThan(near.screen.w);
    expect(far.screen.scale).toBeLessThan(near.screen.scale);
  });

  it('scale is inversely proportional to depth', () => {
    const a = makePoint(0, 0, 1000);
    const b = makePoint(0, 0, 2000);
    project(a, 0, 0, 0, depth, WIDTH, HEIGHT, ROAD_WIDTH);
    project(b, 0, 0, 0, depth, WIDTH, HEIGHT, ROAD_WIDTH);
    expect(a.screen.scale / b.screen.scale).toBeCloseTo(2, 6);
  });

  it('a camera above the road draws distant tarmac below the horizon line', () => {
    const p = makePoint(0, 0, 4000);
    project(p, 0, 1000, 0, depth, WIDTH, HEIGHT, ROAD_WIDTH);
    expect(p.screen.y).toBeGreaterThan(HEIGHT / 2);
  });

  it('steering the camera right moves the road left on screen', () => {
    const p = makePoint(0, 0, 2000);
    project(p, 500, 0, 0, depth, WIDTH, HEIGHT, ROAD_WIDTH);
    expect(p.screen.x).toBeLessThan(WIDTH / 2);
  });

  it('stays finite for points at or behind the camera instead of returning Infinity', () => {
    const atCamera = makePoint(0, 0, 0);
    project(atCamera, 0, 0, 0, depth, WIDTH, HEIGHT, ROAD_WIDTH);
    expect(Number.isFinite(atCamera.screen.scale)).toBe(true);
    expect(Number.isFinite(atCamera.screen.x)).toBe(true);

    const behind = makePoint(0, 0, -500);
    project(behind, 0, 0, 0, depth, WIDTH, HEIGHT, ROAD_WIDTH);
    expect(Number.isFinite(behind.screen.scale)).toBe(true);
  });

  it('reuses the same objects — no per-segment allocation in the hot loop', () => {
    const p = makePoint(0, 0, 1000);
    const camera = p.camera;
    const screen = p.screen;
    project(p, 0, 0, 0, depth, WIDTH, HEIGHT, ROAD_WIDTH);
    expect(p.camera).toBe(camera);
    expect(p.screen).toBe(screen);
  });
});

describe('fogFactor', () => {
  it('is fully clear at the camera and approaches zero at the draw limit', () => {
    expect(fogFactor(0, 5)).toBeCloseTo(1, 6);
    expect(fogFactor(1, 5)).toBeLessThan(0.01);
  });

  it('denser fog means less visibility at the same distance', () => {
    expect(fogFactor(0.5, 12)).toBeLessThan(fogFactor(0.5, 3));
  });

  it('decreases monotonically with distance', () => {
    let previous = fogFactor(0, 5);
    for (let d = 0.05; d <= 1; d += 0.05) {
      const current = fogFactor(d, 5);
      expect(current).toBeLessThanOrEqual(previous);
      previous = current;
    }
  });
});
