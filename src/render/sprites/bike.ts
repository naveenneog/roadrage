import type { BikePalette, BikeSpec } from '../../data/types.ts';
import { Painter } from '../painter.ts';
import { darken, lighten, mix, withAlpha } from '../palette.ts';

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
  /** 0 = no swing, 1 = mid punch, 2 = mid kick. */
  action: 0 | 1 | 2;
  /** Which side the rider is swinging toward. */
  actionSide: -1 | 1;
  /** True while the rider is down, which draws a wreck instead. */
  down: boolean;
  /** 0..1 brake-light and rear-lamp intensity. */
  lamp: number;
}

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
      return { width: 0.62 + mass * 0.14, stance: 0.60, tank: 0.90, wheel: 0.175, fairing: 0 };
    case 'twostroke':
      return { width: 0.50 + mass * 0.10, stance: 0.56, tank: 0.62, wheel: 0.150, fairing: 0.1 };
    case 'sport':
      return { width: 0.54 + mass * 0.12, stance: 0.52, tank: 0.72, wheel: 0.160, fairing: 0.65 };
    case 'modern':
      return { width: 0.58 + mass * 0.14 + long * 0.04, stance: 0.55, tank: 0.82, wheel: 0.170, fairing: 0.35 };
    case 'commuter':
      return { width: 0.46, stance: 0.58, tank: 0.55, wheel: 0.150, fairing: 0 };
    default:
      return { width: 0.86, stance: 0.62, tank: 0.70, wheel: 0.150, fairing: 0 };
  }
};

const drawWheel = (
  p: Painter,
  cx: number,
  cy: number,
  r: number,
  palette: BikePalette,
  spoked: boolean,
  blur: number,
): void => {
  // Tyre: a dark band with a lit shoulder, so it reads as round rather than flat.
  p.ellipse(cx, cy, r, r * 0.96, '#0a0b0d');
  p.ellipse(cx, cy, r * 0.94, r * 0.90, '#17191d');
  p.ellipse(cx - r * 0.22, cy - r * 0.12, r * 0.36, r * 0.5, '#232629');
  // Tread blocks, smeared into a band once the wheel is turning.
  if (blur < 0.5) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + blur * 6;
      p.rect(cx + Math.cos(a) * r * 0.86 - r * 0.06, cy + Math.sin(a) * r * 0.82 - r * 0.05,
        r * 0.12, r * 0.10, '#0d0e10');
    }
  }

  p.ellipse(cx, cy, r * 0.70, r * 0.64, darken(palette.rim, 0.35));
  if (spoked) {
    // Spokes smear into a disc once the wheel is turning — that smear is what
    // reads as rotation at speed, so it is drawn rather than avoided.
    const visible = blur > 0.45 ? 4 : 9;
    for (let i = 0; i < visible; i++) {
      const a = (i / visible) * Math.PI + blur * 3.4;
      p.line(
        cx - Math.cos(a) * r * 0.60, cy - Math.sin(a) * r * 0.55,
        cx + Math.cos(a) * r * 0.60, cy + Math.sin(a) * r * 0.55,
        withAlpha(palette.rim, 0.8 - blur * 0.35), 0.011,
      );
    }
    p.ellipse(cx, cy, r * 0.62, r * 0.57, withAlpha(palette.rim, blur * 0.28));
  } else {
    // Cast alloy: three fat spokes plus a lit face.
    p.ellipse(cx, cy, r * 0.60, r * 0.55, darken(palette.rim, 0.15));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + blur * 4;
      p.line(cx, cy, cx + Math.cos(a) * r * 0.58, cy + Math.sin(a) * r * 0.54,
        palette.rim, 0.055);
    }
    p.ellipse(cx, cy, r * 0.30, r * 0.28, darken(palette.rim, 0.4));
  }
  // Hub and brake disc.
  p.ellipse(cx, cy, r * 0.20, r * 0.19, mix(palette.rim, '#7d848c', 0.5));
  p.ellipse(cx, cy, r * 0.11, r * 0.10, '#1b1d21');
};

