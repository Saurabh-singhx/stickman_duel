import { STAGE_LIST, type StageId } from '../data/stages';
import { createInitialState, step } from '../sim/Sim';
import { hashState } from '../sim/Snapshot';
import type { FighterSlot, GameState, InputBitfield, MatchConfig } from '../sim/State';
import { decodeMessage, encodeMessage, PROTOCOL_VERSION, type NetMessage } from './Protocol';
import type { Transport } from './Transport';

export const DEFAULT_INPUT_DELAY = 3;
export const MAX_INPUT_DELAY = 6;
const REDUNDANCY_WINDOW = 4;
const HASH_CHECK_INTERVAL = 60;
const DISCONNECT_FORFEIT_MS = 5000;

/** Status snapshot exposed to UI and HUD. */
export interface NetSessionStatus {
  readonly connected: boolean;
  readonly started: boolean;
  readonly pingMs: number;
  readonly inputDelay: number;
  readonly desynced: boolean;
  readonly forfeitedByDisconnect: boolean;
}

/**
 * Common session interface implemented by InputDelaySession and the future RollbackSession.
 */
export interface NetSession {
  start(roomId: string, isHost: boolean, seed: number, stageId: StageId): Promise<void>;
  tick(localInput: InputBitfield, nowMs: number): GameState | null;
  getState(): GameState | null;
  getStatus(): NetSessionStatus;
  dispose(): void;
}

/**
 * Deterministic lockstep session with adaptive input delay (3..6 frames),
 * redundant input packets, RTT measurement, 60-frame checksum verification,
 * and 5-second disconnect forfeit handling.
 */
export class InputDelaySession implements NetSession {
  private readonly transport: Transport;
  private readonly onDesync?: (frame: number, localHash: number, remoteHash: number) => void;

  private isHost = true;
  private localSlot: FighterSlot = 0;
  private state: GameState | null = null;
  private connected = false;
  private started = false;
  private desynced = false;
  private forfeitedByDisconnect = false;

  private inputDelay = DEFAULT_INPUT_DELAY;
  private pingMs = 0;
  private lastPingSentMs = 0;
  private disconnectAtMs: number | null = null;
  private nextLocalFrame = 0;

  private readonly localInputs = new Map<number, InputBitfield>();
  private readonly remoteInputs = new Map<number, InputBitfield>();
  private readonly localHashes = new Map<number, number>();
  private readonly remoteHashes = new Map<number, number>();

  private seed = 1001;
  private stageId: StageId = 'beige_plain';

  constructor(
    transport: Transport,
    onDesync?: (frame: number, localHash: number, remoteHash: number) => void,
  ) {
    this.transport = transport;
    this.onDesync = onDesync;

    this.transport.onMessage((bytes) => {
      const msg = decodeMessage(bytes);
      if (msg) this.handleMessage(msg);
    });
    this.transport.onPeerJoined(() => {
      this.connected = true;
      this.disconnectAtMs = null;
      this.send({ type: 'HELLO', version: PROTOCOL_VERSION, isHost: this.isHost });
      if (this.isHost) {
        const stageIdx = Math.max(0, STAGE_LIST.indexOf(this.stageId));
        this.send({ type: 'SEED', seed: this.seed, stageIndex: stageIdx });
        this.beginMatch(this.seed, this.stageId);
      }
    });
    this.transport.onPeerLeft(() => {
      this.connected = false;
      this.disconnectAtMs = Date.now();
    });
  }

  /** Connects to the room and prepares lockstep state. */
  public async start(roomId: string, isHost: boolean, seed: number, stageId: StageId): Promise<void> {
    this.isHost = isHost;
    this.localSlot = isHost ? 0 : 1;
    this.seed = seed >>> 0;
    this.stageId = stageId;
    this.connected = false;
    this.started = false;
    this.desynced = false;
    this.forfeitedByDisconnect = false;
    this.localInputs.clear();
    this.remoteInputs.clear();
    this.localHashes.clear();
    this.remoteHashes.clear();
    await this.transport.connect(roomId, isHost);
  }

  /**
   * Queues local input for frame N + delay and advances the simulation whenever
   * both inputs for the current frame are available.
   */
  public tick(localInput: InputBitfield, nowMs: number): GameState | null {
    if (!this.started || !this.state || this.desynced || this.forfeitedByDisconnect) {
      return this.state;
    }

    // Disconnect timeout -> forfeit after 5s
    if (!this.connected && this.disconnectAtMs !== null && nowMs - this.disconnectAtMs >= DISCONNECT_FORFEIT_MS) {
      this.forfeitedByDisconnect = true;
      return this.state;
    }

    // Periodic ping for RTT & adaptive input delay
    if (this.connected && nowMs - this.lastPingSentMs >= 1000) {
      this.lastPingSentMs = nowMs;
      this.send({ type: 'PING', sentMs: Math.trunc(nowMs) >>> 0 });
    }

    // Queue local input for current simulation frame + delay
    const targetFrame = this.state.frame + this.inputDelay;
    while (this.nextLocalFrame <= targetFrame) {
      this.localInputs.set(this.nextLocalFrame, localInput);
      this.sendInputPacket(this.nextLocalFrame);
      this.nextLocalFrame += 1;
    }

    // Advance lockstep simulation only when both local and remote inputs for frame are present
    const f = this.state.frame;
    const loc = this.localInputs.get(f);
    const rem = this.remoteInputs.get(f);
    if (loc === undefined || rem === undefined) {
      // Re-broadcast recent inputs periodically to recover from packet loss
      if (this.nextLocalFrame > 0) {
        this.sendInputPacket(this.nextLocalFrame - 1);
      }
      return this.state;
    }

    const pair: readonly [InputBitfield, InputBitfield] =
      this.localSlot === 0 ? [loc, rem] : [rem, loc];
    this.state = step(this.state, pair);

    // Clean up old inputs
    this.localInputs.delete(f);
    this.remoteInputs.delete(f);

    // Exchange checksum every 60 frames
    if (this.state.frame > 0 && this.state.frame % HASH_CHECK_INTERVAL === 0) {
      const h = hashState(this.state);
      this.localHashes.set(this.state.frame, h);
      this.send({ type: 'HASH', frame: this.state.frame, hash: h });
      this.verifyHash(this.state.frame);
    }

    return this.state;
  }

