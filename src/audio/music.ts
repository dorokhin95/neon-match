// Generative ambient music: slow evolving pad chords + soft pentatonic
// arpeggio. Fully synthesized, ~2min evolving loop with no files.

import type { AudioContextLike } from './ctx';

const CHORDS: number[][] = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [196.0, 244.94, 293.66], // G
  [261.63, 329.63, 392.0], // C
];

const ARP_NOTES = [440.0, 523.25, 659.25, 783.99, 880.0, 1046.5, 880.0, 659.25];

export class Music {
  private ctx: AudioContextLike;
  private out: GainNode;
  private playing = false;
  private timers: number[] = [];
  private chordIdx = 0;
  private arpIdx = 0;
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;

  constructor(ctx: AudioContextLike, out: GainNode) {
    this.ctx = ctx;
    this.out = out;
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;

    // Pad chord loop (one chord every 8 s)
    const chordTick = () => {
      this.playChord(CHORDS[this.chordIdx % CHORDS.length]!);
      this.chordIdx++;
    };
    chordTick();
    const id = window.setInterval(chordTick, 8000);
    this.timers.push(id);

    // Arpeggio (a note every 0.5 s with rests)
    const arpTick = () => {
      if (Math.random() < 0.72) {
        const f = ARP_NOTES[this.arpIdx % ARP_NOTES.length]!;
        this.arpIdx++;
        this.pluck(f, 0.05 + Math.random() * 0.03);
      }
    };
    const arpId = window.setInterval(arpTick, 500);
    this.timers.push(arpId);
  }

  stop(): void {
    this.playing = false;
    for (const t of this.timers) window.clearInterval(t);
    this.timers = [];
    if (this.lfo) {
      try { this.lfo.stop(); } catch { /* already stopped */ }
      this.lfo = null;
    }
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  private playChord(freqs: number[]): void {
    const t0 = this.ctx.currentTime;
    const dur = 8.4;
    const chordGain = this.ctx.createGain();
    chordGain.gain.setValueAtTime(0.0001, t0);
    chordGain.gain.exponentialRampToValueAtTime(0.14, t0 + 2.2);
    chordGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    chordGain.connect(this.out);

    // Slow filter LFO for movement
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(700, t0);
    filt.frequency.linearRampToValueAtTime(1400, t0 + 4);
    filt.frequency.linearRampToValueAtTime(700, t0 + dur);
    filt.connect(chordGain);

    if (!this.lfo) {
      this.lfo = this.ctx.createOscillator();
      this.lfo.frequency.value = 0.08;
      this.lfoGain = this.ctx.createGain();
      this.lfoGain.gain.value = 260;
      this.lfo.connect(this.lfoGain).connect(filt.frequency);
      this.lfo.start();
    }

    for (const f of freqs) {
      for (const detune of [-4, 4]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = detune;
        const g = this.ctx.createGain();
        g.gain.value = 0.5;
        osc.connect(g).connect(filt);
        osc.start(t0);
        osc.stop(t0 + dur + 0.1);
      }
    }
  }

  private pluck(freq: number, gain: number): void {
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
    osc.connect(g).connect(this.out);
    osc.start(t0);
    osc.stop(t0 + 1.5);
  }
}

