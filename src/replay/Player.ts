import { createInitialState, step } from '../sim/Sim';
import { hashState } from '../sim/Snapshot';
import type { GameState, InputBitfield } from '../sim/State';
import { expandReplayFrames, type ReplayRecording } from './Recorder';

/**
 * Replays a recorded duel deterministically through Sim.step.
 * Also supports extracting a single slot's recorded input stream for Ghost Duels.
 */
export class ReplayPlayer {
  private readonly frames: Array<readonly [InputBitfield, InputBitfield]>;
  private cursor = 0;

  constructor(recording: ReplayRecording) {
    this.frames = expandReplayFrames(recording);
  }

  /** Returns the next recorded [p1, p2] input pair, or [0, 0] once complete. */
  public nextPair(): readonly [InputBitfield, InputBitfield] {
    if (this.cursor >= this.frames.length) return [0, 0];
    const pair = this.frames[this.cursor] ?? [0, 0];
    this.cursor += 1;
    return pair;
  }

  /** Returns true when all recorded frames have been consumed. */
  public isFinished(): boolean {
    return this.cursor >= this.frames.length;
  }

  /** Resets playback cursor to frame 0. */
  public reset(): void {
    this.cursor = 0;
  }

  /** Returns total number of frames in the recording. */
  public get totalFrames(): number {
    return this.frames.length;
  }
}

/**
 * Runs an entire ReplayRecording headlessly through Sim.step and returns the final state and hash.
 */
export function simulateReplayHeadless(recording: ReplayRecording): {
  state: GameState;
  hash: number;
} {
  let state = createInitialState(recording.config);
  const frames = expandReplayFrames(recording);
  for (const pair of frames) {
    state = step(state, pair);
  }
  return { state, hash: hashState(state) };
}
