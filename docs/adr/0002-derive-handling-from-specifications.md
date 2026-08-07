# ADR-0002: Derive handling from published specifications

**Status:** accepted
**Date:** 2026-08-07
**Packet:** P-3

## Context

The game has thirteen machines that must feel meaningfully different — a 195 kg
Royal Enfield Classic 350 should not ride like a 103 kg Yamaha RX 100 — and a
garage screen that shows stat bars the player uses to spend money.

The obvious approach is to hand-author game stats per bike: pick acceleration,
handling and toughness values that feel right, and separately display a spec
sheet for flavour. This is what most arcade racers do.

It has a specific failure mode. The displayed specification and the actual
handling are two sources of truth for the same thing, and they drift. Somebody
tunes the Pulsar to be more fun, and now the garage says it makes 20 bhp and
weighs 160 kg while out-accelerating a bike with twice the power-to-weight. The
player learns to ignore the numbers, and the research that produced them is
wasted.

## Options considered

1. **Hand-authored game stats, spec sheet as flavour.** Fastest to tune, most
   direct control over feel. Two sources of truth; guaranteed drift.
2. **Hand-authored stats with a test asserting they match the specs.** Keeps
   control, catches drift. But the assertion has to encode the relationship
   anyway, so the relationship exists — it is just written twice.
3. **Derive handling from the specifications.** One source of truth. Adding a
   bike becomes a data change. Less direct control over any individual bike.

## Decision

Derive. `game/tuning.ts` is the single function from `BikeSpec` to `Handling`:

- **Acceleration** from power-to-weight (72%) and torque-to-weight (28%)
- **Agility** from mass (55%) and wheelbase (45%)
- **Toughness** from mass
- **Centrifugal force** from the inverse of agility — heavy, long machines run
  wide, which is what makes a Bullet feel like a Bullet in a bend
- **Shoveability** from the inverse of mass — how far a kick throws you
- **Top speed** from the published figure, converted through one constant

The garage's stat bars come from the same derivation, normalised across the
roster, so the bars cannot disagree with the handling.

## Consequences

**Good.** Adding a bike is a data change with no balancing pass. The garage
ordering is provable: tests assert the Duke 390 is fastest, the RX 100 turns
harder than the Interceptor 650, heavier machines run wider and are tougher, and
the auto rickshaw is the least agile thing on the road. `toKmh(maxSpeed)` round-
trips exactly back to the published km/h for all thirteen machines.

**Bad.** Individual bikes cannot be nudged. If the Jawa 42 turns out to be dull,
the fix is either a coefficient change that moves every bike, or a correction to
the spec that must be honest. This is the cost of the property being bought and
it is accepted deliberately.

**Mitigation.** The coefficients are all in one small file with named constants,
and the reference bands (`PTW_MIN`, `WEIGHT_HEAVY`, `WHEELBASE_SHORT`) are
explicit, so a global rebalance is a handful of numbers rather than thirteen.

**Honesty requirement.** Because handling now depends on the specs, the specs
must be real. Every `BikeSpec` carries a `note` recording the claim being made,
and figures that are estimates rather than manufacturer data are labelled as
such in `docs/UNKNOWNS.md` (U-4, U-5).
