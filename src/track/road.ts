import { easeIn, easeInOut, percentRemaining, lerp } from '../core/math.ts';
import { makePoint, type ProjectedPoint } from '../core/projection.ts';

export const SEGMENT_LENGTH = 200;
export const RUMBLE_LENGTH = 3;
export const DEFAULT_ROAD_WIDTH = 2000;

export type Surface = 'tarmac' | 'broken' | 'cobble' | 'mud' | 'wet' | 'concrete';
export type HazardKind = 'breaker' | 'pothole' | 'oil' | 'gravel' | 'puddle';

export interface SceneryItem {
  /** Prop id resolved against the sprite atlas. */
  id: string;
  /** Lateral position in road half-widths. |offset| > 1 is off the tarmac. */
  offset: number;
  /** Multiplier on the prop's natural size. */
  scale: number;
  /** Draw order nudge for props sharing a segment. */
  layer: number;
}

/** How many segments of painted run-up a speed breaker gets. */
const WARN_SEGMENTS = 14;

/**
 * Furthest a pothole's centre may sit from the road centre, in half-widths.
 *
 * The painted rim reaches 0.26 either side of centre, so anything past this
 * hangs over the kerb. A hole off the tarmac is one the player can neither see
 * nor hit — it is not a hazard, just wasted paint.
 */
const POTHOLE_REACH = 0.72;

export interface Segment {
  index: number;
  p1: ProjectedPoint;
  p2: ProjectedPoint;
  /** Per-segment lateral curvature. Accumulated during render to fake the bend. */
  curve: number;
  /** Road half-width multiplier — Indian lanes pinch and open constantly. */
  width: number;
  surface: Surface;
  hazard: HazardKind | null;
  /** Lateral centre of the hazard, in road half-widths. */
  hazardOffset: number;
  /**
   * 0..1 warning intensity for a hazard a short way ahead.
   *
   * Set on the segments approaching a speed breaker so the road itself can warn
   * you, the way a painted approach does in real life. Without it a breaker is
   * invisible until you are on it, which at 140 km/h is not a hazard so much as
   * a coin toss.
   */
  warn: number;
  scenery: SceneryItem[];
  /** Alternates every RUMBLE_LENGTH segments to give the road its moving stripes. */
  light: boolean;
  /** Marks the wrapped copies drawn past the finish line. */
  looped: boolean;
  /** 0 (fully fogged) .. 1 (clear). Filled during render. */
  fog: number;
  /** Screen-space clip line, so a segment can't draw over a nearer hill. */
  clip: number;
  /** Set when the segment sits inside a tunnel/flyover underpass. */
  covered: boolean;
  /** Street lamps and shopfront glow, 0..1 — used by the night circuits. */
  lit: number;
}

export type TrackOp =
  | { op: 'straight'; n?: number; hill?: number }
  | { op: 'curve'; n?: number; enter?: number; leave?: number; curve: number; hill?: number }
  | { op: 'hill'; n?: number; height: number }
  | { op: 'scurve'; n?: number; curve?: number }
  | { op: 'hairpin'; curve: number; hill?: number }
  | { op: 'breakers'; count?: number; gap?: number }
  | { op: 'potholes'; n?: number; density?: number }
  | { op: 'narrow'; n?: number; width: number }
  | { op: 'surface'; n?: number; kind: Surface }
  | { op: 'tunnel'; n?: number }
  | { op: 'landmark'; id: string; offset: number; scale?: number }
  | { op: 'checkpoint' };

export const ROAD_LENGTH = { none: 0, short: 25, medium: 50, long: 100 } as const;
export const ROAD_CURVE = { none: 0, easy: 2, medium: 4, hard: 6, hairpin: 9 } as const;
export const ROAD_HILL = { none: 0, low: 20, medium: 40, high: 60 } as const;

/**
 * Builds the segment list for a circuit. Kept separate from rendering so a track
 * can be constructed and asserted about in a test with no canvas in sight.
 */
export class RoadBuilder {
  readonly segments: Segment[] = [];
  readonly checkpoints: number[] = [];
  private currentSurface: Surface = 'tarmac';
  private currentWidth = 1;
  private tunnelDepth = 0;

