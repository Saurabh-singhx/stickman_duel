import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { FINISHER_IDS, FINISHERS, selectRandomFinisherId } from '../../src/data/finishers';
import { BOSS_SPECIALS_BY_CHAR, PLAYER_SPECIAL_DAMAGE, PLAYER_SPECIAL_IDS } from '../../src/data/specials';
import { isDodgeInvincible } from '../../src/sim/Fighter';
import { createInitialState, step } from '../../src/sim/Sim';
import { INPUT_BITS, type GameState, type MatchConfig } from '../../src/sim/State';

function makeFightingState(overrides: Partial<MatchConfig> = {}): GameState {
  const cfg: MatchConfig = {
    seed: 77,
    stageId: 'beige_plain',
    p1Char: 'hero',
    p2Char: 'swordsman',
    roundsToWin: 2,
    roundTimerFrames: 5940,
    enableHazards: false,
    parryAssist: false,
    infiniteGuardP2: false,
    trainingMode: false,
    ...overrides,
  };
  let state = createInitialState(cfg);
  // Advance past intro freeze and place fighters in striking distance
  for (let i = 0; i < BALANCE.ROUND_START_FREEZE_FRAMES + 2; i += 1) {
    state = step(state, [0, 0]);
  }
  return {
    ...state,
    fighters: [
      { ...state.fighters[0], x: 580_000, facing: 1 },
      { ...state.fighters[1], x: 655_000, facing: -1 },
    ],
  };
}

