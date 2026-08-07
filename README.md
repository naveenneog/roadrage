# Road Rash Bharat

**Street bike combat racing through Indian cities.** A pseudo-3D arcade racer in
the Road Rash tradition — you win by riding fast and by kicking the person next
to you into a BEST bus at 140 km/h.

Nine circuits drawn from real streets: Commercial Street and Russell Market in
Shivajinagar, the Ghodbunder arterial and the Yeoor ghat in Thane, SB Road in
Pune at midnight, Marine Drive, Malshej Ghat in monsoon, coastal Goa, and the
galis of Chandni Chowk.

Thirteen machines, every specification real: the Hero Splendor, the Yamaha
RX 100 and RD 350, the Yezdi Roadking and Roadster, the Royal Enfield Classic 350
and Interceptor 650, Bajaj Pulsars, the TVS Apache, the Jawa 42, the KTM 390
Duke — and a Bajaj RE auto rickshaw with three wheels and a tipping problem.

And **Night Fare**, the Auto Rickshaw Edition: six chapters of a night-time
chase thriller in which you are an auto driver with a passenger in the back who
will not say where she is going, only that you must not stop.

---

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # typecheck + production bundle into dist/
npm run preview    # serve the production build
```

Everything is generated at runtime — there is not a single image, audio or font
file in the repository. The whole game is about 200 KB of JavaScript.

## Controls

| | Keyboard | Touch | Gamepad |
|---|---|---|---|
| Steer | `←` `→` or `A` `D` | Left thumb buttons, or tilt | Left stick / d-pad |
| Throttle | `↑` or `W` | `GAS` | `RT` / `A` |
| Brake | `↓` or `S` | `BRK` | `LT` / `B` |
| Punch | `J` or `Z` | `HIT` | `A` |
| Kick | `K` or `X` | `KICK` | `B` |
| Boost | `Shift` or `L` | `BOOST` | `Y` / `RB` |
| Horn | `H` or `Space` | — | `X` |
| Pause | `Esc` or `P` | — | `Start` |

On a phone, turn it sideways. Touch controls fade in as soon as a thumb touches
the glass and fade out again when you go back to a keyboard. Tilt steering is
off by default and can be enabled in Settings (iOS will ask permission).

## Testing

```bash
npm test           # 152 unit and simulation tests
npm run typecheck  # tsc --noEmit, strict
npm run coverage
npm run gate       # the ironclad gate: the definition of done
```

Two harnesses beyond the unit tests:

```bash
node scripts/balance.ts          # plays every circuit with an AI driver, reports
                                 # lap times, damage, finishing positions
node scripts/qa.mjs http://localhost:5173/   # Playwright: real playthrough across
                                 # four viewports, reports console errors, FPS,
                                 # overflow, and writes screenshots to ./qa
