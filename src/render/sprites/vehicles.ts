import type { TrafficSpec } from '../../data/types.ts';
import { Painter } from '../painter.ts';
import { darken, lighten, withAlpha } from '../palette.ts';

/**
 * Traffic, drawn from behind — because that is how you meet it at 140 km/h.
 * Each vehicle is built from its real silhouette: a Tata Ace is a tall narrow
 * box on a short wheelbase, a bus is a long slab, a bullock cart is two big
 * wooden wheels and an argument about right of way.
 */
export type VehiclePainter = (p: Painter, spec: TrafficSpec, seed: number) => void;

/** Height / width, so the atlas can size the sprite correctly. */
export const VEHICLE_ASPECT: Record<string, number> = {
  'auto': 0.95, 'splendor-family': 1.15, 'activa': 1.05, 'maruti800': 0.78,
  'tempo': 0.95, 'bus': 1.05, 'truck': 1.05, 'cycle-rickshaw': 1.0,
  'bullock-cart': 0.9, 'cow': 1.0,
};

const wheels = (p: Painter, y: number, r: number, left: number, right: number): void => {
  p.ellipse(left, y, r, r * 0.92, '#141619');
  p.ellipse(right, y, r, r * 0.92, '#141619');
  p.ellipse(left, y, r * 0.42, r * 0.38, '#8a9099');
  p.ellipse(right, y, r * 0.42, r * 0.38, '#8a9099');
};

const plate = (p: Painter, cx: number, y: number, w: number, label = 'MH 12'): void => {
  p.rect(cx - w / 2, y, w, w * 0.30, '#f0f0ee');
  p.text(label, cx, y + w * 0.15, w * 0.24, '#15171b');
};

const autoRickshaw: VehiclePainter = (p, spec) => {
  const [body, dark, roof] = spec.palette;
  p.ellipse(0.5, 0.96, 0.36, 0.035, 'rgba(0,0,0,0.3)');
  wheels(p, 0.86, 0.10, 0.20, 0.80);
  p.roundRect(0.18, 0.52, 0.64, 0.34, 0.06, body);
  p.rect(0.18, 0.56, 0.64, 0.08, roof);
  p.rect(0.18, 0.78, 0.64, 0.08, darken(body, 0.35));
  p.rect(0.20, 0.28, 0.03, 0.26, dark);
  p.rect(0.77, 0.28, 0.03, 0.26, dark);
  p.roundRect(0.15, 0.22, 0.70, 0.08, 0.03, roof);
  p.rect(0.25, 0.38, 0.50, 0.16, '#1a1d22');
  p.roundRect(0.27, 0.43, 0.46, 0.11, 0.03, '#6a2230');
  p.rect(0.42, 0.79, 0.16, 0.035, withAlpha('#e03a2f', 0.7));
  plate(p, 0.5, 0.855, 0.22);
};

const splendorFamily: VehiclePainter = (p, spec) => {
  const [body, accent, jacket] = spec.palette;
  p.ellipse(0.5, 0.97, 0.18, 0.025, 'rgba(0,0,0,0.3)');
  p.ellipse(0.5, 0.87, 0.11, 0.10, '#141619');
  p.ellipse(0.5, 0.87, 0.05, 0.045, '#9aa0a8');
  p.roundRect(0.36, 0.70, 0.28, 0.10, 0.04, body);
  p.rect(0.36, 0.735, 0.28, 0.018, accent);
  // Four up: father, small child in front, mother side-saddle, older child behind.
  p.roundRect(0.38, 0.44, 0.24, 0.28, 0.07, jacket);
  p.ellipse(0.50, 0.40, 0.085, 0.055, '#3a3128');
  p.roundRect(0.30, 0.52, 0.16, 0.20, 0.06, '#c1487a');
  p.ellipse(0.38, 0.49, 0.06, 0.04, '#2a2118');
  p.roundRect(0.56, 0.56, 0.13, 0.16, 0.05, '#e8a020');
  p.ellipse(0.625, 0.53, 0.05, 0.035, '#2a2118');
  p.line(0.34, 0.60, 0.66, 0.60, '#3a3f47', 0.018);
  p.rect(0.44, 0.79, 0.12, 0.025, withAlpha('#e03a2f', 0.7));
};

