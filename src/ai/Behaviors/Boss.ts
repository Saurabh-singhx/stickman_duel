import { INPUT_BITS, type InputBitfield } from '../../sim/State';
import type { BehaviorContext } from '../BotBrain';

/**
 * Boss behavior: mixes relentless pressure with frequent unblockable red-flash
 * attacks, heavy guard-crushers, and decisive executions.
 */
export function decideBoss(ctx: BehaviorContext): InputBitfield {
  const { distPx, towardBit, opp, me, roll, profile } = ctx;

  // Vesper retreats from committed heavies and punishes the recovery.
  if (me.charId === 'vesper' && distPx < 115 && opp.action === 'attack' && opp.currentMove === 'heavy' && roll < 35) {
    return INPUT_BITS.DODGE;
  }
  if (me.counterWindow > 0 && distPx < 150) {
    return INPUT_BITS.HEAVY;
  }
  if (opp.action === 'guard_break' && distPx < 135) {
    return INPUT_BITS.GRAB;
  }
  if (distPx > 125) {
    return roll < 18 ? towardBit | INPUT_BITS.DODGE : towardBit;
  }
  if (opp.action === 'block' && distPx < 120) {
    return roll < 50 ? INPUT_BITS.UNBLOCKABLE : INPUT_BITS.GRAB;
  }
  if (roll < profile.aggression + 8) {
    if (roll % 4 === 0) return INPUT_BITS.UNBLOCKABLE;
    if (roll % 3 === 0) return INPUT_BITS.HEAVY;
    return INPUT_BITS.LIGHT;
  }
  return towardBit;
}
