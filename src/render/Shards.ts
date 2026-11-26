import { Graphics } from 'pixi.js';

interface Shard {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: number;
  age: number;
  life: number;
}

/**
 * Pooled cloth/stone shard system for finisher cape bursts and coffin slab debris.
 */
export class ShardPool {
  private readonly shards: Shard[] = [];
  private rng = 0x77c129;

  constructor(capacity = 80) {
    for (let i = 0; i < capacity; i += 1) {
      this.shards.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        rot: 0,
        vrot: 0,
        size: 10,
        color: 0x1c1c20,
        age: 0,
        life: 40,
      });
    }
  }

  private rand(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 0xffffffff;
  }

  /** Bursts angular cape or stone shards from a world coordinate. */
  public burst(x: number, y: number, count: number, color: number, speed = 8): void {
    let spawned = 0;
    for (const s of this.shards) {
      if (s.active) continue;
      const angle = -Math.PI * 0.9 + this.rand() * Math.PI * 0.8;
      const spd = speed * (0.4 + this.rand() * 0.9);
      s.active = true;
      s.x = x + (this.rand() - 0.5) * 24;
      s.y = y + (this.rand() - 0.5) * 24;
      s.vx = Math.cos(angle) * spd;
      s.vy = Math.sin(angle) * spd - 2.5;
      s.rot = this.rand() * Math.PI * 2;
      s.vrot = (this.rand() - 0.5) * 0.25;
      s.size = 6 + this.rand() * 11;
      s.color = color;
      s.age = 0;
      s.life = 32 + this.rand() * 26;
      spawned += 1;
      if (spawned >= count) break;
    }
  }

  /** Updates and draws all active shards. */
  public updateAndDraw(g: Graphics, floorY: number, dtScale = 1): void {
    for (const s of this.shards) {
      if (!s.active) continue;
      s.age += dtScale;
      if (s.age >= s.life) {
        s.active = false;
        continue;
      }
      s.x += s.vx * dtScale;
      s.y += s.vy * dtScale;
      s.vy += 0.32 * dtScale;
      s.rot += s.vrot * dtScale;
      if (s.y > floorY) {
        s.y = floorY;
        s.vy *= -0.35;
        s.vx *= 0.72;
      }

      const alpha = Math.max(0, 1 - s.age / s.life);
      const c = Math.cos(s.rot);
      const sn = Math.sin(s.rot);
      const r = s.size;
      const pts = [
        s.x + c * r,
        s.y + sn * r,
        s.x - sn * r * 0.5,
        s.y + c * r * 0.5,
        s.x - c * r * 0.8,
        s.y - sn * r * 0.8,
      ];
      g.poly(pts).fill({ color: s.color, alpha });
    }
  }

  /** Clears all active shards. */
  public clear(): void {
    for (const s of this.shards) s.active = false;
  }
}
