import { clamp } from '../core/math.ts';

interface Shout {
  text: string;
  gloss: string;
  /** Screen x as 0..1, so it survives a resize between spawn and expiry. */
  x: number;
  /** Screen y as 0..1. */
  y: number;
  life: number;
  max: number;
  /** Slight per-shout tilt, so a busy junction does not look typeset. */
  tilt: number;
  hostile: boolean;
}

const MAX_SHOUTS = 5;

/**
 * Speech from other road users, drawn in screen space over the world.
 *
 * These are the loudest thing in an Indian street and the game was silent about
 * it: you could scythe through six lanes of traffic at 140 and nobody so much
 * as looked up. A shout is short-lived, drifts upward, and is drawn with a
 * heavy outline so it stays readable over a moving road.
 *
 * Kept out of `Effects` because these are typography with their own lifetime
 * and legibility rules, not particles.
 */
export class Shouts {
  private readonly active: Shout[] = [];
  /** Whether the plain-English gloss is drawn under the line. */
  subtitles = false;

  add(text: string, gloss: string, x: number, hostile: boolean): void {
    this.active.push({
      text,
      gloss,
      x: clamp(x, 0.08, 0.92),
      // Spawned around the upper-middle band, clear of the HUD and the bike.
      y: 0.30 + Math.random() * 0.16,
      life: 0,
      max: hostile ? 2.1 : 1.7,
      tilt: (Math.random() - 0.5) * 0.14,
      hostile,
    });
    // Newest wins: an unreadable pile of five overlapping shouts helps nobody.
    if (this.active.length > MAX_SHOUTS) this.active.shift();
  }

  clear(): void {
    this.active.length = 0;
  }

  step(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const s = this.active[i] as Shout;
      s.life += dt;
      if (s.life >= s.max) {
        this.active.splice(i, 1);
        continue;
      }
      // Drifts up and slightly away, the way a shout falls behind you.
      s.y -= dt * 0.045;
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.active.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const s of this.active) {
      const t = s.life / s.max;
      // Pops in fast, holds, then fades — a shout that fades in is a whisper.
      const alpha = t < 0.12 ? t / 0.12 : t > 0.72 ? 1 - (t - 0.72) / 0.28 : 1;
      // Overshoots slightly on arrival so it lands with some force.
      const pop = t < 0.12 ? 1.18 - (t / 0.12) * 0.18 : 1;
      const size = Math.max(15, Math.round(height * 0.034 * pop));

      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.translate(s.x * width, s.y * height);
      ctx.rotate(s.tilt);
      ctx.font = `700 ${size}px "Barlow Condensed", system-ui, sans-serif`;

      // Heavy dark casing, then the fill. Text over a moving road needs a real
      // outline; a drop shadow disappears the moment it lands on tarmac.
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, size * 0.26);
      ctx.strokeStyle = 'rgba(6,7,9,0.92)';
      ctx.strokeText(s.text, 0, 0);
      ctx.fillStyle = s.hostile ? '#ff8f6a' : '#ffe0a3';
      ctx.fillText(s.text, 0, 0);

      if (this.subtitles) {
        const small = Math.max(10, Math.round(size * 0.46));
        ctx.font = `500 ${small}px system-ui, sans-serif`;
        ctx.lineWidth = Math.max(2, small * 0.28);
        ctx.strokeStyle = 'rgba(6,7,9,0.9)';
        ctx.strokeText(s.gloss, 0, size * 0.82);
        ctx.fillStyle = 'rgba(242,244,247,0.78)';
        ctx.fillText(s.gloss, 0, size * 0.82);
      }
      ctx.restore();
    }
    ctx.restore();
  }
}
