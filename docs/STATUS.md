# Status

**Active packet:** P-21 — rider damage feedback: the bike visibly degrades as
damage climbs (bent bars, smoke, a dragging pipe).

P-20 Road hazards you can actually see is complete and the project sits at a
milestone boundary.

## Acceptance criteria for P-20 (met)

- Given a speed breaker ahead, when it is roughly fifteen segments away, then
  painted warning chevrons are already visible on the approach.
- Given a speed breaker at point-blank range, when it fills the lower screen,
  then it reads as a striped painted hump rather than a flat slab of colour or
  a chequered finish line.
- Given any circuit, when its potholes are placed, then every one sits entirely
  on the tarmac, where it can be both seen and hit.

## What proves it

```
npm test                                     236 passed
npm run typecheck                            clean, strict
npm run build                                clean
npm run qa:ui                                15/15 screen x viewport, 0 issues
node scripts/qa.mjs                          4/4 viewports, 52-60 fps, 0 errors
node scripts/qa-campaign.mjs                 Auto Rickshaw Edition, 11/11 checks
node scripts/qa-circuits.mjs                 9/9 circuits render with contrast
npx vite-node scripts/balance.ts             9/9 circuits completable
node .ironclad/gate.mjs --stage packet       exit 0, 24 passed, 1 warned
```

Hazard visibility was judged from captured frames rather than asserted. A probe
drives the circuit and photographs the road at eight fixed distances from the
same hazard — 34, 26, 20, 15, 11, 8, 5 and 3 segments — so the question is not
"does it draw" but "at what range does it become readable", which is the only
version of the question that matters at 140 km/h.

## On looking at the thing you changed

The first pass of this work shipped in a state where the change had been written
and typechecked but never looked at. Reviewing the ladder found three defects in
a row, none of which any test or harness reported:

1. **Potholes were placed off the road.** The scatter reached 1.4 half-widths
   while the player's own x is clamped to 1.0, so 28% of them sat past the kerb
   — unhittable, and painted out on the verge where they read as scenery. A
   further 47% had their rim hanging over the edge. The existing test asserted
   that *some* potholes were off-centre, which this passed comfortably.
2. **The breaker was a wall, not a bump.** Five segments of solid full-width
   yellow filled the entire screen at close range and read as "the road is
   yellow here".
3. **The first fix for it was worse.** Alternating blocks phase-shifted per
   segment produced a chequerboard — unmistakably a finish line. Running the
   bands *along* the direction of travel, in phase across the hump, is what
   reads as painted markings.

The lesson matches the card bug: a passing suite says the code does what it
says, not that the result is any good. Anything whose whole purpose is to be
seen has to be looked at, at the size and speed the player meets it.

## On the QA that found the card bug

Every existing harness passed while all twenty-seven cards on the garage,
circuits and campaign screens were unreadable. No console errors, the right
sprite count, fine frame rate. The screens simply had nobody looking at them.

`qa-ui.mjs` closes that gap, and its history is worth keeping:

1. The first version checked for clipped content. It passed after a fix that had
   merely converted clipping into overlap.
2. Adding a **sibling overlap** check — the thing a person actually sees — caught
   it immediately, and revealed the circuits screen was broken too.

The lesson is that "no element is clipped" is a proxy. "No element paints
through its neighbour" is the invariant.

## Open unknowns

None blocking. See `docs/UNKNOWNS.md` for what was researched and what remains an
explicitly labelled assumption.
