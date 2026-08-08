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

/** Band edges in road half-widths, measured out from the centre line. */
const KERB_OUTER = 1.14;
const SHOULDER_OUTER = 1.72;
const FIELD_OUTER = 3.4;
/**
 * Below this projected road half-width (in pixels) the roadside bands are
 * sub-pixel and cost fill rate for nothing. Distant segments collapse to just
 * ground + rumble + tarmac, which is the same picture for a third of the work.
 */
const BAND_LOD_PIXELS = 26;
const MARKING_LOD_PIXELS = 10;

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
  const near = p1.w >= BAND_LOD_PIXELS;

  let road = surfaceColour(surface.road[light] as string, segment.surface);
  let grass = surface.grass[light] as string;
  let shoulder = surface.shoulder[light] as string;
  let kerb = surface.kerb[light] as string;
  const rumble = surface.rumble[light] as string;

  if (segment.covered) {
    road = darken(road, 0.42);
    grass = darken(grass, 0.5);
    shoulder = darken(shoulder, 0.5);
    kerb = darken(kerb, 0.45);
  }

  // Far ground, full width behind everything else.
  quad(ctx, 0, p1.y, screenWidth, 0, p2.y, screenWidth, grass);

  if (near) {
    // Mid-ground: the strip of dirt, plot or scrub between the footpath and
    // whatever lines the road. Without it the roadside is one flat colour from
    // the kerb to the horizon, which is what makes a procedural world look bare.
    const field = mix(grass, shoulder, segment.light ? 0.30 : 0.48);
    quad(ctx, p1.x, p1.y, p1.w * FIELD_OUTER, p2.x, p2.y, p2.w * FIELD_OUTER, field);

    // Shoulder: footpath in a city, gravel on a highway, mud in a ghat. This is
    // the band that stops the roadside reading as an empty coloured field.
    quad(ctx, p1.x, p1.y, p1.w * SHOULDER_OUTER, p2.x, p2.y, p2.w * SHOULDER_OUTER, shoulder);

    // Scattered detail on the shoulder — cracks, gravel, litter. Hashed off the
    // segment index so it is stable, and only on alternate segments so it reads
    // as passing texture rather than noise.
    if (segment.index % 2 === 0) {
      const hash = Math.sin(segment.index * 12.9898) * 43758.5453;
      const r = hash - Math.floor(hash);
      const side = r > 0.5 ? 1 : -1;
      const at = 1.3 + r * 0.6;
      const size = 0.10 + r * 0.16;
      quad(ctx,
        p1.x + side * at * p1.w, p1.y, p1.w * size,
        p2.x + side * at * p2.w, p2.y, p2.w * size,
        surface.detail[light] as string);
    }

    // Kerb stone, the hard edge the footpath sits behind.
    quad(ctx, p1.x, p1.y, p1.w * KERB_OUTER, p2.x, p2.y, p2.w * KERB_OUTER, kerb);
  }

  // Rumble strips just outside the tarmac.
  quad(ctx, p1.x, p1.y, p1.w + p1.w / 5, p2.x, p2.y, p2.w + p2.w / 5, rumble);

  // Tarmac.
  quad(ctx, p1.x, p1.y, p1.w, p2.x, p2.y, p2.w, road);

  // Lane markings. Two dashed lines rather than one centre stripe: a wide Indian
  // carriageway is two or three lanes, and two lines give twice the motion cue.
  if (segment.light && p1.w > MARKING_LOD_PIXELS && segment.surface !== 'mud') {
    const lane = withAlpha(surface.lane, 0.55);
    for (const offset of [-0.42, 0.42]) {
      quad(ctx,
        p1.x + offset * p1.w, p1.y, p1.w / 34,
        p2.x + offset * p2.w, p2.y, p2.w / 34,
        lane);
    }
  }
  // A solid edge line hugging the tarmac, which reads at every distance.
  if (near) {
    const edge = withAlpha(surface.lane, 0.4);
    for (const offset of [-0.93, 0.93]) {
      quad(ctx,
        p1.x + offset * p1.w, p1.y, p1.w / 40,
        p2.x + offset * p2.w, p2.y, p2.w / 40,
        edge);
    }
  }

  if (segment.hazard) drawHazard(ctx, segment, p1, p2);

  // Distance fog, laid over each quad so it costs nothing extra. The colour
  // comes from the sky's own haze, so the far end of the road always melts into
  // the horizon rather than ending in a grey band. Near segments are barely
  // fogged at all, and skipping those saves a full screen of fill per frame.
  if (segment.fog < 0.98) {
    ctx.fillStyle = withAlpha(fogColour, 1 - segment.fog);
    ctx.fillRect(0, p2.y, screenWidth, p1.y - p2.y + 1);
  }
};