const activa: VehiclePainter = (p, spec) => {
  const [body, dark, trim] = spec.palette;
  p.ellipse(0.5, 0.97, 0.16, 0.022, 'rgba(0,0,0,0.28)');
  p.ellipse(0.5, 0.88, 0.095, 0.085, '#141619');
  p.roundRect(0.34, 0.62, 0.32, 0.24, 0.08, body);
  p.rect(0.34, 0.66, 0.32, 0.03, trim);
  p.roundRect(0.38, 0.54, 0.24, 0.12, 0.05, dark);
  p.roundRect(0.40, 0.34, 0.20, 0.22, 0.06, '#4a5568');
  p.ellipse(0.50, 0.31, 0.075, 0.05, '#d8d8d8');
  p.line(0.36, 0.50, 0.64, 0.50, '#3a3f47', 0.016);
  p.rect(0.45, 0.83, 0.10, 0.022, withAlpha('#e03a2f', 0.7));
};

const maruti800: VehiclePainter = (p, spec) => {
  const [body, dark] = spec.palette;
  p.ellipse(0.5, 0.97, 0.42, 0.03, 'rgba(0,0,0,0.3)');
  wheels(p, 0.87, 0.095, 0.19, 0.81);
  // Famously small and boxy.
  p.roundRect(0.10, 0.52, 0.80, 0.36, 0.05, body);
  p.roundRect(0.19, 0.28, 0.62, 0.26, 0.06, body);
  p.rect(0.22, 0.31, 0.56, 0.19, '#2c3a4a');
  p.rect(0.24, 0.33, 0.52, 0.06, withAlpha('#7f95ab', 0.5));
  p.rect(0.10, 0.76, 0.80, 0.06, darken(body, 0.3));
  p.rect(0.13, 0.66, 0.14, 0.07, withAlpha('#e03a2f', 0.8));
  p.rect(0.73, 0.66, 0.14, 0.07, withAlpha('#e03a2f', 0.8));
  plate(p, 0.5, 0.79, 0.26);
  p.rect(0.06, 0.40, 0.05, 0.05, dark);
  p.rect(0.89, 0.40, 0.05, 0.05, dark);
};

const tempo: VehiclePainter = (p, spec) => {
  const [body, dark, trim] = spec.palette;
  p.ellipse(0.5, 0.97, 0.44, 0.03, 'rgba(0,0,0,0.3)');
  wheels(p, 0.86, 0.105, 0.20, 0.80);
  // Flat bed with a slatted tailgate, cab hidden ahead of it.
  p.rect(0.10, 0.36, 0.80, 0.50, body);
  p.rect(0.10, 0.36, 0.80, 0.05, lighten(body, 0.18));
  for (let i = 0; i < 5; i++) p.rect(0.13, 0.44 + i * 0.085, 0.74, 0.05, dark);
  p.rect(0.10, 0.80, 0.80, 0.07, darken(body, 0.35));
  p.rect(0.14, 0.60, 0.16, 0.10, trim);
  p.text('ACE', 0.5, 0.40, 0.055, lighten(body, 0.5));
  p.rect(0.13, 0.72, 0.10, 0.05, withAlpha('#e03a2f', 0.8));
  p.rect(0.77, 0.72, 0.10, 0.05, withAlpha('#e03a2f', 0.8));
  plate(p, 0.5, 0.81, 0.24);
};

const bus: VehiclePainter = (p, spec, seed) => {
  const [body, cream, dark] = spec.palette;
  p.ellipse(0.5, 0.98, 0.48, 0.028, 'rgba(0,0,0,0.32)');
  wheels(p, 0.90, 0.09, 0.22, 0.78);
  p.rect(0.06, 0.08, 0.88, 0.82, body);
  p.rect(0.06, 0.08, 0.88, 0.16, cream);
  p.rect(0.06, 0.52, 0.88, 0.06, cream);
  // Rear window and the row above it.
  p.rect(0.13, 0.26, 0.74, 0.22, '#2a3440');
  p.rect(0.15, 0.28, 0.70, 0.07, withAlpha('#8fa8bd', 0.45));
  for (let i = 0; i < 4; i++) {
    const lit = Painter.noise(seed + i) > 0.5;
    p.rect(0.16 + i * 0.18, 0.62, 0.13, 0.10, lit ? withAlpha('#ffe0a0', 0.6) : '#2a3440');
  }
  p.rect(0.06, 0.84, 0.88, 0.06, dark);
  p.rect(0.11, 0.76, 0.12, 0.06, withAlpha('#e03a2f', 0.85));
  p.rect(0.77, 0.76, 0.12, 0.06, withAlpha('#e03a2f', 0.85));
  plate(p, 0.5, 0.855, 0.24);
};

