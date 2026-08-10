import { describe, expect, it } from 'vitest';
import { getBike } from '../src/data/bikes.ts';
import { getCircuit } from '../src/data/circuits.ts';
import { EventBus, type GameEvents } from '../src/core/events.ts';
import { Race } from '../src/game/race.ts';
import type { Controls } from '../src/game/physics.ts';
import {
  ATTACKS, Racer, attackPhase, attackPhaseProgress,
} from '../src/game/racer.ts';
import {
  beginAttack, detectWhiff, isAttackActive, resolveHit, type CombatContext,
} from '../src/game/combat.ts';

const STEP = 1 / 120;

const controls = (over: Partial<Controls> = {}): Controls => ({
  steer: 0, throttle: 0, brake: 0, punch: false, kick: false, boost: false, ...over,
});

const makeRacer = (bikeId = 'duke390', kind: 'player' | 'rival' = 'rival'): Racer =>
  new Racer(0, kind, `T${kind}`, getBike(bikeId));

const makeCtx = (bus: EventBus<GameEvents>): CombatContext => ({
  bus,
  trackLength: 100_000,
  cameraX: 0,
  onHitstop: () => {},
});

/** Advance a swing by hand, the way physics.stepRacer does. */
const advance = (racer: Racer, seconds: number): void => {
  const swing = racer.attack;
  if (!swing) return;
  swing.elapsed += seconds;
};

describe('attack phases', () => {
  // The renderer picks a pose from these, so the boundaries are load-bearing:
  // a swing that reports "strike" during its wind-up has no anticipation and
  // reads as a decal being switched on.
  it('runs windup then strike then recover, in that order', () => {
    const racer = makeRacer();
    expect(attackPhase(racer)).toBeNull();

    beginAttack(racer, 'kick', 1);
    const p = ATTACKS.kick;
    expect(attackPhase(racer)).toBe('windup');

    advance(racer, p.windup * 0.99);
    expect(attackPhase(racer)).toBe('windup');

    advance(racer, p.windup * 0.02 + p.active * 0.5);
    expect(attackPhase(racer)).toBe('strike');

    advance(racer, p.active);
    expect(attackPhase(racer)).toBe('recover');
  });

  it('only connects during the strike window', () => {
    const racer = makeRacer();
    beginAttack(racer, 'punch', 1);
    const p = ATTACKS.punch;

    expect(isAttackActive(racer)).toBe(false);
    advance(racer, p.windup + p.active * 0.5);
    expect(isAttackActive(racer)).toBe(true);
    advance(racer, p.active);
    expect(isAttackActive(racer)).toBe(false);
  });

  it('reports phase progress inside 0..1 throughout the swing', () => {
    const racer = makeRacer();
    beginAttack(racer, 'kick', 1);
    for (let i = 0; i < 40; i++) {
      const t = attackPhaseProgress(racer);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
      advance(racer, 0.01);
    }
  });
});

describe('starting a swing', () => {
  it('refuses when winded and says why', () => {
    const bus = new EventBus<GameEvents>();
    const denied: string[] = [];
    bus.on('attack:denied', ({ reason }) => denied.push(reason));

    const racer = makeRacer('duke390', 'player');
    racer.stamina = ATTACKS.kick.stamina - 1;
    expect(beginAttack(racer, 'kick', 1, bus)).toBe(false);
    expect(denied).toEqual(['winded']);
    expect(racer.attack).toBeNull();
  });

  it('refuses while already swinging', () => {
    const bus = new EventBus<GameEvents>();
    const denied: string[] = [];
    bus.on('attack:denied', ({ reason }) => denied.push(reason));

    const racer = makeRacer();
    expect(beginAttack(racer, 'punch', 1, bus)).toBe(true);
    expect(beginAttack(racer, 'punch', 1, bus)).toBe(false);
    expect(denied).toEqual(['busy']);
  });

  it('spends stamina, so mashing is not free', () => {
    const racer = makeRacer();
    const before = racer.stamina;
    beginAttack(racer, 'kick', 1);
    expect(racer.stamina).toBe(before - ATTACKS.kick.stamina);
  });
});