```

The balance harness is how the game is tuned. It drives the player with the same
`think()` the rivals use and reports whether each circuit is actually finishable:

```
circuit          bike         result       time  laps  pos   dmg    hp  downs
shivajinagar     ns200        finished   107.8s   2/2    2    57   100      0
talao-pali       ns200        finished   143.2s   3/3    4    65   100      0
malshej          interceptor  finished    51.3s   1/1    3    44    72      3
```

---

## How it works

### The road is genuinely pseudo-3D

Not a 3D engine dressed up as a retro one. The road is a ribbon of segments,
each with a `curve` and a world-space `y`. Every frame the renderer walks
forward from the camera's segment, accumulates the curve into a lateral offset,
and projects both edges of each segment by the law of similar triangles:

```
d      = 1 / tan(fov / 2)        // camera to projection plane
scale  = d / z
screenX = width/2  + scale · cameraX · width/2
screenY = height/2 − scale · cameraY · height/2
screenW = scale · roadWidth · width/2
```

Curves are faked by offsetting `cameraX` per segment; hills are real 3D height
projection. Segments are filled back-to-front, so the painter's algorithm gives
occlusion for free and a crest genuinely hides the road behind it.

Everything else on the road plane — scenery, traffic, rivals — is positioned
relative to the segment's own projected half-width `screenW`, which is what
keeps a chai stall glued to the verge through a bend and over a hill.

### Handling is derived, never hand-tuned

`game/tuning.ts` turns published specifications into handling numbers. Power-to-
weight drives acceleration, mass and wheelbase drive agility, mass drives
toughness and how far a kick throws you:

```
Classic 350:  349cc · 20.2 bhp · 27 Nm · 195 kg · 1390 mm  → heavy, runs wide, hits hard
RX 100:        98cc · 10.9 bhp · 10 Nm · 103 kg · 1245 mm  → flickable, fragile, gone
```

Nothing is balanced by hand, so the garage ordering cannot drift out of sync
with the spec sheet. A test asserts the Duke is fastest, the RX 100 turns harder
than the Interceptor, and the auto is the least agile thing on the road.

### The simulation is headless

`src/game/` imports no canvas, no `AudioContext` and no DOM. A full race — six
riders, traffic, combat, police — runs faster than real time in a Node test.
That is how four genuine bugs were found before a pixel was drawn: a
self-contradictory remount condition that stranded riders permanently, shunt and
traffic collisions re-firing 120 times a second, a starting grid placed behind
the finish line, and rider health that never regenerated.

### Every sprite is drawn in code

Thirteen bikes built from their real proportions and painted from their real
liveries; thirty-nine roadside props including a banyan with aerial roots, a
chai tapri with a Brooke Bond board, Russell Market's clock tower, St Mary's
Basilica, and an Ashok Leyland tailboard reading HORN OK PLEASE; nine traffic
vehicles; five skies. All rasterised once into offscreen canvases at load, then
blitted — which is why 200 sprites on screen still holds 60 fps.

### The engines are synthesised, not sampled

A four-stroke fires once every two crank revolutions, a two-stroke once every
revolution. That firing rate *is* the fundamental you hear — a Bullet at 1000 rpm
is a pulse train at 8.3 Hz, which is why you can count the thumps. Each engine
is a custom `PeriodicWave` whose harmonic series is shaped by three numbers:

- **thump** tilts energy into the low harmonics — the long-stroke 350 single
- **ring** adds a resonant peak that sweeps and screams as the two-stroke comes
  on the pipe at 5,500 rpm
- **rasp** lifts the upper mids — the Duke's industrial top-end clatter

The Interceptor's 270° crank is modelled as it is built: cylinder two fires
three-quarters of a revolution after cylinder one, giving the 270/450 limp
instead of an even beat. Road speed drives rpm *through a gearbox*, so the note
sweeps, drops on the shift, and sweeps again.

### The soundtrack is raga-derived

Not "minor scale with a sitar on top". Malkauns `[0,3,5,8,10]` for the heavy
material — pure pentatonic doom with no brightness anywhere — over a distorted
power-chord riff; Bhairav `[0,1,4,5,7,8,11]`, the double-harmonic, for lead
lines; Darbari for the thriller chapters; Todi's tritone for the ghats.
Percussion follows the Keherwa theka (8 beats, resonant-then-dry) or Teentaal
double-time for the chases, under a continuously running tanpura drone with a
slow filter sweep standing in for the jivari buzz.

---

## Architecture

```
core   ← track ← data ← game ← render ← ui
                          ↖ audio
```

Enforced by the ironclad gate, not by good intentions:

| Layer | May import | Why |
|---|---|---|
| `core/` | nothing | maths, projection, loop, input, storage, events |
| `track/` | core | road geometry and scenery — pure, testable, no canvas |
| `data/` | core, track | declarative content: bikes, circuits, traffic |
| `game/` | core, track, data | the simulation. **No render, ui or audio** |
| `render/` | core, track, data, game | reads state, draws pixels. No audio, no DOM structure |
| `audio/` | core, data | driven by events and plain data only |
| `ui/` | anything | screens, presenter, viewport |

`game/` cannot import `render/` or `audio/`, which is what forces the simulation
to stay headless. It broadcasts (`game/broadcast.ts`) and emits events; the
presentation layers subscribe.

## Deploying

The build is a static bundle with relative asset paths, so it works from any
subdirectory:

```bash
npm run build
# dist/ → Netlify, Vercel, GitHub Pages, S3, or any static host
```

A service worker and web manifest are generated, so it installs to a phone home
screen and runs offline after the first load.

**On spawn.co:** spawn.co is a closed, prompt-driven platform with no public API,
SDK or import path, so this game cannot be pushed to it programmatically. See
[`SPAWN.md`](SPAWN.md) for a paste-ready prompt that describes this game for
spawn.co's builder, and for what to expect from it.

## Licence

MIT. All bike and place names are used descriptively; no trademark affiliation
is claimed or implied.
