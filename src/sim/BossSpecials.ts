import { BALANCE } from '../data/balance';
import { BOSS_SPECIALS_BY_CHAR, findBossSpecial } from '../data/specials';
import { getHurtbox, rectsOverlap, type RectFp } from './Collision';
import { isDodgeInvincible, isPerfectDodgeWindow, isWakeupInvincible } from './Fighter';
import { clampInt } from './Fixed';
import { nextU32 } from './Rng';
import type { ActiveBossSpecial, FighterState, SimEvent } from './State';

/** Builds stacked AABB slices approximating a diagonal line segment from (x0, y0) to (x1, y1). */
function segmentBoxes(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  steps: number,
  halfPadX: number,
  halfPadY: number,
): RectFp[] {
  const out: RectFp[] = [];
  for (let i = 0; i < steps; i += 1) {
    const u0 = i / steps;
    const u1 = (i + 1) / steps;
    const ax = Math.trunc(x0 + (x1 - x0) * u0);
    const ay = Math.trunc(y0 + (y1 - y0) * u0);
    const bx = Math.trunc(x0 + (x1 - x0) * u1);
    const by = Math.trunc(y0 + (y1 - y0) * u1);
    out.push({
      left: Math.min(ax, bx) - halfPadX,
      right: Math.max(ax, bx) + halfPadX,
      top: Math.min(ay, by) - halfPadY,
      bottom: Math.max(ay, by) + halfPadY,
    });
  }
  return out;
}

/** Builds evenly spaced vertical column hitboxes across [left..right]. */
function columnBoxes(left: number, width: number, count: number, halfW: number, top: number, bottom: number): RectFp[] {
  const out: RectFp[] = [];
  for (let i = 0; i < count; i += 1) {
    const cx = left + Math.trunc(((i + 0.5) * width) / count);
    out.push({ left: cx - halfW, right: cx + halfW, top, bottom });
  }
  return out;
}

/**
 * Computes the exact fixed-point AABB(s) matching the visual hazard geometry of an active boss special
 * so players outside visible beams/pillars/cones/waves never take phantom damage.
 */
