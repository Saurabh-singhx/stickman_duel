import { Graphics } from 'pixi.js';
import { BALANCE } from '../data/balance';
import { STAGES, type StageId } from '../data/stages';
import { fromFp } from '../sim/Fixed';
import type { HazardSlab } from '../sim/State';

/**
 * Renders the minimal cinematic stage backdrop, parallax silhouettes, horizon fog,
 * soft floor line, and bursting coffin-shaped stone slabs.
 */
export class StageView {
  private stageId: StageId = 'beige_plain';

  /** Sets the active stage theme. */
  public setStage(stageId: StageId): void {
    this.stageId = stageId;
  }

  /** Draws sky, parallax layers, horizon fog, and floor line onto the stage Graphics. */
  public drawBackdrop(g: Graphics, camX: number): void {
    const spec = STAGES[this.stageId];
    const w = BALANCE.STAGE_WIDTH_PX;
    const h = 720;
    const floorY = BALANCE.FLOOR_Y_PX;
    const parallaxFar = (camX - 640) * -0.14;
    const parallaxMid = (camX - 640) * -0.28;

    // Smooth multi-band atmospheric sky gradient
    g.rect(-200, -160, w + 400, floorY + 160).fill(spec.skyTop);
    for (let b = 0; b < 6; b += 1) {
      const bandH = 380 - b * 55;
      g.rect(-200, floorY - bandH, w + 400, bandH).fill({ color: spec.skyBottom, alpha: 0.14 });
    }

    // Distant moon / sun disc for cinematic depth
    const orbX = 640 + parallaxFar * 0.4;
    const orbY = 170;
    const orbRadius = this.stageId === 'night_rooftop' ? 54 : 78;
    g.circle(orbX, orbY, orbRadius * 1.45).fill({ color: spec.horizonFog, alpha: 0.16 });
    g.circle(orbX, orbY, orbRadius).fill({ color: spec.horizonFog, alpha: 0.34 });

    // Far parallax silhouettes (monoliths / dunes / ruined pillars / spires)
    const farCount = 7;
    for (let i = -1; i <= farCount; i += 1) {
      const bx = i * 220 + parallaxFar;
      const bw = 90 + ((i * 37) & 63);
      const bh = 90 + ((i * 53) & 127);
      if (this.stageId === 'dusk_desert') {
        g.poly([bx - 80, floorY, bx + bw * 0.5, floorY - bh * 0.65, bx + bw + 90, floorY]).fill({
          color: spec.silhouetteFar,
          alpha: 0.45,
        });
      } else {
        g.rect(bx, floorY - bh, bw * 0.55, bh).fill({ color: spec.silhouetteFar, alpha: 0.36 });
      }
    }

    // Mid parallax architectural silhouettes
    for (let i = -1; i <= 6; i += 1) {
      const mx = i * 260 + 60 + parallaxMid;
      const mh = 55 + ((i * 71) & 95);
      const mw = this.stageId === 'ruined_hall' ? 42 : 28;
      g.rect(mx, floorY - mh, mw, mh).fill({ color: spec.silhouetteMid, alpha: 0.32 });
    }

    // Soft horizon fog band
    g.rect(-200, floorY - 95, w + 400, 95).fill({ color: spec.horizonFog, alpha: 0.28 });
    g.rect(-200, floorY - 40, w + 400, 40).fill({ color: spec.horizonFog, alpha: 0.22 });

    // Floor plane
    g.rect(-200, floorY, w + 400, h - floorY + 200).fill(spec.floorColor);

    // Subtle soft floor shadow gradient + crisp horizon floor line
    g.rect(-200, floorY, w + 400, 14).fill({ color: spec.floorLineColor, alpha: 0.12 });
    g.moveTo(-200, floorY).lineTo(w + 200, floorY).stroke({
      color: spec.floorLineColor,
      width: 2.5,
      alpha: 0.68,
    });
  }

  /** Draws all active coffin-shaped stone slabs (telegraph cracks + bursting monoliths). */
  public drawHazards(g: Graphics, hazards: readonly HazardSlab[], colorblindCue: boolean): void {
    const floorY = BALANCE.FLOOR_Y_PX;
    for (const slab of hazards) {
      const x = fromFp(slab.x);
      const halfW = fromFp(BALANCE.SLAB_HALF_WIDTH);
      const maxH = fromFp(BALANCE.SLAB_HEIGHT);

      if (slab.phase === 'telegraph') {
        const t = slab.frame / BALANCE.SLAB_TELEGRAPH_FRAMES;
        const pulse = 0.45 + Math.sin(slab.frame * 0.55) * 0.35;
        // Glowing fracture warning zone on floor
        g.ellipse(x, floorY + 3, halfW * (0.9 + t * 0.25), 7).fill({
          color: 0xd93829,
          alpha: pulse * 0.65,
        });
        g.moveTo(x - halfW, floorY).lineTo(x + halfW, floorY).stroke({
          color: 0xff5a3d,
          width: 3,
          alpha: 0.9,
        });
        if (colorblindCue) {
          // High-contrast diamond warning marker above floor
          const wy = floorY - 36 - t * 14;
          g.poly([x, wy - 10, x + 9, wy, x, wy + 10, x - 9, wy]).stroke({
            color: 0xffe066,
            width: 2.5,
          });
        }
      } else {
        // Coffin-shaped slab silhouette bursting upward from the floor
        let progress = 1;
        if (slab.phase === 'active') {
          progress = Math.min(1, (slab.frame + 2) / 4);
        } else {
          progress = Math.max(0, 1 - slab.frame / BALANCE.SLAB_RECOVERY_FRAMES);
        }
        const h = maxH * progress;
        const topY = floorY - h;
        const shoulderY = topY + h * 0.28;
        const topW = halfW * 0.62;
        const midW = halfW * 1.05;
        const baseW = halfW * 0.82;

        // Soft cast shadow on floor
        g.ellipse(x, floorY + 4, midW * 1.15, 8).fill({ color: 0x12110f, alpha: 0.28 });

        // Coffin polygon
        const coffinPts = [
          x - topW,
          topY,
          x + topW,
          topY,
          x + midW,
          shoulderY,
          x + baseW,
          floorY,
          x - baseW,
          floorY,
          x - midW,
          shoulderY,
        ];
        g.poly(coffinPts).fill({ color: 0x262426, alpha: 0.97 });
        g.poly(coffinPts).stroke({ color: 0x575258, width: 2.5, alpha: 0.9 });

        // Engraved center cross/seam line
        g.moveTo(x, topY + 14).lineTo(x, floorY - 8).stroke({
          color: 0x454048,
          width: 2,
          alpha: 0.75,
        });
        g.moveTo(x - topW * 0.55, shoulderY)
          .lineTo(x + topW * 0.55, shoulderY)
          .stroke({ color: 0x454048, width: 2, alpha: 0.75 });
      }
    }
  }
}
