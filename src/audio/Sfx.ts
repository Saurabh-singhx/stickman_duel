import type { SimEvent } from '../sim/State';
import type { AudioEngine } from './AudioEngine';

/**
 * Procedural sound-effect recipes driven strictly by typed SimEvents.
 * Every SFX layers transient + body + tail with pitch variation and timing jitter.
 */
export class SfxController {
  private readonly engine: AudioEngine;

  constructor(engine: AudioEngine) {
    this.engine = engine;
  }

  /** Plays a crisp UI tick sound. */
  public playUiTick(confirm = false): void {
    const ctx = this.engine.getContext();
    const bus = this.engine.getSfxBus();
    if (!ctx || !bus) return;
    const t = ctx.currentTime;
    const p = this.engine.synth.varyPitch();
    this.engine.synth.playTone(ctx, bus, 'triangle', (confirm ? 660 : 480) * p, (confirm ? 920 : 420) * p, 0.06, 0.14, t);
  }

  /** Dispatches all simulation events from a step to their procedural SFX recipes. */
  public handleEvents(events: readonly SimEvent[]): void {
    const ctx = this.engine.getContext();
    const bus = this.engine.getSfxBus();
    if (!ctx || !bus) return;

    for (const ev of events) {
      switch (ev.type) {
        case 'ATTACK_START':
          this.playWhoosh(ctx, bus, ev.move === 'heavy' || ev.move === 'unblockable' || ev.move === 'counter');
          break;
        case 'UNBLOCKABLE_TELEGRAPH':
          this.playUnblockableWarning(ctx, bus);
          break;
        case 'HIT':
          this.playHit(ctx, bus, ev.isHeavy || ev.isCounter);
          break;
        case 'BLOCK':
          this.playBlockClash(ctx, bus, ev.guardRemaining);
          break;
        case 'PARRY':
          this.playParry(ctx, bus);
          break;
        case 'GUARD_BREAK':
          this.playGuardBreak(ctx, bus);
          break;
        case 'DODGE':
          this.playDodgeSwish(ctx, bus);
          break;
        case 'PERFECT_DODGE':
          this.playPerfectDodge(ctx, bus);
          break;
        case 'SLAB_BURST':
          this.playCoffinBurst(ctx, bus);
          break;
        case 'FINISHER_START':
          this.playFinisherWindup(ctx, bus, ev.finisherId === 'tempest_thunder');
          break;
        case 'FINISHER_BEAT':
          this.playFinisherBeat(ctx, bus, ev.finisherId === 'tempest_thunder');
          break;
        case 'FINISHER_IMPACT':
          this.playFinisherImpact(ctx, bus, ev.finisherId === 'tempest_thunder');
          break;
        case 'LAND':
          this.playFootstep(ctx, bus);
          break;
        case 'ROUND_START':
          this.playRoundStinger(ctx, bus, true);
          break;
        case 'PLAYER_SPECIAL_START':
          this.playPlayerSpecialStart(ctx, bus, ev.specialId);
          break;
        case 'PLAYER_SPECIAL_BEAT':
          this.playPlayerSpecialBeat(ctx, bus, ev.specialId);
          break;
        case 'PLAYER_SPECIAL_IMPACT':
          this.playPlayerSpecialImpact(ctx, bus, ev.specialId);
          break;
        case 'BOSS_SPECIAL_TELEGRAPH':
          this.playUnblockableWarning(ctx, bus);
          break;
        case 'BOSS_SPECIAL_ACTIVE':
          this.playCoffinBurst(ctx, bus);
          break;
        case 'KNOCKDOWN':
          this.playHit(ctx, bus, true);
          break;
        case 'MATCH_END':
          this.playVictoryFanfare(ctx, bus);
          break;
        default:
          break;
      }
    }
  }

  private playWhoosh(ctx: AudioContext, bus: GainNode, heavy: boolean): void {
    const s = this.engine.synth;
    const t = ctx.currentTime + s.jitterSec();
    const p = s.varyPitch();
    s.playNoise(ctx, bus, 'bandpass', (heavy ? 700 : 1400) * p, (heavy ? 220 : 480) * p, 2.2, heavy ? 0.24 : 0.13, heavy ? 0.28 : 0.18, t);
    s.playTone(ctx, bus, 'sine', (heavy ? 220 : 420) * p, (heavy ? 95 : 180) * p, heavy ? 0.18 : 0.09, 0.09, t);
  }

