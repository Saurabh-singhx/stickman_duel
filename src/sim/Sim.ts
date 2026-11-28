import { BALANCE } from '../data/balance';
import { CHARACTERS } from '../data/characters';
import { FINISHERS, selectRandomFinisherId } from '../data/finishers';
import { MOVES } from '../data/moves';
import { PLAYER_SPECIALS, selectPlayerSpecialId } from '../data/specials';
import { spawnBossSpecial, stepBossSpecials } from './BossSpecials';
import { getAttackHitbox, getHurtbox, getSlabHitbox, rectsOverlap, resolvePushboxes } from './Collision';
import { createFighter, isDodgeInvincible, isPerfectDodgeWindow, isWakeupInvincible, stepFighter } from './Fighter';
import { absInt, clampInt, scalePercent } from './Fixed';
import { stepHazards } from './Hazards';
import { nextU32, normalizeSeed } from './Rng';
import {
  INPUT_BITS,
  type FighterSlot,
  type FighterState,
  type FighterStats,
  type GameState,
  type HazardSlab,
  type InputBitfield,
  type MatchConfig,
  type SimEvent,
} from './State';

function orientFinisherPair(
  atk: FighterState,
  vic: FighterState,
): { atk: FighterState; vic: FighterState } {
  const floorY = BALANCE.FLOOR_Y_PX * BALANCE.FP_SCALE;
  const minX = (BALANCE.STAGE_LEFT_PX + 24) * BALANCE.FP_SCALE;
  const maxX = (BALANCE.STAGE_RIGHT_PX - 24) * BALANCE.FP_SCALE;
  const atkFacing: 1 | -1 = atk.x < vic.x ? 1 : atk.x > vic.x ? -1 : atk.facing;
  const vicFacing: 1 | -1 = atkFacing === 1 ? -1 : 1;

  // Ensure a clean minimum melee gap so overlapping/too-close fighters never cross or tangle
  const minGap = 96_000;
  let atkX = atk.x;
  let vicX = vic.x;
  if (absInt(vicX - atkX) < minGap) {
    const desiredAtkX = vicX - atkFacing * minGap;
    if (desiredAtkX >= minX && desiredAtkX <= maxX) {
      atkX = desiredAtkX;
    } else {
      vicX = clampInt(atkX + atkFacing * minGap, minX, maxX);
      atkX = clampInt(vicX - atkFacing * minGap, minX, maxX);
    }
  }

  return {
    atk: {
      ...atk,
      x: atkX,
      y: floorY,
      vx: 0,
      vy: 0,
      grounded: true,
      facing: atkFacing,
      action: 'finisher_atk',
      actionFrame: 0,
      currentMove: null,
    },
    vic: {
      ...vic,
      x: vicX,
      y: floorY,
      vx: 0,
      vy: 0,
      grounded: true,
      hp: 0,
      facing: vicFacing,
      action: 'finisher_vic',
      actionFrame: 0,
      currentMove: null,
    },
  };
}

function createEmptyStats(): FighterStats {
  return {
    damageDealt: 0,
    hitsLanded: 0,
    parries: 0,
    perfectDodges: 0,
    guardBreaks: 0,
    finishers: 0,
    maxCombo: 0,
  };
}

/**
 * Creates a brand-new deterministic GameState for a match.
 */
export function createInitialState(config: MatchConfig): GameState {
  const f0Base = createFighter(0, config.p1Char);
  const f0 = config.trainingMode ? { ...f0Base, specialMeter: BALANCE.MAX_SPECIAL_METER } : f0Base;
  const f1 = createFighter(1, config.p2Char);
  return {
    frame: 0,
    round: 1,
    phase: config.trainingMode ? 'fighting' : 'intro',
    phaseFrame: 0,
    roundTimer: config.roundTimerFrames,
    hitstopFrames: 0,
    rngState: normalizeSeed(config.seed),
    config,
    fighters: [f0, f1],
    scores: [0, 0],
    stats: [createEmptyStats(), createEmptyStats()],
    hazards: [],
    hazardTimer: Math.trunc(BALANCE.SLAB_INTERVAL_FRAMES / 2),
    nextHazardId: 1,
    bossSpecials: [],
    nextBossSpecialId: 1,
    activeSpecial: null,
    activeFinisherId: null,
    finisherAttacker: null,
    winner: null,
    events: config.trainingMode ? [] : [{ type: 'ROUND_START', round: 1 }],
  };
}

function resetForNextRound(state: GameState): GameState {
  const nextRound = state.round + 1;
  return {
    ...state,
    round: nextRound,
    phase: 'intro',
    phaseFrame: 0,
    roundTimer: state.config.roundTimerFrames,
    hitstopFrames: 0,
    fighters: [
      createFighter(0, state.config.p1Char),
      createFighter(1, state.config.p2Char),
    ],
    hazards: [],
    hazardTimer: Math.trunc(BALANCE.SLAB_INTERVAL_FRAMES / 2),
    bossSpecials: [],
    activeSpecial: null,
    activeFinisherId: null,
    finisherAttacker: null,
    events: [{ type: 'ROUND_START', round: nextRound }],
  };
}

/**
 * Pure 60 Hz simulation step: (state, [inputP1, inputP2]) -> nextState.
 * Never mutates the input state; produces deterministic outputs and typed SimEvents.
 */
