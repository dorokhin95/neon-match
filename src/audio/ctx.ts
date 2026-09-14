// Lazy AudioContext wrapper (created on first user gesture).

export interface AudioContextLike {
  currentTime: number;
  sampleRate: number;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  createBuffer(ch: number, len: number, rate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
  createBiquadFilter(): BiquadFilterNode;
  destination: AudioNode;
}

let ctx: AudioContextLike | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;

type Ctor = { new (): AudioContextLike };

export function getAudio(): { ctx: AudioContextLike; master: GainNode; music: GainNode; sfx: GainNode } | null {
  if (ctx) return { ctx, master: master!, music: musicGain!, sfx: sfxGain! };
  const AC: Ctor | undefined =
    (window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor }).AudioContext ??
    (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 1;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.45;
  musicGain.connect(master);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.8;
  sfxGain.connect(master);
  return { ctx, master, music: musicGain, sfx: sfxGain };
}

export function resumeAudio(): void {
  const a = ctx as unknown as { resume?: () => Promise<void> } | null;
  if (a && a.resume) void a.resume();
}

export function suspendAudio(): void {
  const a = ctx as unknown as { suspend?: () => Promise<void> } | null;
  if (a && a.suspend) void a.suspend();
}
