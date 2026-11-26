import { INPUT_BITS, type InputBitfield } from '../../sim/State';
import type { BehaviorContext } from '../BotBrain';

/**
 * Aggressive behavior: closes distance rapidly, pressures with light chains,
 * guard-breaking heavies, and grabs against blocking foes.
 */
export function decideAggressive(ctx: BehaviorContext): InputBitfield {
  const { distPx, towardBit, opp, me, roll, profile } = ctx;

  if (me.counterWindow > 0 && distPx < 140) {
    return INPUT_BITS.HEAVY;
  }
  if (opp.action === 'guard_break' && distPx < 130) {
    return INPUT_BITS.GRAB;
  }
  if (distPx > 108) {
    return roll < 14 ? towardBit | INPUT_BITS.DODGE : towardBit;
  }
  if (opp.action === 'block' && distPx < 78 && roll < 55) {
    return INPUT_BITS.GRAB;
  }
  if (roll < profile.aggression) {
    if (roll % 5 === 0) return INPUT_BITS.HEAVY;
    if (roll % 11 === 0) return INPUT_BITS.UNBLOCKABLE;
    return INPUT_BITS.LIGHT;
  }
  return towardBit;
}