const truck: VehiclePainter = (p, spec, seed) => {
  const [red, blue, yellow] = spec.palette;
  p.ellipse(0.5, 0.98, 0.50, 0.028, 'rgba(0,0,0,0.34)');
  wheels(p, 0.90, 0.085, 0.20, 0.80);
  p.ellipse(0.31, 0.90, 0.085, 0.078, '#141619');
  p.ellipse(0.69, 0.90, 0.085, 0.078, '#141619');
  // High wooden body, hand-painted, overloaded and leaning.
  p.rect(0.04, 0.10, 0.92, 0.72, red);
  p.rect(0.04, 0.10, 0.92, 0.07, blue);
  p.rect(0.04, 0.30, 0.92, 0.05, yellow);
  p.rect(0.04, 0.62, 0.92, 0.05, yellow);
  for (let i = 0; i < 6; i++) {
    p.rect(0.06 + i * 0.155, 0.36, 0.03, 0.25, darken(red, 0.3));
  }
  // The tailboard slogan.
  p.rect(0.08, 0.68, 0.84, 0.13, '#f0ece0');
  p.text('HORN OK PLEASE', 0.5, 0.745, 0.075, '#c1272d');
  p.rect(0.08, 0.83, 0.84, 0.07, darken(red, 0.4));
  p.rect(0.11, 0.845, 0.10, 0.045, withAlpha('#e03a2f', 0.9));
  p.rect(0.79, 0.845, 0.10, 0.045, withAlpha('#e03a2f', 0.9));
  // A row of dangling chains under the tailboard.
  for (let i = 0; i < 7; i++) {
    p.line(0.14 + i * 0.12, 0.90, 0.14 + i * 0.12, 0.94 + Painter.noise(seed + i) * 0.03, '#8a9099', 0.008);
  }
};

const cycleRickshaw: VehiclePainter = (p, spec) => {
  const [blue, yellow, dark] = spec.palette;
  p.ellipse(0.5, 0.97, 0.30, 0.025, 'rgba(0,0,0,0.28)');
  p.ellipse(0.24, 0.84, 0.115, 0.11, '#141619');
  p.ellipse(0.76, 0.84, 0.115, 0.11, '#141619');
  for (const cx of [0.24, 0.76]) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      p.line(cx - Math.cos(a) * 0.09, 0.84 - Math.sin(a) * 0.085,
        cx + Math.cos(a) * 0.09, 0.84 + Math.sin(a) * 0.085, '#8a9099', 0.006);
    }
  }
  p.rect(0.22, 0.56, 0.56, 0.24, blue);
  p.roundRect(0.24, 0.58, 0.52, 0.14, 0.04, '#7a2b3a');
  // Fringed canopy.
  p.roundRect(0.18, 0.26, 0.64, 0.07, 0.03, yellow);
  p.rect(0.20, 0.30, 0.03, 0.26, dark);
  p.rect(0.77, 0.30, 0.03, 0.26, dark);
  for (let i = 0; i < 11; i++) {
    p.rect(0.19 + i * 0.058, 0.33, 0.03, 0.035, i % 2 ? '#c1272d' : yellow);
  }
};

const bullockCart: VehiclePainter = (p, spec) => {
  const [wood, pale, dark] = spec.palette;
  p.ellipse(0.5, 0.97, 0.40, 0.028, 'rgba(0,0,0,0.3)');
  // Big spoked wooden wheels.
  for (const cx of [0.18, 0.82]) {
    p.ellipse(cx, 0.76, 0.17, 0.20, dark);
    p.ellipse(cx, 0.76, 0.14, 0.17, wood);
    p.ellipse(cx, 0.76, 0.05, 0.06, dark);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      p.line(cx - Math.cos(a) * 0.13, 0.76 - Math.sin(a) * 0.16,
        cx + Math.cos(a) * 0.13, 0.76 + Math.sin(a) * 0.16, dark, 0.012);
    }
  }
  p.rect(0.16, 0.52, 0.68, 0.16, wood);
  p.rect(0.16, 0.52, 0.68, 0.04, pale);
  // Load of sacks.
  for (let i = 0; i < 4; i++) {
    p.ellipse(0.26 + i * 0.16, 0.46, 0.09, 0.08, '#c9b48a');
  }
  // The two bullocks ahead, mostly hidden behind the load.
  p.ellipse(0.38, 0.36, 0.11, 0.09, '#d8cfc0');
  p.ellipse(0.62, 0.36, 0.11, 0.09, '#cdc3b2');
};

