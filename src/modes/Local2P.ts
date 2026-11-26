import { BALANCE } from '../data/balance';
import type { CharacterId } from '../data/characters';
import type { StageId } from '../data/stages';
import { InputBuffer } from '../input/Buffer';
import type { InputMapper } from '../input/InputMapper';
import { ReplayRecorder, type ReplayRecording } from '../replay/Recorder';
import { createInitialState, step } from '../sim/Sim';
import { hashState } from '../sim/Snapshot';
import type { GameState, InputBitfield, MatchConfig } from '../sim/State';

/** Common interface implemented by every playable mode. */
export interface GameMode {
  readonly id: string;
  readonly title: string;
  readonly p2Label?: string;
  getState(): GameState;
  getPrevState(): GameState;
  stepFrame(inputs: InputMapper, nowMs: number): GameState;
  getRecording(): ReplayRecording | null;
  getNetBadge(): string | null;
  getSubStatus(): string | null;
  dispose(): void;
}

/**
 * Local 2-Player mode (shared keyboard or gamepads) and Training mode
 * with dummy record/playback and infinite guard.
 */
export class Local2PMode implements GameMode {
  public readonly id: string;
  public readonly title: string;
  public readonly p2Label?: string;

  private prevState: GameState;
  private state: GameState;
  private readonly recorder: ReplayRecorder;
  private readonly trainingMode: boolean;

  // Training dummy record/playback state
  private readonly dummyBuffer = new InputBuffer(1800);
  private dummyRecording = false;
  private dummyPlaying = false;
  private dummyCursor = 0;

  constructor(options: {
    stageId: StageId;
    p1Char?: CharacterId;
    p2Char?: CharacterId;
    seed?: number;
    parryAssist?: boolean;
    trainingMode?: boolean;
    infiniteGuardP2?: boolean;
  }) {
    this.trainingMode = options.trainingMode ?? false;
    this.id = this.trainingMode ? 'training' : 'local2p';
    this.title = this.trainingMode ? 'Training Dojo' : 'Local 2P Duel';
    this.p2Label = this.trainingMode ? 'Training Dummy' : undefined;

    const config: MatchConfig = {
      seed: options.seed ?? ((Date.now() & 0xffffff) || 2026),
      stageId: options.stageId,
      p1Char: options.p1Char ?? 'hero',
      p2Char: options.p2Char ?? 'swordsman',
      roundsToWin: BALANCE.ROUNDS_TO_WIN,
      roundTimerFrames: this.trainingMode ? 0 : BALANCE.DEFAULT_ROUND_TIMER_FRAMES,
      enableHazards: options.stageId === 'ruined_hall',
      parryAssist: options.parryAssist ?? false,
      infiniteGuardP2: options.infiniteGuardP2 ?? this.trainingMode,
      trainingMode: this.trainingMode,
    };

    this.state = createInitialState(config);
    this.prevState = this.state;
    this.recorder = new ReplayRecorder(config);
  }

  /** Toggles recording P2 dummy inputs in Training mode (F4). */
  public toggleDummyRecord(): string {
    if (!this.trainingMode) return '';
    if (this.dummyRecording) {
      this.dummyRecording = false;
      return `Dummy recorded (${this.dummyBuffer.length}f)`;
    }
    this.dummyBuffer.clear();
    this.dummyPlaying = false;
    this.dummyRecording = true;
    return 'Recording Dummy (P1 controls dummy)...';
  }

  /** Toggles looping playback of recorded dummy inputs in Training mode (F5). */
  public toggleDummyPlayback(): string {
    if (!this.trainingMode) return '';
    if (this.dummyBuffer.length === 0) return 'No dummy recording yet (press F4)';
    this.dummyRecording = false;
    this.dummyPlaying = !this.dummyPlaying;
    this.dummyCursor = 0;
    return this.dummyPlaying ? 'Dummy Playback: ON' : 'Dummy Playback: OFF';
  }

  public getState(): GameState {
    return this.state;
  }

  public getPrevState(): GameState {
    return this.prevState;
  }

  public stepFrame(inputs: InputMapper): GameState {
    this.prevState = this.state;
    let p1In: InputBitfield = inputs.sample(0);
    let p2In: InputBitfield = inputs.sample(1);

    if (this.trainingMode) {
      if (this.dummyRecording) {
        p2In = p1In;
        p1In = 0;
        this.dummyBuffer.push(p2In);
      } else if (this.dummyPlaying) {
        p2In = this.dummyBuffer.at(this.dummyCursor);
        this.dummyCursor += 1;
      }
    }

    this.recorder.recordFrame(p1In, p2In);
    this.state = step(this.state, [p1In, p2In]);
    return this.state;
  }

  public getRecording(): ReplayRecording | null {
    if (this.trainingMode) return null;
    const s = this.state.stats[0];
    const rating = s.parries * 30 + s.perfectDodges * 30 + s.finishers * 50 + s.maxCombo * 10;
    return this.recorder.finalize(this.title, hashState(this.state), rating);
  }

  public getNetBadge(): string | null {
    return null;
  }

  public getSubStatus(): string | null {
    if (!this.trainingMode) return null;
    return this.dummyRecording
      ? 'REC DUMMY (F4 stop)'
      : this.dummyPlaying
        ? 'PLAYBACK DUMMY (F5 stop)'
        : 'F1 Hitboxes | F2/F3 Frame-Step | F4 Rec Dummy | F5 Play Dummy';
  }

  public dispose(): void {
    this.dummyBuffer.clear();
  }
}
