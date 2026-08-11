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

## Milestone 5 — Presentation and polish  ✅ done

Driven by looking at the running game rather than by the plan, so these were
written as they shipped.

| Packet | Acceptance | Shipped |
|---|---|---|
| P-18 Painted skylines | Five generated backdrops, ~250 KB total, optional at runtime | 0.3.0 |
| P-19 Player machine rebuild | Hero-resolution frames, live wheel rotation, damped suspension | 0.4.0 |
| P-20 Garage and combat readability | Lit garage stage; wind-up → strike → recovery; no UI clipped or overlapping | 0.5.0 |
| P-21 Local colour | Region-correct plates, city monuments, street talk in the local language | 0.6.0 |
| P-22 Rider thrown clear | The fallen rider is his own sprite, thrown on an arc and running back | 0.7.0 |
| P-23 Visible road hazards | Painted run-up before every breaker; every pothole on the tarmac | 0.8.0 |
| P-24 RoadRage, published | Renamed off a trademark, saves migrated, live on GitHub Pages | 0.9.0 |

## Milestone 6 — Next

Ranked by what the player would notice first.

- [ ] **P-25** Hazard and impact audio — potholes and speed breakers are
  completely silent. `applyHazard` in `game/physics.ts` jolts the bike and takes
  damage, but emits no event and `core/events.ts` has no hazard event to emit.
  Sound is what sells an impact, and this is the cheapest large win left.
  Acceptance: hitting a pothole and landing off a breaker each produce a
  distinct, speed-scaled sound; a muted run is unchanged in behaviour.
- [ ] **P-26** Rider damage feedback — the machine never shows wear. `damage`
  exists in `game/`, the HUD and the results screen, and reaches
  `render/sprites/` nowhere at all, so a bike at 5% condition looks exactly like
  a showroom one. Acceptance: at 80% damage the machine is recognisably wounded
  — bent bars, smoke, a dragging pipe — without reading the HUD.
- [ ] **P-27** Live rider limbs — arms and legs are baked into each frame, so the
  rider never visibly works the bars. Acceptance: arm angle follows steering and
  the body loads under braking, driven from simulation state rather than
  frame choice.
- [ ] **P-28** Ghost replay — `bestTimes` is saved and shown on the circuit card
  but there is nothing to chase. Acceptance: a deterministic input log replays
  to the same finishing time twice, and a live delta to your best is on the HUD.
- [ ] **P-29** Weapon pickups on track — weapons spawn roadside rather than only
  dropping from downed riders. Acceptance: a chain can be collected without
  hitting anybody first.
- [ ] **P-30** Split screen — two players, one keyboard. Acceptance: the
  simulation already supports N racers; two viewports render at 60 fps combined.

### Standing quality items

- [ ] **Test ratio sits exactly on the gate floor** — 11 test files for 74 source
  files, 15% against a floor of 15%. The next source file added fails the gate.
  The thin areas are `render/` and `ui/`, which is also where the last several
  bugs actually were.
- [ ] **The demo footage is stale.** Stills are done — `media/hero.jpg`,
  `garage.jpg` and `race.jpg` are shot from the deployed build and shown in the
  README. The moving footage is not: `media/gameplay.mp4` is gitignored and
  dates from before the garage, the taunts, the monuments, the rider rebuild,
  the road hazards and the rename. Re-record once P-25 and P-26 land so the clip
  actually shows them.
- [ ] **Near buildings render see-through.** `nearFade` in `render/renderer.ts`
  fades roadside props to *zero* alpha as they approach the near cull, and the
  props nearest that cull are the largest on screen — so the biggest buildings
  are the most transparent and you see the skyline through a shopfront. Both the
  comment above the alpha and the one on `SCENERY_FADE_Z` already call this
  backwards; the short fade band was a mitigation, not a fix. Visible in
  `media/hero.jpg`.

Reviewed at every milestone boundary against what actually shipped.
