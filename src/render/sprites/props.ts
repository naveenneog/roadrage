import { Painter } from '../painter.ts';
import { darken, lighten, mix, withAlpha } from '../palette.ts';

/**
 * Roadside scenery, all drawn in code.
 *
 * Each painter fills a normalised box whose bottom edge sits on the road plane.
 * `seed` varies the detail so a row of the same prop doesn't read as wallpaper.
 */
export type PropPainter = (p: Painter, seed: number) => void;

/** Natural aspect ratio (height / width) so the atlas can size each sprite sensibly. */
export const PROP_ASPECT: Record<string, number> = {};

/**
 * On-screen width in road half-widths. The road half-width is 2000 world units,
 * which is roughly 4 m of carriageway — so a value of 2 means "about 8 m wide".
 * This is what keeps a streetlight slim and a market facade enormous.
 */
export const PROP_WIDTH: Record<string, number> = {};

const define = (
  id: string,
  aspect: number,
  worldWidth: number,
  painter: PropPainter,
): [string, PropPainter] => {
  PROP_ASPECT[id] = aspect;
  PROP_WIDTH[id] = worldWidth;
  return [id, painter];
};

const GREEN = ['#2f5d2a', '#3a7031', '#274f24', '#46813a'];
const DRY_GREEN = ['#4d6b2c', '#5a7a33', '#3f5a25'];

/* ───────────────────────────── trees ───────────────────────────── */

const banyan: PropPainter = (p, seed) => {
  const trunk = '#5b4a38';
  p.rect(0.42, 0.52, 0.16, 0.48, trunk);
  p.rect(0.42, 0.52, 0.05, 0.48, lighten(trunk, 0.16));
  // The aerial prop roots are the whole identity of a banyan.
  for (let i = 0; i < 7; i++) {
    const x = 0.14 + i * 0.115 + Painter.noise(seed + i) * 0.03;
    const top = 0.34 + Painter.noise(seed + i * 2) * 0.08;
    p.curve(x, top, x + 0.02, (top + 1) / 2, x + 0.01, 0.995, withAlpha(trunk, 0.85), 0.016);
  }
  for (let i = 0; i < 5; i++) {
    const cx = 0.2 + i * 0.16;
    const cy = 0.22 + Painter.noise(seed + i * 5) * 0.10;
    p.ellipse(cx, cy, 0.20, 0.14, GREEN[i % GREEN.length] as string);
  }
  p.ellipse(0.5, 0.16, 0.44, 0.18, '#356030');
  p.ellipse(0.42, 0.11, 0.24, 0.10, '#437a38');
};

const peepal: PropPainter = (p, seed) => {
  p.rect(0.45, 0.46, 0.10, 0.54, '#6a5540');
  p.ellipse(0.5, 0.24, 0.40, 0.24, '#3c7233');
  p.ellipse(0.38, 0.18, 0.22, 0.14, '#4a8a3c');
  p.ellipse(0.63, 0.20, 0.20, 0.13, '#31612c');
  p.scatter(18, seed, 0.14, 0.06, 0.72, 0.34, 0.018, GREEN);
  // Peepals almost always have a shrine at the base: red paint and marigolds.
  p.rect(0.36, 0.86, 0.28, 0.14, '#b8332c');
  p.rect(0.36, 0.86, 0.28, 0.03, '#e8c84a');
  p.circle(0.5, 0.925, 0.035, '#f0a828');
};

const gulmohar: PropPainter = (p, seed) => {
  p.rect(0.46, 0.50, 0.09, 0.50, '#5e4c3a');
  // Flat, wide, umbrella canopy — and in season it is on fire with orange.
  p.ellipse(0.5, 0.30, 0.46, 0.15, '#2f5c2b');
  p.ellipse(0.5, 0.25, 0.40, 0.12, '#3d6f33');
  p.scatter(26, seed, 0.10, 0.16, 0.80, 0.22, 0.020, ['#e8542a', '#f07a2c', '#d43f22', '#f5a03a']);
};

const coconut: PropPainter = (p, seed) => {
  const lean = (Painter.noise(seed) - 0.5) * 0.14;
  p.save();
  p.rotate(lean, 0.5, 1);
  p.rect(0.465, 0.22, 0.07, 0.78, '#8a7a5e');
  for (let i = 0; i < 9; i++) {
    p.rect(0.465, 0.30 + i * 0.075, 0.07, 0.012, '#6e6047');
  }
  // Fronds radiating from the crown.
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * Math.PI - Math.PI * 0.06;
    p.curve(
      0.5, 0.22,
      0.5 - Math.cos(a) * 0.30, 0.22 - Math.sin(a) * 0.16,
      0.5 - Math.cos(a) * 0.48, 0.24 - Math.sin(a) * 0.14 + 0.06,
      i % 2 ? '#2f6b2c' : '#3d8034', 0.026,
    );
  }
  p.circle(0.47, 0.245, 0.026, '#6b5f3f');
  p.circle(0.53, 0.255, 0.026, '#6b5f3f');
  p.restore();
};

