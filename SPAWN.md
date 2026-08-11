# Building this on spawn.co

## What spawn.co is, and what it is not

[spawn.co](https://www.spawn.co/create) is a prompt-driven game builder: you
describe a game in natural language and its agent ("savi") builds a multiplayer
browser game inside their platform, generating against engines like Phaser and
Excalibur under the hood.

**It is a closed system.** As of this build there is no public API, no SDK, no
import path and no documented way to push an existing codebase into it. That
means this repository cannot be deployed *to* spawn.co programmatically — the
only way in is to describe the game and let their agent build its own version.

So this project is a real, self-hosted, deployable game (`npm run build` → any
static host), and this file is the paste-ready prompt for spawn.co if you also
want a version living there.

If spawn.co later ships an import path or an API, the build in `dist/` is a
plain static bundle with relative paths and no server dependency, which is the
easiest possible thing to port.

---

## Paste-ready prompt

Copy everything between the rules into spawn.co/create.

---

Build **RoadRage** — a pseudo-3D arcade motorcycle combat racer set on real
Indian streets. Think 16-bit rear-view street racing: sprite-scaling road, and
you win by riding fast *and* by punching and kicking the riders next to you off
their bikes.

**Core loop, and it must be fun inside thirty seconds:** you are already moving
when it loads. Hold throttle, weave through traffic, pull alongside a rival,
kick them into a bus. No menu wall — the menu is behind Escape.

**Camera and road:** rear-chase, segmented pseudo-3D. The road is a ribbon of
segments each with a curve value and a height; project with `scale = d/z` where
`d = 1/tan(fov/2)`. Fake the curves by accumulating a lateral camera offset per
segment; do the hills as real height projection. Draw back-to-front so crests
hide the road behind them. Widen the field of view with speed — that is where
the sensation of speed comes from.

**Bikes — use the real Indian machines and the real specifications:**
- Hero Splendor+ — 97cc, 7.9 bhp, 112 kg, 87 km/h (the starter)
- Yamaha RX 100 — 98cc two-stroke, 10.9 bhp, 103 kg, 110 km/h (light, screams)
- Yezdi Roadking — 246cc two-stroke, 16 bhp, 132 kg, 122 km/h
- Royal Enfield Classic 350 — 349cc, 20.2 bhp, 27 Nm, 195 kg, 113 km/h (heavy, thumps)
- Jawa 42 — 295cc, 26.9 bhp, 183 kg, 130 km/h
- TVS Apache RTR 200 4V — 198cc, 20.5 bhp, 152 kg, 127 km/h
- Bajaj Pulsar 220F — 220cc, 20.1 bhp, 160 kg, 140 km/h
- Bajaj Pulsar NS200 — 200cc, 24.2 bhp, 158 kg, 136 km/h
- Yezdi Roadster — 334cc, 29 bhp, 184 kg, 135 km/h
- Yamaha RD 350 — 347cc two-stroke twin, 30.5 bhp, 155 kg, 145 km/h
- KTM 390 Duke — 399cc, 44.3 bhp, 165 kg, 175 km/h (the fast one)
- Royal Enfield Interceptor 650 — 648cc parallel twin, 47 bhp, 218 kg, 170 km/h

Derive handling from those numbers rather than hand-tuning: power-to-weight
drives acceleration, mass and wheelbase drive agility, mass drives how tough you
are in a collision and how far a kick throws you. A 195 kg Bullet should run wide
in a bend and shrug off a shunt; a 103 kg RX 100 should flick and get thrown.

**Circuits — real places, and make them look like themselves:**
1. **Shivajinagar, Bengaluru** at dawn — Commercial Street's 6–8 m canyon of
   shopfronts and awnings, Russell Market's clock tower, St Mary's Basilica
   opening the street into sudden space, the KSRTC bus terminal.
2. **Talao Pali, Thane** — flat 2 km lakeside loop, the beginner circuit.
3. **SB Road, Pune** at midnight — six-lane boulevard, gulmohar trees, the
   Pataleshwar rock-cut temple set back off the road.
4. **Ghodbunder Road, Thane** at dusk — 18 km of six-lane arterial, highrises on
   one side, the Yeoor forest ridge on the other, cement trucks everywhere.
5. **Marine Drive, Mumbai** at night — 3 km of unbroken curve, the Art Deco
   frontage, the Queen's Necklace streetlights, the sea.
6. **Yeoor Hills, Thane** in monsoon — 150 m of climb in 3 km, closed forest
   canopy, switchbacks, no guardrail.
7. **Malshej Ghat** in monsoon — hairpins at 700 m, fog, waterfalls that land on
   the carriageway.
8. **Siolim, Goa** at sundown — coconut groves, laterite cuttings, coastal NH-66.
9. **Chandni Chowk, Delhi** at night — galis narrower than the bike is long,
   overhead cabling thick enough to walk on.

**Traffic, and it has to be Indian traffic:** auto rickshaws that never hold a
lane, a Splendor with a family of four on it, Tata Ace tempos, BEST and BMTC
buses, Maruti 800s, cycle rickshaws, bullock carts, and Ashok Leyland trucks with
HORN OK PLEASE painted across the tailboard. Cows standing in the road that you
must not hit. Stray dogs. Unmarked speed breakers and potholes.

**Roadside scenery:** banyan trees with aerial roots, gulmohar, coconut palms,
rain trees; chai tapris with orange tea-brand boards, paan shops, roadside
temples with marigolds, mosques, colonial Cantonment facades, political flex
banners with a beaming portrait, hoardings, bus shelters covered in flyposters,
open nullahs, construction barricades, sodium streetlights.

**Combat:** punch (fast, light) and kick (slow, heavy, knocks riders down), both
with windup/active/recovery frames. Stamina gates spamming. Two swings meeting
cancel into a block. Weapons — chain, cricket bat, lathi — can be picked up from
riders you put down. Every landed hit needs hitstop (a few frozen frames),
screenshake, impact particles and a layered sound. This is what makes it feel
good; do not skip it.

**Police:** heat-based, not instant. Sustained speed and crashing into traffic
earn attention; backing off cools it. Escalates through three levels of sirens.

**The Auto Rickshaw Edition — "Night Fare":** a six-chapter thriller campaign,
all at night, all in a Bajaj RE auto rickshaw (236cc, 10.3 bhp, 362 kg, 65 km/h,
one wheel at the front that steers and two at the back that drive). It is a
terrible racer, so make it not a race: it is a pursuit you are losing. A woman
gets in at Shivajinagar bus stand at 11:40pm and says "drive". Chapters run
Shivajinagar → Ghodbunder → Yeoor in the rain → Marine Drive → Chandni Chowk →
Malshej. She never says where she is going, only that you must not stop. Model
the three-wheeler properly: no lean, high centre of gravity, visible body roll
that builds toward a tip-over in fast corners, and correct city liveries
(Mumbai and Pune black-and-yellow, Bengaluru and Delhi green-and-yellow, Chennai
all yellow). Pay for surviving, not for winning.

**Audio — synthesise it, do not sample it.** A four-stroke fires once every two
crank revolutions, a two-stroke once every revolution; that firing rate is the
fundamental. The Enfield's long-stroke single should thump, the RX 100 should
come on the pipe at 5,500 rpm with a bright resonant ring, the Interceptor's
270-degree crank should give an uneven 270/450 beat, and the Duke should clatter.
Run road speed through a gearbox so the note sweeps, drops on the shift, and
sweeps again. Soundtrack: Malkauns `[0,3,5,8,10]` over a distorted riff for the
heavy material, Bhairav `[0,1,4,5,7,8,11]` for leads, Darbari for the thriller,
on a Keherwa 8-beat theka with a tanpura drone underneath.

**It must play on a phone.** Landscape, on-screen thumb controls (steering left,
throttle and attacks right) that appear only when touched, optional tilt
steering, and a manifest plus service worker so it installs to the home screen
and runs offline.

**Art direction:** generate everything procedurally — no stock assets. Chunky,
readable, saturated, with a per-circuit colour grade for the hour of day: dawn
haze in Bengaluru, sodium orange at night in Mumbai, flat grey monsoon light in
the ghats.

**Do not** make it a generic outrun clone with Indian names pasted on. The
specific places, the specific machines, the specific noise they make, and the
auto rickshaw thriller are the whole point.

---

## What to expect back

spawn.co's agent builds in its own engine and will make its own decisions. It is
very unlikely to reproduce the derived handling model, the raga-based procedural
soundtrack or the per-bike engine synthesis, because those are deep
implementation choices rather than surface description. Treat what comes back as
a fast prototype of the concept, and this repository as the finished article.