  private playFootstep(ctx: AudioContext, bus: GainNode): void {
    const s = this.engine.synth;
    const t = ctx.currentTime + s.jitterSec();
    s.playNoise(ctx, bus, 'lowpass', 320 * s.varyPitch(), 120, 1.0, 0.06, 0.14, t);
  }

  private playDodgeSwish(ctx: AudioContext, bus: GainNode): void {
    const s = this.engine.synth;
    const t = ctx.currentTime + s.jitterSec();
    const p = s.varyPitch();
    s.playNoise(ctx, bus, 'highpass', 1800 * p, 650 * p, 1.4, 0.14, 0.16, t);
    s.playNoise(ctx, bus, 'bandpass', 520 * p, 240 * p, 1.0, 0.16, 0.12, t + 0.02);
  }

  private playBlockClash(ctx: AudioContext, bus: GainNode, guardRemaining: number): void {
    const s = this.engine.synth;
    const t = ctx.currentTime + s.jitterSec();
    const guardRatio = Math.max(0.1, guardRemaining / 100);
    const pitch = (0.75 + guardRatio * 0.55) * s.varyPitch();
    // Transient metallic click + resonant body + ring tail
    s.playNoise(ctx, bus, 'highpass', 2600, 1800, 1.5, 0.04, 0.24, t);
    s.playTone(ctx, bus, 'square', 920 * pitch, 640 * pitch, 0.11, 0.18, t);
    s.playTone(ctx, bus, 'sine', 1680 * pitch, 1420 * pitch, 0.22, 0.14, t + 0.01);
  }

  /**
   * Signature PARRY sound: sharp bright metal ring + brief silence gap + rising shimmer.
   */
  private playParry(ctx: AudioContext, bus: GainNode): void {
    const s = this.engine.synth;
    const t = ctx.currentTime;
    const p = s.varyPitch();
    this.engine.duckMusic(0.55);

    // 1. Crisp bright steel impact transient
    s.playNoise(ctx, bus, 'highpass', 3800, 2200, 1.8, 0.035, 0.35, t);
    s.playTone(ctx, bus, 'triangle', 1568 * p, 1520 * p, 0.08, 0.3, t);
    s.playTone(ctx, bus, 'sine', 2349 * p, 2320 * p, 0.09, 0.24, t);

    // 2. Short audio hit-stop silence beat (~55ms), then rising golden harmonic shimmer
    const shimmerStart = t + 0.075;
    s.playTone(ctx, bus, 'sine', 1174 * p, 1760 * p, 0.38, 0.22, shimmerStart);
    s.playTone(ctx, bus, 'triangle', 1760 * p, 2637 * p, 0.42, 0.16, shimmerStart + 0.02);
    s.playTone(ctx, bus, 'sine', 3136 * p, 3520 * p, 0.34, 0.1, shimmerStart + 0.04);
  }

  private playHit(ctx: AudioContext, bus: GainNode, heavy: boolean): void {
    const s = this.engine.synth;
    const t = ctx.currentTime + s.jitterSec();
    const p = s.varyPitch();
    if (heavy) this.engine.duckMusic(0.4);
    // Transient crackle + punchy body + sub-bass boom on heavy
    s.playNoise(ctx, bus, 'bandpass', 1600 * p, 420 * p, 1.4, 0.07, heavy ? 0.32 : 0.22, t);
    s.playTone(ctx, bus, 'triangle', (heavy ? 185 : 240) * p, 52 * p, heavy ? 0.22 : 0.13, heavy ? 0.38 : 0.26, t);
    if (heavy) {
      s.playTone(ctx, bus, 'sine', 92 * p, 34, 0.34, 0.42, t);
    }
  }

  private playGuardBreak(ctx: AudioContext, bus: GainNode): void {
    const s = this.engine.synth;
    const t = ctx.currentTime;
    this.engine.duckMusic(0.65);
    // Glass-shatter high crackle + dramatic low drop
    s.playNoise(ctx, bus, 'highpass', 3200, 900, 2.0, 0.28, 0.34, t);
    s.playTone(ctx, bus, 'sawtooth', 1920, 740, 0.16, 0.16, t);
    s.playTone(ctx, bus, 'sine', 140, 36, 0.45, 0.42, t + 0.03);
  }

