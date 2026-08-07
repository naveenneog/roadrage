import { describe, expect, it } from 'vitest';
import { MOODS, RAGAS, type RagaName } from '../src/audio/music.ts';
import { BIKES, getBike } from '../src/data/bikes.ts';

/**
 * The audio graph itself needs a browser, but the musical and physical facts it
 * is built on are plain data — and those are exactly the things that would be
 * wrong if they were half-remembered rather than researched.
 */

describe('raga scale degrees', () => {
  it('every scale starts on the tonic and stays inside one octave', () => {
    for (const [name, degrees] of Object.entries(RAGAS)) {
      expect(degrees[0], name).toBe(0);
      for (const degree of degrees) {
        expect(degree, name).toBeGreaterThanOrEqual(0);
        expect(degree, name).toBeLessThan(12);
      }
    }
  });

  it('every scale ascends strictly, with no repeated degrees', () => {
    for (const [name, degrees] of Object.entries(RAGAS)) {
      for (let i = 1; i < degrees.length; i++) {
        expect(degrees[i], `${name}[${i}]`).toBeGreaterThan(degrees[i - 1] as number);
      }
    }
  });

  it('matches the standard Hindustani listings', () => {
    // These are the researched interval patterns; getting one wrong would make
    // the soundtrack merely "vaguely eastern" instead of actually modal.
    expect(RAGAS.malkauns).toEqual([0, 3, 5, 8, 10]);
    expect(RAGAS.bhairav).toEqual([0, 1, 4, 5, 7, 8, 11]);
    expect(RAGAS.darbari).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(RAGAS.todi).toEqual([0, 1, 3, 6, 7, 8, 11]);
    expect(RAGAS.kirwani).toEqual([0, 2, 4, 5, 7, 9, 10]);
    expect(RAGAS.bhairavi).toEqual([0, 1, 3, 5, 7, 8, 10]);
    expect(RAGAS.charukeshi).toEqual([0, 2, 4, 5, 7, 8, 10]);
    expect(RAGAS.bhoopali).toEqual([0, 2, 4, 7, 9]);
  });

  it('the pentatonic ragas really are five notes', () => {
    expect(RAGAS.malkauns.length).toBe(5);
    expect(RAGAS.bhoopali.length).toBe(5);
  });

  it('Malkauns has no major third and no fifth — that is why it is dark', () => {
    expect(RAGAS.malkauns).not.toContain(4);
    expect(RAGAS.malkauns).not.toContain(7);
    expect(RAGAS.malkauns).toContain(3);
    expect(RAGAS.malkauns).toContain(8);
  });

  it('Bhairav is the double harmonic: a flat second against a major third', () => {
    expect(RAGAS.bhairav).toContain(1);
    expect(RAGAS.bhairav).toContain(4);
    expect(RAGAS.bhairav).toContain(11);
  });

  it('Todi contains the tritone that makes it sound threatening', () => {
    expect(RAGAS.todi).toContain(6);
    expect(RAGAS.todi).toContain(1);
  });
});

describe('musical moods', () => {
  it('every mood names a raga that exists', () => {
    for (const [name, mood] of Object.entries(MOODS)) {
      expect(RAGAS[mood.raga as RagaName], name).toBeDefined();
    }
  });

  it('every mood has a playable tempo, theka and root', () => {
    for (const [name, mood] of Object.entries(MOODS)) {
      expect(mood.bpm, name).toBeGreaterThan(60);
      expect(mood.bpm, name).toBeLessThan(220);
      expect(mood.root, name).toBeGreaterThan(40);
      expect(mood.theka.length, name).toBeGreaterThanOrEqual(6);
      expect(mood.drive, name).toBeGreaterThanOrEqual(0);
      expect(mood.drive, name).toBeLessThanOrEqual(1);
    }
  });

  it('every theka starts on a stressed sam and contains dry strokes', () => {
    for (const [name, mood] of Object.entries(MOODS)) {
      expect(mood.theka[0], name).toBeGreaterThan(0.5);
      expect(mood.theka.some((beat) => beat < 0.7), name).toBe(true);
    }
  });

  it('the chase is faster and dirtier than the menu', () => {
    const menu = MOODS.menu;
    const chase = MOODS.chase;
    expect(menu && chase).toBeTruthy();
    if (!menu || !chase) return;
    expect(chase.bpm).toBeGreaterThan(menu.bpm);
    expect(chase.drive).toBeGreaterThan(menu.drive);
    expect(chase.intensity).toBeGreaterThan(menu.intensity);
  });

  it('the heavy moods use the dark ragas', () => {
    expect(MOODS.race?.raga).toBe('malkauns');
    expect(MOODS.hard?.raga).toBe('todi');
    expect(MOODS.thriller?.raga).toBe('darbari');
  });
});

