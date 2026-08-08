import type { TrafficSpec } from './types.ts';

/**
 * Everything else using the road. Speeds are the real cruising speeds these
 * vehicles actually manage in Indian city traffic, which is what makes them
 * obstacles rather than scenery.
 */
export const TRAFFIC: readonly TrafficSpec[] = [
  {
    id: 'auto',
    name: 'Auto rickshaw',
    minKmh: 38, maxKmh: 55,
    width: 0.34, mass: 0.45,
    weaves: 0.9,
    palette: ['#f2c12e', '#101010', '#1f7a3d'],
    note: 'Bajaj RE, ~65 km/h flat out, but never driven in a straight line.',
  },
  {
    id: 'splendor-family',
    name: 'Splendor, four up',
    minKmh: 40, maxKmh: 62,
    width: 0.18, mass: 0.18,
    weaves: 1.0,
    palette: ['#1d232e', '#c9302c', '#3c4a63'],
    note: 'Man, wife, two children, one helmet between them. Weaves through everything.',
  },
  {
    id: 'activa',
    name: 'Activa',
    minKmh: 35, maxKmh: 55,
    width: 0.17, mass: 0.16,
    weaves: 0.75,
    palette: ['#8a9099', '#2b2f36', '#c8ccd2'],
    note: '109.5cc CVT scooter, ~85 km/h. The CVT whine never changes pitch.',
  },
  {
    id: 'maruti800',
    name: 'Maruti 800',
    minKmh: 35, maxKmh: 58,
    width: 0.42, mass: 0.6,
    weaves: 0.35,
    palette: ['#dfe1e4', '#9aa0a6', '#2c2f34'],
    note: '3.3 m long, 1983–2014, and still the default car of the Indian road.',
  },
  {
    id: 'tempo',
    name: 'Tata Ace',
    minKmh: 32, maxKmh: 52,
    width: 0.46, mass: 0.8,
    weaves: 0.4,
    palette: ['#e8eaec', '#5a6068', '#1f5fa8'],
    note: 'Mini goods carrier, everywhere, always overloaded.',
  },
  {
    id: 'bus',
    name: 'City bus',
    minKmh: 28, maxKmh: 48,
    width: 0.66, mass: 1.0,
    weaves: 0.25,
    palette: ['#1f7a3d', '#f0ede4', '#2b2f36'],
    note: 'BMTC green in Bengaluru, BEST red in Mumbai. Pulls left without warning.',
  },
  {
    id: 'truck',
    name: 'Goods truck',
    minKmh: 26, maxKmh: 46,
    width: 0.7, mass: 1.0,
    weaves: 0.2,
    palette: ['#b8332c', '#1f5fa8', '#e8c84a'],
    note: 'Ashok Leyland, hand-painted cab, HORN OK PLEASE across the tailboard.',
  },
  {
    id: 'cycle-rickshaw',
    name: 'Cycle rickshaw',
    minKmh: 10, maxKmh: 16,
    width: 0.3, mass: 0.22,
    weaves: 0.8,
    palette: ['#1f6fd0', '#e8c84a', '#2b2f36'],
    note: 'Ten to fifteen km/h, zero lane discipline, infinite confidence.',
  },
  {
    id: 'bullock-cart',
    name: 'Bullock cart',
    minKmh: 6, maxKmh: 10,
    width: 0.5, mass: 0.7,
    weaves: 0.15,
    palette: ['#8a6a3a', '#c9b48a', '#3a2f24'],
    note: 'Five to ten km/h. Painted horns, bell collar, and right of way by tradition.',
  },
  {
    id: 'cow',
    name: 'Cow',
    minKmh: 3, maxKmh: 7,
    width: 0.30, mass: 0.75,
    weaves: 0.5,
    palette: ['#d8cfc0', '#e8542a', '#2a2118'],
    note: 'Stands in the road, unimpressed by horns, and cannot be hit without consequence.',
  },
];

const BY_ID = new Map(TRAFFIC.map((t) => [t.id, t]));

export const getTraffic = (id: string): TrafficSpec => {
  const spec = BY_ID.get(id);
  if (!spec) throw new Error(`Unknown traffic vehicle: ${id}`);
  return spec;
};
