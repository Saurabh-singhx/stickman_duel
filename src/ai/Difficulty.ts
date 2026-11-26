import type { DifficultyId } from '../data/enemies';

/** Tunable AI parameters per difficulty tier. */
export interface DifficultyProfile {
  readonly id: DifficultyId;
  readonly label: string;
  /** Frames of perception delay before reacting to opponent moves. */
  readonly reactionFrames: number;
  /** Probability (0..100) of attempting a timed parry on normal incoming attack. */
  readonly parryChance: number;
  /** Probability (0..100) of dodging an unblockable or coffin slab. */
  readonly dodgeChance: number;
  /** Probability (0..100) of attacking when in range and neutral. */
  readonly aggression: number;
  /** Probability (0..100) of chaining into follow-up light/heavy on hit. */
  readonly comboChance: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyProfile> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    reactionFrames: 30,
    parryChance: 10,
    dodgeChance: 25,
    aggression: 56,
    comboChance: 25,
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    reactionFrames: 20,
    parryChance: 26,
    dodgeChance: 50,
    aggression: 92,
    comboChance: 50,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    reactionFrames: 13,
    parryChance: 45,
    dodgeChance: 72,
    aggression: 92,
    comboChance: 72,
  },
  master: {
    id: 'master',
    label: 'Master',
    reactionFrames: 8,
    parryChance: 64,
    dodgeChance: 88,
    aggression: 92,
    comboChance: 88,
  },
};
