import type { Graphics } from 'pixi.js';
import type { BossSpecialShape } from '../data/specials';
import type { ActiveBossSpecial } from '../sim/State';

export interface BossSignatureCtx {
  readonly sp: ActiveBossSpecial;
  readonly shape: BossSpecialShape;
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly originX: number;
  readonly dir: 1 | -1;
  readonly floorY: number;
  readonly color: number;
  readonly lowQuality: boolean;
}

/**
 * Renders the 12 character-specific signature Boss Special shapes (zero rectangular bounding boxes).
 * Returns true if the shape was handled as a signature shape; false falls back to the 4 base shapes.
 */
export function drawBossSignatureSpecial(g: Graphics, c: BossSignatureCtx): boolean {
  switch (c.shape) {
    case 'starfall_spears':
      drawStarfallSpears(g, c);
      return true;
    case 'eclipse_ring':
      drawEclipseRing(g, c);
      return true;
    case 'zigzag_chain':
      drawZigzagChain(g, c);
      return true;
    case 'tempest_vortex':
      drawTempestVortex(g, c);
      return true;
    case 'blade_rain':
      drawBladeRain(g, c);
      return true;
    case 'traveling_crescent':
      drawTravelingCrescent(g, c);
      return true;
    case 'boulder_rupture':
      drawBoulderRupture(g, c);
      return true;
    case 'rock_monoliths':
      drawRockMonoliths(g, c);
      return true;
    case 'cross_slashes':
      drawCrossSlashes(g, c);
      return true;
    case 'shadow_clones':
      drawShadowClones(g, c);
      return true;
    case 'falling_coffins':
      drawFallingCoffins(g, c);
      return true;
    case 'soul_geyser':
      drawSoulGeyser(g, c);
      return true;
    default:
      return false;
  }
}

function getProgress(sp: ActiveBossSpecial): number {
  return sp.frame / Math.max(1, sp.telegraphFrames);
}

function getActiveBurst(sp: ActiveBossSpecial): { t: number; burst: number; fade: number } {
  const t = sp.frame / Math.max(1, sp.activeFrames);
  const burst = Math.min(1, 0.85 + (sp.frame + 1) * 0.14);
  const fade = t > 0.72 ? Math.max(0, (1 - t) / 0.28) : 1;
  return { t, burst, fade };
}

/** 1. Vesper Signature: Angled diagonal astral spears hovering in upper sky then lancing diagonally down. */
function drawStarfallSpears(g: Graphics, c: BossSignatureCtx): void {
  const { sp, left, width, floorY, color, dir } = c;
  const count = 5;
  const step = width / count;
  const slant = -dir * 130;

  if (sp.phase === 'telegraph') {
    const p = getProgress(sp);
    for (let i = 0; i < count; i += 1) {
      const tx = left + step * (i + 0.5);
      const sx = tx + slant;
      const sy = floorY - 255;
      // Projected diagonal flight line from spear in sky down to ground target X
      g.moveTo(sx, sy).lineTo(tx, floorY).stroke({ color, width: 1.6, alpha: 0.25 + p * 0.45 });
      g.ellipse(tx, floorY - 2, 22, 6).stroke({ color, width: 2, alpha: 0.4 + p * 0.5 });
      // Hovering silver-cyan astral spear pointing diagonally toward target
      const ux = (tx - sx) / 260;
      const uy = (floorY - sy) / 260;
      const spearX = sx + ux * (15 + p * 25);
      const spearY = sy + uy * (15 + p * 25);
      const tipX = spearX + ux * 58;
      const tipY = spearY + uy * 58;
      g.moveTo(spearX, spearY).lineTo(tipX, tipY).stroke({ color, width: 5, alpha: 0.85, cap: 'round' });
      g.moveTo(spearX, spearY).lineTo(tipX, tipY).stroke({ color: 0xffffff, width: 2, alpha: 0.95, cap: 'round' });
    }
    return;
  }

  const { t, burst, fade } = getActiveBurst(sp);
  for (let i = 0; i < count; i += 1) {
    const tx = left + step * (i + 0.5);
    const sx = tx + slant;
    const sy = floorY - 260;
    const gx = sx + (tx - sx) * burst;
    const gy = sy + (floorY - sy) * burst;
    g.moveTo(sx, sy).lineTo(gx, gy).stroke({ color, width: 16, alpha: 0.65 * fade, cap: 'round' });
    g.moveTo(sx, sy).lineTo(gx, gy).stroke({ color: 0xffffff, width: 5.5, alpha: 0.95 * fade, cap: 'round' });
    g.ellipse(tx, floorY - 2, 26 + t * 30, 8 + t * 6).stroke({ color, width: 3, alpha: fade });
    g.moveTo(tx - 16, floorY - 16).lineTo(tx + 16, floorY + 2)
      .moveTo(tx + 16, floorY - 16).lineTo(tx - 16, floorY + 2)
      .stroke({ color: 0xffffff, width: 2.2, alpha: fade });
  }
}