const drawRider = (
  p: Painter,
  palette: BikePalette,
  prop: Proportions,
  options: BikeFrameOptions,
): void => {
  const jacket = palette.riderJacket;
  const helmet = palette.riderHelmet;
  const shadow = darken(jacket, 0.38);
  const lit = lighten(jacket, 0.20);
  const halfBody = prop.width * 0.27;
  const torsoTop = 0.20 + prop.fairing * 0.04 - (prop.stance - 0.56) * 0.12;
  const torsoBottom = 0.50;
  // Weight shifts across the seat with the lean, and the shoulders counter-lean
  // slightly — that offset is what makes a turn read as a rider, not a decal.
  const shift = options.lean * 0.022;
  const counter = -options.lean * 0.010;

  // Legs gripping the tank, the outside one pushed out through a turn.
  const outerLeg = options.lean > 0 ? 1 : -1;
  for (const side of [-1, 1] as const) {
    const flare = side === outerLeg ? Math.abs(options.lean) * 0.018 : 0;
    p.rect(0.5 + side * (halfBody * 0.70 + flare) - halfBody * 0.30 + shift, 0.42,
      halfBody * 0.60, 0.22, side < 0 ? darken(jacket, 0.50) : darken(jacket, 0.58));
    // Knee highlight.
    p.rect(0.5 + side * (halfBody * 0.70 + flare) - halfBody * 0.22 + shift, 0.47,
      halfBody * 0.20, 0.05, darken(jacket, 0.34));
  }
  // Boots on the pegs.
  for (const side of [-1, 1] as const) {
    const flare = side === outerLeg ? Math.abs(options.lean) * 0.018 : 0;
    p.roundRect(0.5 + side * (halfBody * 0.72 + flare) - halfBody * 0.34 + shift, 0.625,
      halfBody * 0.68, 0.058, 0.02, '#191a1c');
    p.rect(0.5 + side * (halfBody * 0.72 + flare) - halfBody * 0.30 + shift, 0.627,
      halfBody * 0.58, 0.012, '#2c2e32');
  }

  // Torso, seen from behind, with a lit shoulder and a shadowed flank.
  const tx = 0.5 + shift + counter;
  p.roundRect(tx - halfBody, torsoTop, halfBody * 2, torsoBottom - torsoTop, 0.075, jacket);
  p.rect(tx - halfBody, torsoBottom - 0.085, halfBody * 2, 0.085, shadow);
  // Backpack-free spine ridge plus a shoulder highlight on the raised side.
  p.rect(tx - halfBody * 0.14, torsoTop + 0.01, halfBody * 0.28, torsoBottom - torsoTop - 0.07, lit);
  p.roundRect(tx - halfBody * (options.lean >= 0 ? 1 : 0.34), torsoTop + 0.005,
    halfBody * 0.66, 0.07, 0.03, lit);
  // Jacket hem catching the wind.
  p.poly([
    [tx - halfBody, torsoBottom - 0.02],
    [tx + halfBody, torsoBottom - 0.02],
    [tx + halfBody * 0.86, torsoBottom + 0.045],
    [tx - halfBody * 0.86, torsoBottom + 0.03],
  ], shadow);

  // Arms reaching to the bars; the swinging one leaves the handlebar.
  const armY = torsoTop + 0.085;
  const swing = options.action;
  for (const side of [-1, 1] as const) {
    const swinging = swing > 0 && side === options.actionSide;
    const reach = swinging ? (swing === 2 ? 0.34 : 0.27) : halfBody * 1.20;
    const drop = swinging ? (swing === 2 ? 0.10 : 0.0) : 0.11;
    const shoulderX = tx + side * halfBody * 0.82;
    const handX = 0.5 + side * reach + (swinging ? 0 : shift * 0.4);
    // Upper arm then forearm, with a bend at the elbow.
    const elbowX = (shoulderX + handX) / 2 + side * 0.018;
    const elbowY = armY + drop * 0.45 + 0.022;
    p.line(shoulderX, armY, elbowX, elbowY, swinging ? lit : jacket, 0.055);
    p.line(elbowX, elbowY, handX, armY + drop, swinging ? lit : darken(jacket, 0.12), 0.046);
    // Glove.
    p.circle(handX, armY + drop, swinging ? 0.036 : 0.026,
      swinging ? mix(jacket, '#c8a882', 0.7) : '#23252a');
  }

  // Helmet: shell, visor band, rim light and a highlight.
  const headY = torsoTop - 0.055;
  const hx = tx + counter * 0.6;
  p.ellipse(hx, headY, halfBody * 0.78, 0.070, darken(helmet, 0.25));
  p.ellipse(hx, headY - 0.006, halfBody * 0.74, 0.064, helmet);
  p.rect(hx - halfBody * 0.72, headY - 0.002, halfBody * 1.44, 0.020, darken(helmet, 0.6));
  p.ellipse(hx - halfBody * 0.26, headY - 0.026, halfBody * 0.24, 0.018, lighten(helmet, 0.45));
  // Chin bar peeking under the shell.
  p.rect(hx - halfBody * 0.40, headY + 0.030, halfBody * 0.80, 0.016, darken(helmet, 0.4));
};

