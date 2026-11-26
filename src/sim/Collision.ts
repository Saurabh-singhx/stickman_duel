import { BALANCE } from '../data/balance';
import { CHARACTERS } from '../data/characters';
import { MOVES } from '../data/moves';
import { clampInt, scalePercent } from './Fixed';
import type { FighterState, HazardSlab } from './State';

/** Axis-aligned bounding box in fixed-point integer coordinates. */
export interface RectFp {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Checks whether two fixed-point AABBs overlap.
 */
export function rectsOverlap(a: RectFp, b: RectFp): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Computes a fighter's hurtbox from their current position and stance.
 */
export function getHurtbox(f: FighterState): RectFp {
  const height = f.action === 'crouch' ? BALANCE.FIGHTER_CROUCH_HEIGHT : BALANCE.FIGHTER_HEIGHT;
  return {
    left: f.x - BALANCE.FIGHTER_HALF_WIDTH,
    right: f.x + BALANCE.FIGHTER_HALF_WIDTH,
    top: f.y - height,
    bottom: f.y,
  };
}

/**
 * Returns the active attack hitbox for a fighter if they are in the active frames of a move.
 */
export function getAttackHitbox(f: FighterState): RectFp | null {
  if (f.action !== 'attack' || f.currentMove === null) return null;
  const move = MOVES[f.currentMove];
  if (f.actionFrame < move.startup || f.actionFrame >= move.startup + move.active) {
    return null;
  }
  const char = CHARACTERS[f.charId];
  const reach = scalePercent(move.rangeX, char.reachPercent);
  const startX = f.x + f.facing * 12_000;
  const endX = f.x + f.facing * reach;
  const left = startX < endX ? startX : endX;
  const right = startX < endX ? endX : startX;
  const centerY = f.y + move.offsetY;
  return {
    left,
    right,
    top: centerY - move.halfHeight,
    bottom: centerY + move.halfHeight,
  };
}

/**
 * Returns the active hitbox of a coffin slab hazard when bursting.
 */
export function getSlabHitbox(slab: HazardSlab): RectFp | null {
  if (slab.phase !== 'active') return null;
  const floorY = BALANCE.FLOOR_Y_PX * BALANCE.FP_SCALE;
  return {
    left: slab.x - BALANCE.SLAB_HALF_WIDTH,
    right: slab.x + BALANCE.SLAB_HALF_WIDTH,
    top: floorY - BALANCE.SLAB_HEIGHT,
    bottom: floorY,
  };
}

/**
 * Resolves horizontal pushbox overlap between two grounded/nearby fighters.
 * Returns updated [x0, x1] positions clamped inside stage walls.
 */
export function resolvePushboxes(f0: FighterState, f1: FighterState): readonly [number, number] {
  const minX = BALANCE.STAGE_LEFT_PX * BALANCE.FP_SCALE;
  const maxX = BALANCE.STAGE_RIGHT_PX * BALANCE.FP_SCALE;

  // Dodging fighters pass through each other.
  if (f0.action === 'dodge' || f1.action === 'dodge') {
    return [clampInt(f0.x, minX, maxX), clampInt(f1.x, minX, maxX)];
  }
  // Vertical separation allows jumping over the opponent.
  const dy = f0.y - f1.y;
  if (dy > 80_000 || dy < -80_000) {
    return [clampInt(f0.x, minX, maxX), clampInt(f1.x, minX, maxX)];
  }

  const minDist = BALANCE.PUSHBOX_HALF_WIDTH * 2;
  const dx = f1.x - f0.x;
  const absDx = dx < 0 ? -dx : dx;
  if (absDx >= minDist) {
    return [clampInt(f0.x, minX, maxX), clampInt(f1.x, minX, maxX)];
  }

  const overlap = minDist - absDx;
  const halfPush = Math.trunc((overlap + 1) / 2);
  let x0 = f0.x;
  let x1 = f1.x;
  if (dx >= 0) {
    x0 -= halfPush;
    x1 += halfPush;
  } else {
    x0 += halfPush;
    x1 -= halfPush;
  }
  return [clampInt(x0, minX, maxX), clampInt(x1, minX, maxX)];
}
