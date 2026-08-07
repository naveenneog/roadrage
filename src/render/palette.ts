/**
 * Colour utilities for the procedural painters.
 *
 * Everything the game draws is generated at runtime from a small palette, so
 * these helpers are how a single tank colour becomes a lit face, a shadowed
 * face and a rim highlight without hand-authoring three hex codes.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const parseHex = (hex: string): Rgb => {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
};

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

export const toHex = ({ r, g, b }: Rgb): string =>
  `#${clamp255(r).toString(16).padStart(2, '0')}${clamp255(g).toString(16).padStart(2, '0')}${clamp255(b).toString(16).padStart(2, '0')}`;

/** Lighten toward white. `amount` is 0..1. */
export const lighten = (hex: string, amount: number): string => {
  const { r, g, b } = parseHex(hex);
  return toHex({
    r: r + (255 - r) * amount,
    g: g + (255 - g) * amount,
    b: b + (255 - b) * amount,
  });
};

/** Darken toward black. `amount` is 0..1. */
export const darken = (hex: string, amount: number): string => {
  const { r, g, b } = parseHex(hex);
  return toHex({ r: r * (1 - amount), g: g * (1 - amount), b: b * (1 - amount) });
};

export const mix = (a: string, b: string, t: number): string => {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
};

export const withAlpha = (hex: string, alpha: number): string => {
  const { r, g, b } = parseHex(hex);
  return `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${Math.max(0, Math.min(1, alpha))})`;
};

/**
 * Shift a colour toward the light of a given hour. Used so the same prop
 * palette reads as dawn, noon or sodium-lit night without a second palette.
 */
export const gradeFor = (hex: string, tint: string, amount: number): string =>
  amount <= 0 ? hex : mix(hex, tint, Math.min(1, amount));

/** Perceived brightness, 0..1. Used to decide whether text should be light or dark. */
export const luminance = (hex: string): number => {
  const { r, g, b } = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

export const readableOn = (background: string): string =>
  luminance(background) > 0.55 ? '#14161b' : '#f2f4f7';