describe('missing', () => {
  it('announces a whiff exactly once, and only after the active frames', () => {
    const bus = new EventBus<GameEvents>();
    const ctx = makeCtx(bus);
    const whiffs: string[] = [];
    bus.on('attack:whiff', ({ kind }) => whiffs.push(kind));

    const racer = makeRacer();
    beginAttack(racer, 'punch', 1);
    const p = ATTACKS.punch;

    // Still winding up, then still swinging: nothing to report yet.
    detectWhiff(racer, ctx);
    advance(racer, p.windup + p.active * 0.5);
    detectWhiff(racer, ctx);
    expect(whiffs).toEqual([]);

    advance(racer, p.active);
    detectWhiff(racer, ctx);
    detectWhiff(racer, ctx);
    detectWhiff(racer, ctx);
    expect(whiffs).toEqual(['punch']);
  });

  it('stays silent when the swing actually landed', () => {
    const bus = new EventBus<GameEvents>();
    const ctx = makeCtx(bus);
    const whiffs: string[] = [];
    bus.on('attack:whiff', () => whiffs.push('x'));

    const attacker = makeRacer();
    const victim = makeRacer();
    victim.x = attacker.x + 0.1;
    victim.z = attacker.z + 40;

    beginAttack(attacker, 'punch', 1);
    advance(attacker, ATTACKS.punch.windup + ATTACKS.punch.active * 0.5);
    expect(resolveHit(attacker, victim, ctx).hit).toBe(true);

    advance(attacker, ATTACKS.punch.active);
    detectWhiff(attacker, ctx);
    expect(whiffs).toEqual([]);
  });
});

describe('landing a hit', () => {
  it('costs the victim condition and shoves them sideways', () => {
    const bus = new EventBus<GameEvents>();
    const ctx = makeCtx(bus);
    const attacker = makeRacer();
    const victim = makeRacer();
    victim.x = attacker.x + 0.12;
    victim.z = attacker.z + 40;
    const healthBefore = victim.riderHealth;
    const xBefore = victim.x;

    beginAttack(attacker, 'kick', 1);
    advance(attacker, ATTACKS.kick.windup + ATTACKS.kick.active * 0.5);
    const out = resolveHit(attacker, victim, ctx);

    expect(out.hit).toBe(true);
    expect(victim.riderHealth).toBeLessThan(healthBefore);
    expect(victim.x).toBeGreaterThan(xBefore);
  });

  it('lands at most once per swing', () => {
    const bus = new EventBus<GameEvents>();
    const ctx = makeCtx(bus);
    const attacker = makeRacer();
    const victim = makeRacer();
    victim.x = attacker.x + 0.1;
    victim.z = attacker.z + 40;

    beginAttack(attacker, 'punch', 1);
    advance(attacker, ATTACKS.punch.windup + ATTACKS.punch.active * 0.4);
    expect(resolveHit(attacker, victim, ctx).hit).toBe(true);
    expect(resolveHit(attacker, victim, ctx).hit).toBe(false);
  });

  it('cannot reach someone on the far side of the road', () => {
    const bus = new EventBus<GameEvents>();
    const ctx = makeCtx(bus);
    const attacker = makeRacer();
    const victim = makeRacer();
    victim.x = attacker.x + 1.6;
    victim.z = attacker.z + 40;

    beginAttack(attacker, 'punch', 1);
    advance(attacker, ATTACKS.punch.windup + ATTACKS.punch.active * 0.5);
    expect(resolveHit(attacker, victim, ctx).hit).toBe(false);
  });
});

describe('combat inside a real race', () => {
  // The unit tests above drive the swing by hand. This one proves the wiring:
  // that holding the punch button in an actual race produces actual swings.
  it('a player holding punch in a pack swings and is heard', () => {
    const race = new Race({
      circuit: getCircuit('shivajinagar'),
      playerBike: getBike('duke390'),
      rivalCount: 5,
      seed: 'combat-wiring',
      policeEnabled: false,
    });

    let swings = 0;
    let lastAttack: unknown = null;
    race.bus.on('impact', ({ kind }) => { if (kind === 'punch' || kind === 'kick') swings++; });
    race.bus.on('attack:whiff', () => { swings++; });

    race.start();
    for (let i = 0; i < 120 / STEP && !race.finished; i++) {
      const punch = i % 40 < 2;
      race.update(STEP, controls({ throttle: 1, punch, steer: -race.player.x * 2 }));
      if (race.player.attack) lastAttack = race.player.attack;
    }

    expect(lastAttack).not.toBeNull();
    // Every swing must resolve one way or the other — landing or missing.
    expect(swings).toBeGreaterThan(0);
  });
});
