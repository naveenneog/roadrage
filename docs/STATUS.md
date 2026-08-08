# Status

**Active packet:** P-19 — rider damage feedback: the bike visibly degrades as
damage climbs (bent bars, smoke, a dragging pipe).

P-18 Player-bike clarity is complete and the project sits at a milestone boundary.

## Acceptance criteria for P-18 (met)

- Given a race in progress, when the player's machine is drawn, then its rear
  wheel rotates at a rate derived from road speed and tyre radius.
- Given any lean input, when the machine tips, then it rotates live about its
  contact patch rather than swapping to a pre-drawn frame.
- Given the sprite lab, when every bike is rendered at true size, then each of
  the thirteen machines reads as a motorcycle from behind and is distinguishable
  from the others by colour and silhouette.
- Given the four target viewports, when a race is played, then the frame rate
  still holds and there are no console errors.

## What proves it

```
npm test                                     212 passed
npm run typecheck                            clean, strict
npm run build                                clean, 57 KB gzipped
node scripts/balance.ts                      9/9 circuits completable
node scripts/qa.mjs http://localhost:5180/   4/4 viewports, 51-60 fps, 0 errors
node scripts/qa-campaign.mjs                 Auto Rickshaw Edition, 11/11 checks
node scripts/qa-circuits.mjs                 9/9 circuits render with contrast
node .ironclad/gate.mjs --stage packet       exit 0, 25 passed, 0 warned
```

The rear wheel's motion was verified rather than assumed: four screenshots of
the tyre region taken 90 ms apart under throttle hash differently, 4 of 4.

QA screenshots for all four viewports are written to `./qa` and were reviewed by
eye, not just by exit code. Three rendering defects were found that way. A
code-review council pass then found four more, including a critical one that
blanked the road for the whole countdown of every race — all fixed, each with a
regression test in `tests/regressions.test.ts`.

`spritelab.html` was added for the same reason and immediately earned it: the
bike artwork had only ever been judged at 450 px against a moving road. Seen in
isolation the rear wheel turned out to be completely buried behind the engine
block, and `Painter.outline` was filling the whole sprite box with a black
rectangle. Neither was visible in a normal play session.

## Open unknowns

None blocking. See `docs/UNKNOWNS.md` for what was researched and what remains an
explicitly labelled assumption.
