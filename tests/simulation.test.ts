import { describe, expect, it } from 'vitest';
import { getBike } from '../src/data/bikes.ts';
import { getCircuit } from '../src/data/circuits.ts';
import { Race } from '../src/game/race.ts';
import { Racer } from '../src/game/racer.ts';
import { beginAttack, isAttackActive, resolveHit, type CombatContext } from '../src/game/combat.ts';
import { knockDown, remount, stepRacer, type Controls } from '../src/game/physics.ts';
import { EventBus, type GameEvents } from '../src/core/events.ts';
import { RoadBuilder, type TrackOp } from '../src/track/road.ts';

const STEP = 1 / 120;

const controls = (over: Partial<Controls> = {}): Controls => ({
  steer: 0, throttle: 0, brake: 0, punch: false, kick: false, boost: false, ...over,
});

const FLAT_ROAD = () => {
  const builder = new RoadBuilder();
  builder.apply({ op: 'straight', n: 200 } as TrackOp);
  return builder.closeLoop().build();
};

const makeContext = (trackLength: number) => {
  const bus = new EventBus<GameEvents>();
  const events: Array<{ type: string; payload: unknown }> = [];
  for (const type of ['impact', 'rider:down'] as const) {
    bus.on(type, (payload) => events.push({ type, payload }));
  }
  let hitstop = 0;
  const ctx: CombatContext = {
    bus, trackLength, cameraX: 0,
    onHitstop: (s) => { hitstop = Math.max(hitstop, s); },
  };
  return { ctx, events, getHitstop: () => hitstop };
};

/** Drive a racer for `seconds` of simulated time. */
const drive = (racer: Racer, road: ReturnType<typeof FLAT_ROAD>, input: Controls, seconds: number) => {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) stepRacer(racer, road, input, STEP);
};

