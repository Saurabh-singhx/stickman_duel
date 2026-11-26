import { BotBrain } from '../ai/BotBrain';
import type { InputMapper } from '../input/InputMapper';
import { ReplayPlayer } from '../replay/Player';
import { ReplayRecorder, type ReplayRecording } from '../replay/Recorder';
import { createInitialState, step } from '../sim/Sim';
import { hashState } from '../sim/Snapshot';
import type { GameState, InputBitfield } from '../sim/State';
import type { GameMode } from './Local2P';

/**
 * Ghost Duel mode: fight against a recorded real player's inputs fed directly into the sim,
 * or watch a full deterministic replay playback.
 */
export class GhostDuelMode implements GameMode {
  public readonly id = 'ghost_duel';
  public readonly title: string;
  public readonly p2Label: string;

  private prevState: GameState;
  private state: GameState;
  private readonly player: ReplayPlayer;
  private readonly watchOnly: boolean;
  private readonly fallbackBot: BotBrain;
  private readonly recorder: ReplayRecorder;

  constructor(recording: ReplayRecording, watchOnly = false) {
    this.watchOnly = watchOnly;
    this.title = watchOnly ? `Replay: ${recording.label}` : `Ghost Duel: ${recording.label}`;
    this.p2Label = watchOnly ? 'Recorded P2' : `Ghost (${recording.label})`;
    this.player = new ReplayPlayer(recording);
    this.state = createInitialState(recording.config);
    this.prevState = this.state;
    this.fallbackBot = new BotBrain(1, 'normal', 'counter', recording.config.seed ^ 0x123);
    this.recorder = new ReplayRecorder(recording.config);
  }

  public getState(): GameState {
    return this.state;
  }

  public getPrevState(): GameState {
    return this.prevState;
  }

  public stepFrame(inputs: InputMapper): GameState {
    this.prevState = this.state;
    let p1In: InputBitfield;
    let p2In: InputBitfield;

    if (this.watchOnly) {
      const pair = this.player.nextPair();
      p1In = pair[0];
      p2In = pair[1];
    } else {
      p1In = inputs.sample(0);
      if (!this.player.isFinished()) {
        // Feed the ghost's recorded P1 inputs as the P2 opponent (mirrored horizontally)
        const recPair = this.player.nextPair();
        p2In = this.mirrorHorizontal(recPair[0]);
      } else {
        p2In = this.fallbackBot.think(this.state);
      }
    }

    this.recorder.recordFrame(p1In, p2In);
    this.state = step(this.state, [p1In, p2In]);
    return this.state;
  }

  public getRecording(): ReplayRecording | null {
    if (this.watchOnly) return null;
    const s = this.state.stats[0];
    return this.recorder.finalize(this.title, hashState(this.state), s.parries * 35 + s.finishers * 50);
  }

  public getNetBadge(): string | null {
    return null;
  }

  public getSubStatus(): string | null {
    return this.watchOnly ? 'REPLAY PLAYBACK' : 'FIGHTING RECORDED GHOST';
  }

  public dispose(): void {
    this.player.reset();
    this.fallbackBot.reset();
  }

  private mirrorHorizontal(bits: InputBitfield): InputBitfield {
    const hasLeft = (bits & 1) !== 0;
    const hasRight = (bits & 2) !== 0;
    let out = bits & ~3;
    if (hasLeft) out |= 2;
    if (hasRight) out |= 1;
    return out;
  }
}
