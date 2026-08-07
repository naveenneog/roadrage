import { clamp } from '../core/math.ts';
import type { AudioBus } from './bus.ts';

/**
 * Layered sound effects: transient + body + tail.
 *
 * Every one-shot gets pitch and level jitter, because the fastest way to make a
 * game sound cheap is to play the identical punch sample forty times a minute.
 */
export class Sfx {
  private lastAt = new Map<string, number>();

  constructor(private readonly bus: AudioBus) {}

  private jitter(range = 0.14): number {
    return 1 + (Math.random() * 2 - 1) * range;
  }

  /** Rate-limit a sound so a per-frame event can't machine-gun. */
  private allow(key: string, minGap: number): boolean {
    const now = this.bus.now;
    const last = this.lastAt.get(key) ?? -Infinity;
    if (now - last < minGap) return false;
    this.lastAt.set(key, now);
    return true;
  }

  private voice(pan: number, gain: number): { input: GainNode; } {
    const ctx = this.bus.ctx;
    const input = ctx.createGain();
    input.gain.value = gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    input.connect(panner);
    panner.connect(this.bus.sfx);
    panner.connect(this.bus.reverbSend);
    return { input };
  }

  private noiseBurst(
    input: AudioNode,
    duration: number,
    type: BiquadFilterType,
    frequency: number,
    q: number,
    curve: (t: number) => number,
  ): void {
    const ctx = this.bus.ctx;
    const now = this.bus.now;
    const source = ctx.createBufferSource();
    source.buffer = this.bus.noise();
    source.loop = true;
    source.playbackRate.value = this.jitter(0.2);

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      env.gain.linearRampToValueAtTime(curve(t), now + duration * t);
    }
    env.gain.linearRampToValueAtTime(0, now + duration);