const raintree: PropPainter = (p, seed) => {
  p.rect(0.44, 0.48, 0.13, 0.52, '#574636');
  p.ellipse(0.5, 0.28, 0.48, 0.17, '#2c5528');
  p.ellipse(0.34, 0.24, 0.24, 0.11, '#3a6c33');
  p.ellipse(0.68, 0.26, 0.22, 0.10, '#264a23');
  p.scatter(20, seed, 0.06, 0.14, 0.88, 0.24, 0.016, GREEN);
};

const neem: PropPainter = (p, seed) => {
  p.rect(0.46, 0.52, 0.08, 0.48, '#63523d');
  p.ellipse(0.5, 0.28, 0.34, 0.24, '#33682e');
  p.scatter(24, seed, 0.18, 0.08, 0.64, 0.38, 0.015, DRY_GREEN);
};

/* ─────────────────────────── structures ─────────────────────────── */

const shopRow: PropPainter = (p, seed) => {
  const bays = 3;
  for (let i = 0; i < bays; i++) {
    const x = i / bays;
    const w = 1 / bays;
    const hue = ['#c8b48a', '#b9a894', '#cfc0a2', '#a89880'][Math.floor(Painter.noise(seed + i) * 4)] as string;
    p.rect(x, 0.12, w, 0.88, hue);
    p.rect(x, 0.12, w, 0.03, darken(hue, 0.3));
    // Shuttered ground floor with a coloured awning.
    p.rect(x + w * 0.08, 0.62, w * 0.84, 0.30, '#3b4048');
    for (let s = 0; s < 6; s++) {
      p.rect(x + w * 0.08, 0.63 + s * 0.05, w * 0.84, 0.018, '#4a505a');
    }
    const awning = ['#c1272d', '#1f6fd0', '#e8a020', '#1f7a3d'][Math.floor(Painter.noise(seed + i * 3) * 4)] as string;
    p.rect(x + w * 0.04, 0.55, w * 0.92, 0.075, awning);
    for (let s = 0; s < 5; s++) {
      p.rect(x + w * 0.04 + s * w * 0.184, 0.55, w * 0.092, 0.075, darken(awning, 0.22));
    }
    // Upper-floor window and a balcony rail.
    p.rect(x + w * 0.22, 0.24, w * 0.56, 0.22, '#26303c');
    p.rect(x + w * 0.16, 0.44, w * 0.68, 0.035, darken(hue, 0.25));
  }
  // Overhead cable — thick enough to walk on, as the research put it.
  p.line(0, 0.10, 1, 0.14, '#1a1c20', 0.012);
  p.line(0, 0.145, 1, 0.10, '#232529', 0.008);
};

const colonialFacade: PropPainter = (p, seed) => {
  const wall = ['#d8c9a8', '#c9b894', '#e0d2b4'][Math.floor(Painter.noise(seed) * 3)] as string;
  p.rect(0.02, 0.06, 0.96, 0.94, wall);
  p.rect(0.02, 0.06, 0.96, 0.045, darken(wall, 0.28));
  // Arched openings on two storeys — the Cantonment look.
  for (let floor = 0; floor < 2; floor++) {
    const y = 0.20 + floor * 0.34;
    for (let i = 0; i < 3; i++) {
      const x = 0.12 + i * 0.28;
      p.rect(x, y + 0.06, 0.20, 0.22, '#2a323d');
      p.ellipse(x + 0.10, y + 0.06, 0.10, 0.06, '#2a323d');
      p.ellipse(x + 0.10, y + 0.055, 0.105, 0.062, darken(wall, 0.18));
      p.rect(x + 0.005, y + 0.07, 0.19, 0.20, '#1f2732');
    }
    p.rect(0.06, y + 0.29, 0.88, 0.028, darken(wall, 0.22));
  }
  // Wooden balcony rail.
  for (let i = 0; i < 16; i++) {
    p.rect(0.08 + i * 0.055, 0.50, 0.014, 0.05, '#6b4f33');
  }
};

const highrise: PropPainter = (p, seed) => {
  const body = ['#8d97a4', '#7d8794', '#9aa4b0', '#6f7a88'][Math.floor(Painter.noise(seed) * 4)] as string;
  p.rect(0.10, 0, 0.80, 1, body);
  p.rect(0.10, 0, 0.16, 1, lighten(body, 0.12));
  p.rect(0.78, 0, 0.12, 1, darken(body, 0.16));
  const floors = 14;
  for (let f = 0; f < floors; f++) {
    const y = 0.04 + f * (0.92 / floors);
    for (let c = 0; c < 4; c++) {
      const lit = Painter.noise(seed + f * 7 + c * 3) > 0.55;
      p.rect(0.16 + c * 0.17, y, 0.12, 0.036, lit ? '#f2d68a' : '#2b3440');
    }
  }
  // Water tanks on the roof, which every Indian building has.
  p.rect(0.30, -0.03, 0.14, 0.045, '#1f4f8a');
  p.rect(0.56, -0.025, 0.12, 0.04, '#1f4f8a');
};

