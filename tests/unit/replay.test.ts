import { describe, expect, it } from 'vitest';
import { BotBrain } from '../../src/ai/BotBrain';
import { BALANCE } from '../../src/data/balance';
import { simulateReplayHeadless } from '../../src/replay/Player';
import {
  decodeReplayCode,
  encodeReplayCode,
  migrateReplay,
  ReplayRecorder,
} from '../../src/replay/Recorder';
import { createInitialState, step } from '../../src/sim/Sim';
import { hashState } from '../../src/sim/Snapshot';
import type { MatchConfig } from '../../src/sim/State';
import { DEFAULT_SETTINGS, migrateSettings } from '../../src/systems/Settings';

describe('Replay System & Versioned Migrations', () => {
  it('replays a recorded fight identically to the live result after base64 encode/decode', () => {
    const config: MatchConfig = {
      seed: 314159,
      stageId: 'dusk_desert',
      p1Char: 'hero',
      p2Char: 'assassin',
      roundsToWin: 1,
      roundTimerFrames: 30 * BALANCE.TICK_RATE,
      enableHazards: false,
      parryAssist: false,
      infiniteGuardP2: false,
      trainingMode: false,
    };

    const recorder = new ReplayRecorder(config);
    const b1 = new BotBrain(0, 'hard', 'aggressive', 701);
    const b2 = new BotBrain(1, 'hard', 'counter', 702);

    let liveState = createInitialState(config);
    for (let f = 0; f < 1800; f += 1) {
      if (liveState.phase === 'match_end') break;
      const in1 = b1.think(liveState);
      const in2 = b2.think(liveState);
      recorder.recordFrame(in1, in2);
      liveState = step(liveState, [in1, in2]);
    }

    const liveHash = hashState(liveState);
    const recording = recorder.finalize('Test Match', liveHash, 100);
    const shareCode = encodeReplayCode(recording);
    const decoded = decodeReplayCode(shareCode);
    const replayResult = simulateReplayHeadless(decoded);

    expect(replayResult.hash).toBe(liveHash);
    expect(replayResult.state.winner).toBe(liveState.winner);
    expect(replayResult.state.fighters[0].hp).toBe(liveState.fighters[0].hp);
    expect(replayResult.state.fighters[1].hp).toBe(liveState.fighters[1].hp);
  });

  it('migrates older v1 settings and replay objects safely', () => {
    const migratedSettings = migrateSettings({ screenShake: false, volumes: { master: 0.4 } }, 1);
    expect(migratedSettings.screenShake).toBe(false);
    expect(migratedSettings.volumes.master).toBe(0.4);
    expect(migratedSettings.volumes.sfx).toBe(DEFAULT_SETTINGS.volumes.sfx);

    const migratedReplay = migrateReplay({
      config: {
        seed: 1,
        stageId: 'beige_plain',
        p1Char: 'hero',
        p2Char: 'swordsman',
        roundsToWin: 2,
        roundTimerFrames: 5940,
        enableHazards: false,
        parryAssist: false,
        infiniteGuardP2: false,
        trainingMode: false,
      },
      rleFrames: [10, 0, 0],
    });
    expect(migratedReplay.version).toBe(2);
    expect(migratedReplay.rleFrames.length).toBe(3);
  });
});
