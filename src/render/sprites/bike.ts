import type { BikePalette, BikeSpec } from '../../data/types.ts';
import { Painter } from '../painter.ts';
import { darken, lighten, luminance, mix, withAlpha } from '../palette.ts';

/**
 * Rear-three-quarter view of a rider on a bike, drawn entirely in code.
 *
 * The silhouette is driven by the machine's real proportions: a 195 kg Bullet
 * with a 1390 mm wheelbase gets a long, low, fat-tanked shape; a 103 kg RX100
 * gets a short, narrow, upright one. The class then adds the details that make
 * each one identifiable — spoked rims and a chrome mudguard on the classics,
 * a belly pan and split seat on the sport bikes, twin pipes on the two-stroke twin.
 */

export interface BikeFrameOptions {
  /** -2..2: full left lock through upright to full right lock. */
  lean: number;
  /**
   * 0 = no swing, 1 = punch strike, 2 = kick strike, 3 = arm cocked back.
   *
   * The windup pose matters more than it looks: a swing that snaps straight to
   * full extension has no anticipation, and reads as a decal being toggled on.
   */
  action: 0 | 1 | 2 | 3;
  /** Which side the rider is swinging toward. */
  actionSide: -1 | 1;
  /** True while the rider is down, which draws a wreck instead. */
  down: boolean;
  /**
   * How far through the spill: 0 tumbling, 1 sprawled, 2 getting up,
   * 3 running back to the machine. A single frozen wreck pose held for two
   * seconds is the least convincing thing in the game.
   */
  downStage?: 0 | 1 | 2 | 3;
  /** 0..1 brake-light and rear-lamp intensity. */
  lamp: number;
  /** Omit the rear wheel so the renderer can draw and spin its own. */
  bodyOnly?: boolean;
  /** Registration mark to stamp on the tail, e.g. `KA 01`. */
  plate?: string;
}

/** Where the rear wheel sits in the sprite box, so the renderer can place it. */
export const wheelAnchor = (spec: BikeSpec): { y: number; r: number } => {
  const prop = proportionsFor(spec);
  return { y: WHEEL_Y, r: prop.wheel };
};

/**
 * The rear tyre's centre. Fixed for every machine so the contact patch — and
 * therefore the pivot the renderer leans about — is always in the same place.
 */
const WHEEL_Y = 0.795;

/**
 * Lift a colour until it is unmistakably brighter than the machine.
 *
 * Several of the authored jackets are near-black, which is accurate to the
 * real thing and useless on screen: the rider merges into the bike and the
 * whole sprite becomes one shape. Riders are the read, so they get a floor.
 */
const hiVis = (hex: string, floor = 0.34): string => {
  const l = luminance(hex);
  return l >= floor ? hex : lighten(hex, Math.min(0.78, (floor - l) * 1.9));
};

/**
 * The rider's jacket, guaranteed to separate from the machine.
 *
 * A jacket darker than about a quarter value is pulled toward the bike's accent
 * colour first — that keeps each machine's character instead of washing every
 * rider to the same grey. The value is then pushed away from the tank's in
 * whichever direction there is room: on a white RD350 the readable answer is a
 * darker jacket, not a brighter one.
 */
export const jacketFor = (palette: BikePalette): string => {
  const base = luminance(palette.riderJacket) < 0.30
    ? mix(palette.riderJacket, palette.accent, 0.64)
    : palette.riderJacket;
  const tank = luminance(palette.tank);
  const lifted = hiVis(base, 0.46);
  if (Math.abs(luminance(lifted) - tank) >= 0.20) return lifted;
  return tank > 0.5 ? darken(base, 0.52) : lighten(base, 0.42);
};

/** Silhouette proportions derived from the real machine. */
interface Proportions {
  /** Overall body width as a fraction of the sprite box. */
  width: number;
  /** Seat height — how tall the rider sits. */
  stance: number;
  /** Tank bulk. */
  tank: number;
  /** Wheel radius. */
  wheel: number;
  /** Fairing presence, 0 = naked, 1 = full. */
  fairing: number;
}

const proportionsFor = (spec: BikeSpec): Proportions => {
  const mass = Math.min(1, (spec.weightKg - 95) / 130);
  const long = Math.min(1, (spec.wheelbaseMm - 1220) / 240);
  switch (spec.class) {
    case 'classic':
      return { width: 0.44 + mass * 0.09, stance: 0.60, tank: 0.90, wheel: 0.192, fairing: 0 };
    case 'twostroke':
      return { width: 0.37 + mass * 0.07, stance: 0.56, tank: 0.62, wheel: 0.170, fairing: 0.1 };
    case 'sport':
      return { width: 0.39 + mass * 0.08, stance: 0.52, tank: 0.72, wheel: 0.184, fairing: 0.65 };
    case 'modern':
      return { width: 0.41 + mass * 0.09 + long * 0.03, stance: 0.55, tank: 0.82, wheel: 0.188, fairing: 0.35 };
    case 'commuter':
      return { width: 0.34, stance: 0.58, tank: 0.55, wheel: 0.164, fairing: 0 };
    default:
      return { width: 0.86, stance: 0.62, tank: 0.70, wheel: 0.150, fairing: 0 };
  }
};

/**
 * The rear wheel as its own sprite, so it can be rotated live.
 *
 * Baking the wheel into the body means the bike never visibly turns — the
 * single biggest reason a static rear-view sprite reads as a cardboard cutout.
 * Drawn square and centred so the renderer can spin it about its middle.
 */
