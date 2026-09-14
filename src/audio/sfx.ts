// Synthesized SFX via WebAudio. No audio files needed.

import type { AudioContextLike } from './ctx';

type Osc = OscillatorType;

export class Sfx {
  private ctx: AudioContextLike;
  private master: GainNode | null;
  private enabled = true;

  constructor(ctx: AudioContextLike, master: GainNode | null) {
    this.ctx = ctx;
    this.master = master;
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
  }

  private tone(
    freq: number,
    dur: number,
    type: Osc = 'sine',
    gain = 0.2,
    when = 0,
    slideTo?: number,
  ): void {
    if (!this.enabled || !this.master) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, gain = 0.25, when = 0, lowpass = 1200): void {
    if (!this.enabled || !this.master) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = lowpass;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t0);
  }

  ui(): void {
    this.tone(660, 0.08, 'sine', 0.15);
    this.tone(990, 0.06, 'sine', 0.08, 0.03);
  }

  back(): void {
    this.tone(520, 0.08, 'sine', 0.13);
    this.tone(390, 0.09, 'sine', 0.1, 0.04);
  }

  select(): void {
    this.tone(880, 0.05, 'triangle', 0.12);
  }

  swap(): void {
    this.tone(500, 0.09, 'sine', 0.14, 0, 700);
  }

  invalid(): void {
    this.tone(220, 0.12, 'sawtooth', 0.09, 0, 180);
    this.tone(200, 0.12, 'sawtooth', 0.07, 0.05, 160);
  }

  /** Match sound: pitch rises along a pentatonic scale with cascades. */
  match(cascade: number, count = 3): void {
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];
    const idx = Math.min(scale.length - 1, cascade - 1);
    const base = scale[idx] ?? 880;
    this.tone(base, 0.18, 'triangle', 0.22);
    this.tone(base * 1.5, 0.14, 'sine', 0.12, 0.03);
    if (count >= 5) this.tone(base * 2, 0.18, 'sine', 0.1, 0.06);
  }

  powerCreate(power: number): void {
    const f = [0, 700, 700, 520, 900][power] ?? 700;
    this.tone(f, 0.25, 'sawtooth', 0.1, 0, f * 1.6);
    this.tone(f * 2, 0.2, 'sine', 0.08, 0.05);
  }

  blast(): void {
    this.noise(0.4, 0.3, 0, 900);
    this.tone(140, 0.35, 'sawtooth', 0.2, 0, 60);
  }

  boom(): void {
    this.noise(0.55, 0.4, 0, 600);
    this.tone(90, 0.5, 'sine', 0.28, 0, 40);
  }

  prism(): void {
    for (let i = 0; i < 6; i++) {
      this.tone(660 * Math.pow(1.18, i), 0.12, 'sine', 0.09, i * 0.045);
    }
  }

  /** Лопнувшая цепь: короткий металлический «дзинь». */
  chain(): void {
    this.tone(1560, 0.09, 'square', 0.08);
    this.tone(2080, 0.12, 'sine', 0.07, 0.04);
  }

  shuffle(): void {
    for (let i = 0; i < 5; i++) this.tone(300 + i * 90, 0.07, 'triangle', 0.07, i * 0.05);
  }

  star(n: number): void {
    const f = [784, 988, 1319][n] ?? 988;
    this.tone(f, 0.3, 'triangle', 0.2);
    this.tone(f * 2, 0.22, 'sine', 0.1, 0.04);
  }

  win(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach((f, i) => this.tone(f, 0.32, 'triangle', 0.16, i * 0.09));
  }

  lose(): void {
    const notes = [392, 349.23, 311.13, 261.63];
    notes.forEach((f, i) => this.tone(f, 0.3, 'sine', 0.14, i * 0.11));
  }

  combo(n: number): void {
    const f = 660 * Math.pow(1.12, Math.min(6, n));
    this.tone(f, 0.16, 'square', 0.07);
    this.tone(f * 1.5, 0.14, 'sine', 0.09, 0.03);
  }

  tick(): void {
    this.tone(1200, 0.04, 'sine', 0.06);
  }
}
