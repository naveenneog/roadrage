import { clamp, lerp, percentRemaining } from '../core/math.ts';
import { cameraDepthForFov, cameraPositionFor, fogFactor, project } from '../core/projection.ts';
import type { CircuitSpec } from '../data/types.ts';
import type { Race } from '../game/race.ts';
import type { Racer } from '../game/racer.ts';
import type { TrafficVehicle } from '../game/traffic.ts';
import { DEFAULT_ROAD_WIDTH, SEGMENT_LENGTH, type Road, type Segment } from '../track/road.ts';
import { SpriteAtlas } from './atlas.ts';
import { Background } from './background.ts';
import { Effects } from './effects.ts';
import { Painter } from './painter.ts';
import { mix } from './palette.ts';
import { paintSegment } from './road-painter.ts';
import type { BikeFrameOptions } from './sprites/bike.ts';
import { propWorldWidth } from './sprites/props.ts';

export interface RenderQuality {
  drawDistance: number;
  sceneryDetail: number;
  particles: boolean;
  speedLines: boolean;
}

export const QUALITY: Record<'low' | 'medium' | 'high', RenderQuality> = {
  low: { drawDistance: 110, sceneryDetail: 0.5, particles: false, speedLines: false },
  medium: { drawDistance: 180, sceneryDetail: 0.8, particles: true, speedLines: true },
  high: { drawDistance: 210, sceneryDetail: 1, particles: true, speedLines: true },
};

/** How far in front of the camera the player's bike sits, in world units. */
const PLAYER_Z_OFFSET = 900;
const CAMERA_HEIGHT = 1100;
const BASE_FOV = 96;
/** Segments nearer than this (in world units) draw no scenery. */
const SCENERY_NEAR_Z = 5200;
/** Scenery fades in across this band so nothing pops into existence. */
const SCENERY_FADE_Z = 3600;
/** The player's bike as a fraction of screen height; entities are clamped to it. */
const PLAYER_SPRITE_HEIGHT = 0.42;

/**
 * Draws one frame of the race.
 *
 * The segment loop is the classic pseudo-3D technique: walk forward from the
 * camera's segment, accumulate the fake curve into a lateral offset, project
 * both edges, and fill the quad between them. Everything else — scenery,
 * traffic, rivals — is sorted into segments and drawn back to front on the
 * return pass so the painter's algorithm handles occlusion for free.
 *
 * Screen-space presentation (particles, speed lines, grade, flash) lives in
 * `Effects`; this class is only concerned with the world.
 */
export class Renderer {
  readonly atlas: SpriteAtlas;
  readonly background = new Background();
  readonly effects: Effects;
  quality: RenderQuality = QUALITY.high;

