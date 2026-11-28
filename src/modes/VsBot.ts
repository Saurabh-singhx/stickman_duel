import { BotBrain } from '../ai/BotBrain';
import { BALANCE } from '../data/balance';
import type { CharacterId } from '../data/characters';
import type { BehaviorId, DifficultyId } from '../data/enemies';
import type { StageId } from '../data/stages';
import type { InputMapper } from '../input/InputMapper';
import { ReplayRecorder, type ReplayRecording } from '../replay/Recorder';
import { createInitialState, step } from '../sim/Sim';
import { hashState } from '../sim/Snapshot';
import type { GameState, MatchConfig } from '../sim/State';
import type { GameMode } from './Local2P';

/**
 * Single-player Versus Bot mode (also powers Daily Challenge and cold-start Quick Play fallback).
 */
export class VsBotMode implements GameMode {
  public readonly id = 'vs_bot';
  public readonly title: string;
  public readonly p2Label: string;

  private prevState: GameState;
  private state: GameState;
  private readonly bot: BotBrain;
  private readonly recorder: ReplayRecorder;

  constructor(options: {
    difficulty: DifficultyId;
    enemyChar?: CharacterId;
    behavior?: BehaviorId;
    stageId?: StageId;
    seed?: number;
    enableHazards?: boolean;
    parryAssist?: boolean;
    titleOverride?: string;
    p2LabelOverride?: string;
  }) {
    const seed = options.seed ?? (Date.now() & 0xffffff);
    const enemyChar = options.enemyChar ?? 'swordsman';
    const stageId = options.stageId ?? 'beige_plain';
    const behavior = options.behavior ?? ((enemyChar === 'warden' || enemyChar === 'vesper' || enemyChar === 'raijin') ? 'boss' : enemyChar === 'assassin' ? 'counter' : enemyChar === 'brawler' ? 'aggressive' : 'defensive');

    this.title = options.titleOverride ?? `Vs Bot (${options.difficulty.toUpperCase()})`;
    this.p2Label = options.p2LabelOverride ?? `Bot • ${options.difficulty.toUpperCase()}`;

    const config: MatchConfig = {
      seed,
      stageId,
      p1Char: 'hero',
      p2Char: enemyChar,
      roundsToWin: BALANCE.ROUNDS_TO_WIN,
      roundTimerFrames: BALANCE.DEFAULT_ROUND_TIMER_FRAMES,
      enableHazards: options.enableHazards ?? stageId === 'ruined_hall',
      hazardImmuneSlot: 1,
      parryAssist: options.parryAssist ?? false,
      infiniteGuardP2: false,
      trainingMode: false,
    };

    this.state = createInitialState(config);
    this.prevState = this.state;
    this.bot = new BotBrain(1, options.difficulty, behavior, seed ^ 0x55aa);
    this.recorder = new ReplayRecorder(config);
  }

  public getState(): GameState {
    return this.state;
  }

  public getPrevState(): GameState {
    return this.prevState;
  }

  public stepFrame(inputs: InputMapper): GameState {
    this.prevState = this.state;
    const p1In = inputs.sample(0);
    const p2In = this.bot.think(this.state);
    this.recorder.recordFrame(p1In, p2In);
    this.state = step(this.state, [p1In, p2In]);
    return this.state;
  }

  public getRecording(): ReplayRecording {
    const s = this.state.stats[0];
    const rating = s.parries * 35 + s.perfectDodges * 35 + s.finishers * 50 + s.maxCombo * 12;
    return this.recorder.finalize(this.title, hashState(this.state), rating);
  }

  public getNetBadge(): string | null {
    return null;
  }

  public getSubStatus(): string | null {
    return null;
  }

  public dispose(): void {
    this.bot.reset();
  }
}