/** 2. Vesper Signature: Dark Solar Eclipse ring aloft casting twin sweeping black-violet crescent scythes. */
function drawEclipseRing(g: Graphics, c: BossSignatureCtx): void {
  const { sp, left, width, floorY, color } = c;
  const midX = left + width * 0.5;
  const moonY = floorY - 135;

  if (sp.phase === 'telegraph') {
    const p = getProgress(sp);
    const moonR = 26 + p * 16;
    // Wide violet crescent moon arc marking floor reach
    g.moveTo(left, floorY - 2).quadraticCurveTo(midX, floorY - 18, left + width, floorY - 2)
      .stroke({ color, width: 2.2, alpha: 0.4 + p * 0.45 });
    // Glowing eclipse corona in sky with black core occlusion
    g.circle(midX, moonY, moonR + 8).fill({ color, alpha: 0.25 + p * 0.35 });
    g.circle(midX, moonY, moonR).fill({ color: 0x110e1c, alpha: 0.92 });
    g.circle(midX, moonY, moonR).stroke({ color: 0xf5f3ff, width: 3, alpha: 0.7 + p * 0.3 });
    // Twin converging crescent rays descending left and right
    const span = width * 0.44 * (1 - p * 0.45);
    g.moveTo(midX - moonR, moonY + 12).lineTo(midX - span, floorY)
      .moveTo(midX + moonR, moonY + 12).lineTo(midX + span, floorY)
      .stroke({ color, width: 1.8, alpha: 0.35 + p * 0.45 });
    return;
  }

  const { t, burst, fade } = getActiveBurst(sp);
  const spread = width * 0.48 * burst;
  g.circle(midX, moonY, 44).fill({ color: 0x0b0914, alpha: 0.9 * fade });
  g.circle(midX, moonY, 46 + t * 14).stroke({ color: 0xffffff, width: 4.5, alpha: fade });
  // Twin sweeping eclipse crescent scythe blades cutting across the target zone
  for (const sDir of [-1, 1] as const) {
    const cx = midX + sDir * spread * 0.45;
    g.moveTo(midX, moonY - 30)
      .quadraticCurveTo(cx + sDir * spread * 0.45, floorY - 82, midX + sDir * spread, floorY - 4)
      .stroke({ color, width: 18, alpha: 0.72 * fade, cap: 'round' });
    g.moveTo(midX, moonY - 30)
      .quadraticCurveTo(cx + sDir * spread * 0.45, floorY - 82, midX + sDir * spread, floorY - 4)
      .stroke({ color: 0xffffff, width: 5, alpha: 0.9 * fade, cap: 'round' });
  }
  g.ellipse(midX, floorY - 2, spread, 12).stroke({ color, width: 3.5, alpha: fade });
}

