import { clamp } from '../core/math.ts';
import { Rng } from '../core/rng.ts';
import type { AudioBus } from './bus.ts';

/**
 * Procedural soundtrack.
 *
 * The brief was Road Rash's grunge attitude carried by Indian modes, so the
 * harmony is genuinely raga-derived rather than "minor scale with a sitar on
 * top": Malkauns for the heavy material (pure pentatonic doom, no brightness
 * anywhere), Bhairav for lead lines (the double-harmonic flat-2 against a major
 * 3rd), Darbari for brooding, Kirwani where it needs to bridge to rock ears.
 *
 * Scale degrees are semitones from Sa, per the standard Hindustani listings.
 */
export const RAGAS = {
  malkauns: [0, 3, 5, 8, 10],
  bhairav: [0, 1, 4, 5, 7, 8, 11],
  darbari: [0, 2, 3, 5, 7, 8, 10],
  kirwani: [0, 2, 4, 5, 7, 9, 10],
  todi: [0, 1, 3, 6, 7, 8, 11],
  charukeshi: [0, 2, 4, 5, 7, 8, 10],
  bhairavi: [0, 1, 3, 5, 7, 8, 10],
  bhoopali: [0, 2, 4, 7, 9],
} as const;

export type RagaName = keyof typeof RAGAS;

/**
 * Keherwa — the eight-beat theka that underpins most folk and film music, and
 * which maps cleanly onto 4/4 rock. `1` is a resonant bass stroke (dha/dhin),
 * `0.5` a dry treble (na/ti/ka), `0` a rest.
 */
const KEHERWA = [1, 0.5, 0.6, 0.4, 0.5, 0.4, 1, 0.5];
/** Teentaal's sixteen, used double-time for the chase material. */
const TEENTAAL = [1, 0.6, 0.6, 0.8, 1, 0.6, 0.6, 0.8, 0.4, 0.5, 0.5, 0.4, 0.8, 0.6, 0.6, 1];

export interface TrackMood {
  raga: RagaName;
  bpm: number;
  /** 0..1 — distortion drive on the riff guitar. */
  drive: number;
  /** 0..1 — how busy the percussion is. */
  intensity: number;
  theka: readonly number[];
  /** Root frequency in Hz. */
  root: number;
  /** Whether a lead line plays over the riff. */
  lead: boolean;
}

export const MOODS: Record<string, TrackMood> = {
  menu:    { raga: 'charukeshi', bpm: 92,  drive: 0.15, intensity: 0.3, theka: KEHERWA,  root: 130.81, lead: true },
  race:    { raga: 'malkauns',   bpm: 148, drive: 0.75, intensity: 0.8, theka: KEHERWA,  root: 82.41,  lead: true },
  hard:    { raga: 'todi',       bpm: 162, drive: 0.9,  intensity: 1.0, theka: TEENTAAL, root: 73.42,  lead: true },
  thriller:{ raga: 'darbari',    bpm: 104, drive: 0.45, intensity: 0.55, theka: KEHERWA, root: 65.41,  lead: false },
  chase:   { raga: 'bhairav',    bpm: 172, drive: 0.95, intensity: 1.0, theka: TEENTAAL, root: 69.30,  lead: true },
  victory: { raga: 'bhoopali',   bpm: 118, drive: 0.3,  intensity: 0.6, theka: KEHERWA,  root: 146.83, lead: true },
};

const semitone = (root: number, degree: number, octave = 0): number =>
  root * Math.pow(2, degree / 12 + octave);

/**
 * Guitar-style distortion curve. A soft-clipping tanh shape rather than hard
 * clipping, so it grinds instead of buzzing.
 */
const makeDriveCurve = (amount: number): Float32Array<ArrayBuffer> => {
  const samples = 1024;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  const k = 1 + amount * 60;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
};

export class Music {
  private mood: TrackMood = MOODS.race as TrackMood;
  private timer = 0;
  private beat = 0;
  private bar = 0;
  private rng = new Rng('music');
  private playing = false;

