/**
 * Dedicated audio-only RNG and procedural synthesis primitives.
 * Completely independent from the deterministic simulation RNG.
 */
export class AudioSynth {
  private rng = 0x8b7e21;
  private noiseBuffer: AudioBuffer | null = null;
  private rumbleBuffer: AudioBuffer | null = null;
  private lastPitchOffset = 0;

  /** Returns a float in [0, 1) from the audio-only PRNG. */
  public rand(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 0xffffffff;
  }

  /**
   * Returns a 3-5% pitch multiplier guaranteed to differ from the immediately preceding call.
   */
  public varyPitch(): number {
    let offset = (this.rand() * 2 - 1) * 0.045;
    if (Math.abs(offset - this.lastPitchOffset) < 0.012) {
      offset = -offset + 0.025;
    }
    this.lastPitchOffset = offset;
    return 1 + offset;
  }

  /** Returns tiny timing jitter in seconds (0..8ms) for organic feel. */
  public jitterSec(): number {
    return this.rand() * 0.008;
  }

  /** Returns a cached 1-second white noise buffer for filtered noise bursts. */
  public getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      data[i] = this.rand() * 2 - 1;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  /** Returns a cached 3-second brown/pink-weighted noise buffer for realistic rolling thunder & rain. */
  public getRumbleBuffer(ctx: AudioContext): AudioBuffer {
    if (this.rumbleBuffer && this.rumbleBuffer.sampleRate === ctx.sampleRate) {
      return this.rumbleBuffer;
    }
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let brown = 0;
    let peak = 0.001;
    for (let i = 0; i < len; i += 1) {
      const white = this.rand() * 2 - 1;
      // Integrated leaky brown noise + slight white grit for natural storm texture
      brown = (brown + 0.04 * white) / 1.04;
      const sample = brown * 2.8 + white * 0.12;
      data[i] = sample;
      const abs = Math.abs(sample);
      if (abs > peak) peak = abs;
    }
    const norm = 0.9 / peak;
    for (let i = 0; i < len; i += 1) {
      data[i] = data[i]! * norm;
    }
    this.rumbleBuffer = buf;
    return buf;
  }

  /** Plays a pitched oscillator tone with attack/decay envelope. */
  public playTone(
    ctx: AudioContext,
    dest: AudioNode,
    type: OscillatorType,
    freqStart: number,
    freqEnd: number,
    duration: number,
    gainPeak: number,
    startTime: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freqStart), startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startTime + duration);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(gainPeak, startTime + Math.min(0.01, duration * 0.15));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  /** Plays a filtered noise burst (sword whoosh, cloth rustle, stone debris). */
  public playNoise(
    ctx: AudioContext,
    dest: AudioNode,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    q: number,
    duration: number,
    gainPeak: number,
    startTime: number,
    useRumbleBuffer = false,
  ): void {
    const src = ctx.createBufferSource();
    src.buffer = useRumbleBuffer ? this.getRumbleBuffer(ctx) : this.getNoiseBuffer(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(q, startTime);
    filter.frequency.setValueAtTime(Math.max(30, freqStart), startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), startTime + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(gainPeak, startTime + Math.min(0.015, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(startTime, this.rand() * 0.5);
    src.stop(startTime + duration + 0.02);
  }
}
