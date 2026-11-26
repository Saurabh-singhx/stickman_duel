import { INPUT_BITS, type InputBitfield } from './InputFrame';

/**
 * Default mouse combat input for Player 1:
 * - Left Click (button 0): Light Attack
 * - Right Click (button 2): Heavy Attack
 * Ignores clicks on interactive UI elements and suppresses the browser context menu on the canvas.
 */
export class MouseInput {
  private bits: InputBitfield = 0;
  private combatActive = false;

  public setCombatActive(active: boolean): void {
    this.combatActive = active;
    this.bits = 0;
  }
  private readonly onMouseDown: (e: MouseEvent) => void;
  private readonly onMouseUp: (e: MouseEvent) => void;
  private readonly onContextMenu: (e: MouseEvent) => void;
  private readonly onBlur: () => void;

  constructor() {
    this.onMouseDown = (e: MouseEvent) => {
      if (!this.combatActive || this.isUiInteractive(e.target)) return;
      if (e.button === 0) {
        this.bits |= INPUT_BITS.LIGHT;
      } else if (e.button === 2) {
        e.preventDefault();
        this.bits |= INPUT_BITS.HEAVY;
      }
    };

    this.onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        this.bits &= ~INPUT_BITS.LIGHT;
      } else if (e.button === 2) {
        this.bits &= ~INPUT_BITS.HEAVY;
      }
    };

    this.onContextMenu = (e: MouseEvent) => {
      if (this.combatActive) {
        e.preventDefault();
      }
    };

    this.onBlur = () => {
      this.bits = 0;
    };

    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('blur', this.onBlur);
  }

  /** Returns the current mouse attack bitfield for Player 1. */
  public sample(): InputBitfield {
    return this.bits;
  }

  /** Releases all mouse listeners cleanly. */
  public dispose(): void {
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('blur', this.onBlur);
    this.bits = 0;
  }

  private isUiInteractive(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return target.closest('button, input, select, textarea, .interactive') !== null;
  }
}