export const paintBikeWheel = (p: Painter, spec: BikeSpec): void => {
  const palette = spec.palette;
  const spoked = spec.class === 'classic' || spec.class === 'twostroke' || spec.class === 'commuter';
  const r = 0.46;

  // Tyre: dark band with a lit shoulder so it reads as round, not flat.
  p.ellipse(0.5, 0.5, r, r, '#08090b');
  p.ellipse(0.5, 0.5, r * 0.97, r * 0.97, '#191b1f');
  p.ellipse(0.5 - r * 0.18, 0.5 - r * 0.16, r * 0.42, r * 0.46, '#272a2f');

  // Tread blocks around the shoulder — these are what make the spin visible.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    p.rect(
      0.5 + Math.cos(a) * r * 0.88 - r * 0.07,
      0.5 + Math.sin(a) * r * 0.88 - r * 0.06,
      r * 0.14, r * 0.12, '#0c0d10',
    );
  }

  // Rim.
  p.ellipse(0.5, 0.5, r * 0.66, r * 0.66, darken(palette.rim, 0.45));
  p.ellipse(0.5, 0.5, r * 0.60, r * 0.60, darken(palette.rim, 0.12));
  p.ellipse(0.5, 0.5, r * 0.54, r * 0.54, '#15171a');

  if (spoked) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      p.line(
        0.5 + Math.cos(a) * r * 0.16, 0.5 + Math.sin(a) * r * 0.16,
        0.5 + Math.cos(a) * r * 0.56, 0.5 + Math.sin(a) * r * 0.56,
        lighten(palette.rim, 0.25), 0.014,
      );
    }
  } else {
    // Cast alloy: five fat spokes.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      p.line(0.5, 0.5,
        0.5 + Math.cos(a) * r * 0.56, 0.5 + Math.sin(a) * r * 0.56,
        palette.rim, 0.075);
    }
  }

  // Brake disc and hub.
  p.ellipse(0.5, 0.5, r * 0.30, r * 0.30, mix(palette.rim, '#8c939b', 0.55));
  p.ellipse(0.5, 0.5, r * 0.24, r * 0.24, '#2a2d33');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    p.circle(0.5 + Math.cos(a) * r * 0.17, 0.5 + Math.sin(a) * r * 0.17, r * 0.035, '#15171a');
  }
  p.ellipse(0.5, 0.5, r * 0.12, r * 0.12, lighten(palette.rim, 0.1));
};
/**
 * A filled band between two radii — used for the mudguard curving over the tyre.
 * Assumes a square sprite box, which every bike frame is.
 */
const arcBand = (
  p: Painter, cx: number, cy: number,
  rInner: number, rOuter: number, a0: number, a1: number, fill: string,
): void => {
  const pts: Array<readonly [number, number]> = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([cx + Math.cos(a) * rOuter, cy + Math.sin(a) * rOuter]);
  }
  for (let i = steps; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([cx + Math.cos(a) * rInner, cy + Math.sin(a) * rInner]);
  }
  p.poly(pts, fill);
};