const artdeco: PropPainter = (p, seed) => {
  const cream = '#e8dfc8';
  p.rect(0.06, 0.04, 0.88, 0.96, cream);
  // Stepped Deco massing and the horizontal banding of Marine Drive.
  p.rect(0.18, 0, 0.64, 0.06, darken(cream, 0.12));
  p.rect(0.30, -0.04, 0.40, 0.05, darken(cream, 0.2));
  for (let f = 0; f < 7; f++) {
    const y = 0.14 + f * 0.115;
    p.rect(0.06, y, 0.88, 0.012, '#b8a583');
    for (let c = 0; c < 5; c++) {
      const lit = Painter.noise(seed + f * 5 + c) > 0.4;
      p.rect(0.12 + c * 0.16, y + 0.022, 0.12, 0.062, lit ? '#ffe9a8' : '#333c48');
    }
    // The curved balcony corners that define the style.
    p.ellipse(0.09, y + 0.05, 0.035, 0.05, cream);
    p.ellipse(0.91, y + 0.05, 0.035, 0.05, cream);
  }
};

const haveliFront: PropPainter = (p, seed) => {
  const wall = ['#c9a882', '#b8977a', '#d4b894'][Math.floor(Painter.noise(seed) * 3)] as string;
  p.rect(0.02, 0.02, 0.96, 0.98, wall);
  // Jharokha balconies and latticework.
  for (let f = 0; f < 3; f++) {
    const y = 0.12 + f * 0.28;
    p.rect(0.10, y, 0.34, 0.20, darken(wall, 0.18));
    p.rect(0.56, y, 0.34, 0.20, darken(wall, 0.18));
    for (let i = 0; i < 6; i++) {
      p.rect(0.12 + i * 0.055, y + 0.02, 0.02, 0.16, '#5c4a35');
      p.rect(0.58 + i * 0.055, y + 0.02, 0.02, 0.16, '#5c4a35');
    }
    p.rect(0.06, y + 0.21, 0.88, 0.022, darken(wall, 0.3));
  }
  // A tangle of overhead wiring, Old Delhi style.
  for (let i = 0; i < 5; i++) {
    p.line(0, 0.04 + i * 0.014, 1, 0.02 + Painter.noise(seed + i) * 0.06, '#1b1d21', 0.008);
  }
};

const chaiTapri: PropPainter = (p, seed) => {
  p.rect(0.14, 0.42, 0.72, 0.58, '#8a8578');
  // Corrugated iron sheeting.
  for (let i = 0; i < 9; i++) {
    p.rect(0.14 + i * 0.08, 0.42, 0.035, 0.58, '#9a9488');
  }
  p.rect(0.08, 0.36, 0.84, 0.08, '#6d6a60');
  // The orange tea-brand board every one of these has.
  p.rect(0.18, 0.46, 0.64, 0.10, '#e8731c');
  p.text('CHAI', 0.5, 0.512, 0.075, '#ffffff');
  // Counter, kettle and a row of glasses.
  p.rect(0.16, 0.68, 0.68, 0.09, '#4a4238');
  p.rect(0.24, 0.61, 0.10, 0.08, '#b9bec6');
  for (let i = 0; i < 5; i++) {
    p.rect(0.44 + i * 0.07, 0.635, 0.035, 0.045, withAlpha('#d8c090', 0.85));
  }
  p.scatter(6, seed, 0.2, 0.60, 0.6, 0.06, 0.012, ['#c9c2b0']);
};

const paanShop: PropPainter = (p) => {
  p.rect(0.24, 0.46, 0.52, 0.54, '#5a5248');
  p.rect(0.18, 0.40, 0.64, 0.08, '#3d3830');
  // Glass counter full of foil sachets, lit hard at night.
  p.rect(0.28, 0.54, 0.44, 0.22, '#1a1f26');
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      const colours = ['#e8c84a', '#c1272d', '#1f7a3d', '#e87a1c', '#f0f0f0'];
      p.rect(0.30 + c * 0.085, 0.56 + r * 0.052, 0.06, 0.038, colours[(r + c) % 5] as string);
    }
  }
  p.rect(0.26, 0.485, 0.48, 0.045, '#1f6fd0');
  p.text('PAAN', 0.5, 0.508, 0.04, '#ffffff');
};

