import { clamp, lerp } from '../core/math.ts';
import type { EngineVoice } from '../data/types.ts';
import type { AudioBus } from './bus.ts';

/**
 * Engine synthesis, from first principles rather than from samples.
 *
 * A four-stroke fires once every two crank revolutions, a two-stroke once every
 * revolution. That firing rate is the fundamental you actually hear: a Bullet at
 * 1000 rpm is a pulse train at 8.3 Hz, which is why you can count the thumps.
 * The timbre is built as a custom PeriodicWave whose harmonic series is shaped
 * by the machine's character — heavy low harmonics for the long-stroke single,
 * a screaming resonant peak for the two-stroke on the pipe.
 */
export class EngineSound {
  private readonly cylinders: Array<{
    osc: OscillatorNode;
    gain: GainNode;
    /** Crank phase offset in revolutions. */
    offset: number;
  }> = [];

  private readonly body: BiquadFilterNode;
  private readonly ring: BiquadFilterNode;
  private readonly ringGain: GainNode;
  private readonly raspSource: AudioBufferSourceNode;
  private readonly raspFilter: BiquadFilterNode;
  private readonly raspGain: GainNode;
  private readonly output: GainNode;
  private readonly panner: StereoPannerNode;

  private rpm: number;
  private disposed = false;

  constructor(
    private readonly bus: AudioBus,
    private readonly voice: EngineVoice,
    destination: AudioNode,
  ) {
    const ctx = bus.ctx;
    this.rpm = voice.idleRpm;

    this.output = ctx.createGain();
    this.output.gain.value = 0;
    this.panner = ctx.createStereoPanner();

    // Body filter: opens up as the revs rise, which is most of what "revving" sounds like.
    this.body = ctx.createBiquadFilter();
    this.body.type = 'lowpass';
    this.body.frequency.value = 900;
    this.body.Q.value = 0.9;

    // The two-stroke ring: a tight resonant peak that screams on the pipe.
    this.ring = ctx.createBiquadFilter();
    this.ring.type = 'bandpass';
    this.ring.frequency.value = 2000;
    this.ring.Q.value = 7;
    this.ringGain = ctx.createGain();
    this.ringGain.gain.value = 0;

    const wave = this.buildWave(ctx);
    for (let i = 0; i < Math.max(1, voice.firingOrder); i++) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(wave);
      const gain = ctx.createGain();
      gain.gain.value = 1 / Math.max(1, voice.firingOrder);
      osc.connect(gain);
      gain.connect(this.body);
      gain.connect(this.ring);
      // The 270-degree crank: cylinder two fires three-quarters of a revolution
      // after cylinder one, giving the 270/450 limp instead of an even beat.
      const offset = i === 0 ? 0 : voice.crankOffset || 0.5;
      osc.start(ctx.currentTime + offset * 0.004);
      this.cylinders.push({ osc, gain, offset });
    }

    this.ring.connect(this.ringGain);

    // Exhaust rasp: filtered noise riding on the tone.
    this.raspSource = ctx.createBufferSource();
    this.raspSource.buffer = bus.noise();
    this.raspSource.loop = true;
    this.raspFilter = ctx.createBiquadFilter();
    this.raspFilter.type = 'bandpass';
    this.raspFilter.frequency.value = 1400;
    this.raspFilter.Q.value = 1.1;
    this.raspGain = ctx.createGain();
    this.raspGain.gain.value = 0;
    this.raspSource.connect(this.raspFilter);
    this.raspFilter.connect(this.raspGain);
    this.raspSource.start();

