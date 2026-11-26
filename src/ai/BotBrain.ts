import type { BehaviorId, DifficultyId } from '../data/enemies';
import { MOVES } from '../data/moves';
import { absInt, fromFp } from '../sim/Fixed';
import { nextRangeInt, normalizeSeed } from '../sim/Rng';
import {
  INPUT_BITS,
  type FighterSlot,
  type FighterState,
  type GameState,
  type InputBitfield,
} from '../sim/State';
import { decideAggressive } from './Behaviors/Aggressive';
import { decideBoss } from './Behaviors/Boss';
import { decideCounterPuncher } from './Behaviors/CounterPuncher';
import { decideDefensive } from './Behaviors/Defensive';
import { DIFFICULTIES, type DifficultyProfile } from './Difficulty';

/** Context snapshot passed into individual AI behavior modules. */
export interface BehaviorContext {
  readonly me: FighterState;
  readonly opp: FighterState;
  readonly distPx: number;
  readonly towardBit: InputBitfield;
  readonly awayBit: InputBitfield;
  readonly roll: number;
  readonly profile: DifficultyProfile;
}

/**
 * Human-like AI controller that perceives GameState with a difficulty-scaled
 * reaction delay and outputs standard InputBitfields.
 */
export class BotBrain {
  private readonly slot: FighterSlot;
  private readonly behavior: BehaviorId;
  private readonly profile: DifficultyProfile;
  private rngState: number;
  private readonly history: GameState[] = [];
  private decisionHold = 0;
  private heldInput: InputBitfield = 0;

  constructor(
    slot: FighterSlot,
    difficulty: DifficultyId = 'normal',
    behavior: BehaviorId = 'aggressive',
    seed = 5050,
  ) {
    this.slot = slot;
    this.behavior = behavior;
    this.profile = DIFFICULTIES[difficulty];
    this.rngState = normalizeSeed(seed);
  }

  /** Resets perception queue between rounds or matches. */
  public reset(): void {
    this.history.length = 0;
    this.decisionHold = 0;
    this.heldInput = 0;
  }

