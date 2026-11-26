import type { FighterStats } from '../sim/State';
import { loadVersioned, saveVersioned } from './SaveSystem';

/** Lifetime player combat statistics persisted across sessions. */
export interface LifetimeStats {
  readonly matchesPlayed: number;
  readonly matchesWon: number;
  readonly totalParries: number;
  readonly totalPerfectDodges: number;
  readonly totalGuardBreaks: number;
  readonly totalFinishers: number;
  readonly highestCombo: number;
}

const STATS_KEY = 'duskblade.stats';

export const DEFAULT_STATS: LifetimeStats = {
  matchesPlayed: 0,
  matchesWon: 0,
  totalParries: 0,
  totalPerfectDodges: 0,
  totalGuardBreaks: 0,
  totalFinishers: 0,
  highestCombo: 0,
};

/** Loads persisted lifetime stats. */
export function loadStats(): LifetimeStats {
  return loadVersioned(STATS_KEY, { ...DEFAULT_STATS }, (raw) => {
    if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_STATS };
    return { ...DEFAULT_STATS, ...(raw as Partial<LifetimeStats>) };
  });
}

/** Records the outcome and combat metrics of a finished match. */
export function recordMatchStats(p1Stats: FighterStats, won: boolean): LifetimeStats {
  const cur = loadStats();
  const next: LifetimeStats = {
    matchesPlayed: cur.matchesPlayed + 1,
    matchesWon: cur.matchesWon + (won ? 1 : 0),
    totalParries: cur.totalParries + p1Stats.parries,
    totalPerfectDodges: cur.totalPerfectDodges + p1Stats.perfectDodges,
    totalGuardBreaks: cur.totalGuardBreaks + p1Stats.guardBreaks,
    totalFinishers: cur.totalFinishers + p1Stats.finishers,
    highestCombo: Math.max(cur.highestCombo, p1Stats.maxCombo),
  };
  saveVersioned(STATS_KEY, next);
  return next;
}
