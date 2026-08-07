import { describe, expect, it } from 'vitest';
import {
  approach, clamp, damp, easeIn, easeInOut, easeOut, formatTime, increase, kmhToUnits, lerp,
  loopDelta, ordinal, overlap, percentRemaining, remap, sign, smoothstep, toKmh,
} from '../src/core/math.ts';

describe('clamp', () => {
  it('passes values inside the range through untouched', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('clamps to both bounds', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('lerp / easing', () => {
  it('lerp hits both endpoints exactly', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(10, 20, 0.5)).toBe(15);
  });

  it('easeIn starts slow — half way through time is a quarter of the distance', () => {
    expect(easeIn(0, 100, 0.5)).toBe(25);
  });

  it('easeOut starts fast — half way through time is three quarters of the distance', () => {
    expect(easeOut(0, 100, 0.5)).toBe(75);
  });

  it('easeInOut is symmetric about the midpoint', () => {
    expect(easeInOut(0, 100, 0.5)).toBeCloseTo(50, 6);
    const early = easeInOut(0, 100, 0.25);
    const late = easeInOut(0, 100, 0.75);
    expect(early + late).toBeCloseTo(100, 6);
  });

  it('all easings are monotonic across the interval', () => {
    for (const ease of [easeIn, easeOut, easeInOut]) {
      let previous = ease(0, 100, 0);
      for (let t = 0.05; t <= 1.0001; t += 0.05) {
        const current = ease(0, 100, t);
        expect(current).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = current;
      }
    }
  });
});

describe('damp', () => {
  it('halves the remaining distance every half-life', () => {
    expect(damp(100, 0, 1, 1)).toBeCloseTo(50, 6);
    expect(damp(100, 0, 1, 2)).toBeCloseTo(25, 6);
  });

  it('is framerate independent: two half-steps equal one whole step', () => {
    const oneBigStep = damp(100, 0, 0.5, 0.2);
    let split = 100;
    split = damp(split, 0, 0.5, 0.1);
    split = damp(split, 0, 0.5, 0.1);
    expect(split).toBeCloseTo(oneBigStep, 9);
  });

  it('snaps to the target when the half-life is zero', () => {
    expect(damp(100, 7, 0, 0.016)).toBe(7);
  });
});

describe('percentRemaining', () => {
  it('reports the fraction through the current bucket', () => {
    expect(percentRemaining(250, 200)).toBeCloseTo(0.25, 6);
    expect(percentRemaining(200, 200)).toBe(0);
  });
});

describe('increase', () => {
  it('wraps forward past the maximum', () => {
    expect(increase(90, 20, 100)).toBe(10);
  });
  it('wraps backward below zero rather than returning a negative', () => {
    expect(increase(10, -20, 100)).toBe(90);
  });
  it('handles increments larger than a full loop', () => {
    expect(increase(0, 250, 100)).toBeCloseTo(50, 6);
  });
});

describe('loopDelta', () => {
  it('takes the short way round the loop', () => {
    expect(loopDelta(10, 90, 100)).toBe(-20);
    expect(loopDelta(90, 10, 100)).toBe(20);
  });
  it('is zero for identical positions', () => {
    expect(loopDelta(42, 42, 100)).toBe(0);
  });
});

describe('overlap', () => {
  it('detects touching spans and rejects separated ones', () => {
    expect(overlap(0, 10, 5, 10)).toBe(true);
    expect(overlap(0, 10, 50, 10)).toBe(false);
  });
  it('tolerance below 1 shrinks the boxes, so glancing passes stop colliding', () => {
    expect(overlap(0, 10, 9, 10, 1)).toBe(true);
    expect(overlap(0, 10, 9, 10, 0.5)).toBe(false);
  });
});

describe('remap', () => {
  it('maps across ranges and clamps beyond them', () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
    expect(remap(-5, 0, 10, 0, 100)).toBe(0);
    expect(remap(15, 0, 10, 0, 100)).toBe(100);
  });
  it('supports inverted output ranges', () => {
    expect(remap(0, 0, 10, 100, 0)).toBe(100);
    expect(remap(10, 0, 10, 100, 0)).toBe(0);
  });
  it('does not divide by zero on a degenerate input range', () => {
    expect(remap(5, 3, 3, 0, 100)).toBe(0);
  });
});

describe('smoothstep', () => {
  it('is flat outside the edges and 0.5 in the middle', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
});

describe('sign and approach', () => {
  it('sign returns 0 only at 0', () => {
    expect(sign(-3)).toBe(-1);
    expect(sign(0)).toBe(0);
    expect(sign(3)).toBe(1);
  });
  it('approach never overshoots the target', () => {
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(10, 0, 3)).toBe(7);
  });
});

describe('presentation helpers', () => {
  it('toKmh converts simulation units into a believable road speed', () => {
    expect(toKmh(0)).toBe(0);
    expect(toKmh(8000)).toBe(120);
  });

  it('kmhToUnits round-trips with toKmh', () => {
    for (const kmh of [65, 87, 120, 136, 170]) {
      expect(toKmh(kmhToUnits(kmh))).toBe(kmh);
    }
  });

  it('formatTime pads to m:ss.cc and never goes negative', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(65.5)).toBe('1:05.50');
    expect(formatTime(-3)).toBe('0:00.00');
  });

  it('ordinal handles the teens correctly', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(21)).toBe('21st');
  });
});
