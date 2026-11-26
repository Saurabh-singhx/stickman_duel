import { BotBrain } from '../ai/BotBrain';
import { BALANCE } from '../data/balance';
import { getWaveConfig } from '../data/enemies';
import type { InputMapper } from '../input/InputMapper';
import { ReplayRecorder, type ReplayRecording } from '../replay/Recorder';
import { createInitialState, step } from '../sim/Sim';
import { hashState } from '../sim/Snapshot';
import type { GameState, MatchConfig } from '../sim/State';
import type { GameMode } from './Local2P';

/**
 * Endless Waves survival mode with escalating enemies, score, and combo multiplier.
 */
export class WavesMode implements GameMode {
  public readonly id = 'waves';
  public title = 'Endless Waves';
  public p2Label = 'Wave 1';

  public wave = 1;
  public score = 0;
  public multiplier = 1;

  private prevState!: GameState;
  private state!: GameState;
  private bot!: BotBrain;
  private recorder!: ReplayRecorder;
  private readonly parryAssist: boolean;
  private readonly baseSeed: number;

  constructor(parryAssist = false, seed = 8800) {
    this.parryAssist = parryAssist;
    this.baseSeed = seed;
    this.startWave(1, 100);
  }

  public getState(): GameState {
    return this.state;
  }

  public getPrevState(): GameState {
    return this.prevState;
  }

  public stepFrame(inputs: InputMapper): GameState {
    this.prevState = this.state;
    if (this.state.phase === 'match_end' && this.state.winner === 0) {
      const bonus = 500 * this.wave * this.multiplier;
      this.score += bonus;
      this.wave += 1;
      const healHp = Math.min(100, this.state.fighters[0].hp + 25);
      this.startWave(this.wave, healHp);
      return this.state;
    }

    const p1In = inputs.sample(0);
    const p2In = this.bot.think(this.state);
    this.recorder.recordFrame(p1In, p2In);
    this.state = step(this.state, [p1In, p2In]);

    for (const ev of this.state.events) {
      if (ev.type === 'PARRY' && ev.parrier === 0) {
        this.multiplier = Math.min(8, this.multiplier + 1);
        this.score += 150 * this.multiplier;
      } else if (ev.type === 'PERFECT_DODGE' && ev.dodger === 0) {
        this.multiplier = Math.min(8, this.multiplier + 1);
        this.score += 120 * this.multiplier;
      } else if (ev.type === 'HIT' && ev.attacker === 0) {
        this.score += ev.damage * 10 * this.multiplier;
      } else if (ev.type === 'HIT' && ev.defender === 0) {
        this.multiplier = 1;
      }
    }

    return this.state;
  }

  public getRecording(): ReplayRecording {
    return this.recorder.finalize(`Wave ${this.wave} (${this.score} pts)`, hashState(this.state), this.score);
  }

  public getNetBadge(): string | null {
    return null;
  }

  public getSubStatus(): string | null {
    return `WAVE ${this.wave}  |  SCORE ${this.score}  |  x${this.multiplier}`;
  }

  public dispose(): void {
    this.bot.reset();
  }

  private startWave(waveNum: number, carryHp: number): void {
    const wc = getWaveConfig(waveNum);
    this.p2Label = `Wave ${waveNum} • ${wc.difficulty.toUpperCase()}`;
    const cfg: MatchConfig = {
      seed: this.baseSeed + waveNum * 131,
      stageId: wc.stage,
      p1Char: 'hero',
      p2Char: wc.enemyChar,
      roundsToWin: 1,
      roundTimerFrames: BALANCE.DEFAULT_ROUND_TIMER_FRAMES,
      enableHazards: wc.enableHazards,
      parryAssist: this.parryAssist,
      infiniteGuardP2: false,
      trainingMode: false,
    };
    let init = createInitialState(cfg);
    init = { ...init, fighters: [{ ...init.fighters[0], hp: carryHp }, init.fighters[1]] };
    this.state = init;
    this.prevState = init;
    this.bot = new BotBrain(1, wc.difficulty, wc.behavior, cfg.seed ^ 0x777);
    this.recorder = new ReplayRecorder(cfg);
  }
}
