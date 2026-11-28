import { describe, expect, it } from 'vitest';
import { getDailyChallenge, claimDailyInvitation, DAILY_BOSSES } from '../../src/systems/Progress';
import { createInitialState } from '../../src/sim/Sim';
import { spawnBossSpecial, stepBossSpecials } from '../../src/sim/BossSpecials';
import { BOSS_SPECIALS_BY_CHAR } from '../../src/data/specials';

describe('Vesper daily encounter', () => {
  it('shows the invitation only once per UTC day', () => {
    expect(claimDailyInvitation(new Date('2040-01-01T00:00:00Z'))).toBe(true);
    expect(claimDailyInvitation(new Date('2040-01-01T23:59:59Z'))).toBe(false);
    expect(claimDailyInvitation(new Date('2040-01-02T00:00:00Z'))).toBe(true);
    expect(claimDailyInvitation(new Date('2040-01-02T12:00:00Z'))).toBe(false);
  });

  it('includes the complete daily boss roster with Vesper and Raijin', () => {
    expect(DAILY_BOSSES).toEqual(['vesper', 'raijin', 'swordsman', 'brawler', 'assassin', 'warden']);
    for (const boss of DAILY_BOSSES) expect(BOSS_SPECIALS_BY_CHAR[boss]).toHaveLength(4);
  });

  it('keeps the same encounter seed throughout a UTC day and rotates it at midnight', () => {
    const morning = getDailyChallenge(new Date('2026-11-26T00:00:00Z'));
    expect(getDailyChallenge(new Date('2026-11-26T23:59:59Z'))).toEqual(morning);
    expect(morning.enemyChar).toBe('vesper');
    expect(getDailyChallenge(new Date('2026-11-27T00:00:00Z')).seed).not.toBe(morning.seed);
  });

  it('spawns and completes every Vesper and Raijin boss attack without repeat damage', () => {
    for (const bossId of ['vesper', 'raijin'] as const) {
      const state = createInitialState({
        seed: 1, stageId: 'night_rooftop', p1Char: 'hero', p2Char: bossId,
        roundsToWin: 2, roundTimerFrames: 5940, enableHazards: false,
        parryAssist: false, infiniteGuardP2: false, trainingMode: false,
      });
      for (const spec of BOSS_SPECIALS_BY_CHAR[bossId]) {
        const spawned = spawnBossSpecial(state.fighters[1], 1, 42).special!;
        let fighters = state.fighters;
        let specials = [{ ...spawned, specialId: spec.id, left: 0, right: 1280000,
          telegraphFrames: spec.telegraphFrames, activeFrames: spec.activeFrames,
          damage: spec.damage, lowGround: spec.lowGround, parryable: spec.parryable }];
        let hits = 0;
        for (let f = 0; f < spec.telegraphFrames + spec.activeFrames + 2; f++) {
          const result = stepBossSpecials(specials, fighters, false);
          fighters = result.fighters;
          specials = [...result.specials];
          hits += result.events.filter(e => e.type === 'HIT').length;
        }
        expect(hits).toBe(1);
        expect(specials).toHaveLength(0);
        expect(fighters[0].hp).toBe(state.fighters[0].hp - spec.damage);
      }
    }
  });
});
