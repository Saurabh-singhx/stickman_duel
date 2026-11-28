import { Graphics } from 'pixi.js';
import { BALANCE } from '../data/balance';
import { CHARACTERS } from '../data/characters';
import { findBossSpecial, getAerialLasersLiftPx, PLAYER_SPECIALS } from '../data/specials';
import { fromFp } from '../sim/Fixed';
import type { ActiveBossSpecial, ActivePlayerSpecial, FighterState, GameState } from '../sim/State';
import { drawBossSignatureSpecial } from './BossSignatureFx';
import type { Vec2 } from './PoseRig';

/**
 * Pooled, low-end-optimized renderer for all 5 Player Cinematic Special Powers
 * and all 16 Boss Half-Arena / Full-Arena Special Attacks.
 */
export class SpecialFx {
  /** Draws black/dark atmospheric backdrops for player specials (e.g. Black Thunder). */
  public drawSpecialBackdrop(
    g: Graphics,
    activeSpecial: ActivePlayerSpecial | null,
    reduceFlashing: boolean,
  ): void {
    if (!activeSpecial) return;
    if (activeSpecial.specialId === 'black_thunder') {
      const spec = PLAYER_SPECIALS.black_thunder;
      const fadeIn = Math.min(1, activeSpecial.frame / 18);
      const fadeOut = Math.min(1, (spec.cinematicFrames - activeSpecial.frame) / 20);
      const alpha = Math.min(fadeIn, fadeOut) * 0.94;
      // Pitch-black storm background covering any aspect ratio / camera pan
      g.rect(-2000, -1000, 5280, 3000).fill({ color: 0x05060b, alpha });
      if (!reduceFlashing && activeSpecial.frame >= spec.impactFrame && activeSpecial.frame < spec.impactFrame + 10) {
        const flashA = (1 - (activeSpecial.frame - spec.impactFrame) / 10) * 0.35;
        g.rect(-2000, -1000, 5280, 3000).fill({ color: 0xdbeafe, alpha: flashA });
      }
    } else if (activeSpecial.specialId === 'aerial_lasers' || activeSpecial.specialId === 'arena_greatsword') {
      g.rect(-2000, -1000, 5280, 3000).fill({ color: 0x100f0d, alpha: 0.45 });
    }
  }

  /** Draws all active Boss Arena / Half-Arena Special Attacks without bounding boxes, clearly showing origin and danger area. */
  public drawBossSpecials(
    g: Graphics,
    specials: readonly ActiveBossSpecial[],
    colorblindCue: boolean,
    lowQuality = false,
    fighters?: readonly [FighterState, FighterState],
  ): void {
    const floorY = BALANCE.FLOOR_Y_PX;
    for (const sp of specials) {
      const spec = findBossSpecial(sp.specialId);
      const color = spec?.color ?? 0xef4444;
      const shape = spec?.shape ?? 'ground_wave';
      const left = fromFp(sp.left);
      const right = fromFp(sp.right);
      const width = Math.max(20, right - left);
      const ownerX = fighters ? fromFp(fighters[sp.ownerSlot].x) : left + width * 0.5;
      // Determine attack travel direction & origin point (boss edge/position)
      const originX = Math.max(left, Math.min(right, ownerX));
      const dir: 1 | -1 = Math.abs(originX - left) <= Math.abs(right - originX) ? 1 : -1;

      if (
        drawBossSignatureSpecial(g, {
          sp,
          shape,
          left,
          right,
          width,
          originX,
          dir,
          floorY,
          color,
          lowQuality,
        })
      ) {
        if (sp.phase === 'telegraph') {
          this.drawCounterplayCue(g, sp, left + width * 0.5, sp.lowGround ? floorY - 62 : floorY - 170, colorblindCue);
        }
        continue;
      }

      if (sp.specialId === 'vesper_tide' || shape === 'ground_wave') {
        this.drawGroundWaveBossSpecial(g, sp, left, width, originX, floorY, color, lowQuality, colorblindCue);
      } else if (shape === 'sky_beams') {
        this.drawSkyBeamsBossSpecial(g, sp, left, width, floorY, color, colorblindCue);
      } else if (shape === 'shock_nova') {
        this.drawShockNovaBossSpecial(g, sp, left, width, floorY, color, lowQuality, colorblindCue);
      } else {
        this.drawDashSlashBossSpecial(g, sp, left, right, width, originX, dir, floorY, color, lowQuality, colorblindCue);
      }
    }
  }

  /** Draws counterplay icon cue without a bounding box (upward jump chevron or parry ring). */
  private drawCounterplayCue(
    g: Graphics,
    sp: ActiveBossSpecial,
    cx: number,
    cy: number,
    colorblindCue: boolean,
  ): void {
    if (!colorblindCue && !sp.lowGround) return;
    if (sp.lowGround) {
      g.moveTo(cx - 10, cy + 6)
        .lineTo(cx, cy - 6)
        .lineTo(cx + 10, cy + 6)
        .stroke({ color: 0xffe066, width: 3, cap: 'round' });
    } else if (sp.parryable) {
      g.circle(cx, cy, 8).stroke({ color: 0xffe066, width: 2.5 });
    }
  }

