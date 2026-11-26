import { INPUT_BITS, type InputBitfield } from '../../sim/State';
import type { BehaviorContext } from '../BotBrain';

/**
 * Defensive behavior: maintains optimal footsies spacing, blocks pressure,
 * and punishes whiffed opponent attacks cleanly.
 */
export function decideDefensive(ctx: BehaviorContext): InputBitfield {
  const { distPx, towardBit, awayBit, opp, me, roll, profile } = ctx;

  if (me.counterWindow > 0 && distPx < 140) {
    return INPUT_BITS.LIGHT;
  }
  if (opp.action === 'guard_break' && distPx < 130) {
    return INPUT_BITS.GRAB;
  }
  // Whiff punish recovering opponent
  if (
    (opp.action === 'attack' && opp.actionFrame > 12) ||
    opp.action === 'parry_whiff' ||
    opp.action === 'parry_stagger'
  ) {
    if (distPx < 125) return roll < 50 ? INPUT_BITS.HEAVY : INPUT_BITS.LIGHT;
    return towardBit;
  }
  if (distPx < 75 && roll < 40) {
    return awayBit;
  }
  if (distPx > 122) {
    return towardBit;
  }
  if (roll < Math.max(25, profile.aggression - 12)) {
    return roll % 4 === 0 ? INPUT_BITS.HEAVY : INPUT_BITS.LIGHT;
  }
  return INPUT_BITS.BLOCK;
}
