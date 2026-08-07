export type QualityLevel = 'low' | 'medium' | 'high';

/**
 * Canvas sizing and quality selection.
 *
 * Kept out of the app shell because it is fiddly, device-dependent and entirely
 * self-contained: how big to make the backing store, and how much detail the
 * machine can afford.
 */

/**
 * Coarse capability guess. Pixel budget and core count are the only signals
 * available before a single frame has been drawn, and both are cheap to read.
 */
export const resolveQuality = (setting: QualityLevel | 'auto'): QualityLevel => {
  if (setting !== 'auto') return setting;
  const pixels = window.innerWidth * window.innerHeight * (window.devicePixelRatio || 1);
  const cores = navigator.hardwareConcurrency ?? 4;
  if (pixels > 3_500_000 && cores >= 8) return 'high';
  if (pixels > 1_200_000 && cores >= 4) return 'medium';
  return 'low';
};

export interface ViewportSize {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  /** True when the device is a phone held upright, where the game is unplayable. */
  needsRotation: boolean;
}

/**
 * Size the canvas backing store.
 *
 * The internal resolution is capped rather than following devicePixelRatio
 * blindly: on a 3x phone a full-resolution canvas is nine times the fill rate
 * for no visible gain at these sprite sizes.
 */
export const fitCanvas = (
  canvas: HTMLCanvasElement,
  quality: QualityLevel,
): ViewportSize => {
  const cssWidth = window.innerWidth;
  const cssHeight = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.25 : 2);

  const maxPixels = quality === 'high' ? 2_600_000 : quality === 'medium' ? 1_800_000 : 1_100_000;
  let scale = dpr;
  while (cssWidth * cssHeight * scale * scale > maxPixels && scale > 0.6) scale -= 0.1;

  canvas.width = Math.round(cssWidth * scale);
  canvas.height = Math.round(cssHeight * scale);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  return {
    cssWidth,
    cssHeight,
    pixelWidth: canvas.width,
    pixelHeight: canvas.height,
    // Portrait on a phone gives a road two centimetres wide. Ask for landscape.
    needsRotation: cssHeight > cssWidth && Math.min(cssWidth, cssHeight) < 560,
  };
};