  /**
   * Renders low ground-wave / spike boss attacks (e.g. Vesper Moonfall Tide, Raijin Arc Surge,
   * Assassin Blood Thorns, Warden Horizon Beam) directly on the floor without an extra box.
   */
  private drawGroundWaveBossSpecial(
    g: Graphics,
    sp: ActiveBossSpecial,
    left: number,
    width: number,
    originX: number,
    floorY: number,
    color: number,
    lowQuality: boolean,
    colorblindCue: boolean,
  ): void {
    const isVesper = sp.specialId === 'vesper_tide';
    const spikeCount = lowQuality ? 16 : 30;
    const step = width / spikeCount;

    if (sp.phase === 'telegraph') {
      const progress = sp.frame / Math.max(1, sp.telegraphFrames);
      const pulse = 0.45 + 0.55 * progress;
      const shimmer = 0.58 + Math.sin(sp.frame * 0.35) * 0.24;

      // Glowing floor fissure & directional wave rippling outward from caster
      g.rect(left, floorY - 4, width, 5).fill({ color, alpha: 0.28 + progress * 0.44 });
      g.moveTo(left, floorY).lineTo(left + width, floorY).stroke({
        color: isVesper ? 0xede9fe : 0xffffff,
        width: 2 + progress * 2.2,
        alpha: pulse * 0.85,
      });

      const rippleSpan = Math.max(width - (originX - left), originX - left) * progress;
      const rL = Math.max(left, originX - rippleSpan);
      const rR = Math.min(left + width, originX + rippleSpan);
      g.rect(rL, floorY - 3, rR - rL, 3).fill({ color: 0xffffff, alpha: 0.72 });

      // Emerging hazard tips growing up from floor fissure across the danger range
      for (let i = 0; i < spikeCount; i += 1) {
        const sx = left + (i + 0.5) * step;
        const seedMod = (i % 3) * 2.5;
        const tipH = 6 + progress * (13 + seedMod);
        const halfW = 4.5 + (i % 2) * 1.5;

        g.poly([sx - halfW, floorY, sx, floorY - tipH, sx + halfW, floorY]).fill({
          color,
          alpha: (0.42 + progress * 0.52) * shimmer,
        });
        g.moveTo(sx - halfW, floorY)
          .lineTo(sx, floorY - tipH)
          .lineTo(sx + halfW, floorY)
          .stroke({ color: 0xf5f3ff, width: 1.4, alpha: (0.4 + progress * 0.55) * shimmer });

        if (i % 2 === 0) {
          g.moveTo(sx, floorY - tipH - 3)
            .lineTo(sx, floorY - tipH - 12 - progress * 14)
            .stroke({ color, width: 1.5, alpha: (0.22 + progress * 0.45) * shimmer });
        }
      }

      this.drawCounterplayCue(g, sp, left + width * 0.5, floorY - 62, colorblindCue);
      return;
    }

    const t = sp.frame / Math.max(1, sp.activeFrames);
    const burst = Math.min(1, 0.88 + (sp.frame + 1) * 0.12);
    const fade = t > 0.72 ? Math.max(0, (1 - t) / 0.28) : 1;

    g.rect(left, floorY - 5, width, 6).fill({ color, alpha: 0.55 * fade });
    g.moveTo(left, floorY).lineTo(left + width, floorY).stroke({
      color: 0xffffff,
      width: 2.5,
      alpha: 0.75 * fade,
    });

    for (let i = 0; i < spikeCount; i += 1) {
      const sx = left + (i + 0.5) * step;
      const baseH = 44 + (i % 4) * 4.5 + (i % 2 === 0 ? 5 : 0);
      const h = baseH * burst;
      const halfW = 7 + (i % 3) * 2;
      const tilt = ((i % 3) - 1) * 3.5;

      g.poly([sx - halfW, floorY, sx + tilt, floorY - h, sx + halfW, floorY]).fill({
        color,
        alpha: 0.88 * fade,
      });
      g.poly([sx - halfW * 0.55, floorY, sx + tilt, floorY - h, sx, floorY]).fill({
        color: isVesper ? 0xe9d5ff : 0xffffff,
        alpha: 0.45 * fade,
      });
      g.poly([sx - halfW * 0.25, floorY, sx + tilt, floorY - h * 0.94, sx + halfW * 0.2, floorY]).fill({
        color: 0xffffff,
        alpha: 0.72 * fade,
      });
      g.moveTo(sx - halfW, floorY)
        .lineTo(sx + tilt, floorY - h)
        .lineTo(sx + halfW, floorY)
        .stroke({ color: 0xffffff, width: 1.4, alpha: 0.78 * fade });

      if (i % 2 === 0) {
        const subX = sx + step * 0.42;
        const subH = (26 + (i % 3) * 6) * burst;
        g.poly([subX - 5, floorY, subX + 2, floorY - subH, subX + 5, floorY]).fill({
          color,
          alpha: 0.65 * fade,
        });
      }
    }
  }

