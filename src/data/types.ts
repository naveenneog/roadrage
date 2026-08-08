/**
 * Vehicle and content types. Authored in real-world units — the game's handling
 * numbers are derived from these (see `game/tuning.ts`) rather than hand-waved,
 * so a Bullet feels heavy because it *is* heavy.
 */

export type BikeClass = 'commuter' | 'classic' | 'twostroke' | 'sport' | 'modern' | 'auto';

export interface EngineVoice {
  /** Cylinders firing per crank revolution — sets the fundamental pulse rate. */
  firingOrder: number;
  /** 2-stroke fires every revolution, 4-stroke every other. */
  stroke: 2 | 4;
  /** Idle and redline in rpm — the synthesiser sweeps between them. */
  idleRpm: number;
  redlineRpm: number;
  /** Uneven firing (e.g. a 270-degree crank twin) — 0 is perfectly even. */
  crankOffset: number;
  /** Relative strength of the low thump vs the upper harmonic bark, 0..1. */
  thump: number;
  /** Two-stroke ring: a resonant peak that screams as the powerband hits. */
  ring: number;
  /** Intake roar mixed under the exhaust. */
  induction: number;
  /** Exhaust rasp — filtered noise riding on the tone. */
  rasp: number;
  /** Base gain so a 650 twin is genuinely louder than a 98cc single. */
  loudness: number;
}

export interface BikePalette {
  frame: string;
  tank: string;
  tankStripe: string;
  seat: string;
  engine: string;
  exhaust: string;
  rim: string;
  accent: string;
  riderJacket: string;
  riderHelmet: string;
}

export interface BikeSpec {
  id: string;
  name: string;
  maker: string;
  /** Production era, shown in the garage. */
  era: string;
  cc: number;
  bhp: number;
  torqueNm: number;
  weightKg: number;
  topSpeedKmh: number;
  gears: number;
  price: number;
  class: BikeClass;
  /** Wheelbase in mm — the single best predictor of how eagerly a bike turns. */
  wheelbaseMm: number;
  voice: EngineVoice;
  palette: BikePalette;
  /** One line of character for the garage screen. */
  blurb: string;
  /** Cited real-world note, kept honest and separate from the flavour text. */
  note: string;
  /** Set for the three-wheeler: changes physics, art and camera. */
  threeWheeler?: boolean;
}

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night' | 'monsoon';

export interface SkyPalette {
  top: string;
  middle: string;
  horizon: string;
  sun: string | null;
  haze: string;
  /** Distant city silhouette colour. */
  skyline: string;
  /** Additive tint laid over the whole frame; sells the hour more than anything else. */
  grade: string;
  gradeAlpha: number;
}

export interface SurfacePalette {
  road: [string, string];
  rumble: [string, string];
  lane: string;
  /** Kerb stone immediately outside the rumble strip. */
  kerb: [string, string];
  /** Near shoulder: footpath in a city, gravel on a highway, mud in a ghat. */
  shoulder: [string, string];
  /** The far ground running out to the horizon. */
  grass: [string, string];
  /** Scattered detail on the shoulder — cracks, gravel, litter, puddles. */
  detail: [string, string];
  fog: string;
}

export interface TrafficSpec {
  id: string;
  name: string;
  /** Real cruising speed band in Indian traffic, not the vehicle's top speed. */
  minKmh: number;
  maxKmh: number;
  /** Occupied width in road half-widths. */
  width: number;
  /** 0..1 — how much it hurts to hit, and how little it moves when you do. */
  mass: number;
  /** 0..1 — tendency to wander across lanes. */
  weaves: number;
  /** Body, trim and detail colours for the procedural painter. */
  palette: [string, string, string];
  note: string;
}

export interface CircuitSpec {  id: string;
  name: string;
  city: string;
  /** Shown under the name — the actual street or stretch this is drawn from. */
  location: string;
  laps: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  timeOfDay: TimeOfDay;
  sky: SkyPalette;
  surface: SurfacePalette;
  /** Prop ids weighted for roadside scatter. */
  scenery: Array<{ id: string; weight: number; minOffset: number; maxOffset: number; scale?: number }>;
  /** Density of scenery placement, 0..1 per segment per side. */
  sceneryDensity: number;
  /** Traffic vehicles that appear, with relative frequency. */
  traffic: Array<{ id: string; weight: number }>;
  trafficDensity: number;
  /**
   * Fraction of traffic travelling toward you. Zero on a divided carriageway,
   * high on an undivided two-lane where the opposing lane is a real hazard.
   */
  oncomingShare?: number;
  /** Fog thickness — Malshej in monsoon is a different game to Marine Drive at noon. */
  fogDensity: number;
  /** Prize money for first place. */
  purse: number;
  entryFee: number;
  /** Authored road script. */
  script: unknown[];
  blurb: string;
  /** What the place actually looks like — kept as text so the art has a brief to hit. */
  note: string;
}
