import { INPUT_BITS, type InputBitfield } from '../../sim/State';
import type { BehaviorContext } from '../BotBrain';

/**
 * Counter-puncher behavior: baits swings at mid-range, dashes in and out,
 * and capitalizes heavily on parries and perfect dodges.
 */
export function decideCounterPuncher(ctx: BehaviorContext): InputBitfield {
  const { distPx, towardBit, awayBit, opp, me, roll, profile } = ctx;

  if (me.counterWindow > 0 && distPx < 145) {
    return INPUT_BITS.HEAVY;
  }
  if (opp.action === 'guard_break' && distPx < 135) {
    return INPUT_BITS.GRAB;
  }
  if (distPx > 130) {
    return towardBit;
  }
  if (distPx < 92 && opp.action === 'block') {
    return roll < 60 ? INPUT_BITS.GRAB : INPUT_BITS.UNBLOCKABLE;
  }
  if (roll < 20) {
    return awayBit | INPUT_BITS.DODGE;
  }
  if (roll < profile.aggression + 10 && distPx < 112) {
    return roll % 3 === 0 ? INPUT_BITS.HEAVY : INPUT_BITS.LIGHT;
  }
  return distPx > 102 ? towardBit : 0;
}