  private tanpura: { osc: OscillatorNode; gain: GainNode }[] = [];
  private droneGain: GainNode | null = null;
  private riffBus: GainNode | null = null;
  private leadBus: GainNode | null = null;
  private drumBus: GainNode | null = null;

  constructor(private readonly bus: AudioBus) {}

  start(moodName: keyof typeof MOODS): void {
    if (this.playing) {
      this.setMood(moodName);
      return;
    }
    this.playing = true;
    this.mood = MOODS[moodName] ?? (MOODS.race as TrackMood);
    this.beat = 0;
    this.bar = 0;
    this.timer = 0;

    const ctx = this.bus.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.055;
    this.droneGain.connect(this.bus.music);

    this.riffBus = ctx.createGain();
    this.riffBus.gain.value = 0.30;
    this.riffBus.connect(this.bus.music);

    this.leadBus = ctx.createGain();
    this.leadBus.gain.value = 0.16;
    this.leadBus.connect(this.bus.music);
    this.leadBus.connect(this.bus.reverbSend);

    this.drumBus = ctx.createGain();
    this.drumBus.gain.value = 0.42;
    this.drumBus.connect(this.bus.music);

    this.startTanpura();
  }

  setMood(moodName: keyof typeof MOODS): void {
    const next = MOODS[moodName];
    if (!next || next === this.mood) return;
    this.mood = next;
    this.retuneTanpura();
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    const now = this.bus.now;
    for (const voice of this.tanpura) {
      voice.gain.gain.setTargetAtTime(0, now, 0.4);
      try {
        voice.osc.stop(now + 2);
      } catch {
        /* already stopped */
      }
    }
    this.tanpura = [];
    for (const node of [this.droneGain, this.riffBus, this.leadBus, this.drumBus]) {
      node?.gain.setTargetAtTime(0, now, 0.4);
    }
  }

