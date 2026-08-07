import { clamp, loopDelta } from '../core/math.ts';
import type { EventBus, GameEvents } from '../core/events.ts';
import { ATTACKS, Racer, WEAPON_BONUS, type AttackKind, type WeaponKind } from './racer.ts';
import { knockDown } from './physics.ts';

/** How far apart two riders can be along the road and still trade blows, in world units. */
export const MELEE_RANGE_Z = 320;
/** Attacks land within this arc; you cannot kick someone directly behind you. */
export const MELEE_BEHIND_Z = -180;

export interface CombatContext {
  bus: EventBus<GameEvents>;
  trackLength: number;
  /** Where the camera is, so impacts can be panned. */
  cameraX: number;
  /** Called when hitstop should be applied, in seconds. */
  onHitstop(seconds: number): void;
}

/**
 * Try to start a swing. Returns false when the rider is busy, winded or downed —
 * the stamina cost is what stops kick-spam from being the only strategy.
 */
export const beginAttack = (racer: Racer, kind: AttackKind, direction: number): boolean => {
  if (racer.isBusy) return false;
  const requested = kind === 'weapon' && !racer.weapon ? 'punch' : kind;
  const profile = ATTACKS[requested];
  if (racer.stamina < profile.stamina) return false;

  racer.stamina = clamp(racer.stamina - profile.stamina, 0, 100);
  racer.attack = {
    kind: requested,
    direction: direction === 0 ? 1 : Math.sign(direction),
    elapsed: 0,
    resolved: false,
  };
  return true;
};

/** True during the frames where a swing can actually connect. */
export const isAttackActive = (racer: Racer): boolean => {
  if (!racer.attack || racer.attack.resolved) return false;
  const profile = ATTACKS[racer.attack.kind];
  const t = racer.attack.elapsed;
  return t >= profile.windup && t <= profile.windup + profile.active;
};

export interface HitOutcome {
  hit: boolean;
  knockedDown: boolean;
  damage: number;
}

const NO_HIT: HitOutcome = { hit: false, knockedDown: false, damage: 0 };

/**
 * Resolve one attacker against one potential victim.
 *
 * Kept as a pure-ish function over two entities so the whole grid can be paired
 * up in `race.ts` without combat needing to know how many racers exist.
 */