  private width = 0;
  private height = 0;
  private cameraDepth = cameraDepthForFov(BASE_FOV);
  private shakeX = 0;
  private shakeY = 0;
  private speedBlur = 0;
  /** Blended from the circuit's haze and its surface fog when a race is prepared. */
  private fogColour = '#c9d4dc';

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    quality: 'low' | 'medium' | 'high' = 'high',
  ) {
    this.atlas = new SpriteAtlas(quality);
    this.quality = QUALITY[quality];
    this.effects = new Effects({
      particles: this.quality.particles,
      speedLines: this.quality.speedLines,
    });
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /** Flash the screen — used for heavy impacts and the finish line. */
  punch(colour: string, strength: number): void {
    this.effects.punch(colour, strength);
  }

  spawnImpact(screenX: number, screenY: number, power: number, colour: string): void {
    this.effects.spawnImpact(screenX, screenY, power, colour);
  }

  /** Rebuild the background and grade layers when the circuit changes. */
  prepare(circuit: CircuitSpec, road: Road): void {
    this.background.build(circuit.sky, circuit.timeOfDay, circuit.city, this.width, this.height);
    this.fogColour = mix(circuit.surface.fog, circuit.sky.haze, 0.68);
    this.effects.buildGrade(circuit, this.width, this.height);
    this.effects.clear();
    void road;
  }

  render(race: Race, circuit: CircuitSpec, dt: number, showDebug = false): void {
    const { ctx } = this;
    const width = this.width;
    const height = this.height;
    if (width === 0 || height === 0) return;

    const road = race.road;
    const player = race.player;
    const speedPercent = player.speedPercent;

    this.effects.step(dt);

    // Widening the field of view with speed is the cheapest and strongest
    // sensation-of-speed trick there is.
    const fov = BASE_FOV + speedPercent * 16 + (player.boost > 0 ? 8 : 0);
    this.cameraDepth = cameraDepthForFov(fov);
    this.speedBlur = speedPercent;

    // Camera sits behind the player, on the road surface. The position must be
    // wrapped into track space or the world vanishes for the first 900 units of
    // every lap — see `cameraPositionFor`.
    const position = cameraPositionFor(player.z, PLAYER_Z_OFFSET, road.length);
    const baseSegment = road.findSegment(position);
    const basePercent = percentRemaining(position, SEGMENT_LENGTH);
    const playerSegment = road.findSegment(player.z);
    const playerPercent = percentRemaining(player.z, SEGMENT_LENGTH);
    const playerWorldY = lerp(playerSegment.p1.world.y, playerSegment.p2.world.y, playerPercent);
    const cameraY = playerWorldY + CAMERA_HEIGHT + player.y * 0.4;

    // Shake decays toward zero; the race owns the magnitude, the renderer the wobble.
    const shake = race.shake;
    this.shakeX = (Painter.noise(performance.now() * 0.013) - 0.5) * shake * 26;
    this.shakeY = (Painter.noise(performance.now() * 0.017 + 9) - 0.5) * shake * 20;

    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);

    // The vanishing point sits on the camera axis, which is the screen centre.
    const horizon = height / 2;
    this.background.update(dt, playerSegment.curve, speedPercent, 0);
    this.background.draw(ctx, width, height, horizon);

    this.drawRoad(ctx, road, baseSegment, basePercent, player, cameraY, position, circuit);
    this.drawEntities(ctx, race, road, baseSegment, player);
    this.drawPlayer(ctx, race, player);

    ctx.restore();

    this.effects.drawSpeedLines(ctx, width, height, speedPercent, player.boost > 0);
    this.effects.drawGrade(ctx, width, height);
    this.effects.drawParticles(ctx);
    this.effects.drawFlash(ctx, width, height);

    if (showDebug) this.drawDebug(ctx, race);
  }

  /* ───────────────────────────── road ───────────────────────────── */

  private drawRoad(
    ctx: CanvasRenderingContext2D,
    road: Road,
    baseSegment: Segment,
    basePercent: number,
    player: Racer,
    cameraY: number,
    position: number,
    circuit: CircuitSpec,
  ): void {
    const width = this.width;
    const height = this.height;
    const surface = circuit.surface;
    let maxy = height;
    let x = 0;
    let dx = -(baseSegment.curve * basePercent);

    const segments = road.segments;
    const count = Math.min(this.quality.drawDistance, segments.length);

    for (let n = 0; n < count; n++) {
      const segment = segments[(baseSegment.index + n) % segments.length] as Segment;
      segment.looped = segment.index < baseSegment.index;
      segment.fog = fogFactor(n / count, circuit.fogDensity);
      segment.clip = maxy;

      const loopOffset = segment.looped ? road.length : 0;
      const roadWidth = DEFAULT_ROAD_WIDTH * segment.width;
      const cameraX = player.x * DEFAULT_ROAD_WIDTH;

      project(segment.p1, cameraX - x, cameraY, position - loopOffset,
        this.cameraDepth, width, height, roadWidth);
      project(segment.p2, cameraX - x - dx, cameraY, position - loopOffset,
        this.cameraDepth, width, height, roadWidth);

      x += dx;
      dx += segment.curve;

      // Cull: behind the projection plane, facing away, or hidden by a nearer hill.
      if (segment.p1.camera.z <= this.cameraDepth) continue;
      if (segment.p2.screen.y >= segment.p1.screen.y) continue;
      if (segment.p2.screen.y >= maxy) continue;

      this.drawSegment(ctx, segment, surface, n / count);
      maxy = segment.p2.screen.y;
    }
  }

  private drawSegment(
    ctx: CanvasRenderingContext2D,
    segment: Segment,
    surface: CircuitSpec['surface'],
    depth: number,
  ): void {
    paintSegment(ctx, segment, surface, this.width, this.fogColour);
    void depth;
  }

  /* ─────────────────────── scenery, traffic, rivals ─────────────────────── */

  private drawEntities(
    ctx: CanvasRenderingContext2D,
    race: Race,
    road: Road,
    baseSegment: Segment,
    player: Racer,
  ): void {
    const segments = road.segments;
    const count = Math.min(this.quality.drawDistance, segments.length);

    // Bucket the moving entities by segment so they sort with the scenery.
    const byIndex = new Map<number, Array<{ kind: 'racer'; racer: Racer } | { kind: 'traffic'; vehicle: TrafficVehicle }>>();
    const bucket = (index: number, item: { kind: 'racer'; racer: Racer } | { kind: 'traffic'; vehicle: TrafficVehicle }) => {
      const list = byIndex.get(index);
      if (list) list.push(item);
      else byIndex.set(index, [item]);
    };
    for (const racer of race.racers) {
      // Finished rivals stop being simulated, so drawing them would park a
      // frozen, pass-through ghost bike on the racing line at the finish.
      if (racer === player || racer.finished) continue;
      bucket(road.findSegment(racer.z).index, { kind: 'racer', racer });
    }
    for (const vehicle of race.traffic.vehicles) {
      if (!vehicle.active) continue;
      bucket(road.findSegment(vehicle.z).index, { kind: 'traffic', vehicle });
    }

    // Back to front, so nearer things paint over further ones.
    for (let n = count - 1; n >= 0; n--) {
      const segment = segments[(baseSegment.index + n) % segments.length] as Segment;
      if (segment.p1.camera.z <= this.cameraDepth) continue;

      // Scenery is culled by distance, not by segment count: a shopfront you are
      // level with is a wall of pixels that hides the entire road behind it.
      const depth = segment.p1.camera.z;
      if (depth > SCENERY_NEAR_Z) {
        const nearFade = clamp((depth - SCENERY_NEAR_Z) / SCENERY_FADE_Z, 0, 1);
        for (const item of segment.scenery) {
          this.drawScenery(ctx, segment, item.id, item.offset, item.scale, item.layer, nearFade);
        }
      }

      const movers = byIndex.get(segment.index);
      if (!movers) continue;
      for (const item of movers) {
        if (item.kind === 'traffic') {
          this.drawTraffic(ctx, road, item.vehicle, player);
        } else {
          this.drawRacer(ctx, road, item.racer, player);
        }
      }
    }
  }

  private drawScenery(
    ctx: CanvasRenderingContext2D,
    segment: Segment,
    id: string,
    offset: number,
    scale: number,
    variant: number,
    nearFade: number,
  ): void {
    const sprite = this.atlas.prop(id, variant % 3);
    const p = segment.p1.screen;
    if (p.scale <= 0 || p.w <= 0) return;

    // `p.w` is the road's half-width in pixels at this depth. Everything on the
    // road plane is sized and placed relative to it, which is what keeps props
    // glued to the tarmac through curves and over hills.
    const destW = p.w * propWorldWidth(id) * scale;
    const destH = (sprite.height / sprite.width) * destW;
    const destX = p.x + offset * p.w - destW / 2;
    const destY = p.y - destH;

    if (destX > this.width || destX + destW < 0 || destW < 1.5) return;
    if (destY > segment.clip) return;

    ctx.globalAlpha = segment.fog * nearFade;
    ctx.drawImage(sprite.canvas, destX, destY, destW, destH);
    ctx.globalAlpha = 1;
  }

  private projectEntity(
    road: Road,
    z: number,
    x: number,
    y: number,
    player: Racer,
  ): { x: number; y: number; w: number; fog: number; clip: number } | null {
    const segment = road.findSegment(z);
    const s1 = segment.p1.screen;
    if (s1.scale <= 0 || s1.w <= 0 || segment.p1.camera.z <= this.cameraDepth) return null;

    // Offset laterally from the segment's own projected centre. Re-projecting
    // each entity from scratch would ignore the accumulated fake curve and put
    // everyone on a straight road while the tarmac bends away underneath them.
    return {
      x: s1.x + (x - player.x) * s1.w,
      y: s1.y - s1.scale * y * (this.height / 2),
      w: s1.w,
      fog: segment.fog,
      clip: segment.clip,
    };
  }

  /** No entity may be drawn larger than the player's own bike is on screen. */
  private maxEntityWidth(sprite: { width: number; height: number }): number {
    return (sprite.width / sprite.height) * this.height * PLAYER_SPRITE_HEIGHT * 1.15;
  }

  private drawTraffic(
    ctx: CanvasRenderingContext2D,
    road: Road,
    vehicle: TrafficVehicle,
    player: Racer,
  ): void {
    const at = this.projectEntity(road, vehicle.z, vehicle.x, 0, player);
    if (!at) return;
    const sprite = this.atlas.vehicle(vehicle.spec, Math.abs(Math.round(vehicle.phase)) % 3);
    const destW = Math.min(at.w * vehicle.spec.width * 1.9, this.maxEntityWidth(sprite));
    const destH = (sprite.height / sprite.width) * destW;
    if (destW < 2) return;
    ctx.globalAlpha = at.fog;
    ctx.drawImage(sprite.canvas, at.x - destW / 2, at.y - destH, destW, destH);
    ctx.globalAlpha = 1;
  }

  private frameFor(racer: Racer): BikeFrameOptions {
    const lean = clamp(Math.round(racer.lean * 2), -2, 2);
    let action: 0 | 1 | 2 = 0;
    let side: -1 | 1 = 1;
    if (racer.attack) {
      action = racer.attack.kind === 'punch' ? 1 : 2;
      side = racer.attack.direction >= 0 ? 1 : -1;
    }
    return {
      lean: racer.attack ? 0 : lean,
      action,
      actionSide: side,
      down: racer.isDown,
      lamp: racer.speed < racer.handling.maxSpeed * 0.4 ? 1 : 0,
    };
  }

  private drawRacer(
    ctx: CanvasRenderingContext2D,
    road: Road,
    racer: Racer,
    player: Racer,
  ): void {
    const at = this.projectEntity(road, racer.z, racer.x, racer.y, player);
    if (!at) return;
    const sprite = this.atlas.bike(racer.bike, this.frameFor(racer));
    // A rival alongside you should read about the same size as you do; without
    // the clamp, one on the grid two metres ahead fills a third of the screen.
    const natural = at.w * (racer.bike.threeWheeler ? 0.78 : 0.56);
    const destW = Math.min(natural, this.maxEntityWidth(sprite));
    const destH = (sprite.height / sprite.width) * destW;
    if (destW < 2) return;
    ctx.globalAlpha = at.fog;
    ctx.drawImage(sprite.canvas, at.x - destW / 2, at.y - destH, destW, destH);
    ctx.globalAlpha = 1;
  }

  /** The player is always drawn last, at a fixed place on screen. */
  private drawPlayer(ctx: CanvasRenderingContext2D, race: Race, player: Racer): void {
    const sprite = this.atlas.bike(player.bike, this.frameFor(player));
    // Sized against height rather than width so an ultrawide monitor doesn't get
    // a motorcycle the size of a bus.
    const destH = this.height * PLAYER_SPRITE_HEIGHT;
    const destW = (sprite.width / sprite.height) * destH;
    const bob = Math.sin(performance.now() * 0.012) * player.speedPercent * 3;
    const wobble = player.wobble * Math.sin(performance.now() * 0.05) * 12;
    const airLift = player.y * 0.05;

    const x = this.width / 2 - destW / 2 + player.lean * this.width * 0.018 + wobble;
    const y = this.height - destH * 0.98 + bob - airLift;

    // Shadow shrinks and detaches when airborne — the only cue that you are flying.
    if (player.y > 0) {
      ctx.globalAlpha = clamp(1 - player.y / 900, 0.15, 0.6);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(this.width / 2, this.height - destH * 0.12, destW * 0.3, destH * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.drawImage(sprite.canvas, x, y, destW, destH);
    void race;
  }

  private drawDebug(ctx: CanvasRenderingContext2D, race: Race): void {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(8, 8, 210, 88);
    ctx.fillStyle = '#8ef2a0';
    ctx.font = '12px ui-monospace, monospace';
    const lines = [
      `sprites  ${this.atlas.size}`,
      `parts    ${this.effects.particleCount}`,
      `blur     ${this.speedBlur.toFixed(2)}`,
      `phase    ${race.phase}`,
      `shake    ${race.shake.toFixed(2)}`,
    ];
    lines.forEach((line, i) => ctx.fillText(line, 16, 26 + i * 14));
    ctx.restore();
  }
}
