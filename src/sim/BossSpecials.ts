import { BALANCE } from '../data/balance';
import { BOSS_SPECIALS_BY_CHAR, findBossSpecial } from '../data/specials';
import { getHurtbox, rectsOverlap, type RectFp } from './Collision';
import { isDodgeInvincible, isPerfectDodgeWindow, isWakeupInvincible } from './Fighter';
import { clampInt } from './Fixed';
import { nextU32 } from './Rng';
import type { ActiveBossSpecial, FighterState, SimEvent } from './State';

/** Computes the fixed-point AABB for an active boss arena special. */
export function getBossSpecialHitbox(sp: ActiveBossSpecial): RectFp | null {
  if (sp.phase !== 'active') return null;
  const floorY = BALANCE.FLOOR_Y_PX * BALANCE.FP_SCALE;
  return {
    left: sp.left,
    right: sp.right,
    top: sp.lowGround ? floorY - 52_000 : floorY - 190_000,
    bottom: floorY,
  };
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
    rngState: roll.nextState,
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
    const box = getBossSpecialHitbox(updated);
    if (box) {
      const targetSlot = updated.ownerSlot === 0 ? 1 : 0;
      const bit = 1 << targetSlot;
      const target = nextFighters[targetSlot];
      if (
        target.hp > 0 &&
        (updated.hitMask & bit) === 0 &&
        !isWakeupInvincible(target) &&
        rectsOverlap(box, getHurtbox(target))
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
