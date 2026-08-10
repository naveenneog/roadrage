# Changelog

All notable changes to Road Rash Bharat. Newest first.

## 0.5.0 — the garage, and swings that read

### Added

- **The garage is a lit stage.** One machine stands in a spotlight, rendered
  from the same hero sprites the race uses, breathing gently with its rear wheel
  idling. A rail of chips switches between machines and a spec panel carries the
  numbers. Each bike tints its own stage with its accent colour, so the Duke's
  orange and the Enfield's cream are not the same showroom.
- **Swings have anticipation.** Attacks now run wind-up → strike → recovery
  instead of holding one frozen pose for the whole swing. The wind-up gets its
  own cocked-arm sprite; the strike extends past the bars. A swing with no
  anticipation reads as a decal being switched on.
- **Missing costs you something you can hear.** A swing that leaves its active
  frames without touching anyone emits `attack:whiff` and an airy miss sound,
  pitched well above the impacts so a miss is instantly distinguishable from a
  hit. Previously a whiff was completely silent and invisible.
- **Refused inputs answer back.** Swinging while winded or already committed
  emits `attack:denied` and a short muted thud. It used to do nothing at all,
  which is indistinguishable from a dropped input.
- **`scripts/qa-ui.mjs`** — walks every screen at three viewports and fails on
  clipped content, elements pushed out of reach, undersized touch targets and
  **overlapping siblings**. `npm run qa:ui`.
- `attack`, `attackKind` and `stamina` on the debug snapshot, so harnesses can
  assert combat actually happens rather than trusting a screenshot.

### Fixed

- **Every card on the garage, circuits and campaign screens was broken.** Rows
  were sized to 121 px while the content needed 250–290 px, so each card was
  clipped and painted straight through the card below it. All twelve bikes, all
  nine circuits and all six chapters.
  - The cause is that a `<button>` will not size to its own content while it
    *is* the grid item. Two attempted fixes made it worse in instructive ways:
    `min-height: fit-content` made the buttons grow *past* their grid cells, so
    clipping became overlap; moving the flex layout to an inner wrapper left the
    button itself still refusing to grow. The fix is a plain block slot between
    the grid and the button, which restores ordinary sizing.
  - `qa-ui.mjs` fails the build if any of it comes back.
- The bike no longer snaps bolt upright the instant you press an attack button.
  Lean is preserved through the swing, at reduced amplitude.

### Changed

- Attack poses are driven by `attackPhase()`, derived from the same profile
  timings combat resolves against, so what you see is what will connect.

## 0.4.0 — the machine you actually look at

The player's bike is on screen for every second of every race and was the
weakest thing in the game: a soft, static, low-contrast shape with no motion at
all. This release rebuilds it.

### Added

- **The rear wheel is its own sprite and it spins.** Angular velocity comes from
  road speed and tyre radius, so the rate always matches how fast you are going.
  Sixteen tread blocks around the shoulder make the rotation visible; a wheel
  with a smooth sidewall spins invisibly.
- **Hero-resolution player frames.** The player's machine rasterises at 640 px
  instead of the shared 288 px. It is drawn at roughly 450 px on screen, so the
  old sprite was being upscaled — that alone accounted for most of the softness.
- **Live animation instead of baked frames.** Lean is now a real rotation about
  the contact patch rather than one of five pre-drawn poses, and the body rides
  on a damped suspension that compresses over bumps, shivers at idle and bobs
  with speed.
- **Exhaust smoke.** Two-strokes haze constantly, four-strokes puff under load.
  New `Effects.spawnSmoke` gives smoke the opposite physics to impact sparks —
  it rises, expands and fades instead of falling and shrinking.
- **`Painter.outline`**, a hard dilated contour stamped under the artwork. A
  crisp dark edge is the reason classic sprite art stays readable against a busy
  road, and a blurred halo alone was not doing it.
- **`spritelab.html`**, a dev-only page that shows every bike frame at its true
  size against a checkerboard. Not part of the shipped bundle. It is what
  surfaced every defect below; the artwork had never been looked at in isolation.

### Changed

- **The machine was redrawn around the tyre.** Every part now has a fixed place
  relative to the wheel: mudguard curving over it, swingarm straddling it, pipes
  beside it, tail and lamp above it. Previously the body was a stack of
  rectangles that happened to sit above a circle, and at hero size the wheel was
  buried entirely behind the engine block.
- **Riders are guaranteed to out-value their machine.** Several authored jackets
  are near-black, which is accurate to the real thing and useless on screen. A
  jacket below a quarter value is now pulled toward the bike's accent colour and
  then raised to a brightness floor, so each machine keeps its character while
  the rider always reads as a separate object.
- **Bodies are narrower and taller.** Widths were cut by about a third; the
  handlebars, not the bodywork, are now the widest thing on the bike.
- Proper handlebars: yoke, risers, grips, levers and mirrors instead of a flat
  rod. On a rear view this is the widest part of the machine.
- Rider torso tapers from shoulder to waist with a belt, racing hump and spine
  ridge; arms are stroked twice so they stay distinct limbs against the jacket.
