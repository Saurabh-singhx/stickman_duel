import { Graphics } from 'pixi.js';
import { fromFp } from '../sim/Fixed';
import { BALANCE } from '../data/balance';
import { FINISHERS, type FinisherId } from '../data/finishers';
import type { GameState } from '../sim/State';

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  len: number;
}

interface CutLine {
  active: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: number;
  age: number;
  life: number;
}

interface BoltSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  branch: boolean;
}

/**
 * Low-end-optimized, zero-allocation pooled cinematic finisher FX renderer.
 * Supports night-storm rain & branching lightning (Tempest of the Dusk),
 * Judgment Cut dimensional lines, Eclipse Iaijutsu beam, Crimson Deathblow ring,
 * and Sepulcher twin slabs.
 */
export class FinisherFx {
  private readonly rain: RainDrop[] = [];
  private readonly cuts: CutLine[] = [];
  private readonly boltSegs: BoltSegment[] = [];
  private boltSegCount = 0;
  private boltAge = 999;
  private boltLife = 22;
  private stormAlpha = 0;
  private rng = 0x5f3759df;

  constructor() {
    // Pre-allocate 72 rain drops once (low quality renders only first 28)
    for (let i = 0; i < 72; i += 1) {
      this.rain.push({
        x: this.rand() * 1480 - 100,
        y: this.rand() * 680 - 100,
        speed: 14 + this.rand() * 10,
        len: 16 + this.rand() * 16,
      });
    }
    // Pre-allocate 20 dimensional cut lines
    for (let i = 0; i < 20; i += 1) {
      this.cuts.push({
        active: false,
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        color: 0x93c5fd,
        age: 0,
        life: 32,
      });
    }
    // Pre-allocate 32 lightning bolt segments
    for (let i = 0; i < 32; i += 1) {
      this.boltSegs.push({ x1: 0, y1: 0, x2: 0, y2: 0, branch: false });
    }
  }

  private rand(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 0xffffffff;
  }

  /** Spawns a jagged procedural lightning bolt from sky to floor at targetX. */
  public triggerLightning(targetX: number, lowQuality: boolean): void {
    const floorY = BALANCE.FLOOR_Y_PX;
    const steps = lowQuality ? 6 : 11;
    let cx = targetX + (this.rand() - 0.5) * 90;
    let cy = -60;
    this.boltSegCount = 0;

    for (let i = 0; i < steps && this.boltSegCount < this.boltSegs.length; i += 1) {
      const t = (i + 1) / steps;
      const nx = i === steps - 1 ? targetX : cx + (this.rand() - 0.5) * 68;
      const ny = -60 + (floorY + 60) * t;
      const seg = this.boltSegs[this.boltSegCount]!;
      seg.x1 = cx;
      seg.y1 = cy;
      seg.x2 = nx;
      seg.y2 = ny;
      seg.branch = false;
      this.boltSegCount += 1;

      // Occasional side fork on high quality
      if (!lowQuality && i > 1 && i < steps - 2 && this.rand() < 0.45 && this.boltSegCount < this.boltSegs.length) {
        const b = this.boltSegs[this.boltSegCount]!;
        b.x1 = nx;
        b.y1 = ny;
        b.x2 = nx + (this.rand() > 0.5 ? 1 : -1) * (35 + this.rand() * 45);
        b.y2 = ny + 40 + this.rand() * 55;
        b.branch = true;
        this.boltSegCount += 1;
      }
      cx = nx;
      cy = ny;
    }

    this.boltAge = 0;
    this.boltLife = 24;
  }

  /** Spawns crisscrossing dimensional slash lines around a point (Judgment Cut / Eclipse / Deathblow). */
  public spawnCutLine(
    cx: number,
    cy: number,
    angle: number,
    halfLen: number,
    color: number,
    life = 30,
  ): void {
    const slot = this.cuts.find((c) => !c.active) ?? this.cuts[0];
    if (!slot) return;
    const dx = Math.cos(angle) * halfLen;
    const dy = Math.sin(angle) * halfLen;
    slot.active = true;
    slot.x1 = cx - dx;
    slot.y1 = cy - dy;
    slot.x2 = cx + dx;
    slot.y2 = cy + dy;
    slot.color = color;
    slot.age = 0;
    slot.life = life;
  }