const drawRider = (
  p: Painter,
  palette: BikePalette,
  prop: Proportions,
  options: BikeFrameOptions,
): void => {
  const jacket = jacketFor(palette);
  const helmet = hiVis(palette.riderHelmet, 0.30);
  const shadow = darken(jacket, 0.42);
  const lit = lighten(jacket, 0.26);
  const halfBody = prop.width * 0.30;
  const torsoTop = 0.170 + prop.fairing * 0.03 - (prop.stance - 0.56) * 0.10;
  const torsoBottom = 0.425;
  // Weight shifts across the seat with the lean, and the shoulders counter-lean
  // slightly — that offset is what makes a turn read as a rider, not a decal.
  const shift = options.lean * 0.022;
  const counter = -options.lean * 0.010;
  // Boots sit just outside the tyre so the wheel is never hidden behind a pair
  // of thighs, but the knees stay tucked against the tank where they belong.
  const bootX = prop.wheel + 0.024;
  const kneeX = prop.wheel * 0.58;
  // Trousers are the raw authored jacket colour rather than the brightened one:
  // the rider's legs are in the machine's shadow, and a light lower half turns
  // the whole sprite into a bottom-heavy blob.
  const trouser = darken(palette.riderJacket, 0.18);

  // Legs gripping the tank, the outside one pushed out through a turn.
  const outerLeg = options.lean > 0 ? 1 : -1;
  for (const side of [-1, 1] as const) {
    const flare = side === outerLeg ? Math.abs(options.lean) * 0.014 : 0;
    const kx = 0.5 + side * (kneeX + flare) + shift;
    const bx = 0.5 + side * (bootX + flare) + shift;
    // Hip to knee, then knee to boot.
    p.line(0.5 + side * halfBody * 0.58 + shift, 0.400, kx, 0.516, trouser, 0.074);
    p.line(kx, 0.510, bx, 0.626, darken(trouser, 0.28), 0.060);
    // Knee armour catches the light and pins the joint.
    p.circle(kx, 0.514, 0.026, darken(trouser, 0.34));
    p.circle(kx - side * 0.005, 0.508, 0.014, lighten(trouser, 0.22));
  }
  // Boots on the pegs.
  for (const side of [-1, 1] as const) {
    const flare = side === outerLeg ? Math.abs(options.lean) * 0.014 : 0;
    const bx = 0.5 + side * (bootX + flare) + shift;
    p.roundRect(bx - 0.044, 0.616, 0.088, 0.052, 0.018, '#16181b');
    p.rect(bx - 0.036, 0.621, 0.072, 0.009, '#3a3e45');
    p.rect(bx - 0.044, 0.657, 0.088, 0.011, '#08090b');
    // Peg poking out under the heel.
    p.rect(bx - side * 0.056, 0.642, 0.028, 0.012, mix(palette.rim, '#70767e', 0.6));
  }

  // Torso, seen from behind: shoulders wide, waist narrow. A plain rectangle
  // here is why the rider read as a slab — a person tapers.
  const tx = 0.5 + shift + counter;
  const waist = halfBody * 0.74;
  const shoulderY = torsoTop + 0.055;
  p.poly([
    [tx - halfBody * 0.78, torsoTop],
    [tx + halfBody * 0.78, torsoTop],
    [tx + halfBody, shoulderY],
    [tx + waist, torsoBottom],
    [tx - waist, torsoBottom],
    [tx - halfBody, shoulderY],
  ], jacket);
  // Shaded flank down the right, so the back is a cylinder and not a card.
  p.poly([
    [tx + halfBody * 0.30, torsoTop + 0.010],
    [tx + halfBody * 0.86, shoulderY],
    [tx + waist, torsoBottom],
    [tx + waist * 0.36, torsoBottom],
  ], shadow);
  // Spine ridge and the lit shoulder on the raised side.
  p.rect(tx - halfBody * 0.13, torsoTop + 0.020, halfBody * 0.26, torsoBottom - torsoTop - 0.055,
    lighten(jacket, 0.14));
  p.roundRect(tx - halfBody * (options.lean >= 0 ? 0.94 : 0.30), torsoTop + 0.014,
    halfBody * 0.62, 0.062, 0.026, lit);
  // Racing panels: a light block over each shoulder running down the outside
  // of the arm. Real leathers are blocked in high contrast precisely so a rider
  // reads at distance, and it is the cheapest legibility win on the sprite.
  const panel = lighten(jacket, 0.52);
  const stripe = mix(palette.accent, '#e8e9ec', 0.35);
  for (const side of [-1, 1] as const) {
    p.poly([
      [tx + side * halfBody * 0.36, torsoTop + 0.008],
      [tx + side * halfBody * 0.92, shoulderY - 0.004],
      [tx + side * halfBody * 0.86, shoulderY + 0.070],
      [tx + side * halfBody * 0.34, shoulderY + 0.040],
    ], panel);
    p.line(tx + side * halfBody * 0.60, torsoTop + 0.020,
      tx + side * halfBody * 0.58, shoulderY + 0.052, stripe, 0.016);
  }

  // Racing hump behind the helmet — the silhouette cue that says leathers.
  p.ellipse(tx, torsoTop + 0.018, halfBody * 0.46, 0.030, lit);
  // Belt, dark, where the jacket meets the trousers. Two shapes instead of one
  // is what stops the rider merging into a single vertical smear.
  p.roundRect(tx - waist * 1.06, torsoBottom - 0.030, waist * 2.12, 0.044, 0.014,
    darken(palette.riderJacket, 0.35));
  p.rect(tx - waist * 0.22, torsoBottom - 0.024, waist * 0.44, 0.030,
    mix(palette.accent, '#3a3d43', 0.4));

  // Arms reaching to the bars; the swinging one leaves the handlebar.
  // Each arm is stroked twice — a dark casing then a lighter core — so it stays
  // a distinct limb against the torso instead of merging into one blob.
  const armY = torsoTop + 0.085;
  const swing = options.action;
  // Action 3 is the wind-up: the arm is cocked back across the body and drawn
  // in tight, so the strike frame that follows reads as a release.
  const winding = swing === 3;
  const armDark = darken(jacket, 0.62);
  for (const side of [-1, 1] as const) {
    const swinging = swing > 0 && side === options.actionSide;
    const striking = swinging && !winding;
    // A cocked arm pulls back past the torso; a striking arm extends past it.
    const reach = striking ? (swing === 2 ? 0.34 : 0.27)
      : swinging ? halfBody * 0.34
      : halfBody * 1.02;
    // Hands sit well below the shoulders on a real bike — the arms run down
    // and forward to the bars, they do not stick out sideways.
    const drop = striking ? (swing === 2 ? 0.10 : 0.0)
      : swinging ? -0.035
      : 0.150;
    const shoulderX = tx + side * halfBody * 0.82;
    const handX = 0.5 + side * reach + (swinging ? 0 : shift * 0.4);
    // Upper arm then forearm, with a bend at the elbow. The cocked arm bends
    // the other way, which is what makes it read as loaded rather than limp.
    const elbowX = (shoulderX + handX) / 2 + side * (swinging && winding ? 0.052 : 0.018);
    const elbowY = armY + drop * 0.45 + (winding && swinging ? 0.040 : 0.022);
    const core = swinging ? lighten(jacket, 0.34) : lighten(jacket, 0.12);
    p.line(shoulderX, armY, elbowX, elbowY, armDark, 0.068);
    p.line(elbowX, elbowY, handX, armY + drop, armDark, 0.058);
    p.line(shoulderX, armY, elbowX, elbowY, core, 0.048);
    p.line(elbowX, elbowY, handX, armY + drop, swinging ? core : jacket, 0.038);
    // Elbow armour catches the light and pins the joint.
    p.circle(elbowX, elbowY, 0.026, armDark);
    p.circle(elbowX - 0.004, elbowY - 0.005, 0.017, lighten(jacket, 0.30));
    // Glove.
    p.circle(handX, armY + drop, swinging ? 0.040 : 0.030, '#141518');
    p.circle(handX - side * 0.005, armY + drop - 0.006, swinging ? 0.030 : 0.021,
      swinging ? mix(jacket, '#d8b487', 0.7) : '#33363c');
  }

  // Helmet: shell, visor band, rim light and a highlight. Round, not a disc —
  // a wide flat ellipse here is what made the rider read as a floating blob.
  const headY = torsoTop - 0.044;
  const hx = tx + counter * 0.6;
  const hr = halfBody * 0.50;
  p.ellipse(hx, headY, hr * 1.06, hr * 1.02, darken(helmet, 0.55));
  p.ellipse(hx, headY - 0.004, hr, hr * 0.96, helmet);
  // Visor aperture wrapping round the back of the shell.
  p.ellipse(hx, headY + 0.004, hr * 0.94, hr * 0.40, darken(helmet, 0.62));
  p.ellipse(hx, headY + 0.001, hr * 0.86, hr * 0.30, darken(helmet, 0.45));
  // Sky catching the crown, and a rim light down the lit side.
  p.ellipse(hx - hr * 0.30, headY - hr * 0.42, hr * 0.40, hr * 0.22, lighten(helmet, 0.50));
  p.ellipse(hx - hr * 0.86, headY, hr * 0.14, hr * 0.62, lighten(helmet, 0.28));
  // Chin bar peeking under the shell.
  p.ellipse(hx, headY + hr * 0.72, hr * 0.66, hr * 0.24, darken(helmet, 0.35));
};

