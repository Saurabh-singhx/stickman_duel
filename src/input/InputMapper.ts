import { GamepadInput, type GamepadMapping } from './Gamepad';
import type { InputBitfield } from './InputFrame';
import { KeyboardInput, type KeyBindings } from './Keyboard';
import { MouseInput } from './Mouse';
import { TouchInput } from './Touch';

/**
 * Unified input aggregator combining keyboard, mouse (P1), gamepad, and mobile touch into InputBitfields.
 */
export class InputMapper {
  public readonly keyboard: KeyboardInput;
  public readonly mouse: MouseInput;
  public readonly gamepad: GamepadInput;
  public readonly touch: TouchInput;

  constructor(uiHost: HTMLElement, p1Keys?: KeyBindings, p2Keys?: KeyBindings, padMap?: GamepadMapping) {
    this.keyboard = new KeyboardInput(p1Keys, p2Keys);
    this.mouse = new MouseInput();
    this.gamepad = new GamepadInput(padMap);
    this.touch = new TouchInput(uiHost);


  }

  /** Samples the combined input bitfield for player slot 0 or 1. */
  public sample(slot: 0 | 1): InputBitfield {
    const kb = this.keyboard.sample(slot);
    const ms = slot === 0 ? this.mouse.sample() : 0;
    const pad = this.gamepad.sample(slot);
    const touch = slot === 0 ? this.touch.sample() : 0;
    return kb | ms | pad | touch;
  }

  /** Cleans up all listeners and DOM elements. */
  public dispose(): void {
    this.keyboard.dispose();
    this.mouse.dispose();
    this.touch.dispose();
  }
}
