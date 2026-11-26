/**
 * Vendor-agnostic byte transport interface for Online 1v1 play.
 * Implemented by WebRtcTransport (PeerJS) and LoopbackTransport (tests).
 * Can be swapped for a Cloudflare Durable Objects relay without touching Online.ts.
 */
export interface Transport {
  /** Connects to or hosts a room by its 6-character code. */
  connect(roomId: string, isHost: boolean): Promise<void>;
  /** Sends a compact binary packet to the remote peer. */
  send(bytes: Uint8Array): void;
  /** Registers a listener for incoming binary packets. */
  onMessage(cb: (bytes: Uint8Array) => void): void;
  /** Registers a listener fired when the remote peer connects. */
  onPeerJoined(cb: () => void): void;
  /** Registers a listener fired when the remote peer disconnects. */
  onPeerLeft(cb: () => void): void;
  /** Closes the connection and cleans up all resources. */
  close(): void;
}
