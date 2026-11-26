/**
 * Pure deterministic xorshift32 PRNG.
 * State is stored as a uint32 inside GameState so it is trivially serializable.
 */

export interface RngResult {
  readonly value: number;
  readonly nextState: number;
}

/**
 * Normalizes any integer seed into a valid non-zero uint32 PRNG state.
 */
export function normalizeSeed(seed: number): number {
  const s = seed >>> 0;
  return s === 0 ? 0x9e3779b9 : s;
}

/**
 * Advances the PRNG state by one step and returns a uint32 value.
 */
export function nextU32(state: number): RngResult {
  let x = normalizeSeed(state);
  x ^= (x << 13) >>> 0;
  x ^= x >>> 17;
  x ^= (x << 5) >>> 0;
  const next = x >>> 0;
  return { value: next, nextState: next };
}

/**
 * Returns a deterministic integer in [min, max] inclusive.
 */
export function nextRangeInt(state: number, min: number, max: number): RngResult {
  const res = nextU32(state);
  const span = max - min + 1;
  if (span <= 1) {
    return { value: min, nextState: res.nextState };
  }
  return {
    value: min + (res.value % span),
    nextState: res.nextState,
  };
}