  private lastY(): number {
    const last = this.segments[this.segments.length - 1];
    return last ? last.p2.world.y : 0;
  }

  private addSegment(curve: number, y: number): Segment {
    const n = this.segments.length;
    const segment: Segment = {
      index: n,
      p1: makePoint(0, this.lastY(), n * SEGMENT_LENGTH),
      p2: makePoint(0, y, (n + 1) * SEGMENT_LENGTH),
      curve,
      width: this.currentWidth,
      surface: this.currentSurface,
      hazard: null,
      hazardOffset: 0,
      warn: 0,
      scenery: [],
      light: Math.floor(n / RUMBLE_LENGTH) % 2 === 1,
      looped: false,
      fog: 0,
      clip: 0,
      covered: this.tunnelDepth > 0,
      lit: 0,
    };
    this.segments.push(segment);
    return segment;
  }

  /** Ease into a curve, hold it, ease out — the shape that makes a bend readable at speed. */
  addRoad(enter: number, hold: number, leave: number, curve: number, hill: number): this {
    const startY = this.lastY();
    const endY = startY + hill * SEGMENT_LENGTH;
    const total = enter + hold + leave;
    if (total === 0) return this;
    let n = 0;
    for (let i = 0; i < enter; i++, n++) {
      this.addSegment(easeIn(0, curve, i / enter), easeInOut(startY, endY, n / total));
    }
    for (let i = 0; i < hold; i++, n++) {
      this.addSegment(curve, easeInOut(startY, endY, n / total));
    }
    for (let i = 0; i < leave; i++, n++) {
      this.addSegment(easeInOut(curve, 0, i / leave), easeInOut(startY, endY, n / total));
    }
    return this;
  }

  apply(op: TrackOp): this {
    switch (op.op) {
      case 'straight': {
        const n = op.n ?? ROAD_LENGTH.medium;
        this.addRoad(n, n, n, 0, op.hill ?? 0);
        break;
      }
      case 'curve': {
        const n = op.n ?? ROAD_LENGTH.medium;
        this.addRoad(op.enter ?? n, n, op.leave ?? n, op.curve, op.hill ?? 0);
        break;
      }
      case 'hill': {
        const n = op.n ?? ROAD_LENGTH.medium;
        this.addRoad(n, n, n, 0, op.height);
        break;
      }
      case 'scurve': {
        const n = op.n ?? ROAD_LENGTH.medium;
        const c = op.curve ?? ROAD_CURVE.easy;
        this.addRoad(n, n, n, -c, ROAD_HILL.none);
        this.addRoad(n, n, n, c * 1.6, ROAD_HILL.medium);
        this.addRoad(n, n, n, c, -ROAD_HILL.low);
        this.addRoad(n, n, n, -c, ROAD_HILL.medium);
        this.addRoad(n, n, n, -c * 1.6, -ROAD_HILL.medium);
        break;
      }
      case 'hairpin': {
        // Short entry, long hold, short exit: the bend arrives fast and stays.
        this.addRoad(ROAD_LENGTH.short, ROAD_LENGTH.medium, ROAD_LENGTH.short, op.curve, op.hill ?? 0);
        break;
      }
      case 'breakers': {
        const count = op.count ?? 3;
        const gap = op.gap ?? 8;
        for (let i = 0; i < count; i++) {
          // A speed breaker is a short, sharp rise and fall. Real ones are
          // painted on the approach, so the road warns you before the bump —
          // mark the run-up before laying the hump itself.
          this.markApproach(WARN_SEGMENTS);
          this.addRoad(2, 1, 2, 0, 9);
          this.markLast(5, 'breaker', 0);
          this.addRoad(2, 1, 2, 0, -9);
          this.addRoad(gap, 0, 0, 0, 0);
        }
        break;
      }
      case 'potholes': {
        const n = op.n ?? ROAD_LENGTH.short;
        const density = op.density ?? 0.35;
        const start = this.segments.length;
        this.addRoad(n, 0, 0, 0, 0);
        for (let i = start; i < this.segments.length; i++) {
          const segment = this.segments[i];
          if (!segment) continue;
          // Deterministic scatter: index-hashed rather than random, so a circuit
          // has the same potholes every single run and can be learned.
          const h = Math.sin(i * 12.9898) * 43758.5453;
          const r = h - Math.floor(h);
          if (r < density) {
            const s = Math.sin(i * 78.233) * 43758.5453;
            segment.hazard = 'pothole';
            segment.hazardOffset = (2 * (s - Math.floor(s)) - 1) * POTHOLE_REACH;
          }
        }
        break;
      }
      case 'narrow': {
        this.currentWidth = op.width;
        const n = op.n ?? ROAD_LENGTH.short;
        this.addRoad(n, n, n, 0, 0);
        this.currentWidth = 1;
        break;
      }
      case 'surface': {
        this.currentSurface = op.kind;
        const n = op.n ?? ROAD_LENGTH.short;
        this.addRoad(n, n, n, 0, 0);
        this.currentSurface = 'tarmac';
        break;
      }
      case 'tunnel': {
        this.tunnelDepth++;
        const n = op.n ?? ROAD_LENGTH.short;
        this.addRoad(n, n, n, 0, 0);
        this.tunnelDepth--;
        break;
      }
      case 'landmark': {
        const target = this.segments[this.segments.length - 1];
        target?.scenery.push({ id: op.id, offset: op.offset, scale: op.scale ?? 1, layer: 2 });
        break;
      }
      case 'checkpoint': {
        this.checkpoints.push(Math.max(0, this.segments.length - 1));
        break;
      }
    }
    return this;
  }

