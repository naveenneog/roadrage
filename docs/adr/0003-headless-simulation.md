# ADR-0003: Keep the simulation headless

**Status:** accepted
**Date:** 2026-08-07
**Packet:** P-5 … P-9

## Context

Browser games conventionally interleave simulation and presentation: the update
function moves a bike and also plays its engine sound, spawns its particles and
nudges the camera. It is convenient and it is how most tutorials are written.

It has two costs that matter here. First, nothing can be tested without a canvas
and an `AudioContext`, so the physics, the AI and the race rules are only ever
exercised by a human playing the game. Second, the simulation accumulates
presentation concerns until "what happens when two riders collide" is spread
across four files and a render loop.

This project has a lot of rules — combat frames, stamina, knockdowns, traffic
collisions, lap counting, standings, police heat, prize splits — and rules that
are only tested by playing are rules that are not tested.

## Options considered

1. **Interleave.** Conventional, convenient, fast to write. Untestable.
2. **Interleave, then add integration tests with a headless browser.** Possible,
   but a Playwright run takes tens of seconds and cannot assert on internal
   state without a debug surface that becomes its own API.
3. **Separate, with the simulation emitting events.** More upfront structure;
   requires a real boundary and something to enforce it.

## Decision

`src/game/` imports no canvas, no `AudioContext` and no DOM. It communicates
outward in exactly two ways:

- **Events** via a typed `EventBus` — `impact`, `rider:down`, `race:finish`
- **Broadcast** via `game/broadcast.ts` — plain data structurally compatible
  with what the audio layer wants, so neither module imports the other

The boundary is enforced by the ironclad gate, which fails the build on a
forbidden import edge. `game/**` may not import `render/`, `ui/` or `audio/`.

## Consequences

**Good.** A full race — six riders, traffic, combat, police, nine circuits —
runs faster than real time in a Node test. `scripts/balance.ts` plays every
circuit with an AI driver and reports lap times, damage and finishing positions
in a few seconds, which is how the game is actually tuned.

Four genuine bugs were found this way *before a single pixel was drawn*:

1. The remount condition `isDown && downTimer <= 0` is self-contradictory;
   downed riders were stranded permanently at zero speed.
2. Shunts and traffic collisions re-fired every physics step, compounding damage
   120 times per second.
3. The starting grid sat behind the finish line, so lap 1 completed after 340
   units of travel.
4. Rider health never regenerated, making long races unwinnable by attrition.

Every one of those would have been extremely hard to diagnose by playing, and
trivial to miss entirely.

**Bad.** Presentation needs a translation layer that would not otherwise exist:
`ui/presenter.ts` maps events to HUD and renderer calls, and `game/broadcast.ts`
shapes audio parameters. That is roughly 150 lines of code that a coupled design
would not need.

**Also bad.** Some effects are genuinely simulation-owned — hitstop freezes the
world, and screenshake magnitude is decided by the impact that caused it. Those
live on `Race` as `hitstop` and `shake`, which is a small deliberate leak: they
are numbers describing the simulation's own time and violence, and the renderer
reads them rather than being told about them.