  private playPerfectDodge(ctx: AudioContext, bus: GainNode): void {
    const s = this.engine.synth;
    const t = ctx.currentTime;
    this.engine.duckMusic(0.5);
    // Time-slow low whomp + airy reversed-feeling swell
    s.playTone(ctx, bus, 'sine', 240, 58, 0.32, 0.35, t);
    s.playNoise(ctx, bus, 'bandpass', 320, 1900, 3.0, 0.34, 0.2, t + 0.04);
  }

  private playUnblockableWarning(ctx: AudioContext, bus: GainNode): void {
    const s = this.engine.synth;
    const t = ctx.currentTime;
    s.playTone(ctx, bus, 'sawtooth', 310, 680, 0.28, 0.18, t);
    s.playTone(ctx, bus, 'triangle', 620, 980, 0.24, 0.12, t + 0.04);
  }

  private playCoffinBurst(ctx: AudioContext, bus: GainNode): void {
    const s = this.engine.synth;
    const t = ctx.currentTime;
    this.engine.duckMusic(0.45);
    // Deep rumble + stone crack + debris patter
    s.playTone(ctx, bus, 'sine', 85, 32, 0.42, 0.42, t);
    s.playNoise(ctx, bus, 'lowpass', 900, 180, 1.2, 0.32, 0.34, t);
    s.playNoise(ctx, bus, 'bandpass', 2200, 1100, 2.5, 0.18, 0.16, t + 0.12);
  }

  private playFinisherWindup(ctx: AudioContext, bus: GainNode, isThunderStorm: boolean): void {
    const s = this.engine.synth;
    const t = ctx.currentTime;
    this.engine.duckMusic(isThunderStorm ? 6.5 : 1.1);
    s.playTone(ctx, bus, 'sine', 280, 56, 0.55, 0.32, t);
    if (isThunderStorm) {
      // Atmospheric rain bed + initial distant rolling thunder
      s.playNoise(ctx, bus, 'bandpass', 1800, 1100, 0.8, 1.8, 0.14, t);
      s.playNoise(ctx, bus, 'lowpass', 240, 75, 1.0, 1.6, 0.36, t + 0.08);
      s.playTone(ctx, bus, 'sine', 64, 28, 1.4, 0.38, t + 0.08);
    }
  }

  private playFinisherBeat(ctx: AudioContext, bus: GainNode, isThunderStorm: boolean): void {
    const s = this.engine.synth;
    const t = ctx.currentTime;
    const p = s.varyPitch();
    if (isThunderStorm) {
      // Sharp lightning crackle + rolling thunderclap + slow-mo pitched-down blade clash
      s.playNoise(ctx, bus, 'highpass', 3600 * p, 900, 1.6, 0.18, 0.34, t);
      s.playNoise(ctx, bus, 'lowpass', 320, 65, 1.1, 1.25, 0.4, t + 0.05);
      s.playTone(ctx, bus, 'sine', 78 * p, 26, 1.15, 0.42, t + 0.04);
      s.playTone(ctx, bus, 'triangle', 740 * p, 420 * p, 0.42, 0.2, t + 0.02);
    } else {
      // Crisp anime multi-slash / dimensional cut slice
      s.playNoise(ctx, bus, 'bandpass', 2600 * p, 700, 2.2, 0.12, 0.26, t);
      s.playTone(ctx, bus, 'triangle', 1280 * p, 620 * p, 0.14, 0.18, t);
    }
  }

  private playFinisherImpact(ctx: AudioContext, bus: GainNode, isThunderStorm: boolean): void {
    const s = this.engine.synth;
    const t = ctx.currentTime;
    this.engine.duckMusic(isThunderStorm ? 1.8 : 1.0);
    // Huge golden slash + deep sub-bass boom + ringing metallic tail
    s.playNoise(ctx, bus, 'bandpass', 2400, 320, 1.4, 0.42, 0.44, t);
    s.playTone(ctx, bus, 'sine', 110, 26, 0.78, 0.54, t);
    s.playTone(ctx, bus, 'triangle', 1320, 880, 0.85, 0.24, t + 0.02);
    if (isThunderStorm) {
      // Direct lightning strike + echoing thunderclap tail
      s.playNoise(ctx, bus, 'highpass', 4200, 1200, 1.4, 0.22, 0.38, t);
      s.playNoise(ctx, bus, 'lowpass', 280, 58, 1.0, 1.6, 0.44, t + 0.06);
    }
  }

