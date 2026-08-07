# Known unknowns

Every uncertainty is either researched with a citation, or recorded as an
explicit assumption with its blast radius. Guessing silently is not on the list.

| # | Packet | Unknown | State | Resolution |
|---|---|---|---|---|
| U-1 | P-0 | Does spawn.co expose an API, SDK or import path? | RESOLVED | No. It is a closed prompt-driven platform generating against Phaser/Excalibur internally, with no public developer surface. Deliverable is therefore a self-hosted static build plus `SPAWN.md`, a paste-ready prompt. Sources: spawn.co, spawntools.ai docs. |
| U-2 | P-1 | Exact segmented pseudo-3D projection and fake-curve accumulation | RESOLVED | `d = 1/tan(fov/2)`, `scale = d/z`; curves need both `x` and `dx` because a curve is a second-order equation. Sources: Lou's Pseudo-3D page; Jake Gordon's javascript-racer derivation (v1 straights, v2 curves). |
| U-3 | P-3 | Real specifications for the thirteen machines | RESOLVED | Researched with citations per bike; each `BikeSpec.note` records the claim being made. Power normalised to bhp (1 PS = 0.9863 bhp). |
| U-4 | P-3 | Published wheelbase figures for every bike | ASSUMED | Approximate published figures used purely as a turn-in proxy, documented as such in `data/types.ts`. **Blast radius:** agility ordering only, and mass contributes 55% of it. **Detector:** `tests/content.test.ts` asserts the ordering the design depends on (RX 100 turns harder than Interceptor; auto is least agile). |
| U-5 | P-3 | Yezdi Roadking torque, and 0–60 times generally | ASSUMED | Period press estimates, not manufacturer datasheets. Marked `[ESTIMATE]` in the research and reflected in the bike's `note`. **Blast radius:** one bike's low-end shove. |
| U-6 | P-4 | Visual and traffic character of each circuit | RESOLVED | Researched per location with sources; each `CircuitSpec.note` records the specific claim (road widths, landmarks, elevation, surface). |
| U-7 | P-8 | Traffic density that is Indian without being impassable | RESOLVED | Empirically, by `scripts/balance.ts`. Initial spacing of 900–3,000 units put a vehicle every 0.2s at racing speed — an unavoidable wall. Now interpolated 9,000–26,000 units by circuit density, giving one vehicle every 1–3 seconds. |
| U-8 | P-12 | How each engine actually sounds, and why | RESOLVED | Researched: four-stroke fires every 720°, two-stroke every 360°; the Bullet's 85.8mm stroke against a 72mm bore gives the long dwell; the RX 100's expansion chamber produces a 1.5–3 kHz ring that arrives at ~5,500 rpm; the Interceptor's 270° crank gives a 270/450 interval. |
| U-9 | P-12 | Whether synthesis alone can carry the engine note | ASSUMED | A custom `PeriodicWave` per bike, shaped by thump/ring/rasp, driven through a gearbox. **Blast radius:** audio identity of the bikes, which is a stated goal. **Detector:** listen to two bikes back to back; if they are indistinguishable the model has failed. Not automatable. |
| U-10 | P-13 | Correct interval patterns for the ragas used | RESOLVED | Malkauns `[0,3,5,8,10]`, Bhairav `[0,1,4,5,7,8,11]`, Darbari `[0,2,3,5,7,8,10]`, Todi `[0,1,3,6,7,8,11]`, Kirwani `[0,2,4,5,7,9,10]`, Bhairavi `[0,1,3,5,7,8,10]`, Charukeshi `[0,2,4,5,7,8,10]`, Bhoopali `[0,2,4,7,9]`; Keherwa is 8 beats with beats 1–4 resonant and 5–8 dry. Cited in `audio/music.ts`. |
| U-11 | P-16 | Three-wheeler handling and correct city liveries | RESOLVED | Delta layout: one steered front wheel, two driven rear; high CoG against a ~1,200mm track means it tips rather than slides; cannot lean. Liveries: Mumbai and Pune black-and-yellow, Bengaluru and Delhi green-and-yellow, Chennai all yellow. |
| U-12 | P-11 | What sprite scale reads correctly at this camera | RESOLVED | Empirically, by looking at QA screenshots. Physically-derived widths (metres converted to road half-widths) produced props several screen-widths across that hid the entire road. Now tuned to how the camera reads, with distance-based culling and a fade-in. |

## Protocol

An unknown is not closed by deciding it does not matter. It is closed by a
citation, or by an assumption that names its blast radius and, where possible,
the test that would catch it being wrong.
