import { Graphics } from 'pixi.js';
import { BALANCE } from '../data/balance';
import { getAttackHitbox, getHurtbox, getSlabHitbox } from '../sim/Collision';
import { fromFp } from '../sim/Fixed';
import { hashState } from '../sim/Snapshot';
import type { GameState } from '../sim/State';

/**
 * Toggleable (F1) developer debug overlay displaying hitboxes, hurtboxes,
 * pushboxes, frame data, action states, desync checksum, draw layers, and sim-ms.
 */
export class DebugOverlay {
  public visible = false;
  private readonly panel: HTMLDivElement;

  constructor(uiRoot: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.className = 'debug-overlay';
    this.panel.style.cssText =
      'position:absolute;left:14px;bottom:14px;background:rgba(14,14,16,0.84);color:#d7f5d0;font-family:monospace;font-size:12px;line-height:1.45;padding:10px 12px;border:1px solid rgba(110,231,183,0.45);border-radius:6px;display:none;pointer-events:none;white-space:pre;z-index:30;';
    uiRoot.appendChild(this.panel);
  }

  /** Toggles debug overlay visibility. */
  public toggle(): boolean {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'block' : 'none';
    return this.visible;
  }

  /** Forces overlay visibility explicitly (e.g. in Training mode). */
  public setVisible(show: boolean): void {
    this.visible = show;
    this.panel.style.display = show ? 'block' : 'none';
  }

  /** Updates numeric telemetry panel and draws world-space hitboxes/hurtboxes. */
  public update(
    state: GameState,
    boxGfx: Graphics | null,
    simMs: number,
    drawLayers: number,
    frameStepActive: boolean,
  ): void {
    if (!this.visible) return;
    const [f0, f1] = state.fighters;
    const checksum = hashState(state).toString(16).padStart(8, '0');
    this.panel.textContent = [
      `[F1] DEBUG | Frame: ${state.frame} | Phase: ${state.phase} | Hash: 0x${checksum}`,
      `Sim: ${simMs.toFixed(2)}ms | Layers: ${drawLayers} | StepMode(F2/F3): ${frameStepActive ? 'ON' : 'OFF'}`,
      `P1: ${f0.action}[${f0.actionFrame}] move=${f0.currentMove ?? '-'} hp=${f0.hp} grd=${f0.guard} ctr=${f0.counterWindow}`,
      `P2: ${f1.action}[${f1.actionFrame}] move=${f1.currentMove ?? '-'} hp=${f1.hp} grd=${f1.guard} slow=${f1.slowFrames}`,
    ].join('\n');

    if (!boxGfx) return;
    for (const f of state.fighters) {
      const hurt = getHurtbox(f);
      boxGfx
        .rect(fromFp(hurt.left), fromFp(hurt.top), fromFp(hurt.right - hurt.left), fromFp(hurt.bottom - hurt.top))
        .stroke({ color: 0x38bdf8, width: 2, alpha: 0.85 });

      // Pushbox
      const pw = fromFp(BALANCE.PUSHBOX_HALF_WIDTH * 2);
      boxGfx
        .rect(fromFp(f.x - BALANCE.PUSHBOX_HALF_WIDTH), fromFp(f.y - 60_000), pw, 60)
        .stroke({ color: 0xfacc15, width: 1.5, alpha: 0.65 });

      const hit = getAttackHitbox(f);
      if (hit) {
        boxGfx
          .rect(fromFp(hit.left), fromFp(hit.top), fromFp(hit.right - hit.left), fromFp(hit.bottom - hit.top))
          .fill({ color: 0xef4444, alpha: 0.25 })
          .stroke({ color: 0xef4444, width: 2.5, alpha: 0.95 });
      }
    }

    for (const slab of state.hazards) {
      const box = getSlabHitbox(slab);
      if (box) {
        boxGfx
          .rect(fromFp(box.left), fromFp(box.top), fromFp(box.right - box.left), fromFp(box.bottom - box.top))
          .fill({ color: 0xf97316, alpha: 0.25 })
          .stroke({ color: 0xf97316, width: 2 });
      }
    }
  }

  /** Removes debug overlay DOM element cleanly. */
  public dispose(): void {
    this.panel.remove();
  }
}
