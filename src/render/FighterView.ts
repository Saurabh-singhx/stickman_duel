import { Graphics } from 'pixi.js';
import { BALANCE } from '../data/balance';
import { CHARACTERS, type CharacterSpec } from '../data/characters';
import { MOVES } from '../data/moves';
import type { FighterState } from '../sim/State';
import { CapeSim } from './Cape';
import { drawSoftGlow } from './Glow';
import {
  blendPose,
  clonePose,
  computeTargetPose,
  getPoseBlendRate,
  type PoseData,
  type Vec2,
} from './PoseRig';

/**
 * Analytical 2-bone IK solver returning the mid-joint (knee or elbow) position.
 */
function solveTwoBoneIK(
  root: Vec2,
  target: Vec2,
  len1: number,
  len2: number,
  bendSign: 1 | -1,
): Vec2 {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const dist = Math.max(0.001, Math.min(len1 + len2 - 0.5, Math.hypot(dx, dy)));
  const cosA = Math.max(-1, Math.min(1, (len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist)));
  const baseAngle = Math.atan2(dy, dx);
  const jointAngle = baseAngle + bendSign * Math.acos(cosA);
  return {
    x: root.x + Math.cos(jointAngle) * len1,
    y: root.y + Math.sin(jointAngle) * len1,
  };
}

/**
 * Procedural stick-figure renderer with curved athletic spine, 2-bone IK limbs,
 * render-only pose-to-pose spring blending, landing compression, cape simulation,
 * distinct character silhouettes, and optional glow halos.
 */
export class FighterView {
  private readonly cape: CapeSim;
  private capeInitialized = false;
  private readonly prevTrail: Vec2[] = [];
  private blendedPose: PoseData | null = null;
  private walkPhase = 0;
  private wasGrounded = true;
  private landSquash = 0;
  private parryRecoil = 0;
  public triggerParry(): void { this.parryRecoil = 1; }

  private lastFacing: 1 | -1 = 1;

  constructor(charId: keyof typeof CHARACTERS) {
    const spec = CHARACTERS[charId];
    this.cape = new CapeSim(spec.capeColor, 6, 14, 15, 40);
  }

  /** Resets cape, sword trail, and pose blend cache when starting a new round. */
  public reset(x: number, y: number, facing: 1 | -1): void {
    this.cape.reset(x, y - 82, facing);
    this.capeInitialized = true;
    this.parryRecoil = 0;
    this.prevTrail.length = 0;
    this.blendedPose = null;
    this.walkPhase = 0;
    this.wasGrounded = true;
    this.landSquash = 0;
    this.lastFacing = facing;
  }

