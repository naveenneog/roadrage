# Roadmap

Packets are one behaviour each, testable in isolation, shippable in one commit.

## Milestone 1 — The engine  ✅ done

| Packet | Acceptance | State |
|---|---|---|
| P-1 Pseudo-3D projection | `scale = d/z`, finite for points at or behind the camera, monotonic fog | done |
| P-2 Road builder | Declarative track ops build a closed loop with aligned rumble stripes | done |
| P-3 Derived handling | Handling comes from published specs; garage ordering provable by test | done |
| P-4 Circuits | Nine circuits from researched locations, all completable | done |

## Milestone 2 — The race  ✅ done

| Packet | Acceptance | State |
|---|---|---|
| P-5 Bike physics | Accelerates, brakes, steers with speed, survives 6,000 violent steps without NaN | done |
| P-6 Combat | Windup/active/recover, one hit per swing, stamina gate, blocks, weapon steal | done |
| P-7 Rival AI | Reads the road, picks a line, avoids traffic, picks fights; same physics as the player | done |
| P-8 Traffic and police | Recycled field with correct spacing; heat-based police escalation | done |
| P-9 Race orchestration | Countdown, laps, standings, prizes, wreck and finish states | done |

## Milestone 3 — Presentation  ✅ done

| Packet | Acceptance | State |
|---|---|---|
| P-10 Procedural sprites | 13 bikes, 39 props, 9 vehicles, all drawn in code, atlas-cached | done |
| P-11 Renderer | 60 fps at 1080p with full field and traffic, zero console errors | done |
| P-12 Engine synthesis | Per-bike voice from firing order, stroke, crank offset, thump/ring/rasp | done |
| P-13 Raga soundtrack | Malkauns/Bhairav/Darbari over Keherwa, tanpura drone, no audible loop seam | done |
| P-14 HUD and screens | Speedo, condition, standings, proximity strip; DOM menus with keyboard focus | done |

## Milestone 4 — The player's game  ✅ done

| Packet | Acceptance | State |
|---|---|---|
| P-15 Career and garage | Buy, select, unlock, personal bests, all pure and unit tested | done |
| P-16 Night Fare campaign | Six chapters in the auto, hunters not racers, paid for surviving | done |
| P-17 Mobile | Landscape touch controls, tilt option, PWA install, 60 fps on a phone | done |

## Milestone 5 — Next

- [ ] **P-18** Rider damage feedback — the bike visibly degrades as damage climbs: bent bars, smoke from the engine, a dragging exhaust. Acceptance: at 80% damage the machine is recognisably wounded without reading the HUD.
- [ ] **P-19** Weapon pickups on track — weapons spawn roadside rather than only dropping from downed riders. Acceptance: a chain can be collected without hitting anybody first.
- [ ] **P-20** Ghost replay — record and race your own best lap. Acceptance: a deterministic input log replays to the same finishing time twice.
- [ ] **P-21** Split screen — two players, one keyboard. Acceptance: the simulation already supports N racers; two viewports render at 60 fps combined.

Reviewed at every milestone boundary against what actually shipped.
