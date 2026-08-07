import type { BikeSpec } from '../data/types.ts';
import { Painter } from './painter.ts';
import { BIKE_FRAMES, frameKey, paintBike, type BikeFrameOptions } from './sprites/bike.ts';
import { propAspect, propPainter } from './sprites/props.ts';
import { vehicleAspect, vehiclePainter } from './sprites/vehicles.ts';
import type { TrafficSpec } from '../data/types.ts';

export interface Sprite {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

const createCanvas = (w: number, h: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
};

/**
 * Rasterises every procedural painter once, up front, into offscreen canvases.
 *
 * Redrawing a banyan tree with forty bezier curves for each of the two hundred
 * segments on screen would be hopeless; drawing it once and blitting it two
 * hundred times is trivial. This is the entire reason the game holds 60fps.
 */
export class SpriteAtlas {
  private readonly cache = new Map<string, Sprite>();
  /** Base pixel width for a prop at its largest on-screen size. */
  private readonly baseWidth: number;

  constructor(quality: 'low' | 'medium' | 'high' = 'high') {
    this.baseWidth = quality === 'low' ? 128 : quality === 'medium' ? 192 : 288;
  }

  private make(key: string, w: number, h: number, draw: (p: Painter) => void): Sprite {
    const existing = this.cache.get(key);
    if (existing) return existing;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.imageSmoothingEnabled = true;
    draw(new Painter(ctx, canvas.width, canvas.height));
    const sprite: Sprite = { canvas, width: canvas.width, height: canvas.height };
    this.cache.set(key, sprite);
    return sprite;
  }

  /** One bike frame. Variants are keyed by lean, action and brake lamp. */
  bike(spec: BikeSpec, options: BikeFrameOptions, livery?: { body: string; roof: string }): Sprite {
    const key = `bike:${spec.id}:${frameKey(options)}:${livery?.body ?? ''}`;
    const w = this.baseWidth;
    return this.make(key, w, w, (p) => paintBike(p, spec, options, livery));
  }

  /** Pre-rasterise every frame for a bike so no allocation happens mid-race. */
  warmBike(spec: BikeSpec, livery?: { body: string; roof: string }): void {
    for (const frame of BIKE_FRAMES) this.bike(spec, frame, livery);
  }

  prop(id: string, variant: number): Sprite {
    const key = `prop:${id}:${variant}`;
    const aspect = propAspect(id);
    const w = this.baseWidth;
    return this.make(key, w, w * aspect, (p) => propPainter(id)(p, variant * 17 + 3));
  }

  vehicle(spec: TrafficSpec, variant: number): Sprite {
    const key = `veh:${spec.id}:${variant}`;
    const w = this.baseWidth;
    return this.make(key, w, w * vehicleAspect(spec.id), (p) =>
      vehiclePainter(spec.id)(p, spec, variant * 11 + 5));
  }

  /** Warm every prop and vehicle a circuit will ever ask for. */
  warmCircuit(propIds: readonly string[], vehicles: readonly TrafficSpec[], variants = 3): void {
    for (const id of propIds) {
      for (let v = 0; v < variants; v++) this.prop(id, v);
    }
    for (const spec of vehicles) {
      for (let v = 0; v < variants; v++) this.vehicle(spec, v);
    }
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}