- Legs are dark trousers tucked to the tank with boots just outside the tyre, so
  the wheel is never hidden and the sprite is not bottom-heavy.
- Engine, number plate and tail lamp are much smaller. All three were competing
  with the wheel for attention and winning.
- The wreck sprite was redrawn for the new scale with explicit coordinates
  instead of one large rotation of the upright bike.
- Player sprite height 0.42 → 0.50 of the viewport, seated on the bottom edge so
  the rear tyre is no longer clipped.

### Fixed

- `Painter.outline` filled the whole sprite box with its wash colour, drawing a
  large black rectangle behind the player during every race. The stamped
  silhouette is enough; the wash is gone.

### Internal

- Extracted `render/player-view.ts`. The player's machine owns real animation
  state (wheel angle, suspension, exhaust timer) that has nothing to do with the
  segment loop, and `renderer.ts` had gone over its line budget.

## 0.3.0 — painted skylines

### Added

- **Painted far skylines**, generated once with Azure OpenAI `gpt-image-2` and
  shipped as five WebP files totalling 247 KB: Bengaluru cantonment at dawn,
  Marine Drive at night, a monsoon Western Ghats ridge, a Goan coast at dusk,
  and Old Delhi at night. They replace the procedural sky and skyline; the near
  tree line still draws on top.
  - The split is deliberate. A skyline is one wide image drawn once and
    scrolled — exactly what a text-to-image model is good at. Bikes and riders
    are the opposite, needing dozens of exact lean and action frames on a
    transparent background with a fixed pivot, so those stay procedural.
  - Tiles are mirrored alternately, because a generated image is not seamless
    and flipping every other copy makes the join match exactly for free.
  - Entirely optional: if the files are missing or fail to load, the procedural
    background draws instead.
- `npm run assets` generates them, authenticating with the signed-in Azure CLI
  identity rather than an API key, so no secret is written to disk or committed.

### Fixed

- Near props were the most transparent things on screen, because the fade-in
  band was long and the props nearest the cull are the largest. Shortened.

## 0.2.0 — richer world, oncoming traffic, gameplay footage

Driven by studying the original: Louis Gorenfeld's Road Rash analysis (the
author of the pseudo-3D technique this engine uses) and contemporary accounts of
the Genesis and 3DO versions.

### Added

- **Oncoming traffic.** The defining hazard of the genre, and it was missing.
  The right lane holds slow traffic going your way; the left lane now holds
  something coming at you, closing at the *sum* of both speeds. Head-ons put you
  down at a far lower threshold, front-view sprites with headlights replace the
  rear views, and both the rival AI and the test bots weight oncoming traffic as
  nearer than it is. Per-circuit share, from 12% on a divided arterial to 32% on
  an undivided ghat.
- **The nearest rider is named**, with a condition bar and their weapon if they
  are carrying — straight from the original, where knowing it is Kaale Khan with
  a chain is what decides whether you fight or leave it.
- **Cows are traffic, not scenery.** They stood in the road as decoration you
  drove straight through. Now they are slow, heavy, collidable obstacles.
- **Roadside structure.** The verge was one flat colour from kerb to horizon.
  There are now five bands — tarmac, rumble, kerb, shoulder, mid-ground, far
  ground — each alternating tone per segment, plus scattered shoulder detail,
  double lane markings and solid edge lines.
- **Denser, layered scenery.** Props are placed in depth ranks rather than a
  single flat row, at roughly three times the previous density.
- **Adaptive resolution.** The renderer is fill-rate bound, so the frame rate
  governor gives pixels back when it sags and takes them again when it recovers.
- **Gameplay recording** (`npm run record`). Playwright caps at 25 fps, so the
  game runs at half speed and ffmpeg speeds the result back up for a true 50 fps
  clip. Includes a rider bot that holds a racing line and dodges traffic.
- **Frame budget harness** (`scripts/perf.mjs`) reporting sim versus draw time.

### Changed

- **Bikes and riders redrawn.** Two-tone tank with a lit top and shaded flank,
  cylinder head, rear shock, mudguard, tail unit; wheels with tread, brake disc
  and a rotation smear. Riders got jointed arms with elbows and gloves, weight
  that shifts across the seat with the lean, a counter-leaning torso, boots on
  the pegs and a helmet with a rim light and chin bar.
- **Every sprite gets a key light and a dark halo**, so a dark bike no longer
  disappears into dark tarmac.
- **Atmosphere is a gradient, not transparency.** Distance used to fade props to
  transparent, so you could see the sky through a building. Far things now wash
  toward the colour of the air instead.
- Screen shake follows a trauma model (offset ∝ magnitude²) per the `game-feel`
  skill, so routine scrapes barely register and real impacts punch.
- The wreck sprite reads as a bike on its side with sparks, not a pile of wheels.

### Fixed

- Draw time at 1080p went from 13.7 ms to 2.2 ms (40 → 59 fps) via level-of-
  detail on the roadside bands, skipping the fog pass on near segments, and the
  resolution governor.
- The police readout and the toast both said "POLICE" over each other.
- Touch controls appeared for the first four seconds on desktop.

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
