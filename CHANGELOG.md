# Changelog

All notable changes to Road Rash Bharat. Newest first.

## 0.1.0 — first playable

### Added

- **Segmented pseudo-3D road renderer.** The 16-bit technique, not an emulation
  of it: `scale = d/z` projection, curves faked by accumulating a lateral camera
  offset, hills as real height projection, painter's-algorithm occlusion.
- **Thirteen machines** authored from published specifications, with handling
  *derived* from power, weight and wheelbase rather than hand-tuned.
- **Nine circuits** drawn from researched locations across Bengaluru, Thane,
  Pune, Mumbai, Goa, Delhi and the Western Ghats.
- **Melee combat** with windup/active/recovery frames, stamina gating, blocks,
  knockdowns, weapon steals and hitstop.
- **Rival AI** that reads the road ahead, chooses a racing line, avoids traffic
  and picks fights — through the same `Controls` struct and the same physics as
  the player, with no private handling multipliers.
- **Indian traffic**: autos that never hold a lane, a Splendor with four up,
  tempos, buses, Maruti 800s, cycle rickshaws, bullock carts, and trucks with
  HORN OK PLEASE on the tailboard.
- **Heat-based police** that escalate with sustained speed and crashes.
- **Procedural art** — every sprite drawn in code: 13 bikes, 39 roadside props,
  9 traffic vehicles, 5 skies. No asset files in the repository.
- **Synthesised engines**: a custom `PeriodicWave` per machine, driven at the
  real firing frequency through a gearbox, shaped by thump, ring and rasp. The
  270° crank twin gets its uneven 270/450 beat.
- **Raga-derived soundtrack**: Malkauns over a distorted riff, Bhairav for leads,
  Darbari for the thriller, on a Keherwa theka under a tanpura drone.
- **Night Fare**, the Auto Rickshaw Edition: six chapters of night-time pursuit
  in a three-wheeler with tip-over physics and correct city liveries.
- **Mobile play**: landscape thumb controls, optional tilt steering, gamepad
  support, capped internal resolution, PWA install and offline start.

### Fixed during development

Found by the headless simulation tests, before a pixel was drawn:

- The remount condition was `isDown && downTimer <= 0`, which is self-
  contradictory — downed riders were never remounted and were stranded at zero
  speed for the rest of the race.
- Shunts and traffic collisions re-fired every physics step while two bodies
  overlapped, compounding damage 120 times a second and emitting a machine-gun
  of impact sounds. Both now debounce.
- The starting grid was placed behind the finish line, so lap 1 completed after
  340 units of travel and a three-lap race ended almost immediately.
- Rider health never regenerated, making any sufficiently long race unwinnable
  by attrition regardless of how well it was ridden.

Found by a code-review council pass, each with a reproduction:

- **The road vanished for the first 900 units of every lap.** The camera trails
  the player by a fixed offset, so at the start line its position is negative.
  Segment *lookup* wrapped that into track space but the *projection* did not,
  so with the base segment wrapped to the end of the array nearly every segment
  had a full track length subtracted from an already-negative camera z. Every
  segment collapsed onto the vanishing point and the back-face cull rejected all
  of them — measured: 0 segments drawn below `z = 900`, 71 after the fix. This
  blacked out the road, traffic and rivals for the whole countdown of every race
  and for ~0.15s at every lap crossing.
- **Finished rivals were still drawn.** They stop being simulated on finish but
  were still rendered — frozen, pass-through ghost bikes parked mid-road at the
  finish line, which the player then drove through on every remaining lap.
- **`race:finish` could fire twice.** `finishRace` runs synchronously inside
  `stepField`, and `checkEnding` later in the same tick had no guard, so
  crossing the line and totalling the bike in one step applied career
  progression twice.
- **Settings back-navigation used a stale latch.** Opening Settings from the
  title screen after any race showed a dead pause menu; opening it from a
  campaign race dropped to the title with the race still rendering underneath.
  Now derived from live game state.
- Rivals on the starting grid rendered several times life size. Entity sprites
  are now clamped to the player's own on-screen size.

Found by looking at QA screenshots, not by reading exit codes:

- Roadside props were sized from real metres and came out several screen-widths
  across, painting over the entire road. Recalibrated, with distance-based
  culling and a fade-in.
- The colour grade and vignette were recomputed every frame at full resolution.
  Now rasterised once per circuit and blitted: desktop went from 34 to 60 fps.
- Distance fog used a fixed colour that did not match the sky, leaving a hard
  grey band at the horizon. Fog now blends toward the sky's own haze.
- Touch controls appeared for the first four seconds on desktop, because the
  "last touched" timestamp initialised to zero rather than to negative infinity.

Found by the balance harness:

- Traffic spawned 900–3,000 units apart, which at racing speed is a vehicle
  every 0.2 seconds — an unavoidable wall that wrecked the entire field within
  twenty seconds. Spacing is now interpolated by circuit density.
- Ghodbunder was a two-lap race on the longest circuit, running to 290 seconds
  and killing the player by accumulated damage. Now a one-lap run, which also
  suits an 18 km arterial better than a lap does.