describe('bike physics', () => {
  it('accelerates from a standstill and approaches, but never exceeds, top speed', () => {
    const road = FLAT_ROAD();
    const racer = new Racer(0, 'player', 'T', getBike('pulsar220'));
    racer.reset(0, 0);
    drive(racer, road, controls({ throttle: 1 }), 30);
    expect(racer.speed).toBeGreaterThan(racer.handling.maxSpeed * 0.9);
    expect(racer.speed).toBeLessThanOrEqual(racer.handling.maxSpeed + 1e-6);
  });

  it('the Duke reaches a higher speed than the Splendor over the same run', () => {
    const road = FLAT_ROAD();
    const results = ['duke390', 'splendor'].map((id) => {
      const racer = new Racer(0, 'player', id, getBike(id));
      racer.reset(0, 0);
      drive(racer, road, controls({ throttle: 1 }), 20);
      return racer.speed;
    });
    expect(results[0]).toBeGreaterThan(results[1] as number);
  });

  it('braking sheds speed faster than coasting', () => {
    const road = FLAT_ROAD();
    const make = () => {
      const r = new Racer(0, 'player', 'T', getBike('ns200'));
      r.reset(0, 0);
      drive(r, road, controls({ throttle: 1 }), 20);
      return r;
    };
    const braking = make();
    const coasting = make();
    drive(braking, road, controls({ brake: 1 }), 1);
    drive(coasting, road, controls(), 1);
    expect(braking.speed).toBeLessThan(coasting.speed);
  });

  it('steering right increases lateral position, and only while moving', () => {
    const road = FLAT_ROAD();
    const stationary = new Racer(0, 'player', 'T', getBike('rx100'));
    stationary.reset(0, 0);
    drive(stationary, road, controls({ steer: 1 }), 1);
    expect(Math.abs(stationary.x)).toBeLessThan(0.02);

    const moving = new Racer(0, 'player', 'T', getBike('rx100'));
    moving.reset(0, 0);
    drive(moving, road, controls({ throttle: 1 }), 12);
    const before = moving.x;
    drive(moving, road, controls({ throttle: 1, steer: 1 }), 0.6);
    expect(moving.x).toBeGreaterThan(before);
  });

  it('never leaves the world bounds however hard you steer', () => {
    const road = FLAT_ROAD();
    const racer = new Racer(0, 'player', 'T', getBike('rx100'));
    racer.reset(0, 0);
    drive(racer, road, controls({ throttle: 1, steer: 1 }), 40);
    expect(Math.abs(racer.x)).toBeLessThanOrEqual(2.6);
    expect(Number.isFinite(racer.x)).toBe(true);
  });

  it('going off the tarmac costs speed but leaves you able to limp back', () => {
    const road = FLAT_ROAD();
    const racer = new Racer(0, 'player', 'T', getBike('classic350'));
    racer.reset(0, 0);
    drive(racer, road, controls({ throttle: 1 }), 20);
    const onRoad = racer.speed;
    racer.x = 1.6;
    drive(racer, road, controls({ throttle: 1 }), 3);
    expect(racer.speed).toBeLessThan(onRoad);
    expect(racer.speed).toBeGreaterThan(0);
  });

  it('a downed rider slows to a crawl and gets back up', () => {
    const road = FLAT_ROAD();
    const racer = new Racer(0, 'player', 'T', getBike('jawa42'));
    racer.reset(0, 0);
    drive(racer, road, controls({ throttle: 1 }), 15);
    knockDown(racer, 1.5);
    expect(racer.isDown).toBe(true);
    drive(racer, road, controls({ throttle: 1 }), 1.6);
    expect(racer.isDown).toBe(false);
    remount(racer);
    expect(racer.speed).toBeGreaterThan(0);
    expect(Math.abs(racer.x)).toBeLessThanOrEqual(0.8);
  });

  it('a boost raises the ceiling above the normal top speed, then expires', () => {
    const road = FLAT_ROAD();
    const racer = new Racer(0, 'player', 'T', getBike('apache200'));
    racer.reset(0, 0);
    drive(racer, road, controls({ throttle: 1 }), 25);
    const flatOut = racer.speed;
    drive(racer, road, controls({ throttle: 1, boost: true }), 1.2);
    expect(racer.speed).toBeGreaterThan(flatOut);
    drive(racer, road, controls({ throttle: 1 }), 5);
    expect(racer.speed).toBeLessThanOrEqual(racer.handling.maxSpeed + 1e-6);
  });

  it('the three-wheeler builds tilt through a turn and the two-wheelers do not', () => {
    const road = FLAT_ROAD();
    const auto = new Racer(0, 'player', 'auto', getBike('auto'));
    auto.reset(0, 0);
    drive(auto, road, controls({ throttle: 1 }), 20);
    drive(auto, road, controls({ throttle: 1, steer: 1 }), 1.5);
    expect(auto.tilt).toBeGreaterThan(0.1);

    const bike = new Racer(0, 'player', 'bike', getBike('ns200'));
    bike.reset(0, 0);
    drive(bike, road, controls({ throttle: 1 }), 20);
    drive(bike, road, controls({ throttle: 1, steer: 1 }), 1.5);
    expect(bike.tilt).toBe(0);
  });

  it('produces no NaN across a long, violent run', () => {
    const road = FLAT_ROAD();
    const racer = new Racer(0, 'player', 'T', getBike('rd350'));
    racer.reset(0, 0);
    for (let i = 0; i < 6000; i++) {
      stepRacer(racer, road, controls({
        throttle: i % 3 === 0 ? 1 : 0,
        brake: i % 17 === 0 ? 1 : 0,
        steer: Math.sin(i / 30),
        boost: i % 400 === 0,
      }), STEP);
    }
    for (const value of [racer.x, racer.z, racer.speed, racer.lean, racer.y, racer.bikeDamage]) {
      expect(Number.isNaN(value)).toBe(false);
    }
  });
});

