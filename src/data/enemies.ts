import type { CharacterId } from './characters';
import type { StageId } from './stages';

/**
 * AI behavior archetype identifiers.
 */
export type BehaviorId = 'aggressive' | 'defensive' | 'counter' | 'boss';

/**
 * Difficulty tiers controlling reaction delay and parry proficiency.
 */
export type DifficultyId = 'easy' | 'normal' | 'hard' | 'master';

/**
 * Encapsulates an encounter in Boss Rush or Waves.
 */
export interface BossRushEncounter {
  readonly index: number;
  readonly title: string;
  readonly subtitle: string;
  readonly enemyChar: CharacterId;
  readonly stage: StageId;
  readonly behavior: BehaviorId;
  readonly difficulty: DifficultyId;
  readonly enableHazards: boolean;
  /** Number of consecutive opponents in a gauntlet encounter (e.g. 2 for 2-vs-1 gauntlet). */
  readonly gauntletCount: number;
}

/**
 * Six escalating Boss Rush fights.
 */
export const BOSS_RUSH_ENCOUNTERS: readonly BossRushEncounter[] = [
  {
    index: 1,
    title: 'I. Ash Ronin',
    subtitle: 'Disciplined blade spacing',
    enemyChar: 'swordsman',
    stage: 'beige_plain',
    behavior: 'defensive',
    difficulty: 'easy',
    enableHazards: false,
    gauntletCount: 1,
  },
  {
    index: 2,
    title: 'II. Ochre Brute',
    subtitle: 'Heavy guard-breaking fists',
    enemyChar: 'brawler',
    stage: 'dusk_desert',
    behavior: 'aggressive',
    difficulty: 'normal',
    enableHazards: false,
    gauntletCount: 1,
  },
  {
    index: 3,
    title: 'III. Crimson Shade',
    subtitle: 'Relentless feints and counters',
    enemyChar: 'assassin',
    stage: 'night_rooftop',
    behavior: 'counter',
    difficulty: 'normal',
    enableHazards: false,
    gauntletCount: 1,
  },
  {
    index: 4,
    title: 'IV. The Coffin Hall',
    subtitle: 'Watch the trembling floor',
    enemyChar: 'swordsman',
    stage: 'ruined_hall',
    behavior: 'defensive',
    difficulty: 'hard',
    enableHazards: true,
    gauntletCount: 1,
  },
  {
    index: 5,
    title: 'V. Twin Shadow Gauntlet',
    subtitle: 'Two foes back-to-back on one life bar',
    enemyChar: 'assassin',
    stage: 'dusk_desert',
    behavior: 'aggressive',
    difficulty: 'hard',
    enableHazards: false,
    gauntletCount: 2,
  },
  {
    index: 6,
    title: 'VI. Casket Warden',
    subtitle: 'Unblockable rends and rising slabs',
    enemyChar: 'warden',
    stage: 'ruined_hall',
    behavior: 'boss',
    difficulty: 'master',
    enableHazards: true,
    gauntletCount: 1,
  },
];

/**
 * Endless Waves scaling table.
 */
export interface WaveConfig {
  readonly enemyChar: CharacterId;
  readonly behavior: BehaviorId;
  readonly difficulty: DifficultyId;
  readonly stage: StageId;
  readonly enableHazards: boolean;
}

/**
 * Computes the enemy configuration for a given 1-indexed wave number.
 */
export function getWaveConfig(wave: number): WaveConfig {
  const chars: readonly CharacterId[] = ['swordsman', 'brawler', 'assassin', 'warden'];
  const stages: readonly StageId[] = ['beige_plain', 'dusk_desert', 'ruined_hall', 'night_rooftop'];
  const behaviors: readonly BehaviorId[] = ['aggressive', 'defensive', 'counter', 'boss'];

  const isBossWave = wave % 4 === 0;
  const enemyChar = isBossWave ? 'warden' : (chars[(wave - 1) % 3] ?? 'swordsman');
  const stage = stages[(wave - 1) % stages.length] ?? 'beige_plain';
  const behavior = isBossWave ? 'boss' : (behaviors[(wave - 1) % 3] ?? 'aggressive');
  const difficulty: DifficultyId =
    wave <= 2 ? 'easy' : wave <= 5 ? 'normal' : wave <= 8 ? 'hard' : 'master';

  return {
    enemyChar,
    behavior,
    difficulty,
    stage,
    enableHazards: isBossWave || wave >= 6,
  };
}
