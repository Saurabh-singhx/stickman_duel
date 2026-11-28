import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { DEFAULT_P1_KEYS } from '../../src/input/Keyboard';
import { createInitialState, step } from '../../src/sim/Sim';
import type { GameState, MatchConfig } from '../../src/sim/State';
import { DEFAULT_SETTINGS, migrateSettings } from '../../src/systems/Settings';
import {
  formatKeyCode,
  selectContextualCallout,
  shouldShowCombatGuide,
} from '../../src/ui/CombatGuide';

function makeFightingState(): GameState {
  const cfg: MatchConfig = {
    seed: 101,
    stageId: 'beige_plain',
    p1Char: 'hero',
    p2Char: 'swordsman',
    roundsToWin: 2,
    roundTimerFrames: 5940,
    enableHazards: false,
    parryAssist: false,
    infiniteGuardP2: false,
    trainingMode: false,
  };
  let state = createInitialState(cfg);
  for (let i = 0; i < BALANCE.ROUND_START_FREEZE_FRAMES + 2; i += 1) {
    state = step(state, [0, 0]);
  }
  return state;
}

describe('Default Block Key & New-Player Combat Guide', () => {
  it('sets Q (KeyQ) as the default P1 block/parry key and migrates old KeyL default', () => {
    expect(DEFAULT_P1_KEYS.block).toBe('KeyQ');
    expect(DEFAULT_SETTINGS.p1Keys.block).toBe('KeyQ');
    expect(DEFAULT_SETTINGS.controlHints).toBe('auto');

    const migratedDefault = migrateSettings({ p1Keys: { ...DEFAULT_P1_KEYS, block: 'KeyL' } }, 4);
    expect(migratedDefault.p1Keys.block).toBe('KeyQ');

    const migratedCustom = migrateSettings({ p1Keys: { ...DEFAULT_P1_KEYS, block: 'KeyF' } }, 4);
    expect(migratedCustom.p1Keys.block).toBe('KeyF');
  });

  it('formats key codes into clean keycap labels', () => {
    expect(formatKeyCode('KeyQ')).toBe('Q');
    expect(formatKeyCode('Space')).toBe('SPACE');
    expect(formatKeyCode('ShiftLeft')).toBe('SHIFT');
    expect(formatKeyCode('KeyE')).toBe('E');
  });

  it('shows combat guide automatically for new players and training, and respects overrides', () => {
    expect(shouldShowCombatGuide('auto', 0, 'vs_bot')).toBe(true);
    expect(shouldShowCombatGuide('auto', 2, 'quick_play')).toBe(true);
    expect(shouldShowCombatGuide('auto', 3, 'vs_bot')).toBe(false);
    expect(shouldShowCombatGuide('auto', 10, 'training')).toBe(true);
    expect(shouldShowCombatGuide('on', 10, 'vs_bot')).toBe(true);
    expect(shouldShowCombatGuide('off', 0, 'training')).toBe(false);
  });

  it('surfaces contextual instructions for unblockables, hazards, specials, parries, and basics', () => {
    const base = makeFightingState();

    // 1. Incoming red unblockable -> dodge / jump instruction
    const unblockableState: GameState = {
      ...base,
      fighters: [
        base.fighters[0],
        { ...base.fighters[1], action: 'attack', currentMove: 'unblockable' },
      ],
    };
    const unblockableCallout = selectContextualCallout(
      unblockableState,
      [],
      DEFAULT_P1_KEYS,
      false,
      10,
    );
    expect(unblockableCallout?.id).toBe('unblockable');
    expect(unblockableCallout?.segments).toContainEqual({ key: 'SHIFT' });
    expect(unblockableCallout?.segments).toContainEqual({ key: 'SPACE' });

    // 2. Floor hazard -> jump / dodge instruction
    const hazardState: GameState = {
      ...base,
      hazards: [{ id: 1, x: 500_000, phase: 'telegraph', frame: 5, hitMask: 0 }],
    };
    const hazardCallout = selectContextualCallout(hazardState, [], DEFAULT_P1_KEYS, false, 10);
    expect(hazardCallout?.id).toBe('hazard');

    // 3. Special meter 100% -> special key instruction
    const specialState: GameState = {
      ...base,
      fighters: [{ ...base.fighters[0], specialMeter: 100 }, base.fighters[1]],
    };
    const specialCallout = selectContextualCallout(specialState, [], DEFAULT_P1_KEYS, false, 10);
    expect(specialCallout?.id).toBe('special_ready');
    expect(specialCallout?.segments).toContainEqual({ key: 'E' });

    // 4. Incoming normal attack within range -> Q parry / block instruction
    const parryState: GameState = {
      ...base,
      fighters: [
        { ...base.fighters[0], x: 500_000 },
        { ...base.fighters[1], x: 640_000, action: 'attack', currentMove: 'light1' },
      ],
    };
    const parryCallout = selectContextualCallout(parryState, [], DEFAULT_P1_KEYS, false, 10);
    expect(parryCallout?.id).toBe('incoming_strike');
    expect(parryCallout?.segments).toContainEqual({ key: 'Q' });

    // 5. Neutral rotating basics
    const basicsCallout = selectContextualCallout(base, [], DEFAULT_P1_KEYS, false, 310);
    expect(basicsCallout?.id).toBe('tip_block_parry');
    expect(basicsCallout?.segments).toContainEqual({ key: 'Q' });

    // 6. Hidden during cinematic finisher
    const finisherState: GameState = { ...base, phase: 'finisher' };
    expect(selectContextualCallout(finisherState, [], DEFAULT_P1_KEYS, false, 10)).toBeNull();
  });
});
