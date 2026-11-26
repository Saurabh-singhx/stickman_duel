# Stickman Duel Netcode Architecture

## 1. Determinism & Checksum Verification

Because `Sim.step(state, [inputP1, inputP2])` is a pure integer fixed-point function with an internal seeded PRNG (`state.rngState`), online peers exchange **only 16-bit input bitfields**—never positions or physics state.

- Every `60` simulated frames, each peer computes a 32-bit FNV-1a checksum via `hashState(state)` (`src/sim/Snapshot.ts`) and sends a `HASH` packet.
- On checksum mismatch, `InputDelaySession` logs both hashes and the full `GameState` to the console, flags `desynced = true`, and ends the match gracefully with a visible banner.

## 2. Compact Binary Protocol (`src/net/Protocol.ts`)

| Packet | Tag | Size | Payload |
| :--- | :---: | :---: | :--- |
| `HELLO` | `1` | 3 B | `protocolVersion`, `isHost` |
| `READY` | `2` | 1 B | Guest confirms seed received |
| `SEED` | `3` | 6 B | `uint32 seed`, `uint8 stageIndex` |
| `INPUT` | `4` | 6 + 6N B | `uint32 latestFrame`, `uint8 count (<=4)`, redundant `[uint32 frame, uint16 bits]` entries |
| `HASH` | `5` | 9 B | `uint32 frame`, `uint32 fnv1aHash` |
| `PING` / `PONG` | `6` / `7` | 5 B | `uint32 sentMs` |
| `FORFEIT` | `8` | 1 B | Clean leave / forfeit signal |

Sending the last **4 frames redundantly** inside every `INPUT` packet allows the session to absorb bursts of packet loss without stalling.

## 3. Adaptive Input-Delay Lockstep (`src/net/InputDelaySession.ts`)

1. Host generates a 6-character room code (`src/net/Rooms.ts`) and picks the match seed.
2. Both peers pre-seed frames `0 .. inputDelay - 1` with neutral input `0`.
3. On each 60 Hz tick, each peer queues its local input for `state.frame + inputDelay` and sends a redundant `INPUT` packet.
4. `Sim.step` advances **only when both local and remote inputs for `state.frame` have arrived**.
5. Every `1000ms`, peers exchange `PING`/`PONG` to measure RTT and adapt `inputDelay` between `3` (default) and `6` (cap).
6. If the remote peer disconnects for `5` seconds (`5000ms`), the match concludes as a forfeit.

## 4. Transport Abstraction (`src/net/Transport.ts`)

`OnlineMode` and `InputDelaySession` depend strictly on the `Transport` interface (`connect`, `send`, `onMessage`, `onPeerJoined`, `onPeerLeft`, `close`). Replacing `WebRtcTransport` (PeerJS) with a **Cloudflare Durable Objects WebSocket relay** requires only adding a new `RelayTransport implements Transport` class.

## 5. Rollback Netcode Upgrade Plan (Phase 5+)

The architecture is already rollback-ready. `RollbackSession` in `src/net/InputDelaySession.ts` implements the exact `NetSession` interface and can be upgraded in place:

1. **Snapshot Ring Buffer:** Allocate a 16-frame ring buffer storing `{ frame, snapshot: saveState(state), localInput, predictedRemoteInput }` via `src/sim/Snapshot.ts`.
2. **Input Prediction:** When remote input for frame `F` has not arrived yet, predict it as `lastConfirmedRemoteInput` (repeat-last-input heuristic) and step `Sim.step` immediately with `0–1` frames of local delay.
3. **Misprediction Detection:** When the true remote input for frame `F` arrives via `INPUT` packet, compare it against `predictedRemoteInput`.
4. **Rollback & Fast-Forward Re-Simulation:** On mismatch:
   - Restore `state = loadState(ringBuffer[F].snapshot)`.
   - Re-run `Sim.step` from frame `F` up to `currentFrame` using confirmed inputs (suppressing duplicate SFX/FX events for already-rendered frames or reconciling cleanly).
5. **Desync Check:** Keep the 60-frame `hashState()` check on confirmed frames (`confirmedFrame % 60 === 0`) to guarantee rollback convergence.
