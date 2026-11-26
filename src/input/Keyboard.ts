import { ACTION_TO_BIT, type InputAction, type InputBitfield } from './InputFrame';

/** Key mapping from logical action to KeyboardEvent.code. */
export type KeyBindings = Record<InputAction, string>;

/** Default P1 bindings: WASD + J/K/L + Shift/U. */
export const DEFAULT_P1_KEYS: KeyBindings = {
  left: 'KeyA',
  right: 'KeyD',
  up: 'Space',
  down: 'KeyC',
  light: 'KeyJ',
  heavy: 'KeyK',
  block: 'KeyL',
  dodge: 'ShiftLeft',
  grab: 'KeyU',
  special: 'KeyE',
};

/** Default P2 bindings: Arrows + Numpad 1/2/3/0/4 (also supports I/O/P). */
export const DEFAULT_P2_KEYS: KeyBindings = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  light: 'Numpad1',
  heavy: 'Numpad2',
  block: 'Numpad3',
  dodge: 'Numpad0',
  grab: 'Numpad4',
  special: 'Numpad5',
};

/**
 * Tracks keyboard state for P1 and P2 with rebindable key maps and clean disposal.
 */
export class KeyboardInput {
  private readonly pressed = new Set<string>();
  private p1Keys: KeyBindings;
  private p2Keys: KeyBindings;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onBlur: () => void;

  constructor(p1Keys: KeyBindings = DEFAULT_P1_KEYS, p2Keys: KeyBindings = DEFAULT_P2_KEYS) {
    this.p1Keys = { ...p1Keys };
    this.p2Keys = { ...p2Keys };

    this.onKeyDown = (e: KeyboardEvent) => {
      if (this.isBoundCode(e.code)) {
        e.preventDefault();
      }
      this.pressed.add(e.code);
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      this.pressed.delete(e.code);
    };
    this.onBlur = () => {
      this.pressed.clear();
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  /** Updates key bindings for player 1 or player 2. */
  public setBindings(slot: 0 | 1, bindings: KeyBindings): void {
    if (slot === 0) this.p1Keys = { ...bindings };
    else this.p2Keys = { ...bindings };
  }

  /** Returns the current InputBitfield for the requested player slot. */
  public sample(slot: 0 | 1): InputBitfield {
    const map = slot === 0 ? this.p1Keys : this.p2Keys;
    let bits = 0;
    for (const action of Object.keys(ACTION_TO_BIT) as InputAction[]) {
      if (this.pressed.has(map[action])) {
        bits |= ACTION_TO_BIT[action];
      }
    }
    return bits;
  }

  /** Releases all DOM event listeners. */
  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.pressed.clear();
  }

  private isBoundCode(code: string): boolean {
    return Object.values(this.p1Keys).includes(code) || Object.values(this.p2Keys).includes(code);
  }
}
