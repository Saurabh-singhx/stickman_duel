# Stickman Duel Architecture

## Core Principle: Pure Deterministic Simulation

All gameplay rules execute inside `src/sim/` as a single pure function:

```ts
nextState = Sim.step(state, [inputP1, inputP2])
```

- **Strict import boundary (enforced by ESLint):** `src/sim/**` may only import from `src/sim/**` and `src/data/**`. DOM globals, `Date`, `performance`, `Math.random`, PixiJS, and WebRTC are forbidden inside `src/sim/`.
- **Integer fixed-point math:** All positions and velocities use 1/1000 logical pixel units (`FP_SCALE = 1000`).
- **Plain serializable state:** `GameState` contains only plain JSON-serializable primitives, arrays, and records—no class instances or callbacks.

## Data-Flow Diagram

```text
  Keyboard / Gamepad / Touch       BotBrain (AI)      ReplayPlayer / Ghost      WebRtcTransport
              \                          |                     |                       |
               +-------------------------+---------------------+-----------------------+
                                         v
                                 InputBitfield [P1, P2]
                                         |
                                         v
                    +----------------------------------------+
                    |       src/sim/Sim.step (60 Hz)         |
                    |  Fighter + Collision + Hazards + Rng   |
                    +-------------------+--------------------+
                                        |
                    +-------------------+-------------------+
                    | GameState (prev & curr)               | SimEvent[] (typed union)
                    v                                       v
       +-------------------------+             +-------------------------+
       |  src/render/Renderer    |             |  src/audio/Sfx + Music  |
       |  - Interpolation (alpha)|             |  - Procedural Web Audio |
       |  - 2-Bone IK Stick View |             |  - Compressor/Limiter   |
       |  - Spring-Chain Cape    |             |  - Convolution Reverb   |
       |  - Pooled FX & CameraFx |             +-------------------------+
       +-------------------------+
                    |
                    v
       +-------------------------+
       |   src/ui/ + Hud + Debug |
       +-------------------------+
```

## Module Map

| Directory | Responsibility |
| :--- | :--- |
| `src/sim/` | Pure deterministic 60 Hz combat engine, fixed-point helpers, seeded PRNG, collision, coffin hazards, and state snapshot/checksum (`saveState`, `loadState`, `hashState`). |
| `src/data/` | Typed read-only definitions for moves, characters, enemies/waves/boss rush, stages, finishers, and balance constants. |
| `src/input/` | Compact bitfield encoding, rebindable keyboard, Gamepad API poller, mobile touch overlay, input mapper, and training ring buffer. |
| `src/ai/` | Reaction-delayed `BotBrain` producing standard `InputBitfield`s plus 4 behavior profiles (`Aggressive`, `Defensive`, `CounterPuncher`, `Boss`) and 4 difficulty tiers. |
| `src/render/` | PixiJS v8 procedural renderer (WebGL with Canvas fallback), 2-bone IK stick figures, Verlet cape, pooled slashes/sparks/shards/dust/cracks, camera FX, and HUD. |
| `src/audio/` | Procedural Web Audio mixer (SFX/Music/Ambience buses, compressor, limiter, convolution reverb, ducking, pause low-pass), event-driven SFX recipes, and adaptive generative stage music. |
| `src/modes/` | Orchestration for Local 2P / Training, Vs Bot, 6-stage Boss Rush, Endless Waves, Ghost Duel / Replay playback, and Online 1v1. |
| `src/net/` | Vendor-agnostic `Transport` interface, PeerJS `WebRtcTransport`, binary `Protocol`, 6-char `Rooms`, `InputDelaySession`, and `RollbackSession` stub. |
| `src/replay/` | RLE `ReplayRecorder`, base64 share code encoder/decoder, deterministic `ReplayPlayer`, and 50-slot `GhostStore` with remote provider hook. |
| `src/systems/` | Versioned try/catch-safe `SaveSystem`, `Settings` (with accessibility & feature flags), `Progress` (including UTC Daily Challenge), and lifetime `Stats`. |
| `src/ui/` | Main menu (single PLAY CTA + secondary modes), pause menu, settings modal, post-match results screen, and toast notifications. |
| `src/debug/` | `F1` hitbox/frame-data/checksum overlay and `F2`/`F3` single-frame stepping controller. |
