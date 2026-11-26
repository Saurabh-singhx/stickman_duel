import type { InputBitfield } from '../sim/State';

export const PROTOCOL_VERSION = 1;

/** Compact binary packet types exchanged between peers. */
export type NetMessage =
  | { readonly type: 'HELLO'; readonly version: number; readonly isHost: boolean }
  | { readonly type: 'READY' }
  | { readonly type: 'SEED'; readonly seed: number; readonly stageIndex: number }
  | {
      readonly type: 'INPUT';
      readonly frame: number;
      /** Redundant window of [frame, frame-1, ...] inputs to survive packet loss. */
      readonly entries: readonly { readonly frame: number; readonly bits: InputBitfield }[];
    }
  | { readonly type: 'HASH'; readonly frame: number; readonly hash: number }
  | { readonly type: 'PING'; readonly sentMs: number }
  | { readonly type: 'PONG'; readonly sentMs: number }
  | { readonly type: 'FORFEIT' };

const MSG_HELLO = 1;
const MSG_READY = 2;
const MSG_SEED = 3;
const MSG_INPUT = 4;
const MSG_HASH = 5;
const MSG_PING = 6;
const MSG_PONG = 7;
const MSG_FORFEIT = 8;

/**
 * Packs a NetMessage into a compact Uint8Array binary packet.
 */
export function encodeMessage(msg: NetMessage): Uint8Array {
  switch (msg.type) {
    case 'HELLO': {
      const buf = new Uint8Array(3);
      buf[0] = MSG_HELLO;
      buf[1] = msg.version & 0xff;
      buf[2] = msg.isHost ? 1 : 0;
      return buf;
    }
    case 'READY':
      return new Uint8Array([MSG_READY]);
    case 'SEED': {
      const buf = new ArrayBuffer(6);
      const view = new DataView(buf);
      view.setUint8(0, MSG_SEED);
      view.setUint32(1, msg.seed >>> 0, true);
      view.setUint8(5, msg.stageIndex & 0xff);
      return new Uint8Array(buf);
    }
    case 'INPUT': {
      const count = Math.min(8, msg.entries.length);
      const buf = new ArrayBuffer(6 + count * 6);
      const view = new DataView(buf);
      view.setUint8(0, MSG_INPUT);
      view.setUint32(1, msg.frame >>> 0, true);
      view.setUint8(5, count);
      let off = 6;
      for (let i = 0; i < count; i += 1) {
        const e = msg.entries[i]!;
        view.setUint32(off, e.frame >>> 0, true);
        view.setUint16(off + 4, e.bits & 0xffff, true);
        off += 6;
      }
      return new Uint8Array(buf);
    }
    case 'HASH': {
      const buf = new ArrayBuffer(9);
      const view = new DataView(buf);
      view.setUint8(0, MSG_HASH);
      view.setUint32(1, msg.frame >>> 0, true);
      view.setUint32(5, msg.hash >>> 0, true);
      return new Uint8Array(buf);
    }
    case 'PING':
    case 'PONG': {
      const buf = new ArrayBuffer(5);
      const view = new DataView(buf);
      view.setUint8(0, msg.type === 'PING' ? MSG_PING : MSG_PONG);
      view.setUint32(1, msg.sentMs >>> 0, true);
      return new Uint8Array(buf);
    }
    case 'FORFEIT':
      return new Uint8Array([MSG_FORFEIT]);
  }
}

/**
 * Unpacks a Uint8Array binary packet into a typed NetMessage.
 */
export function decodeMessage(bytes: Uint8Array): NetMessage | null {
  if (bytes.byteLength < 1) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = view.getUint8(0);

  switch (tag) {
    case MSG_HELLO:
      if (bytes.byteLength < 3) return null;
      return { type: 'HELLO', version: view.getUint8(1), isHost: view.getUint8(2) === 1 };
    case MSG_READY:
      return { type: 'READY' };
    case MSG_SEED:
      if (bytes.byteLength < 6) return null;
      return { type: 'SEED', seed: view.getUint32(1, true), stageIndex: view.getUint8(5) };
    case MSG_INPUT: {
      if (bytes.byteLength < 6) return null;
      const frame = view.getUint32(1, true);
      const count = view.getUint8(5);
      if (bytes.byteLength < 6 + count * 6) return null;
      const entries: { frame: number; bits: InputBitfield }[] = [];
      let off = 6;
      for (let i = 0; i < count; i += 1) {
        entries.push({
          frame: view.getUint32(off, true),
          bits: view.getUint16(off + 4, true),
        });
        off += 6;
      }
      return { type: 'INPUT', frame, entries };
    }
    case MSG_HASH:
      if (bytes.byteLength < 9) return null;
      return { type: 'HASH', frame: view.getUint32(1, true), hash: view.getUint32(5, true) };
    case MSG_PING:
      if (bytes.byteLength < 5) return null;
      return { type: 'PING', sentMs: view.getUint32(1, true) };
    case MSG_PONG:
      if (bytes.byteLength < 5) return null;
      return { type: 'PONG', sentMs: view.getUint32(1, true) };
    case MSG_FORFEIT:
      return { type: 'FORFEIT' };
    default:
      return null;
  }
}
