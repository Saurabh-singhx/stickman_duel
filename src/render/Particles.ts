import { Graphics } from 'pixi.js';

interface Spark {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  color: number;
  age: number;
  life: number;
}

interface ImpactRing {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: number;
  age: number;
  life: number;
}

/**
 * Pooled spark and shockwave impact-ring particle system.
 */
export class ParticlePool {
  private readonly sparks: Spark[] = [];
  private readonly rings: ImpactRing[] = [];
  private rng = 0x51a7b3;

  constructor(sparkCap = 140, ringCap = 16) {
    for (let i = 0; i < sparkCap; i += 1) {
      this.sparks.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        len: 10,
        color: 0xffd55a,
        age: 0,
        life: 16,
      });
    }
    for (let i = 0; i < ringCap; i += 1) {
      this.rings.push({
        active: false,
        x: 0,
        y: 0,
        radius: 8,
        maxRadius: 90,
        color: 0xffdf6b,
        age: 0,
        life: 16,
      });
    }
  }

  private rand(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 0xffffffff;
  }

  /** Emits a directional or radial burst of bright sparks. */
  public burstSparks(
    x: number,
    y: number,
    count: number,
    color: number,
    speed = 9,
    life = 18,
  ): void {
    let spawned = 0;
    for (const p of this.sparks) {
      if (p.active) continue;
      const angle = this.rand() * Math.PI * 2;
      const spd = speed * (0.45 + this.rand() * 0.9);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * spd;
      p.vy = Math.sin(angle) * spd - 1.5;
      p.len = 6 + this.rand() * 14;
      p.color = color;
      p.age = 0;
      p.life = life * (0.65 + this.rand() * 0.6);
      spawned += 1;
      if (spawned >= count) break;
    }
  }

  /** Emits an expanding shockwave ring (used for parry, guard break, finisher). */
  public spawnRing(x: number, y: number, maxRadius: number, color: number, life = 18): void {
    const slot = this.rings.find((r) => !r.active) ?? this.rings[0];
    if (!slot) return;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.radius = 6;
    slot.maxRadius = maxRadius;
    slot.color = color;
    slot.age = 0;
    slot.life = life;
  }

  /** Updates physics and draws all active sparks and impact rings. */
  public updateAndDraw(g: Graphics, dtScale = 1): void {
    for (const p of this.sparks) {
      if (!p.active) continue;
      p.age += dtScale;
      if (p.age >= p.life) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dtScale;
      p.y += p.vy * dtScale;
      p.vx *= 0.92;
      p.vy = p.vy * 0.92 + 0.25 * dtScale;

      const alpha = 1 - p.age / p.life;
      const mag = Math.hypot(p.vx, p.vy) || 1;
      const tx = p.x - (p.vx / mag) * p.len;
      const ty = p.y - (p.vy / mag) * p.len;
      g.moveTo(tx, ty).lineTo(p.x, p.y).stroke({ color: p.color, width: 2.4, alpha });
    }

    for (const r of this.rings) {
      if (!r.active) continue;
      r.age += dtScale;
      if (r.age >= r.life) {
        r.active = false;
        continue;
      }
      const t = r.age / r.life;
      const eased = 1 - (1 - t) * (1 - t);
      const rad = 10 + (r.maxRadius - 10) * eased;
      const alpha = (1 - t) * 0.85;
      g.circle(r.x, r.y, rad).stroke({
        color: r.color,
        width: Math.max(1.5, 6 * (1 - t)),
        alpha,
      });
    }
  }

  /** Clears all pooled particles. */
  public clear(): void {
    for (const p of this.sparks) p.active = false;
    for (const r of this.rings) r.active = false;
  }
}
