import type { GameState } from './State';

/**
 * Serializes a GameState to a JSON string for snapshots, save/load, and future rollback.
 */
export function saveState(state: GameState): string {
  return JSON.stringify(state);
}

/**
 * Restores a GameState from a serialized snapshot string.
 */
export function loadState(blob: string): GameState {
  return JSON.parse(blob) as GameState;
}

/**
 * Feeds a 32-bit integer into an FNV-1a hash accumulator.
 */
function mixInt(hash: number, val: number): number {
  let h = hash ^ (val & 0xff);
  h = Math.imul(h, 0x01000193);
  h ^= (val >>> 8) & 0xff;
  h = Math.imul(h, 0x01000193);
  h ^= (val >>> 16) & 0xff;
  h = Math.imul(h, 0x01000193);
  h ^= (val >>> 24) & 0xff;
  return Math.imul(h, 0x01000193) >>> 0;
}

/**
 * Feeds a short string into an FNV-1a hash accumulator.
 */
function mixStr(hash: number, str: string): number {
  let h = hash;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Computes a deterministic 32-bit FNV-1a checksum of all gameplay fields in GameState.
 * Used for desync detection in online play and determinism verification in tests.
 */
export function hashState(state: GameState): number {
  let h = 0x811c9dc5;
  h = mixInt(h, state.frame);
  h = mixInt(h, state.round);
  h = mixStr(h, state.phase);
  h = mixInt(h, state.phaseFrame);
  h = mixInt(h, state.roundTimer);
  h = mixInt(h, state.hitstopFrames);
  h = mixInt(h, state.rngState);
  h = mixInt(h, state.scores[0]);
  h = mixInt(h, state.scores[1]);
  h = mixInt(h, state.hazardTimer);
  h = mixInt(h, state.nextHazardId);

  for (const f of state.fighters) {
    h = mixInt(h, f.x);
    h = mixInt(h, f.y);
    h = mixInt(h, f.vx);
    h = mixInt(h, f.vy);
    h = mixInt(h, f.facing);
    h = mixInt(h, f.grounded ? 1 : 0);
    h = mixInt(h, f.hp);
    h = mixInt(h, f.guard);
    h = mixStr(h, f.action);
    h = mixInt(h, f.actionFrame);
    h = mixInt(h, f.stunFrames);
    h = mixStr(h, f.currentMove ?? '');
    h = mixInt(h, f.moveHitLanded ? 1 : 0);
    h = mixInt(h, f.parryCooldown);
    h = mixInt(h, f.counterWindow);
    h = mixInt(h, f.executionCooldown);
    h = mixInt(h, f.lightChainCooldown);
    h = mixInt(h, f.specialMeter);
    h = mixInt(h, f.bossSpecialCooldown);
    h = mixInt(h, f.slowFrames);
    h = mixInt(h, f.comboCount);
    h = mixInt(h, f.prevInput);
    h = mixStr(h, f.bufferedIntent);
    h = mixInt(h, f.bufferFrames);
  }

  for (const slab of state.hazards) {
    h = mixInt(h, slab.id);
    h = mixInt(h, slab.x);
    h = mixStr(h, slab.phase);
    h = mixInt(h, slab.frame);
    h = mixInt(h, slab.hitMask);
  }

  for (const bs of state.bossSpecials) {
    h = mixInt(h, bs.id);
    h = mixInt(h, bs.left);
    h = mixInt(h, bs.right);
    h = mixStr(h, bs.phase);
    h = mixInt(h, bs.frame);
    h = mixInt(h, bs.hitMask);
  }
  if (state.activeSpecial) {
    h = mixInt(h, state.activeSpecial.attacker);
    h = mixStr(h, state.activeSpecial.specialId);
    h = mixInt(h, state.activeSpecial.frame);
  }
  return h >>> 0;
}