/**
 * A downed rider, in four stages: tumbling, sprawled, getting up, running back.
 *
 * The bike lies where it fell in all four; only the rider changes. That is what
 * sells it — a spill is the machine stopping and the person carrying on.
 */
const drawWreck = (p: Painter, palette: BikePalette, stage: 0 | 1 | 2 | 3): void => {
  p.ellipse(0.5, 0.945, 0.44, 0.050, 'rgba(0,0,0,0.38)');

  // The machine laid over on its side and sliding away from the viewer. Drawn
  // with explicit coordinates rather than one big rotation: a rotated upright
  // bike reads as a glitch, a purpose-drawn one reads as a crash.
  // Wheels first so the body overlaps them and it stays one machine.
  p.ellipse(0.26, 0.760, 0.150, 0.128, '#0b0c0e');
  p.ellipse(0.26, 0.760, 0.135, 0.114, '#1b1d21');
  p.ellipse(0.26, 0.760, 0.078, 0.066, darken(palette.rim, 0.25));
  p.ellipse(0.26, 0.760, 0.032, 0.027, mix(palette.rim, '#8c939b', 0.5));
  p.ellipse(0.80, 0.830, 0.132, 0.112, '#0b0c0e');
  p.ellipse(0.80, 0.830, 0.072, 0.060, darken(palette.rim, 0.25));

  // Frame, engine, tank and seat as one long body between the wheels.
  p.poly([
    [0.24, 0.700], [0.78, 0.762], [0.80, 0.856], [0.26, 0.800],
  ], palette.frame);
  p.poly([
    [0.24, 0.700], [0.78, 0.762], [0.78, 0.792], [0.24, 0.732],
  ], lighten(palette.frame, 0.26));
  // Tank, still the most recognisable part of the machine.
  p.poly([
    [0.36, 0.700], [0.62, 0.730], [0.62, 0.800], [0.36, 0.772],
  ], palette.tank);
  p.poly([
    [0.36, 0.734], [0.62, 0.764], [0.62, 0.782], [0.36, 0.752],
  ], palette.tankStripe);
  // Engine hanging below, and the exhaust flung out behind.
  p.poly([
    [0.42, 0.790], [0.64, 0.816], [0.63, 0.862], [0.42, 0.838],
  ], palette.engine);
  p.roundRect(0.60, 0.868, 0.24, 0.042, 0.018, darken(palette.exhaust, 0.28));
  // Bars pointing up at the sky — the clearest read that it is on its side.
  p.line(0.22, 0.690, 0.10, 0.590, mix(palette.rim, '#8f959d', 0.4), 0.024);
  p.line(0.22, 0.690, 0.30, 0.586, mix(palette.rim, '#8f959d', 0.4), 0.020);
  p.circle(0.10, 0.586, 0.026, '#1c1e22');

  // The rider is deliberately NOT drawn here. He gets his own sprite so the
  // renderer can throw him clear of the machine and run him back; baked into
  // this box he could never travel further than the bike is wide.

  // Dust off the tarmac, and sparks where metal is dragging. Both die away as
  // the rider gets up: a wreck still throwing sparks four seconds later is a
  // wreck nobody is walking away from.
  const grit = stage <= 1 ? 1 : stage === 2 ? 0.5 : 0.2;
  p.scatter(Math.round(18 * grit), 91, 0.14, 0.72, 0.72, 0.24, 0.026 * grit, [
    'rgba(196,186,168,0.55)', 'rgba(214,206,190,0.4)', 'rgba(160,152,140,0.45)',
  ]);
  if (stage === 0) {
    p.scatter(9, 47, 0.20, 0.83, 0.34, 0.10, 0.016, [
      'rgba(255,196,90,0.85)', 'rgba(255,150,60,0.7)',
    ]);
  }
};

/**
 * The rider on foot, as his own sprite, through the four beats of a spill:
 * tumbling, sprawled, up on one knee, running back.
 *
 * Separate from the wreck because he has to travel. Baked into the bike's box
 * he could never end up further from the machine than the machine is wide,
 * which made the whole sequence read as one twitching pile. The renderer owns
 * where he is; this only owns what he looks like.
 *
 * Drawn centred on x = 0.5 with the ground at y = 0.88, so the renderer can
 * place him by his feet without a per-stage fudge.
 */