describe('engine voices', () => {
  it('every bike declares a complete, sane voice', () => {
    for (const bike of BIKES) {
      const v = bike.voice;
      expect([2, 4], bike.id).toContain(v.stroke);
      expect(v.firingOrder, bike.id).toBeGreaterThanOrEqual(1);
      expect(v.idleRpm, bike.id).toBeGreaterThan(500);
      expect(v.redlineRpm, bike.id).toBeGreaterThan(v.idleRpm);
      for (const key of ['thump', 'ring', 'induction', 'rasp', 'loudness'] as const) {
        expect(v[key], `${bike.id}.${key}`).toBeGreaterThanOrEqual(0);
        expect(v[key], `${bike.id}.${key}`).toBeLessThanOrEqual(1);
      }
      expect(v.crankOffset, bike.id).toBeGreaterThanOrEqual(0);
      expect(v.crankOffset, bike.id).toBeLessThan(1);
    }
  });

  it('a two-stroke fires twice as often as a four-stroke at the same rpm', () => {
    const firingHz = (rpm: number, stroke: 2 | 4) =>
      stroke === 2 ? rpm / 60 : rpm / 120;
    expect(firingHz(6000, 2)).toBe(100);
    expect(firingHz(6000, 4)).toBe(50);
  });

  it('the Bullet at idle is a countable pulse, which is why it thumps', () => {
    const enfield = getBike('classic350');
    const hz = enfield.voice.idleRpm / 120;
    expect(enfield.voice.stroke).toBe(4);
    // Under about twelve pulses a second the ear hears individual beats.
    expect(hz).toBeLessThan(12);
    expect(enfield.voice.thump).toBeGreaterThan(0.85);
  });

  it('the two-strokes carry the ring and the four-stroke singles do not', () => {
    expect(getBike('rx100').voice.ring).toBeGreaterThan(0.8);
    expect(getBike('rd350').voice.ring).toBeGreaterThan(0.8);
    expect(getBike('classic350').voice.ring).toBeLessThan(0.1);
    expect(getBike('interceptor').voice.ring).toBeLessThan(0.1);
  });

  it('the 650 twin has two cylinders on an uneven crank', () => {
    const twin = getBike('interceptor').voice;
    expect(twin.firingOrder).toBe(2);
    // 270 degrees of 360 is three quarters of a revolution.
    expect(twin.crankOffset).toBeCloseTo(0.75, 5);
  });

  it('the RD350 twin fires evenly, unlike the 270-degree 650', () => {
    expect(getBike('rd350').voice.crankOffset).toBeCloseTo(0.5, 5);
  });

  it('bigger engines are louder', () => {
    expect(getBike('interceptor').voice.loudness)
      .toBeGreaterThan(getBike('splendor').voice.loudness);
    expect(getBike('duke390').voice.loudness)
      .toBeGreaterThan(getBike('rx100').voice.loudness);
  });

  it('redlines match the character of the engine', () => {
    // A long-stroke 350 single runs out of revs long before a liquid-cooled 200.
    expect(getBike('classic350').voice.redlineRpm)
      .toBeLessThan(getBike('ns200').voice.redlineRpm);
    expect(getBike('auto').voice.redlineRpm).toBeLessThan(6000);
  });
});
