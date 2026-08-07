# Status

## Active packet

**P-17 Mobile** — complete. The project is between milestones; the next packet is
**P-18 Rider damage feedback** from `docs/ROADMAP.md`.

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
npm test                                     152 passed
npm run typecheck                            clean, strict
npm run build                                clean
node scripts/balance.ts                      9/9 circuits completable
node scripts/qa.mjs http://localhost:5180/   4/4 viewports, 60 fps, 0 errors
node .ironclad/gate.mjs --stage packet       exit 0
```

QA screenshots for all four viewports are written to `./qa` and were reviewed by
eye, not just by exit code. Three rendering defects were found that way and are
recorded in `CHANGELOG.md`.

## Open unknowns

None blocking. See `docs/UNKNOWNS.md` for what was researched and what remains an
explicitly labelled assumption.