/** 3. Raijin Signature: Zig-zag lightning blink chain bouncing between high/low aerial anchor nodes. */
function drawZigzagChain(g: Graphics, c: BossSignatureCtx): void {
  const { sp, left, right, width, floorY, color, dir } = c;
  const startX = dir === 1 ? left + 20 : right - 20;
  const endX = dir === 1 ? right - 20 : left + 20;
  const span = endX - startX;
  const pts = [
    { x: startX, y: floorY - 68 },
    { x: startX + span * 0.25, y: floorY - 158 },
    { x: startX + span * 0.5, y: floorY - 42 },
    { x: startX + span * 0.75, y: floorY - 162 },
    { x: endX, y: floorY - 68 },
  ];

  if (sp.phase === 'telegraph') {
    const p = getProgress(sp);
    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i]!.x, pts[i]!.y);
    g.stroke({ color, width: 2 + p * 2.5, alpha: 0.4 + p * 0.5 });
    for (const pt of pts) {
      g.circle(pt.x, pt.y, 12 - p * 4).stroke({ color: 0xffffff, width: 2, alpha: 0.5 + p * 0.5 });
    }
    return;
  }

  const { fade } = getActiveBurst(sp);
  const jitter = Math.sin(sp.frame * 1.9) * 8;
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i += 1) {
    g.lineTo(pts[i]!.x + (i % 2 === 0 ? jitter : -jitter), pts[i]!.y + (i % 2 === 1 ? jitter : -jitter));
  }
  g.stroke({ color, width: 20, alpha: 0.7 * fade, join: 'round', cap: 'round' });

  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.stroke({ color: 0xffffff, width: 6, alpha: 0.96 * fade, join: 'round', cap: 'round' });

  for (const pt of pts) {
    const d = 18 * fade;
    g.poly([pt.x, pt.y - d, pt.x + d * 0.7, pt.y, pt.x, pt.y + d, pt.x - d * 0.7, pt.y])
      .fill({ color: 0xffffff, alpha: 0.9 * fade });
  }
  if (width > 0) g.ellipse(pts[2]!.x, floorY - 2, 34, 8).stroke({ color, width: 2.5, alpha: fade });
}

/** 4. Raijin Signature: Spinning tornado cyclone vortex cone twisting upward from floor to sky. */
function drawTempestVortex(g: Graphics, c: BossSignatureCtx): void {
  const { sp, left, width, floorY, color } = c;
  const midX = left + width * 0.5;
  const rings = 6;

  if (sp.phase === 'telegraph') {
    const p = getProgress(sp);
    for (let i = 0; i < rings; i += 1) {
      const u = i / (rings - 1);
      const y = floorY - 12 - u * 175;
      const rx = 28 + u * (width * 0.38);
      const spin = Math.sin(sp.frame * 0.25 + i) * 14;
      g.ellipse(midX + spin * (1 - u), y, rx * (1.1 - p * 0.25), 8 + u * 8).stroke({
        color: i % 2 === 0 ? color : 0xffffff,
        width: 1.8 + p,
        alpha: 0.35 + p * 0.45,
      });
    }
    return;
  }

  const { t, fade } = getActiveBurst(sp);
  for (let i = 0; i < rings + 2; i += 1) {
    const u = i / (rings + 1);
    const y = floorY - 8 - u * 185;
    const sway = Math.sin(sp.frame * 0.55 + i * 0.9) * 18;
    const rx = (34 + u * (width * 0.42)) * (0.9 + t * 0.2);
    g.ellipse(midX + sway, y, rx, 10 + u * 10).stroke({
      color: i % 2 === 0 ? color : 0xffffff,
      width: 5 - u * 1.5,
      alpha: (0.88 - u * 0.25) * fade,
    });
  }
  // Central roaring cyclone shaft
  g.poly([midX - 24, floorY, midX - width * 0.36, floorY - 195, midX + width * 0.36, floorY - 195, midX + 24, floorY])
    .fill({ color, alpha: 0.22 * fade });
  g.moveTo(midX - 18, floorY).lineTo(midX + 18, floorY - 190)
    .moveTo(midX + 18, floorY).lineTo(midX - 18, floorY - 190)
    .stroke({ color: 0xffffff, width: 2.5, alpha: 0.7 * fade });
}

/** 5. Ash Ronin Signature: Spectral dark-steel katanas hovering aloft then plummeting blade-first into the earth. */
function drawBladeRain(g: Graphics, c: BossSignatureCtx): void {
  const { sp, left, width, floorY, color } = c;
  const blades = 8;
  const step = width / blades;

  if (sp.phase === 'telegraph') {
    const p = getProgress(sp);
    for (let i = 0; i < blades; i += 1) {
      const bx = left + step * (i + 0.5);
      const bob = Math.sin(sp.frame * 0.3 + i * 1.1) * 3;
      const topY = floorY - 220 + (i % 2) * 16 + bob;
      // Drop line to floor impact point
      g.moveTo(bx, topY + 62).lineTo(bx, floorY).stroke({ color, width: 1.3, alpha: 0.22 + p * 0.4 });
      g.ellipse(bx, floorY - 2, 14, 4).stroke({ color: 0xffffff, width: 1.5, alpha: 0.35 + p * 0.5 });
      // Hovering phantom katana silhouette (hilt at top, point downward)
      g.moveTo(bx - 8, topY + 14).lineTo(bx + 8, topY + 14).stroke({ color: 0xe2e8f0, width: 2.5, alpha: 0.85 });
      g.moveTo(bx, topY).lineTo(bx, topY + 62).stroke({ color: 0xf8fafc, width: 3.5, alpha: 0.55 + p * 0.4 });
    }
    return;
  }

  const { t, burst, fade } = getActiveBurst(sp);
  for (let i = 0; i < blades; i += 1) {
    const bx = left + step * (i + 0.5);
    const len = 76;
    const tipY = floorY - 195 + (195) * burst;
    g.moveTo(bx, -40).lineTo(bx, tipY).stroke({ color, width: 18, alpha: 0.44 * fade });
    g.moveTo(bx, tipY - len).lineTo(bx, tipY).stroke({ color: 0xffffff, width: 5, alpha: 0.95 * fade });
    g.moveTo(bx - 10, tipY - len + 18).lineTo(bx + 10, tipY - len + 18)
      .stroke({ color: 0x94a3b8, width: 3.5, alpha: fade });
    if (burst >= 0.9) {
      g.ellipse(bx, floorY - 2, 16 + t * 22, 5 + t * 4).stroke({ color: 0xe2e8f0, width: 2, alpha: fade });
    }
  }
}