export function getBossSpecialHitboxes(sp: ActiveBossSpecial, ownerX?: number): readonly RectFp[] {
  if (sp.phase !== 'active') return [];
  const floorY = BALANCE.FLOOR_Y_PX * BALANCE.FP_SCALE;
  const left = sp.left;
  const right = sp.right;
  const width = Math.max(20_000, right - left);
  const midX = left + Math.trunc(width / 2);
  const clampedOwner = ownerX !== undefined ? clampInt(ownerX, left, right) : midX;
  const dir: 1 | -1 = Math.abs(clampedOwner - left) <= Math.abs(right - clampedOwner) ? 1 : -1;
  const shape = findBossSpecial(sp.specialId)?.shape ?? 'ground_wave';

  switch (shape) {
    case 'ground_wave':
    case 'boulder_rupture':
      return [{ left, right, top: floorY - 52_000, bottom: floorY }];

    case 'traveling_crescent': {
      const startX = dir === 1 ? left + 18_000 : right - 18_000;
      const endX = dir === 1 ? right - 10_000 : left + 10_000;
      const travel = Math.min(1, 0.28 + (sp.frame + 1) * 0.18);
      const waveX = startX + Math.trunc((endX - startX) * travel);
      return [{ left: waveX - 44_000, right: waveX + 44_000, top: floorY - 58_000, bottom: floorY }];
    }

    case 'sky_beams':
      return columnBoxes(left, width, 5, 22_000, floorY - 190_000, floorY);

    case 'blade_rain':
      return columnBoxes(left, width, 8, 16_000, floorY - 190_000, floorY);

    case 'falling_coffins':
      return columnBoxes(left, width, 3, 26_000, floorY - 190_000, floorY);

    case 'rock_monoliths':
      return columnBoxes(left, width, 3, 28_000, floorY - 190_000, floorY);

    case 'starfall_spears': {
      const boxes: RectFp[] = [];
      const slant = -dir * 130_000;
      for (let i = 0; i < 5; i += 1) {
        const tx = left + Math.trunc(((i + 0.5) * width) / 5);
        const sx = tx + Math.trunc((slant * 190) / 260);
        boxes.push(...segmentBoxes(sx, floorY - 190_000, tx, floorY, 3, 18_000, 10_000));
      }
      return boxes;
    }

    case 'dash_slash':
      return [{ left, right, top: floorY - 122_000, bottom: floorY - 76_000 }];

    case 'zigzag_chain': {
      const startX = dir === 1 ? left + 20_000 : right - 20_000;
      const endX = dir === 1 ? right - 20_000 : left + 20_000;
      const span = endX - startX;
      const pts = [
        [startX, floorY - 68_000],
        [startX + Math.trunc(span * 0.25), floorY - 158_000],
        [startX + Math.trunc(span * 0.5), floorY - 42_000],
        [startX + Math.trunc(span * 0.75), floorY - 162_000],
        [endX, floorY - 68_000],
      ] as const;
      const boxes: RectFp[] = [];
      for (let i = 0; i < pts.length - 1; i += 1) {
        boxes.push(...segmentBoxes(pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], 2, 16_000, 16_000));
      }
      return boxes;
    }

    case 'eclipse_ring':
      return [
        { left: midX - Math.trunc(width * 0.18), right: midX + Math.trunc(width * 0.18), top: floorY - 170_000, bottom: floorY },
        { left: midX - Math.trunc(width * 0.36), right: midX + Math.trunc(width * 0.36), top: floorY - 118_000, bottom: floorY },
        { left: midX - Math.trunc(width * 0.48), right: midX + Math.trunc(width * 0.48), top: floorY - 64_000, bottom: floorY },
      ];

    case 'tempest_vortex':
      return [
        { left: midX - 42_000, right: midX + 42_000, top: floorY - 74_000, bottom: floorY },
        { left: midX - Math.trunc(width * 0.24), right: midX + Math.trunc(width * 0.24), top: floorY - 138_000, bottom: floorY - 74_000 },
        { left: midX - Math.trunc(width * 0.42), right: midX + Math.trunc(width * 0.42), top: floorY - 195_000, bottom: floorY - 138_000 },
      ];

    case 'soul_geyser':
      return [
        { left: midX - Math.trunc(width * 0.42), right: midX + Math.trunc(width * 0.42), top: floorY - 26_000, bottom: floorY },
        { left: midX - Math.trunc(width * 0.26), right: midX + Math.trunc(width * 0.26), top: floorY - 110_000, bottom: floorY - 26_000 },
        { left: midX - Math.trunc(width * 0.18), right: midX + Math.trunc(width * 0.18), top: floorY - 195_000, bottom: floorY - 110_000 },
      ];

    case 'shock_nova': {
      const rad = Math.min(Math.trunc(width * 0.45), 185_000);
      const sphereW = Math.trunc(rad * 0.85);
      const floorRx = Math.trunc(width * 0.48);
      return [
        { left: midX - floorRx, right: midX + floorRx, top: floorY - 30_000, bottom: floorY },
        { left: midX - sphereW, right: midX + sphereW, top: floorY - 70_000 - rad, bottom: floorY },
      ];
    }

    case 'cross_slashes': {
      const boxes: RectFp[] = [];
      const cw = Math.trunc(width / 3);
      for (let i = 0; i < 3; i += 1) {
        const x1 = left + i * cw + 4_000;
        const x2 = left + (i + 1) * cw - 4_000;
        boxes.push(...segmentBoxes(x1, floorY - 188_000, x2, floorY - 4_000, 3, 14_000, 14_000));
        boxes.push(...segmentBoxes(x2, floorY - 188_000, x1, floorY - 4_000, 3, 14_000, 14_000));
      }
      return boxes;
    }

    case 'shadow_clones': {
      const boxes: RectFp[] = [];
      for (const frac of [0.2, 0.5, 0.8]) {
        const cx = left + Math.trunc(width * frac);
        boxes.push({ left: cx - 44_000, right: cx + 44_000, top: floorY - 112_000, bottom: floorY - 22_000 });
      }
      return boxes;
    }
  }
}

