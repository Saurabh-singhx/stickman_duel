import { INPUT_BITS, type InputBitfield } from './InputFrame';

/** Button indices mapped to standard Gamepad layout. */
export interface GamepadMapping {
  readonly light: number;
  readonly heavy: number;
  readonly block: number;
  readonly dodge: number;
  readonly grab: number;
  readonly jump: number;
}

export const DEFAULT_GAMEPAD_MAPPING: GamepadMapping = {
  light: 2, // X / Square
  heavy: 3, // Y / Triangle
  block: 4, // LB / L1
  dodge: 1, // B / Circle
  grab: 5, // RB / R1
  jump: 0, // A / Cross
};

/**
 * Polls browser Gamepad API and maps sticks/buttons to an InputBitfield.
 */
export class GamepadInput {
  private mapping: GamepadMapping;

  constructor(mapping: GamepadMapping = DEFAULT_GAMEPAD_MAPPING) {
    this.mapping = { ...mapping };
  }

  /** Updates button mapping for gamepads. */
  public setMapping(mapping: GamepadMapping): void {
    this.mapping = { ...mapping };
  }

  /** Samples the connected gamepad at the given pad index (0 for P1, 1 for P2). */
  public sample(padIndex: number): InputBitfield {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return 0;
    }
    const pads = navigator.getGamepads();
    const pad = pads[padIndex];
    if (!pad || !pad.connected) return 0;

    let bits = 0;
    const axisX = pad.axes[0] ?? 0;
    const axisY = pad.axes[1] ?? 0;
    if (axisX < -0.35 || pad.buttons[14]?.pressed) bits |= INPUT_BITS.LEFT;
    if (axisX > 0.35 || pad.buttons[15]?.pressed) bits |= INPUT_BITS.RIGHT;
    if (axisY < -0.5 || pad.buttons[12]?.pressed || pad.buttons[this.mapping.jump]?.pressed) {
      bits |= INPUT_BITS.UP;
    }
    if (axisY > 0.5 || pad.buttons[13]?.pressed) bits |= INPUT_BITS.DOWN;

    if (pad.buttons[this.mapping.light]?.pressed) bits |= INPUT_BITS.LIGHT;
    if (pad.buttons[this.mapping.heavy]?.pressed) bits |= INPUT_BITS.HEAVY;
    if (pad.buttons[this.mapping.block]?.pressed) bits |= INPUT_BITS.BLOCK;
    if (pad.buttons[this.mapping.dodge]?.pressed) bits |= INPUT_BITS.DODGE;
    if (pad.buttons[this.mapping.grab]?.pressed) bits |= INPUT_BITS.GRAB;

    return bits;
  }
}