/** 6. Ash Ronin Signature: Curved crescent iaido wind-blade surfing rapidly across the floor. */
function drawTravelingCrescent(g: Graphics, c: BossSignatureCtx): void {
  const { sp, left, right, floorY, color, dir } = c;
  const startX = dir === 1 ? left + 18 : right - 18;
  const endX = dir === 1 ? right - 10 : left + 10;

  if (sp.phase === 'telegraph') {
    const p = getProgress(sp);
    // Low path wind streaks along the floor
    g.moveTo(left, floorY - 6).lineTo(right, floorY - 6).stroke({ color, width: 2, alpha: 0.3 + p * 0.45 });
    g.moveTo(left, floorY - 26).lineTo(right, floorY - 26).stroke({ color: 0xffffff, width: 1.5, alpha: 0.25 + p * 0.4 });
    // Coiled wind crescent hovering right beside Ronin before release
    const cx = startX + dir * (16 - p * 8);
    g.moveTo(cx - dir * 10, floorY - 56)
      .quadraticCurveTo(cx + dir * 26, floorY - 28, cx - dir * 4, floorY)
      .stroke({ color: 0xffffff, width: 4 + p * 3, alpha: 0.65 + p * 0.35, cap: 'round' });
    return;
  }

  const { fade } = getActiveBurst(sp);
  const travel = Math.min(1, 0.28 + (sp.frame + 1) * 0.18);
  const waveX = startX + (endX - startX) * travel;
  // Sweeping ground wake trailing behind the crescent wave
  g.moveTo(startX, floorY - 4).lineTo(waveX, floorY - 4).stroke({ color, width: 6, alpha: 0.55 * fade });
  g.moveTo(startX, floorY - 20).lineTo(waveX, floorY - 20).stroke({ color: 0xffffff, width: 2.5, alpha: 0.7 * fade });
  // Razor curved crescent wind-blade surging across floor
  g.poly([
    waveX - dir * 32, floorY - 58,
    waveX + dir * 28, floorY - 30,
    waveX - dir * 18, floorY,
    waveX + dir * 6, floorY - 28,
  ]).fill({ color, alpha: 0.85 * fade });
  g.moveTo(waveX - dir * 28, floorY - 58)
    .quadraticCurveTo(waveX + dir * 32, floorY - 30, waveX - dir * 14, floorY)
    .stroke({ color: 0xffffff, width: 4.5, alpha: fade, cap: 'round' });
}