/**
 * Builds an ActiveBossSpecial + telegraph event from a concrete BossSpecialSpec.
 */
export function createBossSpecial(
  owner: FighterState,
  spec: import('../data/specials').BossSpecialSpec,
  nextId: number,
): { special: ActiveBossSpecial; nextId: number; event: SimEvent } {
  const stageLeft = BALANCE.STAGE_LEFT_PX * BALANCE.FP_SCALE;
  const stageRight = BALANCE.STAGE_RIGHT_PX * BALANCE.FP_SCALE;
  const midX = Math.trunc((stageLeft + stageRight) / 2);

  let left = stageLeft;
  let right = stageRight;
  if (spec.coverage === 'half_arena') {
    if (owner.facing === 1) {
      left = clampInt(owner.x, stageLeft, midX);
      right = stageRight;
    } else {
      left = stageLeft;
      right = clampInt(owner.x, midX, stageRight);
    }
  }

  const special: ActiveBossSpecial = {
    id: nextId,
    ownerSlot: owner.slot,
    specialId: spec.id,
    left,
    right,
    lowGround: spec.lowGround,
    parryable: spec.parryable,
    phase: 'telegraph',
    frame: 0,
    telegraphFrames: spec.telegraphFrames,
    activeFrames: spec.activeFrames,
    damage: spec.damage,
    guardDamage: spec.guardDamage,
    hitMask: 0,
  };

  return {
    special,
    nextId: nextId + 1,
    event: {
      type: 'BOSS_SPECIAL_TELEGRAPH',
      owner: owner.slot,
      specialId: spec.id,
      name: spec.name,
      left,
      right,
    },
  };
}

/**
 * Spawns a specific boss arena special by ID (used by deterministic previews/lab).
 */
export function spawnBossSpecialById(
  owner: FighterState,
  specialId: string,
  nextId: number,
): { special: ActiveBossSpecial; nextId: number; event: SimEvent } | null {
  const spec = findBossSpecial(specialId);
  if (!spec) return null;
  return createBossSpecial(owner, spec, nextId);
}

/**
 * Spawns one of the boss character's 4 arena/half-arena special attacks deterministically.
 */
export function spawnBossSpecial(
  owner: FighterState,
  nextId: number,
  rngState: number,
): { special: ActiveBossSpecial | null; nextId: number; rngState: number; event: SimEvent | null } {
  const kit = BOSS_SPECIALS_BY_CHAR[owner.charId];
  if (!kit || kit.length === 0) {
    return { special: null, nextId, rngState, event: null };
  }
  const roll = nextU32(rngState);
  const spec = kit[roll.value % kit.length]!;
  const built = createBossSpecial(owner, spec, nextId);

  return {
    special: built.special,
    nextId: built.nextId,
    rngState: roll.nextState,
    event: built.event,
  };
}

/**
 * Advances all active boss arena specials and resolves collisions against opponent fighters.
 */