const cow: VehiclePainter = (p, spec) => {
  const [hide, horn, eye] = spec.palette;
  p.ellipse(0.5, 0.965, 0.34, 0.032, 'rgba(0,0,0,0.3)');
  // Rear view: rump, tail, and the hind legs planted in your lane.
  p.ellipse(0.5, 0.62, 0.30, 0.22, hide);
  p.ellipse(0.5, 0.50, 0.22, 0.12, lighten(hide, 0.08));
  p.rect(0.30, 0.78, 0.11, 0.20, darken(hide, 0.10));
  p.rect(0.59, 0.78, 0.11, 0.20, darken(hide, 0.14));
  p.rect(0.30, 0.94, 0.11, 0.05, '#3a2f24');
  p.rect(0.59, 0.94, 0.11, 0.05, '#3a2f24');
  // Tail flicking.
  p.line(0.50, 0.46, 0.545, 0.74, darken(hide, 0.2), 0.026);
  p.ellipse(0.548, 0.77, 0.030, 0.038, '#3a2f24');
  // The hump that makes it a zebu, and painted horns either side of the head.
  p.ellipse(0.5, 0.42, 0.14, 0.075, lighten(hide, 0.12));
  p.curve(0.40, 0.40, 0.35, 0.31, 0.41, 0.28, horn, 0.026);
  p.curve(0.60, 0.40, 0.65, 0.31, 0.59, 0.28, horn, 0.026);
  p.ellipse(0.44, 0.435, 0.018, 0.014, eye);
  p.ellipse(0.56, 0.435, 0.018, 0.014, eye);
};

/**
 * Front views, for traffic coming the other way.
 *
 * Four archetypes rather than one painter per vehicle: at a combined closing
 * speed of 200 km/h you register a silhouette, a pair of headlights and a
 * colour, and you register them for about a third of a second.
 */
const frontLights = (p: Painter, y: number, spread: number, size: number): void => {
  for (const side of [-1, 1] as const) {
    p.ellipse(0.5 + side * spread, y, size * 1.9, size * 1.9, 'rgba(255,228,150,0.30)');
    p.ellipse(0.5 + side * spread, y, size, size, '#fff2c8');
    p.ellipse(0.5 + side * spread, y, size * 0.5, size * 0.5, '#ffffff');
  }
};

const frontTall: VehiclePainter = (p, spec, seed) => {
  // Bus or truck: a slab of painted metal with a windscreen high up.
  const [body, trim, accent] = spec.palette;
  p.ellipse(0.5, 0.97, 0.46, 0.028, 'rgba(0,0,0,0.32)');
  wheels(p, 0.90, 0.085, 0.22, 0.78);
  p.rect(0.06, 0.10, 0.88, 0.80, body);
  p.rect(0.06, 0.10, 0.88, 0.13, trim);
  // Windscreen with a driver behind it.
  p.rect(0.13, 0.26, 0.74, 0.24, '#1e2733');
  p.rect(0.15, 0.28, 0.70, 0.09, withAlpha('#8fa8bd', 0.35));
  p.ellipse(0.32, 0.42, 0.055, 0.045, '#2a2118');
  // Grille and bumper.
  p.rect(0.13, 0.58, 0.74, 0.14, darken(body, 0.35));
  for (let i = 0; i < 6; i++) p.rect(0.15 + i * 0.12, 0.60, 0.08, 0.10, darken(body, 0.15));
  p.rect(0.06, 0.76, 0.88, 0.10, accent);
  frontLights(p, 0.815, 0.32, 0.045);
  plate(p, 0.5, 0.885, 0.22);
  void seed;
};

