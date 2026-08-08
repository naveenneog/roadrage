import { clamp } from '../core/math.ts';
import type { CircuitSpec } from '../data/types.ts';
import { Painter } from './painter.ts';
import { withAlpha } from './palette.ts';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; colour: string; size: number;
  /** Smoke grows and fades; sparks shrink and fall. */
  smoke?: boolean;
}

/** Cap on simultaneous particles, so a pile-up cannot tank the frame rate. */
const MAX_PARTICLES = 320;

/**
 * Screen-space presentation: impact particles, speed lines, the colour grade
 * and the impact flash.
 *
 * Split out of the renderer because none of it touches the road geometry — it
 * is what happens to the picture after the world has been drawn.
 */
export class Effects {
  private particles: Particle[] = [];
  private flash = 0;
  private flashColour = '#ffffff';
  private gradeLayer: HTMLCanvasElement | null = null;
  private gradeKey = '';

  constructor(public enabled = { particles: true, speedLines: true }) {}

  get particleCount(): number {
    return this.particles.length;
  }

  punch(colour: string, strength: number): void {
    this.flash = Math.max(this.flash, strength);
    this.flashColour = colour;
  }

  spawnImpact(x: number, y: number, power: number, colour: string): void {
    if (!this.enabled.particles) return;
    const count = Math.round(6 + power * 18);
    for (let i = 0; i < count; i++) {
      const angle = Painter.noise(i * 3.1 + x) * Math.PI * 2;
      const speed = (60 + Painter.noise(i * 7.7) * 260) * (0.4 + power);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life: 0, max: 0.28 + Painter.noise(i) * 0.4,
        colour, size: 2 + Painter.noise(i * 5) * 4,
      });
    }
    if (this.particles.length > MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - MAX_PARTICLES);
    }
  }

  /**
   * Exhaust smoke: drifts back and up, growing and thinning as it goes.
   * Separate from impact sparks because it needs the opposite physics.
   */
  spawnSmoke(x: number, y: number, strength: number, colour: string): void {
    if (!this.enabled.particles) return;
    this.particles.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * 26,
      vy: 40 + Math.random() * 50,
      life: 0,
      max: 0.42 + Math.random() * 0.5 * strength,
      colour,
      size: 5 + Math.random() * 9 * strength,
      smoke: true,
    });
    if (this.particles.length > MAX_PARTICLES) this.particles.shift();
  }

  step(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i] as Particle;
      p.life += dt;
      if (p.life >= p.max) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.smoke) {
        // Smoke rises against the slipstream, slows, and expands.
        p.vy -= 30 * dt;
        p.vx *= 1 - dt * 0.9;
        p.size += 26 * dt;
      } else {
        p.vy += 900 * dt;
        p.vx *= 1 - dt * 1.6;
      }
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
  }

  clear(): void {
    this.particles.length = 0;
    this.flash = 0;
  }

  /**
   * Radial streaks from the vanishing point. The cheapest and most effective
   * sensation-of-speed trick there is, and it costs one stroke per line.
   */
  drawSpeedLines(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    speedPercent: number,
    boosting: boolean,
  ): void {
    if (!this.enabled.speedLines) return;
    const intensity = Math.max(0, speedPercent - 0.55) / 0.45;
    if (intensity <= 0 && !boosting) return;

    const strength = clamp(intensity + (boosting ? 0.45 : 0), 0, 1.2);
    const count = Math.round(14 + strength * 26);
    const t = performance.now() * 0.001;

    ctx.save();
    ctx.strokeStyle = withAlpha(boosting ? '#ffd28a' : '#ffffff', 0.07 + strength * 0.15);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const a = Painter.noise(i * 3.7) * Math.PI * 2 + t * 0.6;
      const r0 = width * (0.22 + Painter.noise(i * 5.1) * 0.14);
      const r1 = r0 + width * (0.05 + strength * 0.14);
      const cx = width / 2;
      const cy = height * 0.56;
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.6);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.6);
    }
    // One path, one stroke: batching turns forty draw calls into one.
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The colour grade and vignette are a fixed, full-screen composite. Rebuilding
   * them every frame costs several milliseconds at 1080p for a result that never
   * changes, so they are rasterised once per circuit and blitted.
   */
  buildGrade(circuit: CircuitSpec, width: number, height: number): void {
    const key = `${circuit.id}:${width}x${height}`;
    if (this.gradeKey === key) return;
    this.gradeKey = key;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const gctx = canvas.getContext('2d');
    if (!gctx) return;

    const { grade, gradeAlpha } = circuit.sky;
    if (gradeAlpha > 0) {
      gctx.fillStyle = withAlpha(grade, gradeAlpha);
      gctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const vignette = gctx.createRadialGradient(
      canvas.width / 2, canvas.height * 0.55, canvas.width * 0.22,
      canvas.width / 2, canvas.height * 0.55, canvas.width * 0.78,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, `rgba(0,0,0,${circuit.timeOfDay === 'night' ? 0.55 : 0.32})`);
    gctx.fillStyle = vignette;
    gctx.fillRect(0, 0, canvas.width, canvas.height);

    this.gradeLayer = canvas;
  }

  drawGrade(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.gradeLayer) ctx.drawImage(this.gradeLayer, 0, 0, width, height);
  }

  drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const t = 1 - p.life / p.max;
      if (p.smoke) {
        // Smoke fades in then out, and is drawn round rather than square.
        const fade = Math.sin(Math.min(1, p.life / p.max) * Math.PI);
        ctx.globalAlpha = fade * 0.5;
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = t * t;
        ctx.fillStyle = p.colour;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawFlash(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.flash <= 0) return;
    ctx.fillStyle = withAlpha(this.flashColour, this.flash * 0.5);
    ctx.fillRect(0, 0, width, height);
  }
}
