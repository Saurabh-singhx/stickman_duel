import { Graphics } from 'pixi.js';

interface CapeNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Render-only Verlet/spring-chain cape that trails behind fighter motion.
 * Never writes back into simulation state.
 */
export class CapeSim {
  private readonly nodes: CapeNode[] = [];
  private readonly segLen: number;
  private readonly color: number;
  private readonly widthTop: number;
  private readonly widthBottom: number;

  constructor(color: number, segments = 6, segLen = 13, widthTop = 10, widthBottom = 26) {
    this.color = color;
    this.segLen = segLen;
    this.widthTop = widthTop;
    this.widthBottom = widthBottom;
    for (let i = 0; i < segments; i += 1) {
      this.nodes.push({ x: 0, y: i * segLen, vx: 0, vy: 0 });
    }
  }

  /** Resets cape nodes directly behind an anchor point. */
  public reset(anchorX: number, anchorY: number, facing: 1 | -1): void {
    for (let i = 0; i < this.nodes.length; i += 1) {
      const node = this.nodes[i];
      if (!node) continue;
      node.x = anchorX - facing * i * this.segLen * 0.7;
      node.y = anchorY + i * this.segLen * 0.65;
      node.vx = 0;
      node.vy = 0;
    }
  }

  /** Steps the spring-chain physics for visual presentation. */
  public update(anchorX: number, anchorY: number, facing: 1 | -1, windX: number, dtScale = 1): void {
    const first = this.nodes[0];
    if (!first) return;
    first.x = anchorX;
    first.y = anchorY;

    const gravity = 0.68 * dtScale;
    const flutter = Math.sin(anchorX * 0.04 + anchorY * 0.02) * 0.35;

    for (let i = 1; i < this.nodes.length; i += 1) {
      const n = this.nodes[i];
      if (!n) continue;
      n.vx = n.vx * 0.86 + (-facing * 0.55 + windX * 0.08 + flutter) * dtScale;
      n.vy = n.vy * 0.86 + gravity;
      n.x += n.vx;
      n.y += n.vy;
    }

    // Distance constraints (3 relaxation passes)
    for (let pass = 0; pass < 3; pass += 1) {
      first.x = anchorX;
      first.y = anchorY;
      for (let i = 1; i < this.nodes.length; i += 1) {
        const prev = this.nodes[i - 1];
        const curr = this.nodes[i];
        if (!prev || !curr) continue;
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const diff = (dist - this.segLen) / dist;
        curr.x -= dx * diff;
        curr.y -= dy * diff;
      }
    }
  }

  /** Draws the flowing cape polygon onto a Pixi Graphics instance. */
  public draw(g: Graphics, floorY: number, alpha = 0.94): void {
    if (this.nodes.length < 2) return;
    const leftPts: number[] = [];
    const rightPts: number[] = [];

    for (let i = 0; i < this.nodes.length; i += 1) {
      const n = this.nodes[i];
      if (!n) continue;
      const t = i / (this.nodes.length - 1);
      const halfW = (this.widthTop + (this.widthBottom - this.widthTop) * t) * 0.5;
      const clampedY = Math.min(n.y, floorY - 2);
      leftPts.push(n.x - halfW * 0.35, clampedY);
      rightPts.unshift(n.x + halfW * 0.85, clampedY + 2);
    }

    const poly = [...leftPts, ...rightPts];
    g.poly(poly).fill({ color: this.color, alpha });
  }
}
