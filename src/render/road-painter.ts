import type { SurfacePalette } from '../data/types.ts';
import type { Segment } from '../track/road.ts';
import { darken, mix, withAlpha } from './palette.ts';

/**
 * Paints one road segment: verge, rumble strips, tarmac, lane markings, hazards
 * and distance fog.
 *
 * Split from the renderer because it is pure painting — it knows nothing about
 * the camera, the field or the loop, only about turning two projected edges
 * into pixels.
 */

/** A road quad: two horizontal spans joined into a trapezium. */
export const quad = (
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, w1: number,
  x2: number, y2: number, w2: number,
  fill: string,
): void => {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x1 - w1, y1);
  ctx.lineTo(x2 - w2, y2);
  ctx.lineTo(x2 + w2, y2);
  ctx.lineTo(x1 + w1, y1);
  ctx.closePath();
  ctx.fill();
};

/** Recolour the tarmac for a surface change rather than carrying a palette per surface. */
export const surfaceColour = (base: string, surface: Segment['surface']): string => {
  switch (surface) {
    case 'cobble': return mix(base, '#6a6258', 0.55);
    case 'broken': return mix(base, '#55504a', 0.45);
    case 'mud': return mix(base, '#5c4a34', 0.6);
    case 'wet': return darken(base, 0.18);
    case 'concrete': return mix(base, '#7a7d82', 0.35);
    default: return base;
  }
};

const drawHazard = (
  ctx: CanvasRenderingContext2D,
  segment: Segment,
  p1: { x: number; y: number; w: number },
  p2: { x: number; y: number; w: number },
): void => {
  switch (segment.hazard) {
    case 'breaker': {
      // Painted yellow-and-black bar across the carriageway — usually the only
      // warning an Indian speed breaker gives you, when it gives one at all.
      quad(ctx, p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, '#e8c02a');
      const step = p1.w / 4;
      for (let i = -2; i < 2; i += 2) {
        quad(ctx, p1.x + i * step, p1.y, step * 0.5,
          p2.x + i * (p2.w / 4), p2.y, (p2.w / 4) * 0.5, '#1c1e22');
      }
      break;
    }
    case 'pothole': {
      const cx1 = p1.x + segment.hazardOffset * p1.w;
      const cx2 = p2.x + segment.hazardOffset * p2.w;
      quad(ctx, cx1, p1.y, p1.w * 0.16, cx2, p2.y, p2.w * 0.16, '#15171b');
      break;
    }
    case 'oil':
    case 'puddle': {
      quad(ctx, p1.x, p1.y, p1.w * 0.7, p2.x, p2.y, p2.w * 0.7, withAlpha('#0e1218', 0.45));
      break;
    }
    case 'gravel': {
      quad(ctx, p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, withAlpha('#8a8272', 0.5));
      break;
    }
  }
};

export const paintSegment = (
  ctx: CanvasRenderingContext2D,
  segment: Segment,
  surface: SurfacePalette,
  screenWidth: number,
  fogColour: string,
): void => {
  const p1 = segment.p1.screen;
  const p2 = segment.p2.screen;
  const light = segment.light ? 0 : 1;

  let road = surfaceColour(surface.road[light] as string, segment.surface);
  let grass = surface.grass[light] as string;
  const rumble = surface.rumble[light] as string;

  if (segment.covered) {
    road = darken(road, 0.42);
    grass = darken(grass, 0.5);
  }

  // Verge, full width behind everything else.
  quad(ctx, 0, p1.y, screenWidth, 0, p2.y, screenWidth, grass);

  // Rumble strips just outside the tarmac.
  quad(ctx, p1.x, p1.y, p1.w + p1.w / 5, p2.x, p2.y, p2.w + p2.w / 5, rumble);

  // Tarmac.
  quad(ctx, p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, road);

  // Lane markings, only on the light segments so they dash naturally.
  if (segment.light && p1.w > 8 && segment.surface !== 'mud') {
    quad(ctx, p1.x, p1.y, p1.w / 28, p2.x, p2.y, p2.w / 28, withAlpha(surface.lane, 0.55));
  }

  if (segment.hazard) drawHazard(ctx, segment, p1, p2);

  // Distance fog, laid over each quad so it costs nothing extra. The colour
  // comes from the sky's own haze, so the far end of the road always melts into
  // the horizon rather than ending in a grey band.
  if (segment.fog < 1) {
    ctx.fillStyle = withAlpha(fogColour, 1 - segment.fog);
    ctx.fillRect(0, p2.y, screenWidth, p1.y - p2.y + 1);
  }
};
