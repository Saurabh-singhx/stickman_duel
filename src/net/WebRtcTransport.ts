import type { DataConnection, Peer } from 'peerjs';
import type { Transport } from './Transport';

interface LocalChannelPacket {
  readonly kind: 'join' | 'ack' | 'data' | 'leave';
  readonly sender: string;
  readonly payload?: number[];
}

/**
 * WebRTC Transport implementation backed by PeerJS (public signaling),
 * with a zero-latency BroadcastChannel bridge when both tabs share the same browser origin.
 * Dynamically imports PeerJS only on connect() so offline modes make zero network requests.
 */
export class WebRtcTransport implements Transport {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private bc: BroadcastChannel | null = null;
  private readonly senderId = `p_${Math.random().toString(36).slice(2, 10)}`;
  private messageCb: ((bytes: Uint8Array) => void) | null = null;
  private joinedCb: (() => void) | null = null;
  private leftCb: (() => void) | null = null;
  private peerConnected = false;

  /** Connects to or hosts a room over PeerJS WebRTC (+ same-origin BroadcastChannel fast path). */
  public async connect(roomId: string, isHost: boolean): Promise<void> {
    this.close();

    // 1. Same-origin BroadcastChannel fast path (enables instant two-tab local testing)
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(`duskblade-room-${roomId}`);
      this.bc = bc;
      bc.onmessage = (ev: MessageEvent<LocalChannelPacket>) => {
        const msg = ev.data;
        if (!msg || msg.sender === this.senderId) return;
        if (msg.kind === 'join') {
          bc.postMessage({ kind: 'ack', sender: this.senderId } satisfies LocalChannelPacket);
          this.markJoined();
        } else if (msg.kind === 'ack') {
          this.markJoined();
        } else if (msg.kind === 'data' && msg.payload) {
          this.messageCb?.(new Uint8Array(msg.payload));
        } else if (msg.kind === 'leave') {
          this.peerConnected = false;
          this.leftCb?.();
        }
      };
      bc.postMessage({ kind: 'join', sender: this.senderId } satisfies LocalChannelPacket);
    }

    // 2. PeerJS WebRTC connection for cross-device online play
    try {
      const mod = await import('peerjs');
      const PeerCtor = mod.Peer;
      const peerId = isHost ? `duskblade-${roomId}` : `duskblade-${roomId}-guest-${this.senderId}`;
      const peer = new PeerCtor(peerId);
      this.peer = peer;

      peer.on('open', () => {
        if (!isHost) {
          const conn = peer.connect(`duskblade-${roomId}`, { reliable: true });
          this.attachConnection(conn);
        }
      });

      peer.on('connection', (incoming) => {
        this.attachConnection(incoming);
      });

      peer.on('error', () => {
        // Silently tolerate signaling failures when running locally via BroadcastChannel
      });
    } catch {
      // PeerJS unavailable or offline; BroadcastChannel remains active for local tabs
    }
  }

  /** Sends binary bytes over active WebRTC DataConnection or local BroadcastChannel. */
  public send(bytes: Uint8Array): void {
    if (this.conn && this.conn.open) {
      this.conn.send(bytes);
      return;
    }
    if (this.bc) {
      const pkt: LocalChannelPacket = {
        kind: 'data',
        sender: this.senderId,
        payload: Array.from(bytes),
      };
      this.bc.postMessage(pkt);
    }
  }

  public onMessage(cb: (bytes: Uint8Array) => void): void {
    this.messageCb = cb;
  }

  public onPeerJoined(cb: () => void): void {
    this.joinedCb = cb;
  }

  public onPeerLeft(cb: () => void): void {
    this.leftCb = cb;
  }

  public close(): void {
    if (this.bc) {
      try {
        this.bc.postMessage({ kind: 'leave', sender: this.senderId } satisfies LocalChannelPacket);
      } catch {
        // ignore
      }
      this.bc.close();
      this.bc = null;
    }
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.peerConnected = false;
  }

  private attachConnection(conn: DataConnection): void {
    this.conn = conn;
    conn.on('open', () => this.markJoined());
    conn.on('data', (data) => {
      if (data instanceof Uint8Array) {
        this.messageCb?.(data);
      } else if (data instanceof ArrayBuffer) {
        this.messageCb?.(new Uint8Array(data));
      } else if (Array.isArray(data)) {
        this.messageCb?.(new Uint8Array(data as number[]));
      }
    });
    conn.on('close', () => {
      this.peerConnected = false;
      this.leftCb?.();
    });
  }

  private markJoined(): void {
    if (this.peerConnected) return;
    this.peerConnected = true;
    this.joinedCb?.();
  }
}
