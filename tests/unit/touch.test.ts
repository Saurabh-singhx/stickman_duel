import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { computeJoystickState } from '../../src/input/Touch';
import { createInitialState, step } from '../../src/sim/Sim';
import { INPUT_BITS, type GameState, type MatchConfig } from '../../src/sim/State';

function makeFightingState(): GameState {
  const cfg: MatchConfig = {
    seed: 42,
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

describe('Mobile Touch Joystick & Controls Logic', () => {
  const R = 50;

  it('returns neutral inside inner deadzone and guards invalid radius', () => {
    expect(computeJoystickState(0, 0, R).bits).toBe(0);
    expect(computeJoystickState(6, -6, R).bits).toBe(0); // norm ~0.17 < 0.22
    expect(computeJoystickState(30, 0, 0).bits).toBe(0);
    expect(computeJoystickState(Number.NaN, 10, R).bits).toBe(0);
  });

  it('clamps visual knob offset strictly within maxRadius', () => {
    const out = computeJoystickState(120, -120, R);
    expect(Math.hypot(out.knobX, out.knobY)).toBeCloseTo(R, 4);
  });

  it('maps pure cardinal directions (Left, Right, Jump, Crouch) accurately', () => {
    expect(computeJoystickState(40, 0, R).bits).toBe(INPUT_BITS.RIGHT);
    expect(computeJoystickState(-40, 0, R).bits).toBe(INPUT_BITS.LEFT);
    expect(computeJoystickState(0, -40, R).bits).toBe(INPUT_BITS.UP);
    expect(computeJoystickState(0, 40, R).bits).toBe(INPUT_BITS.DOWN);
  });

  it('prevents accidental jump or crouch during horizontal thumb drift within ±28°', () => {
    const rad25 = (25 * Math.PI) / 180;
    const dx = 45 * Math.cos(rad25);
    const dy = 45 * Math.sin(rad25);
    expect(computeJoystickState(dx, -dy, R).bits).toBe(INPUT_BITS.RIGHT);
    expect(computeJoystickState(dx, dy, R).bits).toBe(INPUT_BITS.RIGHT);
    expect(computeJoystickState(-dx, -dy, R).bits).toBe(INPUT_BITS.LEFT);
    expect(computeJoystickState(-dx, dy, R).bits).toBe(INPUT_BITS.LEFT);
  });

  it('supports diagonal jump (Up-Left / Up-Right) and diagonal crouch/air-steer (Down-Left / Down-Right)', () => {
    expect(computeJoystickState(35, -35, R).bits).toBe(INPUT_BITS.UP | INPUT_BITS.RIGHT);
    expect(computeJoystickState(-35, -35, R).bits).toBe(INPUT_BITS.UP | INPUT_BITS.LEFT);
    expect(computeJoystickState(35, 35, R).bits).toBe(INPUT_BITS.DOWN | INPUT_BITS.RIGHT);
    expect(computeJoystickState(-35, 35, R).bits).toBe(INPUT_BITS.DOWN | INPUT_BITS.LEFT);
  });

  it('integrates joystick outputs cleanly with 60Hz fighter simulation (walk, crouch, jump, unblockable)', () => {
    let s = makeFightingState();

    // 1. Walk right via joystick
    const rightBits = computeJoystickState(45, 0, R).bits;
    s = step(s, [rightBits, 0]);
    expect(s.fighters[0].action).toBe('walk');
    expect(s.fighters[0].vx).toBeGreaterThan(0);

    // 2. Crouch via joystick down
    const downBits = computeJoystickState(0, 45, R).bits;
    s = step(s, [downBits, 0]);
    expect(s.fighters[0].action).toBe('crouch');

    // 3. Jump via joystick up
    const upBits = computeJoystickState(0, -45, R).bits;
    s = step(s, [upBits, 0]);
    expect(s.fighters[0].action).toBe('jump');
    expect(s.fighters[0].grounded).toBe(false);

    // 4. Dedicated Break button triggers unblockable cleanly on fresh grounded state
    let s2 = makeFightingState();
    s2 = step(s2, [INPUT_BITS.UNBLOCKABLE, 0]);
    expect(s2.fighters[0].action).toBe('attack');
    expect(s2.fighters[0].currentMove).toBe('unblockable');
  });
});