export const paintFallenRider = (
  p: Painter,
  spec: BikeSpec,
  stage: 0 | 1 | 2 | 3,
): void => {
  const palette = spec.palette;
  const jacket = jacketFor(palette);
  const helmet = hiVis(palette.riderHelmet, 0.30);
  const trouser = darken(palette.riderJacket, 0.18);

  /** Helmet with a visor band, at whatever size the pose needs. */
  const head = (cx: number, cy: number, r: number): void => {
    p.ellipse(cx, cy, r * 1.12, r * 1.08, darken(helmet, 0.5));
    p.ellipse(cx, cy - r * 0.06, r, r * 0.94, helmet);
    p.ellipse(cx, cy + r * 0.10, r * 0.92, r * 0.36, darken(helmet, 0.55));
    p.ellipse(cx - r * 0.34, cy - r * 0.40, r * 0.36, r * 0.20, lighten(helmet, 0.45));
  };

  if (stage === 0) {
    // Tumbling: airborne, folded up, limbs out. No ground shadow — he is in
    // the air, and a shadow pinned under him is what kills that read.
    p.save();
    p.rotate(-1.15, 0.5, 0.55);
    p.roundRect(0.40, 0.44, 0.22, 0.20, 0.070, jacket);
    p.rect(0.40, 0.44, 0.22, 0.045, lighten(jacket, 0.24));
    p.line(0.44, 0.48, 0.24, 0.34, darken(jacket, 0.30), 0.075);
    p.line(0.60, 0.52, 0.80, 0.38, darken(jacket, 0.30), 0.075);
    p.line(0.46, 0.63, 0.32, 0.84, trouser, 0.085);
    p.line(0.58, 0.63, 0.74, 0.82, trouser, 0.085);
    p.circle(0.30, 0.855, 0.045, '#16181b');
    p.circle(0.765, 0.835, 0.045, '#16181b');
    p.restore();
    head(0.50, 0.30, 0.088);
    return;
  }

  if (stage === 1) {
    // Sprawled face down on the tarmac, sliding, arms trailing.
    p.ellipse(0.50, 0.885, 0.34, 0.035, 'rgba(0,0,0,0.34)');
    p.poly([
      [0.34, 0.700], [0.72, 0.730], [0.74, 0.845], [0.36, 0.820],
    ], jacket);
    p.poly([
      [0.34, 0.700], [0.72, 0.730], [0.72, 0.766], [0.34, 0.738],
    ], lighten(jacket, 0.24));
    p.line(0.40, 0.730, 0.16, 0.670, darken(jacket, 0.30), 0.070);
    p.circle(0.145, 0.664, 0.042, '#16181b');
    p.line(0.70, 0.820, 0.90, 0.878, trouser, 0.075);
    p.roundRect(0.870, 0.858, 0.100, 0.052, 0.020, '#16181b');
    head(0.375, 0.706, 0.082);
    return;
  }

  if (stage === 2) {
    // Up on one knee, hand braced on the road, about to push off.
    p.ellipse(0.50, 0.885, 0.28, 0.032, 'rgba(0,0,0,0.34)');
    p.line(0.54, 0.500, 0.51, 0.700, jacket, 0.125);
    p.rect(0.470, 0.482, 0.125, 0.038, lighten(jacket, 0.24));
    // Front leg planted, back leg still folded under.
    p.line(0.51, 0.680, 0.63, 0.860, trouser, 0.085);
    p.line(0.51, 0.700, 0.36, 0.858, darken(trouser, 0.24), 0.080);
    p.roundRect(0.585, 0.848, 0.105, 0.050, 0.020, '#16181b');
    p.roundRect(0.300, 0.846, 0.100, 0.048, 0.020, '#16181b');
    // Arm braced on the tarmac.
    p.line(0.535, 0.545, 0.395, 0.735, darken(jacket, 0.26), 0.065);
    p.circle(0.388, 0.748, 0.040, '#16181b');
    head(0.556, 0.432, 0.086);
    return;
  }

  // Running back to the machine: leaning into it, legs scissored, arms pumping.
  p.ellipse(0.50, 0.885, 0.24, 0.030, 'rgba(0,0,0,0.30)');
  p.save();
  p.rotate(-0.20, 0.50, 0.88);
  p.line(0.510, 0.430, 0.500, 0.660, jacket, 0.130);
  p.rect(0.443, 0.412, 0.130, 0.040, lighten(jacket, 0.24));
  // Legs mid-stride.
  p.line(0.500, 0.645, 0.375, 0.845, trouser, 0.085);
  p.line(0.500, 0.645, 0.640, 0.805, darken(trouser, 0.22), 0.085);
  p.roundRect(0.320, 0.832, 0.105, 0.050, 0.020, '#16181b');
  p.roundRect(0.600, 0.792, 0.105, 0.050, 0.020, '#16181b');
  // Arms.
  p.line(0.510, 0.490, 0.370, 0.575, darken(jacket, 0.26), 0.062);
  p.line(0.510, 0.490, 0.655, 0.530, darken(jacket, 0.20), 0.062);
  p.circle(0.362, 0.585, 0.036, '#16181b');
  p.circle(0.665, 0.522, 0.036, '#16181b');
  p.restore();
  head(0.472, 0.352, 0.090);
};

