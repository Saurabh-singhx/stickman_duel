import { Graphics } from 'pixi.js';
import { BALANCE } from '../data/balance';
import { findBossSpecial, PLAYER_SPECIALS } from '../data/specials';
import { fromFp } from '../sim/Fixed';
import type { ActiveBossSpecial, ActivePlayerSpecial, GameState } from '../sim/State';

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
      // Pitch-black storm background
      g.rect(-260, -200, 1800, 1000).fill({ color: 0x05060b, alpha });
      if (!reduceFlashing && activeSpecial.frame >= spec.impactFrame && activeSpecial.frame < spec.impactFrame + 10) {
        const flashA = (1 - (activeSpecial.frame - spec.impactFrame) / 10) * 0.35;
        g.rect(-260, -200, 1800, 1000).fill({ color: 0xdbeafe, alpha: flashA });
      }
    } else if (activeSpecial.specialId === 'aerial_lasers' || activeSpecial.specialId === 'arena_greatsword') {
      g.rect(-260, -200, 1800, 1000).fill({ color: 0x100f0d, alpha: 0.45 });
    }
  }

  /** Draws all active Boss Arena / Half-Arena Special Attacks (telegraph zones & active blasts). */
  public drawBossSpecials(
    g: Graphics,
    specials: readonly ActiveBossSpecial[],
    colorblindCue: boolean,
    lowQuality = false,
  ): void {
    const floorY = BALANCE.FLOOR_Y_PX;
    for (const sp of specials) {
      const spec = findBossSpecial(sp.specialId);
      const color = spec?.color ?? 0xef4444;
      const left = fromFp(sp.left);
      const right = fromFp(sp.right);
      const width = Math.max(20, right - left);
      const height = sp.lowGround ? 52 : 190;
      const top = floorY - height;

      if (sp.phase === 'telegraph') {
        const progress = sp.frame / Math.max(1, sp.telegraphFrames);
        const pulse = 0.35 + progress * 0.25;
        g.rect(left, top, width, height).fill({ color, alpha: 0.12 + progress * 0.16 });
        g.rect(left, top, width, height).stroke({ color, width: 2.5, alpha: pulse + 0.35 });
        // Repeated floor marks communicate the entire danger footprint.
        const marks = lowQuality ? 6 : 12;
        for (let i = 0; i < marks; i++) {
          const px = left + (i + 0.5) * width / marks;
          g.moveTo(px - 7, floorY - 14).lineTo(px, floorY - 23).lineTo(px + 7, floorY - 14)
            .stroke({ color, width: 2, alpha: 0.25 + progress * 0.6 });
        }
        // Filling danger bar along floor
        g.rect(left, floorY - 6, width * progress, 6).fill({ color, alpha: 0.85 });

        if (colorblindCue || sp.lowGround) {
          const midX = left + width * 0.5;
          const cy = top - 16;
          if (sp.lowGround) {
            // Upward jump chevron cue
            g.moveTo(midX - 10, cy + 6)
              .lineTo(midX, cy - 6)
              .lineTo(midX + 10, cy + 6)
              .stroke({ color: 0xffe066, width: 3, cap: 'round' });
          } else if (sp.parryable) {
            g.circle(midX, cy, 8).stroke({ color: 0xffe066, width: 2.5 });
          }
        }
      } else {
        // Keep the complete damaging footprint visible for every attack shape.
        g.rect(left, top, width, height).fill({ color, alpha: 0.18 });
        g.rect(left, top, width, height).stroke({ color, width: 2, alpha: 0.65 });
        // Active arena blast visuals by shape
        const t = sp.frame / Math.max(1, sp.activeFrames);
        const alpha = 1 - t * 0.65;
        const shape = spec?.shape ?? 'ground_wave';

        const pieces = lowQuality ? 6 : 14;
        for (let i = 0; i < pieces; i++) {
          const px = left + (i + 0.5) * width / pieces;
          const rise = Math.sin(Math.PI * t) * (18 + (i % 4) * 12);
          g.moveTo(px, floorY - rise).lineTo(px + 5, floorY - rise - 10)
            .stroke({ color, width: 2, alpha });
        }
        if (shape === 'ground_wave') {
          for (let i = 0; i < pieces; i++) {
            const px = left + i * width / pieces;
            const h = height * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 2 + (i % 3) * 0.15)));
            g.poly([px, floorY, px + width / pieces * 0.5, floorY - h, px + width / pieces, floorY])
              .fill({ color, alpha: alpha * 0.6 });
          }
          g.rect(left, top, width, height).fill({ color, alpha: alpha * 0.22 });
          g.rect(left, top + 8, width, height * 0.45).fill({ color: 0xffffff, alpha: alpha * 0.2 });
        } else if (shape === 'sky_beams') {
          const beamCount = lowQuality ? 3 : 5;
          const step = width / beamCount;
          for (let i = 0; i < beamCount; i += 1) {
            const bx = left + step * (i + 0.5);
            g.ellipse(bx, floorY, 35 + t * 40, 9 + t * 8).stroke({ color, width: 3, alpha });
            g.rect(bx - 22, -40, 44, floorY + 40).fill({ color, alpha: alpha * 0.65 });
            g.rect(bx - 8, -40, 16, floorY + 40).fill({ color: 0xffffff, alpha: alpha * 0.85 });
          }
        } else if (shape === 'shock_nova') {
          const midX = left + width * 0.5;
          const rad = (width * 0.48) * (0.35 + t * 0.75);
          g.ellipse(midX, floorY - 4, rad, 24 + t * 35).stroke({ color, width: 4, alpha });
          g.circle(midX, floorY - 70, rad).fill({ color, alpha: alpha * 0.35 });
          g.circle(midX, floorY - 70, rad).stroke({ color: 0xffffff, width: 5, alpha });
        } else {
          for (let i = 0; i < 4; i++) {
            const yy = floorY - 150 + i * 35;
            g.moveTo(left + width * t * 0.25, yy).lineTo(right - width * t * 0.15, yy - 18)
              .stroke({ color, width: 2, alpha: alpha * 0.6 });
          }
          // dash_slash horizontal beam across zone
          g.rect(left, floorY - 115, width, 54).fill({ color, alpha: alpha * 0.78 });
          g.rect(left, floorY - 98, width, 18).fill({ color: 0xffffff, alpha: alpha * 0.9 });
        }
      }
    }
  }

  /** Draws foreground visuals for all 5 Player Cinematic Special Powers. */
  public drawPlayerSpecialForeground(
    g: Graphics,
    state: GameState,
    lowQuality: boolean,
  ): void {
    const sp = state.activeSpecial;
    if (!sp) return;
    const atk = state.fighters[sp.attacker];
    const vic = state.fighters[sp.victim];
    const ax = fromFp(atk.x);
    const vx = fromFp(vic.x);
    const floorY = BALANCE.FLOOR_Y_PX;
    const f = sp.frame;
    const spec = PLAYER_SPECIALS[sp.specialId];
    const impact = spec.impactFrame;
    if (f < impact) {
      const charge = f / impact;
      g.ellipse(vx, floorY, 22 + charge * 38, 8).stroke({ color: spec.color, width: 2, alpha: 0.3 + charge * 0.5 });
    } else {
      const t = Math.min(1, (f - impact) / 28);
      g.ellipse(vx, floorY - 8, 24 + t * 140, 8 + t * 22)
        .stroke({ color: spec.color, width: 5 * (1 - t) + 1, alpha: 1 - t });
    }

    const charge = Math.min(1, f / impact);
    const tail = Math.max(0, 1 - (f - impact) / (spec.cinematicFrames - impact));
    const count = lowQuality ? 6 : 14;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399 + f * 0.018;
      const r = f < impact ? 100 * (1 - charge) + 24 : 25 + (1 - tail) * 190;
      const px = vx + Math.cos(angle) * r;
      const py = floorY - 60 + Math.sin(angle) * r * 0.6;
      g.moveTo(px, py).lineTo(px + Math.cos(angle) * 10, py + Math.sin(angle) * 10)
        .stroke({ color: spec.color, width: 2, alpha: f < impact ? charge * 0.65 : tail * tail });
    }

    if (sp.specialId === 'aerial_lasers') {
      // 1. Character hovers in the air and blasts golden-white energy lasers down at the enemy
      const hoverX = ax;
      const hoverY = floorY - 55 - Math.min(1, f / 18, (spec.cinematicFrames - f) / 18) * 195;
      g.arc(hoverX, hoverY, 43, f * 0.04, f * 0.04 + Math.PI * 1.5)
        .stroke({ color: spec.color, width: 2, alpha: 0.65 });
      g.circle(hoverX, hoverY, 32).fill({ color: 0xffe066, alpha: 0.25 });
      if (f >= 18 && f <= 130) {
        const beamCount = lowQuality ? 2 : 4;
        for (let i = 0; i < beamCount; i += 1) {
          const wobble = Math.sin(f * 0.45 + i * 1.6) * 24;
          const tx = vx + wobble;
          const ty = floorY - 45 + (i - 1) * 14;
          g.moveTo(hoverX, hoverY + 12).lineTo(tx, ty).stroke({
            color: 0xffc83d,
            width: 16,
            alpha: 0.42,
            cap: 'round',
          });
          g.moveTo(hoverX, hoverY + 12).lineTo(tx, ty).stroke({
            color: 0xffffff,
            width: 5,
            alpha: 0.92,
            cap: 'round',
          });
        }
        g.circle(vx, floorY - 45, 28 + Math.sin(f * 0.8) * 8).fill({ color: 0xffe066, alpha: 0.5 });
      }
    } else if (sp.specialId === 'arena_greatsword') {
      // 2. Colossal golden greatsword covering the entire arena crashes down onto the enemy
      const dropT = Math.min(1, Math.max(0, (f - 28) / 64));
      const eased = dropT * dropT * dropT;
      const swordY = -220 + eased * (floorY - 60 + 220);
      const bladeLeft = 60;
      const bladeRight = 1220;
      const bladeH = 82;
      // Colossal glowing golden blade spanning the entire arena width
      g.poly([
        bladeLeft,
        swordY - bladeH * 0.4,
        bladeRight - 95,
        swordY - bladeH * 0.5,
        bladeRight,
        swordY,
        bladeRight - 95,
        swordY + bladeH * 0.5,
        bladeLeft,
        swordY + bladeH * 0.4,
      ]).fill({ color: 0xffd54f, alpha: 0.86 });
      g.rect(bladeLeft + 20, swordY - 12, bladeRight - bladeLeft - 140, 24).fill({
        color: 0xfff8dc,
        alpha: 0.9,
      });
      for (let i = 0; i < (lowQuality ? 3 : 7); i++) {
        const xx = bladeLeft + 100 + i * 140;
        g.moveTo(xx, swordY - 48).lineTo(xx, swordY - 100 - eased * 90)
          .stroke({ color: spec.color, width: 2, alpha: 0.35 * tail });
      }
      // Giant crossguard on left
      g.rect(bladeLeft - 24, swordY - 72, 24, 144).fill({ color: 0xf59e0b, alpha: 0.95 });
    } else if (sp.specialId === 'unarmed_launch') {
      // 3. Hero's sword planted upright in the floor + blazing fist shockwave blasting victim to far edge
      if (f < impact) {
        g.circle(ax + atk.facing * 30, floorY - 62, 8 + charge * 18)
          .stroke({ color: spec.color, width: 3, alpha: charge });
      }
      const plantX = ax - atk.facing * 52;
      g.moveTo(plantX, floorY).lineTo(plantX, floorY - 76).stroke({
        color: 0xffd54f,
        width: 5,
        cap: 'round',
      });
      g.moveTo(plantX - 12, floorY - 62).lineTo(plantX + 12, floorY - 62).stroke({
        color: 0xf5c84c,
        width: 3.5,
        cap: 'round',
      });
      if (f >= impact && f <= impact + 39) {
        const a = Math.max(0, 1 - (f - impact) / 39);
        g.moveTo(ax + atk.facing * 30, floorY - 62)
          .lineTo(vx, floorY - 62)
          .stroke({ color: 0xfef08a, width: 22 * a, alpha: a * 0.6, cap: 'round' });
        g.circle(vx, floorY - 62, 42 * (1.2 - a * 0.5)).stroke({
          color: 0xffffff,
          width: 4,
          alpha: a,
        });
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
      // 5. Single colossal vertical thunderbolt striking straight down on the enemy against black sky
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