const temple: PropPainter = (p) => {
  p.rect(0.20, 0.44, 0.60, 0.56, '#e8d9b8');
  // Shikhara.
  p.poly([[0.5, 0.02], [0.80, 0.44], [0.20, 0.44]], '#e0691f');
  p.poly([[0.5, 0.10], [0.70, 0.44], [0.30, 0.44]], '#f08c2c');
  p.circle(0.5, 0.03, 0.045, '#f5d020');
  // Doorway with a bell and marigolds.
  p.rect(0.38, 0.62, 0.24, 0.38, '#7a2318');
  p.rect(0.40, 0.64, 0.20, 0.34, '#3a1a12');
  p.rect(0.16, 0.44, 0.68, 0.045, '#c1272d');
  p.circle(0.30, 0.56, 0.032, '#d4a017');
  p.circle(0.70, 0.56, 0.032, '#d4a017');
  for (let i = 0; i < 9; i++) p.circle(0.24 + i * 0.065, 0.60, 0.018, '#f0a828');
};

const mosque: PropPainter = (p) => {
  p.rect(0.14, 0.40, 0.72, 0.60, '#e4e0d4');
  p.ellipse(0.5, 0.40, 0.26, 0.20, '#2f7a5c');
  p.rect(0.495, 0.14, 0.012, 0.08, '#d4b02a');
  p.circle(0.5, 0.13, 0.022, '#d4b02a');
  // Minarets.
  for (const x of [0.16, 0.84]) {
    p.rect(x - 0.035, 0.24, 0.07, 0.76, '#efece0');
    p.ellipse(x, 0.24, 0.045, 0.045, '#2f7a5c');
  }
  // Cusped arch entrance.
  p.rect(0.40, 0.62, 0.20, 0.38, '#25523f');
  p.ellipse(0.50, 0.62, 0.10, 0.10, '#25523f');
  // Green flags on poles.
  p.line(0.26, 0.40, 0.26, 0.20, '#5a5248', 0.010);
  p.rect(0.26, 0.20, 0.10, 0.055, '#1f7a3d');
};

const church: PropPainter = (p) => {
  p.rect(0.18, 0.34, 0.64, 0.66, '#f2efe6');
  p.poly([[0.5, 0.10], [0.82, 0.34], [0.18, 0.34]], '#e6e2d6');
  p.rect(0.46, 0.02, 0.025, 0.10, '#8a7a5e');
  p.rect(0.42, 0.045, 0.10, 0.022, '#8a7a5e');
  p.rect(0.42, 0.50, 0.16, 0.30, '#3b4a5c');
  p.ellipse(0.50, 0.50, 0.08, 0.07, '#3b4a5c');
  p.circle(0.5, 0.24, 0.055, '#c9d4de');
};

const hoarding: PropPainter = (p, seed) => {
  p.rect(0.14, 0.62, 0.055, 0.38, '#4a4f57');
  p.rect(0.79, 0.62, 0.055, 0.38, '#4a4f57');
  const bg = ['#1f6fd0', '#c1272d', '#e8a020', '#7a2f9e'][Math.floor(Painter.noise(seed) * 4)] as string;
  p.rect(0.04, 0.10, 0.92, 0.54, bg);
  p.rect(0.04, 0.10, 0.92, 0.05, lighten(bg, 0.25));
  const lines = ['MEGA SALE', 'PLOT FOR SALE', 'GOLD LOAN', '4G UNLIMITED', 'FLATS 2BHK'];
  p.text(lines[Math.floor(Painter.noise(seed + 7) * lines.length)] as string, 0.5, 0.30, 0.14, '#ffffff');
  p.rect(0.14, 0.42, 0.72, 0.055, withAlpha('#ffffff', 0.85));
  p.rect(0.14, 0.51, 0.46, 0.045, withAlpha('#ffffff', 0.6));
};

const flexBanner: PropPainter = (p, seed) => {
  const party = Painter.noise(seed) > 0.5;
  const bg = party ? '#f07a1c' : '#1f6fd0';
  p.rect(0.10, 0.66, 0.03, 0.34, '#5a5248');
  p.rect(0.87, 0.66, 0.03, 0.34, '#5a5248');
  p.rect(0.04, 0.16, 0.92, 0.52, bg);
  p.rect(0.04, 0.16, 0.92, 0.06, party ? '#1f7a3d' : '#c1272d');
  // The obligatory beaming portrait.
  p.circle(0.22, 0.42, 0.13, '#e8c9a8');
  p.ellipse(0.22, 0.33, 0.13, 0.07, '#2a2118');
  p.rect(0.40, 0.30, 0.52, 0.07, withAlpha('#ffffff', 0.92));
  p.rect(0.40, 0.41, 0.44, 0.05, withAlpha('#ffffff', 0.75));
  p.rect(0.40, 0.50, 0.36, 0.05, withAlpha('#ffffff', 0.6));
};