/** 7. Ochre Brute Signature: Heavy cracked earth boulders erupting along fractured magma floor. */
function drawBoulderRupture(g: Graphics, c: BossSignatureCtx): void {
  const { sp, left, width, floorY, color, lowQuality } = c;
  const rocks = lowQuality ? 9 : 14;
  const step = width / rocks;

  if (sp.phase === 'telegraph') {
    const p = getProgress(sp);
    g.rect(left, floorY - 4, width, 5).fill({ color: 0x78350f, alpha: 0.65 });
    g.moveTo(left, floorY - 1).lineTo(left + width, floorY - 1).stroke({ color, width: 3, alpha: 0.5 + p * 0.5 });
    for (let i = 0; i < rocks; i += 1) {
      const rx = left + (i + 0.5) * step;
      const bulge = 6 + p * 12;
      g.poly([rx - 14, floorY, rx - 6, floorY - bulge, rx + 7, floorY - bulge * 0.85, rx + 14, floorY])
        .fill({ color: 0x451a03, alpha: 0.85 })
        .stroke({ color, width: 2, alpha: 0.5 + p * 0.5 });
    }
    return;
  }

  const { burst, fade } = getActiveBurst(sp);
  // Continuous magma fault ridge connecting all boulders so no bare safe floor gap misleads the player
  g.rect(left, floorY - 22 * burst, width, 22 * burst).fill({ color: 0x451a03, alpha: 0.55 * fade });
  g.moveTo(left, floorY - 8 * burst).lineTo(left + width, floorY - 8 * burst)
    .stroke({ color, width: 4, alpha: 0.85 * fade });
  for (let i = 0; i < rocks; i += 1) {
    const rx = left + (i + 0.5) * step;
    const h = (38 + (i % 3) * 8) * burst;
    const hw = 15 + (i % 2) * 5;
    g.poly([
      rx - hw, floorY,
      rx - hw * 0.65, floorY - h * 0.8,
      rx, floorY - h,
      rx + hw * 0.7, floorY - h * 0.72,
      rx + hw, floorY,
    ])
      .fill({ color: 0x292018, alpha: 0.94 * fade })
      .stroke({ color, width: 2.8, alpha: fade });
    // Glowing golden fault crack inside boulder
    g.moveTo(rx - 4, floorY - 4).lineTo(rx + 2, floorY - h * 0.55).lineTo(rx - 3, floorY - h * 0.85)
      .stroke({ color: 0xfef08a, width: 2, alpha: fade });
  }
}

/** 8. Ochre Brute Signature: Colossal stone monolith pillars bursting straight UP out of cracked floor seals. */
function drawRockMonoliths(g: Graphics, c: BossSignatureCtx): void {
  const { sp, left, width, floorY, color } = c;
  const pillars = 3;
  const step = width / pillars;

  if (sp.phase === 'telegraph') {
    const p = getProgress(sp);
    for (let i = 0; i < pillars; i += 1) {
      const px = left + step * (i + 0.5);
      // Cracked ground seal & UPWARD magma crack jets (showing attack comes from UNDERGROUND UP)
      g.ellipse(px, floorY - 2, 42, 10).fill({ color: 0x451a03, alpha: 0.75 });
      g.ellipse(px, floorY - 2, 42, 10).stroke({ color, width: 3, alpha: 0.5 + p * 0.5 });
      for (const ox of [-18, 0, 18]) {
        g.moveTo(px + ox, floorY - 4)
          .lineTo(px + ox * 1.15, floorY - 22 - p * 45)
          .stroke({ color, width: 2.5, alpha: 0.4 + p * 0.55 });
      }
    }
    return;
  }

  const { burst, fade } = getActiveBurst(sp);
  for (let i = 0; i < pillars; i += 1) {
    const px = left + step * (i + 0.5);
    const h = 192 * burst;
    const hw = 28;
    // Giant jagged dark-earth stone monolith punching upward
    g.poly([
      px - hw, floorY,
      px - hw * 0.85, floorY - h * 0.9,
      px, floorY - h,
      px + hw * 0.85, floorY - h * 0.88,
      px + hw, floorY,
    ])
      .fill({ color: 0x262018, alpha: 0.95 * fade })
      .stroke({ color, width: 3.5, alpha: fade });
    g.moveTo(px - 8, floorY - 8).lineTo(px + 6, floorY - h * 0.5).lineTo(px - 4, floorY - h * 0.85)
      .stroke({ color: 0xfef08a, width: 3, alpha: 0.88 * fade });
    g.ellipse(px, floorY - 2, 46, 11).stroke({ color: 0xffffff, width: 2.5, alpha: fade });
  }
}

