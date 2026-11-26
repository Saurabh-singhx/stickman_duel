import { BALANCE } from '../data/balance';

/** Fixed-point scaling factor (1000 units = 1 pixel). */
export const FP = BALANCE.FP_SCALE;

/**
 * Converts a pixel integer to fixed-point units.
 */
export function toFp(px: number): number {
  return Math.trunc(px * FP);
}

/**
 * Converts fixed-point units to floating-point pixels (for rendering only).
 */
export function fromFp(fp: number): number {
  return fp / FP;
}

/**
 * Clamps an integer between min and max inclusive.
 */
export function clampInt(val: number, min: number, max: number): number {
  if (val < min) return min;
  if (val > max) return max;
  return Math.trunc(val);
}

/**
 * Returns the absolute value of an integer.
 */
export function absInt(val: number): number {
  return val < 0 ? -val : val;
}

/**
 * Returns -1, 0, or 1 for the sign of an integer.
 */
export function signInt(val: number): -1 | 0 | 1 {
  if (val > 0) return 1;
  if (val < 0) return -1;
  return 0;
}

/**
 * Scales an integer by a percentage using integer truncation.
 */
export function scalePercent(val: number, percent: number): number {
  return Math.trunc((val * percent) / 100);
}

/**
 * Moves an integer toward a target by at most step units.
 */
export function approachInt(current: number, target: number, step: number): number {
  if (current < target) {
    const next = current + step;
    return next > target ? target : next;
  }
  if (current > target) {
    const next = current - step;
    return next < target ? target : next;
  }
  return target;
}

/**
 * Linearly interpolates between two fixed-point integers using a 0..1 render alpha.
 * Intended for rendering interpolation only, never for simulation logic.
 */
export function lerpFpToPx(prevFp: number, currFp: number, alpha: number): number {
  return (prevFp + (currFp - prevFp) * alpha) / FP;
}
