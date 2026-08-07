import { describe, expect, it } from 'vitest';
import { BIKES, getBike } from '../src/data/bikes.ts';
import { CAREER_ORDER, CIRCUITS, getCircuit } from '../src/data/circuits.ts';
import { deriveHandling, powerToWeight, statBars } from '../src/game/tuning.ts';
import { RoadBuilder, SEGMENT_LENGTH, type TrackOp } from '../src/track/road.ts';
import { toKmh } from '../src/core/math.ts';

const buildCircuit = (id: string) => {
  const spec = getCircuit(id);
  const builder = new RoadBuilder();
  for (const op of spec.script as TrackOp[]) builder.apply(op);
  return builder.closeLoop().build();
};

describe('bike roster', () => {
  it('has unique ids', () => {
    const ids = BIKES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every bike carries a sourced spec note', () => {
    for (const bike of BIKES) {
      expect(bike.note.length).toBeGreaterThan(30);
      expect(bike.blurb.length).toBeGreaterThan(10);
    }
  });

  it('every spec figure is a positive, finite number', () => {
    for (const bike of BIKES) {
      for (const key of ['cc', 'bhp', 'torqueNm', 'weightKg', 'topSpeedKmh', 'wheelbaseMm'] as const) {
        expect(Number.isFinite(bike[key]), `${bike.id}.${key}`).toBe(true);
        expect(bike[key], `${bike.id}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('two-stroke bikes are declared as two-stroke in their engine voice', () => {
    for (const id of ['rx100', 'rd350', 'roadking']) {
      expect(getBike(id).voice.stroke).toBe(2);
    }
    for (const id of ['classic350', 'duke390', 'interceptor']) {
      expect(getBike(id).voice.stroke).toBe(4);
    }
  });

  it('the 650 twin has an uneven crank and the singles do not', () => {
    expect(getBike('interceptor').voice.crankOffset).toBeGreaterThan(0.5);
    expect(getBike('interceptor').voice.firingOrder).toBe(2);
    expect(getBike('classic350').voice.crankOffset).toBe(0);
  });

  it('rejects an unknown id loudly rather than returning undefined', () => {
    expect(() => getBike('hayabusa')).toThrow(/Unknown bike/);
  });
});

describe('handling derived from real specifications', () => {
  it('the Duke 390 is the fastest thing in the garage', () => {
    const fastest = [...BIKES].sort(
      (a, b) => deriveHandling(b).maxSpeed - deriveHandling(a).maxSpeed,
    )[0];
    expect(fastest?.id).toBe('duke390');
  });

  it('top speed in simulation units round-trips back to the published km/h', () => {
    for (const bike of BIKES) {
      expect(toKmh(deriveHandling(bike).maxSpeed)).toBe(bike.topSpeedKmh);
    }
  });

  it('the 103 kg RX100 turns harder than the 218 kg Interceptor', () => {
    expect(deriveHandling(getBike('rx100')).steering)
      .toBeGreaterThan(deriveHandling(getBike('interceptor')).steering);
  });

  it('heavy machines run wider through a bend', () => {
    expect(deriveHandling(getBike('classic350')).centrifugal)
      .toBeGreaterThan(deriveHandling(getBike('rx100')).centrifugal);
  });

  it('the auto rickshaw is the least agile and the hardest to shove', () => {
    const auto = deriveHandling(getBike('auto'));
    for (const bike of BIKES) {
      if (bike.id === 'auto') continue;
      const other = deriveHandling(bike);
      expect(auto.steering, bike.id).toBeLessThan(other.steering);
      expect(auto.shoveability, bike.id).toBeLessThan(other.shoveability);
    }
  });

  it('a heavier bike is tougher in a collision', () => {
    expect(deriveHandling(getBike('interceptor')).toughness)
      .toBeGreaterThan(deriveHandling(getBike('splendor')).toughness);
  });

  it('acceleration tracks power-to-weight across the whole roster', () => {
    const ranked = [...BIKES].sort((a, b) => powerToWeight(b) - powerToWeight(a));
    const top = ranked[0];
    const bottom = ranked[ranked.length - 1];
    expect(top && bottom).toBeTruthy();
    if (!top || !bottom) return;
    // Compare acceleration as a fraction of each bike's own top speed, so the
    // comparison is about urgency rather than outright pace.
    const urgency = (id: string) => {
      const h = deriveHandling(getBike(id));
      return h.accel / h.maxSpeed;
    };
    expect(urgency(top.id)).toBeGreaterThan(urgency(bottom.id));
  });

  it('produces stat bars inside 0..1 for every bike', () => {
    for (const bike of BIKES) {
      const bars = statBars(bike, BIKES);
      for (const [key, value] of Object.entries(bars)) {
        expect(Number.isFinite(value), `${bike.id}.${key}`).toBe(true);
        expect(value, `${bike.id}.${key}`).toBeGreaterThanOrEqual(0);
        expect(value, `${bike.id}.${key}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('every derived handling value is finite and sanely signed', () => {
    for (const bike of BIKES) {
      const h = deriveHandling(bike);
      for (const [key, value] of Object.entries(h)) {
        expect(Number.isFinite(value), `${bike.id}.${key}`).toBe(true);
      }
      expect(h.accel).toBeGreaterThan(0);
      expect(h.decel).toBeLessThan(0);
      expect(h.braking).toBeLessThan(0);
      expect(h.offRoadDecel).toBeLessThan(0);
      expect(h.offRoadLimit).toBeGreaterThan(0);
      expect(h.offRoadLimit).toBeLessThan(h.maxSpeed);
    }
  });
});

describe('circuits', () => {
  it('has unique ids and every career entry resolves', () => {
    const ids = CIRCUITS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of CAREER_ORDER) expect(() => getCircuit(id)).not.toThrow();
  });

  it('career order covers the whole roster exactly once', () => {
    expect([...CAREER_ORDER].sort()).toEqual(CIRCUITS.map((c) => c.id).sort());
  });

  it('difficulty rises across the career', () => {
    const first = getCircuit(CAREER_ORDER[0] as string);
    const last = getCircuit(CAREER_ORDER[CAREER_ORDER.length - 1] as string);
    expect(last.difficulty).toBeGreaterThan(first.difficulty);
  });

  it('purse grows with difficulty so the risk is worth taking', () => {
    const byDifficulty = [...CIRCUITS].sort((a, b) => a.difficulty - b.difficulty);
    const easiest = byDifficulty[0];
    const hardest = byDifficulty[byDifficulty.length - 1];
    expect(hardest && easiest).toBeTruthy();
    if (!hardest || !easiest) return;
    expect(hardest.purse).toBeGreaterThan(easiest.purse);
  });

  it('the entry fee is always affordable out of the purse it competes for', () => {
    for (const circuit of CIRCUITS) {
      expect(circuit.entryFee, circuit.id).toBeLessThan(circuit.purse);
    }
  });

  it('every circuit carries a researched location note', () => {
    for (const circuit of CIRCUITS) {
      expect(circuit.note.length, circuit.id).toBeGreaterThan(40);
      expect(circuit.location.length, circuit.id).toBeGreaterThan(5);
    }
  });

  it('every circuit builds into a closed, drivable road', () => {
    for (const circuit of CIRCUITS) {
      const road = buildCircuit(circuit.id);
      expect(road.segments.length, circuit.id).toBeGreaterThan(400);
      // The loop must return to zero elevation or the seam would be a cliff.
      const last = road.segments[road.segments.length - 1];
      expect(Math.abs(last?.p2.world.y ?? 999), circuit.id).toBeLessThan(1);
      // Rumble stripes must align across the seam.
      expect(road.segments.length % 6, circuit.id).toBe(0);
    }
  });

  it('every circuit has checkpoints, in order, inside the track', () => {
    for (const circuit of CIRCUITS) {
      const road = buildCircuit(circuit.id);
      expect(road.checkpoints.length, circuit.id).toBeGreaterThanOrEqual(3);
      for (const index of road.checkpoints) {
        expect(index, circuit.id).toBeGreaterThanOrEqual(0);
        expect(index, circuit.id).toBeLessThan(road.segments.length);
      }
      const sorted = [...road.checkpoints].sort((a, b) => a - b);
      expect(road.checkpoints, circuit.id).toEqual(sorted);
    }
  });

  it('a lap on the slowest legal bike still finishes inside five minutes', () => {
    const slowest = deriveHandling(getBike('splendor')).maxSpeed;
    for (const circuit of CIRCUITS) {
      const road = buildCircuit(circuit.id);
      // Assume a conservative 55% of top speed sustained around a lap.
      const seconds = road.length / (slowest * 0.55);
      expect(seconds, circuit.id).toBeLessThan(300);
      expect(seconds, circuit.id).toBeGreaterThan(20);
    }
  });

  it('narrow sections really are narrower than the default road', () => {
    const road = buildCircuit('chandni-chowk');
    const narrowest = Math.min(...road.segments.map((s) => s.width));
    expect(narrowest).toBeLessThan(0.6);
  });

  it('scenery mixes reference sensible offsets and positive weights', () => {
    for (const circuit of CIRCUITS) {
      expect(circuit.scenery.length, circuit.id).toBeGreaterThan(3);
      for (const prop of circuit.scenery) {
        expect(prop.weight, `${circuit.id}/${prop.id}`).toBeGreaterThan(0);
        expect(prop.maxOffset, `${circuit.id}/${prop.id}`).toBeGreaterThan(prop.minOffset);
      }
      expect(circuit.traffic.length, circuit.id).toBeGreaterThan(2);
    }
  });
});

describe('road geometry', () => {
  it('segments are laid end to end with no gaps', () => {
    const road = buildCircuit('shivajinagar');
    for (let i = 0; i < road.segments.length; i++) {
      const segment = road.segments[i];
      if (!segment) continue;
      expect(segment.p1.world.z).toBe(i * SEGMENT_LENGTH);
      expect(segment.p2.world.z).toBe((i + 1) * SEGMENT_LENGTH);
      // Elevation must be continuous: this segment starts where the last one ended.
      const previous = road.segments[i - 1];
      if (previous) expect(segment.p1.world.y).toBeCloseTo(previous.p2.world.y, 9);
    }
  });

  it('findSegment wraps cleanly in both directions', () => {
    const road = buildCircuit('talao-pali');
    expect(road.findSegment(0).index).toBe(0);
    expect(road.findSegment(road.length).index).toBe(0);
    expect(road.findSegment(road.length + SEGMENT_LENGTH).index).toBe(1);
    expect(road.findSegment(-SEGMENT_LENGTH).index).toBe(road.segments.length - 1);
  });

  it('groundHeight interpolates smoothly between segment ends', () => {
    const road = buildCircuit('yeoor');
    const target = road.segments.find((s) => Math.abs(s.p2.world.y - s.p1.world.y) > 1);
    expect(target).toBeDefined();
    if (!target) return;
    const z0 = target.p1.world.z;
    const mid = road.groundHeight(z0 + SEGMENT_LENGTH / 2);
    const low = Math.min(target.p1.world.y, target.p2.world.y);
    const high = Math.max(target.p1.world.y, target.p2.world.y);
    expect(mid).toBeGreaterThanOrEqual(low - 1e-6);
    expect(mid).toBeLessThanOrEqual(high + 1e-6);
  });

  it('a hairpin circuit really does contain a hairpin', () => {
    const road = buildCircuit('malshej');
    const sharpest = Math.max(...road.segments.map((s) => Math.abs(s.curve)));
    expect(sharpest).toBeGreaterThanOrEqual(6);
  });

  it('speed breakers are placed as hazards, not just bumps', () => {
    const road = buildCircuit('shivajinagar');
    expect(road.segments.some((s) => s.hazard === 'breaker')).toBe(true);
    expect(road.segments.some((s) => s.hazard === 'pothole')).toBe(true);
  });

  it('pothole placement is deterministic — the same circuit twice is identical', () => {
    const a = buildCircuit('yeoor').segments.map((s) => `${s.hazard}:${s.hazardOffset.toFixed(4)}`);
    const b = buildCircuit('yeoor').segments.map((s) => `${s.hazard}:${s.hazardOffset.toFixed(4)}`);
    expect(a).toEqual(b);
  });
});
