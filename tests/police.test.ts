import { describe, expect, it } from 'vitest';
import { getBike } from '../src/data/bikes.ts';
import { getCircuit } from '../src/data/circuits.ts';
import { Race } from '../src/game/race.ts';
import type { Controls } from '../src/game/physics.ts';

const STEP = 1 / 120;
const controls = (over: Partial<Controls> = {}): Controls => ({
  steer: 0, throttle: 0, brake: 0, punch: false, kick: false, boost: false, ...over,
});

const run = (race: Race, seconds: number) => {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps && !race.finished; i++) {
    race.update(STEP, controls({ throttle: 1, steer: -race.player.x * 2 }));
  }
};

describe('the police', () => {
  const make = (policeEnabled: boolean) => new Race({
    circuit: getCircuit('ghodbunder'),
    playerBike: getBike('duke390'),
    rivalCount: 3,
    seed: 'police-test',
    policeEnabled,
  });

  it('take an interest when you ride flat out for long enough', () => {
    const race = make(true);
    const spotted: number[] = [];
    race.bus.on('cop:spotted', ({ level }) => spotted.push(level));
    race.start();
    run(race, 60);
    expect(race.police.heat).toBeGreaterThan(0);
    expect(spotted.length).toBeGreaterThan(0);
  });

  it('stay away entirely when the race disables them', () => {
    const race = make(false);
    const spotted: number[] = [];
    race.bus.on('cop:spotted', ({ level }) => spotted.push(level));
    race.start();
    run(race, 60);
    // The campaign runs its own hunters; traffic police must never appear.
    expect(race.police.heat).toBe(0);
    expect(race.police.level).toBe(0);
    expect(spotted).toEqual([]);
    expect(race.snapshot().policeLevel).toBe(0);
  });

  it('never exceed the maximum level', () => {
    const race = make(true);
    race.start();
    for (let i = 0; i < 200; i++) race.police.provoke(100);
    race.update(STEP, controls({ throttle: 1 }));
    expect(race.police.level).toBeLessThanOrEqual(3);
    expect(race.police.heat).toBeLessThanOrEqual(100);
  });

  it('cool off when you stop giving them a reason', () => {
    const race = make(true);
    race.start();
    race.police.provoke(90);
    const hot = race.police.heat;
    // Idle: no throttle, no speed.
    for (let i = 0; i < 1200; i++) race.police.update(STEP, 0);
    expect(race.police.heat).toBeLessThan(hot);
  });

  it('reset with the race', () => {
    const race = make(true);
    race.start();
    race.police.provoke(80);
    race.reset();
    expect(race.police.heat).toBe(0);
    expect(race.police.level).toBe(0);
  });
});

describe('campaign races', () => {
  it('run in the auto rickshaw at its real top speed and still finish', () => {
    const circuit = getCircuit('shivajinagar');
    const race = new Race({
      circuit: { ...circuit, laps: 1 },
      playerBike: getBike('auto'),
      rivalCount: 3,
      seed: 'campaign-test',
      policeEnabled: false,
    });
    race.start();
    run(race, 400);
    expect(race.finished).toBe(true);
    // 65 km/h is 4,333 simulation units; it must never out-run a motorcycle.
    expect(race.player.speed).toBeLessThanOrEqual(race.player.handling.maxSpeed + 1e-6);
    expect(race.player.handling.maxSpeed).toBeLessThan(4500);
  });
});