  /**
   * Renders descending sky-beam / bolt / blade-rain boss attacks cleanly from the sky
   * onto glowing ground lock-on targets (zero bounding box).
   */
  private drawSkyBeamsBossSpecial(
    g: Graphics,
    sp: ActiveBossSpecial,
    left: number,
    width: number,
    floorY: number,
    color: number,
    colorblindCue: boolean,
  ): void {
    const beamCount = 5;
    const step = width / beamCount;

    if (sp.phase === 'telegraph') {
      const progress = sp.frame / Math.max(1, sp.telegraphFrames);
      const pulse = 0.45 + 0.55 * progress;
      const spread = 24 - 16 * progress;

      // Subtle floor scan seam linking all drop zones
      g.moveTo(left, floorY).lineTo(left + width, floorY).stroke({ color, width: 2, alpha: 0.35 + progress * 0.4 });

      for (let i = 0; i < beamCount; i += 1) {
        const bx = left + step * (i + 0.5);
        // Descending vertical sky-targeting sightlines showing attack comes from overhead
        g.moveTo(bx, -40).lineTo(bx, floorY).stroke({ color, width: 2 + progress * 2.5, alpha: 0.28 + progress * 0.55 });
        g.moveTo(bx - spread, -40).lineTo(bx - spread * 0.5, floorY).stroke({ color: 0xffffff, width: 1.2, alpha: 0.22 + progress * 0.45 });
        g.moveTo(bx + spread, -40).lineTo(bx + spread * 0.5, floorY).stroke({ color: 0xffffff, width: 1.2, alpha: 0.22 + progress * 0.45 });
        // Ground target lock ring shrinking inward as strike approaches
        g.ellipse(bx, floorY - 2, 32, 8).stroke({ color, width: 2.2, alpha: pulse });
        g.ellipse(bx, floorY - 2, 26 * (1 - progress * 0.65) + 4, 6).stroke({
          color: 0xffffff,
          width: 1.8,
          alpha: 0.45 + progress * 0.5,
        });
      }

      this.drawCounterplayCue(g, sp, left + width * 0.5, floorY - 196, colorblindCue);
      return;
    }

    const t = sp.frame / Math.max(1, sp.activeFrames);
    const fade = t > 0.7 ? Math.max(0, (1 - t) / 0.3) : 1;
    const expand = Math.min(1, 0.8 + (sp.frame + 1) * 0.15);

    for (let i = 0; i < beamCount; i += 1) {
      const bx = left + step * (i + 0.5);
      const colW = (42 + (1 - fade) * 14) * expand;
      g.rect(bx - colW * 0.5, -40, colW, floorY + 40).fill({ color, alpha: 0.62 * fade });
      g.rect(bx - colW * 0.2, -40, colW * 0.4, floorY + 40).fill({ color: 0xffffff, alpha: 0.9 * fade });
      g.ellipse(bx, floorY - 2, 36 + t * 44, 10 + t * 9).stroke({ color, width: 3.5, alpha: fade });
      g.ellipse(bx, floorY - 2, 18 + t * 22, 6 + t * 4).fill({ color: 0xffffff, alpha: 0.65 * fade });
    }
  }

  /**
   * Renders radial nova / eclipse / shock-clap boss attacks as an inward-imploding core orb
   * during telegraph followed by an expanding dome blast across the hazard width.
   */
  private drawShockNovaBossSpecial(
    g: Graphics,
    sp: ActiveBossSpecial,
    left: number,
    width: number,
    floorY: number,
    color: number,
    lowQuality: boolean,
    colorblindCue: boolean,
  ): void {
    const midX = left + width * 0.5;
    const coreY = floorY - 76;

    if (sp.phase === 'telegraph') {
      const progress = sp.frame / Math.max(1, sp.telegraphFrames);
      // Ground boundary perimeter showing exact horizontal reach [left..right] without a tall rectangle
      g.ellipse(midX, floorY - 3, width * 0.49, 12).fill({ color, alpha: 0.14 + progress * 0.2 });
      g.ellipse(midX, floorY - 3, width * 0.49, 12).stroke({ color, width: 2.2, alpha: 0.4 + progress * 0.5 });
      g.moveTo(left, floorY - 12).lineTo(left, floorY + 2)
        .moveTo(left + width, floorY - 12).lineTo(left + width, floorY + 2)
        .stroke({ color: 0xffffff, width: 2, alpha: 0.45 + progress * 0.45 });

      // Imploding core rings & inward energy streaks showing nova gathers at midX -> erupts outward
      const pullR = 14 + (1 - progress) * 52;
      g.circle(midX, coreY, pullR).stroke({ color, width: 2.5, alpha: 0.45 + progress * 0.5 });
      g.circle(midX, coreY, 8 + progress * 18).fill({ color, alpha: 0.3 + progress * 0.5 });
      g.circle(midX, coreY, 4 + progress * 8).fill({ color: 0xffffff, alpha: 0.85 });

      const rays = lowQuality ? 6 : 12;
      for (let i = 0; i < rays; i += 1) {
        const ang = (i / rays) * Math.PI * 2 + sp.frame * 0.05;
        const r1 = pullR + 18;
        const r2 = Math.max(12, pullR - 14);
        g.moveTo(midX + Math.cos(ang) * r1, coreY + Math.sin(ang) * r1 * 0.65)
          .lineTo(midX + Math.cos(ang) * r2, coreY + Math.sin(ang) * r2 * 0.65)
          .stroke({ color: 0xffffff, width: 1.6, alpha: 0.25 + progress * 0.55 });
      }

      this.drawCounterplayCue(g, sp, midX, coreY - pullR - 16, colorblindCue);
      return;
    }

    const t = sp.frame / Math.max(1, sp.activeFrames);
    const fade = t > 0.72 ? Math.max(0, (1 - t) / 0.28) : 1;
    const swell = Math.min(1, 0.65 + (sp.frame + 1) * 0.14);
    const rx = width * 0.49 * swell;
    const rad = Math.min(width * 0.48, 175) * swell;

    g.ellipse(midX, floorY - 3, rx, 18 + t * 24).fill({ color, alpha: 0.28 * fade });
    g.ellipse(midX, floorY - 3, rx, 18 + t * 24).stroke({ color, width: 4, alpha: fade });
    g.circle(midX, floorY - 70, rad).fill({ color, alpha: 0.34 * fade });
    g.circle(midX, floorY - 70, rad).stroke({ color: 0xffffff, width: 5, alpha: fade });
    g.circle(midX, floorY - 70, rad * 0.62).stroke({ color, width: 3, alpha: 0.8 * fade });
  }