  private playRoundStinger(ctx: AudioContext, bus: GainNode, start: boolean): void {
    const s = this.engine.synth;
    const t = ctx.currentTime;
    const notes = start ? [220, 330, 440] : [440, 330, 220];
    notes.forEach((n, idx) => {
      s.playTone(ctx, bus, 'triangle', n, n * 0.99, 0.22, 0.16, t + idx * 0.08);
    });
  }

  private playPlayerSpecialStart(ctx: AudioContext, bus: GainNode, specialId: string): void {
    const s = this.engine.synth;
    const t = ctx.currentTime;
    this.engine.duckMusic(2.4);
    if (specialId === 'aerial_lasers') {
      s.playTone(ctx, bus, 'sawtooth', 240, 1120, 0.45, 0.22, t);
      s.playTone(ctx, bus, 'sine', 480, 1480, 0.5, 0.16, t + 0.05);
    } else if (specialId === 'black_thunder') {
      s.playNoise(ctx, bus, 'lowpass', 220, 60, 1.0, 1.2, 0.34, t);
      s.playTone(ctx, bus, 'sine', 75, 32, 1.1, 0.36, t);
    } else {
      s.playTone(ctx, bus, 'triangle', 320, 880, 0.35, 0.24, t);
      s.playNoise(ctx, bus, 'bandpass', 1200, 420, 1.8, 0.28, 0.2, t);
    }
  }

  private playPlayerSpecialBeat(ctx: AudioContext, bus: GainNode, specialId: string): void {
    const s = this.engine.synth;
    const t = ctx.currentTime;
    const p = s.varyPitch();
    if (specialId === 'aerial_lasers') {
      s.playTone(ctx, bus, 'sawtooth', 920 * p, 260 * p, 0.22, 0.22, t);
      s.playNoise(ctx, bus, 'highpass', 2400, 900, 1.6, 0.16, 0.2, t);
    } else if (specialId === 'unarmed_launch') {
      s.playTone(ctx, bus, 'triangle', 1400 * p, 920 * p, 0.12, 0.18, t);
    } else if (specialId === 'blade_impale') {
      s.playNoise(ctx, bus, 'highpass', 3200, 1400, 1.8, 0.08, 0.28, t);
      s.playTone(ctx, bus, 'square', 1120 * p, 640 * p, 0.14, 0.18, t);
    } else {
      s.playNoise(ctx, bus, 'bandpass', 1800 * p, 420, 1.5, 0.22, 0.24, t);
    }
  }

  private playPlayerSpecialImpact(ctx: AudioContext, bus: GainNode, specialId: string): void {
    const s = this.engine.synth;
    const t = ctx.currentTime;
    this.engine.duckMusic(1.2);
    if (specialId === 'black_thunder') {
      s.playNoise(ctx, bus, 'highpass', 4200, 1000, 1.4, 0.24, 0.42, t);
      s.playNoise(ctx, bus, 'lowpass', 280, 52, 1.0, 1.5, 0.48, t + 0.04);
      s.playTone(ctx, bus, 'sine', 96, 26, 0.9, 0.5, t);
    } else if (specialId === 'unarmed_launch') {
      s.playTone(ctx, bus, 'sine', 160, 32, 0.45, 0.52, t);
      s.playNoise(ctx, bus, 'bandpass', 900, 180, 1.2, 0.3, 0.4, t);
      // Wall crash echo
      s.playTone(ctx, bus, 'sine', 110, 28, 0.35, 0.38, t + 0.18);
    } else {
      s.playNoise(ctx, bus, 'bandpass', 2200, 300, 1.3, 0.38, 0.42, t);
      s.playTone(ctx, bus, 'sine', 120, 28, 0.65, 0.5, t);
      s.playTone(ctx, bus, 'triangle', 1240, 720, 0.55, 0.22, t + 0.02);
    }
  }

  private playVictoryFanfare(ctx: AudioContext, bus: GainNode): void {
    const s = this.engine.synth;
    const t = ctx.currentTime;
    const notes = [293.66, 369.99, 440, 587.33, 659.25];
    notes.forEach((n, idx) => {
      s.playTone(ctx, bus, 'triangle', n, n, 0.35, 0.18, t + idx * 0.11);
    });
  }
}
