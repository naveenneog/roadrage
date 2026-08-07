import { clamp } from '../core/math.ts';

/**
 * The mix.
 *
 * Three buses (engine / effects / music) into a soft-knee limiter into the
 * destination. The limiter matters: procedural engine synthesis plus a dozen
 * simultaneous impacts will clip a naive master bus instantly, and clipping is
 * the difference between "loud" and "broken".
 */
export class AudioBus {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly engine: GainNode;
  readonly sfx: GainNode;
  readonly music: GainNode;
  readonly limiter: DynamicsCompressorNode;
  /** Shared convolution reverb, used as a send by SFX and music. */
  readonly reverbSend: GainNode;

  private started = false;

  constructor() {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctor({ latencyHint: 'interactive' });

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;

    this.engine = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.engine.gain.value = 0.75;
    this.sfx.gain.value = 0.9;
    this.music.gain.value = 0.5;

    const reverb = this.ctx.createConvolver();
    reverb.buffer = this.makeImpulse(1.6, 2.6);
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.18;
    this.reverbSend.connect(reverb);
    reverb.connect(this.master);

    this.engine.connect(this.limiter);
    this.sfx.connect(this.limiter);
    this.music.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  /**
   * A procedurally generated impulse response — decaying filtered noise.
   * Standing between two-storey shopfronts on Commercial Street is a short,
   * bright, slappy space, so the tail is deliberately under two seconds.
   */
  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let last = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const noise = Math.random() * 2 - 1;
        // One-pole lowpass so the tail is dark rather than hissy.
        last = last * 0.72 + noise * 0.28;
        data[i] = last * Math.pow(1 - t, decay);
      }
    }
    return buffer;
  }

  /** Browsers require a user gesture before audio will start. */
  async unlock(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        return;
      }
    }
    this.started = true;
  }

  get ready(): boolean {
    return this.started && this.ctx.state === 'running';
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.master.gain.setTargetAtTime(clamp(master, 0, 1), this.now, 0.05);
    this.music.gain.setTargetAtTime(clamp(music, 0, 1) * 0.6, this.now, 0.05);
    this.sfx.gain.setTargetAtTime(clamp(sfx, 0, 1), this.now, 0.05);
    this.engine.gain.setTargetAtTime(clamp(sfx, 0, 1) * 0.8, this.now, 0.05);
  }

  /** White noise buffer, reused by every noise-based voice. */
  private noiseBuffer: AudioBuffer | null = null;

  noise(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, rate * 2, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  close(): void {
    void this.ctx.close();
  }
}