  /** Produces one frame of InputBitfield identically to a human player. */
  public think(state: GameState): InputBitfield {
    this.history.push(state);
    const delay = this.profile.reactionFrames;
    if (this.history.length > delay + 2) {
      this.history.shift();
    }
    const perceived = this.history[0] ?? state;
    const me = perceived.fighters[this.slot];
    const opp = perceived.fighters[this.slot === 0 ? 1 : 0];

    const distPx = fromFp(absInt(me.x - opp.x));
    const towardBit = opp.x >= me.x ? INPUT_BITS.RIGHT : INPUT_BITS.LEFT;
    const awayBit = opp.x >= me.x ? INPUT_BITS.LEFT : INPUT_BITS.RIGHT;

    const liveMe = state.fighters[this.slot];
    const liveOpp = state.fighters[this.slot === 0 ? 1 : 0];

    // 0. React to opponent's incoming player special startup (parry or perfect dodge chance!)
    if (liveOpp.action === 'special_startup' && liveOpp.actionFrame >= 8) {
      const r = this.roll100();
      if (r < Math.trunc(this.profile.parryChance * 0.55)) return INPUT_BITS.BLOCK;
      if (r < Math.trunc(this.profile.dodgeChance * 0.55)) return awayBit | INPUT_BITS.DODGE;
    }

    // 0b. Evade or jump over enemy boss arena specials
    for (const bs of state.bossSpecials) {
      if (bs.ownerSlot === this.slot) continue;
      if (bs.phase === 'telegraph' && bs.frame >= bs.telegraphFrames - 10 && liveMe.x >= bs.left && liveMe.x <= bs.right) {
        if (bs.lowGround) return INPUT_BITS.UP;
        if (bs.parryable && this.roll100() < this.profile.parryChance) return INPUT_BITS.BLOCK;
        return awayBit | INPUT_BITS.DODGE;
      }
    }

    // 0c. Fire boss arena special attack aggressively when off cooldown!
    if (
      liveMe.bossSpecialCooldown === 0 &&
      (liveMe.action === 'idle' || liveMe.action === 'walk') &&
      this.roll100() < (this.behavior === 'boss' ? 45 : 22)
    ) {
      return INPUT_BITS.BOSS_SPECIAL;
    }

    // 0d. Anti-spam retaliation: if player is mashing a light combo on us, parry or dodge out!
    if (liveOpp.comboCount >= 2 && liveOpp.action === 'attack' && distPx < 130) {
      const antiSpamRoll = this.roll100();
      if (antiSpamRoll < this.profile.parryChance + 20) return INPUT_BITS.BLOCK;
      if (antiSpamRoll < this.profile.parryChance + 45) return awayBit | INPUT_BITS.DODGE;
    }

    // 1. Urgent hazard evasion (coffin slab telegraph directly under bot)
    for (const slab of state.hazards) {
      if (slab.phase === 'telegraph' && slab.frame > 10 && absInt(slab.x - state.fighters[this.slot].x) < 52_000) {
        const dodgeRoll = this.roll100();
        if (dodgeRoll < this.profile.dodgeChance) {
          return awayBit | INPUT_BITS.DODGE;
        }
      }
    }

    // 2. React to incoming attacks from opponent (respecting reaction delay)
    if (opp.action === 'attack' && opp.currentMove !== null && distPx < 145) {
      const move = MOVES[opp.currentMove];
      const framesUntilActive = move.startup - opp.actionFrame;
      if (move.unblockable) {
        if (framesUntilActive <= 8 && framesUntilActive >= 0) {
          return this.roll100() < this.profile.dodgeChance ? awayBit | INPUT_BITS.DODGE : INPUT_BITS.UP;
        }
      } else if (move.isGrab) {
        if (framesUntilActive <= 5 && this.roll100() < this.profile.dodgeChance) {
          return awayBit | INPUT_BITS.DODGE;
        }
      } else if (framesUntilActive <= 6 && framesUntilActive >= 0) {
        const r = this.roll100();
        if (r < this.profile.parryChance) {
          return INPUT_BITS.BLOCK; // Tap block in parry window
        }
        if (r < this.profile.parryChance + 35) {
          this.heldInput = INPUT_BITS.BLOCK;
          this.decisionHold = 10;
          return INPUT_BITS.BLOCK;
        }
      }
    }

    // 3. Combo follow-up when landing light attacks
    if (liveMe.action === 'attack' && liveMe.moveHitLanded && liveMe.currentMove === 'light1') {
      if (this.roll100() < this.profile.comboChance) {
        return this.roll100() < 45 ? INPUT_BITS.HEAVY : INPUT_BITS.LIGHT;
      }
    }

    // 4. Hold neutral movement/guard briefly for organic rhythm
    if (this.decisionHold > 0) {
      this.decisionHold -= 1;
      return this.heldInput;
    }

    const roll = this.roll100();
    const ctx: BehaviorContext = {
      me,
      opp,
      distPx,
      towardBit,
      awayBit,
      roll,
      profile: this.profile,
    };

    let chosen: InputBitfield;
    switch (this.behavior) {
      case 'aggressive':
        chosen = decideAggressive(ctx);
        break;
      case 'defensive':
        chosen = decideDefensive(ctx);
        break;
      case 'counter':
        chosen = decideCounterPuncher(ctx);
        break;
      case 'boss':
        chosen = decideBoss(ctx);
        break;
    }

    // Attack/dodge inputs are single-frame pulses; movement/block hold briefly
    const isPulse =
      (chosen & (INPUT_BITS.LIGHT | INPUT_BITS.HEAVY | INPUT_BITS.GRAB | INPUT_BITS.DODGE | INPUT_BITS.UNBLOCKABLE)) !==
      0;
    if (!isPulse) {
      this.heldInput = chosen;
      this.decisionHold = 6 + (roll % 8);
    }
    return chosen;
  }

  private roll100(): number {
    const res = nextRangeInt(this.rngState, 0, 99);
    this.rngState = res.nextState;
    return res.value;
  }
}