export function step(
  state: GameState,
  inputs: readonly [InputBitfield, InputBitfield],
): GameState {
  if (state.phase === 'match_end') {
    return { ...state, frame: state.frame + 1, events: [] };
  }

  const events: SimEvent[] = [];
  const nextFrame = state.frame + 1;

  // Hitstop freezes both fighters deterministically
  if (state.hitstopFrames > 0) {
    return {
      ...state,
      frame: nextFrame,
      hitstopFrames: state.hitstopFrames - 1,
      // Remember block releases during impact freeze so a re-press is a fresh edge.
      // Do not consume presses: they must still be seen on the first unfrozen frame.
      fighters: [
        { ...state.fighters[0], prevInput: state.fighters[0].prevInput & (inputs[0] | ~INPUT_BITS.BLOCK) },
        { ...state.fighters[1], prevInput: state.fighters[1].prevInput & (inputs[1] | ~INPUT_BITS.BLOCK) },
      ],
      events: [],
    };
  }

  // Round intro countdown
  if (state.phase === 'intro') {
    const nextPhaseFrame = state.phaseFrame + 1;
    if (nextPhaseFrame >= BALANCE.ROUND_START_FREEZE_FRAMES) {
      return { ...state, frame: nextFrame, phase: 'fighting', phaseFrame: 0, events: [] };
    }
    return { ...state, frame: nextFrame, phaseFrame: nextPhaseFrame, events: [] };
  }

  // Player cinematic special power phase (guaranteed 34 dmg -> knockdown + invulnerable get-up, or lethal finisher)
  if (state.phase === 'special' && state.activeSpecial !== null) {
    const sp = state.activeSpecial;
    const spec = PLAYER_SPECIALS[sp.specialId];
    const nextSpFrame = sp.frame + 1;
    const atkSlot = sp.attacker;
    const vicSlot = sp.victim;
    let f0 = { ...state.fighters[0], actionFrame: state.fighters[0].actionFrame + 1 };
    let f1 = { ...state.fighters[1], actionFrame: state.fighters[1].actionFrame + 1 };
    const stats: [FighterStats, FighterStats] = [{ ...state.stats[0] }, { ...state.stats[1] }];

    const floorY = BALANCE.FLOOR_Y_PX * BALANCE.FP_SCALE;
    const minX = (BALANCE.STAGE_LEFT_PX + 24) * BALANCE.FP_SCALE;
    const maxX = (BALANCE.STAGE_RIGHT_PX - 24) * BALANCE.FP_SCALE;

    // Empty-Hand Breaker: attacker leaps to enemy (f 28..56) and launches enemy across arena (f 56..94)
    if (sp.specialId === 'unarmed_launch') {
      const atk = atkSlot === 0 ? f0 : f1;
      const vic = vicSlot === 0 ? f0 : f1;
      const originX = sp.originX ?? atk.x;
      const targetStartX = sp.targetX ?? vic.x;
      const strikeX = clampInt(targetStartX - atk.facing * 54_000, minX, maxX);
      const launchedX = atk.facing === 1 ? maxX : minX;

      let nextAtk = atk;
      let nextVic = vic;
      if (nextSpFrame >= 28 && nextSpFrame <= spec.impactFrame) {
        const u = (nextSpFrame - 28) / (spec.impactFrame - 28);
        const ax = Math.round(originX + (strikeX - originX) * u);
        const ay = floorY - Math.round(Math.sin(Math.PI * u) * 125_000);
        nextAtk = { ...atk, x: ax, y: ay, grounded: nextSpFrame === spec.impactFrame };
      } else if (nextSpFrame > spec.impactFrame) {
        nextAtk = { ...atk, x: strikeX, y: floorY, grounded: true };
      }

      if (nextSpFrame > spec.impactFrame && nextSpFrame <= 94) {
        const u = (nextSpFrame - spec.impactFrame) / (94 - spec.impactFrame);
        const easeOut = 1 - (1 - u) * (1 - u);
        const vx = Math.round(targetStartX + (launchedX - targetStartX) * easeOut);
        const vy = floorY - Math.round(Math.sin(Math.PI * u) * 115_000);
        nextVic = { ...vic, x: vx, y: vy, grounded: nextSpFrame === 94 };
      } else if (nextSpFrame > 94) {
        nextVic = { ...vic, x: launchedX, y: floorY, grounded: true, vx: 0 };
      }

      if (atkSlot === 0) {
        f0 = nextAtk;
        f1 = nextVic;
      } else {
        f1 = nextAtk;
        f0 = nextVic;
      }
    }

    const beatIndex = spec.beatFrames.indexOf(nextSpFrame);
    if (beatIndex !== -1) {
      const vic = vicSlot === 0 ? f0 : f1;
      events.push({
        type: 'PLAYER_SPECIAL_BEAT',
        attacker: atkSlot,
        victim: vicSlot,
        specialId: sp.specialId,
        beatIndex,
        x: vic.x,
        y: vic.y,
      });
    }

    if (nextSpFrame === spec.impactFrame) {
      const vic = vicSlot === 0 ? f0 : f1;
      const atk = atkSlot === 0 ? f0 : f1;
      const nextHp = state.config.trainingMode
        ? clampInt(vic.hp - spec.damage, 1, vic.maxHp)
        : clampInt(vic.hp - spec.damage, 0, vic.maxHp);
      stats[atkSlot] = {
        ...stats[atkSlot],
        damageDealt: stats[atkSlot].damageDealt + spec.damage,
        hitsLanded: stats[atkSlot].hitsLanded + 1,
      };
      const updatedVic: FighterState = {
        ...vic,
        hp: nextHp,
        vx: spec.launchToEdge ? atk.facing * 6_000 : 0,
      };
      if (vicSlot === 0) f0 = updatedVic;
      else f1 = updatedVic;

      events.push({
        type: 'PLAYER_SPECIAL_IMPACT',
        attacker: atkSlot,
        victim: vicSlot,
        specialId: sp.specialId,
        x: updatedVic.x,
        y: updatedVic.y,
      });
    }

    if (nextSpFrame >= spec.cinematicFrames) {
      const vic = vicSlot === 0 ? f0 : f1;
      // Edge case: lethal special triggers finisher/KO cleanly instead of get-up animation
      if (!state.config.trainingMode && vic.hp <= 0) {
        const finRoll = nextU32((state.rngState ^ (nextFrame * 2654435761) ^ f0.x ^ f1.x) >>> 0);
        const finisherId = selectRandomFinisherId(finRoll.value);
        stats[atkSlot] = { ...stats[atkSlot], finishers: stats[atkSlot].finishers + 1 };
        events.push({
          type: 'FINISHER_START',
          attacker: atkSlot,
          victim: vicSlot,
          finisherId,
          x: vic.x,
          y: vic.y,
        });
        const pair = orientFinisherPair(atkSlot === 0 ? f0 : f1, atkSlot === 0 ? f1 : f0);
        return {
          ...state,
          frame: nextFrame,
          phase: 'finisher',
          phaseFrame: 0,
          hitstopFrames: BALANCE.KO_HITSTOP_FRAMES,
          rngState: finRoll.nextState,
          fighters: atkSlot === 0 ? [pair.atk, pair.vic] : [pair.vic, pair.atk],
          stats,
          bossSpecials: [],
          activeSpecial: null,
          activeFinisherId: finisherId,
          finisherAttacker: atkSlot,
          events,
        };
      }

      // Knock down victim -> transitions into invulnerable get-up animation!
      events.push({ type: 'KNOCKDOWN', victim: vicSlot, x: vic.x, y: vic.y });
      const nextF0: FighterState =
        vicSlot === 0
          ? { ...f0, action: 'knockdown', actionFrame: 0, currentMove: null, vx: 0 }
          : { ...f0, action: 'idle', actionFrame: 0, currentMove: null, vx: 0 };
      const nextF1: FighterState =
        vicSlot === 1
          ? { ...f1, action: 'knockdown', actionFrame: 0, currentMove: null, vx: 0 }
          : { ...f1, action: 'idle', actionFrame: 0, currentMove: null, vx: 0 };
      return {
        ...state,
        frame: nextFrame,
        phase: 'fighting',
        phaseFrame: 0,
        fighters: [nextF0, nextF1],
        stats,
        activeSpecial: null,
        events,
      };
    }

    return {
      ...state,
      frame: nextFrame,
      fighters: [f0, f1],
      stats,
      activeSpecial: { ...sp, frame: nextSpFrame },
      events,
    };
  }

  // Cinematic finisher phase (outcome already decided)
  if (state.phase === 'finisher' && state.activeFinisherId !== null && state.finisherAttacker !== null) {
    const spec = FINISHERS[state.activeFinisherId];
    const nextPhaseFrame = state.phaseFrame + 1;
    const atkSlot = state.finisherAttacker;
    const vicSlot: FighterSlot = atkSlot === 0 ? 1 : 0;
    let f0 = { ...state.fighters[0], actionFrame: state.fighters[0].actionFrame + 1 };
    let f1 = { ...state.fighters[1], actionFrame: state.fighters[1].actionFrame + 1 };

    // Keep finisher pair facing each other and dash into melee execution range if triggered from afar
    const rawAtk = atkSlot === 0 ? f0 : f1;
    const rawVic = vicSlot === 0 ? f0 : f1;
    const finId = state.activeFinisherId;
    const lockEclipseFacing = finId === 'eclipse_iaijutsu' && nextPhaseFrame >= 38;
    const atkFacing: 1 | -1 = lockEclipseFacing
      ? rawAtk.facing
      : rawAtk.x < rawVic.x
        ? 1
        : rawAtk.x > rawVic.x
          ? -1
          : rawAtk.facing;
    const vicFacing: 1 | -1 = lockEclipseFacing ? rawVic.facing : atkFacing === 1 ? -1 : 1;
    const floorY = BALANCE.FLOOR_Y_PX * BALANCE.FP_SCALE;
    const minX = (BALANCE.STAGE_LEFT_PX + 24) * BALANCE.FP_SCALE;
    const maxX = (BALANCE.STAGE_RIGHT_PX - 24) * BALANCE.FP_SCALE;
    const idealAtkX = clampInt(rawVic.x - atkFacing * 104_000, minX, maxX);
    const gap = absInt(rawVic.x - rawAtk.x);
    let nextAtkX = rawAtk.x;
    if (!lockEclipseFacing && finId !== 'phantom_flurry') {
      if (gap > 114_000 && nextPhaseFrame <= 16) {
        const rem = Math.max(1, 17 - nextPhaseFrame);
        nextAtkX = rawAtk.x + Math.round((idealAtkX - rawAtk.x) / rem);
      } else if (gap < 92_000 && finId !== 'tempest_thunder' && finId !== 'sepulcher_split') {
        nextAtkX = clampInt(rawVic.x - atkFacing * 96_000, minX, maxX);
      }
    }
    if (atkSlot === 0) {
      f0 = { ...f0, x: nextAtkX, facing: atkFacing };
      f1 = { ...f1, facing: vicFacing };
    } else {
      f1 = { ...f1, x: nextAtkX, facing: atkFacing };
      f0 = { ...f0, facing: vicFacing };
    }

    // Bespoke spatial choreography per finisher
    let atk = atkSlot === 0 ? f0 : f1;
    let vic = vicSlot === 0 ? f0 : f1;

    if (finId === 'rising_slash') {
      // Heavenward Sever (DMC High Time): rising uppercut leap + skyward victim launch
      if (nextPhaseFrame >= 24 && nextPhaseFrame <= 48) {
        const u = (nextPhaseFrame - 24) / 24;
        atk = {
          ...atk,
          y: floorY - Math.round(Math.sin(Math.PI * u) * 78_000),
          grounded: nextPhaseFrame === 48,
        };
      } else {
        atk = { ...atk, y: floorY, grounded: true };
      }

      if (nextPhaseFrame >= spec.impactFrame && nextPhaseFrame <= 58) {
        const u = (nextPhaseFrame - spec.impactFrame) / (58 - spec.impactFrame);
        const vy = floorY - Math.round(Math.sin(Math.PI * u) * 175_000);
        const drift = nextPhaseFrame === spec.impactFrame ? atk.facing * 1_500 : 0;
        vic = {
          ...vic,
          x: clampInt(vic.x + drift, minX, maxX),
          y: vy,
          grounded: nextPhaseFrame === 58,
        };
      } else {
        vic = { ...vic, y: floorY, grounded: true };
      }
    } else if (finId === 'spin_cut') {
      // Crescent Tempest: whirling aerial spiral close to the victim
      if (nextPhaseFrame >= 12 && nextPhaseFrame <= 48) {
        const u = (nextPhaseFrame - 12) / 36;
        atk = {
          ...atk,
          y: floorY - Math.round(Math.sin(Math.PI * u) * 56_000),
          grounded: nextPhaseFrame === 48,
        };
      } else {
        atk = { ...atk, y: floorY, grounded: true };
      }
    } else if (finId === 'overhead_slam') {
      // Sundered Earth (Elden Ring Lion Claw): high somersault vault slamming into the ground
      if (nextPhaseFrame >= 10 && nextPhaseFrame <= 38) {
        const u = (nextPhaseFrame - 10) / 28;
        atk = {
          ...atk,
          y: floorY - Math.round(Math.sin(Math.PI * u) * 145_000),
          grounded: nextPhaseFrame === 38,
        };
      } else {
        atk = { ...atk, y: floorY, grounded: true };
      }
    } else if (finId === 'shinobi_deathblow') {
      // Crimson Deathblow: tight step-in + short lethal plunge over kneeling victim
      if (nextPhaseFrame >= 24 && nextPhaseFrame <= 44) {
        const u = (nextPhaseFrame - 24) / 20;
        atk = {
          ...atk,
          y: floorY - Math.round(Math.sin(Math.PI * u) * 34_000),
          grounded: nextPhaseFrame === 44,
        };
      } else {
        atk = { ...atk, y: floorY, grounded: true };
      }
    } else if (finId === 'eclipse_iaijutsu') {
      // Eclipse Iaijutsu: supersonic iai dash straight through victim to the far side
      if (nextPhaseFrame >= 38 && nextPhaseFrame <= 44) {
        const startX = clampInt(vic.x - atkFacing * 104_000, minX, maxX);
        const endX = clampInt(vic.x + atkFacing * 124_000, minX, maxX);
        const u = (nextPhaseFrame - 38) / 6;
        atk = {
          ...atk,
          x: Math.round(startX + (endX - startX) * u),
          facing: atkFacing,
        };
      }
    } else if (finId === 'phantom_flurry') {
      // Phantom Flurry: rapid multi-angle teleports around the victim before final front cleave
      const phaseSlot =
        nextPhaseFrame < 12
          ? { dx: -102_000, dy: 0 }
          : nextPhaseFrame < 20
            ? { dx: 102_000, dy: 0 }
            : nextPhaseFrame < 28
              ? { dx: -86_000, dy: 68_000 }
              : nextPhaseFrame < 36
                ? { dx: 86_000, dy: 68_000 }
                : nextPhaseFrame < 44
                  ? { dx: 98_000, dy: 0 }
                  : { dx: -106_000, dy: 0 };
      const px = clampInt(vic.x + phaseSlot.dx, minX, maxX);
      const pFace: 1 | -1 = px <= vic.x ? 1 : -1;
      atk = {
        ...atk,
        x: px,
        y: floorY - phaseSlot.dy,
        grounded: phaseSlot.dy === 0,
        facing: pFace,
      };
      // Victim briefly juggled mid-flurry before impact slam @ f56
      if (nextPhaseFrame >= 20 && nextPhaseFrame <= spec.impactFrame) {
        const jU = (nextPhaseFrame - 20) / (spec.impactFrame - 20);
        vic = {
          ...vic,
          y: floorY - Math.round(Math.sin(Math.PI * jU) * 28_000),
          grounded: nextPhaseFrame === spec.impactFrame,
        };
      } else {
        vic = { ...vic, y: floorY, grounded: true };
      }
    } else if (finId === 'sepulcher_split') {
      // Step cleanly outside the left monolith while summoning, then lunge in for the split
      const targetSep = nextPhaseFrame < 38 ? 148_000 : 112_000;
      const desiredAtkX = clampInt(vic.x - atkFacing * targetSep, minX, maxX);
      const stepRate = nextPhaseFrame < 38 ? 0.28 : 0.35;
      atk = {
        ...atk,
        x: Math.round(atk.x + (desiredAtkX - atk.x) * stepRate),
      };
    } else if (finId === 'tempest_thunder') {
      // Slow-motion storm duel footwork: exchange pressure -> brief pushback -> decisive lunge @ f315
      const duelGap =
        nextPhaseFrame < 95
          ? 96_000
          : nextPhaseFrame < 160
            ? 84_000
            : nextPhaseFrame < 225
              ? 94_000
              : nextPhaseFrame < 305
                ? 112_000
                : 82_000;
      const desiredAtkX = clampInt(vic.x - atkFacing * duelGap, minX, maxX);
      atk = {
        ...atk,
        x: Math.round(atk.x + (desiredAtkX - atk.x) * 0.22),
      };
    }

    if (atkSlot === 0) {
      f0 = atk;
      f1 = vic;
    } else {
      f1 = atk;
      f0 = vic;
    }

    const beatIndex = spec.beatFrames.indexOf(nextPhaseFrame);
    if (beatIndex !== -1) {
      const vic = vicSlot === 0 ? f0 : f1;
      events.push({
        type: 'FINISHER_BEAT',
        attacker: atkSlot,
        victim: vicSlot,
        finisherId: state.activeFinisherId,
        beatIndex,
        x: vic.x,
        y: vic.y,
      });
    }
    if (nextPhaseFrame === spec.impactFrame) {
      const vic = vicSlot === 0 ? f0 : f1;
      events.push({
        type: 'FINISHER_IMPACT',
        attacker: atkSlot,
        victim: vicSlot,
        finisherId: state.activeFinisherId,
        x: vic.x,
        y: vic.y,
      });
    }

    if (nextPhaseFrame >= spec.durationFrames) {
      const scores: [number, number] = [state.scores[0], state.scores[1]];
      scores[atkSlot] += 1;
      const vic = vicSlot === 0 ? f0 : f1;
      events.push({ type: 'KO', winner: atkSlot, loser: vicSlot, x: vic.x, y: vic.y });
      events.push({ type: 'ROUND_END', winner: atkSlot, round: state.round });

      const updatedFighters: [FighterState, FighterState] = [
        atkSlot === 0 ? { ...f0, action: 'victory', actionFrame: 0 } : { ...f0, hp: 0, action: 'ko', actionFrame: 0 },
        atkSlot === 1 ? { ...f1, action: 'victory', actionFrame: 0 } : { ...f1, hp: 0, action: 'ko', actionFrame: 0 },
      ];

      if (scores[atkSlot] >= state.config.roundsToWin) {
        events.push({ type: 'MATCH_END', winner: atkSlot });
        return {
          ...state,
          frame: nextFrame,
          phase: 'match_end',
          phaseFrame: 0,
          fighters: updatedFighters,
          scores,
          winner: atkSlot,
          events,
        };
      }
      return {
        ...state,
        frame: nextFrame,
        phase: 'round_end',
        phaseFrame: 0,
        fighters: updatedFighters,
        scores,
        events,
      };
    }

    return {
      ...state,
      frame: nextFrame,
      phaseFrame: nextPhaseFrame,
      fighters: [f0, f1],
      events,
    };
  }

  // Post-round pause before next round
  if (state.phase === 'round_end') {
    const nextPhaseFrame = state.phaseFrame + 1;
    if (nextPhaseFrame >= BALANCE.ROUND_END_FRAMES) {
      return resetForNextRound({ ...state, frame: nextFrame });
    }
    return { ...state, frame: nextFrame, phaseFrame: nextPhaseFrame, events: [] };
  }

  // Fighting phase: step fighters (respecting perfect-dodge slow-motion)
  let f0 = state.fighters[0];
  let f1 = state.fighters[1];
  const stats: [FighterStats, FighterStats] = [{ ...state.stats[0] }, { ...state.stats[1] }];

  const stepSlot = (
    fighter: FighterState,
    opp: FighterState,
    input: InputBitfield,
  ): FighterState => {
    if (fighter.slowFrames > 0) {
      const remainingSlow = fighter.slowFrames - 1;
      if (nextFrame % BALANCE.PERFECT_DODGE_SLOW_DIVISOR !== 0) {
        return { ...fighter, slowFrames: remainingSlow, prevInput: input };
      }
      const res = stepFighter({ ...fighter, slowFrames: remainingSlow }, opp, input, state.config, true);
      events.push(...res.events);
      return res.fighter;
    }
    const res = stepFighter(fighter, opp, input, state.config, true);
    events.push(...res.events);
    return res.fighter;
  };

  f0 = stepSlot(f0, f1, inputs[0]);
  f1 = stepSlot(f1, f0, inputs[1]);

  // Resolve pushboxes
  const [px0, px1] = resolvePushboxes(f0, f1);
  f0 = { ...f0, x: px0 };
  f1 = { ...f1, x: px1 };

  let hitstopFrames = 0;

  // Check guard-break execution trigger (pressing GRAB/EXECUTE on a guard-broken opponent)
  const checkExecution = (
    atk: FighterState,
    vic: FighterState,
    atkInput: InputBitfield,
  ): { atk: FighterState; vic: FighterState; triggerFinisher: boolean } => {
    const grabJustPressed = ((atkInput & ~atk.prevInput) & INPUT_BITS.GRAB) !== 0 || (atk.action === 'attack' && atk.currentMove === 'grab' && atk.actionFrame === 0);
    if (!grabJustPressed || vic.action !== 'guard_break') {
      return { atk, vic, triggerFinisher: false };
    }
    if (absInt(atk.x - vic.x) > 135_000) {
      return { atk, vic, triggerFinisher: false };
    }
    // If victim HP <= execution damage, trigger full cinematic finisher!
    if (vic.hp <= BALANCE.EXECUTION_DAMAGE && !state.config.trainingMode) {
      return { atk, vic, triggerFinisher: true };
    }
    // Non-lethal stagger execution (15s cooldown, heals attacker slightly)
    if (atk.executionCooldown === 0) {
      const nextVicHp = clampInt(vic.hp - BALANCE.EXECUTION_DAMAGE, 1, vic.maxHp);
      const nextAtkHp = clampInt(atk.hp + BALANCE.EXECUTION_HEAL, 0, atk.maxHp);
      events.push({ type: 'EXECUTION', attacker: atk.slot, victim: vic.slot, x: vic.x, y: vic.y });
      stats[atk.slot] = {
        ...stats[atk.slot],
        damageDealt: stats[atk.slot].damageDealt + BALANCE.EXECUTION_DAMAGE,
        hitsLanded: stats[atk.slot].hitsLanded + 1,
      };
      hitstopFrames = Math.max(hitstopFrames, 8);
      return {
        atk: {
          ...atk,
          hp: nextAtkHp,
          action: 'execution_atk',
          actionFrame: 0,
          currentMove: null,
          executionCooldown: BALANCE.EXECUTION_COOLDOWN_FRAMES,
        },
        vic: {
          ...vic,
          hp: nextVicHp,
          guard: vic.maxGuard,
          action: 'execution_vic',
          actionFrame: 0,
          stunFrames: BALANCE.EXECUTION_DURATION_FRAMES,
        },
        triggerFinisher: false,
      };
    }
    return { atk, vic, triggerFinisher: false };
  };

  let finisherTrigger: FighterSlot | null = null;
  const exec0 = checkExecution(f0, f1, inputs[0]);
  f0 = exec0.atk;
  f1 = exec0.vic;
  if (exec0.triggerFinisher) finisherTrigger = 0;

  if (finisherTrigger === null) {
    const exec1 = checkExecution(f1, f0, inputs[1]);
    f1 = exec1.atk;
    f0 = exec1.vic;
    if (exec1.triggerFinisher) finisherTrigger = 1;
  }

  // Combat hitbox resolution (both directions)
  const resolveAttack = (
    atk: FighterState,
    def: FighterState,
  ): { atk: FighterState; def: FighterState } => {
    if (atk.moveHitLanded) return { atk, def };
    const hitbox = getAttackHitbox(atk);
    if (hitbox === null || atk.currentMove === null) return { atk, def };
    if (isWakeupInvincible(def)) return { atk, def };
    const hurtbox = getHurtbox(def);
    if (!rectsOverlap(hitbox, hurtbox)) return { atk, def };

    const move = MOVES[atk.currentMove];

    // Grab loses to dodge and jump
    if (move.isGrab && (!def.grounded || def.action === 'dodge')) {
      return { atk, def };
    }

    // Perfect dodge check (last-moment dodge within first 4 frames)
    if (isPerfectDodgeWindow(def) && !def.perfectDodgeTriggered) {
      events.push({ type: 'PERFECT_DODGE', dodger: def.slot, x: def.x, y: def.y });
      stats[def.slot] = { ...stats[def.slot], perfectDodges: stats[def.slot].perfectDodges + 1 };
      return {
        atk: { ...atk, moveHitLanded: true, slowFrames: BALANCE.PERFECT_DODGE_SLOW_FRAMES },
        def: {
          ...def,
          perfectDodgeTriggered: true,
          counterWindow: BALANCE.COUNTER_WINDOW_FRAMES,
          specialMeter: clampInt(def.specialMeter + BALANCE.SPECIAL_GAIN_ON_PERFECT_DODGE, 0, BALANCE.MAX_SPECIAL_METER),
        },
      };
    }

    // Standard dodge invincibility frames 4..12
    if (isDodgeInvincible(def)) {
      return { atk, def };
    }

    // PARRY check (normal attacks only; unblockable & grab cannot be parried)
    if (def.action === 'parry_active' && !move.unblockable && !move.isGrab) {
      const midX = Math.trunc((atk.x + def.x) / 2);
      events.push({ type: 'PARRY', parrier: def.slot, attacker: atk.slot, x: midX, y: def.y - 64_000 });
      stats[def.slot] = { ...stats[def.slot], parries: stats[def.slot].parries + 1 };
      hitstopFrames = Math.max(hitstopFrames, BALANCE.PARRY_HITSTOP_FRAMES);
      return {
        atk: {
          ...atk,
          action: 'parry_stagger',
          actionFrame: 0,
          stunFrames: BALANCE.PARRY_STAGGER_FRAMES,
          currentMove: null,
          moveHitLanded: true,
          vx: -atk.facing * 7_500,
        },
        def: {
          ...def,
          action: 'idle',
          actionFrame: 0,
          parryCooldown: 0,
          counterWindow: BALANCE.COUNTER_WINDOW_FRAMES,
          guard: clampInt(def.guard + 15, 0, def.maxGuard),
          specialMeter: clampInt(def.specialMeter + BALANCE.SPECIAL_GAIN_ON_PARRY, 0, BALANCE.MAX_SPECIAL_METER),
        },
      };
    }

    const atkChar = CHARACTERS[atk.charId];
    const rawDamage = scalePercent(move.damage, atkChar.damagePercent);

    // BLOCK check (fails against unblockable and grab)
    if (def.action === 'block' && !move.unblockable && !move.isGrab) {
      const chip = Math.max(BALANCE.BLOCK_MIN_CHIP, scalePercent(rawDamage, BALANCE.BLOCK_DAMAGE_PERCENT));
      const nextGuard = clampInt(def.guard - move.guardDamage, 0, def.maxGuard);
      const nextHp = clampInt(def.hp - chip, 1, def.maxHp);
      const midX = Math.trunc((atk.x + def.x) / 2);

      if (nextGuard <= 0) {
        events.push({ type: 'GUARD_BREAK', victim: def.slot, x: def.x, y: def.y - 60_000 });
        stats[atk.slot] = { ...stats[atk.slot], guardBreaks: stats[atk.slot].guardBreaks + 1 };
        hitstopFrames = Math.max(hitstopFrames, BALANCE.GUARD_BREAK_HITSTOP_FRAMES);
        return {
          atk: { ...atk, moveHitLanded: true },
          def: {
            ...def,
            hp: nextHp,
            guard: 0,
            action: 'guard_break',
            actionFrame: 0,
            stunFrames: BALANCE.GUARD_BREAK_STUN_FRAMES,
            currentMove: null,
            vx: atk.facing * Math.trunc(move.pushback * 1.2),
          },
        };
      }

      events.push({
        type: 'BLOCK',
        attacker: atk.slot,
        defender: def.slot,
        guardRemaining: nextGuard,
        x: midX,
        y: def.y - 64_000,
      });
      hitstopFrames = Math.max(hitstopFrames, Math.max(3, move.hitstop - 2));
      return {
        atk: { ...atk, moveHitLanded: true },
        def: {
          ...def,
          hp: nextHp,
          guard: nextGuard,
          action: 'blockstun',
          actionFrame: 0,
          stunFrames: move.blockstun,
          vx: atk.facing * Math.trunc(move.pushback * 0.7),
        },
      };
    }

    // Clean HIT!
    const nextHp = state.config.trainingMode
      ? clampInt(def.hp - rawDamage, 1, def.maxHp)
      : clampInt(def.hp - rawDamage, 0, def.maxHp);
    const nextCombo = atk.comboCount + 1;
    stats[atk.slot] = {
      ...stats[atk.slot],
      damageDealt: stats[atk.slot].damageDealt + rawDamage,
      hitsLanded: stats[atk.slot].hitsLanded + 1,
      maxCombo: Math.max(stats[atk.slot].maxCombo, nextCombo),
    };
    const isHeavy = move.id === 'heavy' || move.id === 'unblockable' || move.id === 'counter';
    events.push({
      type: 'HIT',
      attacker: atk.slot,
      defender: def.slot,
      move: move.id,
      damage: rawDamage,
      x: def.x,
      y: def.y - 64_000,
      isHeavy,
      isCounter: move.isCounter,
    });
    hitstopFrames = Math.max(hitstopFrames, move.hitstop);

    return {
      atk: {
        ...atk,
        moveHitLanded: true,
        comboCount: nextCombo,
        comboTimer: 75,
      },
      def: {
        ...def,
        hp: nextHp,
        action: 'hitstun',
        actionFrame: 0,
        stunFrames: move.hitstun,
        currentMove: null,
        moveHitLanded: false,
        vx: atk.facing * move.pushback,
      },
    };
  };

  if (finisherTrigger === null) {
    const r0 = resolveAttack(f0, f1);
    f0 = r0.atk;
    f1 = r0.def;
    const r1 = resolveAttack(f1, f0);
    f1 = r1.atk;
    f0 = r1.def;
  }

  // Check Player Special Power startup resolution (100% connects unless parried or perfect-dodged!)
  let nextRngForSpec = state.rngState;
  const checkSpecialConnect = (
    atk: FighterState,
    def: FighterState,
  ): { triggered: boolean; atk: FighterState; def: FighterState } => {
    if (atk.action !== 'special_startup' || atk.actionFrame < 16) {
      return { triggered: false, atk, def };
    }
    if (isWakeupInvincible(def)) {
      return { triggered: false, atk: { ...atk, action: 'idle', actionFrame: 0 }, def };
    }
    if (def.action === 'parry_active') {
      events.push({ type: 'PARRY', parrier: def.slot, attacker: atk.slot, x: def.x, y: def.y - 64_000 });
      events.push({ type: 'PLAYER_SPECIAL_DENIED', attacker: atk.slot, defender: def.slot, reason: 'parry', x: def.x, y: def.y });
      stats[def.slot] = { ...stats[def.slot], parries: stats[def.slot].parries + 1 };
      hitstopFrames = Math.max(hitstopFrames, BALANCE.PARRY_HITSTOP_FRAMES);
      return {
        triggered: false,
        atk: { ...atk, action: 'parry_stagger', actionFrame: 0, stunFrames: BALANCE.PARRY_STAGGER_FRAMES, vx: -atk.facing * 8_000 },
        def: {
          ...def,
          action: 'idle',
          actionFrame: 0,
          counterWindow: BALANCE.COUNTER_WINDOW_FRAMES,
          specialMeter: clampInt(def.specialMeter + BALANCE.SPECIAL_GAIN_ON_PARRY, 0, BALANCE.MAX_SPECIAL_METER),
        },
      };
    }
    if (isPerfectDodgeWindow(def)) {
      events.push({ type: 'PERFECT_DODGE', dodger: def.slot, x: def.x, y: def.y });
      events.push({ type: 'PLAYER_SPECIAL_DENIED', attacker: atk.slot, defender: def.slot, reason: 'perfect_dodge', x: def.x, y: def.y });
      stats[def.slot] = { ...stats[def.slot], perfectDodges: stats[def.slot].perfectDodges + 1 };
      return {
        triggered: false,
        atk: { ...atk, action: 'idle', actionFrame: 0, slowFrames: BALANCE.PERFECT_DODGE_SLOW_FRAMES },
        def: {
          ...def,
          perfectDodgeTriggered: true,
          counterWindow: BALANCE.COUNTER_WINDOW_FRAMES,
          specialMeter: clampInt(def.specialMeter + BALANCE.SPECIAL_GAIN_ON_PERFECT_DODGE, 0, BALANCE.MAX_SPECIAL_METER),
        },
      };
    }
    return { triggered: true, atk, def };
  };

  let triggeredSpecialAttacker: FighterSlot | null = null;
  const sc0 = checkSpecialConnect(f0, f1);
  f0 = sc0.atk;
  f1 = sc0.def;
  if (sc0.triggered) triggeredSpecialAttacker = 0;

  if (triggeredSpecialAttacker === null) {
    const sc1 = checkSpecialConnect(f1, f0);
    f1 = sc1.atk;
    f0 = sc1.def;
    if (sc1.triggered) triggeredSpecialAttacker = 1;
  }

  if (triggeredSpecialAttacker !== null) {
    const vicSlot: FighterSlot = triggeredSpecialAttacker === 0 ? 1 : 0;
    const vic = vicSlot === 0 ? f0 : f1;
    const roll = nextU32((nextRngForSpec ^ (nextFrame * 2654435761) ^ f0.x ^ f1.x) >>> 0);
    nextRngForSpec = roll.nextState;
    const specialId = selectPlayerSpecialId(roll.value);
    events.push({
      type: 'PLAYER_SPECIAL_START',
      attacker: triggeredSpecialAttacker,
      victim: vicSlot,
      specialId,
      x: vic.x,
      y: vic.y,
    });
    return {
      ...state,
      frame: nextFrame,
      phase: 'special',
      phaseFrame: 0,
      hitstopFrames: 8,
      rngState: nextRngForSpec,
      fighters: [
        triggeredSpecialAttacker === 0
          ? { ...f0, action: 'special_atk', actionFrame: 0, currentMove: null, vx: 0 }
          : { ...f0, action: 'special_vic', actionFrame: 0, currentMove: null, vx: 0 },
        triggeredSpecialAttacker === 1
          ? { ...f1, action: 'special_atk', actionFrame: 0, currentMove: null, vx: 0 }
          : { ...f1, action: 'special_vic', actionFrame: 0, currentMove: null, vx: 0 },
      ],
      stats,
      bossSpecials: [],
      activeSpecial: {
        attacker: triggeredSpecialAttacker,
        victim: vicSlot,
        specialId,
        frame: 0,
        originX: triggeredSpecialAttacker === 0 ? f0.x : f1.x,
        targetX: vic.x,
      },
      events,
    };
  }

  // Spawn & step Boss Arena Special Attacks
  let bossSpecials = [...state.bossSpecials];
  let nextBossSpecialId = state.nextBossSpecialId;
  let rngForBoss = state.rngState;
  const trySpawnBoss = (fighter: FighterState, input: InputBitfield): FighterState => {
    if (
      (input & INPUT_BITS.BOSS_SPECIAL) !== 0 &&
      fighter.bossSpecialCooldown === 0 &&
      (fighter.action === 'idle' || fighter.action === 'walk') &&
      bossSpecials.length < 2
    ) {
      const res = spawnBossSpecial(fighter, nextBossSpecialId, rngForBoss);
      nextBossSpecialId = res.nextId;
      rngForBoss = res.rngState;
      if (res.special && res.event) {
        bossSpecials.push(res.special);
        events.push(res.event);
        return { ...fighter, bossSpecialCooldown: BALANCE.BOSS_SPECIAL_COOLDOWN_FRAMES };
      }
    }
    return fighter;
  };
  f0 = trySpawnBoss(f0, inputs[0]);
  f1 = trySpawnBoss(f1, inputs[1]);

  const bossStep = stepBossSpecials(bossSpecials, [f0, f1], state.config.trainingMode);
  bossSpecials = [...bossStep.specials];
  f0 = bossStep.fighters[0];
  f1 = bossStep.fighters[1];
  events.push(...bossStep.events);
  hitstopFrames = Math.max(hitstopFrames, bossStep.hitstop);

  // Step & resolve coffin slab hazards
  const hazardStep = stepHazards(
    state.hazards,
    state.hazardTimer,
    state.nextHazardId,
    rngForBoss,
    [f0, f1],
    state.config.enableHazards,
  );
  events.push(...hazardStep.events);

  const updatedHazards: HazardSlab[] = hazardStep.hazards.map((slab) => {
    const sBox = getSlabHitbox(slab);
    if (sBox === null) return slab;
    let hitMask = slab.hitMask;
    const applySlabTo = (fighter: FighterState): FighterState => {
      const bit = 1 << fighter.slot;
      if ((hitMask & bit) !== 0) return fighter;
      // Rising coffin hazards should not damage bosses or boss-slot encounters
      if (CHARACTERS[fighter.charId].isBoss || fighter.slot === state.config.hazardImmuneSlot) {
        return fighter;
      }
      if (isDodgeInvincible(fighter) || isWakeupInvincible(fighter)) return fighter;
      if (!rectsOverlap(sBox, getHurtbox(fighter))) return fighter;
      hitMask |= bit;
      const nextHp = state.config.trainingMode
        ? clampInt(fighter.hp - BALANCE.SLAB_DAMAGE, 1, fighter.maxHp)
        : clampInt(fighter.hp - BALANCE.SLAB_DAMAGE, 0, fighter.maxHp);
      const pushDir = fighter.x >= slab.x ? 1 : -1;
      events.push({
        type: 'HIT',
        attacker: fighter.slot === 0 ? 1 : 0,
        defender: fighter.slot,
        move: 'heavy',
        damage: BALANCE.SLAB_DAMAGE,
        x: fighter.x,
        y: fighter.y - 64_000,
        isHeavy: true,
        isCounter: false,
      });
      hitstopFrames = Math.max(hitstopFrames, 7);
      return {
        ...fighter,
        hp: nextHp,
        action: 'hitstun',
        actionFrame: 0,
        stunFrames: 22,
        currentMove: null,
        vx: pushDir * 10_500,
        vy: -7_000,
        grounded: false,
      };
    };
    f0 = applySlabTo(f0);
    f1 = applySlabTo(f1);
    return { ...slab, hitMask };
  });

  // Check lethal KO -> trigger cinematic FINISHER!
  if (!state.config.trainingMode) {
    if (finisherTrigger === null) {
      if (f1.hp <= 0 && f0.hp > 0) finisherTrigger = 0;
      else if (f0.hp <= 0 && f1.hp > 0) finisherTrigger = 1;
    }

    if (finisherTrigger !== null) {
      const vic = finisherTrigger === 0 ? f1 : f0;
      const finRoll = nextU32((hazardStep.rngState ^ (nextFrame * 2654435761) ^ f0.x ^ f1.x) >>> 0);
      const finisherId = selectRandomFinisherId(finRoll.value);
      stats[finisherTrigger] = {
        ...stats[finisherTrigger],
        finishers: stats[finisherTrigger].finishers + 1,
      };
      events.push({
        type: 'FINISHER_START',
        attacker: finisherTrigger,
        victim: vic.slot,
        finisherId,
        x: vic.x,
        y: vic.y,
      });
      const pair = orientFinisherPair(
        finisherTrigger === 0 ? f0 : f1,
        finisherTrigger === 0 ? f1 : f0,
      );
      return {
        ...state,
        frame: nextFrame,
        phase: 'finisher',
        phaseFrame: 0,
        hitstopFrames: BALANCE.KO_HITSTOP_FRAMES,
        rngState: finRoll.nextState,
        fighters: finisherTrigger === 0 ? [pair.atk, pair.vic] : [pair.vic, pair.atk],
        stats,
        hazards: updatedHazards,
        hazardTimer: hazardStep.hazardTimer,
        nextHazardId: hazardStep.nextHazardId,
        bossSpecials: [],
        nextBossSpecialId,
        activeSpecial: null,
        activeFinisherId: finisherId,
        finisherAttacker: finisherTrigger,
        events,
      };
    }

    // Double KO or round timeout (prevents infinite stalemates)
    const nextTimer = state.config.roundTimerFrames > 0 ? Math.max(0, state.roundTimer - 1) : state.roundTimer;
    if ((f0.hp <= 0 && f1.hp <= 0) || (state.config.roundTimerFrames > 0 && nextTimer === 0)) {
      const roundWinner: FighterSlot | null =
        f0.hp > f1.hp ? 0 : f1.hp > f0.hp ? 1 : null;
      const scores: [number, number] = [state.scores[0], state.scores[1]];
      if (roundWinner !== null) {
        scores[roundWinner] += 1;
      } else {
        // Tiebreaker on double-KO / exact HP tie: award round to both unless match point
        scores[0] += 1;
        scores[1] += 1;
      }
      events.push({ type: 'ROUND_END', winner: roundWinner, round: state.round });
      const p0Won = scores[0] >= state.config.roundsToWin;
      const p1Won = scores[1] >= state.config.roundsToWin;
      if (p0Won || p1Won) {
        const matchWinner: FighterSlot | null = p0Won && !p1Won ? 0 : p1Won && !p0Won ? 1 : roundWinner;
        events.push({ type: 'MATCH_END', winner: matchWinner });
        return {
          ...state,
          frame: nextFrame,
          phase: 'match_end',
          phaseFrame: 0,
          roundTimer: nextTimer,
          rngState: hazardStep.rngState,
          fighters: [f0, f1],
          scores,
          stats,
          hazards: updatedHazards,
          hazardTimer: hazardStep.hazardTimer,
          nextHazardId: hazardStep.nextHazardId,
          winner: matchWinner,
          events,
        };
      }
      return {
        ...state,
        frame: nextFrame,
        phase: 'round_end',
        phaseFrame: 0,
        roundTimer: nextTimer,
        rngState: hazardStep.rngState,
        fighters: [f0, f1],
        scores,
        stats,
        hazards: updatedHazards,
        hazardTimer: hazardStep.hazardTimer,
        nextHazardId: hazardStep.nextHazardId,
        events,
      };
    }

    return {
      ...state,
      frame: nextFrame,
      roundTimer: nextTimer,
      hitstopFrames,
      rngState: hazardStep.rngState,
      fighters: [f0, f1],
      stats,
      hazards: updatedHazards,
      hazardTimer: hazardStep.hazardTimer,
      nextHazardId: hazardStep.nextHazardId,
      bossSpecials,
      nextBossSpecialId,
      events,
    };
  }

  // Training mode: auto-restore HP when opponent recovers from hitstun
  if (f1.action === 'idle' && f1.hp < f1.maxHp && f1.actionFrame > 45) {
    f1 = { ...f1, hp: f1.maxHp };
  }

  return {
    ...state,
    frame: nextFrame,
    hitstopFrames,
    rngState: hazardStep.rngState,
    fighters: [f0, f1],
    stats,
    hazards: updatedHazards,
    hazardTimer: hazardStep.hazardTimer,
    nextHazardId: hazardStep.nextHazardId,
    events,
  };
}