  /** Renders the fighter at interpolated world coordinates (px). */
  public draw(
    g: Graphics,
    f: FighterState,
    x: number,
    y: number,
    glowEnabled: boolean,
    colorblindCue: boolean,
    dtScale = 1,
  ): void {
    const spec = CHARACTERS[f.charId];
    const dir = f.facing;
    const floorY = BALANCE.FLOOR_Y_PX;

    // Advance continuous walk cycle phase proportional to horizontal velocity
    if (f.action === 'walk') {
      const speedPx = Math.abs(f.vx) / 1000;
      const dirSign = f.vx * dir >= 0 ? 1 : -1;
      this.walkPhase += dirSign * Math.max(0.14, speedPx * 0.055) * dtScale;
    }

    // Trigger subtle landing compression squash on touchdown
    if (!this.wasGrounded && f.grounded) {
      this.landSquash = 1;
    }
    this.wasGrounded = f.grounded;
    if (this.landSquash > 0.01) {
      this.landSquash *= Math.pow(0.76, dtScale);
    } else {
      this.landSquash = 0;
    }

    // Compute target pose and smoothly blend from previous rendered pose
    const targetPose = computeTargetPose(f, this.walkPhase);
    // A short planted recoil followed by a blade deflection, without gameplay recovery.
    if (this.parryRecoil > 0.01 && (f.action === 'idle' || f.action === 'block' || f.action === 'parry_active')) {
      const r = this.parryRecoil;
      targetPose.hipY = -43;
      targetPose.leanX = -7 * r;
      targetPose.frontHand = { x: 30 - 8 * r, y: -75 + 7 * r };
      targetPose.backHand = { x: 12, y: -64 };
      targetPose.weaponAngle = -0.65 - 0.8 * r;
      targetPose.leftFoot = { x: -25, y: 0 };
      targetPose.rightFoot = { x: 22, y: 0 };
    }
    this.parryRecoil *= Math.pow(0.84, Math.max(0, dtScale));
    if (!this.blendedPose || this.lastFacing !== dir) {
      this.blendedPose = clonePose(targetPose);
      this.lastFacing = dir;
    } else {
      const rate = 1 - Math.pow(1 - getPoseBlendRate(f), Math.max(0.2, dtScale));
      this.blendedPose = blendPose(this.blendedPose, targetPose, rate);
    }
    const pose = this.blendedPose;

    const squashX = pose.squashX * (1 + this.landSquash * 0.14);
    const squashY = pose.squashY * (1 - this.landSquash * 0.12);

    // Soft blob shadow on the floor
    const heightAboveFloor = Math.max(0, floorY - y);
    const shadowScale = Math.max(0.4, 1 - heightAboveFloor / 260);
    g.ellipse(x, floorY + 3, 28 * shadowScale * squashX, 6.5 * shadowScale).fill({
      color: 0x161412,
      alpha: 0.28 * shadowScale,
    });

    // Hero glow halo behind body
    if (spec.hasGlow && glowEnabled) {
      drawSoftGlow(g, x + dir * pose.leanX * 0.4, y - 62, 58, 0xfff8e1, 1.0);
    }

    // Special startup golden charge burst
    if (f.action === 'special_startup' && glowEnabled) {
      drawSoftGlow(g, x, y - 62, 62, 0x38bdf8, 1.1);
    }
    // Counter-window golden aura
    if (f.counterWindow > 0 && glowEnabled) {
      drawSoftGlow(g, x, y - 62, 46, 0xffd54f, 0.9);
    }

    // Dodge afterimage silhouette
    if (f.action === 'dodge') {
      const ghostX = x - f.dodgeDir * 24;
      g.circle(ghostX, y - 92, 11).fill({ color: spec.bodyColor, alpha: 0.22 });
      g.moveTo(ghostX, y - 80).lineTo(ghostX, y - 40).stroke({
        color: spec.bodyColor,
        width: 7,
        alpha: 0.2,
        cap: 'round',
      });
    }

    const toWorld = (lx: number, ly: number): Vec2 => ({
      x: x + lx * dir * squashX,
      y: y + ly * squashY,
    });

    const hip = toWorld(0, pose.hipY);
    const shoulder = toWorld(pose.leanX, pose.hipY - 36);
    const waist = toWorld(pose.leanX * 0.45 + pose.spineCurve, pose.hipY - 18);
    const head = toWorld(pose.leanX * 1.12 + pose.headTiltX, pose.hipY - 52);

    // Update & draw cape behind body
    if (spec.hasCape) {
      if (!this.capeInitialized) {
        this.cape.reset(shoulder.x, shoulder.y, dir);
        this.capeInitialized = true;
      }
      this.cape.update(shoulder.x - dir * 4, shoulder.y + 2, dir, -f.vx / 1000, dtScale);
      this.cape.draw(g, floorY);
    }

    // Compute anatomically accurate 2-bone IK joints (knees bend forward, elbows bend down)
    const lFoot = toWorld(pose.leftFoot.x, pose.leftFoot.y);
    const rFoot = toWorld(pose.rightFoot.x, pose.rightFoot.y);
    const kneeBend = (-dir) as 1 | -1;
    const elbowBend = dir;
    const lKnee = solveTwoBoneIK(hip, lFoot, 26, 26, kneeBend);
    const rKnee = solveTwoBoneIK(hip, rFoot, 26, 26, kneeBend);

    const bHand = toWorld(pose.backHand.x, pose.backHand.y);
    const fHand = toWorld(pose.frontHand.x, pose.frontHand.y);
    const bElbow = solveTwoBoneIK(shoulder, bHand, 22, 22, elbowBend);
    const fElbow = solveTwoBoneIK(shoulder, fHand, 22, 22, elbowBend);

    const isInvulnWakeup = f.action === 'knockdown' || f.action === 'getup';
    const strokeColor = f.action === 'parry_active' || f.action === 'special_startup' ? 0xfff3b0 : isInvulnWakeup && (f.actionFrame % 6 < 3) ? 0x93c5fd : spec.bodyColor;
    const limbW = spec.weapon === 'fists' ? 8.5 : 6.5;

    // Soft outer glow stroke for the hero
    if (spec.hasGlow && glowEnabled) {
      g.moveTo(hip.x, hip.y)
        .quadraticCurveTo(waist.x, waist.y, shoulder.x, shoulder.y)
        .stroke({ color: 0xffffff, width: 15, alpha: 0.22, cap: 'round' });
      g.circle(head.x, head.y, 17).fill({ color: 0xffffff, alpha: 0.18 });
    }

    // Back arm & back leg
    g.moveTo(shoulder.x, shoulder.y)
      .lineTo(bElbow.x, bElbow.y)
      .lineTo(bHand.x, bHand.y)
      .stroke({ color: strokeColor, width: limbW * 0.9, cap: 'round', join: 'round' });

    g.moveTo(hip.x, hip.y)
      .lineTo(lKnee.x, lKnee.y)
      .lineTo(lFoot.x, lFoot.y)
      .stroke({ color: strokeColor, width: limbW, cap: 'round', join: 'round' });

    // Curved athletic torso spine
    g.moveTo(hip.x, hip.y)
      .quadraticCurveTo(waist.x, waist.y, shoulder.x, shoulder.y)
      .stroke({ color: strokeColor, width: limbW + 2, cap: 'round' });

    // Front leg
    g.moveTo(hip.x, hip.y)
      .lineTo(rKnee.x, rKnee.y)
      .lineTo(rFoot.x, rFoot.y)
      .stroke({ color: strokeColor, width: limbW, cap: 'round', join: 'round' });

    if (f.charId === 'vesper') {
      g.arc(head.x, head.y - 6, 23, -2.8, -0.35).stroke({ color: spec.accentColor, width: 3, alpha: 0.85 });
      g.arc(head.x, head.y - 6, 23, 0.3, 1.2).stroke({ color: spec.weaponColor, width: 2, alpha: 0.7 });
      g.moveTo(head.x - 7, head.y - 18).lineTo(head.x - 10, head.y - 29)
        .moveTo(head.x + 7, head.y - 18).lineTo(head.x + 10, head.y - 29)
        .stroke({ color: spec.weaponColor, width: 3 });
    }
    // Head + optional assassin hood/mask + directional eye glint
    g.circle(head.x, head.y, 11.5).fill(strokeColor);
    if (spec.hasHood) {
      g.poly([
        head.x - dir * 15,
        head.y - 2,
        head.x - dir * 4,
        head.y - 16,
        head.x + dir * 12,
        head.y - 11,
        head.x + dir * 10,
        head.y + 8,
        head.x - dir * 14,
        head.y + 10,
      ]).fill(spec.capeColor);
    }
    if (spec.hasMask) {
      g.ellipse(head.x + dir * 5, head.y, 6.5, 8).fill(0xf4f0e8);
      g.circle(head.x + dir * 7.5, head.y - 2, 2.2).fill(0xffdf6b);
    } else {
      const eyeColor = spec.hasGlow ? 0x262420 : spec.accentColor;
      g.moveTo(head.x + dir * 4.5, head.y - 2)
        .lineTo(head.x + dir * 9.5, head.y - 1.5)
        .stroke({ color: eyeColor, width: 2.2, cap: 'round', alpha: 0.9 });
    }

    // Front arm
    g.moveTo(shoulder.x, shoulder.y)
      .lineTo(fElbow.x, fElbow.y)
      .lineTo(fHand.x, fHand.y)
      .stroke({ color: strokeColor, width: limbW * 0.95, cap: 'round', join: 'round' });

    // Weapon rendering
    this.drawWeapon(g, spec, fHand, bHand, dir, pose.weaponAngle, f, glowEnabled);

    // Parry active flash ring
    if (f.action === 'parry_active') {
      g.arc(fHand.x + dir * 10, fHand.y - 8, 19, -2.1, -0.3).stroke({
        color: 0xffdf6b,
        width: 3,
        alpha: Math.max(0.2, 1 - f.actionFrame / 16),
      });
    }

    // Heavy attack golden charge aura & weapon glint during startup windup
    if (
      f.action === 'attack' &&
      f.currentMove === 'heavy' &&
      f.actionFrame < MOVES.heavy.startup
    ) {
      const charge = f.actionFrame / Math.max(1, MOVES.heavy.startup);
      if (glowEnabled) {
        drawSoftGlow(g, fHand.x, fHand.y, 26 + charge * 26, 0xffd54f, 0.75 + charge * 0.6);
      }
      const r = 10 + (1 - charge) * 18;
      g.circle(fHand.x, fHand.y, r).stroke({ color: 0xfff3b0, width: 2.5, alpha: 0.85 });
      g.moveTo(fHand.x - 14 * charge, fHand.y)
        .lineTo(fHand.x + 14 * charge, fHand.y)
        .moveTo(fHand.x, fHand.y - 14 * charge)
        .lineTo(fHand.x, fHand.y + 14 * charge)
        .stroke({ color: 0xffffff, width: 2.2, alpha: 0.9 });
    }

    // Unblockable red-flash telegraph (plus colorblind-safe shape cue)
    if (
      f.action === 'attack' &&
      f.currentMove === 'unblockable' &&
      f.actionFrame < MOVES.unblockable.startup
    ) {
      const pulse = 0.6 + Math.sin(f.actionFrame * 0.65) * 0.4;
      g.circle(head.x, head.y - 22, 13 * pulse).fill({ color: 0xff2d2d, alpha: 0.85 });
      g.circle(head.x, head.y - 22, 22).stroke({ color: 0xff4d4d, width: 2.5, alpha: pulse });
      if (colorblindCue) {
        const cy = head.y - 46;
        g.poly([head.x, cy - 11, head.x + 11, cy + 9, head.x - 11, cy + 9]).stroke({
          color: 0xffe066,
          width: 3,
        });
      }
    }
  }