export const resolveHit = (
  attacker: Racer,
  victim: Racer,
  ctx: CombatContext,
): HitOutcome => {
  const swing = attacker.attack;
  if (!swing || swing.resolved || !isAttackActive(attacker)) return NO_HIT;
  if (victim.isDown || victim === attacker) return NO_HIT;

  const dz = loopDelta(attacker.z, victim.z, ctx.trackLength);
  if (dz > MELEE_RANGE_Z || dz < MELEE_BEHIND_Z) return NO_HIT;

  const dx = victim.x - attacker.x;
  // You have to be swinging toward them, and they have to be within arm's reach.
  if (Math.sign(dx) !== swing.direction && Math.abs(dx) > 0.06) return NO_HIT;
  if (Math.abs(dx) > attacker.reachFor(swing.kind)) return NO_HIT;

  swing.resolved = true;

  const blocked = victim.attack !== null && Math.sign(-dx) === victim.attack.direction;
  const profile = ATTACKS[swing.kind];
  const pan = clamp(victim.x - ctx.cameraX, -1, 1);

  if (blocked) {
    // Two swings meeting cancel: both riders wobble, nobody goes down.
    victim.stagger = Math.max(victim.stagger, 0.12);
    attacker.stagger = Math.max(attacker.stagger, 0.12);
    attacker.attack = null;
    ctx.bus.emit('impact', { kind: 'block', power: 0.4, pan, byPlayer: attacker.kind === 'player' });
    ctx.onHitstop(0.035);
    return { hit: true, knockedDown: false, damage: 0 };
  }

  const damage = attacker.damageFor(swing.kind);
  victim.riderHealth = clamp(victim.riderHealth - damage, 0, 100);
  victim.stagger = Math.max(victim.stagger, profile.stagger);
  victim.wobble = Math.min(1, victim.wobble + 0.6);

  // Lighter riders get thrown further. This is why the RX100 is terrifying to ride
  // next to an Interceptor and exhilarating to ride away from one.
  const shove = profile.shove * victim.handling.shoveability * (swing.kind === 'kick' ? 1 : 0.8);
  victim.x = clamp(victim.x + Math.sign(dx || swing.direction) * shove * 0.22, -2.6, 2.6);
  victim.speed *= 1 - clamp(damage / 260, 0, 0.2);

  if (attacker.weapon) {
    attacker.weaponUses--;
    if (attacker.weaponUses <= 0) attacker.weapon = null;
  }

  const power = clamp(damage / 32, 0.2, 1);
  const byPlayer = attacker.kind === 'player';
  ctx.bus.emit('impact', {
    kind: swing.kind === 'weapon' ? 'weapon' : swing.kind,
    power,
    pan,
    byPlayer,
  });
  // Hitstop: a few frozen milliseconds is what makes a kick feel like it has mass.
  ctx.onHitstop(swing.kind === 'punch' ? 0.045 : 0.085);

  const goesDown = victim.riderHealth <= 0 || (swing.kind !== 'punch' && victim.stagger > 0.5 && victim.riderHealth < 42);
  if (goesDown) {
    knockDown(victim, 2.2);
    ctx.bus.emit('rider:down', { racerId: victim.id, byPlayer, pan });
    // A rider going down drops what they were holding.
    if (victim.weapon) {
      attacker.weapon = attacker.weapon ?? victim.weapon;
      attacker.weaponUses = WEAPON_BONUS[victim.weapon].uses;
      victim.weapon = null;
      if (byPlayer) ctx.bus.emit('weapon:pickup', { weapon: attacker.weapon });
    }
    return { hit: true, knockedDown: true, damage };
  }

  return { hit: true, knockedDown: false, damage };
};

/** Side-swiping at speed. Not an attack — just two tonnes of bad judgement meeting. */
export const resolveShunt = (a: Racer, b: Racer, ctx: CombatContext): boolean => {
  if (a.isDown || b.isDown) return false;
  const dz = Math.abs(loopDelta(a.z, b.z, ctx.trackLength));
  if (dz > 150) return false;
  const dx = b.x - a.x;
  if (Math.abs(dx) > 0.34) return false;

  const closing = Math.abs(a.speed - b.speed);
  const separation = Math.sign(dx || 1) * 0.055;
  a.x = clamp(a.x - separation, -2.6, 2.6);
  b.x = clamp(b.x + separation, -2.6, 2.6);

  // Below a real closing speed this is just paint-trading, and shouldn't shout about it.
  if (closing < 400) return false;
  // Riding alongside someone for a second is one scrape, not 120 of them.
  if (a.shuntCooldown > 0 || b.shuntCooldown > 0) return false;
  a.shuntCooldown = 0.4;
  b.shuntCooldown = 0.4;

  const power = clamp(closing / 3000, 0.1, 0.8);
  for (const racer of [a, b]) {
    racer.wobble = Math.min(1, racer.wobble + power * 0.5);
    racer.bikeDamage = clamp(racer.bikeDamage + power * 3, 0, 100);
    racer.speed *= 1 - power * 0.06;
  }
  ctx.bus.emit('impact', {
    kind: 'shunt',
    power,
    pan: clamp(b.x - ctx.cameraX, -1, 1),
    byPlayer: a.kind === 'player' || b.kind === 'player',
  });
  return true;
};

export const giveWeapon = (racer: Racer, weapon: WeaponKind): void => {
  racer.weapon = weapon;
  racer.weaponUses = WEAPON_BONUS[weapon].uses;
};

/** Which attack the player's button should produce, given what they are holding. */
export const attackForButton = (racer: Racer, button: 'punch' | 'kick'): AttackKind => {
  if (button === 'punch' && racer.weapon) return 'weapon';
  return button;
};