describe('combat', () => {
  const setup = () => {
    const road = FLAT_ROAD();
    const attacker = new Racer(0, 'player', 'A', getBike('classic350'));
    const victim = new Racer(1, 'rival', 'B', getBike('rx100'));
    attacker.reset(1000, -0.2);
    victim.reset(1050, 0.05);
    attacker.speed = attacker.handling.maxSpeed * 0.7;
    victim.speed = victim.handling.maxSpeed * 0.7;
    return { road, attacker, victim, ...makeContext(road.length) };
  };

  it('a swing that connects costs the victim health and emits an impact', () => {
    const { attacker, victim, ctx, events } = setup();
    expect(beginAttack(attacker, 'kick', 1)).toBe(true);
    attacker.attack!.elapsed = 0.2;
    expect(isAttackActive(attacker)).toBe(true);
    const outcome = resolveHit(attacker, victim, ctx);
    expect(outcome.hit).toBe(true);
    expect(victim.riderHealth).toBeLessThan(100);
    expect(events.some((e) => e.type === 'impact')).toBe(true);
  });

  it('one swing can only land once', () => {
    const { attacker, victim, ctx } = setup();
    beginAttack(attacker, 'kick', 1);
    attacker.attack!.elapsed = 0.2;
    expect(resolveHit(attacker, victim, ctx).hit).toBe(true);
    expect(resolveHit(attacker, victim, ctx).hit).toBe(false);
  });

  it('misses when the victim is out of reach', () => {
    const { attacker, victim, ctx } = setup();
    victim.x = 2.2;
    beginAttack(attacker, 'kick', 1);
    attacker.attack!.elapsed = 0.2;
    expect(resolveHit(attacker, victim, ctx).hit).toBe(false);
    expect(victim.riderHealth).toBe(100);
  });

  it('misses when swinging away from the target', () => {
    const { attacker, victim, ctx } = setup();
    beginAttack(attacker, 'kick', -1);
    attacker.attack!.elapsed = 0.2;
    expect(resolveHit(attacker, victim, ctx).hit).toBe(false);
  });

  it('cannot hit somebody far behind you', () => {
    const { attacker, victim, ctx } = setup();
    victim.z = attacker.z - 900;
    beginAttack(attacker, 'kick', 1);
    attacker.attack!.elapsed = 0.2;
    expect(resolveHit(attacker, victim, ctx).hit).toBe(false);
  });

  it('a kick does more damage and more shove than a punch', () => {
    const punch = setup();
    beginAttack(punch.attacker, 'punch', 1);
    punch.attacker.attack!.elapsed = 0.1;
    const punchResult = resolveHit(punch.attacker, punch.victim, punch.ctx);

    const kick = setup();
    beginAttack(kick.attacker, 'kick', 1);
    kick.attacker.attack!.elapsed = 0.2;
    const kickResult = resolveHit(kick.attacker, kick.victim, kick.ctx);

    expect(kickResult.damage).toBeGreaterThan(punchResult.damage);
    expect(Math.abs(kick.victim.x)).toBeGreaterThan(Math.abs(punch.victim.x));
  });

  it('stamina gates spam: you cannot throw kicks forever', () => {
    const { attacker } = setup();
    let landed = 0;
    for (let i = 0; i < 12; i++) {
      if (beginAttack(attacker, 'kick', 1)) landed++;
      attacker.attack = null;
    }
    expect(landed).toBeGreaterThan(2);
    expect(landed).toBeLessThan(12);
    expect(attacker.stamina).toBeLessThan(30);
  });

  it('a blocked swing hurts nobody', () => {
    const { attacker, victim, ctx } = setup();
    beginAttack(attacker, 'kick', 1);
    attacker.attack!.elapsed = 0.2;
    beginAttack(victim, 'punch', -1);
    const outcome = resolveHit(attacker, victim, ctx);
    expect(outcome.hit).toBe(true);
    expect(outcome.damage).toBe(0);
    expect(victim.riderHealth).toBe(100);
  });

  it('enough damage puts a rider on the tarmac and drops their weapon to the winner', () => {
    const { attacker, victim, ctx, events } = setup();
    victim.riderHealth = 20;
    victim.weapon = 'chain';
    victim.weaponUses = 5;
    beginAttack(attacker, 'kick', 1);
    attacker.attack!.elapsed = 0.2;
    const outcome = resolveHit(attacker, victim, ctx);
    expect(outcome.knockedDown).toBe(true);
    expect(victim.isDown).toBe(true);
    expect(attacker.weapon).toBe('chain');
    expect(events.some((e) => e.type === 'rider:down')).toBe(true);
  });

  it('a landed hit produces hitstop, so impacts have weight', () => {
    const { attacker, victim, ctx, getHitstop } = setup();
    beginAttack(attacker, 'kick', 1);
    attacker.attack!.elapsed = 0.2;
    resolveHit(attacker, victim, ctx);
    expect(getHitstop()).toBeGreaterThan(0);
  });

  it('a downed rider cannot start a swing', () => {
    const { attacker } = setup();
    knockDown(attacker, 2);
    expect(beginAttack(attacker, 'punch', 1)).toBe(false);
  });
});