const busShelter: PropPainter = (p) => {
  p.rect(0.06, 0.30, 0.88, 0.07, '#8a9099');
  p.rect(0.06, 0.36, 0.88, 0.025, '#5f666e');
  p.rect(0.10, 0.36, 0.045, 0.64, '#6c737b');
  p.rect(0.85, 0.36, 0.045, 0.64, '#6c737b');
  p.rect(0.16, 0.44, 0.68, 0.36, '#3d4550');
  // Flyposters, always.
  p.rect(0.20, 0.48, 0.18, 0.14, '#c1272d');
  p.rect(0.42, 0.52, 0.16, 0.12, '#e8c84a');
  p.rect(0.62, 0.47, 0.18, 0.16, '#1f7a3d');
  p.rect(0.20, 0.82, 0.60, 0.06, '#5f666e');
};

const dhaba: PropPainter = (p, seed) => {
  p.rect(0.10, 0.40, 0.80, 0.60, '#a89880');
  p.rect(0.04, 0.32, 0.92, 0.10, '#7a6b55');
  p.rect(0.16, 0.44, 0.68, 0.09, '#1f7a3d');
  p.text('DHABA', 0.5, 0.487, 0.07, '#ffffff');
  // Charpoys out front.
  for (let i = 0; i < 2; i++) {
    const x = 0.14 + i * 0.42;
    p.rect(x, 0.74, 0.32, 0.06, '#c9b48a');
    p.rect(x, 0.80, 0.03, 0.14, '#6b5a42');
    p.rect(x + 0.29, 0.80, 0.03, 0.14, '#6b5a42');
  }
  p.scatter(8, seed, 0.2, 0.60, 0.6, 0.10, 0.014, ['#3a332a', '#4a4238']);
};

const palmHut: PropPainter = (p) => {
  p.poly([[0.5, 0.10], [0.96, 0.46], [0.04, 0.46]], '#a8853f');
  p.poly([[0.5, 0.18], [0.86, 0.46], [0.14, 0.46]], '#c19c4c');
  p.rect(0.14, 0.46, 0.72, 0.54, '#d8c9a8');
  p.rect(0.40, 0.62, 0.20, 0.38, '#4a3b2a');
  p.rect(0.18, 0.56, 0.14, 0.12, '#3b4a5c');
  p.rect(0.68, 0.56, 0.14, 0.12, '#3b4a5c');
};

const watertank: PropPainter = (p) => {
  p.rect(0.30, 0.36, 0.05, 0.64, '#6c737b');
  p.rect(0.65, 0.36, 0.05, 0.64, '#6c737b');
  p.line(0.30, 0.62, 0.70, 0.50, '#6c737b', 0.014);
  p.line(0.30, 0.50, 0.70, 0.62, '#6c737b', 0.014);
  p.rect(0.16, 0.14, 0.68, 0.24, '#1f4f8a');
  p.rect(0.16, 0.14, 0.68, 0.045, '#2f6fb0');
  p.ellipse(0.5, 0.14, 0.34, 0.05, '#2a5f9c');
};

const streetlight: PropPainter = (p) => {
  p.rect(0.44, 0.10, 0.055, 0.90, '#5a616a');
  p.curve(0.47, 0.10, 0.60, 0.04, 0.76, 0.10, '#5a616a', 0.035);
  p.roundRect(0.68, 0.09, 0.20, 0.055, 0.02, '#8a9099');
  // Sodium glow — the colour of every Indian street at night.
  p.ellipse(0.78, 0.145, 0.16, 0.05, withAlpha('#ffbe4d', 0.5));
  p.ellipse(0.78, 0.135, 0.08, 0.028, withAlpha('#ffe0a0', 0.9));
};

const nullah: PropPainter = (p, seed) => {
  p.rect(0, 0.42, 1, 0.58, '#8d9098');
  p.rect(0.04, 0.52, 0.92, 0.40, '#2a2f2a');
  p.rect(0.06, 0.56, 0.88, 0.32, '#1f2a22');
  p.scatter(10, seed, 0.08, 0.58, 0.84, 0.24, 0.02, ['#3a4a35', '#2c3a28', '#4a5540']);
  p.rect(0, 0.42, 1, 0.05, '#a3a6ad');
};

const barricade: PropPainter = (p) => {
  p.rect(0.06, 0.52, 0.88, 0.10, '#c1272d');
  for (let i = 0; i < 5; i++) p.rect(0.06 + i * 0.176, 0.52, 0.088, 0.10, '#f0f0f0');
  p.rect(0.06, 0.68, 0.88, 0.09, '#c1272d');
  for (let i = 0; i < 5; i++) p.rect(0.15 + i * 0.176, 0.68, 0.088, 0.09, '#f0f0f0');
  p.rect(0.10, 0.62, 0.06, 0.38, '#8a8578');
  p.rect(0.84, 0.62, 0.06, 0.38, '#8a8578');
};

