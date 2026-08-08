import type { Racer } from '../game/racer.ts';
import { clamp, damp } from '../core/math.ts';
import type { SpriteAtlas } from './atlas.ts';
import type { Effects } from './effects.ts';
import type { BikeFrameOptions } from './sprites/bike.ts';
import { wheelAnchor } from './sprites/bike.ts';

/** Fraction of the viewport height the player's machine occupies. */
export const PLAYER_SPRITE_HEIGHT = 0.50;

export interface PlayerViewDeps {
  atlas: SpriteAtlas;
  effects: Effects;
  /** Whether particles are affordable at the current quality level. */
  particles: () => boolean;
}

/**
 * Draws the player's machine, which is the only thing on screen the player
 * looks at for the whole race.
 *
 * It is deliberately separate from the segment loop because almost nothing here
 * is baked: the lean is a real rotation, the rear wheel is its own sprite spun
 * by distance travelled, the body rides on a damped suspension, and the exhaust
 * trails smoke. A static sprite at this size reads as a cardboard cutout no
 * matter how well it is drawn, so the state that makes it move lives here.
 */
export class PlayerView {
  /** Accumulated rear-wheel rotation, in radians. */
  private wheelAngle = 0;
  /** Suspension travel in pixels, damped toward the current jolt. */
  private suspension = 0;
  private exhaustTimer = 0;
  private livery: { body: string; roof: string } | undefined;

  constructor(private readonly deps: PlayerViewDeps) {}

  setLivery(livery: { body: string; roof: string } | undefined): void {
    this.livery = livery;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    player: Racer,
    frame: BikeFrameOptions,
    width: number,
    height: number,
    dt: number,
  ): void {
    // The baked frame carries the pose; live rotation carries the lean, so the
    // sprite itself is kept upright and only the weight shift is baked.
    const sprite = this.deps.atlas.heroBike(player.bike, { ...frame, lean: 0 }, this.livery);

    const destH = height * PLAYER_SPRITE_HEIGHT;
    const destW = (sprite.width / sprite.height) * destH;
    const now = performance.now();

    // Engine idle shiver plus a speed-tied bob, so the bike is never still.
    const speedPercent = player.speedPercent;
    const idle = Math.sin(now * 0.045) * (1 - speedPercent) * 1.6;
    const bob = Math.sin(now * 0.013) * speedPercent * 4;
    this.suspension = damp(this.suspension, player.wobble * 26, 0.09, dt);
    const wobbleX = player.wobble * Math.sin(now * 0.055) * 9;

    const baseX = width / 2 + player.lean * width * 0.020 + wobbleX;
    // The sprite's contact patch is at its very bottom edge, so it is seated on
    // the bottom of the frame rather than hung slightly off it — a clipped rear
    // tyre was the first thing that made the machine look pasted on.
    const baseY = height - destH + bob + idle + this.suspension - player.y * 0.05;

    // Shadow shrinks and detaches when airborne — the only cue that you are flying.
    if (player.y > 0) {
      ctx.globalAlpha = clamp(1 - player.y / 900, 0.15, 0.6);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(width / 2, height - destH * 0.10, destW * 0.26, destH * 0.035, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.save();
    // Rotate about the contact patch so the bike pivots on its tyre, not its middle.
    ctx.translate(baseX, baseY + destH);
    ctx.rotate(player.lean * 0.085);
    ctx.translate(-destW / 2, -destH);
    if (!player.isDown) this.drawWheel(ctx, player, destW, destH, dt);
    ctx.drawImage(sprite.canvas, 0, 0, destW, destH);
    ctx.restore();

    if (!player.isDown) this.spawnExhaust(player, baseX, baseY + destH * 0.86, destW, dt);
  }

  /** The rear wheel, spun by distance travelled so the rate always matches speed. */
  private drawWheel(
    ctx: CanvasRenderingContext2D,
    player: Racer,
    destW: number,
    destH: number,
    dt: number,
  ): void {
    if (player.bike.threeWheeler) return;
    const wheel = this.deps.atlas.heroWheel(player.bike);
    const anchor = wheelAnchor(player.bike);

    // Angular velocity from road speed: a wheel that spins at a fixed rate, or
    // at a rate unrelated to speed, is immediately obvious as fake.
    const radius = anchor.r * destH;
    this.wheelAngle += (player.speed * dt) / Math.max(1, radius * 0.55);

    const size = anchor.r * 2 * destH * 1.04;
    ctx.save();
    ctx.translate(destW * 0.5, anchor.y * destH);
    ctx.rotate(this.wheelAngle);
    ctx.drawImage(wheel.canvas, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  /**
   * Exhaust: a puff on the overrun and a haze under load. Cheap, and it puts
   * something moving behind the bike that is not the road.
   *
   * Spawns into the effects buffer rather than drawing directly, so the smoke
   * is composited with the impact sparks in one pass.
   */
  private spawnExhaust(player: Racer, x: number, y: number, destW: number, dt: number): void {
    if (!this.deps.particles()) return;
    this.exhaustTimer -= dt;
    if (this.exhaustTimer > 0) return;
    // Two-strokes smoke constantly; four-strokes only puff when working hard.
    const twoStroke = player.bike.voice.stroke === 2;
    this.exhaustTimer = twoStroke ? 0.055 : 0.14;

    const strength = twoStroke ? 0.55 + player.speedPercent * 0.4 : player.speedPercent;
    if (strength < 0.25) return;

    const side = player.bike.voice.firingOrder === 2 ? 0 : 0.30;
    this.deps.effects.spawnSmoke(
      x + destW * (side + (Math.random() - 0.5) * 0.06),
      y,
      strength * (twoStroke ? 1 : 0.6),
      twoStroke ? 'rgba(214,214,206,0.55)' : 'rgba(180,180,176,0.32)',
    );
  }
}