/** The three-wheeler gets its own body: a cab, a canopy and a very different stance. */
const drawAutoRickshaw = (
  p: Painter,
  palette: BikePalette,
  options: BikeFrameOptions,
  livery: { body: string; roof: string },
): void => {
  const tiltLean = options.lean * 0.045;
  p.save();
  p.rotate(tiltLean, 0.5, 1);

  p.ellipse(0.5, 0.965, 0.40, 0.035, 'rgba(0,0,0,0.34)');

  // Rear axle: two wheels, wide track.
  for (const cx of [0.20, 0.80]) {
    p.ellipse(cx, 0.86, 0.115, 0.112, '#0d0e11');
    p.ellipse(cx, 0.86, 0.070, 0.068, darken(palette.rim, 0.3));
    p.ellipse(cx, 0.86, 0.030, 0.029, mix(palette.rim, '#8c939b', 0.5));
  }

  // Body tub.
  p.roundRect(0.16, 0.55, 0.68, 0.32, 0.06, livery.body);
  p.rect(0.16, 0.78, 0.68, 0.09, darken(livery.body, 0.35));
  // The yellow band that makes it a kali-peeli.
  p.rect(0.16, 0.60, 0.68, 0.07, livery.roof);

  // Canopy over a tubular frame.
  p.rect(0.185, 0.30, 0.03, 0.26, darken(palette.frame, 0.4));
  p.rect(0.785, 0.30, 0.03, 0.26, darken(palette.frame, 0.4));
  p.roundRect(0.14, 0.245, 0.72, 0.08, 0.035, livery.roof);
  p.rect(0.14, 0.30, 0.72, 0.022, darken(livery.roof, 0.4));

  // Open back: you can see the passenger bench and the sawari.
  p.rect(0.23, 0.40, 0.54, 0.17, '#181a1f');
  p.roundRect(0.25, 0.46, 0.50, 0.11, 0.03, palette.seat);
  p.rect(0.25, 0.455, 0.50, 0.014, lighten(palette.seat, 0.3));

  // Tassels hanging off the canopy bar — the detail that makes it an auto.
  for (let i = 0; i < 7; i++) {
    const x = 0.20 + i * 0.10;
    p.line(x, 0.325, x, 0.325 + 0.03 + Painter.noise(i * 3) * 0.02, i % 2 ? '#e2b33c' : '#c1272d', 0.008);
  }

  // Rear lamp and the number plate.
  p.rect(0.44, 0.80, 0.12, 0.035, withAlpha('#e03a2f', 0.45 + options.lamp * 0.55));
  p.rect(0.40, 0.845, 0.20, 0.05, '#f0f0ee');
  p.text(options.plate ?? 'MH 04', 0.5, 0.870, 0.036, '#15171b');

  p.restore();
};

/**
 * Paint one bike frame into the given painter box.
 *
 * Laid out in fixed vertical bands so every machine reads as one object rather
 * than a stack of parts: helmet, torso, tank shoulders, seat, tail, engine,
 * wheel. Class and mass then vary the widths, the wheel size and the details.
 */