describe('a whole race, simulated headlessly', () => {
  /**
   * A competent-player bot: full throttle, holds a line, and steers around the
   * nearest vehicle it is closing on. Not skilled — just not blind.
   */
  const competentSteer = (race: Race): number => {
    let nearest: { dz: number; x: number; width: number } | null = null;
    for (const vehicle of race.traffic.vehicles) {
      if (!vehicle.active) continue;
      const dz = vehicle.z - race.player.z;
      const wrapped = dz < -race.road.length / 2 ? dz + race.road.length : dz;
      if (wrapped < 0 || wrapped > 9000) continue;
      // Oncoming traffic closes at the sum of both speeds, so treat it as much
      // nearer than the raw gap suggests — exactly as the rival AI does.
      const urgency = vehicle.oncoming ? wrapped * 0.5 : wrapped;
      if (!nearest || urgency < nearest.dz) {
        nearest = { dz: urgency, x: vehicle.x, width: vehicle.spec.width };
      }
    }
    if (nearest && Math.abs(nearest.x - race.player.x) < nearest.width + 0.35) {
      // Go around whichever side has more road.
      const away = nearest.x > 0 ? -1 : 1;
      const target = clampTo(nearest.x + away * (nearest.width + 0.5), -0.9, 0.9);
      return clampTo((target - race.player.x) * 3, -1, 1);
    }
    // Default to the left of centre: the opposing lane is not yours.
    return clampTo((0.25 - race.player.x) * 2.5, -1, 1);
  };

  const clampTo = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const runRace = (circuitId: string, bikeId: string, maxSeconds = 400, dodge = true) => {
    const race = new Race({
      circuit: getCircuit(circuitId),
      playerBike: getBike(bikeId),
      rivalCount: 5,
      seed: 'deterministic-test',
    });
    const finishes: Array<{ position: number; cash: number }> = [];
    race.bus.on('race:finish', (p) => finishes.push({ position: p.position, cash: p.cash }));
    race.start();

    const steps = Math.round(maxSeconds / STEP);
    for (let i = 0; i < steps && !race.finished; i++) {
      race.update(STEP, controls({
        throttle: 1,
        steer: dodge ? competentSteer(race) : clampTo(-race.player.x * 2.5, -1, 1),
        kick: i % 260 === 0,
      }));
    }
    return { race, finishes };
  };

  it('reaches the flag on a short circuit and pays out', () => {
    const { race, finishes } = runRace('talao-pali', 'ns200');
    expect(race.phase).toBe('finished');
    expect(race.player.lap).toBe(race.laps);
    expect(finishes.length).toBe(1);
    expect(finishes[0]?.position).toBeGreaterThanOrEqual(1);
    expect(finishes[0]?.position).toBeLessThanOrEqual(6);
  });

  it('a rider who never dodges anything eventually wrecks — traffic has teeth', () => {
    const { race } = runRace('ghodbunder', 'ns200', 400, false);
    expect(race.finished).toBe(true);
    expect(race.player.bikeDamage).toBeGreaterThan(30);
  });

  it('is deterministic: the same seed produces the same finishing time', () => {
    const a = runRace('shivajinagar', 'pulsar220');
    const b = runRace('shivajinagar', 'pulsar220');
    expect(a.race.elapsed).toBeCloseTo(b.race.elapsed, 6);
    expect(a.race.player.distance).toBeCloseTo(b.race.player.distance, 3);
  });

  it('does not softlock on the hardest circuit', () => {
    const { race } = runRace('malshej', 'duke390', 500);
    expect(race.finished).toBe(true);
  });

  it('rivals actually race — they cover ground and hold positions', () => {
    const { race } = runRace('talao-pali', 'ns200');
    const rivals = race.racers.filter((r) => r.kind === 'rival');
    expect(rivals.length).toBe(5);
    for (const rival of rivals) {
      expect(rival.distance, rival.name).toBeGreaterThan(race.road.length * 0.5);
    }
    const places = race.racers.map((r) => r.place).sort((a, b) => a - b);
    expect(places).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('nobody ends up with NaN or an impossible position', () => {
    const { race } = runRace('yeoor', 'roadster', 500);
    for (const racer of race.racers) {
      for (const value of [racer.x, racer.z, racer.speed, racer.distance]) {
        expect(Number.isFinite(value), racer.name).toBe(true);
      }
      expect(Math.abs(racer.x), racer.name).toBeLessThanOrEqual(2.6);
      expect(racer.bikeDamage).toBeGreaterThanOrEqual(0);
      expect(racer.bikeDamage).toBeLessThanOrEqual(100);
      expect(racer.riderHealth).toBeGreaterThanOrEqual(0);
    }
  });

  it('the countdown runs before anybody is allowed to move', () => {
    const race = new Race({ circuit: getCircuit('talao-pali'), playerBike: getBike('rx100') });
    race.start();
    expect(race.phase).toBe('countdown');
    const startZ = race.player.z;
    for (let i = 0; i < 60; i++) race.update(STEP, controls({ throttle: 1 }));
    expect(race.player.z).toBe(startZ);
    for (let i = 0; i < 500; i++) race.update(STEP, controls({ throttle: 1 }));
    expect(race.phase).toBe('racing');
    expect(race.player.z).not.toBe(startZ);
  });

  it('hitstop freezes the world rather than skipping it', () => {
    const race = new Race({ circuit: getCircuit('talao-pali'), playerBike: getBike('rx100') });
    race.start();
    for (let i = 0; i < 500; i++) race.update(STEP, controls({ throttle: 1 }));
    const z = race.player.z;
    race.hitstop = 0.1;
    race.update(STEP, controls({ throttle: 1 }));
    expect(race.player.z).toBe(z);
  });

  it('a first place pays more than a fourth', () => {
    const race = new Race({ circuit: getCircuit('marine-drive'), playerBike: getBike('duke390') });
    expect(race.prizeFor(1)).toBeGreaterThan(race.prizeFor(2));
    expect(race.prizeFor(2)).toBeGreaterThan(race.prizeFor(4));
    expect(race.prizeFor(99)).toBe(0);
  });

  it('a race can be reset and re-run from the grid', () => {
    const { race } = runRace('talao-pali', 'ns200');
    race.reset();
    expect(race.phase).toBe('grid');
    expect(race.elapsed).toBe(0);
    expect(race.player.lap).toBe(0);
    expect(race.player.riderHealth).toBe(100);
    for (const racer of race.racers) expect(racer.finished).toBe(false);
  });
});
