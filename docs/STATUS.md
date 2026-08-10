# Status

**Active packet:** P-20 — rider damage feedback: the bike visibly degrades as
damage climbs (bent bars, smoke, a dragging pipe).

P-19 Garage and combat readability is complete and the project sits at a
milestone boundary.

## Acceptance criteria for P-19 (met)

- Given the garage, when it opens, then the selected machine is shown large on a
  lit stage with its wheel turning, and every other machine is one click away.
- Given any screen at any of three viewports, when it is rendered, then no
  element is clipped, pushed out of reach, or painted through a sibling.
- Given an attack input, when the swing plays, then it passes through a wind-up
  pose before the strike, and lean is preserved throughout.
- Given a swing that touches nobody, when the active frames end, then the miss
  is announced exactly once.

## What proves it

```
npm test                                     231 passed
npm run typecheck                            clean, strict
npm run build                                clean
npm run qa:ui                                15/15 screen x viewport, 0 issues
node scripts/qa.mjs                          4/4 viewports, 57-60 fps, 0 errors
node scripts/qa-campaign.mjs                 Auto Rickshaw Edition, 11/11 checks
node scripts/qa-circuits.mjs                 9/9 circuits render with contrast
npx vite-node scripts/balance.ts             9/9 circuits completable
node .ironclad/gate.mjs --stage packet       exit 0, 25 passed, 0 warned
```

Attack phases were verified in a live browser rather than inferred: with the
simulation slowed to 0.08x, five successive samples of the debug snapshot read
`windup → strike → strike → recover → recover`.

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

## Open unknowns

None blocking. See `docs/UNKNOWNS.md` for what was researched and what remains an
explicitly labelled assumption.