  private drawWeapon(
    g: Graphics,
    spec: CharacterSpec,
    fHand: Vec2,
    bHand: Vec2,
    dir: 1 | -1,
    angle: number,
    f: FighterState,
    glowEnabled: boolean,
  ): void {
    const cos = Math.cos(angle) * dir;
    const sin = Math.sin(angle);

    if (spec.weapon === 'fists') {
      g.circle(fHand.x, fHand.y, 10.5).fill(spec.weaponColor);
      g.circle(bHand.x, bHand.y, 9.5).fill(spec.weaponColor);
      g.circle(fHand.x, fHand.y, 10.5).stroke({ color: 0x1e1a12, width: 2 });
      return;
    }

    if (spec.weapon === 'twin_daggers') {
      const len = 34;
      g.moveTo(fHand.x, fHand.y)
        .lineTo(fHand.x + cos * len, fHand.y + sin * len)
        .stroke({ color: spec.weaponColor, width: 4, cap: 'round' });
      g.moveTo(bHand.x, bHand.y)
        .lineTo(bHand.x - cos * len * 0.85, bHand.y + sin * len * 0.7)
        .stroke({ color: spec.weaponColor, width: 3.5, cap: 'round' });
      return;
    }

    const bladeLen = spec.weapon === 'greatsword' ? 88 : spec.weapon === 'golden_blade' ? 76 : 72;
    const bladeW = spec.weapon === 'greatsword' ? 7.5 : 4.6;
    const tipX = fHand.x + cos * bladeLen;
    const tipY = fHand.y + sin * bladeLen;

    if (spec.weapon === 'golden_blade') {
      this.prevTrail.push({ x: tipX, y: tipY });
      if (this.prevTrail.length > 7) this.prevTrail.shift();
      if (this.prevTrail.length > 2) {
        for (let i = 1; i < this.prevTrail.length; i += 1) {
          const p0 = this.prevTrail[i - 1];
          const p1 = this.prevTrail[i];
          if (!p0 || !p1) continue;
          const a = (i / this.prevTrail.length) * (f.action === 'attack' ? 0.72 : 0.28);
          g.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).stroke({
            color: spec.slashColor,
            width: 4 * (i / this.prevTrail.length),
            alpha: a,
            cap: 'round',
          });
        }
      }
      if (glowEnabled) {
        g.moveTo(fHand.x, fHand.y).lineTo(tipX, tipY).stroke({
          color: 0xffd54f,
          width: 11,
          alpha: 0.26,
          cap: 'round',
        });
      }
    }

    const perpX = -sin * 9;
    const perpY = cos * 9;
    g.moveTo(fHand.x - perpX, fHand.y - perpY)
      .lineTo(fHand.x + perpX, fHand.y + perpY)
      .stroke({ color: spec.accentColor, width: 3.5, cap: 'round' });

    g.moveTo(fHand.x, fHand.y)
      .lineTo(tipX, tipY)
      .stroke({ color: spec.weaponColor, width: bladeW, cap: 'round' });
  }
}
