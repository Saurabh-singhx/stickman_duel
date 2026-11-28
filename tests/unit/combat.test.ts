import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/data/balance';
import { FINISHER_IDS, FINISHERS, selectRandomFinisherId } from '../../src/data/finishers';
import { MOVES } from '../../src/data/moves';
import { BOSS_SPECIALS_BY_CHAR, PLAYER_SPECIAL_DAMAGE, PLAYER_SPECIAL_IDS } from '../../src/data/specials';
import { getBossSpecialHitboxes, spawnBossSpecialById, stepBossSpecials } from '../../src/sim/BossSpecials';
import { getHurtbox, rectsOverlap } from '../../src/sim/Collision';
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

  it('stops an enemy mid-attack/walk as soon as the player starts a special (E)', () => {
    let s = makeFightingState();
    s = {
      ...s,
      fighters: [{ ...s.fighters[0], specialMeter: 100 }, s.fighters[1]],
    };
    // P2 starts a heavy swing on frame 0; P1 activates special on frame 1
    s = step(s, [0, INPUT_BITS.HEAVY]);
    expect(s.fighters[1].action).toBe('attack');
    s = step(s, [INPUT_BITS.SPECIAL, 0]);
    expect(s.fighters[0].action).toBe('special_startup');
    expect(s.fighters[1].action).toBe('idle');
    expect(s.fighters[1].currentMove).toBeNull();
  });

  it('gives all bosses 4 arena/half-arena special attacks that spawn and activate deterministically', () => {
    for (const id of ['swordsman', 'brawler', 'assassin', 'warden', 'vesper', 'raijin'] as const) {
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

  it('orients and spaces fighters cleanly when a finisher starts too close or far apart', () => {
    // 1. Too close / crossed facing when lethal hit lands -> faces each other with >= 90px gap
    let close = makeFightingState();
    close = {
      ...close,
      fighters: [
        { ...close.fighters[0], x: 620_000, facing: -1 },
        { ...close.fighters[1], x: 605_000, facing: -1, hp: 10, guard: 0, action: 'guard_break', stunFrames: 40 },
      ],
    };
    close = step(close, [INPUT_BITS.GRAB, 0]);
    expect(close.phase).toBe('finisher');
    expect(close.fighters[0].facing).toBe(-1);
    expect(close.fighters[1].facing).toBe(1);
    expect(Math.abs(close.fighters[1].x - close.fighters[0].x)).toBeGreaterThanOrEqual(92_000);

    // 2. Far apart -> finisher closes in to strike range cleanly over the opening frames
    let far = makeFightingState();
    far = {
      ...far,
      phase: 'finisher',
      phaseFrame: 0,
      activeFinisherId: 'low_lunge',
      finisherAttacker: 0,
      fighters: [
        { ...far.fighters[0], x: 200_000, facing: 1, action: 'finisher_atk' },
        { ...far.fighters[1], x: 1_040_000, facing: -1, hp: 0, action: 'finisher_vic' },
      ],
    };
    for (let i = 0; i < 18; i += 1) {
      far = step(far, [0, 0]);
    }
    expect(Math.abs(far.fighters[1].x - far.fighters[0].x)).toBeLessThanOrEqual(115_000);
    expect(far.fighters[0].facing).toBe(1);
    expect(far.fighters[1].facing).toBe(-1);
  });

  it('emits ATTACK_SWING at move.startup rather than during windup frames', () => {
    for (const [input, moveId] of [
      [INPUT_BITS.LIGHT, 'light1'],
      [INPUT_BITS.HEAVY, 'heavy'],
      [INPUT_BITS.UNBLOCKABLE, 'unblockable'],
    ] as const) {
      let s = makeFightingState();
      s = {
        ...s,
        fighters: [
          { ...s.fighters[0], x: 300_000 },
          { ...s.fighters[1], x: 900_000 },
        ],
      };
      s = step(s, [input, 0]);
      expect(s.events.some((e) => e.type === 'ATTACK_START' && e.move === moveId)).toBe(true);
      expect(s.events.some((e) => e.type === 'ATTACK_SWING')).toBe(false);

      const startup = MOVES[moveId].startup;
      let swingFrame = -1;
      for (let f = 1; f <= startup + 2; f += 1) {
        s = step(s, [0, 0]);
        if (s.events.some((e) => e.type === 'ATTACK_SWING' && e.move === moveId)) {
          swingFrame = f;
          break;
        }
      }
      expect(swingFrame).toBe(startup);
    }
  });

  it('prevents coffin slab hazards from damaging bosses', () => {
    for (const bossChar of ['warden', 'vesper', 'raijin'] as const) {
      let s = makeFightingState({ stageId: 'ruined_hall', enableHazards: true, p2Char: bossChar });
      const bossMaxHp = s.fighters[1].maxHp;
      s = {
        ...s,
        fighters: [
          { ...s.fighters[0], x: 640_000 },
          { ...s.fighters[1], x: 640_000, hp: bossMaxHp },
        ],
        hazards: [
          {
            id: 1,
            x: 640_000,
            phase: 'telegraph',
            frame: BALANCE.SLAB_TELEGRAPH_FRAMES - 1,
            hitMask: 0,
          },
        ],
      };
      // Frame transitions telegraph -> active; next step tests active hitbox overlap
      s = step(s, [0, 0]);
      s = step(s, [0, 0]);
      expect(s.fighters[0].hp).toBeLessThan(s.fighters[0].maxHp);
      expect(s.fighters[1].hp).toBe(bossMaxHp);
      expect(s.fighters[1].action).not.toBe('hitstun');
    }

    // Stage boss encounters (hazardImmuneSlot: 1) are also immune regardless of character
    let stageBoss = makeFightingState({
      stageId: 'ruined_hall',
      enableHazards: true,
      p2Char: 'swordsman',
      hazardImmuneSlot: 1,
    });
    stageBoss = {
      ...stageBoss,
      fighters: [
        { ...stageBoss.fighters[0], x: 640_000 },
        { ...stageBoss.fighters[1], x: 640_000 },
      ],
      hazards: [{ id: 1, x: 640_000, phase: 'active', frame: 2, hitMask: 0 }],
    };
    stageBoss = step(stageBoss, [0, 0]);
    expect(stageBoss.fighters[0].hp).toBeLessThan(stageBoss.fighters[0].maxHp);
    expect(stageBoss.fighters[1].hp).toBe(stageBoss.fighters[1].maxHp);
  });

  it('gives all 6 bosses distinct character-specific attacks across 16 total varieties', () => {
    const baseShapes = new Set(['ground_wave', 'sky_beams', 'dash_slash', 'shock_nova']);
    const allShapes = new Set<string>();
    const signatureOwners = new Map<string, string>();
    for (const bossId of ['vesper', 'raijin', 'swordsman', 'brawler', 'assassin', 'warden'] as const) {
      const kit = BOSS_SPECIALS_BY_CHAR[bossId];
      expect(kit).toHaveLength(4);
      let sigCount = 0;
      for (const spec of kit) {
        allShapes.add(spec.shape);
        if (!baseShapes.has(spec.shape)) {
          sigCount += 1;
          expect(signatureOwners.has(spec.shape)).toBe(false);
          signatureOwners.set(spec.shape, bossId);
        }
      }
      expect(sigCount).toBeGreaterThanOrEqual(2);
    }
    expect(allShapes.size).toBe(16);
  });

  it('matches boss attack hitboxes to visual strike zones so visually clear positions take no phantom damage', () => {
    const floorY = BALANCE.FLOOR_Y_PX * BALANCE.FP_SCALE;

    // 1. Multi-column specials (e.g. falling_coffins & rock_monoliths): safe between pillars/coffins, hits inside
    const base = makeFightingState({ p2Char: 'warden' });
    const warden = { ...base.fighters[1], x: 1_040_000, facing: -1 as const };
    const coffinBuilt = spawnBossSpecialById(warden, 'warden_coffin_barrage', 1)!;
    const activeCoffin = { ...coffinBuilt.special, phase: 'active' as const, frame: 2 };
    const coffinW = activeCoffin.right - activeCoffin.left;
    const coffinCenter0 = activeCoffin.left + Math.trunc((0.5 * coffinW) / 3);
    const gapBetweenCoffins = activeCoffin.left + Math.trunc(coffinW / 3);
    const coffinBoxes = getBossSpecialHitboxes(activeCoffin, warden.x);

    const safeInGap = getHurtbox({ ...base.fighters[0], x: gapBetweenCoffins, y: floorY });
    const hitInCoffin = getHurtbox({ ...base.fighters[0], x: coffinCenter0, y: floorY });
    expect(coffinBoxes.some((b) => rectsOverlap(b, safeInGap))).toBe(false);
    expect(coffinBoxes.some((b) => rectsOverlap(b, hitInCoffin))).toBe(true);

    // 2. Inverted tornado cone (tempest_vortex): safe standing outside narrow bottom base, hits near center
    const raijin = { ...base.fighters[1], charId: 'raijin' as const, x: 900_000, facing: -1 as const };
    const vortex = { ...spawnBossSpecialById(raijin, 'raijin_maelstrom', 2)!.special, phase: 'active' as const, frame: 2 };
    const vortexMid = Math.trunc((vortex.left + vortex.right) / 2);
    const vortexBoxes = getBossSpecialHitboxes(vortex, raijin.x);
    expect(vortexBoxes.some((b) => rectsOverlap(b, getHurtbox({ ...base.fighters[0], x: vortex.left + 35_000, y: floorY })))).toBe(false);
    expect(vortexBoxes.some((b) => rectsOverlap(b, getHurtbox({ ...base.fighters[0], x: vortexMid, y: floorY })))).toBe(true);

    // 3. Chest-height dash_slash (vesper_sever): crouching ducks cleanly underneath, standing gets hit
    const vesper = { ...base.fighters[1], charId: 'vesper' as const, x: 900_000, facing: -1 as const };
    const dashSlash = { ...spawnBossSpecialById(vesper, 'vesper_sever', 3)!.special, phase: 'active' as const, frame: 1 };
    const dashResCrouch = stepBossSpecials([dashSlash], [{ ...base.fighters[0], x: 500_000, y: floorY, action: 'crouch' }, vesper], false);
    expect(dashResCrouch.fighters[0].hp).toBe(base.fighters[0].maxHp);
    const dashResStand = stepBossSpecials([dashSlash], [{ ...base.fighters[0], x: 500_000, y: floorY, action: 'idle' }, vesper], false);
    expect(dashResStand.fighters[0].hp).toBeLessThan(base.fighters[0].maxHp);

    // 4. Rising floor shock/boulder rupture: jumping high clears it cleanly
    const brute = { ...base.fighters[1], charId: 'brawler' as const, x: 900_000, facing: -1 as const };
    const quake = { ...spawnBossSpecialById(brute, 'brute_quake_slam', 4)!.special, phase: 'active' as const, frame: 1 };
    const jumpRes = stepBossSpecials([quake], [{ ...base.fighters[0], x: 500_000, y: floorY - 65_000, grounded: false }, brute], false);
    expect(jumpRes.fighters[0].hp).toBe(base.fighters[0].maxHp);

    // 5. Shadow clones (assassin_blink_ambush): gaps between mirage clones deal no damage
    const assassin = { ...base.fighters[1], charId: 'assassin' as const, x: 900_000, facing: -1 as const };
    const mirage = { ...spawnBossSpecialById(assassin, 'assassin_blink_ambush', 5)!.special, phase: 'active' as const, frame: 1 };
    const mW = mirage.right - mirage.left;
    const gapBetweenClones = mirage.left + Math.trunc(mW * 0.35);
    const mirageGapRes = stepBossSpecials([mirage], [{ ...base.fighters[0], x: gapBetweenClones, y: floorY }, assassin], false);
    expect(mirageGapRes.fighters[0].hp).toBe(base.fighters[0].maxHp);
  });
});