/** A downed rider: bike on its side, rider sliding, dust and a scraping spark. */
const drawWreck = (p: Painter, palette: BikePalette): void => {
  p.ellipse(0.5, 0.94, 0.40, 0.045, 'rgba(0,0,0,0.34)');

  // The bike laid over on its side, seen from behind and slightly above.
  p.save();
  p.rotate(1.05, 0.52, 0.86);
  // Wheels first so the body overlaps them, which reads as one machine rather
  // than a pile of parts.
  p.ellipse(0.30, 0.80, 0.105, 0.10, '#131518');
  p.ellipse(0.30, 0.80, 0.055, 0.052, darken(palette.rim, 0.2));
  p.ellipse(0.74, 0.83, 0.105, 0.10, '#131518');
  p.ellipse(0.74, 0.83, 0.055, 0.052, darken(palette.rim, 0.2));
  // Frame, engine, tank and seat as one long body.
  p.roundRect(0.28, 0.735, 0.48, 0.105, 0.035, palette.frame);
  p.roundRect(0.34, 0.705, 0.30, 0.075, 0.03, palette.tank);
  p.rect(0.34, 0.732, 0.30, 0.016, palette.tankStripe);
  p.roundRect(0.42, 0.775, 0.26, 0.055, 0.02, palette.engine);
  // Bars pointing up at the sky, the clearest read that it is on its side.
  p.line(0.30, 0.72, 0.24, 0.62, darken(palette.rim, 0.2), 0.020);
  p.restore();

  // Rider, face down and sliding just behind the bike.
  p.roundRect(0.50, 0.775, 0.24, 0.095, 0.04, palette.riderJacket);
  p.rect(0.50, 0.775, 0.24, 0.018, lighten(palette.riderJacket, 0.18));
  p.roundRect(0.44, 0.80, 0.10, 0.06, 0.025, darken(palette.riderJacket, 0.4));
  p.ellipse(0.755, 0.795, 0.055, 0.045, palette.riderHelmet);
  p.rect(0.715, 0.79, 0.075, 0.014, darken(palette.riderHelmet, 0.5));

  // Dust off the tarmac, and sparks where metal is dragging.
  p.scatter(16, 91, 0.16, 0.72, 0.66, 0.22, 0.024, [
    'rgba(196,186,168,0.55)', 'rgba(214,206,190,0.4)', 'rgba(160,152,140,0.45)',
  ]);
  p.scatter(7, 47, 0.24, 0.80, 0.30, 0.10, 0.014, [
    'rgba(255,196,90,0.85)', 'rgba(255,150,60,0.7)',
  ]);
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
  drawWheel(p, 0.20, 0.86, 0.115, palette, false, 0.5);
  drawWheel(p, 0.80, 0.86, 0.115, palette, false, 0.5);

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
  p.text('MH 04', 0.5, 0.870, 0.036, '#15171b');

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
    drawWreck(p, palette);
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

  p.save();
  // Lean is a rotation about the contact patch plus a lateral shift; rotation
  // alone reads as the whole bike sliding sideways at these sprite sizes.
  p.rotate(lean * 0.075, 0.5, 0.95);
  p.translate(lean * 0.020, 0);

  // Contact shadow, tight under the tyre.
  p.ellipse(0.5, 0.945, half * 1.25, 0.028, 'rgba(0,0,0,0.38)');

  // Rear wheel, tucked up into the body rather than dangling below it.
  const wheelR = prop.wheel;
  const wheelY = 0.90 - wheelR * 0.35;
  drawWheel(p, 0.5, wheelY, wheelR, palette, spoked, 0.6);

  // Swingarm running forward from the axle.
  p.rect(0.5 - half * 0.62, wheelY - 0.02, half * 1.24, 0.035, darken(palette.frame, 0.1));

  // Exhaust: twin pipes on the parallel twins, one fat can otherwise, both
  // sitting alongside the wheel where they actually live.
  const pipeY = wheelY - 0.075;
  if (twin) {
    p.roundRect(0.5 - half * 1.02, pipeY, half * 0.44, 0.055, 0.022, palette.exhaust);
    p.roundRect(0.5 + half * 0.58, pipeY, half * 0.44, 0.055, 0.022, palette.exhaust);
    p.rect(0.5 - half * 1.02, pipeY + 0.036, half * 0.44, 0.019, darken(palette.exhaust, 0.35));
    p.rect(0.5 + half * 0.58, pipeY + 0.036, half * 0.44, 0.019, darken(palette.exhaust, 0.35));
  } else {
    p.roundRect(0.5 + half * 0.38, pipeY, half * 0.68, 0.062, 0.026, palette.exhaust);
    p.rect(0.5 + half * 0.38, pipeY + 0.042, half * 0.68, 0.020, darken(palette.exhaust, 0.35));
  }

  // Engine block, wider and more finned on the big singles, overlapping the wheel.
  const engineW = half * (1.02 + prop.tank * 0.22);
  const engineY = 0.66;
  p.block(0.5 - engineW * 0.5, engineY, engineW, 0.115, palette.engine, darken(palette.engine, 0.3));
  for (let i = 0; i < 5; i++) {
    p.rect(0.5 - engineW * 0.46, engineY + 0.012 + i * 0.019, engineW * 0.92, 0.008,
      darken(palette.engine, 0.42));
  }
  // Crankcase highlight and a cylinder head poking above the block.
  p.rect(0.5 - engineW * 0.44, engineY + 0.006, engineW * 0.26, 0.088, lighten(palette.engine, 0.22));
  p.roundRect(0.5 - engineW * 0.30, engineY - 0.048, engineW * 0.60, 0.055, 0.014,
    darken(palette.engine, 0.12));

  // Rear shock and the top of the swingarm, visible between engine and seat.
  for (const side of [-1, 1] as const) {
    p.rect(0.5 + side * half * 0.52 - half * 0.045, 0.60, half * 0.09, 0.115,
      mix(palette.rim, '#5c6169', 0.4));
    p.rect(0.5 + side * half * 0.52 - half * 0.055, 0.598, half * 0.11, 0.030, palette.accent);
  }

  // Rear mudguard hugging the tyre — the piece that makes the back end read.
  p.poly([
    [0.5 - half * 0.50, 0.70],
    [0.5 + half * 0.50, 0.70],
    [0.5 + half * 0.44, wheelY - wheelR * 0.62],
    [0.5 - half * 0.44, wheelY - wheelR * 0.62],
  ], darken(palette.frame, 0.05));
  p.rect(0.5 - half * 0.50, 0.70, half * 1.0, 0.012, lighten(palette.frame, 0.25));

  // Tail unit: the piece that joins the seat down to the wheel.
  const tailW = half * (0.86 + prop.tank * 0.14);
  p.poly([
    [0.5 - tailW * 0.5, 0.56], [0.5 + tailW * 0.5, 0.56],
    [0.5 + tailW * 0.38, 0.70], [0.5 - tailW * 0.38, 0.70],
  ], palette.frame);
  p.rect(0.5 - tailW * 0.5, 0.56, tailW, 0.016, lighten(palette.frame, 0.22));
  // Shadow down the shaded flank, so the tail is a solid not a card.
  p.poly([
    [0.5 + tailW * 0.18, 0.56], [0.5 + tailW * 0.5, 0.56],
    [0.5 + tailW * 0.38, 0.70], [0.5 + tailW * 0.14, 0.70],
  ], darken(palette.frame, 0.35));

  // Fairing / belly pan on the sport bikes.
  if (prop.fairing > 0.3) {
    p.poly([
      [0.5 - half * 0.84, 0.60], [0.5 + half * 0.84, 0.60],
      [0.5 + half * 0.58, 0.74], [0.5 - half * 0.58, 0.74],
    ], mix(palette.tank, palette.accent, 0.25));
  }

  // Seat.
  const seatW = half * (1.06 + prop.tank * 0.16);
  p.roundRect(0.5 - seatW * 0.5, 0.485, seatW, 0.085, 0.032, palette.seat);
  p.rect(0.5 - seatW * 0.5, 0.485, seatW, 0.015, lighten(palette.seat, 0.22));

  // Tank shoulders, visible either side of the rider.
  const tankW = half * (1.10 + prop.tank * 0.28);
  const tankY = 0.395;
  p.roundRect(0.5 - tankW * 0.5, tankY, tankW, 0.105, 0.042, palette.tank);
  // Top surface catching the sky, and a shaded right flank: two tones turn a
  // flat rectangle into a fuel tank.
  p.roundRect(0.5 - tankW * 0.5, tankY, tankW, 0.030, 0.02, lighten(palette.tank, 0.30));
  p.poly([
    [0.5 + tankW * 0.22, tankY + 0.012], [0.5 + tankW * 0.5, tankY + 0.012],
    [0.5 + tankW * 0.46, tankY + 0.105], [0.5 + tankW * 0.20, tankY + 0.105],
  ], darken(palette.tank, 0.30));
  // The stripe. On the RD350 and the Enfields this is most of the personality.
  p.rect(0.5 - tankW * 0.5, tankY + 0.046, tankW, 0.018, palette.tankStripe);
  // Filler cap.
  p.ellipse(0.5, tankY + 0.016, tankW * 0.10, 0.011, mix(palette.rim, '#8f959d', 0.5));

  drawRider(p, palette, prop, options);

  // Handlebars and mirrors, poking out past the rider's shoulders.
  const barY = 0.335;
  const barSpan = half * (spec.class === 'sport' ? 0.94 : 1.18);
  p.line(0.5 - barSpan, barY, 0.5 + barSpan, barY, darken(palette.rim, 0.25), 0.020);
  for (const side of [-1, 1] as const) {
    p.line(0.5 + side * barSpan, barY, 0.5 + side * barSpan * 1.14, barY - 0.05, '#2a2d33', 0.013);
    p.ellipse(0.5 + side * barSpan * 1.14, barY - 0.058, 0.030, 0.019,
      mix('#8f96a0', palette.accent, 0.2));
  }

  // Rear lamp on the tail, brighter under braking.
  p.rect(0.5 - tailW * 0.24, 0.585, tailW * 0.48, 0.030,
    withAlpha('#e03a2f', 0.42 + options.lamp * 0.58));
  if (options.lamp > 0.5) {
    p.ellipse(0.5, 0.60, tailW * 0.55, 0.038, withAlpha('#ff5a44', 0.30));
  }

  // Number plate, hanging under the tail.
  p.rect(0.5 - tailW * 0.30, 0.625, tailW * 0.60, 0.046, '#f0f0ee');
  p.text('KA 01', 0.5, 0.648, 0.032, '#15171b');

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
  for (const action of [1, 2] as const) {
    for (const actionSide of [-1, 1] as const) {
      frames.push({ lean: 0, action, actionSide, down: false, lamp: 0 });
    }
  }
  frames.push({ lean: 0, action: 0, actionSide: 1, down: true, lamp: 0 });
  return frames;
})();

export const frameKey = (o: BikeFrameOptions): string =>
  o.down ? 'down' : `l${o.lean}a${o.action}s${o.actionSide}b${o.lamp}`;