    this.body.connect(this.output);
    this.ringGain.connect(this.output);
    this.raspGain.connect(this.output);
    this.output.connect(this.panner);
    this.panner.connect(destination);
  }

  /**
   * Build the harmonic series for one firing pulse.
   *
   * Starting point is an ideal narrow pulse train (amplitude ~ 1/n), then:
   *  - `thump` tilts energy into the first few harmonics (the long-stroke single)
   *  - `rasp` lifts the upper mids (the hard-edged four-valve crack)
   *  - `induction` adds a little odd-harmonic bite (intake roar)
   */
  private buildWave(ctx: AudioContext): PeriodicWave {
    const harmonics = 48;
    const real = new Float32Array(harmonics);
    const imag = new Float32Array(harmonics);
    const { thump, rasp, induction } = this.voice;
    // Narrower duty for two-strokes: a sharper, brighter pulse.
    const duty = this.voice.stroke === 2 ? 0.16 : 0.24;

    for (let n = 1; n < harmonics; n++) {
      const pulse = Math.sin(n * Math.PI * duty) / (n * Math.PI * duty);
      const lowTilt = Math.pow(1 / n, 0.6 + thump * 1.1);
      const highLift = 1 + rasp * Math.exp(-Math.pow((n - 9) / 7, 2)) * 1.6;
      const oddBite = n % 2 === 1 ? 1 + induction * 0.45 : 1;
      imag[n] = pulse * lowTilt * highLift * oddBite;
    }
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  /** Firing frequency in Hz for a given rpm. */
  private firingHz(rpm: number): number {
    const revsPerSecond = rpm / 60;
    return this.voice.stroke === 2 ? revsPerSecond : revsPerSecond / 2;
  }

  /**
   * Drive the engine from the simulation.
   * @param throttle 0..1
   * @param speedPercent 0..1 of top speed
   * @param gears number of ratios, so the note drops on each shift
   * @param pan -1..1
   * @param distance 0 = at the camera, 1 = far away
   */
  update(
    throttle: number,
    speedPercent: number,
    gears: number,
    pan: number,
    distance: number,
    dt: number,
  ): void {
    if (this.disposed) return;
    const { voice, bus } = this;
    const now = bus.now;

    // Map road speed to rpm through a gearbox, so the note sweeps up, drops on
    // the shift and sweeps again. A single continuous sweep is the single most
    // obvious tell of a fake engine.
    const ratio = clamp(speedPercent, 0, 1.15) * gears;
    const gear = Math.min(gears - 1, Math.floor(ratio));
    const withinGear = clamp(ratio - gear, 0, 1.15);
    const targetRpm = lerp(voice.idleRpm, voice.redlineRpm, 0.22 + withinGear * 0.78);

    // Engines take time to pick up; the flywheel on a Bullet takes a lot of it.
    const inertia = 0.05 + voice.thump * 0.10;
    this.rpm += (targetRpm - this.rpm) * clamp(dt / inertia, 0, 1);

    const hz = this.firingHz(this.rpm);
    const revPercent = clamp(
      (this.rpm - voice.idleRpm) / Math.max(1, voice.redlineRpm - voice.idleRpm), 0, 1.2,
    );

    for (const cylinder of this.cylinders) {
      cylinder.osc.frequency.setTargetAtTime(Math.max(6, hz), now, 0.02);
    }

    // Filter opens with revs and with throttle.
    const cutoff = 380 + revPercent * 4200 + throttle * 1400 + voice.rasp * 900;
    this.body.frequency.setTargetAtTime(cutoff, now, 0.03);

    // Two-stroke powerband: the ring comes in hard above roughly 60% of the range.
    if (voice.ring > 0.2) {
      const onPipe = clamp((revPercent - 0.55) / 0.28, 0, 1);
      this.ring.frequency.setTargetAtTime(1500 + revPercent * 2600, now, 0.05);
      this.ringGain.gain.setTargetAtTime(voice.ring * onPipe * 0.5 * throttle, now, 0.04);
    }

    // Rasp tracks throttle, not revs: it is the sound of load, not speed.
    this.raspFilter.frequency.setTargetAtTime(700 + revPercent * 2200, now, 0.05);
    this.raspGain.gain.setTargetAtTime(voice.rasp * (0.05 + throttle * 0.16), now, 0.04);

    const attenuation = 1 / (1 + distance * distance * 5);
    const level = voice.loudness * (0.16 + throttle * 0.5 + revPercent * 0.28) * attenuation;
    this.output.gain.setTargetAtTime(clamp(level, 0, 1), now, 0.04);
    this.panner.pan.setTargetAtTime(clamp(pan, -1, 1), now, 0.06);
  }

  /** Momentary cut, for a gear change or a stall. */
  cut(seconds = 0.06): void {
    if (this.disposed) return;
    const now = this.bus.now;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(this.output.gain.value, now);
    this.output.gain.linearRampToValueAtTime(0.02, now + seconds * 0.4);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const now = this.bus.now;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setTargetAtTime(0, now, 0.05);
    for (const cylinder of this.cylinders) {
      try {
        cylinder.osc.stop(now + 0.3);
      } catch {
        /* already stopped */
      }
    }
    try {
      this.raspSource.stop(now + 0.3);
    } catch {
      /* already stopped */
    }
  }
}