  public getState(): GameState | null {
    return this.state;
  }

  public getStatus(): NetSessionStatus {
    return {
      connected: this.connected,
      started: this.started,
      pingMs: this.pingMs,
      inputDelay: this.inputDelay,
      desynced: this.desynced,
      forfeitedByDisconnect: this.forfeitedByDisconnect,
    };
  }

  public dispose(): void {
    if (this.connected) {
      this.send({ type: 'FORFEIT' });
    }
    this.transport.close();
  }

  private beginMatch(seed: number, stageId: StageId): void {
    if (this.started) return;
    const cfg: MatchConfig = {
      seed,
      stageId,
      p1Char: 'hero',
      p2Char: 'swordsman',
      roundsToWin: 2,
      roundTimerFrames: 99 * 60,
      enableHazards: false,
      parryAssist: false,
      infiniteGuardP2: false,
      trainingMode: false,
    };
    this.state = createInitialState(cfg);
    // Pre-fill initial delay frames with neutral input 0 on both sides
    for (let i = 0; i < this.inputDelay; i += 1) {
      this.localInputs.set(i, 0);
      this.remoteInputs.set(i, 0);
    }
    this.nextLocalFrame = this.inputDelay;
    this.started = true;
  }

  private sendInputPacket(latestFrame: number): void {
    const entries: { frame: number; bits: InputBitfield }[] = [];
    for (let k = 0; k < REDUNDANCY_WINDOW; k += 1) {
      const f = latestFrame - k;
      if (f < 0) break;
      const bits = this.localInputs.get(f);
      if (bits !== undefined) {
        entries.push({ frame: f, bits });
      }
    }
    if (entries.length > 0) {
      this.send({ type: 'INPUT', frame: latestFrame, entries });
    }
  }

  private handleMessage(msg: NetMessage): void {
    switch (msg.type) {
      case 'HELLO':
        if (this.isHost && this.started) {
          const stageIdx = Math.max(0, STAGE_LIST.indexOf(this.stageId));
          this.send({ type: 'SEED', seed: this.seed, stageIndex: stageIdx });
        }
        break;
      case 'SEED':
        if (!this.isHost) {
          const stage = STAGE_LIST[msg.stageIndex] ?? 'beige_plain';
          this.seed = msg.seed;
          this.stageId = stage;
          this.beginMatch(msg.seed, stage);
          this.send({ type: 'READY' });
        }
        break;
      case 'INPUT':
        for (const e of msg.entries) {
          if (!this.remoteInputs.has(e.frame)) {
            this.remoteInputs.set(e.frame, e.bits);
          }
        }
        break;
      case 'HASH':
        this.remoteHashes.set(msg.frame, msg.hash);
        this.verifyHash(msg.frame);
        break;
      case 'PING':
        this.send({ type: 'PONG', sentMs: msg.sentMs });
        break;
      case 'PONG': {
        const now = Math.trunc(Date.now()) >>> 0;
        const rtt = Math.max(0, Math.min(2000, now - msg.sentMs));
        this.pingMs = rtt;
        const suggested = Math.ceil(rtt / 33) + 1;
        this.inputDelay = Math.max(DEFAULT_INPUT_DELAY, Math.min(MAX_INPUT_DELAY, suggested));
        break;
      }
      case 'FORFEIT':
        this.forfeitedByDisconnect = true;
        break;
      default:
        break;
    }
  }

  private verifyHash(frame: number): void {
    const localH = this.localHashes.get(frame);
    const remoteH = this.remoteHashes.get(frame);
    if (localH === undefined || remoteH === undefined) return;
    if (localH !== remoteH) {
      this.desynced = true;
      console.error('[Stickman Duel] Desync detected!', {
        frame,
        localHash: localH.toString(16),
        remoteHash: remoteH.toString(16),
        state: this.state,
      });
      this.onDesync?.(frame, localH, remoteH);
    }
    this.localHashes.delete(frame);
    this.remoteHashes.delete(frame);
  }

  private send(msg: NetMessage): void {
    this.transport.send(encodeMessage(msg));
  }
}

/**
 * TODO(rollback): RollbackSession stub implementing the exact same NetSession interface.
 * See docs/NETCODE.md for the full ring-buffer snapshot + input prediction + re-simulation plan.
 */
export class RollbackSession implements NetSession {
  private readonly fallback: InputDelaySession;

  constructor(transport: Transport) {
    this.fallback = new InputDelaySession(transport);
  }

  public start(roomId: string, isHost: boolean, seed: number, stageId: StageId): Promise<void> {
    return this.fallback.start(roomId, isHost, seed, stageId);
  }

  public tick(localInput: InputBitfield, nowMs: number): GameState | null {
    return this.fallback.tick(localInput, nowMs);
  }

  public getState(): GameState | null {
    return this.fallback.getState();
  }

  public getStatus(): NetSessionStatus {
    return this.fallback.getStatus();
  }

  public dispose(): void {
    this.fallback.dispose();
  }
}