/** 9. Crimson Shade Signature: Criss-crossing diagonal scarlet razor wires snapping shut simultaneously. */
function drawCrossSlashes(g: Graphics, c: BossSignatureCtx): void {
  const { sp, left, width, floorY, color } = c;
  const cells = 3;
  const cw = width / cells;

  if (sp.phase === 'telegraph') {
    const p = getProgress(sp);
    for (let i = 0; i < cells; i += 1) {
      const x1 = left + i * cw;
      const x2 = x1 + cw;
      g.moveTo(x1 + 8, floorY - 185).lineTo(x2 - 8, floorY - 6)
        .moveTo(x2 - 8, floorY - 185).lineTo(x1 + 8, floorY - 6)
        .stroke({ color, width: 1.8 + p * 1.4, alpha: 0.35 + p * 0.55 });
    }
    return;
  }

  const { fade } = getActiveBurst(sp);
  for (let i = 0; i < cells; i += 1) {
    const x1 = left + i * cw;
    const x2 = x1 + cw;
    g.moveTo(x1 + 4, floorY - 188).lineTo(x2 - 4, floorY - 4)
      .moveTo(x2 - 4, floorY - 188).lineTo(x1 + 4, floorY - 4)
      .stroke({ color, width: 14, alpha: 0.85 * fade, cap: 'round' });
    g.moveTo(x1 + 4, floorY - 188).lineTo(x2 - 4, floorY - 4)
      .moveTo(x2 - 4, floorY - 188).lineTo(x1 + 4, floorY - 4)
      .stroke({ color: 0xffffff, width: 4, alpha: 0.95 * fade, cap: 'round' });
  }
}

/** 10. Crimson Shade Signature: Phantom assassin mirage clones flanking target then detonating in X-cleaves. */
function drawShadowClones(g: Graphics, c: BossSignatureCtx): void {
  const { sp, left, width, floorY, color } = c;
  const positions = [0.2, 0.5, 0.8];

  if (sp.phase === 'telegraph') {
    const p = getProgress(sp);
    for (const frac of positions) {
      const cx = left + width * frac;
      const dirToMid = frac < 0.5 ? 1 : -1;
      const alpha = 0.25 + p * 0.55;
      // Ghostly crimson-hooded decoy silhouette with raised twin daggers
      g.circle(cx, floorY - 96, 10).fill({ color, alpha });
      g.moveTo(cx, floorY - 86).lineTo(cx, floorY - 46)
        .moveTo(cx, floorY - 46).lineTo(cx - 14, floorY)
        .moveTo(cx, floorY - 46).lineTo(cx + 14, floorY)
        .stroke({ color, width: 5, alpha, cap: 'round' });
      g.moveTo(cx, floorY - 76).lineTo(cx + dirToMid * 22, floorY - 70)
        .stroke({ color: 0xffffff, width: 2.5, alpha: 0.5 + p * 0.5 });
      g.ellipse(cx, floorY - 2, 18, 5).stroke({ color, width: 1.8, alpha });
    }
    return;
  }

  const { t, fade } = getActiveBurst(sp);
  for (const frac of positions) {
    const cx = left + width * frac;
    const cy = floorY - 68;
    const r = 42 + t * 28;
    g.circle(cx, cy, r * 0.72).fill({ color, alpha: 0.24 * fade });
    g.moveTo(cx - r, cy - r * 0.7).lineTo(cx + r, cy + r * 0.7)
      .moveTo(cx + r, cy - r * 0.7).lineTo(cx - r, cy + r * 0.7)
      .stroke({ color, width: 12, alpha: 0.88 * fade, cap: 'round' });
    g.moveTo(cx - r, cy - r * 0.7).lineTo(cx + r, cy + r * 0.7)
      .moveTo(cx + r, cy - r * 0.7).lineTo(cx - r, cy + r * 0.7)
      .stroke({ color: 0xffffff, width: 3.5, alpha: 0.95 * fade, cap: 'round' });
  }
}