  /**
   * Renders directional dash/cleave boss attacks (e.g. Vesper Midnight Sever, Raijin Thunderclap Blink,
   * Ronin Flash Iaido) with clear source-to-target rails and chevrons instead of a bounding box.
   */
  private drawDashSlashBossSpecial(
    g: Graphics,
    sp: ActiveBossSpecial,
    left: number,
    right: number,
    width: number,
    originX: number,
    dir: 1 | -1,
    floorY: number,
    color: number,
    lowQuality: boolean,
    colorblindCue: boolean,
  ): void {
    const laneY = floorY - 98;
    const isFullArena = width > 720;

    if (sp.phase === 'telegraph') {
      const progress = sp.frame / Math.max(1, sp.telegraphFrames);
      // Horizontal chest-height laser rails marking dash trajectory cleanly (no vertical walls/box!)
      g.moveTo(left, laneY - 26).lineTo(right, laneY - 26)
        .moveTo(left, laneY + 26).lineTo(right, laneY + 26)
        .stroke({ color, width: 2, alpha: 0.35 + progress * 0.45 });

      // Progressing charge ribbon sweeping out from caster origin
      if (isFullArena) {
        const span = Math.max(originX - left, right - originX) * progress;
        g.rect(Math.max(left, originX - span), laneY - 4, Math.min(right, originX + span) - Math.max(left, originX - span), 8)
          .fill({ color: 0xffffff, alpha: 0.45 + progress * 0.4 });
      } else {
        const curW = width * progress;
        const startX = dir === 1 ? left : right - curW;
        g.rect(startX, laneY - 4, curW, 8).fill({ color: 0xffffff, alpha: 0.45 + progress * 0.4 });
      }

      // Bright origin flare star right where the boss launches the cleave/dash from
      const flare = 12 + progress * 16;
      g.circle(originX, laneY, flare).fill({ color, alpha: 0.3 + progress * 0.4 });
      g.moveTo(originX - flare, laneY).lineTo(originX + flare, laneY)
        .moveTo(originX, laneY - flare).lineTo(originX, laneY + flare)
        .stroke({ color: 0xffffff, width: 2.2, alpha: 0.75 + progress * 0.25 });

      // Directional chevrons marching away from originX along the strike lane
      const chevCount = lowQuality ? 5 : 9;
      for (let i = 0; i < chevCount; i += 1) {
        const cx = left + ((i + 0.5) / chevCount) * width;
        const cDir: 1 | -1 = isFullArena ? (cx >= originX ? 1 : -1) : dir;
        g.moveTo(cx - cDir * 7, laneY - 10)
          .lineTo(cx + cDir * 7, laneY)
          .lineTo(cx - cDir * 7, laneY + 10)
          .stroke({ color, width: 2.2, alpha: 0.35 + progress * 0.55, cap: 'round' });
      }

      this.drawCounterplayCue(g, sp, left + width * 0.5, laneY - 44, colorblindCue);
      return;
    }

    const t = sp.frame / Math.max(1, sp.activeFrames);
    const fade = t > 0.72 ? Math.max(0, (1 - t) / 0.28) : 1;
    const sweep = Math.min(1, 0.8 + (sp.frame + 1) * 0.16);

    const beamL = isFullArena ? Math.max(left, originX - Math.max(originX - left, right - originX) * sweep) : dir === 1 ? left : right - width * sweep;
    const beamR = isFullArena ? Math.min(right, originX + Math.max(originX - left, right - originX) * sweep) : dir === 1 ? left + width * sweep : right;
    const beamW = Math.max(24, beamR - beamL);

    for (let i = 0; i < 4; i += 1) {
      const yy = floorY - 150 + i * 35;
      g.moveTo(beamL + beamW * t * 0.15, yy).lineTo(beamR - beamW * t * 0.1, yy - 12)
        .stroke({ color, width: 2.2, alpha: 0.65 * fade });
    }
    // Blazing horizontal blade beam & white core streak (zero enclosing rectangle box!)
    g.rect(beamL, laneY - 26, beamW, 52).fill({ color, alpha: 0.75 * fade });
    g.rect(beamL, laneY - 9, beamW, 18).fill({ color: 0xffffff, alpha: 0.92 * fade });
    g.circle(originX, laneY, 22 + t * 18).stroke({ color: 0xffffff, width: 3, alpha: 0.85 * fade });
  }