  /** Draws backdrop atmosphere (night storm sky, distant lightning glow, rain) behind fighters. */
  public drawBackdropOverlay(
    g: Graphics,
    state: GameState,
    lowQuality: boolean,
    reduceFlashing: boolean,
    dtScale: number,
  ): void {
    const finId: FinisherId | null = state.phase === 'finisher' ? state.activeFinisherId : null;
    const spec = finId ? FINISHERS[finId] : null;
    const targetStorm = spec && spec.nightStormBackdrop ? 1 : 0;
    this.stormAlpha += (targetStorm - this.stormAlpha) * (1 - Math.pow(targetStorm > 0 ? 0.92 : 0.86, Math.max(0, dtScale)));

    if (this.stormAlpha > 0.01) {
      // Deep stormy night sky tint over the stage (covers wide aspect ratios & camera pan)
      g.rect(-2000, -1000, 5280, 3000).fill({ color: 0x0b1021, alpha: this.stormAlpha * 0.78 });

      // Soft sky illumination pulse during lightning (gentle if reduceFlashing)
      if (this.boltAge < this.boltLife) {
        const boltAlpha = 1 - this.boltAge / this.boltLife;
        const skyFlash = reduceFlashing ? boltAlpha * 0.12 : boltAlpha * 0.32;
        g.rect(-2000, -1000, 5280, BALANCE.FLOOR_Y_PX + 1000).fill({
          color: 0xcbd5ff,
          alpha: skyFlash,
        });
      }

      // Draw branching lightning bolt
      if (this.boltAge < this.boltLife) {
        const a = Math.max(0, 1 - this.boltAge / this.boltLife);
        for (let i = 0; i < this.boltSegCount; i += 1) {
          const s = this.boltSegs[i]!;
          if (!lowQuality) {
            g.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2).stroke({
              color: 0x93c5fd,
              width: s.branch ? 5 : 10,
              alpha: a * 0.35,
              cap: 'round',
            });
          }
          g.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2).stroke({
            color: 0xf8fafc,
            width: s.branch ? 1.8 : 3.4,
            alpha: a * 0.95,
            cap: 'round',
          });
        }
        this.boltAge += Math.max(0, dtScale);
      }

