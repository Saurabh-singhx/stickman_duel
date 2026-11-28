import type { CharacterId } from '../data/characters';
import type { StageId } from '../data/stages';
import { loadVersioned, saveVersioned, safeGetItem, safeSetItem } from './SaveSystem';

/** Persisted single-player progression and Daily Challenge records. */
export interface PlayerProgress {
  readonly bossRushBestStage: number;
  readonly bossRushClears: number;
  readonly wavesBestScore: number;
  readonly wavesBestWave: number;
  readonly dailyBestScores: Record<string, number>;
}

/** Seeded daily boss challenge definition generated deterministically per UTC day. */
export interface DailyChallengeSpec {
  readonly dateKey: string;
  readonly seed: number;
  readonly stageId: StageId;
  readonly enemyChar: CharacterId;
  readonly enableHazards: boolean;
}

/**
 * Documented interface stub for a future remote daily-challenge leaderboard endpoint.
 */
export interface LeaderboardClient {
  submitScore(dateKey: string, score: number, replayCode: string): Promise<void>;
  fetchTopScores(dateKey: string, limit: number): Promise<readonly { name: string; score: number }[]>;
}

const PROGRESS_KEY = 'duskblade.progress';

export const DEFAULT_PROGRESS: PlayerProgress = {
  bossRushBestStage: 0,
  bossRushClears: 0,
  wavesBestScore: 0,
  wavesBestWave: 0,
  dailyBestScores: {},
};

/** Computes today's UTC date string (YYYY-MM-DD) and deterministic daily challenge seed. */
export function getDailyChallenge(date = new Date()): DailyChallengeSpec {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const dateKey = `${yyyy}-${mm}-${dd}`;
  let hash = 2166136261;
  for (let i = 0; i < dateKey.length; i += 1) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const stages: readonly StageId[] = ['beige_plain', 'dusk_desert', 'ruined_hall', 'night_rooftop'];
  return {
    dateKey,
    seed: hash,
    stageId: stages[hash % stages.length] ?? 'ruined_hall',
    enemyChar: 'vesper',
    enableHazards: (hash & 1) === 1,
  };
}

/** Loads persisted player progression. */
export function loadProgress(): PlayerProgress {
  return loadVersioned(PROGRESS_KEY, { ...DEFAULT_PROGRESS }, (raw) => {
    if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PROGRESS };
    return { ...DEFAULT_PROGRESS, ...(raw as Partial<PlayerProgress>) };
  });
}

/** Saves player progression. */
export function saveProgress(progress: PlayerProgress): void {
  saveVersioned(PROGRESS_KEY, progress);
}

/** All distinct boss characters, including the daily boss roster. */
export const DAILY_BOSSES = ['vesper', 'raijin', 'swordsman', 'brawler', 'assassin', 'warden'] as const;
export type DailyBossId = typeof DAILY_BOSSES[number];

/** Claim the day's non-blocking invitation once, including across reloads. */
export function claimDailyInvitation(date = new Date()): boolean {
  const day = getDailyChallenge(date).dateKey;
  const key = 'duskblade.dailyInvitationSeen';
  if (safeGetItem(key) === day) return false;
  safeSetItem(key, day);
  return true;
}
