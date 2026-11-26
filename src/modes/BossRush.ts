import { BotBrain } from '../ai/BotBrain';
import { BALANCE } from '../data/balance';
import { BOSS_RUSH_ENCOUNTERS, type BossRushEncounter } from '../data/enemies';
import type { InputMapper } from '../input/InputMapper';
import { ReplayRecorder, type ReplayRecording } from '../replay/Recorder';
import { createInitialState, step } from '../sim/Sim';
import { hashState } from '../sim/Snapshot';
import type { GameState, MatchConfig } from '../sim/State';
import type { GameMode } from './Local2P';

/**
 * Six-stage escalating Boss Rush mode:
 * Swordsman -> Brawler -> Assassin -> Coffin Hall -> 2v1 Gauntlet -> Casket Warden.
 */
export class BossRushMode implements GameMode {
  public readonly id = 'boss_rush';
  public title = 'Boss Rush';
  public p2Label = '';

  private stageIdx = 0;
  private gauntletSub = 0;
  private prevState!: GameState;
  private state!: GameState;
  private bot!: BotBrain;
  private recorder!: ReplayRecorder;
  private readonly parryAssist: boolean;
  private readonly baseSeed: number;

  constructor(parryAssist = false, seed = 6001) {
    this.parryAssist = parryAssist;
    this.baseSeed = seed;
    this.startEncounter(0, 0);
  }

  /** Returns the current 1-indexed boss encounter number (1..6). */
  public getCurrentStageNumber(): number {
    return this.stageIdx + 1;
  }

  /** Returns true if the player cleared all 6 encounters. */
  public isFullyCleared(): boolean {
    return (
      this.stageIdx === BOSS_RUSH_ENCOUNTERS.length - 1 &&
      this.state.phase === 'match_end' &&
      this.state.winner === 0
    );
  }

  public getState(): GameState {
    return this.state;
  }

  public getPrevState(): GameState {
    return this.prevState;
  }

  public stepFrame(inputs: InputMapper): GameState {
    this.prevState = this.state;

    // Auto-advance to next gauntlet foe or next boss stage when player wins
    if (this.state.phase === 'match_end' && this.state.winner === 0) {
      const enc = BOSS_RUSH_ENCOUNTERS[this.stageIdx]!;
      if (this.gauntletSub + 1 < enc.gauntletCount) {
        const savedHp = Math.max(25, this.state.fighters[0].hp);
        this.startEncounter(this.stageIdx, this.gauntletSub + 1, savedHp);
        return this.state;
      }
      if (this.stageIdx + 1 < BOSS_RUSH_ENCOUNTERS.length) {
        this.startEncounter(this.stageIdx + 1, 0);
        return this.state;
      }
      return this.state;
    }

    const p1In = inputs.sample(0);
    const p2In = this.bot.think(this.state);
    this.recorder.recordFrame(p1In, p2In);
    this.state = step(this.state, [p1In, p2In]);
    return this.state;
  }

  public getRecording(): ReplayRecording {
    const s = this.state.stats[0];
    return this.recorder.finalize(
      this.title,
      hashState(this.state),
      s.parries * 40 + s.finishers * 60 + this.stageIdx * 50,
    );
  }

  public getNetBadge(): string | null {
    return null;
  }

  public getSubStatus(): string | null {
    const enc = BOSS_RUSH_ENCOUNTERS[this.stageIdx]!;
    return `${enc.title} — ${enc.subtitle}`;
  }

  public dispose(): void {
    this.bot.reset();
  }

  private startEncounter(idx: number, sub: number, carryHp?: number): void {
    this.stageIdx = idx;
    this.gauntletSub = sub;
    const enc: BossRushEncounter = BOSS_RUSH_ENCOUNTERS[idx]!;
    this.title = `Boss Rush ${idx + 1}/6`;
    this.p2Label = enc.gauntletCount > 1 ? `${enc.title} (${sub + 1}/${enc.gauntletCount})` : enc.title;

    const cfg: MatchConfig = {
      seed: this.baseSeed + idx * 97 + sub * 13,
      stageId: enc.stage,
      p1Char: 'hero',
      p2Char: enc.enemyChar,
      roundsToWin: enc.gauntletCount > 1 ? 1 : BALANCE.ROUNDS_TO_WIN,
      roundTimerFrames: BALANCE.DEFAULT_ROUND_TIMER_FRAMES,
      enableHazards: enc.enableHazards,
      parryAssist: this.parryAssist,
      infiniteGuardP2: false,
      trainingMode: false,
    };

    let init = createInitialState(cfg);
    if (carryHp !== undefined) {
      init = {
        ...init,
        fighters: [{ ...init.fighters[0], hp: carryHp }, init.fighters[1]],
      };
    }
    this.state = init;
    this.prevState = init;
    this.bot = new BotBrain(1, enc.difficulty, enc.behavior, cfg.seed ^ 0x31337);
    this.recorder = new ReplayRecorder(cfg);
  }
}
