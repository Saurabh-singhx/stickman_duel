import { describe, expect, it } from 'vitest';
import { BotBrain } from '../../src/ai/BotBrain';
import { InputDelaySession } from '../../src/net/InputDelaySession';
import { decodeMessage, encodeMessage } from '../../src/net/Protocol';
import { generateRoomCode, normalizeRoomCode } from '../../src/net/Rooms';
import type { Transport } from '../../src/net/Transport';
import { nextU32 } from '../../src/sim/Rng';
import { hashState } from '../../src/sim/Snapshot';

interface QueuedPacket {
  deliverAtTick: number;
  bytes: Uint8Array;
  target: 'A' | 'B';
}

/**
 * Deterministic in-process loopback transport with configurable latency and packet loss.
 */
class LoopbackNetwork {
  private queue: QueuedPacket[] = [];
  private rng = 0xabcdef01;
  private cbA: ((b: Uint8Array) => void) | null = null;
  private cbB: ((b: Uint8Array) => void) | null = null;
  private joinA: (() => void) | null = null;
  private joinB: (() => void) | null = null;
  private currentTick = 0;

  constructor(
    private readonly dropRatePercent: number,
    private readonly minDelayTicks: number,
    private readonly maxDelayTicks: number,
  ) {}

  public createEndpoint(side: 'A' | 'B'): Transport {
    return {
      connect: async () => {
        if (side === 'B') {
          this.joinA?.();
          this.joinB?.();
        }
      },
      send: (bytes: Uint8Array) => {
        const rDrop = nextU32(this.rng);
        this.rng = rDrop.nextState;
        // Never drop handshake/SEED packets in test setup; drop INPUT packets at configured rate
        const isHandshake = bytes[0] === 1 || bytes[0] === 2 || bytes[0] === 3;
        if (!isHandshake && rDrop.value % 100 < this.dropRatePercent) {
          return;
        }
        const rLat = nextU32(this.rng);
        this.rng = rLat.nextState;
        const span = Math.max(1, this.maxDelayTicks - this.minDelayTicks + 1);
        const delay = this.minDelayTicks + (rLat.value % span);
        this.queue.push({
          deliverAtTick: this.currentTick + delay,
          bytes: new Uint8Array(bytes),
          target: side === 'A' ? 'B' : 'A',
        });
      },
      onMessage: (cb) => {
        if (side === 'A') this.cbA = cb;
        else this.cbB = cb;
      },
      onPeerJoined: (cb) => {
        if (side === 'A') this.joinA = cb;
        else this.joinB = cb;
      },
      onPeerLeft: () => {},
      close: () => {},
    };
  }

  public pump(tick: number): void {
    this.currentTick = tick;
    const due = this.queue.filter((p) => p.deliverAtTick <= tick);
    this.queue = this.queue.filter((p) => p.deliverAtTick > tick);
    for (const pkt of due) {
      if (pkt.target === 'A') this.cbA?.(pkt.bytes);
      else this.cbB?.(pkt.bytes);
    }
  }
}

describe('Online Input-Delay Netcode (Local Loopback)', () => {
  it('encodes and decodes binary protocol packets losslessly', () => {
    const packet = encodeMessage({
      type: 'INPUT',
      frame: 120,
      entries: [
        { frame: 120, bits: 0x15 },
        { frame: 119, bits: 0x04 },
      ],
    });
    const decoded = decodeMessage(packet);
    expect(decoded).toEqual({
      type: 'INPUT',
      frame: 120,
      entries: [
        { frame: 120, bits: 0x15 },
        { frame: 119, bits: 0x04 },
      ],
    });

    const code = generateRoomCode(42);
    expect(code.length).toBe(6);
    expect(normalizeRoomCode(` ${code.toLowerCase()} `)).toBe(code);
  });

  it('finishes identical fights with matching hashes under simulated latency and 15% packet loss', async () => {
    const net = new LoopbackNetwork(15, 1, 3);
    const host = new InputDelaySession(net.createEndpoint('A'));
    const guest = new InputDelaySession(net.createEndpoint('B'));

    await host.start('ABC234', true, 7777, 'beige_plain');
    await guest.start('ABC234', false, 0, 'beige_plain');

    const botA = new BotBrain(0, 'normal', 'aggressive', 111);
    const botB = new BotBrain(1, 'normal', 'counter', 222);

    // Run 700 ticks with latency + packet loss
    for (let t = 0; t < 700; t += 1) {
      net.pump(t);
      const stA = host.getState();
      const stB = guest.getState();
      const inA = stA ? botA.think(stA) : 0;
      const inB = stB ? botB.think(stB) : 0;
      host.tick(inA, t * 16);
      guest.tick(inB, t * 16);
    }

    // Drain remaining packets so both sides converge to the same frame
    for (let t = 700; t < 740; t += 1) {
      net.pump(t);
      host.tick(0, t * 16);
      guest.tick(0, t * 16);
    }

    const finalA = host.getState();
    const finalB = guest.getState();
    expect(finalA).not.toBeNull();
    expect(finalB).not.toBeNull();
    expect(finalA!.frame).toBeGreaterThan(250);
    expect(host.getStatus().desynced).toBe(false);
    expect(guest.getStatus().desynced).toBe(false);

    // Advance whichever side is slightly behind by a few ticks so both sit on the exact same frame
    let extra = 740;
    while (host.getState()!.frame !== guest.getState()!.frame && extra < 780) {
      net.pump(extra);
      if (host.getState()!.frame < guest.getState()!.frame) host.tick(0, extra * 16);
      else guest.tick(0, extra * 16);
      extra += 1;
    }

    expect(host.getState()!.frame).toBe(guest.getState()!.frame);
    expect(hashState(host.getState()!)).toBe(hashState(guest.getState()!));
  });
});
