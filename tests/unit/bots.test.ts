import { describe, expect, it } from 'vitest';
import { BotBrain } from '../../src/ai/BotBrain';
import { BALANCE } from '../../src/data/balance';
import type { BehaviorId, DifficultyId } from '../../src/data/enemies';
import { createInitialState, step } from '../../src/sim/Sim';
import type { MatchConfig } from '../../src/sim/State';

describe('Bot-vs-Bot Headless Stress Test', () => {
  it('completes 100 bot-vs-bot fights with zero crashes, zero infinite stalemates, and sensible HP outcomes', () => {
    const behaviors: readonly BehaviorId[] = ['aggressive', 'defensive', 'counter', 'boss'];
    const difficulties: readonly DifficultyId[] = ['easy', 'normal', 'hard', 'master'];
    let finishedMatches = 0;
    let totalDamage = 0;

    for (let i = 0; i < 100; i += 1) {
      const cfg: MatchConfig = {
        seed: 1000 + i * 17,
        stageId: i % 3 === 0 ? 'ruined_hall' : 'beige_plain',
        p1Char: 'hero',
        p2Char: i % 4 === 0 ? 'warden' : i % 3 === 0 ? 'assassin' : i % 2 === 0 ? 'brawler' : 'swordsman',
        roundsToWin: 1,
        roundTimerFrames: 40 * BALANCE.TICK_RATE, // 40s timeout rule guarantees no stalemate
        enableHazards: i % 3 === 0,
        parryAssist: false,
        infiniteGuardP2: false,
        trainingMode: false,
      };

      const bot1 = new BotBrain(0, difficulties[i % 4]!, behaviors[i % 4]!, 2000 + i);
      const bot2 = new BotBrain(1, difficulties[(i + 1) % 4]!, behaviors[(i + 2) % 4]!, 3000 + i);
      let state = createInitialState(cfg);

      // Cap at 40s + intro/finisher buffer (2700 frames)
      for (let f = 0; f < 2700; f += 1) {
        if (state.phase === 'match_end') break;
        const in1 = bot1.think(state);
        const in2 = bot2.think(state);
        state = step(state, [in1, in2]);
      }

      expect(state.phase).toBe('match_end');
      finishedMatches += 1;
      totalDamage += state.stats[0].damageDealt + state.stats[1].damageDealt;
    }

    expect(finishedMatches).toBe(100);
    // Average damage across 100 fights should be substantial (real combat occurring)
    expect(totalDamage / 100).toBeGreaterThan(60);
  });
});
