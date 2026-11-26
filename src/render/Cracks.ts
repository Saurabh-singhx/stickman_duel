import { Graphics } from 'pixi.js';

interface FloorCrack {
  active: boolean;
  x: number;
  y: number;
  scale: number;
  age: number;
  life: number;
}

/**
 * Pooled floor crack marks created by heavy slams, coffin slabs, and finishers.
 */
export class CrackPool {
  private readonly cracks: FloorCrack[] = [];

  constructor(capacity = 16) {
    for (let i = 0; i < capacity; i += 1) {
      this.cracks.push({
        active: false,
        x: 0,
        y: 0,
        scale: 1,
        age: 0,
        life: 300,
      });
    }
  }

  /** Stamps a stylized crack cluster onto the floor line. */
  public spawn(x: number, y: number, scale = 1, life = 320): void {
    const slot = this.cracks.find((c) => !c.active) ?? this.cracks[0];
    if (!slot) return;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.scale = scale;
    slot.age = 0;
    slot.life = life;
  }

  /** Updates and draws all active floor cracks. */
  public updateAndDraw(g: Graphics, color: number, dtScale = 1): void {
    for (const c of this.cracks) {
      if (!c.active) continue;
      c.age += dtScale;
      if (c.age >= c.life) {
        c.active = false;
        continue;
      }
      const alpha = Math.min(1, (c.life - c.age) / 60) * 0.72;
      const s = c.scale;
      g.moveTo(c.x - 26 * s, c.y + 1)
        .lineTo(c.x - 10 * s, c.y + 4 * s)
        .lineTo(c.x, c.y + 1)
        .lineTo(c.x + 14 * s, c.y + 6 * s)
        .lineTo(c.x + 30 * s, c.y + 2)
        .stroke({ color, width: 2.2, alpha });
      g.moveTo(c.x - 4 * s, c.y + 2)
        .lineTo(c.x - 12 * s, c.y + 13 * s)
        .moveTo(c.x + 6 * s, c.y + 2)
        .lineTo(c.x + 18 * s, c.y + 11 * s)
        .stroke({ color, width: 1.5, alpha: alpha * 0.8 });
    }
  }

  /** Clears all floor cracks. */
  public clear(): void {
    for (const c of this.cracks) c.active = false;
  }
}
