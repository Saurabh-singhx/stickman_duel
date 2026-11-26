import { INPUT_BITS, type InputBitfield } from '../sim/State';

export { INPUT_BITS, type InputBitfield };

/** Named logical input actions that can be rebound in settings. */
export type InputAction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'light'
  | 'heavy'
  | 'block'
  | 'dodge'
  | 'grab'
  | 'special';

/** Maps an InputAction name to its corresponding bitmask flag. */
export const ACTION_TO_BIT: Record<InputAction, number> = {
  left: INPUT_BITS.LEFT,
  right: INPUT_BITS.RIGHT,
  up: INPUT_BITS.UP,
  down: INPUT_BITS.DOWN,
  light: INPUT_BITS.LIGHT,
  heavy: INPUT_BITS.HEAVY,
  block: INPUT_BITS.BLOCK,
  dodge: INPUT_BITS.DODGE,
  grab: INPUT_BITS.GRAB,
  special: INPUT_BITS.SPECIAL,
};

/**
 * Packs a partial map of pressed actions into a compact InputBitfield integer.
 */
export function packInput(actions: Partial<Record<InputAction, boolean>>): InputBitfield {
  let bits = 0;
  for (const key of Object.keys(ACTION_TO_BIT) as InputAction[]) {
    if (actions[key]) {
      bits |= ACTION_TO_BIT[key];
    }
  }
  return bits;
}

/**
 * Checks if a specific bit flag is set on an InputBitfield.
 */
export function hasInputBit(frame: InputBitfield, bit: number): boolean {
  return (frame & bit) !== 0;
}