  /** Draws a sword planted upright into the arena floor. */
  private drawPlantedSword(
    g: Graphics,
    x: number,
    floorY: number,
    bladeColor: number,
    guardColor: number,
  ): void {
    g.moveTo(x, floorY).lineTo(x, floorY - 76).stroke({
      color: bladeColor,
      width: 5,
      cap: 'round',
    });
    g.moveTo(x - 12, floorY - 62).lineTo(x + 12, floorY - 62).stroke({
      color: guardColor,
      width: 3.5,
      cap: 'round',
    });
  }

  /** Draws foreground visuals for all 5 Player Cinematic Special Powers. */
  public drawPlayerSpecialForeground(
    g: Graphics,
    state: GameState,
    lowQuality: boolean,
    attackerHand?: Vec2,
  ): void {
    const sp = state.activeSpecial;
    if (!sp) return;
    const atk = state.fighters[sp.attacker];
    const vic = state.fighters[sp.victim];
    const atkSpec = CHARACTERS[atk.charId];
    const ax = fromFp(atk.x);
    const vx = fromFp(vic.x);
    const floorY = BALANCE.FLOOR_Y_PX;
    const f = sp.frame;
    const spec = PLAYER_SPECIALS[sp.specialId];
    const impact = spec.impactFrame;

    // Keep aerial_lasers ascent, arena_greatsword windup, and unarmed_launch charge/leap clean.
    const showGenericConverge =
      (sp.specialId !== 'aerial_lasers' || f >= 22) &&
      (sp.specialId !== 'arena_greatsword' || f >= impact) &&
      (sp.specialId !== 'unarmed_launch' || f >= impact);
    const charge = Math.min(1, f / impact);
    const tail = Math.max(0, 1 - (f - impact) / (spec.cinematicFrames - impact));

    if (showGenericConverge) {
      if (f < impact) {
        g.ellipse(vx, floorY, 22 + charge * 38, 8).stroke({
          color: spec.color,
          width: 2,
          alpha: 0.3 + charge * 0.5,
        });
      } else {
        const t = Math.min(1, (f - impact) / 28);
        g.ellipse(vx, floorY - 8, 24 + t * 140, 8 + t * 22)
          .stroke({ color: spec.color, width: 5 * (1 - t) + 1, alpha: 1 - t });
      }

      const count = lowQuality ? 6 : 14;
      for (let i = 0; i < count; i++) {
        const angle = i * 2.399 + f * 0.018;
        const r = f < impact ? 100 * (1 - charge) + 24 : 25 + (1 - tail) * 190;
        const px = vx + Math.cos(angle) * r;
        const py = floorY - 60 + Math.sin(angle) * r * 0.6;
        g.moveTo(px, py).lineTo(px + Math.cos(angle) * 10, py + Math.sin(angle) * 10)
          .stroke({ color: spec.color, width: 2, alpha: f < impact ? charge * 0.65 : tail * tail });
      }
    }

    if (sp.specialId === 'aerial_lasers') {
      // 1. Caster leaves sword planted on the ground, ascends cleanly, then blasts red lasers down on enemy.
      if (f < 136 && atkSpec.weapon !== 'fists') {
        this.drawPlantedSword(g, ax + atk.facing * 20, floorY, atkSpec.weaponColor, atkSpec.accentColor);
      }
      if (f >= 22 && f <= 126) {
        const hoverY = floorY - getAerialLasersLiftPx(f);
        const emitX = ax + atk.facing * 34;
        const emitY = hoverY - 50;
        const targetX = vx;
        const targetY = floorY - 46;

        // Pulse intensity peaks on beatFrames and impactFrame
        let beatPulse = f >= impact && f <= impact + 10 ? 1 : 0;
        for (const bf of spec.beatFrames) {
          if (f >= bf && f < bf + 10) {
            beatPulse = Math.max(beatPulse, 1 - (f - bf) / 10);
          }
        }

        // Emitter flare at outstretched hands
        g.circle(emitX, emitY, 16 + beatPulse * 10).fill({ color: 0xdc2626, alpha: 0.45 });
        g.circle(emitX, emitY, 7 + beatPulse * 4).fill({ color: 0xffffff, alpha: 0.92 });

        // Primary crimson laser beam
        g.moveTo(emitX, emitY).lineTo(targetX, targetY).stroke({
          color: 0xdc2626,
          width: 26 + beatPulse * 10,
          alpha: 0.34,
          cap: 'round',
        });
        g.moveTo(emitX, emitY).lineTo(targetX, targetY).stroke({
          color: 0xef4444,
          width: 13 + beatPulse * 5,
          alpha: 0.78,
          cap: 'round',
        });
        g.moveTo(emitX, emitY).lineTo(targetX, targetY).stroke({
          color: 0xffe4e6,
          width: 4.5 + beatPulse * 2,
          alpha: 0.95,
          cap: 'round',
        });

        // Secondary barrage laser streaks
        const extraBeams = lowQuality ? 1 : 2;
        for (let i = 0; i < extraBeams; i += 1) {
          const wobble = Math.sin(f * 0.48 + i * 2.2) * 26;
          const tx = targetX + wobble;
          const ty = targetY + (i === 0 ? -12 : 10);
          g.moveTo(emitX, emitY).lineTo(tx, ty).stroke({
            color: 0xef4444,
            width: 8,
            alpha: 0.42,
            cap: 'round',
          });
          g.moveTo(emitX, emitY).lineTo(tx, ty).stroke({
            color: 0xffffff,
            width: 2.2,
            alpha: 0.85,
            cap: 'round',
          });
        }

        // Red impact effects on the enemy
        const blastR = 24 + beatPulse * 18 + Math.sin(f * 0.85) * 6;
        g.circle(targetX, targetY, blastR).fill({ color: 0xef4444, alpha: 0.46 });
        g.circle(targetX, targetY, blastR * 0.45).fill({ color: 0xffe4e6, alpha: 0.82 });
        g.ellipse(targetX, floorY, 44 + beatPulse * 36, 10 + beatPulse * 6).stroke({
          color: 0xfca5a5,
          width: 2.5,
          alpha: 0.65 + beatPulse * 0.3,
        });
        const spikes = lowQuality ? 4 : 8;
        for (let s = 0; s < spikes; s += 1) {
          const ang = (s * Math.PI * 2) / spikes + f * 0.14;
          const r1 = 16;
          const r2 = 38 + beatPulse * 24 + (s % 2) * 10;
          g.moveTo(targetX + Math.cos(ang) * r1, targetY + Math.sin(ang) * r1)
            .lineTo(targetX + Math.cos(ang) * r2, targetY + Math.sin(ang) * r2)
            .stroke({ color: 0xfca5a5, width: 2.4, alpha: 0.82, cap: 'round' });
        }
      }
    } else if (sp.specialId === 'arena_greatsword') {
      // 2. Caster leaves normal sword planted, summons Titan Duskblade in hand (small -> colossal), and cleaves enemy.
      if (f < 136 && atkSpec.weapon !== 'fists') {
        this.drawPlantedSword(g, ax - atk.facing * 26, floorY, atkSpec.weaponColor, atkSpec.accentColor);
      }

      if (f >= 12 && f <= 135) {
        const handX = attackerHand?.x ?? ax + atk.facing * 12;
        const handY = attackerHand?.y ?? floorY - 88;
        const growU = Math.min(1, Math.max(0, (f - 12) / 64));
        const growEase = growU * growU * (3 - 2 * growU);
        const targetReach = Math.max(440, Math.abs(vx - handX) + 135);
        const maxLen = Math.min(1020, targetReach);
        const bladeLen = 58 + growEase * (maxLen - 58);
        const bladeW = 10 + growEase * 44;
        const fadeOut = f > 110 ? Math.max(0, 1 - (f - 110) / 25) : 1;

        // Blade angle mirrors PoseRig's windup (-1.55 -> -2.35) and heavy overhead swing (-2.35 -> +0.1)
        let angle = -1.55;
        if (f < 76) {
          const wu = Math.min(1, Math.max(0, (f - 14) / 62));
          const easeWu = wu < 0.5 ? 4 * wu * wu * wu : 1 - Math.pow(-2 * wu + 2, 3) / 2;
          angle = -1.55 + (-2.35 - -1.55) * easeWu;
        } else if (f < 92) {
          const su = (f - 76) / 16;
          const easeSwing = 1 - Math.pow(2, -9 * su);
          angle = -2.35 + (0.1 - -2.35) * easeSwing;
        } else {
          angle = 0.1;
        }

        const dir = atk.facing;
        const cos = Math.cos(angle) * dir;
        const sin = Math.sin(angle);
        // Perpendicular unit vector in world space (rotated 90 deg from (cos, sin))
        const ux = -sin;
        const uy = cos;
        const halfW = bladeW * 0.5;
        const tipX = handX + cos * bladeLen;
        const tipY = handY + sin * bladeLen;
        const shoulderLen = Math.max(24, bladeLen * 0.86);
        const shX = handX + cos * shoulderLen;
        const shY = handY + sin * shoulderLen;

        // Giant golden slash arc trail during the downward swing (f = 76..102)
        if (f >= 76 && f <= 104) {
          const swingFade = f <= 92 ? 1 : Math.max(0, 1 - (f - 92) / 12);
          const arcEnd = angle;
          const arcStart = Math.max(-2.35, arcEnd - 1.35);
          const steps = lowQuality ? 6 : 12;
          const outer: number[] = [];
          const inner: number[] = [];
          const arcRad = bladeLen * 0.92;
          for (let i = 0; i <= steps; i += 1) {
            const u = i / steps;
            const a = arcStart + (arcEnd - arcStart) * u;
            const ac = Math.cos(a) * dir;
            const as = Math.sin(a);
            const thick = Math.sin(u * Math.PI) * 56;
            outer.push(handX + ac * (arcRad + thick * 0.4), handY + as * (arcRad + thick * 0.4));
            inner.unshift(handX + ac * Math.max(20, arcRad - thick), handY + as * Math.max(20, arcRad - thick));
          }
          const trailPoly = [...outer, ...inner];
          g.poly(trailPoly).fill({ color: 0xffc83d, alpha: 0.42 * swingFade });
          g.poly(trailPoly).stroke({ color: 0xfff8dc, width: 2, alpha: 0.65 * swingFade });
        }

        // Giant Titan Duskblade polygon anchored directly at handPos
        g.poly([
          handX + ux * halfW * 0.85,
          handY + uy * halfW * 0.85,
          shX + ux * halfW,
          shY + uy * halfW,
          tipX,
          tipY,
          shX - ux * halfW,
          shY - uy * halfW,
          handX - ux * halfW * 0.85,
          handY - uy * halfW * 0.85,
        ]).fill({ color: 0xffd54f, alpha: 0.9 * fadeOut });

        // Bright core ridge
        g.poly([
          handX + ux * halfW * 0.28,
          handY + uy * halfW * 0.28,
          shX + ux * halfW * 0.32,
          shY + uy * halfW * 0.32,
          tipX - cos * 12,
          tipY - sin * 12,
          shX - ux * halfW * 0.32,
          shY - uy * halfW * 0.32,
          handX - ux * halfW * 0.28,
          handY - uy * halfW * 0.28,
        ]).fill({ color: 0xfff8dc, alpha: 0.92 * fadeOut });

        // Scaled crossguard in hand
        const guardHalf = Math.max(12, halfW * 1.45);
        g.moveTo(handX - ux * guardHalf, handY - uy * guardHalf)
          .lineTo(handX + ux * guardHalf, handY + uy * guardHalf)
          .stroke({ color: 0xf59e0b, width: Math.max(4, bladeW * 0.24), alpha: 0.95 * fadeOut, cap: 'round' });

        // Summon surge ring in hand while growing
        if (f < 76) {
          g.circle(handX, handY, 10 + (1 - (f % 18) / 18) * 24).stroke({
            color: 0xffd54f,
            width: 2,
            alpha: 0.45,
          });
        }
      }
    } else if (sp.specialId === 'unarmed_launch') {
      // 3. Caster leaves sword planted at originX, charges fist, jumps to enemy, and launches enemy to far edge.
      const plantBaseX = sp.originX !== undefined ? fromFp(sp.originX) : ax;
      if (f < 98 && atkSpec.weapon !== 'fists') {
        this.drawPlantedSword(g, plantBaseX - atk.facing * 28, floorY, atkSpec.weaponColor, atkSpec.accentColor);
      }

      const fistX = attackerHand?.x ?? ax + atk.facing * 24;
      const fistY = attackerHand?.y ?? fromFp(atk.y) - 56;

      // Blazing fist energy aura while charging (f 4..56) and through punch follow-through (f 56..72)
      if (f >= 4 && f <= 72) {
        const power = f < impact ? Math.min(1, f / 36) : Math.max(0, 1 - (f - impact) / 16);
        g.circle(fistX, fistY, 10 + power * 14).fill({ color: 0xfef08a, alpha: 0.42 * power });
        g.circle(fistX, fistY, 5 + power * 6).fill({ color: 0xffffff, alpha: 0.85 * power });
        g.circle(fistX, fistY, 14 + ((f * 2) % 16)).stroke({ color: 0xfacc15, width: 2.2, alpha: 0.7 * power });
      }

      // Leap motion streaks (f 28..56)
      if (f >= 28 && f <= impact) {
        const ay = fromFp(atk.y) - 52;
        for (let i = 0; i < (lowQuality ? 2 : 4); i += 1) {
          const oy = ay + (i - 1.5) * 14;
          g.moveTo(ax - atk.facing * (18 + i * 10), oy)
            .lineTo(ax - atk.facing * (54 + i * 16), oy + 10)
            .stroke({ color: 0xfef08a, width: 2.2, alpha: 0.6, cap: 'round' });
        }
      }

      // Fist impact shockwave + airborne enemy launch trail (f 56..96)
      if (f >= impact && f <= 96) {
        const vy = fromFp(vic.y) - 54;
        const impactFade = Math.max(0, 1 - (f - impact) / 24);
        if (impactFade > 0) {
          g.circle(ax + atk.facing * 42, floorY - 58, 20 + (1 - impactFade) * 65).stroke({
            color: 0xffffff,
            width: 4 * impactFade,
            alpha: impactFade,
          });
        }
        // Horizontal speed-lines trailing behind the launched enemy flying to the far edge
        for (let i = 0; i < (lowQuality ? 3 : 5); i += 1) {
          const ly = vy + (i - 2) * 14;
          g.moveTo(vx - atk.facing * 18, ly)
            .lineTo(vx - atk.facing * (85 + i * 24), ly)
            .stroke({ color: 0xfef08a, width: 3, alpha: 0.68, cap: 'round' });
        }
      }
    } else if (sp.specialId === 'blade_impale') {
      // 4. Stolen enemy blade thrust straight through the victim's stomach
      if (f >= 52 && f <= 108) {
        const thrust = Math.min(1, (f - 52) / (impact - 52));
        const startX = vx - atk.facing * 58;
        const tipX = vx + atk.facing * (35 + thrust * 52);
        const y = floorY - 56;
        g.moveTo(startX, y).lineTo(tipX, y).stroke({
          color: 0x94a3b8,
          width: 6,
          cap: 'round',
        });
        g.moveTo(startX, y).lineTo(tipX, y).stroke({
          color: 0xffffff,
          width: 2,
          alpha: 0.85,
          cap: 'round',
        });
        // Crimson impact X-glint at stomach
        const glint = f < impact ? 0 : Math.max(0, 1 - (f - impact) / 32);
        if (glint > 0) {
          g.moveTo(vx - 34, y - 24).lineTo(vx + 34, y + 24).stroke({ color: 0xef4444, width: 5, alpha: glint });
          g.moveTo(vx + 34, y - 24).lineTo(vx - 34, y + 24).stroke({ color: 0xffd54f, width: 3.5, alpha: glint });
        }
      }
    } else if (sp.specialId === 'black_thunder') {
      // 5. Sword raised upward shoots lightning from blade tip into sky (f 10..74),
      //    then colossal vertical thunderbolt crashes down onto the enemy (f 78..122).
      if (f >= 10 && f < impact) {
        const handX = attackerHand?.x ?? ax + atk.facing * 18;
        const handY = attackerHand?.y ?? floorY - 102;
        const bladeLen =
          atkSpec.weapon === 'greatsword'
            ? 88
            : atkSpec.weapon === 'golden_blade'
              ? 76
              : atkSpec.weapon === 'twin_daggers'
                ? 34
                : atkSpec.weapon === 'fists'
                  ? 12
                  : 72;
        const tipX = handX;
        const tipY = handY - bladeLen;
        const riseU = Math.min(1, (f - 10) / 14);
        const skyTop = tipY - riseU * (tipY + 180);
        const segs = lowQuality ? 5 : 9;
        let cx = tipX;
        let cy = tipY;

        // Crackle orb at sword tip
        g.circle(tipX, tipY, 10 + Math.sin(f * 0.8) * 3).fill({ color: 0x93c5fd, alpha: 0.55 });
        g.circle(tipX, tipY, 4.5).fill({ color: 0xffffff, alpha: 0.95 });

        // Rising bolt shooting up from sword tip into the storm clouds
        for (let i = 0; i < segs; i += 1) {
          const t = (i + 1) / segs;
          const ny = tipY + (skyTop - tipY) * t;
          const jitter = Math.sin(f * 0.65 + i * 2.1) * 18;
          const nx = tipX + (i === segs - 1 ? jitter * 0.6 : jitter);
          if (!lowQuality) {
            g.moveTo(cx, cy).lineTo(nx, ny).stroke({ color: 0x60a5fa, width: 12, alpha: 0.42, cap: 'round' });
          }
          g.moveTo(cx, cy).lineTo(nx, ny).stroke({ color: 0xffffff, width: 3.5, alpha: 0.92, cap: 'round' });
          if (!lowQuality && i % 2 === 1) {
            const dirSign = i % 4 === 1 ? 1 : -1;
            g.moveTo(nx, ny).lineTo(nx + dirSign * 34, ny - 22).lineTo(nx + dirSign * 22, ny - 46)
              .stroke({ color: 0x93c5fd, width: 1.8, alpha: 0.65 });
          }
          cx = nx;
          cy = ny;
        }
      }

      if (f >= impact && f <= impact + 44) {
        const a = Math.max(0, 1 - (f - impact) / 44);
        const segs = lowQuality ? 6 : 10;
        let cx = vx;
        let cy = -120;
        for (let i = 0; i < segs; i += 1) {
          const ny = -120 + ((floorY + 120) * (i + 1)) / segs;
          const nx = i === segs - 1 ? vx : vx + ((i % 2 === 0 ? 1 : -1) * 26);
          if (!lowQuality) {
            g.moveTo(cx, cy).lineTo(nx, ny).stroke({ color: 0x60a5fa, width: 24 * a, alpha: a * 0.45, cap: 'round' });
          }
          g.moveTo(cx, cy).lineTo(nx, ny).stroke({ color: 0xffffff, width: 8 * a, alpha: a, cap: 'round' });
          if (!lowQuality && i % 3 === 1) {
            g.moveTo(nx, ny).lineTo(nx + 55, ny + 22).lineTo(nx + 35, ny + 55)
              .stroke({ color: 0x93c5fd, width: 2, alpha: a * 0.7 });
          }
          cx = nx;
          cy = ny;
        }
        g.ellipse(vx, floorY, 85 * (1.2 - a * 0.3), 18).stroke({ color: 0x93c5fd, width: 4, alpha: a });
      }
    }
  }
}
