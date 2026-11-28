import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class Emitter {
    listeners = new Map<string, ((...args: unknown[]) => void)[]>();
    on(event: string, cb: (...args: unknown[]) => void) { this.listeners.set(event, [...(this.listeners.get(event) ?? []), cb]); }
    emit(event: string, ...args: unknown[]) { this.listeners.get(event)?.forEach(cb => cb(...args)); }
  }
  class Connection extends Emitter {
    open = false;
    send = vi.fn();
    close = vi.fn();
  }
  const peers: Peer[] = [];
  class Peer extends Emitter {
    conn = new Connection();
    connect = vi.fn(() => this.conn);
    destroy = vi.fn();
    constructor(public id?: string) { super(); peers.push(this); }
  }
  return { Peer, Connection, peers };
});
vi.mock('peerjs', () => ({ Peer: mocks.Peer }));
import { WebRtcTransport } from '../../src/net/WebRtcTransport';

const flush = async () => { await vi.dynamicImportSettled(); };
afterEach(() => { vi.useRealTimers(); mocks.peers.length = 0; });

describe('room connection lifecycle', () => {
  it('only advertises a host after signaling registration and rejects an extra guest', async () => {
    const status = vi.fn();
    const joined = vi.fn();
    const transport = new WebRtcTransport(status);
    transport.onPeerJoined(joined);
    const pending = transport.connect('ABC234', true);
    await flush();
    expect(status).not.toHaveBeenCalledWith('waiting', expect.anything());
    const peer = mocks.peers[0]!;
    peer.emit('open');
    await pending;
    expect(status).toHaveBeenLastCalledWith('waiting', expect.any(String));
    const first = new mocks.Connection();
    peer.emit('connection', first);
    first.emit('open');
    const extra = new mocks.Connection();
    peer.emit('connection', extra);
    extra.emit('open');
    expect(extra.send).toHaveBeenCalledWith({ roomError: 'full' });
    expect(joined).toHaveBeenCalledTimes(1);
    transport.close();
  });
  it('requires host acceptance before starting the guest', async () => {
    const transport = new WebRtcTransport();
    const joined = vi.fn();
    transport.onPeerJoined(joined);
    const pending = transport.connect('ABC234', false);
    await flush();
    const peer = mocks.peers[0]!;
    peer.emit('open');
    peer.conn.emit('open');
    expect(joined).not.toHaveBeenCalled();
    peer.conn.emit('data', { roomAccepted: true });
    await pending;
    expect(joined).toHaveBeenCalledTimes(1);
    transport.close();
  });
  it('reports unavailable rooms and releases resources', async () => {
    const status = vi.fn();
    const transport = new WebRtcTransport(status);
    const pending = transport.connect('ABC234', false);
    const assertion = expect(pending).rejects.toThrow('Room not found');
    await flush();
    mocks.peers[0]!.emit('error', { type: 'peer-unavailable' });
    await assertion;
    expect(status).toHaveBeenLastCalledWith('error', expect.stringContaining('Room not found'));
    expect(mocks.peers[0]!.destroy).toHaveBeenCalled();
  });
  it('cancels a pending import without creating an abandoned room', async () => {
    const transport = new WebRtcTransport();
    const pending = transport.connect('ABC234', true);
    const assertion = expect(pending).rejects.toThrow('cancelled');
    transport.close();
    await assertion;
    await flush();
    expect(mocks.peers).toHaveLength(0);
  });
  it('times out even if the data channel opens without host acceptance', async () => {
    vi.useFakeTimers();
    const transport = new WebRtcTransport();
    const pending = transport.connect('ABC234', false);
    const assertion = expect(pending).rejects.toThrow('timed out');
    await flush();
    mocks.peers[0]!.emit('open');
    mocks.peers[0]!.conn.emit('open');
    vi.advanceTimersByTime(20000);
    await assertion;
  });
});