const milestone: PropPainter = (p) => {
  p.rect(0.28, 0.30, 0.44, 0.70, '#e8e4d8');
  p.ellipse(0.5, 0.30, 0.22, 0.10, '#e8e4d8');
  p.ellipse(0.5, 0.30, 0.22, 0.10, '#f5c518');
  p.rect(0.28, 0.30, 0.44, 0.14, '#f5c518');
  p.text('42', 0.5, 0.58, 0.22, '#15171b');
};

const seawall: PropPainter = (p, seed) => {
  p.rect(0, 0.44, 1, 0.56, '#a8a49a');
  p.rect(0, 0.44, 1, 0.07, '#c2beb4');
  for (let i = 0; i < 6; i++) {
    p.rect(0.02 + i * 0.165, 0.51, 0.14, 0.42, '#9a968c');
  }
  // Tetrapods below.
  p.scatter(7, seed, 0.02, 0.80, 0.96, 0.18, 0.05, ['#8a867c', '#78746a']);
};

const waterfall: PropPainter = (p, seed) => {
  p.rect(0, 0, 1, 1, '#4a5548');
  p.poly([[0.1, 0], [0.9, 0], [1, 1], [0, 1]], '#3d4a3c');
  p.rect(0.34, 0, 0.24, 0.86, withAlpha('#dfeaf2', 0.82));
  p.rect(0.40, 0, 0.10, 0.86, withAlpha('#ffffff', 0.9));
  p.scatter(20, seed, 0.24, 0.62, 0.46, 0.36, 0.026, [
    'rgba(255,255,255,0.75)', 'rgba(220,236,246,0.6)',
  ]);
  p.ellipse(0.46, 0.92, 0.28, 0.08, withAlpha('#cfe0ea', 0.7));
};

const cycleCart: PropPainter = (p) => {
  p.rect(0.10, 0.52, 0.80, 0.24, '#8a6a3a');
  p.rect(0.10, 0.52, 0.80, 0.05, '#a8834a');
  p.circle(0.26, 0.84, 0.115, '#1b1d21');
  p.circle(0.74, 0.84, 0.115, '#1b1d21');
  p.circle(0.26, 0.84, 0.05, '#8a9099');
  p.circle(0.74, 0.84, 0.05, '#8a9099');
  // A pyramid of fruit.
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5 - r; c++) {
      p.circle(0.24 + c * 0.115 + r * 0.057, 0.48 - r * 0.065, 0.045,
        ['#e8542a', '#f0a828', '#c1272d'][r % 3] as string);
    }
  }
};

/* ───────────────────────────── animals ───────────────────────────── */

const cow: PropPainter = (p) => {
  p.ellipse(0.5, 0.62, 0.34, 0.20, '#d8cfc0');
  p.ellipse(0.34, 0.60, 0.14, 0.13, '#cdc3b2');
  p.rect(0.22, 0.72, 0.09, 0.28, '#c6bcab');
  p.rect(0.40, 0.74, 0.09, 0.26, '#c6bcab');
  p.rect(0.58, 0.74, 0.09, 0.26, '#c6bcab');
  p.rect(0.72, 0.72, 0.09, 0.28, '#c6bcab');
  p.ellipse(0.20, 0.50, 0.13, 0.10, '#e0d7c8');
  // Painted horns, which is how you know it belongs to someone.
  p.curve(0.14, 0.44, 0.10, 0.34, 0.16, 0.30, '#e8542a', 0.026);
  p.curve(0.24, 0.44, 0.28, 0.34, 0.22, 0.30, '#e8542a', 0.026);
  p.circle(0.13, 0.51, 0.018, '#2a2118');
  // The hump that makes it a zebu, not a Friesian.
  p.ellipse(0.42, 0.47, 0.13, 0.08, '#e0d7c8');
};

const dog: PropPainter = (p) => {
  p.ellipse(0.52, 0.66, 0.28, 0.14, '#b89a6e');
  p.ellipse(0.26, 0.60, 0.12, 0.10, '#c2a478');
  p.poly([[0.20, 0.53], [0.26, 0.40], [0.30, 0.55]], '#a88a5e');
  p.rect(0.30, 0.76, 0.07, 0.24, '#ab8d63');
  p.rect(0.66, 0.76, 0.07, 0.24, '#ab8d63');
  p.curve(0.78, 0.62, 0.92, 0.50, 0.86, 0.40, '#b89a6e', 0.03);
  p.circle(0.21, 0.58, 0.016, '#241d14');
};