    source.connect(filter);
    filter.connect(env);
    env.connect(input);
    source.start(now);
    source.stop(now + duration + 0.05);
  }

  private tone(
    input: AudioNode,
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    gain: number,
  ): void {
    const ctx = this.bus.ctx;
    const now = this.bus.now;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(env);
    env.connect(input);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** A landed punch: knuckle transient, flesh body, short tail. */
  punch(power: number, pan: number): void {
    if (!this.allow('punch', 0.05)) return;
    const { input } = this.voice(pan, 0.5 + power * 0.4);
    this.noiseBurst(input, 0.09, 'bandpass', 1500 * this.jitter(), 1.4,
      (t) => Math.pow(1 - t, 2.4) * 0.7);
    this.tone(input, 'sine', 190 * this.jitter(0.1), 70, 0.11, 0.35 + power * 0.2);
  }

  /** A kick landing: lower, heavier, with a leather creak of noise on top. */
  kick(power: number, pan: number): void {
    if (!this.allow('kick', 0.06)) return;
    const { input } = this.voice(pan, 0.65 + power * 0.45);
    this.noiseBurst(input, 0.16, 'lowpass', 900 * this.jitter(), 0.9,
      (t) => Math.pow(1 - t, 1.8) * 0.85);
    this.tone(input, 'triangle', 130 * this.jitter(0.08), 44, 0.20, 0.55 + power * 0.25);
    this.tone(input, 'square', 320 * this.jitter(0.2), 150, 0.06, 0.12);
  }

  /** Steel on steel: a chain or a bat. */
  weapon(power: number, pan: number): void {
    if (!this.allow('weapon', 0.06)) return;
    const { input } = this.voice(pan, 0.7 + power * 0.4);
    this.noiseBurst(input, 0.22, 'highpass', 2600 * this.jitter(), 0.8,
      (t) => Math.pow(1 - t, 3.2) * 0.8);
    this.tone(input, 'square', 880 * this.jitter(0.15), 300, 0.14, 0.22);
    this.tone(input, 'sine', 160, 60, 0.18, 0.4);
  }

  /** A blocked swing: dull, short, no sting. */
  block(pan: number): void {
    if (!this.allow('block', 0.06)) return;
    const { input } = this.voice(pan, 0.4);
    this.noiseBurst(input, 0.07, 'lowpass', 700, 1.0, (t) => Math.pow(1 - t, 3) * 0.5);
  }

  /** Bodywork on bodywork at speed. */
  scrape(power: number, pan: number): void {
    if (!this.allow('scrape', 0.14)) return;
    const { input } = this.voice(pan, 0.3 + power * 0.5);
    this.noiseBurst(input, 0.28 + power * 0.2, 'bandpass', 3200 * this.jitter(0.25), 3.5,
      (t) => Math.sin(t * Math.PI) * 0.7);
  }

  /** Hitting something with mass — a bus, a wall, a bullock cart. */
  crash(power: number, pan: number): void {
    if (!this.allow('crash', 0.1)) return;
    const { input } = this.voice(pan, 0.7 + power * 0.5);
    this.noiseBurst(input, 0.34, 'lowpass', 1200, 0.7, (t) => Math.pow(1 - t, 1.4));
    this.tone(input, 'sawtooth', 110 * this.jitter(0.1), 38, 0.36, 0.55);
    // Glass and trim scattering afterwards.
    this.noiseBurst(input, 0.5, 'highpass', 4200, 0.6, (t) => Math.pow(1 - t, 2.6) * 0.35);
  }

  /** Rider hitting tarmac and sliding. */
  spill(pan: number): void {
    const { input } = this.voice(pan, 0.75);
    this.noiseBurst(input, 0.7, 'bandpass', 1800, 1.2,
      (t) => Math.sin(Math.min(1, t * 1.4) * Math.PI) * 0.8);
    this.tone(input, 'sine', 90, 34, 0.3, 0.5);
  }

  /**
   * Horns. The auto's is a piercing two-tone; the truck's is an air horn you
   * feel in your chest; a bike's is an apologetic parp.
   */
  horn(kind: 'auto' | 'truck' | 'bike', pan: number): void {
    if (!this.allow(`horn:${kind}`, 0.4)) return;
    const { input } = this.voice(pan, kind === 'truck' ? 0.55 : 0.4);
    const ctx = this.bus.ctx;
    const now = this.bus.now;

    const freqs = kind === 'auto' ? [880, 1180] : kind === 'truck' ? [196, 262] : [640, 810];
    const duration = kind === 'truck' ? 0.85 : 0.34;

    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = kind === 'truck' ? 'sawtooth' : 'square';
      osc.frequency.value = f * this.jitter(0.02);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(0.16, now + 0.02);
      env.gain.setValueAtTime(0.16, now + duration * 0.8);
      env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = kind === 'truck' ? 1400 : 4200;
      osc.connect(filter);
      filter.connect(env);
      env.connect(input);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    }
  }

  /** Tyres letting go. */
  skid(intensity: number, pan: number): void {
    if (!this.allow('skid', 0.3)) return;
    const { input } = this.voice(pan, 0.3 + intensity * 0.4);
    this.noiseBurst(input, 0.4, 'bandpass', 2200, 5, (t) => Math.sin(t * Math.PI) * 0.6);
  }

  /** Police siren: a repeating yelp, pitched to cut through the engine. */
  siren(pan: number): void {
    if (!this.allow('siren', 1.1)) return;
    const { input } = this.voice(pan, 0.32);
    const ctx = this.bus.ctx;
    const now = this.bus.now;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const env = ctx.createGain();
    env.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 2;

    for (let i = 0; i < 4; i++) {
      const t = now + i * 0.26;
      osc.frequency.setValueAtTime(760, t);
      osc.frequency.exponentialRampToValueAtTime(1500, t + 0.2);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    }
    osc.connect(filter);
    filter.connect(env);
    env.connect(input);
    osc.start(now);
    osc.stop(now + 1.1);
  }

  /** Countdown beep, then a higher one for GO. */
  beep(high: boolean): void {
    const { input } = this.voice(0, 0.5);
    this.tone(input, 'square', high ? 1320 : 660, high ? 1320 : 660, high ? 0.5 : 0.14, 0.18);
  }

  /** Money, unlocks, menu confirms. */
  chime(good: boolean): void {
    const { input } = this.voice(0, 0.45);
    const base = good ? 523 : 330;
    this.tone(input, 'triangle', base, base, 0.12, 0.2);
    window.setTimeout(() => {
      const { input: second } = this.voice(0, 0.4);
      this.tone(second, 'triangle', good ? base * 1.5 : base * 0.8, good ? base * 1.5 : base * 0.8, 0.22, 0.18);
    }, 90);
  }

  /** UI tick for menu movement. */
  tick(): void {
    if (!this.allow('tick', 0.03)) return;
    const { input } = this.voice(0, 0.25);
    this.noiseBurst(input, 0.03, 'highpass', 3800, 1, (t) => (1 - t) * 0.5);
  }
}