describe('Combat Rules & Frame Data', () => {
  it('rearms parry immediately after releasing an expired held guard', () => {
    let s = makeFightingState();
    for (let i = 0; i < 14; i++) s = step(s, [INPUT_BITS.BLOCK, 0]);
    expect(s.fighters[0].action).toBe('block');
    s = step(s, [0, 0]);
    s = step(s, [INPUT_BITS.BLOCK, 0]);
    expect(s.fighters[0].action).toBe('parry_active');
    expect(s.fighters[0].actionFrame).toBe(0);
  });

  it('accepts a fresh parry after release and repress during successful-parry hitstop', () => {
    let s = makeFightingState();
    for (let f = 0; f < 30; f++) {
      s = step(s, [f === 0 ? INPUT_BITS.HEAVY : 0, f >= 18 ? INPUT_BITS.BLOCK : 0]);
      if (s.events.some(e => e.type === 'PARRY')) break;
    }
    expect(s.hitstopFrames).toBe(BALANCE.PARRY_HITSTOP_FRAMES);
    s = step(s, [0, 0]);
    while (s.hitstopFrames > 0) s = step(s, [0, INPUT_BITS.BLOCK]);
    s = step(s, [0, INPUT_BITS.BLOCK]);
    expect(s.fighters[1].action).toBe('parry_active');
    expect(s.fighters[1].parryCooldown).toBe(0);
  });

  it('does not automatically rearm parry when block is held through hitstop', () => {
    let s = makeFightingState();
    s = { ...s, hitstopFrames: 2, fighters: [
      { ...s.fighters[0], action: 'idle', prevInput: INPUT_BITS.BLOCK }, s.fighters[1],
    ] };
    for (let i = 0; i < 3; i++) s = step(s, [INPUT_BITS.BLOCK, 0]);
    expect(s.fighters[0].action).toBe('block');
  });

  it('adds four late dodge invulnerability frames while retaining vulnerable recovery', () => {
    const f = makeFightingState().fighters[0];
    for (let frame = 0; frame <= 26; frame++) {
      expect(isDodgeInvincible({ ...f, action: 'dodge', actionFrame: frame }))
        .toBe(frame >= 4 && frame <= 21);
    }
    expect(BALANCE.PERFECT_DODGE_WINDOW).toBe(6);
  });

  it('enforces an exact 12-frame default parry window (frames 0..11 parry, frame 12 blocks)', () => {
    const testParryDelay = (blockStartFrame: number): 'parry' | 'block' | 'hit' => {
      let s = makeFightingState();
      // Heavy slash startup = 24 (active on loop frame f = 24)
      for (let f = 0; f < 34; f += 1) {
        const p1In = f === 0 ? INPUT_BITS.HEAVY : 0;
        const p2In = f >= blockStartFrame ? INPUT_BITS.BLOCK : 0;
        s = step(s, [p1In, p2In]);
        if (s.events.some((e) => e.type === 'PARRY')) return 'parry';
        if (s.events.some((e) => e.type === 'BLOCK')) return 'block';
        if (s.events.some((e) => e.type === 'HIT')) return 'hit';
      }
      return 'hit';
    };

    const parryFrames: number[] = [];
    for (let start = 11; start <= 25; start += 1) {
      const outcome = testParryDelay(start);
      if (outcome === 'parry') parryFrames.push(start);
    }

    expect(BALANCE.PARRY_WINDOW_FRAMES).toBe(12);
    expect(parryFrames.length).toBe(12);
    expect(testParryDelay(12)).toBe('block');
    expect(testParryDelay(13)).toBe('parry');
    expect(testParryDelay(24)).toBe('parry');
    expect(testParryDelay(25)).toBe('hit');
  });

  it('chains continuous light clicks through 4 full animations without mid-swing canceling, with Jump Sword on light3', () => {
    let s = makeFightingState();
    const seenMoves = new Set<string>();
    let sawCooldown = false;
    let light3Jumped = false;

    for (let f = 0; f < 220; f += 1) {
      const p1In = f % 4 === 0 ? INPUT_BITS.LIGHT : 0;
      s = step(s, [p1In, 0]);
      if (s.fighters[0].currentMove) {
        seenMoves.add(s.fighters[0].currentMove);
        // Verify light1 never cancels mid-swing (must stay light1 through frame 31)
        if (f === 15) expect(s.fighters[0].currentMove).toBe('light1');
        if (s.fighters[0].currentMove === 'light3' && !s.fighters[0].grounded) {
          light3Jumped = true;
        }
      }
      if (s.fighters[0].lightChainCooldown > 0) sawCooldown = true;
    }

    expect(seenMoves.has('light1')).toBe(true);
    expect(seenMoves.has('light2')).toBe(true);
    expect(seenMoves.has('light3')).toBe(true);
    expect(seenMoves.has('light4')).toBe(true);
    expect(light3Jumped).toBe(true);
    expect(sawCooldown).toBe(true);
  });

  it('provides 10 randomly selectable cinematic finishers including 6.5s Tempest Thunder storm', () => {
    expect(FINISHER_IDS.length).toBe(10);
    expect(FINISHERS.tempest_thunder.durationFrames).toBe(390);
    expect(FINISHERS.tempest_thunder.nightStormBackdrop).toBe(true);
    const chosen = new Set(Array.from({ length: 10 }, (_, i) => selectRandomFinisherId(i)));
    expect(chosen.size).toBe(10);
  });

  it('punishes whiffed parry tap with 20 frames of parry_whiff recovery', () => {
    let s = makeFightingState();
    s = step(s, [INPUT_BITS.BLOCK, 0]);
    expect(s.fighters[0].action).toBe('parry_active');
    s = step(s, [0, 0]);
    expect(s.fighters[0].action).toBe('parry_whiff');
    expect(s.fighters[0].stunFrames).toBe(BALANCE.PARRY_WHIFF_RECOVERY_FRAMES);
  });

  it('triggers perfect dodge slow-motion and counter window on last-moment dodge', () => {
    let s = makeFightingState();
    let perfectTriggered = false;
    for (let f = 0; f < 32; f += 1) {
      const p1In = f === 0 ? INPUT_BITS.HEAVY : 0;
      const p2In = f === 21 ? INPUT_BITS.DODGE | INPUT_BITS.LEFT : 0;
      s = step(s, [p1In, p2In]);
      if (s.events.some((e) => e.type === 'PERFECT_DODGE')) {
        perfectTriggered = true;
        break;
      }
    }
    expect(perfectTriggered).toBe(true);
    expect(s.fighters[0].slowFrames).toBe(BALANCE.PERFECT_DODGE_SLOW_FRAMES);
    expect(s.fighters[1].counterWindow).toBe(BALANCE.COUNTER_WINDOW_FRAMES);
  });

  it('triggers 60-frame guard break stun when guard meter reaches 0', () => {
    let s = makeFightingState();
    s = {
      ...s,
      fighters: [s.fighters[0], { ...s.fighters[1], guard: 20 }],
    };
    let guardBroken = false;
    for (let f = 0; f < 40; f += 1) {
      // P2 holds block early so 12f parry window expires into normal block before heavy lands
      const p1In = f === 6 ? INPUT_BITS.HEAVY : 0;
      const p2In = INPUT_BITS.BLOCK;
      s = step(s, [p1In, p2In]);
      if (s.events.some((e) => e.type === 'GUARD_BREAK')) {
        guardBroken = true;
        break;
      }
    }
    expect(guardBroken).toBe(true);
    expect(s.fighters[1].action).toBe('guard_break');
    expect(s.fighters[1].stunFrames).toBe(BALANCE.GUARD_BREAK_STUN_FRAMES);
  });

  it('prevents unblockable red-flash attacks from being blocked or parried', () => {
    let s = makeFightingState();
    const startHp = s.fighters[1].hp;
    let hitLanded = false;
    for (let f = 0; f < 42; f += 1) {
      const p1In = f === 0 ? INPUT_BITS.UNBLOCKABLE : 0;
      const p2In = f >= 28 ? INPUT_BITS.BLOCK : 0; // Right in parry window!
      s = step(s, [p1In, p2In]);
      if (s.events.some((e) => e.type === 'HIT')) {
        hitLanded = true;
        break;
      }
    }
    expect(hitLanded).toBe(true);
    expect(s.fighters[1].hp).toBeLessThan(startHp);
  });

  it('allows grab to beat block while losing to jump', () => {
    // Grab beats block
    let s1 = makeFightingState();
    s1 = {
      ...s1,
      fighters: [
        { ...s1.fighters[0], x: 600_000 },
        { ...s1.fighters[1], x: 650_000 },
      ],
    };
    let grabHit = false;
    for (let f = 0; f < 30; f += 1) {
      const p1In = f === 4 ? INPUT_BITS.GRAB : 0;
      s1 = step(s1, [p1In, INPUT_BITS.BLOCK]);
      if (s1.events.some((e) => e.type === 'HIT' && e.move === 'grab')) {
        grabHit = true;
        break;
      }
    }
    expect(grabHit).toBe(true);

    // Grab loses to jump
    let s2 = makeFightingState();
    s2 = {
      ...s2,
      fighters: [
        { ...s2.fighters[0], x: 600_000 },
        { ...s2.fighters[1], x: 650_000 },
      ],
    };
    let grabHitAir = false;
    for (let f = 0; f < 30; f += 1) {
      const p1In = f === 2 ? INPUT_BITS.GRAB : 0;
      const p2In = f === 10 ? INPUT_BITS.UP : 0;
      s2 = step(s2, [p1In, p2In]);
      if (s2.events.some((e) => e.type === 'HIT' && e.move === 'grab')) {
        grabHitAir = true;
      }
    }
    expect(grabHitAir).toBe(false);
  });

  it('recharges player special meter ONLY from parry and perfect dodge, never from normal hits', () => {
    let s = makeFightingState();
    // Landing a normal light hit must NOT grant special meter
    for (let f = 0; f < 20; f += 1) {
      s = step(s, [f === 0 ? INPUT_BITS.LIGHT : 0, 0]);
    }
    expect(s.fighters[0].specialMeter).toBe(0);

    // Performing a parry MUST grant SPECIAL_GAIN_ON_PARRY (+34)
    let sp = makeFightingState();
    for (let f = 0; f < 30; f += 1) {
      sp = step(sp, [f === 0 ? INPUT_BITS.HEAVY : 0, f >= 18 ? INPUT_BITS.BLOCK : 0]);
      if (sp.events.some((e) => e.type === 'PARRY')) break;
    }
    expect(sp.fighters[1].specialMeter).toBe(BALANCE.SPECIAL_GAIN_ON_PARRY);
  });

  it('connects player special (E) 100% from across the arena, deals uniform 34 dmg, knocks down, and makes get-up invulnerable', () => {
    expect(PLAYER_SPECIAL_IDS.length).toBe(5);
    let s = makeFightingState();
    // Place fighters at opposite ends of the arena with P1 at 100% special meter
    s = {
      ...s,
      fighters: [
        { ...s.fighters[0], x: 220_000, specialMeter: 100 },
        { ...s.fighters[1], x: 1_040_000, hp: 100 },
      ],
    };

    let enteredSpecial = false;
    let enteredKnockdown = false;
    let enteredGetup = false;

    for (let f = 0; f < 260; f += 1) {
      const p1In = f === 0 ? INPUT_BITS.SPECIAL : enteredKnockdown || enteredGetup ? INPUT_BITS.HEAVY : 0;
      s = step(s, [p1In, 0]);
      if (s.phase === 'special') enteredSpecial = true;
      if (s.fighters[1].action === 'knockdown') enteredKnockdown = true;
      if (s.fighters[1].action === 'getup') {
        enteredGetup = true;
        // Move P1 right next to P2 and swing during get-up: must deal ZERO damage!
        s = { ...s, fighters: [{ ...s.fighters[0], x: s.fighters[1].x - 45_000 }, s.fighters[1]] };
      }
      if (enteredGetup && s.fighters[1].action === 'idle') break;
    }

    expect(enteredSpecial).toBe(true);
    expect(enteredKnockdown).toBe(true);
    expect(enteredGetup).toBe(true);
    expect(s.fighters[1].hp).toBe(100 - PLAYER_SPECIAL_DAMAGE);
  });

  it('allows player special (E) to be denied by a timed parry', () => {
    let s = makeFightingState();
    s = {
      ...s,
      fighters: [{ ...s.fighters[0], specialMeter: 100 }, s.fighters[1]],
    };
    let denied = false;
    for (let f = 0; f < 24; f += 1) {
      const p1In = f === 0 ? INPUT_BITS.SPECIAL : 0;
      const p2In = f >= 10 ? INPUT_BITS.BLOCK : 0; // Active parry at frame 16
      s = step(s, [p1In, p2In]);
      if (s.events.some((e) => e.type === 'PLAYER_SPECIAL_DENIED' && e.reason === 'parry')) {
        denied = true;
        break;
      }
    }
    expect(denied).toBe(true);
    expect(s.phase).toBe('fighting');
    expect(s.fighters[1].hp).toBe(100);
  });

  it('gives all 4 bosses 4 arena/half-arena special attacks that spawn and activate deterministically', () => {
    for (const id of ['swordsman', 'brawler', 'assassin', 'warden'] as const) {
      expect(BOSS_SPECIALS_BY_CHAR[id].length).toBe(4);
    }
    let s = makeFightingState({ p2Char: 'warden' });
    s = { ...s, fighters: [s.fighters[0], { ...s.fighters[1], bossSpecialCooldown: 0 }] };
    let sawTelegraph = false;
    let sawActive = false;
    for (let f = 0; f < 50; f += 1) {
      s = step(s, [0, f === 0 ? INPUT_BITS.BOSS_SPECIAL : 0]);
      if (s.events.some((e) => e.type === 'BOSS_SPECIAL_TELEGRAPH')) sawTelegraph = true;
      if (s.events.some((e) => e.type === 'BOSS_SPECIAL_ACTIVE')) sawActive = true;
    }
    expect(sawTelegraph).toBe(true);
    expect(sawActive).toBe(true);
  });
});
