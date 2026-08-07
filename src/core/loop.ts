import { clamp } from './math.ts';

export interface LoopHandlers {
  /** Fixed-step simulation. `dt` is always exactly `step`. */
  update(dt: number): void;
  /** Draw. `alpha` is the 0..1 interpolation factor between the last two sim states. */
  render(alpha: number): void;
}

export interface LoopStats {
  fps: number;
  simMs: number;
  drawMs: number;
  /** Steps taken in the last frame — spikes mean the sim is falling behind. */
  steps: number;
}

/**
 * Fixed-timestep loop with an accumulator and a spiral-of-death guard.
 *
 * Physics at a fixed 120 Hz keeps collision and steering identical on a 60 Hz phone
 * and a 144 Hz monitor; rendering runs as fast as the browser will paint.
 */
export class GameLoop {
  readonly step: number;
  private readonly maxStepsPerFrame: number;
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;
  private fpsSamples: number[] = [];
  readonly stats: LoopStats = { fps: 0, simMs: 0, drawMs: 0, steps: 0 };

  constructor(
    private readonly handlers: LoopHandlers,
    hz = 120,
    maxStepsPerFrame = 6,
  ) {
    this.step = 1 / hz;
    this.maxStepsPerFrame = maxStepsPerFrame;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  get isRunning(): boolean {
    return this.running;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);

    // Clamp the delta: a backgrounded tab can hand back a delta of minutes, and
    // replaying minutes of physics in one frame would teleport every racer.
    const frameSeconds = clamp((now - this.lastTime) / 1000, 0, 0.25);
    this.lastTime = now;

    this.fpsSamples.push(frameSeconds);
    if (this.fpsSamples.length > 30) this.fpsSamples.shift();
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.stats.fps = avg > 0 ? Math.round(1 / avg) : 0;

    this.accumulator += frameSeconds;

    const simStart = performance.now();
    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxStepsPerFrame) {
      this.handlers.update(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    // Still behind after the cap? Drop the backlog rather than compound it.
    if (steps >= this.maxStepsPerFrame) this.accumulator = 0;
    this.stats.steps = steps;
    this.stats.simMs = performance.now() - simStart;

    const drawStart = performance.now();
    this.handlers.render(this.step > 0 ? this.accumulator / this.step : 0);
    this.stats.drawMs = performance.now() - drawStart;
  };
}
