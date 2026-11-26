# Engineering & Design Decisions

Every non-obvious decision made during the autonomous build of Stickman Duel is documented here.

## 1. Pinned Package Versions & Node 18 Compatibility
- **Decision:** Pinned `typescript@6.0.3`, `typescript-eslint@8.74.0`, `eslint@9.39.5`, `vite@6.4.6`, `vitest@3.2.7`, `pixi.js@8.23.0`, `peerjs@1.5.5`, `prettier@3.10.1`, and `@playwright/test@1.52.0`.
- **Why:** `typescript-eslint@8.74.0` requires `typescript >=4.8.4 <6.1.0` (so TS 6.0.3 satisfies the peer range with zero ERESOLVE conflicts), and the build environment runs Node 18.20.4 (Vite 6, Vitest 3, ESLint 9, PeerJS 1.5.5, and Playwright 1.52 all support Node 18 cleanly without `--force` or `--legacy-peer-deps`).

## 2. Integer Fixed-Point Scale (`1000 = 1px`)
- **Decision:** All sim coordinates, velocities, hitboxes, and pushboxes are truncated integers scaled by `1000` (`src/sim/Fixed.ts`).
- **Why:** Eliminates cross-browser IEEE-754 floating-point drift across Chrome, Firefox, and Safari, guaranteeing identical `hashState()` checksums over 18,000+ frames for replays, ghost duels, and lockstep/rollback netcode.

## 3. Parry Window vs. Block Hold Ergonomics
- **Decision:** Pressing `BLOCK` from neutral opens `parry_active` for **exactly 8 frames** (12 with Parry Assist). Holding `BLOCK` past frame 8 transitions seamlessly into `block` (with a 20-frame parry cooldown). Releasing `BLOCK` early without parrying a hit triggers 20 frames of `parry_whiff` recovery.
- **Why:** Players can naturally hold `L` to guard or tap `L` right before impact to parry, while spamming parry taps is strictly punished by the 20-frame whiff recovery.

## 4. Input Buffer Inside `FighterState`
- **Decision:** The 6-frame input buffer (`bufferedIntent`, `bufferFrames`) is stored inside `FighterState` rather than in `src/input/`.
- **Why:** Keeping input buffering inside the pure sim guarantees that replays, bots, ghosts, and online peers experience identical buffering behavior from raw `InputBitfield` streams alone.

## 5. PeerJS Behind `Transport` + Same-Origin `BroadcastChannel` Bridge
- **Decision:** `OnlineMode` depends exclusively on `src/net/Transport.ts`. `WebRtcTransport` dynamically imports `peerjs` only when `connect()` is invoked, and also opens a same-origin `BroadcastChannel` for instant local tab-to-tab lockstep.
- **Why:** Guarantees zero runtime network requests in offline modes, makes swapping PeerJS for a Cloudflare Durable Objects relay a single-file change, and allows deterministic two-tab Playwright verification without depending on third-party public signaling uptime.

## 6. Pooled Procedural PixiJS v8 Graphics
- **Decision:** All visual effects (`SlashPool`, `ParticlePool`, `ShardPool`, `DustPool`, `CrackPool`) pre-allocate fixed-size object pools and draw onto persistent `Graphics` layers cleared once per frame, with explicit `disposeScene()` container teardown.
- **Why:** Prevents GC pauses at 60 fps, requires zero external image assets, and ensures zero scene memory leaks across 20+ mode/stage switches.

## 7. Procedural Web Audio with Dedicated Audio RNG
- **Decision:** Audio synthesis (`src/audio/Synth.ts`) maintains its own LCG PRNG for 3–5% pitch variation and 0–8ms timing jitter, completely separate from `GameState.rngState`.
- **Why:** Keeps sound organic (never playing identical consecutive transients) without ever perturbing simulation determinism.