/** 11. Casket Warden Signature: Suspended chained stone coffins in sky slamming down onto crater seals. */
function drawFallingCoffins(g: Graphics, c: BossSignatureCtx): void {
  const { sp, left, width, floorY, color } = c;
  const count = 3;
  const step = width / count;

  if (sp.phase === 'telegraph') {
    const p = getProgress(sp);
    for (let i = 0; i < count; i += 1) {
      const cx = left + step * (i + 0.5);
      const bob = Math.sin(sp.frame * 0.22 + i) * 3;
      const topY = floorY - 245 + bob;
      // Guiding chains / drop lines from suspended casket down to floor impact seal
      g.moveTo(cx - 18, topY + 62).lineTo(cx - 18, floorY)
        .moveTo(cx + 18, topY + 62).lineTo(cx + 18, floorY)
        .stroke({ color, width: 1.6, alpha: 0.28 + p * 0.45 });
      g.ellipse(cx, floorY - 2, 34, 9).fill({ color: 0x451a03, alpha: 0.45 });
      g.ellipse(cx, floorY - 2, 34, 9).stroke({ color, width: 2.4, alpha: 0.45 + p * 0.55 });
      // Suspended dark monolith coffin high overhead
      g.poly([cx - 22, topY + 14, cx - 15, topY, cx + 15, topY, cx + 22, topY + 14, cx + 17, topY + 62, cx - 17, topY + 62])
        .fill({ color: 0x1c1917, alpha: 0.92 })
        .stroke({ color, width: 2.5, alpha: 0.6 + p * 0.4 });
    }
    return;
  }

  const { t, burst, fade } = getActiveBurst(sp);
  for (let i = 0; i < count; i += 1) {
    const cx = left + step * (i + 0.5);
    const botY = floorY - 200 + 200 * burst;
    const topY = botY - 82;
    // Blazing ember drop wake behind falling stone coffin
    g.rect(cx - 24, -40, 48, Math.max(10, botY + 30)).fill({ color, alpha: 0.34 * fade });
    // Heavy stone coffin slamming onto floor
    g.poly([cx - 24, topY + 18, cx - 16, topY, cx + 16, topY, cx + 24, topY + 18, cx + 19, botY, cx - 19, botY])
      .fill({ color: 0x181519, alpha: 0.96 * fade })
      .stroke({ color, width: 3.2, alpha: fade });
    // Ember cross etched on coffin lid
    g.moveTo(cx, topY + 14).lineTo(cx, botY - 16)
      .moveTo(cx - 10, topY + 32).lineTo(cx + 10, topY + 32)
      .stroke({ color: 0xffedd5, width: 2.5, alpha: 0.85 * fade });
    g.ellipse(cx, floorY - 2, 36 + t * 32, 9 + t * 6).stroke({ color, width: 3.5, alpha: fade });
  }
}

/** 12. Casket Warden Signature: Infernal floor sigil gathering soul-wisps then erupting into a soul-flame geyser. */
function drawSoulGeyser(g: Graphics, c: BossSignatureCtx): void {
  const { sp, left, width, floorY, color } = c;
  const midX = left + width * 0.5;
  const sigilRx = width * 0.42;

  if (sp.phase === 'telegraph') {
    const p = getProgress(sp);
    g.ellipse(midX, floorY - 3, sigilRx, 12).fill({ color: 0x451a03, alpha: 0.35 + p * 0.35 });
    g.ellipse(midX, floorY - 3, sigilRx, 12).stroke({ color, width: 2.5, alpha: 0.5 + p * 0.5 });
    // Spiraling soul-ember wisps funneling down into the underworld seal
    for (let i = 0; i < 6; i += 1) {
      const ang = (i / 6) * Math.PI * 2 + sp.frame * 0.14;
      const wx = midX + Math.cos(ang) * (sigilRx * (0.85 - p * 0.45));
      const wy = floorY - 120 * (1 - p) - 18 - Math.sin(ang) * 16;
      g.circle(wx, wy, 5).fill({ color: 0xfef08a, alpha: 0.45 + p * 0.5 });
    }
    return;
  }

  const { t, burst, fade } = getActiveBurst(sp);
  const h = 195 * burst;
  const geyserW = width * 0.46;
  // Roaring underworld soul-flame column shooting skyward
  g.poly([
    midX - geyserW * 0.6, floorY,
    midX - geyserW * 0.35, floorY - h,
    midX, floorY - h - 18,
    midX + geyserW * 0.35, floorY - h,
    midX + geyserW * 0.6, floorY,
  ]).fill({ color, alpha: 0.68 * fade });
  g.poly([
    midX - geyserW * 0.25, floorY,
    midX - geyserW * 0.12, floorY - h,
    midX + geyserW * 0.12, floorY - h,
    midX + geyserW * 0.25, floorY,
  ]).fill({ color: 0xfef3c7, alpha: 0.9 * fade });

  for (let r = 0; r < 3; r += 1) {
    g.ellipse(midX, floorY - (r + 0.5) * 58 * burst, geyserW * (0.55 - r * 0.08) + t * 18, 12).stroke({
      color: 0xffffff,
      width: 3,
      alpha: 0.85 * fade,
    });
  }
  g.ellipse(midX, floorY - 3, sigilRx * (1 + t * 0.15), 14).stroke({ color, width: 4, alpha: fade });
}
