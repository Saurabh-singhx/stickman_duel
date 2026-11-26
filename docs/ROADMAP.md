# Stickman Duel Roadmap

## Completed (v1.0)
- Pure deterministic 60 Hz fixed-point simulation core (`src/sim/`)
- Procedural PixiJS v8 stick-figure 2-bone IK animation, spring-chain cape, pooled FX, and 4 parallax stages
- Procedural Web Audio engine with convolution reverb, bus ducking, signature parry audio, and adaptive stage music
- 5 characters (Hero, Ash Ronin, Ochre Brute, Crimson Shade, Casket Warden), 4+1 cinematic finishers, and coffin-slab hazards
- Local 2P, Vs Bot (4 difficulties), 6-stage Boss Rush, Endless Waves, Training Dojo (frame-step + hitboxes + dummy record/playback), Ghost Duels, UTC Daily Challenge, and Online 1v1 Room Codes (Input Delay over WebRTC)

## Next Milestones (Prioritized)

1. **GGPO-Style Rollback Netcode (`RollbackSession`):** Replace the stub in `src/net/InputDelaySession.ts` with a 12-frame `Snapshot.ts` ring buffer, last-input prediction, and silent fast-forward re-simulation for near-zero input latency at 100ms+ RTT.
2. **Cloudflare Durable Objects Signaling & Relay Server:** Implement `RelayTransport implements Transport` to guarantee instant NAT traversal behind symmetric corporate/mobile firewalls and support quick-match pairing.
3. **Ranked Ladder & Elo Matchmaking:** Add seasonal rating tiers, best-of-5 ranked sets, and replay verification on match submission.
4. **Community Ghost & Daily Challenge Backend:** Connect `RemoteGhostProvider` (`src/replay/GhostStore.ts`) and `LeaderboardClient` (`src/systems/Progress.ts`) to a lightweight worker API so players can duel global top ghosts and compete on daily leaderboards.
5. **Expanded Roster, Custom Cosmetics & Tournament Spectator Mode:** Add new weapon silhouettes (spear, twin blades, chain sickle) purely via `src/data/`, unlockable cape/blade palettes, and live spectator streams driven by the compact binary input protocol.