  /**
   * Paint a warning run-up onto the segments already laid, fading in toward
   * whatever is about to be placed. Strongest immediately before the hazard.
   */
  private markApproach(count: number): void {
    const first = Math.max(0, this.segments.length - count);
    for (let i = first; i < this.segments.length; i++) {
      const segment = this.segments[i];
      if (!segment) continue;
      const nearness = (i - first + 1) / count;
      segment.warn = Math.max(segment.warn, nearness);
    }
  }

  private markLast(count: number, hazard: HazardKind, offset: number): void {
    for (let i = Math.max(0, this.segments.length - count); i < this.segments.length; i++) {
      const segment = this.segments[i];
      if (!segment) continue;
      segment.hazard = hazard;
      segment.hazardOffset = offset;
    }
  }

  /** Close the loop: blend the last few segments back down to y=0 so the seam is invisible. */
  closeLoop(blend = 40): this {
    const startY = this.lastY();
    if (Math.abs(startY) > 0.5) {
      const total = blend;
      for (let i = 0; i < total; i++) {
        this.addSegment(easeInOut(0, 0, i / total), easeInOut(startY, 0, (i + 1) / total));
      }
    }
    // Guarantee the rumble stripes line up across the seam.
    while (this.segments.length % (RUMBLE_LENGTH * 2) !== 0) this.addSegment(0, 0);
    return this;
  }

  build(): Road {
    return new Road(this.segments, this.checkpoints);
  }
}

export class Road {
  readonly length: number;

  constructor(
    readonly segments: Segment[],
    readonly checkpoints: number[],
  ) {
    this.length = segments.length * SEGMENT_LENGTH;
  }

  findSegment(z: number): Segment {
    const wrapped = ((z % this.length) + this.length) % this.length;
    const index = Math.floor(wrapped / SEGMENT_LENGTH) % this.segments.length;
    return this.segments[index] as Segment;
  }

  /** Interpolated ground height at an arbitrary z — used to sit bikes on hills. */
  groundHeight(z: number): number {
    const segment = this.findSegment(z);
    const t = percentRemaining(z, SEGMENT_LENGTH);
    return lerp(segment.p1.world.y, segment.p2.world.y, t);
  }

  /** Interpolated half-width multiplier at an arbitrary z. */
  widthAt(z: number): number {
    const segment = this.findSegment(z);
    const next = this.segments[(segment.index + 1) % this.segments.length] as Segment;
    const t = percentRemaining(z, SEGMENT_LENGTH);
    return lerp(segment.width, next.width, t);
  }

  curveAt(z: number): number {
    return this.findSegment(z).curve;
  }
}