      // Pooled rain streaks (capped at 28 on low-end quality)
      const rainCount = lowQuality ? 28 : this.rain.length;
      const windX = -3.8;
      for (let i = 0; i < rainCount; i += 1) {
        const d = this.rain[i]!;
        d.x += windX * Math.max(0, dtScale);
        d.y += d.speed * Math.max(0, dtScale);
        if (d.y > BALANCE.FLOOR_Y_PX + 10) {
          d.y = -80;
          d.x = this.rand() * 1480 - 100;
        }
        g.moveTo(d.x, d.y)
          .lineTo(d.x - windX * 0.9, d.y - d.len)
          .stroke({ color: 0xcbd5e1, width: 1.2, alpha: this.stormAlpha * 0.34 });
      }
    }

    // Eclipse Iaijutsu dark contrast vignette + glowing solar eclipse disc in the sky
    if (spec && spec.theme === 'eclipse') {
      const darkA = reduceFlashing ? 0.48 : 0.74;
      g.rect(-2000, -1000, 5280, 3000).fill({ color: 0x090807, alpha: darkA });
      const sunX = 640;
      const sunY = 185;
      g.circle(sunX, sunY, 74).fill({ color: 0xfff3c4, alpha: 0.14 });
      g.circle(sunX, sunY, 58).stroke({ color: 0xfff8dc, width: 4, alpha: 0.85 });
      g.circle(sunX, sunY, 54).fill({ color: 0x050506, alpha: 0.96 });
    }
  }

  /** Draws foreground finisher cut lines (Judgment Cut, Eclipse beam, Deathblow cross). */
  public drawForegroundFx(g: Graphics, dtScale: number): void {
    for (const c of this.cuts) {
      if (!c.active) continue;
      c.age += Math.max(0, dtScale);
      if (c.age >= c.life) {
        c.active = false;
        continue;
      }
      const t = c.age / c.life;
      const alpha = (1 - t) * (1 - t);
      g.moveTo(c.x1, c.y1).lineTo(c.x2, c.y2).stroke({
        color: c.color,
        width: Math.max(1.5, 6 * (1 - t)),
        alpha: alpha * 0.65,
        cap: 'round',
      });
      g.moveTo(c.x1, c.y1).lineTo(c.x2, c.y2).stroke({
        color: 0xffffff,
        width: Math.max(1, 2.2 * (1 - t)),
        alpha: alpha * 0.95,
        cap: 'round',
      });
    }
  }

  /** State-driven choreography stays synchronized with the decisive blow. */
  public drawChoreography(g: Graphics, state: GameState, low: boolean): void {
    if (state.phase !== 'finisher' || !state.activeFinisherId || state.finisherAttacker === null) return;
    const spec = FINISHERS[state.activeFinisherId];
    const victim = state.fighters[state.finisherAttacker === 0 ? 1 : 0];
    const x = fromFp(victim.x), y = fromFp(victim.y) - 56;
    const f = state.phaseFrame;
    const charge = Math.min(1, f / spec.impactFrame);
    const t = Math.max(0, (f - spec.impactFrame) / (spec.durationFrames - spec.impactFrame));
    const fade = (1 - t) ** 2;
    const color = spec.slashColor;
    const hit = f >= spec.impactFrame;
    const count = low ? 5 : 10;
    if (spec.theme === 'rising') {
      const floorY = BALANCE.FLOOR_Y_PX;
      const atk = state.fighters[state.finisherAttacker];
      const ax = fromFp(atk.x);
      if (!hit) {
        // Low stance golden blade-charge glow near floor before uppercut launch
        g.ellipse(ax + atk.facing * 12, floorY, 18 + charge * 32, 6)
          .stroke({ color, width: 2.5, alpha: 0.25 + charge * 0.55 });
      } else {
        // Soaring vertical High Time uppercut energy pillar + rising crescent streaks
        const riseX = (ax + x) * 0.52;
        const pillarH = 190 + t * 140;
        g.moveTo(riseX, floorY).lineTo(riseX + atk.facing * 26, floorY - pillarH)
          .stroke({ color, width: Math.max(2, 18 * fade), alpha: fade * 0.55, cap: 'round' });
        g.moveTo(riseX, floorY).lineTo(riseX + atk.facing * 26, floorY - pillarH)
          .stroke({ color: 0xffffff, width: Math.max(1, 5 * fade), alpha: fade * 0.9, cap: 'round' });
        for (let i = 0; i < (low ? 3 : 6); i += 1) {
          const sx = riseX + (i - 2) * 18;
          const sy = floorY - 30 - t * (160 + (i % 3) * 55);
          g.moveTo(sx, sy).lineTo(sx + atk.facing * 6, sy - 28 * fade)
            .stroke({ color, width: 2.4, alpha: fade * 0.85, cap: 'round' });
        }
      }
    } else if (spec.theme === 'spin') {
      // Whirling Crescent Tempest rings + spiral wind trails
      for (let i = 0; i < (low ? 3 : 5); i++) {
        const angle = f * (0.24 + i * 0.04) + i * 1.4;
        const r = 42 + i * 20 + t * 85;
        g.moveTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r)
          .arc(x, y, r, angle, angle + 2.1)
          .stroke({ color, width: Math.max(2, 7 - i), alpha: (hit ? fade : 0.65) * 0.78, cap: 'round' });
      }
      if (hit) {
        g.circle(x, y, 46 + t * 145).stroke({ color: 0xffffff, width: 3 * fade, alpha: fade * 0.85 });
      }
    } else if (spec.theme === 'overhead') {
      // Sundered Earth (Lion Claw): airborne flip arc + earth-shattering fissure pillar & rock debris
      const floorY = BALANCE.FLOOR_Y_PX;
      const atk = state.fighters[state.finisherAttacker];
      const ax = fromFp(atk.x);
      if (!hit) {
        const ay = fromFp(atk.y) - 56;
        g.moveTo(ax + Math.cos(-2.5) * 48, ay + Math.sin(-2.5) * 48)
          .arc(ax, ay, 48, -2.5, 0.5)
          .stroke({ color, width: 3.5, alpha: 0.55, cap: 'round' });
      } else {
        // Towering golden earth-shatter fissure & rock shards bursting up
        const impactX = (ax + x) * 0.5;
        g.moveTo(impactX, floorY).lineTo(impactX, floorY - (140 + t * 180))
          .stroke({ color, width: Math.max(3, 24 * fade), alpha: fade * 0.55, cap: 'round' });
        g.ellipse(impactX, floorY, 55 + t * 150, 14 + t * 14)
          .stroke({ color, width: 4 * fade + 1, alpha: fade * 0.9 });
        const rocks = low ? 4 : 8;
        for (let i = 0; i < rocks; i += 1) {
          const dir = i % 2 === 0 ? -1 : 1;
          const dist = 24 + i * 16 + t * 90;
          const ry = floorY - Math.sin(Math.min(1, t * 1.4) * Math.PI) * (50 + (i % 3) * 35);
          g.poly([impactX + dir * dist, ry - 14, impactX + dir * (dist + 10), ry + 6, impactX + dir * (dist - 8), ry + 8])
            .fill({ color: 0x454048, alpha: fade }).stroke({ color, width: 1.5, alpha: fade * 0.7 });
        }
      }
    } else if (spec.theme === 'sepulcher') {
      const gap = hit ? t * 80 : (1 - charge) * 110;
      for (const dir of [-1, 1]) {
        g.poly([x + dir * (gap + 16), y - 125, x + dir * (gap + 60), y - 100,
          x + dir * (gap + 48), y + 60, x + dir * gap, y + 60])
          .fill({ color: 0x302b32, alpha: fade }).stroke({ color, width: 2, alpha: fade });
      }
    } else if (spec.theme === 'deathblow') {
      // Crimson Deathblow: Sekiro-style converging crimson ring & red kanji-cross execution mark
      const r = hit ? 38 + t * 165 : 95 - charge * 58;
      g.circle(x, y, r).stroke({ color, width: hit ? 5 : 2.5, alpha: fade * 0.88 });
      const crossSize = hit ? 42 + t * 50 : 28 * charge;
      g.moveTo(x - crossSize, y - crossSize).lineTo(x + crossSize, y + crossSize)
        .moveTo(x + crossSize, y - crossSize).lineTo(x - crossSize, y + crossSize)
        .stroke({ color, width: hit ? 6 * fade + 1 : 3, alpha: (hit ? fade : charge) * 0.9, cap: 'round' });
      g.moveTo(x - crossSize * 0.7, y - crossSize * 0.35).lineTo(x + crossSize * 0.7, y - crossSize * 0.35)
        .stroke({ color: 0xffffff, width: 2.2, alpha: (hit ? fade : charge * 0.6) * 0.85, cap: 'round' });
    } else if (spec.theme === 'eclipse') {
      // Eclipse Iaijutsu: full-horizon blinding cut flash & dark void halo around target
      const r = hit ? 40 + t * 170 : 88 - charge * 48;
      g.circle(x, y, Math.max(1, r - 6)).fill({ color: 0x080910, alpha: fade * 0.55 });
      g.circle(x, y, r).stroke({ color, width: hit ? 4 : 2, alpha: fade * 0.85 });
      if (hit) {
        g.moveTo(x - 520, y).lineTo(x + 520, y)
          .stroke({ color: 0xfff8dc, width: Math.max(1.5, 10 * fade), alpha: fade * 0.95, cap: 'round' });
      }
    } else if (spec.theme === 'judgment') {
      // Judgment Cut End: blue dimensional sphere trapped around victim -> shatters on impact
      const domeR = hit ? 90 + t * 160 : 84 + Math.sin(f * 0.45) * 4;
      g.circle(x, y, domeR).fill({ color: 0x1d4ed8, alpha: (hit ? fade : 0.35 + charge * 0.45) * 0.18 });
      g.circle(x, y, domeR).stroke({ color, width: hit ? 5 * fade + 1 : 2.5, alpha: hit ? fade : 0.75 });
      for (let i = 0; i < count; i++) {
        const angle = i * 2.399;
        const r = hit ? 65 + t * 160 : 84;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        g.moveTo(x + dx * (r - 22), y + dy * (r - 22))
          .lineTo(x + dx * (r + 24), y + dy * (r + 24))
          .stroke({ color, width: 2, alpha: fade * (hit ? 0.95 : charge * 0.75) });
      }
    } else if (spec.theme === 'flurry') {
      // Phantom Flurry: ghostly golden afterimages on opposite flanks + spinning blitz streaks
      if (!hit) {
        for (const side of [-1, 1]) {
          const gx = x + side * 78;
          const gy = BALANCE.FLOOR_Y_PX;
          g.circle(gx, gy - 92, 11).fill({ color, alpha: 0.24 });
          g.moveTo(gx, gy - 80).lineTo(gx, gy - 40).stroke({ color, width: 7, alpha: 0.22, cap: 'round' });
        }
      }
      for (let i = 0; i < count; i++) {
        const angle = i * 2.399 + f * 0.04;
        const r = hit ? 65 + t * 170 : 120 - charge * 55;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        g.moveTo(x + dx * r, y + dy * r)
          .lineTo(x + dx * (r + 42), y + dy * (r + 42))
          .stroke({ color, width: 2.5, alpha: fade * (hit ? 0.9 : charge * 0.8) });
      }
    } else {
      const angle = spec.theme === 'thunder_storm' ? Math.PI / 2 : 0;
      const length = hit ? 100 + t * 220 : 20 + charge * 65;
      const dx = Math.cos(angle) * length, dy = Math.sin(angle) * length;
      g.moveTo(x - dx, y - dy).lineTo(x + dx, y + dy)
        .stroke({ color, width: hit ? 12 * fade + 1 : 2, alpha: fade * (hit ? 0.65 : 0.3) });
    }
    if (hit) {
      for (let i = 0; i < count; i++) {
        const angle = i * 2.399;
        const r = 25 + t * (100 + (i % 3) * 35);
        const px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r + t * t * 70;
        g.moveTo(px, py).lineTo(px - Math.cos(angle) * 14 * fade, py - Math.sin(angle) * 14 * fade)
          .stroke({ color, width: 2, alpha: fade });
      }
    }
  }

  /** Resets all pooled finisher effects cleanly. */
  public clear(): void {
    this.stormAlpha = 0;
    this.boltAge = 999;
    this.boltSegCount = 0;
    for (const c of this.cuts) c.active = false;
  }
}
