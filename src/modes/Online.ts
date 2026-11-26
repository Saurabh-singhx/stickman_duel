import { BALANCE } from '../data/balance';
import type { StageId } from '../data/stages';
import type { InputMapper } from '../input/InputMapper';
import { InputDelaySession, type NetSession } from '../net/InputDelaySession';
import type { Transport } from '../net/Transport';
import type { ReplayRecording } from '../replay/Recorder';
import { createInitialState } from '../sim/Sim';
import type { GameState } from '../sim/State';
import type { GameMode } from './Local2P';

/**
 * Online 1v1 mode over InputDelaySession.
 * Depends ONLY on the vendor-agnostic Transport interface (zero PeerJS imports).
 */
export class OnlineMode implements GameMode {
  public readonly id = 'online';
  public readonly title: string;
  public readonly p2Label = 'Online Challenger';

  private readonly session: NetSession;
  private readonly roomId: string;
  private readonly isHost: boolean;
  private prevState: GameState;
  private state: GameState;
  private desyncMessage: string | null = null;

  constructor(options: {
    transport: Transport;
    roomId: string;
    isHost: boolean;
    seed: number;
    stageId: StageId;
  }) {
    this.roomId = options.roomId;
    this.isHost = options.isHost;
    this.title = `Online Room ${options.roomId}`;

    this.state = createInitialState({
      seed: options.seed,
      stageId: options.stageId,
      p1Char: 'hero',
      p2Char: 'swordsman',
      roundsToWin: BALANCE.ROUNDS_TO_WIN,
      roundTimerFrames: BALANCE.DEFAULT_ROUND_TIMER_FRAMES,
      enableHazards: false,
      parryAssist: false,
      infiniteGuardP2: false,
      trainingMode: false,
    });
    this.prevState = this.state;

    this.session = new InputDelaySession(options.transport, (frame, lh, rh) => {
      this.desyncMessage = `DESYNC DETECTED @ frame ${frame} (${lh.toString(16)} vs ${rh.toString(16)})`;
    });

    void this.session.start(options.roomId, options.isHost, options.seed, options.stageId);
  }

  public getState(): GameState {
    return this.state;
  }

  public getPrevState(): GameState {
    return this.prevState;
  }

  public stepFrame(inputs: InputMapper, nowMs: number): GameState {
    const localInput = inputs.sample(0);
    const next = this.session.tick(localInput, nowMs);
    if (next && next !== this.state) {
      this.prevState = this.state;
      this.state = next;
      return this.state;
    }
    // Clear transient events while waiting for peer or lockstep stall so SFX never loop
    if (this.state.events.length > 0) {
      this.state = { ...this.state, events: [] };
    }
    return this.state;
  }

  public getRecording(): ReplayRecording | null {
    return null;
  }

  public getNetBadge(): string | null {
    const st = this.session.getStatus();
    if (st.desynced) return 'DESYNC';
    if (!st.connected) return `ROOM ${this.roomId} • WAITING`;
    return `PING ${st.pingMs}ms • DELAY ${st.inputDelay}f`;
  }

  public getSubStatus(): string | null {
    if (this.desyncMessage) return this.desyncMessage;
    const st = this.session.getStatus();
    if (st.forfeitedByDisconnect) return 'Opponent disconnected — Match Forfeited';
    if (!st.started) {
      return this.isHost
        ? `Hosting Room ${this.roomId} — Share invite link or code`
        : `Joining Room ${this.roomId}...`;
    }
    return null;
  }

  public dispose(): void {
    this.session.dispose();
  }
}
