# Status

**Active packet:** P-18 — rider damage feedback: the bike visibly degrades as
damage climbs (bent bars, smoke, a dragging pipe).

P-17 Mobile is complete and the project sits at a milestone boundary.

## Acceptance criteria for P-17 (met)

- Given a phone in landscape, when the game loads, then thumb controls appear on
  first touch and fade out again when a keyboard is used.
- Given any of the four target viewports, when a race is played for six seconds,
  then the frame rate holds at 60 and there are no console errors.
- Given a portrait phone, when the game loads, then a rotate prompt is shown
  instead of an unplayable road.
- Given a second visit offline, when the game loads, then it starts from the
  service worker cache.

## What proves it

```
npm test                                     212 passed
npm run typecheck                            clean, strict
npm run build                                clean, 51 KB gzipped
node scripts/balance.ts                      9/9 circuits completable
node scripts/qa.mjs http://localhost:5180/   4/4 viewports, 60 fps, 0 errors
node scripts/qa-campaign.mjs                 Auto Rickshaw Edition, 11/11 checks
node scripts/qa-circuits.mjs                 9/9 circuits render with contrast
node .ironclad/gate.mjs --stage packet       exit 0, 25 passed, 0 warned
```

QA screenshots for all four viewports are written to `./qa` and were reviewed by
eye, not just by exit code. Three rendering defects were found that way. A
code-review council pass then found four more, including a critical one that
blanked the road for the whole countdown of every race — all fixed, each with a
regression test in `tests/regressions.test.ts`.

## Open unknowns

None blocking. See `docs/UNKNOWNS.md` for what was researched and what remains an
explicitly labelled assumption.