export const paintBike = (
  p: Painter,
  spec: BikeSpec,
  options: BikeFrameOptions,
  livery?: { body: string; roof: string },
): void => {
  const palette = spec.palette;

  if (options.down) {
    drawWreck(p, palette, options.downStage ?? 0);
    return;
  }

  if (spec.threeWheeler) {
    drawAutoRickshaw(p, palette, options, livery ?? { body: '#101010', roof: '#f2c12e' });
    return;
  }

  const prop = proportionsFor(spec);
  const lean = options.lean;
  const half = prop.width * 0.5;
  const spoked = spec.class === 'classic' || spec.class === 'twostroke' || spec.class === 'commuter';
  const twin = spec.voice.firingOrder === 2;
  const wheelR = prop.wheel;
  const wheelY = WHEEL_Y;

  p.save();
  // Lean is a rotation about the contact patch plus a lateral shift; rotation
  // alone reads as the whole bike sliding sideways at these sprite sizes.
  p.rotate(lean * 0.075, 0.5, 0.95);
  p.translate(lean * 0.020, 0);

  // Contact shadow, tight under the tyre.
  p.ellipse(0.5, 0.975, wheelR * 1.5, 0.026, 'rgba(0,0,0,0.42)');

  // The rear wheel is drawn separately by the renderer so it can spin. Rivals
  // and parked bikes get a static one baked in — they are small on screen and a
  // per-entity rotation is not worth the draw call.
  if (!options.bodyOnly) {
    p.ellipse(0.5, wheelY, wheelR, wheelR, '#0a0b0d');
    p.ellipse(0.5, wheelY, wheelR * 0.94, wheelR * 0.94, '#191b1f');
    p.ellipse(0.5, wheelY, wheelR * 0.62, wheelR * 0.62, darken(palette.rim, 0.32));
    p.ellipse(0.5, wheelY, wheelR * 0.54, wheelR * 0.54, '#15171a');
    for (let i = 0; i < (spoked ? 10 : 5); i++) {
      const a = (i / (spoked ? 10 : 5)) * Math.PI * 2;
      p.line(0.5, wheelY, 0.5 + Math.cos(a) * wheelR * 0.56, wheelY + Math.sin(a) * wheelR * 0.56,
        spoked ? lighten(palette.rim, 0.2) : palette.rim, spoked ? 0.012 : 0.06);
    }
    p.ellipse(0.5, wheelY, wheelR * 0.22, wheelR * 0.22, mix(palette.rim, '#8c939b', 0.5));
  }

  // Swingarm: two arms straddling the tyre, running forward from the axle.
  for (const side of [-1, 1] as const) {
    p.roundRect(0.5 + side * (wheelR + 0.030) - 0.024, wheelY - 0.055, 0.048, 0.075, 0.016,
      darken(palette.frame, 0.05));
    p.rect(0.5 + side * (wheelR + 0.030) - 0.020, wheelY - 0.052, 0.016, 0.062,
      lighten(palette.frame, 0.30));
  }

  // Rear mudguard: a band curving over the top of the tyre. This is the piece
  // that ties the machine to the wheel — without it the body floats above a
  // loose black circle.
  const guard = darken(palette.frame, 0.02);
  arcBand(p, 0.5, wheelY, wheelR * 1.00, wheelR * 1.22, Math.PI * 1.06, Math.PI * 1.94, guard);
  arcBand(p, 0.5, wheelY, wheelR * 1.14, wheelR * 1.22, Math.PI * 1.20, Math.PI * 1.55,
    lighten(palette.frame, 0.34));

  // Exhaust: twin pipes on the parallel twins, one fat can otherwise, both
  // running back alongside the tyre where they actually live.
  const pipeY = wheelY - 0.075;
  const pipeH = 0.050;
  const drawPipe = (side: -1 | 1): void => {
    const chrome = darken(palette.exhaust, 0.30);
    const len = half * 0.66;
    const x0 = 0.5 + side * (wheelR + 0.012) - (side < 0 ? len : 0);
    p.roundRect(x0, pipeY, len, pipeH, 0.022, chrome);
    p.rect(x0 + len * 0.06, pipeY + 0.005, len * 0.84, 0.010, lighten(palette.exhaust, 0.30));
    p.rect(x0, pipeY + pipeH * 0.62, len, pipeH * 0.38, darken(palette.exhaust, 0.62));
    // The open end, angled away from the viewer.
    p.ellipse(x0 + (side < 0 ? 0.005 : len - 0.005), pipeY + pipeH * 0.5,
      0.013, pipeH * 0.44, '#0e1013');
  };
  if (twin) { drawPipe(-1); drawPipe(1); } else { drawPipe(1); }

  // Engine: only the cylinder shoulders show past the rider's legs on a rear
  // view. Drawing the whole block put a grey slab in the middle of the sprite.
  const engineW = half * (0.62 + prop.tank * 0.16);
  const engineY = 0.470;
  p.roundRect(0.5 - engineW * 0.5, engineY, engineW, 0.090, 0.020,
    darken(palette.engine, 0.28));
  for (let i = 0; i < 3; i++) {
    p.rect(0.5 - engineW * 0.46, engineY + 0.014 + i * 0.022, engineW * 0.92, 0.007,
      darken(palette.engine, 0.52));
  }
  p.rect(0.5 - engineW * 0.44, engineY + 0.008, engineW * 0.18, 0.072,
    lighten(palette.engine, 0.10));

  // Rear shocks, angled in from the swingarm to the frame. Dark: chrome here
  // competes with the wheel for attention and wins, which is the wrong read.
  for (const side of [-1, 1] as const) {
    p.line(0.5 + side * (wheelR + 0.026), wheelY - 0.050, 0.5 + side * half * 0.70, 0.520,
      darken(mix(palette.rim, '#4a4e55', 0.85), 0.30), 0.028);
    p.line(0.5 + side * (wheelR + 0.030), wheelY - 0.056, 0.5 + side * half * 0.72, 0.526,
      mix(palette.rim, '#6d737b', 0.7), 0.008);
  }

  // Tail unit: seat base tapering down to where the mudguard picks it up.
  const tailW = half * (0.72 + prop.tank * 0.10);
  const tailTop = 0.470;
  const tailBottom = wheelY - wheelR * 1.16;
  p.poly([
    [0.5 - tailW * 0.5, tailTop], [0.5 + tailW * 0.5, tailTop],
    [0.5 + tailW * 0.36, tailBottom], [0.5 - tailW * 0.36, tailBottom],
  ], palette.frame);
  p.rect(0.5 - tailW * 0.5, tailTop, tailW, 0.012, lighten(palette.frame, 0.30));
  // Shaded flank, so the tail is a solid and not a card.
  p.poly([
    [0.5 + tailW * 0.16, tailTop], [0.5 + tailW * 0.5, tailTop],
    [0.5 + tailW * 0.36, tailBottom], [0.5 + tailW * 0.12, tailBottom],
  ], darken(palette.frame, 0.40));

  // Fairing / belly pan on the sport bikes.
  if (prop.fairing > 0.3) {
    p.poly([
      [0.5 - half * 0.72, 0.470], [0.5 + half * 0.72, 0.470],
      [0.5 + half * 0.46, 0.565], [0.5 - half * 0.46, 0.565],
    ], mix(palette.tank, palette.accent, 0.25));
  }

  // Rear lamp, sitting on the tail where it meets the mudguard. Drawn before
  // the rider so the glow never washes over the jacket.
  const lampY = tailBottom - 0.042;
  p.roundRect(0.5 - tailW * 0.24, lampY, tailW * 0.48, 0.030, 0.011,
    withAlpha('#e03a2f', 0.44 + options.lamp * 0.56));
  if (options.lamp > 0.5) {
    p.ellipse(0.5, lampY + 0.015, tailW * 0.54, 0.034, withAlpha('#ff5a44', 0.34));
  }
  // Indicators either side of the lamp. Small, but they are the detail that
  // makes a tail read as a road-legal machine rather than a shape.
  for (const side of [-1, 1] as const) {
    p.ellipse(0.5 + side * tailW * 0.38, lampY + 0.014, tailW * 0.09, 0.013,
      withAlpha('#e8952c', 0.85));
  }
  // Number plate, hanging off the guard. Small — it is a detail, not a sign.
  p.rect(0.5 - tailW * 0.30, tailBottom + 0.008, tailW * 0.60, 0.030, '#cfd0ce');
  p.text(options.plate ?? 'KA 01', 0.5, tailBottom + 0.030, 0.020, '#15171b');

  // Seat.
  const seatW = half * (0.94 + prop.tank * 0.12);
  p.roundRect(0.5 - seatW * 0.5, 0.424, seatW, 0.066, 0.026, palette.seat);
  p.rect(0.5 - seatW * 0.5, 0.424, seatW, 0.012, lighten(palette.seat, 0.28));

  // Tank shoulders. Deliberately wider than the rider so a band of the
  // machine's own colour shows either side of the jacket — without it the
  // bike's identity disappears behind the person sitting on it.
  const tankW = half * (1.34 + prop.tank * 0.30);
  const tankY = 0.336;
  p.roundRect(0.5 - tankW * 0.5, tankY, tankW, 0.100, 0.042, palette.tank);
  // Top surface catching the sky, and a shaded right flank: two tones turn a
  // flat rectangle into a fuel tank.
  p.roundRect(0.5 - tankW * 0.5, tankY, tankW, 0.028, 0.018, lighten(palette.tank, 0.34));
  p.poly([
    [0.5 + tankW * 0.24, tankY + 0.010], [0.5 + tankW * 0.5, tankY + 0.010],
    [0.5 + tankW * 0.46, tankY + 0.100], [0.5 + tankW * 0.22, tankY + 0.100],
  ], darken(palette.tank, 0.36));
  // The stripe. On the RD350 and the Enfields this is most of the personality.
  p.rect(0.5 - tankW * 0.5, tankY + 0.046, tankW, 0.017, palette.tankStripe);
  p.ellipse(0.5, tankY + 0.014, tankW * 0.08, 0.010, mix(palette.rim, '#8f959d', 0.5));

  drawRider(p, palette, prop, options);

  // Handlebars: risers, a proper bar, grips, levers and mirrors. On a rear
  // three-quarter view this is the widest thing on the machine, so a flat rod
  // here is most of why the bike reads as a smudge.
  const barY = 0.325;
  const barSpan = half * (spec.class === 'sport' ? 0.86 : 1.05);
  const barMetal = mix(palette.rim, '#9aa1ab', 0.35);
  // Top yoke and risers rising out of it.
  p.roundRect(0.5 - half * 0.30, barY + 0.020, half * 0.60, 0.030, 0.010, darken(palette.frame, 0.25));
  for (const side of [-1, 1] as const) {
    p.line(0.5 + side * half * 0.20, barY + 0.030, 0.5 + side * half * 0.34, barY + 0.004,
      darken(barMetal, 0.30), 0.020);
  }
  // The bar itself, with a lit top edge so it reads as a tube.
  p.line(0.5 - barSpan, barY, 0.5 + barSpan, barY, darken(barMetal, 0.45), 0.026);
  p.line(0.5 - barSpan, barY - 0.006, 0.5 + barSpan, barY - 0.006, lighten(barMetal, 0.10), 0.010);
  for (const side of [-1, 1] as const) {
    const gx = 0.5 + side * barSpan;
    // Grip.
    p.roundRect(gx - (side < 0 ? half * 0.26 : 0), barY - 0.017, half * 0.26, 0.034, 0.014, '#1c1e22');
    p.rect(gx - (side < 0 ? half * 0.24 : -half * 0.02), barY - 0.014, half * 0.20, 0.008, '#33363c');
    // Brake / clutch lever, angled forward off the grip.
    p.line(gx + side * half * 0.04, barY - 0.004, gx + side * half * 0.30, barY - 0.028,
      lighten(barMetal, 0.22), 0.011);
    // Mirror on its stalk.
    p.line(gx + side * half * 0.06, barY - 0.010, gx + side * half * 0.20, barY - 0.062,
      '#2a2d33', 0.013);
    p.ellipse(gx + side * half * 0.22, barY - 0.070, 0.032, 0.021, darken(barMetal, 0.35));
    p.ellipse(gx + side * half * 0.22, barY - 0.072, 0.027, 0.017,
      mix('#9fa6b0', palette.accent, 0.18));
  }

  p.restore();
};

/** Every distinct bike frame the atlas needs to rasterise. */
export const BIKE_FRAMES: readonly BikeFrameOptions[] = (() => {
  const frames: BikeFrameOptions[] = [];
  for (const lean of [-2, -1, 0, 1, 2]) {
    for (const lamp of [0, 1]) {
      frames.push({ lean, action: 0, actionSide: 1, down: false, lamp });
    }
  }
  for (const action of [1, 2, 3] as const) {
    for (const actionSide of [-1, 1] as const) {
      frames.push({ lean: 0, action, actionSide, down: false, lamp: 0 });
    }
  }
  for (const downStage of [0, 1, 2, 3] as const) {
    frames.push({ lean: 0, action: 0, actionSide: 1, down: true, lamp: 0, downStage });
  }
  return frames;
})();

export const frameKey = (o: BikeFrameOptions): string =>
  o.down ? `down${o.downStage ?? 0}:${o.plate ?? ''}`
    : `l${o.lean}a${o.action}s${o.actionSide}b${o.lamp}p${o.plate ?? ''}`;
