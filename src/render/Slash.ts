import { Graphics } from 'pixi.js';

interface SlashArc {
  active: boolean;
  ownerSlot: number;
  x: number;
  y: number;
  facing: 1 | -1;
  radius: number;
  thickness: number;
  startAngle: number;
  endAngle: number;
  color: number;
  age: number;
  life: number;
}

/**
 * Pooled crescent slash arc effect renderer (zero per-frame allocation).
 */
export class SlashPool {
  private readonly pool: SlashArc[] = [];

  constructor(capacity = 24) {
    for (let i = 0; i < capacity; i += 1) {
      this.pool.push({
        active: false,
        ownerSlot: -1,
        x: 0,
        y: 0,
        facing: 1,
        radius: 70,
        thickness: 14,
        startAngle: -1.2,
        endAngle: 0.8,
        color: 0xffd55a,
        age: 0,
        life: 10,
      });
    }
  }

  /** Spawns a crescent slash arc from the pool. */
  public spawn(
    x: number,
    y: number,
    facing: 1 | -1,
    radius: number,
    thickness: number,
    startAngle: number,
    endAngle: number,
    color: number,
    life = 11,
    ownerSlot = -1,
  ): void {
    const slot = this.pool.find((s) => !s.active) ?? this.pool[0];
    if (!slot) return;
    slot.active = true;
    slot.ownerSlot = ownerSlot;
    slot.x = x;
    slot.y = y;
    slot.facing = facing;
    slot.radius = radius;
    slot.thickness = thickness;
    slot.startAngle = startAngle;
    slot.endAngle = endAngle;
    slot.color = color;
    slot.age = 0;
    slot.life = life;
  }

  /** Cancels any active swing arcs belonging to the given fighter slot (e.g. when parried). */
  public cancelOwner(ownerSlot: number): void {
    for (const s of this.pool) {
      if (s.active && s.ownerSlot === ownerSlot) {
        s.active = false;
      }
    }
  }

  /** Advances and draws all active slash arcs. */
  public updateAndDraw(g: Graphics, dtScale = 1): void {
    for (const s of this.pool) {
      if (!s.active) continue;
      s.age += dtScale;
      if (s.age >= s.life) {
        s.active = false;
        continue;
      }
      const t = s.age / s.life;
      const alpha = (1 - t) * (1 - t);
      const sweep = Math.min(1, 0.62 + (s.age / 3) * 0.38);
      const curEnd = s.startAngle + (s.endAngle - s.startAngle) * sweep;
      const steps = 12;
      const outer: number[] = [];
      const inner: number[] = [];

      for (let i = 0; i <= steps; i += 1) {
        const u = i / steps;
        const angle = s.startAngle + (curEnd - s.startAngle) * u;
        const taper = Math.sin(u * Math.PI);
        const w = s.thickness * taper * (1 - t * 0.4);
        const cos = Math.cos(angle) * s.facing;
        const sin = Math.sin(angle);
        const rOut = s.radius + w * 0.6;
        const rIn = Math.max(8, s.radius - w * 0.9);
        outer.push(s.x + cos * rOut, s.y + sin * rOut);
        inner.unshift(s.x + cos * rIn, s.y + sin * rIn);
      }

      const poly = [...outer, ...inner];
      g.poly(poly).fill({ color: s.color, alpha: alpha * 0.92 });
      g.poly(poly).stroke({ color: 0xffffff, width: 1.5, alpha: alpha * 0.65 });
    }
  }

  /** Clears all active slash arcs. */
  public clear(): void {
    for (const s of this.pool) s.active = false;
  }
}
