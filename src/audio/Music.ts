import { STAGES, type StageId } from '../data/stages';
import type { AudioEngine } from './AudioEngine';

/**
 * Generative, seeded, sparse atmospheric stage soundtrack.
 * Quantized to bar lines with dynamic intensity layer for low-HP and boss fights.
 */
export class AdaptiveMusic {
  private readonly engine: AudioEngine;
  private stageId: StageId = 'beige_plain';
  private timerId: number | null = null;
  private barStep = 0;
  private rng = 0x9123a7;
  private intensity = 0; // 0 = calm, 1 = intense (low HP / boss)

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  /** Starts generative playback for a stage with a deterministic seed. */
  public start(stageId: StageId, seed = 101): void {
    this.stop();
    this.stageId = stageId;
    this.rng = (seed >>> 0) || 101;
    this.barStep = 0;
    this.tick();
    this.timerId = window.setInterval(() => this.tick(), 500); // 120 BPM quarter-note grid
  }

  /** Sets adaptive intensity (0..1) based on fighter HP and boss encounters. */
  public setIntensity(level: number): void {
    this.intensity = Math.max(0, Math.min(1, level));
  }

  /** Stops music scheduling cleanly. */
  public stop(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private rand(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 0xffffffff;
  }

  private tick(): void {
    const ctx = this.engine.getContext();
    const musicBus = this.engine.getMusicBus();
    const ambBus = this.engine.getAmbienceBus();
    if (!ctx || !musicBus || !ambBus || ctx.state !== 'running') return;

    const spec = STAGES[this.stageId];
    const now = ctx.currentTime + 0.02;
    const stepInBar = this.barStep % 8;

    // Bar-line drone pad (sparse, atmospheric)
    if (stepInBar === 0) {
      this.engine.synth.playTone(ctx, ambBus, 'sine', spec.musicRootHz, spec.musicRootHz * 0.995, 3.8, 0.16, now);
      this.engine.synth.playTone(ctx, ambBus, 'triangle', spec.musicRootHz * 1.5, spec.musicRootHz * 1.5, 3.5, 0.06, now);
    }

    // Minimal plucked melody (silence is allowed ~40% of beats)
    if (this.rand() < 0.45 + this.intensity * 0.25) {
      const semi = spec.musicScale[Math.floor(this.rand() * spec.musicScale.length)] ?? 0;
      const octave = this.rand() > 0.65 ? 4 : 2;
      const freq = spec.musicRootHz * octave * Math.pow(2, semi / 12);
      this.engine.synth.playTone(ctx, musicBus, 'triangle', freq, freq * 0.998, 0.55, 0.09, now);
    }

    // Intensity layer: minimal taiko-like low percussion quantized to bars
    if (this.intensity > 0.35 && (stepInBar === 0 || stepInBar === 3 || stepInBar === 6)) {
      this.engine.synth.playTone(
        ctx,
        musicBus,
        'sine',
        95,
        42,
        0.22,
        0.18 * this.intensity,
        now,
      );
      this.engine.synth.playNoise(
        ctx,
        musicBus,
        'lowpass',
        420,
        140,
        1.2,
        0.1,
        0.09 * this.intensity,
        now,
      );
    }

    this.barStep += 1;
  }
}
