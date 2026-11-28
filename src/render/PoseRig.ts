import { BALANCE } from '../data/balance';
import { FINISHERS, type FinisherId } from '../data/finishers';
import { MOVES } from '../data/moves';
import { findBossSpecial, type PlayerSpecialId } from '../data/specials';
import type { FighterState } from '../sim/State';

/** Optional cinematic context passed into computeTargetPose for bespoke special/finisher choreography. */
export interface PoseContext {
  readonly specialId?: PlayerSpecialId | null;
  readonly specialFrame?: number;
  readonly finisherId?: FinisherId | null;
  readonly finisherFrame?: number;
  readonly bossSpecialId?: string | null;
  readonly bossSpecialPhase?: 'telegraph' | 'active';
  readonly bossSpecialFrame?: number;
  readonly bossSpecialDuration?: number;
}

/** 2D point in fighter-local or world coordinates. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Complete articulated pose for a stick-figure fighter. */
export interface PoseData {
  hipY: number;
  leanX: number;
  spineCurve: number;
  headTiltX: number;
  leftFoot: Vec2;
  rightFoot: Vec2;
  frontHand: Vec2;
  backHand: Vec2;
  weaponAngle: number;
  squashX: number;
  squashY: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeInOutCubic(t: number): number {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/**
 * Computes one foot's realistic bipedal gait offset relative to the pelvis:
 * 56% flat-footed ground push-off stance (prevents foot sliding) + 44% folded-knee air swing.
 */
function computeWalkFoot(phase: number, strideX: number, liftH: number): Vec2 {
  const tau = Math.PI * 2;
  const s = (((phase % tau) + tau) % tau) / tau;
  if (s < 0.56) {
    const u = s / 0.56;
    const heelLift = u > 0.88 ? -((u - 0.88) / 0.12) * 2.4 : 0;
    return {
      x: lerp(strideX, -strideX, u),
      y: heelLift,
    };
  }
  const sw = (s - 0.56) / 0.44;
  const reach = easeInOutCubic(sw);
  const arc = Math.sin(Math.pow(sw, 0.78) * Math.PI);
  return {
    x: lerp(-strideX, strideX, reach),
    y: -arc * liftH,
  };
}

function easeOutExpo(t: number): number {
  const u = clamp01(t);
  return u >= 1 ? 1 : 1 - Math.pow(2, -9 * u);
}

function easeOutCubic(t: number): number {
  const u = clamp01(t);
  return 1 - Math.pow(1 - u, 3);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/**
 * Clones a PoseData object cleanly.
 */
export function clonePose(p: PoseData): PoseData {
  return {
    hipY: p.hipY,
    leanX: p.leanX,
    spineCurve: p.spineCurve,
    headTiltX: p.headTiltX,
    leftFoot: { ...p.leftFoot },
    rightFoot: { ...p.rightFoot },
    frontHand: { ...p.frontHand },
    backHand: { ...p.backHand },
    weaponAngle: p.weaponAngle,
    squashX: p.squashX,
    squashY: p.squashY,
  };
}

/**
 * Smoothly blends current rendered pose toward target pose using shortest-angle weapon interpolation.
 */
export function blendPose(curr: PoseData, target: PoseData, alpha: number): PoseData {
  const t = clamp01(alpha);
  let angleDiff = target.weaponAngle - curr.weaponAngle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  return {
    hipY: lerp(curr.hipY, target.hipY, t),
    leanX: lerp(curr.leanX, target.leanX, t),
    spineCurve: lerp(curr.spineCurve, target.spineCurve, t),
    headTiltX: lerp(curr.headTiltX, target.headTiltX, t),
    leftFoot: lerpVec(curr.leftFoot, target.leftFoot, t),
    rightFoot: lerpVec(curr.rightFoot, target.rightFoot, t),
    frontHand: lerpVec(curr.frontHand, target.frontHand, t),
    backHand: lerpVec(curr.backHand, target.backHand, t),
    weaponAngle: curr.weaponAngle + angleDiff * t,
    squashX: lerp(curr.squashX, target.squashX, t),
    squashY: lerp(curr.squashY, target.squashY, t),
  };
}

/**
 * Returns the ideal blend responsiveness for the current action:
 * crisp & snappy on strikes/parries, silky & organic on locomotion/idle/recovery.
 */
export function getPoseBlendRate(f: FighterState, ctx?: PoseContext): number {
  if (f.action === 'attack') {
    const m = f.currentMove ? MOVES[f.currentMove] : null;
    if (m && f.actionFrame >= m.startup && f.actionFrame <= m.startup + 2) return 0.94;
    return 0.58;
  }
  if (ctx?.bossSpecialId && (f.action === 'idle' || f.action === 'walk')) {
    return ctx.bossSpecialPhase === 'active' && (ctx.bossSpecialFrame ?? 0) <= 2 ? 0.9 : 0.52;
  }
  if (f.action === 'parry_active' || f.action === 'hitstun') return 0.62;
  if (f.action === 'dodge') return 0.45;
  if (f.action === 'getup') return 0.44;
  if (f.action === 'special_atk' || f.action === 'special_vic') return 0.42;
  if (f.action === 'finisher_atk' || f.action === 'finisher_vic') return 0.32;
  if (f.action === 'walk' || f.action === 'jump') return 0.28;
  return 0.22;
}

/**
 * Computes a smooth, human-like target pose from simulation state + frame number.
 */
export function computeTargetPose(
  f: FighterState,
  walkPhase: number,
  ctx?: PoseContext,
): PoseData {
  const t = f.actionFrame;
  const breath = Math.sin(t * 0.085);
  const vxDir = f.vx * f.facing; // positive = advancing, negative = retreating

  if (f.action === 'knockdown') {
    const settle = easeOutCubic(t / 10);
    return {
      hipY: lerp(-24, -10, settle),
      leanX: lerp(-20, -38, settle),
      spineCurve: -6,
      headTiltX: -10,
      leftFoot: { x: 24, y: 0 },
      rightFoot: { x: 10, y: 0 },
      frontHand: { x: -42, y: -4 },
      backHand: { x: -18, y: -6 },
      weaponAngle: 0.16,
      squashX: 1.06,
      squashY: 0.94,
    };
  }

  if (f.action === 'getup') {
    // Realistic 3-stage 30-frame stand-up:
    //   0.00..0.34: sit torso up & plant back hand on floor while drawing feet in
    //   0.34..0.72: push off hand onto one-knee crouched lunge (front foot planted)
    //   0.72..1.00: drive up through front leg back into ready duelist guard
    const raw = clamp01(t / BALANCE.GETUP_FRAMES);
    if (raw < 0.34) {
      const u = easeInOutCubic(raw / 0.34);
      return {
        hipY: lerp(-10, -16, u),
        leanX: lerp(-38, -14, u),
        spineCurve: lerp(-6, 4, u),
        headTiltX: lerp(-10, 2, u),
        leftFoot: lerpVec({ x: 24, y: 0 }, { x: -10, y: 0 }, u),
        rightFoot: lerpVec({ x: 10, y: 0 }, { x: 20, y: 0 }, u),
        frontHand: lerpVec({ x: -42, y: -4 }, { x: 14, y: -22 }, u),
        backHand: lerpVec({ x: -18, y: -6 }, { x: -24, y: -2 }, u),
        weaponAngle: lerp(0.16, -0.08, u),
        squashX: lerp(1.06, 1.0, u),
        squashY: lerp(0.94, 1.0, u),
      };
    }
    if (raw < 0.72) {
      const u = easeInOutCubic((raw - 0.34) / 0.38);
      return {
        hipY: lerp(-16, -32, u),
        leanX: lerp(-14, 14, u),
        spineCurve: lerp(4, 9, u),
        headTiltX: lerp(2, 4, u),
        leftFoot: lerpVec({ x: -10, y: 0 }, { x: -18, y: 0 }, u),
        rightFoot: lerpVec({ x: 20, y: 0 }, { x: 24, y: 0 }, u),
        frontHand: lerpVec({ x: 14, y: -22 }, { x: 26, y: -38 }, u),
        backHand: lerpVec({ x: -24, y: -2 }, { x: -16, y: -32 }, u),
        weaponAngle: lerp(-0.08, -0.26, u),
        squashX: 1.03,
        squashY: 0.97,
      };
    }
    const u = easeOutCubic((raw - 0.72) / 0.28);
    return {
      hipY: lerp(-32, -49, u),
      leanX: lerp(14, 7, u),
      spineCurve: lerp(9, 3, u),
      headTiltX: lerp(4, 2, u),
      leftFoot: lerpVec({ x: -18, y: 0 }, { x: -20, y: 0 }, u),
      rightFoot: lerpVec({ x: 24, y: 0 }, { x: 22, y: 0 }, u),
      frontHand: lerpVec({ x: 26, y: -38 }, { x: 28, y: -62 }, u),
      backHand: lerpVec({ x: -16, y: -32 }, { x: -12, y: -56 }, u),
      weaponAngle: lerp(-0.26, -0.42, u),
      squashX: 1,
      squashY: 1,
    };
  }

  if (f.action === 'special_startup') {
    const u = easeInOutCubic(t / 16);
    return {
      hipY: lerp(-49, -40, u),
      leanX: lerp(7, -14, u),
      spineCurve: -8,
      headTiltX: -3,
      leftFoot: { x: -24, y: 0 },
      rightFoot: { x: 24, y: 0 },
      frontHand: lerpVec({ x: 28, y: -62 }, { x: -12, y: -98 }, u),
      backHand: { x: -18, y: -64 },
      weaponAngle: lerp(-0.42, -2.35, u),
      squashX: 0.93,
      squashY: 1.07,
    };
  }

  if (f.action === 'special_atk') {
    if (ctx?.specialId === 'aerial_lasers') {
      const sf = ctx.specialFrame ?? t;
      if (sf < 22) {
        // Ascending cleanly into the air (arms open/rising, legs tucked slightly)
        const u = easeOutCubic(sf / 22);
        return {
          hipY: lerp(-46, -50, u),
          leanX: lerp(4, -6, u),
          spineCurve: lerp(2, -4, u),
          headTiltX: 2,
          leftFoot: lerpVec({ x: -20, y: 0 }, { x: -14, y: -10 }, u),
          rightFoot: lerpVec({ x: 22, y: 0 }, { x: 14, y: -18 }, u),
          frontHand: lerpVec({ x: 18, y: -56 }, { x: 26, y: -74 }, u),
          backHand: lerpVec({ x: -14, y: -56 }, { x: -20, y: -72 }, u),
          weaponAngle: -0.35,
          squashX: lerp(0.96, 0.94, u),
          squashY: lerp(1.04, 1.06, u),
        };
      }
      if (sf <= 125) {
        // Hovering high and aiming downward red laser barrage at the enemy
        const aimU = easeOutExpo((sf - 22) / 10);
        const hoverSway = Math.sin(sf * 0.22) * 2;
        return {
          hipY: -50 + hoverSway * 0.5,
          leanX: lerp(-6, 16, aimU),
          spineCurve: 6,
          headTiltX: 6,
          leftFoot: { x: -18, y: -8 },
          rightFoot: { x: 12, y: -18 },
          frontHand: lerpVec({ x: 26, y: -74 }, { x: 38, y: -52 }, aimU),
          backHand: lerpVec({ x: -20, y: -72 }, { x: 22, y: -48 }, aimU),
          weaponAngle: 0.45,
          squashX: 1,
          squashY: 1,
        };
      }
      // Smoothly descending back to the ground to reclaim sword
      const descU = easeInOutCubic((sf - 125) / 20);
      return {
        hipY: lerp(-50, -48, descU),
        leanX: lerp(16, 7, descU),
        spineCurve: lerp(6, 3, descU),
        headTiltX: lerp(6, 2, descU),
        leftFoot: lerpVec({ x: -18, y: -8 }, { x: -20, y: 0 }, descU),
        rightFoot: lerpVec({ x: 12, y: -18 }, { x: 22, y: 0 }, descU),
        frontHand: lerpVec({ x: 38, y: -52 }, { x: 28, y: -62 }, descU),
        backHand: lerpVec({ x: 22, y: -48 }, { x: -12, y: -56 }, descU),
        weaponAngle: -0.42,
        squashX: 1,
        squashY: 1,
      };
    }

    if (ctx?.specialId === 'arena_greatsword') {
      const sf = ctx.specialFrame ?? t;
      if (sf < 14) {
        // Leave normal sword planted and raise hand to summon Titan Duskblade
        const u = easeOutCubic(sf / 14);
        return {
          hipY: lerp(-46, -48, u),
          leanX: lerp(-6, 4, u),
          spineCurve: lerp(-4, 2, u),
          headTiltX: 2,
          leftFoot: { x: -24, y: 0 },
          rightFoot: { x: 24, y: 0 },
          frontHand: lerpVec({ x: -12, y: -62 }, { x: 18, y: -86 }, u),
          backHand: lerpVec({ x: -18, y: -60 }, { x: 4, y: -76 }, u),
          weaponAngle: -1.55,
          squashX: 1,
          squashY: 1,
        };
      }
      if (sf < 76) {
        // Summoned sword grows from small -> colossal while winding up two-handed overhead
        const u = easeInOutCubic((sf - 14) / 62);
        return {
          hipY: lerp(-48, -42, u),
          leanX: lerp(4, -22, u),
          spineCurve: lerp(2, -11, u),
          headTiltX: lerp(2, -5, u),
          leftFoot: { x: -26, y: 0 },
          rightFoot: { x: 26, y: 0 },
          frontHand: lerpVec({ x: 18, y: -86 }, { x: -10, y: -102 }, u),
          backHand: lerpVec({ x: 4, y: -76 }, { x: -16, y: -92 }, u),
          weaponAngle: lerp(-1.55, -2.35, u),
          squashX: lerp(1, 0.92, u),
          squashY: lerp(1, 1.08, u),
        };
      }
      if (sf < 96) {
        // Heavy overhead cleave slamming down onto the enemy (impact @ f92)
        const u = easeOutExpo((sf - 76) / 16);
        return {
          hipY: lerp(-42, -39, u),
          leanX: lerp(-22, 30, u),
          spineCurve: lerp(-11, 13, u),
          headTiltX: lerp(-5, 7, u),
          leftFoot: { x: -30, y: 0 },
          rightFoot: { x: lerp(26, 36, u), y: 0 },
          frontHand: lerpVec({ x: -10, y: -102 }, { x: 44, y: -56 }, u),
          backHand: lerpVec({ x: -16, y: -92 }, { x: 26, y: -54 }, u),
          weaponAngle: lerp(-2.35, 0.1, u),
          squashX: lerp(0.95, 1.12, u),
          squashY: lerp(1.05, 0.9, u),
        };
      }
      // Follow-through hold then recover to reclaim planted sword
      const recU = easeInOutCubic((sf - 116) / 29);
      return {
        hipY: lerp(-39, -49, recU),
        leanX: lerp(30, 7, recU),
        spineCurve: lerp(13, 3, recU),
        headTiltX: lerp(7, 2, recU),
        leftFoot: { x: lerp(-30, -20, recU), y: 0 },
        rightFoot: { x: lerp(36, 22, recU), y: 0 },
        frontHand: lerpVec({ x: 44, y: -56 }, { x: 28, y: -62 }, recU),
        backHand: lerpVec({ x: 26, y: -54 }, { x: -12, y: -56 }, recU),
        weaponAngle: lerp(0.1, -0.42, recU),
        squashX: 1,
        squashY: 1,
      };
    }

    if (ctx?.specialId === 'unarmed_launch') {
      const sf = ctx.specialFrame ?? t;
      if (sf < 28) {
        // Leave sword planted and crouch deep while pulling back & charging fist
        const u = easeOutCubic(sf / 24);
        return {
          hipY: lerp(-46, -34, u),
          leanX: lerp(-4, -16, u),
          spineCurve: lerp(-2, -10, u),
          headTiltX: lerp(2, 5, u),
          leftFoot: { x: -24, y: 0 },
          rightFoot: { x: 22, y: 0 },
          frontHand: lerpVec({ x: 18, y: -58 }, { x: -18, y: -52 }, u),
          backHand: lerpVec({ x: -10, y: -58 }, { x: 22, y: -56 }, u),
          weaponAngle: -0.35,
          squashX: lerp(1, 0.92, u),
          squashY: lerp(1, 1.08, u),
        };
      }
      if (sf < 56) {
        // Jump & flying fist-lunge toward the enemy (punch lands @ f56)
        const u = (sf - 28) / 28;
        const strikeU = easeInOutCubic(Math.max(0, (u - 0.55) / 0.45));
        return {
          hipY: -48,
          leanX: lerp(14, 30, strikeU),
          spineCurve: lerp(6, 14, strikeU),
          headTiltX: 7,
          leftFoot: lerpVec({ x: -24, y: -12 }, { x: -30, y: -6 }, strikeU),
          rightFoot: lerpVec({ x: 12, y: -22 }, { x: 24, y: -10 }, strikeU),
          frontHand: lerpVec({ x: -14, y: -54 }, { x: 52, y: -62 }, strikeU),
          backHand: lerpVec({ x: 20, y: -56 }, { x: -22, y: -56 }, strikeU),
          weaponAngle: 0,
          squashX: lerp(1.06, 1.15, strikeU),
          squashY: lerp(0.95, 0.88, strikeU),
        };
      }
      if (sf < 88) {
        // Planted punch follow-through as enemy flies across the arena
        const u = easeOutExpo((sf - 56) / 10);
        return {
          hipY: lerp(-44, -40, u),
          leanX: 30,
          spineCurve: 13,
          headTiltX: 7,
          leftFoot: { x: -32, y: 0 },
          rightFoot: { x: 32, y: 0 },
          frontHand: { x: 54, y: -62 },
          backHand: { x: -22, y: -56 },
          weaponAngle: 0,
          squashX: 1.08,
          squashY: 0.94,
        };
      }
      // Recover cleanly to ready stance
      const recU = easeOutCubic((sf - 88) / 20);
      return {
        hipY: lerp(-40, -49, recU),
        leanX: lerp(30, 7, recU),
        spineCurve: lerp(13, 3, recU),
        headTiltX: lerp(7, 2, recU),
        leftFoot: { x: lerp(-32, -20, recU), y: 0 },
        rightFoot: { x: lerp(32, 22, recU), y: 0 },
        frontHand: lerpVec({ x: 54, y: -62 }, { x: 28, y: -62 }, recU),
        backHand: lerpVec({ x: -22, y: -56 }, { x: -12, y: -56 }, recU),
        weaponAngle: -0.42,
        squashX: 1,
        squashY: 1,
      };
    }

    if (ctx?.specialId === 'black_thunder') {
      const sf = ctx.specialFrame ?? t;
      if (sf < 74) {
        // Raise sword straight up to the sky to channel lightning upward
        const u = easeOutCubic(sf / 16);
        return {
          hipY: lerp(-46, -49, u),
          leanX: lerp(-4, 4, u),
          spineCurve: lerp(-2, 2, u),
          headTiltX: lerp(0, -4, u),
          leftFoot: { x: -24, y: 0 },
          rightFoot: { x: 24, y: 0 },
          frontHand: lerpVec({ x: 18, y: -64 }, { x: 18, y: -102 }, u),
          backHand: { x: -16, y: -58 },
          weaponAngle: lerp(-0.85, -Math.PI / 2, u),
          squashX: 1,
          squashY: 1,
        };
      }
      if (sf < 96) {
        // Snap sword forward/downward to call the thunderbolt onto the enemy (impact @ f78)
        const u = easeOutExpo((sf - 74) / 10);
        return {
          hipY: lerp(-49, -44, u),
          leanX: lerp(4, 24, u),
          spineCurve: lerp(2, 10, u),
          headTiltX: lerp(-4, 5, u),
          leftFoot: { x: -26, y: 0 },
          rightFoot: { x: 28, y: 0 },
          frontHand: lerpVec({ x: 18, y: -102 }, { x: 46, y: -74 }, u),
          backHand: { x: -18, y: -60 },
          weaponAngle: lerp(-Math.PI / 2, -0.35, u),
          squashX: lerp(1, 1.08, u),
          squashY: lerp(1, 0.94, u),
        };
      }
      // Hold strike pose then settle back toward ready stance
      const recU = easeOutCubic((sf - 110) / 28);
      return {
        hipY: lerp(-44, -49, recU),
        leanX: lerp(24, 7, recU),
        spineCurve: lerp(10, 3, recU),
        headTiltX: lerp(5, 2, recU),
        leftFoot: { x: lerp(-26, -20, recU), y: 0 },
        rightFoot: { x: lerp(28, 22, recU), y: 0 },
        frontHand: lerpVec({ x: 46, y: -74 }, { x: 28, y: -62 }, recU),
        backHand: lerpVec({ x: -18, y: -60 }, { x: -12, y: -56 }, recU),
        weaponAngle: lerp(-0.35, -0.42, recU),
        squashX: 1,
        squashY: 1,
      };
    }

    const u = easeOutExpo(Math.min(1, t / 20));
    return {
      hipY: -46,
      leanX: lerp(-10, 24, u),
      spineCurve: 10,
      headTiltX: 5,
      leftFoot: { x: -26, y: 0 },
      rightFoot: { x: 28, y: 0 },
      frontHand: { x: 46, y: -74 },
      backHand: { x: -18, y: -60 },
      weaponAngle: -0.35,
      squashX: 1.08,
      squashY: 0.94,
    };
  }

  if (f.action === 'special_vic') {
    const sf = ctx?.specialFrame ?? t;
    const freezeUntil =
      ctx?.specialId === 'aerial_lasers'
        ? 22
        : ctx?.specialId === 'arena_greatsword'
          ? 90
          : ctx?.specialId === 'unarmed_launch'
            ? 56
            : ctx?.specialId === 'black_thunder'
              ? 76
              : 0;
    if (sf < freezeUntil) {
      // Enemy is stopped/frozen upright until the special strike actually lands
      return {
        hipY: -49,
        leanX: 2,
        spineCurve: 1,
        headTiltX: 1,
        leftFoot: { x: -20, y: 0 },
        rightFoot: { x: 20, y: 0 },
        frontHand: { x: 22, y: -60 },
        backHand: { x: -14, y: -56 },
        weaponAngle: -0.42,
        squashX: 1,
        squashY: 1,
      };
    }
    if (ctx?.specialId === 'unarmed_launch') {
      if (sf < 94) {
        // Launched spinning/tumbling backward through the air to the arena edge
        const u = easeOutCubic((sf - 56) / 14);
        return {
          hipY: lerp(-46, -42, u),
          leanX: lerp(-12, -34, u),
          spineCurve: -14,
          headTiltX: -12,
          leftFoot: { x: 18, y: -12 },
          rightFoot: { x: 28, y: -22 },
          frontHand: { x: -34, y: -68 },
          backHand: { x: -14, y: -78 },
          weaponAngle: -2.4,
          squashX: 1.08,
          squashY: 0.92,
        };
      }
      // Landed hard at the far wall before knockdown
      return {
        hipY: -24,
        leanX: -32,
        spineCurve: -8,
        headTiltX: -10,
        leftFoot: { x: 22, y: 0 },
        rightFoot: { x: 10, y: 0 },
        frontHand: { x: -40, y: -6 },
        backHand: { x: -18, y: -8 },
        weaponAngle: 0.16,
        squashX: 1.06,
        squashY: 0.94,
      };
    }
    const recoilStart = freezeUntil;
    const hitU = easeOutExpo((sf - recoilStart) / 8);
    const shake = Math.sin(sf * 0.75) * 4.5;
    return {
      hipY: lerp(-49, -41, hitU),
      leanX: lerp(2, -18, hitU) + shake,
      spineCurve: -12,
      headTiltX: -8,
      leftFoot: { x: -22, y: 0 },
      rightFoot: { x: 16, y: 0 },
      frontHand: { x: -10, y: -68 },
      backHand: { x: -26, y: -54 },
      weaponAngle: -2.05,
      squashX: 0.94,
      squashY: 1.06,
    };
  }

  if (f.action === 'ko') {
    const settle = easeOutCubic(t / 14);
    return {
      hipY: lerp(-24, -10, settle),
      leanX: lerp(-22, -40, settle),
      spineCurve: -8,
      headTiltX: -10,
      leftFoot: { x: 26, y: 0 },
      rightFoot: { x: 10, y: 0 },
      frontHand: { x: -48, y: -4 },
      backHand: { x: -24, y: -6 },
      weaponAngle: 0.14,
      squashX: 1,
      squashY: 1,
    };
  }

  if (f.action === 'finisher_vic') {
    const finId = ctx?.finisherId;
    const sf = ctx?.finisherFrame ?? t;
    if (finId === 'rising_slash') {
      if (sf < 28) {
        // Staggered upright before the rising launcher connects
        const sway = Math.sin(sf * 0.35) * 3;
        return {
          hipY: -44,
          leanX: -10 + sway,
          spineCurve: -8,
          headTiltX: -5,
          leftFoot: { x: -20, y: 0 },
          rightFoot: { x: 18, y: 0 },
          frontHand: { x: -8, y: -58 },
          backHand: { x: -24, y: -52 },
          weaponAngle: -2.0,
          squashX: 0.96,
          squashY: 1.04,
        };
      }
      if (sf < 58) {
        // Launched skyward by High Time uppercut!
        const u = easeOutCubic((sf - 28) / 14);
        return {
          hipY: lerp(-44, -48, u),
          leanX: lerp(-12, -30, u),
          spineCurve: -14,
          headTiltX: -12,
          leftFoot: { x: 16, y: -12 },
          rightFoot: { x: 26, y: -22 },
          frontHand: { x: -30, y: -74 },
          backHand: { x: -12, y: -82 },
          weaponAngle: -2.45,
          squashX: 0.92,
          squashY: 1.1,
        };
      }
      // Crashed back to the floor
      return {
        hipY: -12,
        leanX: -38,
        spineCurve: -8,
        headTiltX: -10,
        leftFoot: { x: 24, y: 0 },
        rightFoot: { x: 10, y: 0 },
        frontHand: { x: -46, y: -4 },
        backHand: { x: -22, y: -6 },
        weaponAngle: 0.14,
        squashX: 1.08,
        squashY: 0.92,
      };
    }

    const finSpec = finId ? FINISHERS[finId] : null;
    if (finId === 'tempest_thunder') {
      // Victim stands and braces/clashes blades across the 5 storm beats before collapsing @ f315
      if (sf < 315) {
        const recoil =
          (sf >= 30 && sf < 52) ||
          (sf >= 95 && sf < 118) ||
          (sf >= 160 && sf < 185) ||
          (sf >= 225 && sf < 250) ||
          (sf >= 280 && sf < 302);
        const sway = Math.sin(sf * 0.08) * 3;
        return {
          hipY: recoil ? -43 : -47,
          leanX: (recoil ? -14 : 8) + sway,
          spineCurve: recoil ? -8 : 4,
          headTiltX: recoil ? -5 : 3,
          leftFoot: { x: -24, y: 0 },
          rightFoot: { x: 24, y: 0 },
          frontHand: recoil ? { x: 18, y: -74 } : { x: 28, y: -76 },
          backHand: { x: 8, y: -64 },
          weaponAngle: recoil ? -1.75 : -1.25,
          squashX: recoil ? 0.96 : 1,
          squashY: recoil ? 1.04 : 1,
        };
      }
      const fallU = easeOutCubic((sf - 315) / 26);
      return {
        hipY: lerp(-46, -14, fallU),
        leanX: lerp(-12, -38, fallU),
        spineCurve: -8,
        headTiltX: -10,
        leftFoot: lerpVec({ x: -22, y: 0 }, { x: 24, y: 0 }, fallU),
        rightFoot: lerpVec({ x: 22, y: 0 }, { x: 10, y: 0 }, fallU),
        frontHand: lerpVec({ x: 18, y: -74 }, { x: -46, y: -4 }, fallU),
        backHand: lerpVec({ x: 8, y: -64 }, { x: -22, y: -6 }, fallU),
        weaponAngle: lerp(-1.75, 0.14, fallU),
        squashX: 1,
        squashY: 1,
      };
    }
    if (finId === 'eclipse_iaijutsu') {
      // Stands stunned, holds stiff during the split-second delayed cut (42..52), then collapses
      if (sf < 52) {
        return {
          hipY: -47,
          leanX: sf >= 42 ? -4 : -8,
          spineCurve: sf >= 42 ? -2 : -5,
          headTiltX: sf >= 42 ? 2 : -4,
          leftFoot: { x: -20, y: 0 },
          rightFoot: { x: 18, y: 0 },
          frontHand: { x: -12, y: -58 },
          backHand: { x: -22, y: -54 },
          weaponAngle: -2.0,
          squashX: 1,
          squashY: 1,
        };
      }
      const fallU = easeOutCubic((sf - 52) / 18);
      return {
        hipY: lerp(-47, -12, fallU),
        leanX: lerp(-4, -38, fallU),
        spineCurve: -8,
        headTiltX: -10,
        leftFoot: lerpVec({ x: -20, y: 0 }, { x: 24, y: 0 }, fallU),
        rightFoot: lerpVec({ x: 18, y: 0 }, { x: 10, y: 0 }, fallU),
        frontHand: lerpVec({ x: -12, y: -58 }, { x: -46, y: -4 }, fallU),
        backHand: lerpVec({ x: -22, y: -54 }, { x: -22, y: -6 }, fallU),
        weaponAngle: lerp(-2.0, 0.14, fallU),
        squashX: 1,
        squashY: 1,
      };
    }
    if (finId === 'judgment_cut') {
      // Frozen inside dimensional sphere until impact @ 58, then shattered backward
      if (sf < 58) {
        return {
          hipY: -47,
          leanX: -6,
          spineCurve: -5,
          headTiltX: -3,
          leftFoot: { x: -20, y: 0 },
          rightFoot: { x: 16, y: 0 },
          frontHand: { x: -10, y: -60 },
          backHand: { x: -24, y: -54 },
          weaponAngle: -2.0,
          squashX: 1,
          squashY: 1,
        };
      }
      const shatterU = easeOutExpo((sf - 58) / 12);
      return {
        hipY: lerp(-47, -26, shatterU),
        leanX: lerp(-6, -34, shatterU),
        spineCurve: -14,
        headTiltX: -10,
        leftFoot: { x: 14, y: 0 },
        rightFoot: { x: 24, y: 0 },
        frontHand: { x: -34, y: -44 },
        backHand: { x: -18, y: -64 },
        weaponAngle: -2.4,
        squashX: 1.06,
        squashY: 0.94,
      };
    }
    if (finSpec && !finSpec.victimCrawls) {
      const hit = sf >= finSpec.impactFrame;
      const flurryJolt = finId === 'phantom_flurry' && sf >= 12 && sf < 56 ? Math.sin(sf * 0.9) * 8 : 0;
      return {
        hipY: hit ? -36 : -44,
        leanX: (hit ? -24 : -10) + flurryJolt,
        spineCurve: hit ? -12 : -6,
        headTiltX: hit ? -8 : -4,
        leftFoot: { x: -20, y: 0 },
        rightFoot: { x: 16, y: 0 },
        frontHand: { x: -10, y: -62 },
        backHand: { x: -24, y: -54 },
        weaponAngle: -2.05,
        squashX: hit ? 0.94 : 1,
        squashY: hit ? 1.06 : 1,
      };
    }

    const crawl = Math.sin(t * 0.22) * 5;
    return {
      hipY: -22,
      leanX: -12,
      spineCurve: 10,
      headTiltX: 4,
      leftFoot: { x: -28, y: 0 },
      rightFoot: { x: -8, y: 0 },
      frontHand: { x: 26 + crawl, y: -3 },
      backHand: { x: 8, y: -6 },
      weaponAngle: 0.22,
      squashX: 1.04,
      squashY: 0.95,
    };
  }

  if (f.action === 'finisher_atk') {
    if (ctx?.finisherId === 'rising_slash') {
      const sf = ctx.finisherFrame ?? t;
      if (sf < 24) {
        // DMC High Time deep low crouch with sword dropped behind/below
        const u = easeInOutCubic(sf / 18);
        return {
          hipY: lerp(-49, -34, u),
          leanX: lerp(7, 14, u),
          spineCurve: lerp(3, 10, u),
          headTiltX: 4,
          leftFoot: { x: -24, y: 0 },
          rightFoot: { x: 26, y: 0 },
          frontHand: lerpVec({ x: 28, y: -62 }, { x: -4, y: -22 }, u),
          backHand: lerpVec({ x: -12, y: -56 }, { x: -20, y: -44 }, u),
          weaponAngle: lerp(-0.42, 1.52, u),
          squashX: lerp(1, 1.07, u),
          squashY: lerp(1, 0.93, u),
        };
      }
      if (sf < 44) {
        // Explosive skyward uppercut slash leaping up with the blade!
        const u = easeOutExpo((sf - 24) / 10);
        return {
          hipY: lerp(-34, -52, u),
          leanX: lerp(14, 18, u),
          spineCurve: lerp(10, -4, u),
          headTiltX: -6,
          leftFoot: lerpVec({ x: -24, y: 0 }, { x: -14, y: -12 }, u),
          rightFoot: lerpVec({ x: 26, y: 0 }, { x: 18, y: -22 }, u),
          frontHand: lerpVec({ x: -4, y: -22 }, { x: 42, y: -112 }, u),
          backHand: lerpVec({ x: -20, y: -44 }, { x: -12, y: -74 }, u),
          weaponAngle: lerp(1.52, -1.32, u),
          squashX: lerp(1.06, 0.9, u),
          squashY: lerp(0.94, 1.12, u),
        };
      }
      // Stylish landing follow-through
      const recU = easeOutCubic((sf - 44) / 22);
      return {
        hipY: lerp(-50, -49, recU),
        leanX: lerp(18, 8, recU),
        spineCurve: lerp(-4, 3, recU),
        headTiltX: lerp(-6, 2, recU),
        leftFoot: { x: lerp(-16, -20, recU), y: 0 },
        rightFoot: { x: lerp(22, 22, recU), y: 0 },
        frontHand: lerpVec({ x: 42, y: -112 }, { x: 30, y: -78 }, recU),
        backHand: lerpVec({ x: -12, y: -74 }, { x: -14, y: -58 }, recU),
        weaponAngle: lerp(-1.32, -0.78, recU),
        squashX: 1,
        squashY: 1,
      };
    }

    if (ctx?.finisherId === 'spin_cut') {
      // Crescent Tempest (Sekiro Spiral Cloud Passage): continuous 360-deg whirling spin slashes
      const sf = ctx.finisherFrame ?? t;
      if (sf < 12) {
        const u = easeOutCubic(sf / 12);
        return {
          hipY: lerp(-49, -42, u),
          leanX: lerp(7, -14, u),
          spineCurve: -8,
          headTiltX: -4,
          leftFoot: { x: -24, y: 0 },
          rightFoot: { x: 24, y: 0 },
          frontHand: lerpVec({ x: 28, y: -62 }, { x: -24, y: -76 }, u),
          backHand: { x: 14, y: -60 },
          weaponAngle: lerp(-0.42, -2.5, u),
          squashX: 1,
          squashY: 1,
        };
      }
      if (sf < 50) {
        const spin = (sf - 12) * 0.52;
        return {
          hipY: -46 + Math.sin(spin * 2) * 4,
          leanX: Math.cos(spin) * 18,
          spineCurve: Math.cos(spin) * 10,
          headTiltX: Math.cos(spin) * 5,
          leftFoot: { x: -18 - Math.sin(spin) * 10, y: -10 },
          rightFoot: { x: 18 + Math.sin(spin) * 10, y: -14 },
          frontHand: { x: Math.cos(spin) * 44, y: -68 + Math.sin(spin) * 22 },
          backHand: { x: -Math.cos(spin) * 26, y: -62 - Math.sin(spin) * 12 },
          weaponAngle: -2.2 + spin,
          squashX: 1.06,
          squashY: 0.95,
        };
      }
      const recU = easeOutCubic((sf - 50) / 22);
      return {
        hipY: lerp(-38, -49, recU),
        leanX: lerp(28, 8, recU),
        spineCurve: lerp(12, 3, recU),
        headTiltX: 3,
        leftFoot: { x: lerp(-28, -20, recU), y: 0 },
        rightFoot: { x: lerp(30, 22, recU), y: 0 },
        frontHand: lerpVec({ x: 52, y: -54 }, { x: 30, y: -62 }, recU),
        backHand: lerpVec({ x: -20, y: -58 }, { x: -12, y: -56 }, recU),
        weaponAngle: lerp(0.28, -0.42, recU),
        squashX: 1,
        squashY: 1,
      };
    }

    if (ctx?.finisherId === 'overhead_slam') {
      // Sundered Earth (Elden Ring Lion Claw): deep crouch -> front-flip somersault -> vertical earth slam
      const sf = ctx.finisherFrame ?? t;
      if (sf < 10) {
        const u = easeOutCubic(sf / 10);
        return {
          hipY: lerp(-49, -34, u),
          leanX: lerp(7, -14, u),
          spineCurve: -10,
          headTiltX: -4,
          leftFoot: { x: -24, y: 0 },
          rightFoot: { x: 24, y: 0 },
          frontHand: lerpVec({ x: 28, y: -62 }, { x: -16, y: -96 }, u),
          backHand: { x: -18, y: -82 },
          weaponAngle: lerp(-0.42, -2.55, u),
          squashX: 1.08,
          squashY: 0.92,
        };
      }
      if (sf < 38) {
        const u = (sf - 10) / 28;
        const flipAng = -2.55 + u * Math.PI * 1.25;
        return {
          hipY: -46,
          leanX: lerp(-12, 24, u),
          spineCurve: Math.sin(u * Math.PI) * 14,
          headTiltX: 8,
          leftFoot: { x: -18, y: -20 },
          rightFoot: { x: 14, y: -16 },
          frontHand: { x: Math.cos(flipAng) * 34 + 12, y: -74 + Math.sin(flipAng) * 34 },
          backHand: { x: Math.cos(flipAng) * 24 + 4, y: -70 + Math.sin(flipAng) * 28 },
          weaponAngle: flipAng,
          squashX: 0.94,
          squashY: 1.06,
        };
      }
      // Brutal vertical earth slam held into floor
      const recU = easeOutCubic((sf - 50) / 16);
      return {
        hipY: lerp(-31, -44, recU),
        leanX: lerp(26, 12, recU),
        spineCurve: lerp(13, 5, recU),
        headTiltX: 6,
        leftFoot: { x: -28, y: 0 },
        rightFoot: { x: 28, y: 0 },
        frontHand: lerpVec({ x: 42, y: -26 }, { x: 34, y: -44 }, recU),
        backHand: lerpVec({ x: 30, y: -32 }, { x: 20, y: -48 }, recU),
        weaponAngle: lerp(Math.PI / 2 - 0.14, 1.1, recU),
        squashX: lerp(1.12, 1, recU),
        squashY: lerp(0.9, 1, recU),
      };
    }

    if (ctx?.finisherId === 'judgment_cut') {
      // Judgment Cut End (Vergil): iai crouch -> rapid flash cuts -> back-turned calm sheathing
      const sf = ctx.finisherFrame ?? t;
      if (sf < 14) {
        const u = easeOutCubic(sf / 14);
        return {
          hipY: lerp(-49, -40, u),
          leanX: lerp(7, 16, u),
          spineCurve: 6,
          headTiltX: 4,
          leftFoot: { x: -26, y: 0 },
          rightFoot: { x: 24, y: 0 },
          frontHand: lerpVec({ x: 28, y: -62 }, { x: 8, y: -50 }, u),
          backHand: { x: -16, y: -52 },
          weaponAngle: lerp(-0.42, 0.1, u),
          squashX: 1,
          squashY: 1,
        };
      }
      if (sf < 48) {
        const flashStep = Math.floor((sf - 14) / 6);
        const odd = flashStep % 2 === 1;
        return {
          hipY: -43,
          leanX: odd ? 24 : -12,
          spineCurve: odd ? 10 : -8,
          headTiltX: 4,
          leftFoot: { x: -26, y: 0 },
          rightFoot: { x: 28, y: 0 },
          frontHand: odd ? { x: 50, y: -64 } : { x: -12, y: -88 },
          backHand: { x: -18, y: -58 },
          weaponAngle: odd ? 0.25 : -2.15,
          squashX: 1.08,
          squashY: 0.94,
        };
      }
      // Calm upright Vergil sheathing pose while sphere shatters @ f58
      return {
        hipY: -49,
        leanX: 2,
        spineCurve: 1,
        headTiltX: -2,
        leftFoot: { x: -18, y: 0 },
        rightFoot: { x: 18, y: 0 },
        frontHand: { x: 12, y: -50 },
        backHand: { x: -14, y: -52 },
        weaponAngle: 0.14,
        squashX: 1,
        squashY: 1,
      };
    }

    if (ctx?.finisherId === 'shinobi_deathblow') {
      // Crimson Deathblow (Sekiro): stagger slice -> reverse-grip poise -> plunging deathblow
      const sf = ctx.finisherFrame ?? t;
      if (sf < 20) {
        const u = easeOutExpo(sf / 14);
        return {
          hipY: -44,
          leanX: lerp(-8, 18, u),
          spineCurve: 8,
          headTiltX: 4,
          leftFoot: { x: -26, y: 0 },
          rightFoot: { x: 24, y: 0 },
          frontHand: lerpVec({ x: -8, y: -62 }, { x: 42, y: -54 }, u),
          backHand: { x: -16, y: -56 },
          weaponAngle: lerp(-1.8, 0.2, u),
          squashX: 1.04,
          squashY: 0.96,
        };
      }
      if (sf < 36) {
        const u = easeInOutCubic((sf - 20) / 14);
        return {
          hipY: lerp(-44, -48, u),
          leanX: lerp(18, 6, u),
          spineCurve: -4,
          headTiltX: 6,
          leftFoot: { x: -22, y: 0 },
          rightFoot: { x: 22, y: 0 },
          frontHand: lerpVec({ x: 42, y: -54 }, { x: 26, y: -100 }, u),
          backHand: lerpVec({ x: -16, y: -56 }, { x: 10, y: -88 }, u),
          weaponAngle: lerp(0.2, 1.56, u),
          squashX: 0.95,
          squashY: 1.05,
        };
      }
      // Decisive downward crimson deathblow thrust into kneeling enemy (@ f44)
      const plungeU = easeOutExpo((sf - 36) / 9);
      return {
        hipY: lerp(-48, -36, plungeU),
        leanX: lerp(6, 24, plungeU),
        spineCurve: 11,
        headTiltX: 8,
        leftFoot: { x: -28, y: 0 },
        rightFoot: { x: 26, y: 0 },
        frontHand: lerpVec({ x: 26, y: -100 }, { x: 38, y: -40 }, plungeU),
        backHand: lerpVec({ x: 10, y: -88 }, { x: 24, y: -48 }, plungeU),
        weaponAngle: lerp(1.56, 1.15, plungeU),
        squashX: lerp(0.95, 1.08, plungeU),
        squashY: lerp(1.05, 0.93, plungeU),
      };
    }

    if (ctx?.finisherId === 'eclipse_iaijutsu') {
      // Eclipse Iaijutsu: tense iai crouch -> supersonic pass-through slash -> calm sheathing on far side
      const sf = ctx.finisherFrame ?? t;
      if (sf < 38) {
        const u = easeOutCubic(sf / 20);
        return {
          hipY: lerp(-49, -37, u),
          leanX: lerp(7, 18, u),
          spineCurve: 8,
          headTiltX: 5,
          leftFoot: { x: -26, y: 0 },
          rightFoot: { x: 24, y: 0 },
          frontHand: lerpVec({ x: 28, y: -62 }, { x: 8, y: -48 }, u),
          backHand: { x: -16, y: -50 },
          weaponAngle: 0.08,
          squashX: 1.04,
          squashY: 0.96,
        };
      }
      if (sf < 46) {
        return {
          hipY: -39,
          leanX: 34,
          spineCurve: 14,
          headTiltX: 7,
          leftFoot: { x: -34, y: 0 },
          rightFoot: { x: 34, y: 0 },
          frontHand: { x: 56, y: -56 },
          backHand: { x: -24, y: -54 },
          weaponAngle: 0.02,
          squashX: 1.18,
          squashY: 0.88,
        };
      }
      // Calm upright sheathing pose after dashing through
      const sheatheU = easeOutCubic((sf - 46) / 14);
      return {
        hipY: lerp(-39, -49, sheatheU),
        leanX: lerp(34, 4, sheatheU),
        spineCurve: lerp(14, 2, sheatheU),
        headTiltX: 1,
        leftFoot: { x: -18, y: 0 },
        rightFoot: { x: 18, y: 0 },
        frontHand: lerpVec({ x: 56, y: -56 }, { x: 12, y: -50 }, sheatheU),
        backHand: { x: -14, y: -52 },
        weaponAngle: lerp(0.02, 0.14, sheatheU),
        squashX: 1,
        squashY: 1,
      };
    }

    if (ctx?.finisherId === 'phantom_flurry') {
      // Phantom Flurry: rapid alternating strike angles across teleport blitz -> final cleave @ f56
      const sf = ctx.finisherFrame ?? t;
      if (sf < 46) {
        const beat = Math.floor(sf / 8);
        const odd = beat % 2 === 1;
        return {
          hipY: -44,
          leanX: odd ? 24 : 18,
          spineCurve: odd ? 10 : -6,
          headTiltX: 5,
          leftFoot: { x: -24, y: sf >= 20 && sf < 36 ? -12 : 0 },
          rightFoot: { x: 26, y: sf >= 20 && sf < 36 ? -18 : 0 },
          frontHand: odd ? { x: 50, y: -56 } : { x: 44, y: -88 },
          backHand: { x: -18, y: -58 },
          weaponAngle: odd ? 0.35 : -1.05,
          squashX: 1.1,
          squashY: 0.92,
        };
      }
      if (sf < 54) {
        // Final windup coil before finisher blow @ 56
        const u = easeInOutCubic((sf - 46) / 8);
        return {
          hipY: -48,
          leanX: lerp(18, -18, u),
          spineCurve: -10,
          headTiltX: -4,
          leftFoot: { x: -28, y: 0 },
          rightFoot: { x: 20, y: 0 },
          frontHand: { x: -20, y: -100 },
          backHand: { x: -12, y: -74 },
          weaponAngle: -2.4,
          squashX: 0.94,
          squashY: 1.06,
        };
      }
      const strikeU = easeOutExpo((sf - 54) / 10);
      return {
        hipY: lerp(-48, -40, strikeU),
        leanX: lerp(-18, 30, strikeU),
        spineCurve: 12,
        headTiltX: 6,
        leftFoot: { x: -30, y: 0 },
        rightFoot: { x: 32, y: 0 },
        frontHand: lerpVec({ x: -20, y: -100 }, { x: 56, y: -54 }, strikeU),
        backHand: { x: -22, y: -58 },
        weaponAngle: lerp(-2.4, 0.18, strikeU),
        squashX: 1.12,
        squashY: 0.91,
      };
    }

    if (ctx?.finisherId === 'sepulcher_split') {
      // Sepulcher Split (Blasphemous): summon slabs overhead -> brutal crushing downward split -> solemn stand
      const sf = ctx.finisherFrame ?? t;
      if (sf < 34) {
        const u = easeInOutCubic(sf / 24);
        return {
          hipY: lerp(-49, -46, u),
          leanX: lerp(7, -10, u),
          spineCurve: lerp(3, -7, u),
          headTiltX: lerp(2, -5, u),
          leftFoot: { x: -22, y: 0 },
          rightFoot: { x: 22, y: 0 },
          frontHand: lerpVec({ x: 28, y: -62 }, { x: 14, y: -106 }, u),
          backHand: lerpVec({ x: -12, y: -56 }, { x: -10, y: -96 }, u),
          weaponAngle: lerp(-0.42, -Math.PI / 2, u),
          squashX: 0.95,
          squashY: 1.05,
        };
      }
      if (sf < 52) {
        // Crushing downward two-handed cleave as monoliths slam shut @ f46
        const u = easeOutExpo((sf - 34) / 12);
        return {
          hipY: lerp(-46, -38, u),
          leanX: lerp(-10, 24, u),
          spineCurve: lerp(-7, 12, u),
          headTiltX: lerp(-5, 6, u),
          leftFoot: { x: -28, y: 0 },
          rightFoot: { x: 28, y: 0 },
          frontHand: lerpVec({ x: 14, y: -106 }, { x: 42, y: -44 }, u),
          backHand: lerpVec({ x: -10, y: -96 }, { x: 24, y: -48 }, u),
          weaponAngle: lerp(-Math.PI / 2, 0.78, u),
          squashX: lerp(0.95, 1.1, u),
          squashY: lerp(1.05, 0.92, u),
        };
      }
      // Solemn upright judgment stance
      const recU = easeOutCubic((sf - 52) / 20);
      return {
        hipY: lerp(-38, -49, recU),
        leanX: lerp(24, 4, recU),
        spineCurve: lerp(12, 2, recU),
        headTiltX: lerp(6, 2, recU),
        leftFoot: { x: lerp(-28, -18, recU), y: 0 },
        rightFoot: { x: lerp(28, 18, recU), y: 0 },
        frontHand: lerpVec({ x: 42, y: -44 }, { x: 26, y: -60 }, recU),
        backHand: lerpVec({ x: 24, y: -48 }, { x: -14, y: -56 }, recU),
        weaponAngle: lerp(0.78, 0.52, recU),
        squashX: 1,
        squashY: 1,
      };
    }

    if (ctx?.finisherId === 'tempest_thunder') {
      // Tempest of the Dusk (Sekiro Sword Saint): 5 storm-lit clash exchanges -> Mortal Draw windup -> decisive slash
      const sf = ctx.finisherFrame ?? t;
      const sway = Math.sin(sf * 0.08) * 3;
      if (sf < 90) {
        // Exchange 1: low guard -> rising storm clash @ f30
        const strike = sf >= 24 && sf < 52;
        const u = easeOutExpo((sf - 24) / 14);
        return {
          hipY: strike ? -44 : -48,
          leanX: strike ? lerp(-6, 20, u) : 10 + sway,
          spineCurve: strike ? 8 : 4,
          headTiltX: 4,
          leftFoot: { x: -26, y: 0 },
          rightFoot: { x: 26, y: 0 },
          frontHand: strike ? lerpVec({ x: -8, y: -42 }, { x: 42, y: -82 }, u) : { x: 28 + sway, y: -70 },
          backHand: { x: -12, y: -60 },
          weaponAngle: strike ? lerp(1.1, -0.95, u) : -0.85 + sway * 0.03,
          squashX: 1,
          squashY: 1,
        };
      }
      if (sf < 220) {
        // Exchange 2 & 3: locked blade struggle -> reverse cross clash @ f95 & f160
        const pulse = Math.sin((sf - 90) * 0.11);
        return {
          hipY: -45 + pulse * 2,
          leanX: 16 + pulse * 6,
          spineCurve: 7,
          headTiltX: 4,
          leftFoot: { x: -28, y: 0 },
          rightFoot: { x: 28, y: 0 },
          frontHand: { x: 36 + pulse * 6, y: -74 - pulse * 6 },
          backHand: { x: 10, y: -64 },
          weaponAngle: -1.05 + pulse * 0.35,
          squashX: 1,
          squashY: 1,
        };
      }
      if (sf < 280) {
        // Exchange 4: high leaping overhead storm cleave @ f225
        const u = easeOutExpo((sf - 220) / 18);
        return {
          hipY: lerp(-48, -42, u),
          leanX: lerp(-12, 24, u),
          spineCurve: lerp(-8, 10, u),
          headTiltX: 5,
          leftFoot: { x: -28, y: 0 },
          rightFoot: { x: 30, y: 0 },
          frontHand: lerpVec({ x: -16, y: -100 }, { x: 46, y: -64 }, u),
          backHand: { x: -16, y: -62 },
          weaponAngle: lerp(-2.35, -0.15, u),
          squashX: 1.04,
          squashY: 0.96,
        };
      }
      if (sf < 310) {
        // Mortal Draw coil before decisive thunder strike @ f315
        const u = easeInOutCubic((sf - 280) / 22);
        return {
          hipY: lerp(-44, -40, u),
          leanX: lerp(12, -20, u),
          spineCurve: lerp(4, -10, u),
          headTiltX: -4,
          leftFoot: { x: -28, y: 0 },
          rightFoot: { x: 20, y: 0 },
          frontHand: lerpVec({ x: 32, y: -72 }, { x: -22, y: -102 }, u),
          backHand: { x: 8, y: -62 },
          weaponAngle: lerp(-0.95, -2.48, u),
          squashX: 0.94,
          squashY: 1.06,
        };
      }
      if (sf < 342) {
        // Decisive lightning-lit sever @ f315
        const u = easeOutExpo((sf - 310) / 12);
        return {
          hipY: lerp(-40, -42, u),
          leanX: lerp(-20, 34, u),
          spineCurve: lerp(-10, 14, u),
          headTiltX: 7,
          leftFoot: { x: -32, y: 0 },
          rightFoot: { x: 34, y: 0 },
          frontHand: lerpVec({ x: -22, y: -102 }, { x: 56, y: -56 }, u),
          backHand: { x: -24, y: -58 },
          weaponAngle: lerp(-2.48, 0.2, u),
          squashX: 1.14,
          squashY: 0.9,
        };
      }
      // Calm Sword Saint aftermath stance in the rain
      const calmU = easeOutCubic((sf - 342) / 28);
      return {
        hipY: lerp(-42, -49, calmU),
        leanX: lerp(34, 6, calmU),
        spineCurve: lerp(14, 2, calmU),
        headTiltX: 2,
        leftFoot: { x: lerp(-32, -20, calmU), y: 0 },
        rightFoot: { x: lerp(34, 22, calmU), y: 0 },
        frontHand: lerpVec({ x: 56, y: -56 }, { x: 26, y: -60 }, calmU),
        backHand: { x: -14, y: -56 },
        weaponAngle: lerp(0.2, -0.55, calmU),
        squashX: 1,
        squashY: 1,
      };
    }

    // Supports both crisp 1s finishers and the 6.5s Tempest Thunder slow-mo clash duel
    const isLong = t > 75;
    if (isLong) {
      const clash = t < 290;
      const sway = Math.sin(t * 0.06) * 4;
      const strikeU = easeOutExpo((t - 295) / 18);
      return {
        hipY: clash ? -45 + sway * 0.4 : lerp(-48, -40, strikeU),
        leanX: clash ? 12 + sway : lerp(-18, 32, strikeU),
        spineCurve: clash ? 6 : lerp(-10, 14, strikeU),
        headTiltX: clash ? 4 : lerp(-4, 8, strikeU),
        leftFoot: { x: -28, y: 0 },
        rightFoot: { x: clash ? 26 : lerp(18, 34, strikeU), y: 0 },
        frontHand: clash
          ? { x: 34 + sway, y: -72 + sway * 0.5 }
          : lerpVec({ x: -20, y: -102 }, { x: 56, y: -54 }, strikeU),
        backHand: clash ? { x: -12, y: -62 } : { x: -22, y: -58 },
        weaponAngle: clash ? -0.95 + sway * 0.04 : lerp(-2.4, 0.18, strikeU),
        squashX: clash ? 1 : lerp(0.94, 1.14, strikeU),
        squashY: clash ? 1 : lerp(1.06, 0.9, strikeU),
      };
    }
    const u = easeOutExpo((t - 24) / 10);
    const strike = t >= 24;
    return {
      hipY: strike ? lerp(-50, -42, u) : -50,
      leanX: strike ? lerp(-14, 28, u) : -14,
      spineCurve: strike ? 10 : -8,
      headTiltX: strike ? 6 : -4,
      leftFoot: { x: -28, y: 0 },
      rightFoot: { x: strike ? 30 : 18, y: 0 },
      frontHand: strike
        ? lerpVec({ x: -18, y: -98 }, { x: 54, y: -56 }, u)
        : { x: -18, y: -98 },
      backHand: strike ? { x: -18, y: -60 } : { x: 10, y: -74 },
      weaponAngle: strike ? lerp(-2.2, 0.15, u) : -2.2,
      squashX: strike ? 1.1 : 0.95,
      squashY: strike ? 0.93 : 1.05,
    };
  }

  if (f.action === 'guard_break' || f.action === 'parry_stagger') {
    const sway = Math.sin(t * 0.26) * 6;
    return {
      hipY: -44 + Math.abs(sway) * 0.3,
      leanX: -14 + sway,
      spineCurve: -10,
      headTiltX: -6 + sway * 0.4,
      leftFoot: { x: -20, y: 0 },
      rightFoot: { x: 16, y: 0 },
      frontHand: { x: -10 + sway, y: -54 },
      backHand: { x: -24, y: -66 },
      weaponAngle: -2.25 + sway * 0.04,
      squashX: 1,
      squashY: 1,
    };
  }

  if (f.action === 'hitstun') {
    const recoil = easeOutCubic(t / Math.max(1, f.stunFrames));
    return {
      hipY: lerp(-44, -48, recoil),
      leanX: lerp(-22, -10, recoil),
      spineCurve: lerp(-12, -4, recoil),
      headTiltX: lerp(-10, -3, recoil),
      leftFoot: { x: -20, y: 0 },
      rightFoot: { x: 14, y: 0 },
      frontHand: { x: -12, y: -68 },
      backHand: { x: -26, y: -56 },
      weaponAngle: -2.05,
      squashX: lerp(0.9, 1, recoil),
      squashY: lerp(1.1, 1, recoil),
    };
  }

  if (f.action === 'block' || f.action === 'parry_active') {
    const isParry = f.action === 'parry_active';
    const pop = isParry ? easeOutExpo(t / 4) * 7 : 0;
    return {
      hipY: -45,
      leanX: -2 + pop * 0.6,
      spineCurve: -3,
      headTiltX: 2,
      leftFoot: { x: -22, y: 0 },
      rightFoot: { x: 20, y: 0 },
      frontHand: { x: 24 + pop, y: -74 },
      backHand: { x: 12, y: -64 },
      weaponAngle: isParry ? -1.65 + easeOutExpo(t / 5) * 0.65 : -1.46,
      squashX: 1,
      squashY: 1,
    };
  }

  if (f.action === 'dodge') {
    const u = clamp01(t / BALANCE.DODGE_TOTAL_FRAMES);
    const dashCurve = Math.sin(u * Math.PI);
    const dirSign = f.dodgeDir === f.facing ? 1 : -1;
    return {
      hipY: -38 + dashCurve * 4,
      leanX: dirSign * (14 + dashCurve * 16),
      spineCurve: dirSign * 9,
      headTiltX: dirSign * 5,
      leftFoot: { x: -26 * dirSign, y: -dashCurve * 7 },
      rightFoot: { x: 18 * dirSign, y: -dashCurve * 3 },
      frontHand: { x: 28 * dirSign, y: -54 },
      backHand: { x: -24 * dirSign, y: -52 },
      weaponAngle: dirSign > 0 ? 0.52 : -2.4,
      squashX: 1 + dashCurve * 0.22,
      squashY: 1 - dashCurve * 0.12,
    };
  }

  if (f.action === 'crouch') {
    return {
      hipY: -30 + breath * 1.1,
      leanX: 10,
      spineCurve: 9,
      headTiltX: 4,
      leftFoot: { x: -22, y: 0 },
      rightFoot: { x: 22, y: 0 },
      frontHand: { x: 26, y: -42 + breath },
      backHand: { x: -12, y: -44 },
      weaponAngle: -0.22,
      squashX: 1.07,
      squashY: 0.93,
    };
  }

  if (f.action === 'jump') {
    // Velocity-driven aerial pose: takeoff stretch -> apex tuck -> landing reach
    const vyNorm = Math.max(-1, Math.min(1, f.vy / 15_000));
    const tuck = 1 - Math.abs(vyNorm);
    return {
      hipY: -50 + tuck * 4,
      leanX: 8 - vyNorm * 4,
      spineCurve: 4 + tuck * 5,
      headTiltX: 3,
      leftFoot: { x: -12 - tuck * 4, y: -14 - tuck * 12 + vyNorm * 8 },
      rightFoot: { x: 18, y: -20 - tuck * 10 + vyNorm * 10 },
      frontHand: { x: 26, y: -76 - vyNorm * 8 },
      backHand: { x: -18, y: -68 + vyNorm * 6 },
      weaponAngle: -0.75 + vyNorm * 0.35,
      squashX: 1 - Math.abs(vyNorm) * 0.08,
      squashY: 1 + Math.abs(vyNorm) * 0.09,
    };
  }

  if (f.action === 'attack' && f.currentMove !== null) {
    return computeAttackPose(f.currentMove, t);
  }

  if (ctx?.bossSpecialId && (f.action === 'idle' || f.action === 'walk')) {
    const spec = findBossSpecial(ctx.bossSpecialId);
    const shape = spec?.shape ?? 'ground_wave';
    const bf = ctx.bossSpecialFrame ?? 0;
    const dur = Math.max(1, ctx.bossSpecialDuration ?? 40);
    if (shape === 'ground_wave' || shape === 'boulder_rupture') {
      if (ctx.bossSpecialPhase === 'telegraph') {
        const raiseU = easeInOutCubic(bf / Math.min(18, dur * 0.4));
        const climaxU = easeInOutCubic((bf - dur * 0.72) / (dur * 0.28));
        const hover = Math.sin(bf * 0.16) * 1.6;
        return {
          hipY: lerp(-49, -54, raiseU) - climaxU * 3 + hover * 0.5,
          leanX: lerp(7, -8, raiseU) - climaxU * 4,
          spineCurve: lerp(3, -6, raiseU),
          headTiltX: lerp(2, -5, raiseU),
          leftFoot: { x: lerp(-20, -18, raiseU), y: 0 },
          rightFoot: { x: lerp(22, 18, raiseU), y: 0 },
          frontHand: lerpVec({ x: 28, y: -62 }, { x: 14, y: -102 - climaxU * 6 }, raiseU),
          backHand: lerpVec({ x: -12, y: -56 }, { x: 28, y: -46 + hover }, raiseU),
          weaponAngle: lerp(-0.42, -Math.PI * 0.53 - climaxU * 0.12, raiseU),
          squashX: 0.96,
          squashY: 1.04,
        };
      }
      const slamU = easeOutExpo((bf + 1.8) / 4);
      return {
        hipY: lerp(-54, -36, slamU),
        leanX: lerp(-8, 22, slamU),
        spineCurve: lerp(-6, 10, slamU),
        headTiltX: lerp(-4, 7, slamU),
        leftFoot: { x: lerp(-18, -26, slamU), y: 0 },
        rightFoot: { x: lerp(18, 26, slamU), y: 0 },
        frontHand: lerpVec({ x: 14, y: -104 }, { x: 26, y: -14 }, slamU),
        backHand: lerpVec({ x: 28, y: -46 }, { x: -24, y: -52 }, slamU),
        weaponAngle: lerp(-Math.PI * 0.55, Math.PI * 0.48, slamU),
        squashX: lerp(0.96, 1.12, slamU),
        squashY: lerp(1.04, 0.89, slamU),
      };
    }

    if (
      shape === 'sky_beams' ||
      shape === 'starfall_spears' ||
      shape === 'blade_rain' ||
      shape === 'falling_coffins'
    ) {
      if (ctx.bossSpecialPhase === 'telegraph') {
        const u = easeInOutCubic(bf / Math.min(18, dur * 0.45));
        return {
          hipY: lerp(-49, -52, u),
          leanX: lerp(7, -6, u),
          spineCurve: lerp(3, -5, u),
          headTiltX: -5 * u,
          leftFoot: { x: -20, y: 0 },
          rightFoot: { x: 20, y: 0 },
          frontHand: lerpVec({ x: 28, y: -62 }, { x: 16, y: -104 }, u),
          backHand: lerpVec({ x: -12, y: -56 }, { x: -22, y: -88 }, u),
          weaponAngle: lerp(-0.42, -1.62, u),
          squashX: 0.97,
          squashY: 1.03,
        };
      }
      const u = easeOutExpo((bf + 1.8) / 4);
      return {
        hipY: lerp(-52, -45, u),
        leanX: lerp(-6, 18, u),
        spineCurve: 7 * u,
        headTiltX: 4,
        leftFoot: { x: -24, y: 0 },
        rightFoot: { x: 24, y: 0 },
        frontHand: lerpVec({ x: 16, y: -104 }, { x: 42, y: -48 }, u),
        backHand: { x: -22, y: -62 },
        weaponAngle: lerp(-1.62, 0.35, u),
        squashX: 1.05,
        squashY: 0.95,
      };
    }

    if (shape === 'dash_slash' || shape === 'zigzag_chain' || shape === 'traveling_crescent') {
      if (ctx.bossSpecialPhase === 'telegraph') {
        const u = easeInOutCubic(bf / Math.min(16, dur * 0.45));
        return {
          hipY: lerp(-49, -39, u),
          leanX: lerp(7, 16, u),
          spineCurve: lerp(3, 8, u),
          headTiltX: 5,
          leftFoot: { x: lerp(-20, -28, u), y: 0 },
          rightFoot: { x: lerp(22, 24, u), y: 0 },
          frontHand: lerpVec({ x: 28, y: -62 }, { x: -14, y: -58 }, u),
          backHand: { x: 12, y: -54 },
          weaponAngle: lerp(-0.42, -2.35, u),
          squashX: 1.05,
          squashY: 0.95,
        };
      }
      const u = easeOutExpo((bf + 1.8) / 4);
      return {
        hipY: -41,
        leanX: lerp(16, 30, u),
        spineCurve: 12,
        headTiltX: 7,
        leftFoot: { x: -30, y: 0 },
        rightFoot: { x: 28, y: 0 },
        frontHand: lerpVec({ x: -14, y: -58 }, { x: 52, y: -66 }, u),
        backHand: { x: -26, y: -60 },
        weaponAngle: lerp(-2.35, 0.16, u),
        squashX: 1.12,
        squashY: 0.89,
      };
    }

    // shock_nova: draw power inward -> radial burst push
    if (ctx.bossSpecialPhase === 'telegraph') {
      const u = easeInOutCubic(bf / Math.min(18, dur * 0.45));
      return {
        hipY: lerp(-49, -45, u),
        leanX: lerp(7, -10, u),
        spineCurve: lerp(3, -7, u),
        headTiltX: -3,
        leftFoot: { x: -22, y: 0 },
        rightFoot: { x: 22, y: 0 },
        frontHand: lerpVec({ x: 28, y: -62 }, { x: -10, y: -88 }, u),
        backHand: lerpVec({ x: -12, y: -56 }, { x: 26, y: -74 }, u),
        weaponAngle: lerp(-0.42, -2.15, u),
        squashX: 0.94,
        squashY: 1.06,
      };
    }
    const u = easeOutExpo((bf + 1.8) / 4);
    return {
      hipY: lerp(-45, -40, u),
      leanX: lerp(-10, 22, u),
      spineCurve: 9,
      headTiltX: 5,
      leftFoot: { x: -26, y: 0 },
      rightFoot: { x: 26, y: 0 },
      frontHand: lerpVec({ x: -10, y: -88 }, { x: 44, y: -64 }, u),
      backHand: lerpVec({ x: 26, y: -74 }, { x: -26, y: -64 }, u),
      weaponAngle: lerp(-2.15, 0.36, u),
      squashX: 1.1,
      squashY: 0.91,
    };
  }

  if (f.action === 'walk') {
    // Realistic bipedal gait: planted flat-ground stance push-off, folded-knee swing, and double-frequency hip vault
    const dirSign = vxDir >= 0 ? 1 : -1;
    const p1 = walkPhase + Math.PI * 0.92;
    const p2 = walkPhase - Math.PI * 0.08;
    const strideX = dirSign > 0 ? 21 : 16;
    const liftH = dirSign > 0 ? 14 : 11;

    const leftFoot = computeWalkFoot(p1, strideX, liftH);
    const rightFoot = computeWalkFoot(p2, strideX, liftH);

    const tau = Math.PI * 2;
    const sCycle = (((walkPhase % tau) + tau) % tau) / tau;
    // Lowers slightly on heel-strike weight acceptance, vaults taller over mid-stance
    const vault = -Math.cos((sCycle - 0.04) * Math.PI * 4);
    const baseHipY = dirSign > 0 ? -46 : -45.5;
    const armSwing = (leftFoot.x - rightFoot.x) * 0.22;

    return {
      hipY: baseHipY - vault * 1.7,
      leanX: (dirSign > 0 ? 9.5 : 3) + vault * 0.7,
      spineCurve: (dirSign > 0 ? 4.5 : -1) + vault * 0.5,
      headTiltX: dirSign > 0 ? 2.5 : 0,
      leftFoot,
      rightFoot,
      frontHand: { x: (dirSign > 0 ? 27 : 23) + armSwing * 0.45, y: -59 - vault * 1.3 },
      backHand: { x: -13 - armSwing * 1.05, y: -54 + vault * 0.9 },
      weaponAngle: (dirSign > 0 ? -0.38 : -0.72) + armSwing * 0.008,
      squashX: 1,
      squashY: 1,
    };
  }

  // Idle duelist stance with calm breathing weight shift
  return {
    hipY: -49 + breath * 1.8,
    leanX: 7 + breath * 0.8,
    spineCurve: 3 + breath * 0.6,
    headTiltX: 2,
    leftFoot: { x: -20, y: 0 },
    rightFoot: { x: 22, y: 0 },
    frontHand: { x: 28 + breath * 1.2, y: -62 + breath * 2.1 },
    backHand: { x: -12 - breath * 0.8, y: -56 + breath * 1.4 },
    weaponAngle: -0.42 + breath * 0.04,
    squashX: 1,
    squashY: 1,
  };
}

function computeAttackPose(moveId: keyof typeof MOVES, t: number): PoseData {
  const m = MOVES[moveId];
  const isHeavy = moveId === 'heavy' || moveId === 'unblockable';
  const isUpper = moveId === 'light2' || moveId === 'counter';
  const isJumpSlash = moveId === 'light3';
  const isThrust = moveId === 'light4' || moveId === 'grab';

  const windupHand: Vec2 = isHeavy
    ? { x: -18, y: -106 }
    : isUpper
      ? { x: -4, y: -26 } // Deep low sword crouch before rising uppercut!
      : isJumpSlash
        ? { x: -12, y: -102 } // Raised high overhead mid-jump!
        : isThrust
          ? { x: -12, y: -64 }
          : { x: -8, y: -84 }; // Normal forehand swing windup

  const strikeHand: Vec2 = isThrust
    ? { x: 56, y: -64 }
    : isUpper
      ? { x: 42, y: -104 } // High skyward uppercut finish!
      : isJumpSlash
        ? { x: 48, y: -54 } // Plunging downward aerial cleave!
        : { x: 50, y: -62 };

  const recoverHand: Vec2 = isUpper
    ? { x: 32, y: -88 }
    : isJumpSlash
      ? { x: 34, y: -48 }
      : { x: 34, y: -54 };

  const windupAng = isHeavy ? -2.65 : isUpper ? 1.45 : isJumpSlash ? -2.35 : isThrust ? -0.1 : -1.95;
  const strikeAng = isHeavy ? 0.45 : isThrust ? 0.02 : isUpper ? -1.15 : isJumpSlash ? 0.58 : 0.22;
  const recoverAng = isUpper ? -0.82 : isJumpSlash ? 0.72 : 0.58;

  if (t < m.startup) {
    const u = easeInOutCubic(t / Math.max(1, m.startup));
    return {
      hipY: lerp(-49, isHeavy ? -43 : -46, u),
      leanX: lerp(7, isHeavy ? -15 : -6, u),
      spineCurve: lerp(3, isHeavy ? -9 : -4, u),
      headTiltX: lerp(2, -4, u),
      leftFoot: { x: lerp(-20, isJumpSlash ? -14 : -24, u), y: isJumpSlash ? -18 * u : 0 },
      rightFoot: { x: lerp(22, isJumpSlash ? 18 : 16, u), y: isJumpSlash ? -22 * u : 0 },
      frontHand: lerpVec({ x: 28, y: -62 }, windupHand, u),
      backHand: lerpVec({ x: -12, y: -56 }, { x: -18, y: -64 }, u),
      weaponAngle: lerp(-0.42, windupAng, u),
      squashX: lerp(1, 0.94, u),
      squashY: lerp(1, 1.06, u),
    };
  }

  if (t < m.startup + m.active) {
    const u = easeOutExpo((t - m.startup + 1.5) / Math.max(1, m.active));
    return {
      hipY: lerp(-46, -43, u),
      leanX: lerp(-6, isHeavy ? 26 : 20, u),
      spineCurve: lerp(-4, 10, u),
      headTiltX: lerp(-2, 6, u),
      leftFoot: { x: -28, y: 0 },
      rightFoot: { x: lerp(18, 30, u), y: 0 },
      frontHand: lerpVec(windupHand, strikeHand, u),
      backHand: { x: -20, y: -60 },
      weaponAngle: lerp(windupAng, strikeAng, u),
      squashX: lerp(1.02, 1.11, u),
      squashY: lerp(0.98, 0.92, u),
    };
  }

  const u = easeOutCubic((t - m.startup - m.active) / Math.max(1, m.recovery));
  return {
    hipY: lerp(-43, -49, u),
    leanX: lerp(20, 7, u),
    spineCurve: lerp(10, 3, u),
    headTiltX: lerp(6, 2, u),
    leftFoot: { x: lerp(-28, -20, u), y: 0 },
    rightFoot: { x: lerp(30, 22, u), y: 0 },
    frontHand: lerpVec(strikeHand, recoverHand, u),
    backHand: lerpVec({ x: -20, y: -60 }, { x: -12, y: -56 }, u),
    weaponAngle: lerp(strikeAng, recoverAng, u),
    squashX: lerp(1.06, 1, u),
    squashY: lerp(0.95, 1, u),
  };
}