const goat: PropPainter = (p) => {
  p.ellipse(0.52, 0.62, 0.24, 0.14, '#e0dad0');
  p.ellipse(0.28, 0.56, 0.10, 0.09, '#d4cec4');
  p.rect(0.36, 0.74, 0.06, 0.26, '#c9c3b8');
  p.rect(0.62, 0.74, 0.06, 0.26, '#c9c3b8');
  p.curve(0.24, 0.49, 0.18, 0.40, 0.26, 0.38, '#8a7a5e', 0.018);
  p.rect(0.30, 0.62, 0.04, 0.10, '#d4cec4');
};

/* ───────────────────────── named landmarks ───────────────────────── */

const russellMarket: PropPainter = (p) => {
  p.rect(0.04, 0.34, 0.92, 0.66, '#c9a882');
  p.rect(0.04, 0.34, 0.92, 0.05, '#8a6f4f');
  // Clock tower.
  p.rect(0.40, 0.02, 0.20, 0.34, '#d4b894');
  p.rect(0.38, 0.00, 0.24, 0.045, '#8a6f4f');
  p.circle(0.50, 0.14, 0.062, '#f2efe6');
  p.line(0.50, 0.14, 0.50, 0.10, '#1a1c20', 0.010);
  p.line(0.50, 0.14, 0.535, 0.155, '#1a1c20', 0.010);
  // Indo-Saracenic arcade.
  for (let i = 0; i < 5; i++) {
    const x = 0.08 + i * 0.176;
    p.rect(x, 0.52, 0.13, 0.48, '#5a4632');
    p.ellipse(x + 0.065, 0.52, 0.065, 0.08, '#5a4632');
    p.ellipse(x + 0.065, 0.50, 0.070, 0.085, '#b8977a');
    p.rect(x + 0.005, 0.53, 0.12, 0.46, '#3a2c1e');
  }
};

const stMarys: PropPainter = (p) => {
  p.rect(0.16, 0.36, 0.68, 0.64, '#f0ece0');
  p.poly([[0.5, 0.14], [0.86, 0.36], [0.14, 0.36]], '#e2ddce');
  // Twin Gothic spires.
  for (const x of [0.22, 0.78]) {
    p.rect(x - 0.055, 0.16, 0.11, 0.22, '#e8e3d5');
    p.poly([[x, 0.00], [x + 0.065, 0.17], [x - 0.065, 0.17]], '#b8b0a0');
    p.rect(x - 0.006, -0.03, 0.012, 0.045, '#8a8578');
  }
  // Rose window and pointed arch door.
  p.circle(0.5, 0.44, 0.075, '#3b4a6c');
  p.circle(0.5, 0.44, 0.050, '#5a7ab0');
  p.rect(0.42, 0.66, 0.16, 0.34, '#4a3b2a');
  p.poly([[0.5, 0.58], [0.58, 0.68], [0.42, 0.68]], '#4a3b2a');
};

const busTerminal: PropPainter = (p, seed) => {
  p.rect(0.02, 0.30, 0.96, 0.16, '#c25a2c');
  p.rect(0.02, 0.44, 0.96, 0.04, '#8a3d1c');
  for (let i = 0; i < 6; i++) p.rect(0.06 + i * 0.16, 0.48, 0.045, 0.52, '#8a9099');
  p.rect(0.06, 0.33, 0.88, 0.10, '#f0ede4');
  p.text('SHIVAJINAGAR', 0.5, 0.382, 0.075, '#1f4f8a');
  // Buses under the canopy.
  for (let i = 0; i < 3; i++) {
    const x = 0.08 + i * 0.31;
    const green = Painter.noise(seed + i) > 0.5;
    p.rect(x, 0.60, 0.26, 0.28, green ? '#1f7a3d' : '#c1272d');
    p.rect(x, 0.60, 0.26, 0.07, '#f0ede4');
    for (let w = 0; w < 4; w++) p.rect(x + 0.02 + w * 0.058, 0.69, 0.042, 0.08, '#2a3440');
  }
};

const pataleshwar: PropPainter = (p) => {
  // Rock-cut: a dark cave mouth in a basalt face.
  p.rect(0, 0.18, 1, 0.82, '#5a544c');
  p.rect(0, 0.18, 1, 0.06, '#6d675e');
  p.poly([[0.06, 0.24], [0.94, 0.24], [1, 1], [0, 1]], '#4a453e');
  p.rect(0.30, 0.46, 0.40, 0.54, '#14161a');
  p.ellipse(0.50, 0.46, 0.20, 0.12, '#14161a');
  for (const x of [0.24, 0.76]) p.rect(x - 0.035, 0.40, 0.07, 0.60, '#6d675e');
  p.ellipse(0.5, 0.86, 0.10, 0.06, '#8a8578');
};

