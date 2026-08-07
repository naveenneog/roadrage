import { describe, expect, it } from 'vitest';
import { CIRCUITS, getCircuit } from '../src/data/circuits.ts';
import { RoadBuilder, type TrackOp } from '../src/track/road.ts';
import { populateScenery, sceneryIds, type SceneryEntry } from '../src/track/scenery.ts';
import { PROP_ASPECT, PROP_WIDTH, hasProp, propAspect, propWorldWidth } from '../src/render/sprites/props.ts';
import { VEHICLE_ASPECT, vehicleAspect } from '../src/render/sprites/vehicles.ts';
import { TRAFFIC } from '../src/data/traffic.ts';
import { BIKE_FRAMES, frameKey } from '../src/render/sprites/bike.ts';
import { darken, lighten, luminance, mix, parseHex, readableOn, toHex, withAlpha } from '../src/render/palette.ts';

const build = (id: string) => {
  const spec = getCircuit(id);
  const builder = new RoadBuilder();
  for (const op of spec.script as TrackOp[]) builder.apply(op);
  const road = builder.closeLoop().build();
  populateScenery(road, spec.scenery, spec.sceneryDensity, spec.id);
  return { road, spec };
};

describe('scenery placement', () => {
  it('places scenery on both sides of the road', () => {
    const { road } = build('shivajinagar');
    const offsets = road.segments.flatMap((s) => s.scenery.map((i) => i.offset));
    expect(offsets.some((o) => o < 0)).toBe(true);
    expect(offsets.some((o) => o > 0)).toBe(true);
  });

  it('never places scenery on the tarmac', () => {
    for (const circuit of CIRCUITS) {
      const { road } = build(circuit.id);
      for (const segment of road.segments) {
        for (const item of segment.scenery) {
          expect(Math.abs(item.offset), `${circuit.id}/${item.id}`).toBeGreaterThan(0.95);
        }
      }
    }
  });

  it('is deterministic — the same circuit twice is identical', () => {
    const describeRoad = (id: string) =>
      build(id).road.segments.map((s) =>
        s.scenery.map((i) => `${i.id}@${i.offset.toFixed(4)}x${i.scale.toFixed(4)}`).join(','));
    expect(describeRoad('yeoor')).toEqual(describeRoad('yeoor'));
  });

  it('denser circuits really do get more scenery', () => {
    const sparse = build('ghodbunder');
    const dense = build('chandni-chowk');
    const count = (r: ReturnType<typeof build>) =>
      r.road.segments.reduce((n, s) => n + s.scenery.length, 0) / r.road.segments.length;
    expect(count(dense)).toBeGreaterThan(count(sparse));
  });

  it('leaves scripted landmarks alone rather than burying them', () => {
    const { road } = build('shivajinagar');
    const landmarks = road.segments.filter((s) =>
      s.scenery.some((i) => i.id === 'russell-market' || i.id === 'st-marys'));
    expect(landmarks.length).toBeGreaterThanOrEqual(2);
    for (const segment of landmarks) {
      expect(segment.scenery.length).toBe(1);
    }
  });

  it('every placed prop has a painter and a sane size', () => {
    for (const circuit of CIRCUITS) {
      const { road, spec } = build(circuit.id);
      for (const id of sceneryIds(road, spec.scenery)) {
        expect(hasProp(id), `${circuit.id}: ${id}`).toBe(true);
        expect(propWorldWidth(id), id).toBeGreaterThan(0);
        expect(propWorldWidth(id), id).toBeLessThanOrEqual(3);
        expect(propAspect(id), id).toBeGreaterThan(0.2);
        expect(propAspect(id), id).toBeLessThan(4);
      }
    }
  });

  it('handles an empty mix without throwing', () => {
    const builder = new RoadBuilder();
    builder.apply({ op: 'straight', n: 30 } as TrackOp);
    const road = builder.closeLoop().build();
    expect(() => populateScenery(road, [], 0.5, 'empty')).not.toThrow();
    expect(road.segments.every((s) => s.scenery.length === 0)).toBe(true);
  });

  it('handles a zero-weight mix without looping forever', () => {
    const builder = new RoadBuilder();
    builder.apply({ op: 'straight', n: 30 } as TrackOp);
    const road = builder.closeLoop().build();
    const mix: SceneryEntry[] = [{ id: 'neem', weight: 0, minOffset: 1.2, maxOffset: 1.5 }];
    expect(() => populateScenery(road, mix, 0.5, 'zero')).not.toThrow();
  });
});

describe('sprite registries', () => {
  it('every prop declares both an aspect and a width', () => {
    for (const id of Object.keys(PROP_ASPECT)) {
      expect(PROP_WIDTH[id], id).toBeDefined();
    }
    expect(Object.keys(PROP_WIDTH).length).toBe(Object.keys(PROP_ASPECT).length);
  });

  it('every traffic vehicle has a painter aspect', () => {
    for (const spec of TRAFFIC) {
      expect(VEHICLE_ASPECT[spec.id], spec.id).toBeDefined();
      expect(vehicleAspect(spec.id), spec.id).toBeGreaterThan(0.3);
    }
  });

  it('bike frames are unique, so the atlas cannot collide two poses', () => {
    const keys = BIKE_FRAMES.map(frameKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('covers every lean position plus both attacks and a wreck', () => {
    expect(BIKE_FRAMES.some((f) => f.down)).toBe(true);
    expect(BIKE_FRAMES.some((f) => f.action === 1)).toBe(true);
    expect(BIKE_FRAMES.some((f) => f.action === 2)).toBe(true);
    for (const lean of [-2, -1, 0, 1, 2]) {
      expect(BIKE_FRAMES.some((f) => f.lean === lean && !f.down), `lean ${lean}`).toBe(true);
    }
  });
});

describe('palette helpers', () => {
  it('round-trips hex through parse and format', () => {
    expect(toHex(parseHex('#3b7dd8'))).toBe('#3b7dd8');
  });

  it('expands three-digit hex', () => {
    expect(parseHex('#f0a')).toEqual({ r: 255, g: 0, b: 170 });
  });

  it('lighten moves toward white and darken toward black, both clamped', () => {
    expect(lighten('#000000', 1)).toBe('#ffffff');
    expect(darken('#ffffff', 1)).toBe('#000000');
    expect(lighten('#ffffff', 1)).toBe('#ffffff');
    expect(darken('#000000', 1)).toBe('#000000');
  });

  it('mix at the endpoints returns the endpoints', () => {
    expect(mix('#112233', '#445566', 0)).toBe('#112233');
    expect(mix('#112233', '#445566', 1)).toBe('#445566');
  });

  it('withAlpha clamps out-of-range alpha rather than emitting invalid css', () => {
    expect(withAlpha('#ffffff', 2)).toBe('rgba(255, 255, 255, 1)');
    expect(withAlpha('#ffffff', -1)).toBe('rgba(255, 255, 255, 0)');
  });

  it('readableOn picks dark ink on light backgrounds and vice versa', () => {
    expect(readableOn('#ffffff')).toBe('#14161b');
    expect(readableOn('#000000')).toBe('#f2f4f7');
  });

  it('luminance orders colours the way an eye does', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBeCloseTo(0, 5);
    // Green reads brighter than blue at the same channel value.
    expect(luminance('#00ff00')).toBeGreaterThan(luminance('#0000ff'));
  });
});
