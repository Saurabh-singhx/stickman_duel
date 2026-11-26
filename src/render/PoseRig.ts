import { BALANCE } from '../data/balance';
import { MOVES } from '../data/moves';
import type { FighterState } from '../sim/State';

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
export function getPoseBlendRate(f: FighterState): number {
  if (f.action === 'attack') return 0.58;
  if (f.action === 'parry_active' || f.action === 'hitstun') return 0.62;
  if (f.action === 'dodge') return 0.45;
  if (f.action === 'finisher_atk' || f.action === 'finisher_vic') return 0.32;
  if (f.action === 'walk' || f.action === 'jump') return 0.28;
  return 0.22;
}

/**
 * Computes a smooth, human-like target pose from simulation state + frame number.
 */
export function computeTargetPose(f: FighterState, walkPhase: number): PoseData {
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
    // Smooth 30-frame getting-up animation: floor -> push off hand -> one knee -> standing
    const u = easeInOutCubic(t / BALANCE.GETUP_FRAMES);
    return {
      hipY: lerp(-10, -49, u),
      leanX: lerp(-36, 7, u),
      spineCurve: lerp(-6, 3, u),
      headTiltX: lerp(-8, 2, u),
      leftFoot: lerpVec({ x: 22, y: 0 }, { x: -20, y: 0 }, u),
      rightFoot: lerpVec({ x: 8, y: 0 }, { x: 22, y: 0 }, u),
      frontHand: lerpVec({ x: -10, y: -4 }, { x: 28, y: -62 }, u),
      backHand: lerpVec({ x: -24, y: -6 }, { x: -12, y: -56 }, u),
      weaponAngle: lerp(0.18, -0.42, u),
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
    const shake = Math.sin(t * 0.5) * 4;
    return {
      hipY: -42,
      leanX: -18 + shake,
      spineCurve: -12,
      headTiltX: -8,
      leftFoot: { x: -20, y: 0 },
      rightFoot: { x: 14, y: 0 },
      frontHand: { x: -14, y: -66 },
      backHand: { x: -26, y: -54 },
      weaponAngle: -2.1,
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

  if (f.action === 'walk') {
    // Natural human bipedal stride with elliptical foot lift, hip bob, and counter-swinging arms
    const dirSign = vxDir >= 0 ? 1 : -1;
    const p1 = walkPhase;
    const p2 = walkPhase + Math.PI;
    const strideX = dirSign > 0 ? 25 : 19;
    const liftH = dirSign > 0 ? 11 : 8;

    const lFootX = Math.cos(p1) * strideX;
    const lFootY = Math.min(0, Math.sin(p1) * liftH);
    const rFootX = Math.cos(p2) * strideX;
    const rFootY = Math.min(0, Math.sin(p2) * liftH);

    // Double-frequency hip bob (highest at passing stride, lowest on heel strike)
    const hipBob = Math.abs(Math.sin(p1)) * 4.2;
    const armSwing = Math.cos(p1) * 9;

    return {
      hipY: -49 - hipBob,
      leanX: dirSign > 0 ? 11 : 3,
      spineCurve: dirSign > 0 ? 5 : -2,
      headTiltX: dirSign > 0 ? 3 : 0,
      leftFoot: { x: lFootX, y: lFootY },
      rightFoot: { x: rFootX, y: rFootY },
      frontHand: { x: 26 + armSwing * 0.45, y: -62 - hipBob * 0.5 },
      backHand: { x: -14 - armSwing, y: -56 + hipBob * 0.3 },
      weaponAngle: (dirSign > 0 ? -0.36 : -0.62) + Math.sin(p1) * 0.09,
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
    const u = easeOutExpo((t - m.startup + 1) / Math.max(1, m.active));
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