export function stepBossSpecials(
  list: readonly ActiveBossSpecial[],
  fighters: readonly [FighterState, FighterState],
  trainingMode: boolean,
): {
  specials: readonly ActiveBossSpecial[];
  fighters: [FighterState, FighterState];
  events: readonly SimEvent[];
  hitstop: number;
} {
  const events: SimEvent[] = [];
  const nextList: ActiveBossSpecial[] = [];
  const nextFighters: [FighterState, FighterState] = [fighters[0], fighters[1]];
  let hitstop = 0;

  for (const sp of list) {
    if (nextFighters[sp.ownerSlot].hp <= 0) continue;
    const nextFrame = sp.frame + 1;
    let updated: ActiveBossSpecial | null = null;

    if (sp.phase === 'telegraph') {
      if (nextFrame >= sp.telegraphFrames) {
        events.push({
          type: 'BOSS_SPECIAL_ACTIVE',
          owner: sp.ownerSlot,
          specialId: sp.specialId,
          left: sp.left,
          right: sp.right,
        });
        updated = { ...sp, phase: 'active', frame: 0 };
      } else {
        updated = { ...sp, frame: nextFrame };
      }
    } else if (nextFrame < sp.activeFrames) {
      updated = { ...sp, frame: nextFrame };
    }

    if (!updated) continue;

    // Resolve active zone against target opponent
    const boxes = getBossSpecialHitboxes(updated, nextFighters[updated.ownerSlot].x);
    if (boxes.length > 0) {
      const targetSlot = updated.ownerSlot === 0 ? 1 : 0;
      const bit = 1 << targetSlot;
      const target = nextFighters[targetSlot];
      const targetBox = getHurtbox(target);
      if (
        target.hp > 0 &&
        (updated.hitMask & bit) === 0 &&
        !isWakeupInvincible(target) &&
        boxes.some((b) => rectsOverlap(b, targetBox))
      ) {
        if (isPerfectDodgeWindow(target) && !target.perfectDodgeTriggered) {
          updated = { ...updated, hitMask: updated.hitMask | bit };
          events.push({ type: 'PERFECT_DODGE', dodger: target.slot, x: target.x, y: target.y });
          nextFighters[targetSlot] = {
            ...target,
            perfectDodgeTriggered: true,
            counterWindow: BALANCE.COUNTER_WINDOW_FRAMES,
            specialMeter: clampInt(
              target.specialMeter + BALANCE.SPECIAL_GAIN_ON_PERFECT_DODGE,
              0,
              BALANCE.MAX_SPECIAL_METER,
            ),
          };
          const owner = nextFighters[updated.ownerSlot];
          nextFighters[updated.ownerSlot] = {
            ...owner,
            slowFrames: BALANCE.PERFECT_DODGE_SLOW_FRAMES,
          };
        } else if (isDodgeInvincible(target)) {
          // Cleanly dodged!
        } else if (updated.parryable && target.action === 'parry_active') {
          updated = { ...updated, hitMask: updated.hitMask | bit };
          events.push({
            type: 'PARRY',
            parrier: target.slot,
            attacker: updated.ownerSlot,
            x: target.x,
            y: target.y - 64_000,
          });
          hitstop = Math.max(hitstop, BALANCE.PARRY_HITSTOP_FRAMES);
          nextFighters[targetSlot] = {
            ...target,
            action: 'idle',
            actionFrame: 0,
            parryCooldown: 0,
            counterWindow: BALANCE.COUNTER_WINDOW_FRAMES,
            guard: clampInt(target.guard + 20, 0, target.maxGuard),
            specialMeter: clampInt(
              target.specialMeter + BALANCE.SPECIAL_GAIN_ON_PARRY,
              0,
              BALANCE.MAX_SPECIAL_METER,
            ),
          };
        } else {
          // Hit by boss special!
          updated = { ...updated, hitMask: updated.hitMask | bit };
          const spec = findBossSpecial(updated.specialId);
          const nextHp = trainingMode
            ? clampInt(target.hp - updated.damage, 1, target.maxHp)
            : clampInt(target.hp - updated.damage, 0, target.maxHp);
          const pushDir = target.x >= nextFighters[updated.ownerSlot].x ? 1 : -1;
          events.push({
            type: 'HIT',
            attacker: updated.ownerSlot,
            defender: target.slot,
            move: 'heavy',
            damage: updated.damage,
            x: target.x,
            y: target.y - 64_000,
            isHeavy: true,
            isCounter: false,
          });
          hitstop = Math.max(hitstop, 8);
          nextFighters[targetSlot] = {
            ...target,
            hp: nextHp,
            action: 'hitstun',
            actionFrame: 0,
            stunFrames: spec?.lowGround ? 24 : 22,
            currentMove: null,
            vx: pushDir * 11_000,
            vy: spec?.lowGround ? -6_500 : target.vy,
            grounded: spec?.lowGround ? false : target.grounded,
          };
        }
      }
    }

    nextList.push(updated);
  }

  return { specials: nextList, fighters: nextFighters, events, hitstop };
}
