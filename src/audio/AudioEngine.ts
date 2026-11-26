import { createReverbImpulse } from './Reverb';
import { AudioSynth } from './Synth';

/** Volume settings persisted in SaveSystem. */
export interface VolumeConfig {
  readonly master: number;
  readonly music: number;
  readonly sfx: number;
}

/**
 * Web Audio mixing engine:
 * voices -> sfx / music / ambience buses -> compressor -> limiter -> master,
 * with convolution reverb send, pause low-pass filter, and event ducking.
 */
export class AudioEngine {
  public readonly synth = new AudioSynth();
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private ambienceBus: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private volumes: VolumeConfig = { master: 0.8, music: 0.55, sfx: 0.85 };
  private unlocked = false;

  /** Unlocks and builds the Web Audio graph on first user gesture. */
  public unlock(): void {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.14;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.06;

    const masterGain = ctx.createGain();
    const sfxBus = ctx.createGain();
    const musicBus = ctx.createGain();
    const ambienceBus = ctx.createGain();

    const musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 18000;

    // Convolution reverb send
    const convolver = ctx.createConvolver();
    convolver.buffer = createReverbImpulse(ctx, 1.5, 2.8);
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.24;

    sfxBus.connect(compressor);
    sfxBus.connect(reverbSend);
    musicBus.connect(musicFilter);
    musicFilter.connect(compressor);
    musicFilter.connect(reverbSend);
    ambienceBus.connect(compressor);
    reverbSend.connect(convolver);
    convolver.connect(compressor);

    compressor.connect(limiter);
    limiter.connect(masterGain);
    masterGain.connect(ctx.destination);

    this.ctx = ctx;
    this.masterGain = masterGain;
    this.sfxBus = sfxBus;
    this.musicBus = musicBus;
    this.musicFilter = musicFilter;
    this.ambienceBus = ambienceBus;
    this.reverbSend = reverbSend;
    this.unlocked = true;

    this.applyVolumes();
  }

  /** Returns the AudioContext if unlocked. */
  public getContext(): AudioContext | null {
    return this.ctx;
  }

  /** Returns the SFX output bus. */
  public getSfxBus(): GainNode | null {
    return this.sfxBus;
  }

  /** Returns the Music output bus. */
  public getMusicBus(): GainNode | null {
    return this.musicBus;
  }

  /** Returns the Ambience output bus. */
  public getAmbienceBus(): GainNode | null {
    return this.ambienceBus;
  }

  /** Updates master, music, and SFX volume levels. */
  public setVolumes(volumes: VolumeConfig): void {
    this.volumes = { ...volumes };
    this.applyVolumes();
  }

  /** Closes the music low-pass filter smoothly when paused. */
  public setPaused(paused: boolean): void {
    if (!this.ctx || !this.musicFilter) return;
    const now = this.ctx.currentTime;
    this.musicFilter.frequency.cancelScheduledValues(now);
    this.musicFilter.frequency.setTargetAtTime(paused ? 550 : 18000, now, 0.08);
  }

  /** Ducks music bus by ~3 dB briefly on heavy impacts, parries, and finishers. */
  public duckMusic(durationSec = 0.45): void {
    if (!this.ctx || !this.musicBus) return;
    const now = this.ctx.currentTime;
    const base = Math.max(0.0001, this.volumes.music);
    const ducked = base * 0.7; // ~-3 dB
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setValueAtTime(base, now);
    this.musicBus.gain.linearRampToValueAtTime(ducked, now + 0.03);
    this.musicBus.gain.linearRampToValueAtTime(base, now + durationSec);
  }

  /** Cleanly closes the AudioContext on teardown. */
  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
      this.sfxBus = null;
      this.musicBus = null;
      this.musicFilter = null;
      this.ambienceBus = null;
      this.reverbSend = null;
      this.unlocked = false;
    }
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.sfxBus || !this.musicBus || !this.ambienceBus || !this.reverbSend) {
      return;
    }
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.volumes.master, now, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, now, 0.02);
    this.musicBus.gain.setTargetAtTime(this.volumes.music, now, 0.02);
    this.ambienceBus.gain.setTargetAtTime(this.volumes.music * 0.45, now, 0.02);
  }
}
