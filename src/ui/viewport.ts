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

/**
 * Gives pixels back when the frame rate sags, and takes them again when it
 * recovers.
 *
 * This renderer is fill-rate bound, so a 10% resolution drop buys roughly 20%
 * of the frame and is very hard to see — whereas cutting draw distance or
 * scenery is immediately obvious. Hysteresis between the two thresholds stops
 * it oscillating around a single frame rate.
 */
export class ResolutionGovernor {
  private scale = 1;
  private timer = 0;

  constructor(
    private readonly floor = 0.62,
    private readonly interval = 1.2,
  ) {}

  get value(): number {
    return this.scale;
  }

  reset(): void {
    this.scale = 1;
    this.timer = 0;
  }

  /** Returns true when the scale changed and the canvas needs resizing. */
  update(dt: number, fps: number): boolean {
    this.timer += dt;
    if (this.timer < this.interval || fps <= 0) return false;
    this.timer = 0;

    const before = this.scale;
    if (fps < 52 && this.scale > this.floor) {
      this.scale = Math.max(this.floor, this.scale - 0.08);
    } else if (fps > 58 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.04);
    }
    return this.scale !== before;
  }
}
export interface ShellHooks {
  onResize(): void;
  onFirstGesture(): void;
  onHidden(): void;
}

/**
 * Window-level wiring: resize, orientation, the first user gesture that browsers
 * require before audio may start, and pausing when the tab goes away.
 */
export const bindShellEvents = (hooks: ShellHooks): void => {
  window.addEventListener('resize', () => hooks.onResize());
  window.addEventListener('orientationchange', () =>
    window.setTimeout(() => hooks.onResize(), 120));

  // Browsers will not start an AudioContext until the user has interacted.
  let unlocked = false;
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    hooks.onFirstGesture();
  };
  for (const type of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(type, unlock, { once: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hooks.onHidden();
  });
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
 *
 * `resolutionScale` is the adaptive multiplier the app adjusts at runtime when
 * the frame rate sags — this renderer is fill-rate bound, so pixels are the
 * cheapest thing to give back.
 */
export const fitCanvas = (
  canvas: HTMLCanvasElement,
  quality: QualityLevel,
  resolutionScale = 1,
): ViewportSize => {
  const cssWidth = window.innerWidth;
  const cssHeight = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.25 : 2);

  const maxPixels = quality === 'high' ? 2_100_000 : quality === 'medium' ? 1_500_000 : 950_000;
  let scale = dpr;
  while (cssWidth * cssHeight * scale * scale > maxPixels && scale > 0.5) scale -= 0.05;
  scale = Math.max(0.5, scale * resolutionScale);

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
