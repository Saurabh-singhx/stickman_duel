import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { nextU32 } from '../../src/sim/Rng';
import { createInitialState, step } from '../../src/sim/Sim';
import { hashState, loadState, saveState } from '../../src/sim/Snapshot';
import type { MatchConfig } from '../../src/sim/State';

function makeConfig(seed = 1337): MatchConfig {
  return {
    seed,
    stageId: 'ruined_hall',
    p1Char: 'hero',
    p2Char: 'swordsman',
    roundsToWin: 99,
    roundTimerFrames: 0,
    enableHazards: true,
    parryAssist: false,
    infiniteGuardP2: false,
    trainingMode: false,
  };
}

describe('Deterministic Simulation Core', () => {
  it('produces identical hashes every frame for a 5-minute (18,000-frame) random-input run', () => {
    const totalFrames = 5 * 60 * BALANCE.TICK_RATE; // 18,000 frames
    let inputRng = 0xdeadbeef;
    const inputs: Array<readonly [number, number]> = [];
    for (let i = 0; i < totalFrames; i += 1) {
      const r1 = nextU32(inputRng);
      inputRng = r1.nextState;
      const r2 = nextU32(inputRng);
      inputRng = r2.nextState;
      inputs.push([r1.value & 0x1ff, r2.value & 0x1ff]);
    }

    let stateA = createInitialState(makeConfig(424242));
    let stateB = createInitialState(makeConfig(424242));

    for (let i = 0; i < totalFrames; i += 1) {
      const pair = inputs[i]!;
      stateA = step(stateA, pair);
      stateB = step(stateB, pair);
      expect(hashState(stateA)).toBe(hashState(stateB));
    }
    expect(stateA.frame).toBe(totalFrames);
  });

  it('matches continuous execution identically after mid-fight saveState/loadState', () => {
    let inputRng = 0x12345678;
    const config = makeConfig(9001);
    let continuous = createInitialState(config);
    let snapshotRun = createInitialState(config);

    for (let f = 0; f < 1200; f += 1) {
      const r1 = nextU32(inputRng);
      inputRng = r1.nextState;
      const r2 = nextU32(inputRng);
      inputRng = r2.nextState;
      const pair: readonly [number, number] = [r1.value & 0x1ff, r2.value & 0x1ff];

      continuous = step(continuous, pair);
      snapshotRun = step(snapshotRun, pair);

      if (f === 600) {
        const blob = saveState(snapshotRun);
        snapshotRun = loadState(blob);
        expect(hashState(snapshotRun)).toBe(hashState(continuous));
      }
    }

    expect(hashState(snapshotRun)).toBe(hashState(continuous));
  });
});
