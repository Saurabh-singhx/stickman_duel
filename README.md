# Stickman Duel

A minimal, cinematic 2D stick-figure sword-duel game built with **TypeScript**, **PixiJS v8**, **Web Audio API** (100% procedural, zero image or audio files), and a **pure deterministic 60 Hz simulation core**.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start Vite development server on port 5173 |
| `npm run build` | Type-check and build production bundle into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint (including strict `src/sim` purity checks) |
| `npm run typecheck` | Run `tsc --noEmit` with `strict` and `noUncheckedIndexedAccess` |
| `npm run test` | Run Vitest unit suite (determinism, combat, bots, replay, netcode) |
| `npm run test:e2e` | Run Playwright headless E2E tests and visual screenshot checks |

## Controls

| Action | Player 1 (Keyboard) | Player 2 (Keyboard) | Gamepad |
| :--- | :--- | :--- | :--- |
| Move Left / Right | `A` / `D` | `←` / `→` | Left Stick / D-Pad |
| Jump / Crouch | `Space` / `C` | `↑` / `↓` | `A` (Cross) / Down |
| Light Slash (3-hit chain) | `Left Click` or `J` | `Numpad 1` | `X` (Square) |
| Heavy Slash | `Right Click` or `K` | `Numpad 2` | `Y` (Triangle) |
| Unblockable Red-Flash | `C + Right Click` or `C + K` | `↓ + Numpad 2` | Down + Heavy |
| Block (hold) / Parry (tap) | `L` | `Numpad 3` | `LB` / `L1` |
| Dodge / Perfect Dodge | `Left Shift` | `Numpad 0` | `B` (Circle) |
| Grab / Execute | `U` | `Numpad 4` | `RB` / `R1` |
| Special Power (at 100% meter) | `E` | `Numpad 5` | — |

### Debug & Training Shortcuts

- `Esc` — Pause menu
- `F1` — Toggle Debug Overlay (hitboxes, hurtboxes, pushboxes, frame data, checksum, sim-ms)
- `F2` — Toggle Frame-Step Pause Mode
- `F3` or `.` — Advance exactly 1 simulation frame while in Frame-Step Mode
- `F4` / `F5` — Record / Play Back P2 dummy inputs in Training Dojo

## Extending Content (Data-Driven)

All moves, characters, enemies, stages, and finishers live in `src/data/`. You do **not** need to modify `src/sim/` to add content.

### 1. Add a New Move (`src/data/moves.ts`)

Add the move ID to `MoveId` and add its frame-data entry to `MOVES`:

```ts
// src/data/moves.ts
export type MoveId = 'light1' | 'light2' | 'light3' | 'heavy' | 'unblockable' | 'grab' | 'counter' | 'pommel_strike';

// Inside MOVES:
pommel_strike: {
  id: 'pommel_strike',
  name: 'Pommel Strike',
  startup: 6,
  active: 3,
  recovery: 11,
  damage: 10,
  guardDamage: 24,
  hitstop: 6,
  hitstun: 16,
  blockstun: 12,
  pushback: 6_500,
  lunge: 4_000,
  rangeX: 78_000,
  offsetY: -64_000,
  halfHeight: 32_000,
  unblockable: false,
  isGrab: false,
  isCounter: false,
  canCancelInto: ['heavy'],
  cancelWindowStart: 7,
},
```

### 2. Add a New Enemy / Character (`src/data/characters.ts` & `src/data/enemies.ts`)

Add a character spec to `CHARACTERS` in `src/data/characters.ts`:

```ts
// src/data/characters.ts
monk: {
  id: 'monk',
  name: 'Ashen Monk',
  title: 'Staff Duelist',
  maxHp: 95,
  maxGuard: 110,
  speedPercent: 106,
  damagePercent: 92,
  reachPercent: 115,
  weapon: 'dark_katana',
  hasCape: true,
  hasHood: true,
  hasMask: false,
  hasGlow: false,
  bodyColor: 0x2d2926,
  accentColor: 0xd4a24c,
  weaponColor: 0x5c5348,
  capeColor: 0x3b2f26,
  slashColor: 0xe6c36a,
  finisherId: 'spin_cut',
},
```

Then reference `'monk'` in `BOSS_RUSH_ENCOUNTERS` or `getWaveConfig()` inside `src/data/enemies.ts`.

### 3. Add a New Stage (`src/data/stages.ts`)

Add the stage ID to `StageId`, add its palette and music scale to `STAGES`, and append it to `STAGE_LIST`:

```ts
// src/data/stages.ts
mist_bridge: {
  id: 'mist_bridge',
  name: 'Mist Bridge',
  skyTop: 0x9aa6b2,
  skyBottom: 0xc2ccd6,
  horizonFog: 0xdce4ec,
  floorColor: 0x5d646b,
  floorLineColor: 0x2f343a,
  silhouetteFar: 0x828e9b,
  silhouetteMid: 0x67727e,
  accentColor: 0xf5c84c,
  hasCoffinHazards: false,
  musicRootHz: 103.83,
  musicScale: [0, 2, 5, 7, 10],
},
```

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Module map and data-flow diagram
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — Engineering and art direction decisions
- [`docs/COMBAT_SPEC.md`](docs/COMBAT_SPEC.md) — Complete 60 fps frame data and priority rules
- [`docs/NETCODE.md`](docs/NETCODE.md) — Determinism, input-delay protocol, and rollback plan
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — Next milestones and post-v1 features

### Online rooms on Cloudflare Pages

The static build supports online rooms through PeerJS's public signaling service.
No application backend is deployed with this game. Hosting registers the room before
showing its share controls; the host must keep the tab open. Guests can enter the
six-character code or paste the full invite URL. Rooms support one host and one guest.
Both players must use the updated build (the room acceptance handshake changed).

This is not completely server-free: PeerJS provides signaling and WebRTC uses ICE
services to establish connectivity. Restrictive NATs/firewalls may require a TURN
relay; the current default PeerJS configuration cannot guarantee connectivity on
every network. Connection failures are reported separately from invalid input.
For controlled availability, deploy your own signaling and authenticated TURN
service, or implement a WebSocket relay using a Cloudflare Worker with Durable
Objects. A Durable Object must be deployed in a separate Worker for a Pages site.
Never embed long-lived TURN credentials in the static build.

Online tests now exercise the actual WebRTC path rather than a BroadcastChannel
shortcut. The two-tab browser smoke test requires access to PeerJS signaling;
unit tests mock signaling and cover registration, acceptance, capacity, errors,
timeouts, cancellation and room-code parsing without external network access.