const yeoorGate: PropPainter = (p) => {
  p.rect(0.08, 0.30, 0.06, 0.70, '#4a5a34');
  p.rect(0.86, 0.30, 0.06, 0.70, '#4a5a34');
  p.rect(0.04, 0.22, 0.92, 0.12, '#2f5c2b');
  p.text('YEOOR HILLS', 0.5, 0.283, 0.085, '#f0ede4');
  p.rect(0.04, 0.34, 0.92, 0.025, '#8a9944');
};

const redFortGate: PropPainter = (p) => {
  p.rect(0.02, 0.20, 0.96, 0.80, '#9c3b2c');
  p.rect(0.02, 0.20, 0.96, 0.06, '#7a2b1e');
  // Chhatris along the parapet.
  for (let i = 0; i < 5; i++) {
    const x = 0.10 + i * 0.20;
    p.rect(x - 0.03, 0.12, 0.06, 0.08, '#b04a38');
    p.ellipse(x, 0.12, 0.045, 0.035, '#c9a882');
  }
  // Great arched gateway.
  p.rect(0.36, 0.50, 0.28, 0.50, '#3a1a12');
  p.ellipse(0.50, 0.50, 0.14, 0.16, '#3a1a12');
  p.ellipse(0.50, 0.48, 0.155, 0.175, '#7a2b1e');
  p.rect(0.375, 0.52, 0.25, 0.48, '#2a120c');
  for (const x of [0.14, 0.86]) {
    p.rect(x - 0.05, 0.30, 0.10, 0.70, '#8a3325');
    p.ellipse(x, 0.30, 0.06, 0.05, '#c9a882');
  }
};

const lake: PropPainter = (p, seed) => {
  p.rect(0, 0.40, 1, 0.60, '#3f6b7d');
  p.rect(0, 0.40, 1, 0.05, '#5a8a9c');
  for (let i = 0; i < 9; i++) {
    const y = 0.48 + i * 0.055;
    p.rect(Painter.noise(seed + i) * 0.3, y, 0.3 + Painter.noise(seed + i * 2) * 0.4, 0.012,
      withAlpha('#9ec4d2', 0.35));
  }
};

/* ───────────────────────────── registry ───────────────────────────── */

export const PROPS: Record<string, PropPainter> = Object.fromEntries([
  define('banyan', 1.15, 1.4, banyan),
  define('peepal', 1.2, 1, peepal),
  define('gulmohar', 1.0, 1.2, gulmohar),
  define('coconut', 2.0, 0.7, coconut),
  define('raintree', 0.95, 1.4, raintree),
  define('neem', 1.25, 0.85, neem),
  define('shop-row', 0.75, 1.6, shopRow),
  define('colonial-facade', 0.95, 1.5, colonialFacade),
  define('highrise', 2.4, 1.3, highrise),
  define('artdeco', 1.7, 1.5, artdeco),
  define('havelifront', 1.3, 1.3, haveliFront),
  define('chai-tapri', 1.05, 0.5, chaiTapri),
  define('paan-shop', 1.15, 0.35, paanShop),
  define('temple', 1.3, 0.8, temple),
  define('mosque', 1.35, 1.2, mosque),
  define('church', 1.4, 1.1, church),
  define('hoarding', 0.85, 1.3, hoarding),
  define('flex-banner', 0.8, 1.1, flexBanner),
  define('bus-shelter', 0.8, 0.9, busShelter),
  define('dhaba', 0.9, 1, dhaba),
  define('palm-hut', 1.0, 0.9, palmHut),
  define('watertank', 1.5, 0.6, watertank),
  define('streetlight', 2.6, 0.25, streetlight),
  define('nullah', 0.4, 1, nullah),
  define('barricade', 0.6, 0.45, barricade),
  define('milestone', 1.1, 0.15, milestone),
  define('seawall', 0.45, 1.2, seawall),
  define('waterfall', 1.6, 1.2, waterfall),
  define('cycle-cart', 0.7, 0.5, cycleCart),
  define('cow', 0.7, 0.35, cow),
  define('dog', 0.55, 0.22, dog),
  define('goat', 0.6, 0.2, goat),
  define('russell-market', 0.85, 2.2, russellMarket),
  define('st-marys', 1.25, 1.6, stMarys),
  define('bus-terminal', 0.7, 2.4, busTerminal),
  define('pataleshwar', 0.9, 1.6, pataleshwar),
  define('yeoor-gate', 0.6, 1.4, yeoorGate),
  define('red-fort-gate', 0.85, 2.2, redFortGate),
  define('lake', 0.5, 3, lake),
]);

export const hasProp = (id: string): boolean => id in PROPS;

/** Fallback so an unknown scenery id draws something rather than throwing mid-frame. */
export const propPainter = (id: string): PropPainter => PROPS[id] ?? neem;

export const propAspect = (id: string): number => PROP_ASPECT[id] ?? 1;

export const propWorldWidth = (id: string): number => PROP_WIDTH[id] ?? 2;

export { mix, darken, lighten, withAlpha };