const frontCar: VehiclePainter = (p, spec) => {
  const [body, dark] = spec.palette;
  p.ellipse(0.5, 0.97, 0.42, 0.03, 'rgba(0,0,0,0.3)');
  wheels(p, 0.88, 0.095, 0.19, 0.81);
  p.roundRect(0.10, 0.50, 0.80, 0.38, 0.05, body);
  p.roundRect(0.19, 0.26, 0.62, 0.26, 0.06, body);
  p.rect(0.22, 0.29, 0.56, 0.19, '#1e2733');
  p.rect(0.24, 0.31, 0.52, 0.06, withAlpha('#8fa8bd', 0.4));
  p.rect(0.13, 0.70, 0.74, 0.09, darken(body, 0.32));
  frontLights(p, 0.635, 0.30, 0.042);
  plate(p, 0.5, 0.795, 0.24);
  p.rect(0.06, 0.40, 0.05, 0.05, dark);
  p.rect(0.89, 0.40, 0.05, 0.05, dark);
};

const frontAuto: VehiclePainter = (p, spec) => {
  const [body, dark, roof] = spec.palette;
  p.ellipse(0.5, 0.96, 0.34, 0.035, 'rgba(0,0,0,0.3)');
  // One wheel at the front, which is the whole giveaway.
  p.ellipse(0.5, 0.86, 0.085, 0.10, '#141619');
  p.ellipse(0.5, 0.86, 0.038, 0.045, '#8a9099');
  p.roundRect(0.18, 0.50, 0.64, 0.32, 0.07, body);
  p.rect(0.18, 0.54, 0.64, 0.08, roof);
  p.rect(0.20, 0.28, 0.03, 0.24, dark);
  p.rect(0.77, 0.28, 0.03, 0.24, dark);
  p.roundRect(0.15, 0.22, 0.70, 0.08, 0.03, roof);
  // Windscreen, driver, and the single headlamp between the bars.
  p.rect(0.26, 0.36, 0.48, 0.16, '#1e2733');
  p.ellipse(0.5, 0.46, 0.06, 0.05, '#2a2118');
  p.ellipse(0.5, 0.70, 0.085, 0.085, 'rgba(255,228,150,0.28)');
  p.ellipse(0.5, 0.70, 0.045, 0.045, '#fff2c8');
};

const frontBike: VehiclePainter = (p, spec) => {
  const [body, accent, jacket] = spec.palette;
  p.ellipse(0.5, 0.97, 0.16, 0.022, 'rgba(0,0,0,0.28)');
  p.ellipse(0.5, 0.86, 0.085, 0.10, '#141619');
  p.roundRect(0.40, 0.58, 0.20, 0.20, 0.05, body);
  p.rect(0.40, 0.62, 0.20, 0.02, accent);
  // Rider facing you.
  p.roundRect(0.38, 0.36, 0.24, 0.24, 0.07, jacket);
  p.ellipse(0.50, 0.32, 0.085, 0.06, '#3a3128');
  p.line(0.32, 0.50, 0.68, 0.50, '#3a3f47', 0.018);
  p.ellipse(0.5, 0.70, 0.070, 0.070, 'rgba(255,228,150,0.30)');
  p.ellipse(0.5, 0.70, 0.036, 0.036, '#fff2c8');
};

/** Which front archetype a vehicle uses when it is coming the other way. */
const FRONT_VIEW: Record<string, VehiclePainter> = {
  'bus': frontTall, 'truck': frontTall, 'tempo': frontTall,
  'maruti800': frontCar,
  'auto': frontAuto, 'cycle-rickshaw': frontAuto, 'bullock-cart': frontTall,
  'splendor-family': frontBike, 'activa': frontBike,
};

export const VEHICLES: Record<string, VehiclePainter> = {
  'auto': autoRickshaw,
  'splendor-family': splendorFamily,
  'activa': activa,
  'maruti800': maruti800,
  'tempo': tempo,
  'bus': bus,
  'truck': truck,
  'cycle-rickshaw': cycleRickshaw,
  'bullock-cart': bullockCart,
  'cow': cow,
};

export const vehiclePainter = (id: string, oncoming = false): VehiclePainter => {
  if (oncoming) return FRONT_VIEW[id] ?? frontCar;
  return VEHICLES[id] ?? maruti800;
};
export const vehicleAspect = (id: string): number => VEHICLE_ASPECT[id] ?? 0.9;
