import type { DataConnection, Peer } from 'peerjs';
import type { Transport } from './Transport';

export type RoomStatus = 'connecting' | 'waiting' | 'connected' | 'error';

export function connectionError(type: string): string {
  switch (type) {
    case 'peer-unavailable': return 'Room not found. Ask your friend to keep their room open, then check the code and retry.';
    case 'unavailable-id': return 'This room code is already in use. Go back and host a new room.';
    case 'browser-incompatible': return 'This browser cannot connect online. Try a recent Chrome, Firefox or Safari browser.';
    case 'webrtc': return 'The direct connection failed. Try another network; some networks require a relay server.';
    default: return 'Cannot reach the connection service. Check your internet connection and retry.';
  }
}

/** One WebRTC connection per room. Registration completes before a host can share. */
export class WebRtcTransport implements Transport {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private messageCb: ((bytes: Uint8Array) => void) | null = null;
  private joinedCb: (() => void) | null = null;
  private leftCb: (() => void) | null = null;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private cancel: (() => void) | null = null;

  constructor(private readonly status: (status: RoomStatus, message: string) => void = () => {}) {}

  public async connect(roomId: string, isHost: boolean): Promise<void> {
    this.close();
    const generation = this.generation;
    this.status('connecting', isHost ? 'Creating your room…' : 'Finding your friend’s room…');
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const ready = () => { if (!settled) { settled = true; resolve(); } };
      this.cancel = () => { if (!settled) { settled = true; reject(new Error('Connection cancelled.')); } };
      const fail = (message: string) => {
        if (generation !== this.generation) return;
        if (!settled) { settled = true; reject(new Error(message)); }
        this.close();
        this.status('error', message);
      };
      this.timer = setTimeout(() => fail('Connection timed out. Keep the host’s room open and retry. If it persists, try another network.'), 20000);
      void import('peerjs').then(({ Peer: PeerCtor }) => {
        if (generation !== this.generation) return;
        const peer = isHost ? new PeerCtor(`duskblade-${roomId}`) : new PeerCtor();
        this.peer = peer;
        const attach = (conn: DataConnection) => {
          if (generation !== this.generation) { conn.close(); return; }
          if (this.conn) {
            conn.on('open', () => { conn.send({ roomError: 'full' }); setTimeout(() => conn.close(), 250); });
            return;
          }
          this.conn = conn;
          conn.on('open', () => {
            if (generation !== this.generation) return;
            // The host accepts the guest explicitly before either starts the session.
            if (isHost) {
              conn.send({ roomAccepted: true });
              ready();
              this.status('connected', 'Opponent connected. Starting duel…');
              this.joinedCb?.();
            }
          });
          let accepted = isHost;
          conn.on('data', (data) => {
            if (generation !== this.generation) return;
            if (data && typeof data === 'object' && 'roomError' in data) {
              fail('This room already has two players. Ask your friend to create a new room.');
            } else if (!isHost && data && typeof data === 'object' && 'roomAccepted' in data && !accepted) {
              accepted = true;
              clearTimeout(this.timer);
              ready();
              this.status('connected', 'Connected. Starting duel…');
              this.joinedCb?.();
            } else if (accepted && data instanceof Uint8Array) this.messageCb?.(data);
            else if (accepted && data instanceof ArrayBuffer) this.messageCb?.(new Uint8Array(data));
          });
          conn.on('error', () => fail(connectionError('webrtc')));
          conn.on('close', () => {
            if (generation !== this.generation) return;
            this.leftCb?.();
            fail('Your opponent disconnected. Go back to host or join a new room.');
          });
        };
        peer.on('open', () => {
          if (generation !== this.generation) return;
          if (isHost) {
            clearTimeout(this.timer);
            ready();
            this.status('waiting', 'Room ready. Share the code or invite link and keep this tab open.');
          } else attach(peer.connect(`duskblade-${roomId}`, { reliable: true }));
        });
        peer.on('connection', (conn) => { if (isHost) attach(conn); else conn.close(); });
        peer.on('error', (error) => fail(connectionError(error.type)));
        peer.on('disconnected', () => {
          if (!this.conn?.open) fail(connectionError('network'));
        });
      }).catch(() => fail(connectionError('network')));
    });
  }

  public send(bytes: Uint8Array): void { if (this.conn?.open) this.conn.send(bytes); }
  public onMessage(cb: (bytes: Uint8Array) => void): void { this.messageCb = cb; }
  public onPeerJoined(cb: () => void): void { this.joinedCb = cb; }
  public onPeerLeft(cb: () => void): void { this.leftCb = cb; }
  public close(): void {
    this.generation++;
    clearTimeout(this.timer);
    this.cancel?.();
    this.cancel = null;
    const conn = this.conn;
    const peer = this.peer;
    this.conn = null;
    this.peer = null;
    conn?.close();
    peer?.destroy();
  }
}
