import { Graphics } from 'pixi.js';

interface DustPuff {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: number;
  age: number;
  life: number;
}

/**
 * Pooled soft dust puff renderer for footsteps, dodges, landings, and slab impacts.
 */
export class DustPool {
  private readonly puffs: DustPuff[] = [];
  private rng = 0x33b91f;

  constructor(capacity = 72) {
    for (let i = 0; i < capacity; i += 1) {
      this.puffs.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 8,
        color: 0xd8cfc0,
        age: 0,
        life: 24,
      });
    }
  }

  private rand(): number {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return this.rng / 0xffffffff;
  }

  /** Spawns a small cluster of soft dust puffs on the floor. */
  public puff(x: number, y: number, count = 5, dirX = 0, color = 0xdad2c3): void {
    let spawned = 0;
    for (const p of this.puffs) {
      if (p.active) continue;
      p.active = true;
      p.x = x + (this.rand() - 0.5) * 18;
      p.y = y - this.rand() * 8;
      p.vx = dirX * (1.2 + this.rand() * 2.2) + (this.rand() - 0.5) * 1.8;
      p.vy = -0.6 - this.rand() * 1.5;
      p.radius = 5 + this.rand() * 8;
      p.color = color;
      p.age = 0;
      p.life = 18 + this.rand() * 14;
      spawned += 1;
      if (spawned >= count) break;
    }
  }

  /** Advances and draws all active dust puffs. */
  public updateAndDraw(g: Graphics, dtScale = 1): void {
    for (const p of this.puffs) {
      if (!p.active) continue;
      p.age += dtScale;
      if (p.age >= p.life) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dtScale;
      p.y += p.vy * dtScale;
      p.vx *= 0.94;
      p.vy *= 0.94;
      const t = p.age / p.life;
      const rad = p.radius * (1 + t * 1.15);
      const alpha = (1 - t) * 0.42;
      g.circle(p.x, p.y, rad).fill({ color: p.color, alpha });
    }
  }

  /** Clears all active dust puffs. */
  public clear(): void {
    for (const p of this.puffs) p.active = false;
  }
}