  /**
   * The tanpura drone: Sa, Pa, Sa, Sa, slightly detuned, with a slow filter
   * sweep standing in for the jivari buzz of the curved bridge.
   */
  private startTanpura(): void {
    const ctx = this.bus.ctx;
    if (!this.droneGain) return;
    const root = this.mood.root;
    const degrees = [0, 7, 12, 12];

    for (let i = 0; i < degrees.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = semitone(root, degrees[i] as number) * (1 + (i - 1.5) * 0.0018);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      filter.Q.value = 3.5;

      // Slow sweep: the shimmer that makes a drone breathe instead of drone.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + i * 0.013;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 240;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();

      const gain = ctx.createGain();
      gain.gain.value = 0.25 / degrees.length;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.droneGain);
      osc.start();
      this.tanpura.push({ osc, gain });
    }
  }

  private retuneTanpura(): void {
    const now = this.bus.now;
    const degrees = [0, 7, 12, 12];
    this.tanpura.forEach((voice, i) => {
      voice.osc.frequency.setTargetAtTime(
        semitone(this.mood.root, degrees[i] as number) * (1 + (i - 1.5) * 0.0018),
        now, 0.6,
      );
    });
  }

  /** Call every frame. Schedules the next beat when the clock says so. */
  update(dt: number, intensity = 1): void {
    if (!this.playing || !this.bus.ready) return;
    const secondsPerBeat = 60 / this.mood.bpm / 2;
    this.timer += dt;
    while (this.timer >= secondsPerBeat) {
      this.timer -= secondsPerBeat;
      this.step(clamp(intensity, 0, 1));
      this.beat++;
      if (this.beat % this.mood.theka.length === 0) this.bar++;
    }
  }

  private step(intensity: number): void {
    const theka = this.mood.theka;
    const position = this.beat % theka.length;
    const stress = theka[position] ?? 0;

    if (stress > 0) this.drum(stress, intensity);

    // The riff moves on the sam and the halfway point of the cycle.
    if (position === 0 || position === Math.floor(theka.length / 2)) {
      this.riff(position === 0);
    }
    if (this.mood.lead && intensity > 0.4 && position % 2 === 1 && this.rng.chance(0.34 * intensity)) {
      this.lead();
    }
  }

  /** Dholak-style pair: resonant bass head and dry treble head. */
  private drum(stress: number, intensity: number): void {
    const ctx = this.bus.ctx;
    const now = this.bus.now;
    if (!this.drumBus) return;

    if (stress >= 0.8) {
      // Bass stroke: sine with a fast downward pitch envelope.
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(128, now);
      osc.frequency.exponentialRampToValueAtTime(52, now + 0.16);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(0.7 * intensity, now + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      osc.connect(env);
      env.connect(this.drumBus);
      osc.start(now);
      osc.stop(now + 0.36);
    }

    // Treble stroke: short filtered noise plus a semi-pitched ring.
    const source = ctx.createBufferSource();
    source.buffer = this.bus.noise();
    source.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = stress > 0.7 ? 1100 : 2600;
    filter.Q.value = 2.2;
    const env = ctx.createGain();
    const level = stress * 0.34 * intensity;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(level, now + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.10 + stress * 0.08);
    source.connect(filter);
    filter.connect(env);
    env.connect(this.drumBus);
    source.start(now);
    source.stop(now + 0.24);
  }

  /** The down-tuned riff: root and fifth, hard clipped. */
  private riff(onSam: boolean): void {
    const ctx = this.bus.ctx;
    const now = this.bus.now;
    if (!this.riffBus) return;

    const scale = RAGAS[this.mood.raga];
    const degree = onSam ? 0 : (scale[this.rng.int(1, scale.length - 1)] ?? 0);
    const freq = semitone(this.mood.root, degree);
    const duration = 60 / this.mood.bpm * (onSam ? 1.4 : 0.9);

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDriveCurve(this.mood.drive);
    shaper.oversample = '2x';

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1600 + this.mood.drive * 1400;
    tone.Q.value = 0.8;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.5, now + 0.012);
    env.gain.setValueAtTime(0.5, now + duration * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    // Two oscillators a fifth apart is a power chord in all but name.
    for (const [interval, level] of [[0, 1], [7, 0.72], [12, 0.4]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq * Math.pow(2, interval / 12);
      const g = ctx.createGain();
      g.gain.value = level * 0.34;
      osc.connect(g);
      g.connect(shaper);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    }

    shaper.connect(tone);
    tone.connect(env);
    env.connect(this.riffBus);
  }

  /** A shehnai-ish lead: reedy pulse wave with vibrato, odd harmonics dominant. */
  private lead(): void {
    const ctx = this.bus.ctx;
    const now = this.bus.now;
    if (!this.leadBus) return;

    const scale = RAGAS[this.mood.raga];
    const degree = scale[this.rng.int(0, scale.length - 1)] ?? 0;
    const octave = this.rng.chance(0.4) ? 2 : 1;
    const freq = semitone(this.mood.root, degree, octave);
    const duration = (60 / this.mood.bpm) * this.rng.range(0.5, 1.3);

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;

    // Continuous gentle vibrato, about five cycles a second.
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.2;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.value = freq * 0.009;
    vibrato.connect(vibratoGain);
    vibratoGain.connect(osc.frequency);
    vibrato.start(now);
    vibrato.stop(now + duration + 0.1);

    // Body resonance plus the reed bite at 2.5 kHz.
    const body = ctx.createBiquadFilter();
    body.type = 'bandpass';
    body.frequency.value = 800;
    body.Q.value = 1.1;
    const bite = ctx.createBiquadFilter();
    bite.type = 'peaking';
    bite.frequency.value = 2500;
    bite.Q.value = 2.4;
    bite.gain.value = 9;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.32, now + 0.02);
    env.gain.setValueAtTime(0.32, now + duration * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(body);
    body.connect(bite);
    bite.connect(env);
    env.connect(this.leadBus);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  get isPlaying(): boolean {
    return this.playing;
  }
}
