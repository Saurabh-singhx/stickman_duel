import { BALANCE } from '../data/balance';
import { CHARACTERS, type CharacterId } from '../data/characters';
import { FINISHER_IDS, FINISHERS, type FinisherId } from '../data/finishers';
import { getMoveTotalFrames, MOVES, type MoveId } from '../data/moves';
import {
  BOSS_SPECIALS_BY_CHAR,
  findBossSpecial,
  PLAYER_SPECIAL_IDS,
  PLAYER_SPECIALS,
  type PlayerSpecialId,
} from '../data/specials';
import type { StageId } from '../data/stages';
import { spawnBossSpecialById } from '../sim/BossSpecials';
import { createInitialState, step } from '../sim/Sim';
import { INPUT_BITS, type GameState, type InputBitfield, type SimEvent } from '../sim/State';

export type LabCategory = 'player_special' | 'finisher' | 'boss_special' | 'move' | 'state';

export type LabStateId =
  | 'character_showcase'
  | 'idle'
  | 'walk_fwd'
  | 'walk_back'
  | 'crouch'
  | 'jump'
  | 'dodge'
  | 'parry_active'
  | 'parry_whiff'
  | 'guard_break'
  | 'knockdown_getup'
  | 'slab_hazard';

export interface LabScenarioRequest {
  readonly category: LabCategory;
  readonly id: string;
  readonly p1Char: CharacterId;
  readonly p2Char: CharacterId;
  readonly stageId: StageId;
  readonly hitTarget?: boolean;
  readonly p1X?: number;
  readonly p2X?: number;
}

export interface LabKeyFrame {
  readonly label: string;
  readonly frame: number;
}

export interface LabSequence {
  readonly label: string;
  readonly subtitle: string;
  readonly p1Char: CharacterId;
  readonly p2Char: CharacterId;
  readonly stageId: StageId;
  readonly p1X: number;
  readonly p2X: number;
  readonly frames: readonly GameState[];
  readonly keyFrames: readonly LabKeyFrame[];
}

export interface LabCatalogItem {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly ownerChar?: CharacterId;
}

export interface LabCatalog {
  readonly characters: readonly { id: CharacterId; name: string; title: string }[];
  readonly playerSpecials: readonly LabCatalogItem[];
  readonly finishers: readonly LabCatalogItem[];
  readonly bossSpecials: readonly LabCatalogItem[];
  readonly moves: readonly LabCatalogItem[];
  readonly states: readonly LabCatalogItem[];
}

export const LAB_MOVE_IDS: readonly (MoveId | 'combo_4hit')[] = [
  'light1',
  'light2',
  'light3',
  'light4',
  'combo_4hit',
  'heavy',
  'unblockable',
  'grab',
  'counter',
];

export const LAB_STATE_ITEMS: readonly LabCatalogItem[] = [
  { id: 'character_showcase', label: 'Character Showcase', detail: 'Neutral idle duelists for silhouette & weapon check' },
  { id: 'idle', label: 'Idle Stance', detail: '60f breathing stance loop' },
  { id: 'walk_fwd', label: 'Walk Forward', detail: '60f advancing footwork cycle' },
  { id: 'walk_back', label: 'Walk Backward', detail: '60f retreating footwork cycle' },
  { id: 'crouch', label: 'Crouch', detail: '45f low crouch posture' },
  { id: 'jump', label: 'Jump Arc', detail: 'Full takeoff, apex, and landing dust' },
  { id: 'dodge', label: 'Dodge Roll / Dash', detail: '26f dodge with afterimage & dust' },
  { id: 'parry_active', label: 'Parry Deflect', detail: 'Incoming heavy parried into golden riposte window' },
  { id: 'parry_whiff', label: 'Parry Whiff', detail: 'Early block release punished with whiff recovery' },
  { id: 'guard_break', label: 'Guard Break', detail: 'Unblockable/heavy shattering guard into stagger' },
  { id: 'knockdown_getup', label: 'Knockdown -> Getup', detail: '24f knockdown + 30f invulnerable getup' },
  { id: 'slab_hazard', label: 'Coffin Slab Hazard', detail: '38f telegraph -> 16f active stone burst' },
];

/** Returns the complete catalog of characters, specials, finishers, boss specials, moves, and states. */
export function getLabCatalog(): LabCatalog {
  const characters = (Object.keys(CHARACTERS) as CharacterId[]).map((id) => ({
    id,
    name: CHARACTERS[id].name,
    title: CHARACTERS[id].title,
  }));

  const playerSpecials: LabCatalogItem[] = PLAYER_SPECIAL_IDS.map((id) => {
    const s = PLAYER_SPECIALS[id];
    return {
      id,
      label: s.name,
      detail: `${s.telegraphFrames}f startup + ${s.cinematicFrames}f cinematic (impact f${s.impactFrame})`,
    };
  });

  const finishers: LabCatalogItem[] = FINISHER_IDS.map((id) => {
    const f = FINISHERS[id];
    return {
      id,
      label: f.name,
      detail: `${f.durationFrames}f (${f.inspiration})`,
    };
  });

  const bossSpecials: LabCatalogItem[] = [];
  for (const charId of Object.keys(BOSS_SPECIALS_BY_CHAR) as CharacterId[]) {
    for (const sp of BOSS_SPECIALS_BY_CHAR[charId]) {
      bossSpecials.push({
        id: sp.id,
        label: `${CHARACTERS[charId].name}: ${sp.name}`,
        detail: `${sp.coverage} ${sp.shape} · ${sp.telegraphFrames}f tel / ${sp.activeFrames}f act`,
        ownerChar: charId,
      });
    }
  }

  const moves: LabCatalogItem[] = LAB_MOVE_IDS.map((id) => {
    if (id === 'combo_4hit') {
      return { id, label: '4-Hit Light Combo', detail: 'light1 -> light2 -> light3 -> light4' };
    }
    const m = MOVES[id];
    return {
      id,
      label: `${m.name} (${id})`,
      detail: `${m.startup}f / ${m.active}f / ${m.recovery}f · ${m.damage} dmg`,
    };
  });

  return {
    characters,
    playerSpecials,
    finishers,
    bossSpecials,
    moves,
    states: LAB_STATE_ITEMS,
  };
}

function clampStagePx(px: number): number {
  return Math.max(BALANCE.STAGE_LEFT_PX + 20, Math.min(BALANCE.STAGE_RIGHT_PX - 20, Math.round(px)));
}

function makeBaseFightingState(
  p1Char: CharacterId,
  p2Char: CharacterId,
  stageId: StageId,
  p1Px = 520,
  p2Px = 720,
  trainingMode = false,
): GameState {
  const x1 = clampStagePx(p1Px);
  const x2 = clampStagePx(p2Px);
  const p1Facing: 1 | -1 = x1 <= x2 ? 1 : -1;
  const p2Facing: 1 | -1 = x1 <= x2 ? -1 : 1;

  let state = createInitialState({
    seed: 1337,
    stageId,
    p1Char,
    p2Char,
    roundsToWin: 2,
    roundTimerFrames: 5940,
    enableHazards: false,
    parryAssist: false,
    infiniteGuardP2: false,
    trainingMode,
  });
  for (let i = 0; i < BALANCE.ROUND_START_FREEZE_FRAMES + 1; i += 1) {
    state = step(state, [0, 0]);
  }
  return {
    ...state,
    phase: 'fighting',
    phaseFrame: 0,
    events: [],
    fighters: [
      {
        ...state.fighters[0],
        x: x1 * BALANCE.FP_SCALE,
        facing: p1Facing,
        hp: state.fighters[0].maxHp,
        guard: state.fighters[0].maxGuard,
      },
      {
        ...state.fighters[1],
        x: x2 * BALANCE.FP_SCALE,
        facing: p2Facing,
        hp: state.fighters[1].maxHp,
        guard: state.fighters[1].maxGuard,
      },
    ],
  };
}

function dedupeKeyFrames(items: LabKeyFrame[], maxIdx: number): LabKeyFrame[] {
  const out: LabKeyFrame[] = [];
  for (const item of items) {
    const clamped = Math.max(0, Math.min(maxIdx, item.frame));
    if (!out.some((x) => x.label === item.label)) {
      out.push({ label: item.label, frame: clamped });
    }
  }
  return out;
}

function buildPlayerSpecialSequence(
  specialId: PlayerSpecialId,
  p1Char: CharacterId,
  p2Char: CharacterId,
  stageId: StageId,
  p1PxOverride?: number,
  p2PxOverride?: number,
): LabSequence {
  const spec = PLAYER_SPECIALS[specialId] ?? PLAYER_SPECIALS.aerial_lasers;
  const p1Px = clampStagePx(p1PxOverride ?? 520);
  const p2Px = clampStagePx(p2PxOverride ?? 720);
  let state = makeBaseFightingState(p1Char, p2Char, stageId, p1Px, p2Px, false);
  state = {
    ...state,
    fighters: [
      { ...state.fighters[0], specialMeter: BALANCE.MAX_SPECIAL_METER },
      { ...state.fighters[1], hp: 140, maxHp: 140 },
    ],
  };

  const frames: GameState[] = [state];
  const keyFrames: LabKeyFrame[] = [{ label: 'Startup', frame: 8 }];
  let patchedStart = false;
  let recordedKnockdown = false;
  let recordedGetup = false;

  const totalBudget = spec.telegraphFrames + spec.cinematicFrames + BALANCE.KNOCKDOWN_FRAMES + BALANCE.GETUP_FRAMES + 24;
  for (let i = 0; i < totalBudget; i += 1) {
    const input0 = i === 0 ? INPUT_BITS.SPECIAL : 0;
    let next = step(state, [input0, 0]);

    if (!patchedStart && next.phase === 'special' && next.activeSpecial) {
      patchedStart = true;
      const rewrittenEvents: SimEvent[] = next.events.map((ev) =>
        ev.type === 'PLAYER_SPECIAL_START' ? { ...ev, specialId: spec.id } : ev,
      );
      next = {
        ...next,
        activeSpecial: { ...next.activeSpecial, specialId: spec.id },
        events: rewrittenEvents,
      };
      keyFrames.push({ label: 'Connect', frame: frames.length });
    }

    const idx = frames.length;
    frames.push(next);
    state = next;

    if (next.phase === 'special' && next.activeSpecial) {
      const sf = next.activeSpecial.frame;
      if (spec.id === 'aerial_lasers' && sf === 12) {
        keyFrames.push({ label: 'Ascent', frame: idx });
      }
      if (spec.id === 'arena_greatsword' && sf === 82) {
        keyFrames.push({ label: 'Swing Mid', frame: idx });
      }
      if (spec.id === 'unarmed_launch') {
        if (sf === 24) keyFrames.push({ label: 'Fist Charge', frame: idx });
        if (sf === 74) keyFrames.push({ label: 'Launch Mid', frame: idx });
        if (sf === 94) keyFrames.push({ label: 'Edge Hit', frame: idx });
      }
      const beatIdx = spec.beatFrames.indexOf(sf);
      if (beatIdx !== -1) {
        keyFrames.push({ label: `Beat ${beatIdx + 1}`, frame: idx });
      }
      if (sf === spec.impactFrame) {
        keyFrames.push({ label: 'Impact', frame: idx });
      }
    } else if (patchedStart) {
      if (!recordedKnockdown && next.fighters[1].action === 'knockdown') {
        recordedKnockdown = true;
        keyFrames.push({ label: 'Knockdown', frame: idx });
      } else if (!recordedGetup && next.fighters[1].action === 'getup') {
        recordedGetup = true;
        keyFrames.push({ label: 'Getup Hand', frame: idx + 6 });
        keyFrames.push({ label: 'Getup Knee', frame: idx + 16 });
      } else if (recordedGetup && next.fighters[1].action === 'idle' && next.fighters[1].actionFrame >= 6) {
        break;
      }
    }
  }

  return {
    label: spec.name,
    subtitle: `Player Special · ${spec.telegraphFrames}f startup + ${spec.cinematicFrames}f cinematic · ${spec.damage} dmg`,
    p1Char,
    p2Char,
    stageId,
    p1X: p1Px,
    p2X: p2Px,
    frames,
    keyFrames: dedupeKeyFrames(keyFrames, frames.length - 1),
  };
}

function buildFinisherSequence(
  finisherId: FinisherId,
  p1Char: CharacterId,
  p2Char: CharacterId,
  stageId: StageId,
  p1PxOverride?: number,
  p2PxOverride?: number,
): LabSequence {
  const spec = FINISHERS[finisherId] ?? FINISHERS.low_lunge;
  const p1Px = clampStagePx(p1PxOverride ?? 535);
  const p2Px = clampStagePx(p2PxOverride ?? 645);
  const farApart = Math.abs(p1Px - p2Px) > 130;
  let state = makeBaseFightingState(p1Char, p2Char, stageId, p1Px, p2Px, false);

  const frames: GameState[] = [];
  const keyFrames: LabKeyFrame[] = [];
  let patchedFinisher = false;
  let recordedKo = false;

  if (farApart) {
    patchedFinisher = true;
    const vic = state.fighters[1];
    state = {
      ...state,
      phase: 'finisher',
      phaseFrame: 0,
      hitstopFrames: BALANCE.KO_HITSTOP_FRAMES,
      activeFinisherId: spec.id,
      finisherAttacker: 0,
      fighters: [
        { ...state.fighters[0], action: 'finisher_atk', actionFrame: 0, vx: 0 },
        { ...state.fighters[1], hp: 0, action: 'finisher_vic', actionFrame: 0, vx: 0 },
      ],
      events: [
        {
          type: 'FINISHER_START',
          attacker: 0,
          victim: 1,
          finisherId: spec.id,
          x: vic.x,
          y: vic.y,
        },
      ],
    };
    frames.push(state);
    keyFrames.push({ label: 'Start', frame: 0 });
  } else {
    state = {
      ...state,
      fighters: [
        state.fighters[0],
        {
          ...state.fighters[1],
          hp: 16,
          guard: 0,
          action: 'guard_break',
          actionFrame: 10,
          stunFrames: BALANCE.GUARD_BREAK_STUN_FRAMES,
        },
      ],
    };
    frames.push(state);
  }

  const totalBudget = BALANCE.KO_HITSTOP_FRAMES + spec.durationFrames + 40;
  for (let i = 0; i < totalBudget; i += 1) {
    const input0 = !farApart && i === 0 ? INPUT_BITS.GRAB : 0;
    let next = step(state, [input0, 0]);

    if (!patchedFinisher && next.phase === 'finisher') {
      patchedFinisher = true;
      const rewrittenEvents: SimEvent[] = next.events.map((ev) =>
        ev.type === 'FINISHER_START' ? { ...ev, finisherId: spec.id } : ev,
      );
      next = {
        ...next,
        activeFinisherId: spec.id,
        events: rewrittenEvents,
      };
      keyFrames.push({ label: 'Start', frame: frames.length });
    }

    const idx = frames.length;
    frames.push(next);
    state = next;

    if (next.phase === 'finisher') {
      const pf = next.phaseFrame;
      if (spec.id === 'rising_slash' && pf === 20) keyFrames.push({ label: 'Low Coil', frame: idx });
      if (spec.id === 'overhead_slam' && pf === 24) keyFrames.push({ label: 'Flip Apex', frame: idx });
      if (spec.id === 'judgment_cut' && pf === 52) keyFrames.push({ label: 'Sheathe', frame: idx });
      if (spec.id === 'eclipse_iaijutsu' && pf === 41) keyFrames.push({ label: 'Dash Cut', frame: idx });
      if (spec.id === 'tempest_thunder' && pf === 295) keyFrames.push({ label: 'Mortal Coil', frame: idx });
      const beatIdx = spec.beatFrames.indexOf(pf);
      if (beatIdx !== -1) {
        keyFrames.push({ label: `Beat ${beatIdx + 1}`, frame: idx });
      }
      if (pf === spec.impactFrame) {
        keyFrames.push({ label: 'Impact', frame: idx });
      }
      if (spec.id === 'rising_slash' && pf === 43) {
        keyFrames.push({ label: 'Sky Apex', frame: idx });
      }
    } else if (patchedFinisher && !recordedKo && (next.phase === 'round_end' || next.phase === 'match_end')) {
      recordedKo = true;
      keyFrames.push({ label: 'KO / Victory', frame: idx });
    }
  }

  return {
    label: spec.name,
    subtitle: `Finisher (${spec.inspiration}) · ${spec.durationFrames}f · impact f${spec.impactFrame} · zoom ${spec.cameraZoom}x`,
    p1Char,
    p2Char,
    stageId,
    p1X: p1Px,
    p2X: p2Px,
    frames,
    keyFrames: dedupeKeyFrames(keyFrames, frames.length - 1),
  };
}

function findBossOwner(specialId: string, fallback: CharacterId): CharacterId {
  for (const charId of Object.keys(BOSS_SPECIALS_BY_CHAR) as CharacterId[]) {
    if (BOSS_SPECIALS_BY_CHAR[charId].some((s) => s.id === specialId)) {
      return charId;
    }
  }
  return fallback;
}

function buildBossSpecialSequence(
  specialId: string,
  p1Char: CharacterId,
  p2Char: CharacterId,
  stageId: StageId,
  hitTarget: boolean,
  p1PxOverride?: number,
  p2PxOverride?: number,
): LabSequence {
  const ownerChar = findBossOwner(specialId, p2Char === 'hero' ? 'warden' : p2Char);
  const spec = findBossSpecial(specialId) ?? BOSS_SPECIALS_BY_CHAR.warden[0]!;
  const p1Px = clampStagePx(p1PxOverride ?? (hitTarget ? 480 : spec.coverage === 'half_arena' ? 960 : 480));
  const p2Px = clampStagePx(p2PxOverride ?? 860);
  let state = makeBaseFightingState(p1Char, ownerChar, stageId, p1Px, p2Px, false);

  const built = spawnBossSpecialById(state.fighters[1], spec.id, 1);
  if (built) {
    state = {
      ...state,
      bossSpecials: [built.special],
      nextBossSpecialId: built.nextId,
      events: [built.event],
    };
  }

  const frames: GameState[] = [state];
  const keyFrames: LabKeyFrame[] = [
    { label: 'Telegraph Start', frame: 0 },
    { label: 'Telegraph Late', frame: Math.max(1, spec.telegraphFrames - 4) },
  ];
  let recordedActive = false;

  const totalBudget = spec.telegraphFrames + spec.activeFrames + 28;
  for (let i = 0; i < totalBudget; i += 1) {
    // When hitTarget is false on lowGround specials, jump over the wave to demonstrate counterplay!
    const jumpTiming = spec.lowGround && !hitTarget && i >= spec.telegraphFrames - 10 && i <= spec.telegraphFrames - 6;
    const input0: InputBitfield = jumpTiming ? INPUT_BITS.UP : 0;
    const next = step(state, [input0, 0]);
    const idx = frames.length;
    frames.push(next);
    state = next;

    if (!recordedActive && next.bossSpecials.some((sp) => sp.phase === 'active')) {
      recordedActive = true;
      keyFrames.push({ label: 'Active Start', frame: idx });
      keyFrames.push({ label: 'Active Mid', frame: idx + Math.floor(spec.activeFrames / 2) });
    }
  }
  keyFrames.push({ label: 'Aftermath', frame: frames.length - 1 });

  return {
    label: `${CHARACTERS[ownerChar].name} · ${spec.name}`,
    subtitle: `Boss Special · ${spec.coverage} ${spec.shape} · ${spec.telegraphFrames}f tel / ${spec.activeFrames}f act · ${spec.lowGround ? 'Low (Jump)' : spec.parryable ? 'Parryable' : 'Dodge Only'}`,
    p1Char,
    p2Char: ownerChar,
    stageId,
    p1X: p1Px,
    p2X: p2Px,
    frames,
    keyFrames: dedupeKeyFrames(keyFrames, frames.length - 1),
  };
}

function buildMoveSequence(
  moveKey: MoveId | 'combo_4hit',
  p1Char: CharacterId,
  p2Char: CharacterId,
  stageId: StageId,
  hitTarget: boolean,
  p1PxOverride?: number,
  p2PxOverride?: number,
): LabSequence {
  const p1Px = clampStagePx(p1PxOverride ?? 520);
  const p2Px = clampStagePx(p2PxOverride ?? (hitTarget ? 605 : 880));
  let state = makeBaseFightingState(p1Char, p2Char, stageId, p1Px, p2Px, true);

  if (moveKey === 'counter') {
    state = {
      ...state,
      fighters: [
        { ...state.fighters[0], counterWindow: BALANCE.COUNTER_WINDOW_FRAMES },
        state.fighters[1],
      ],
    };
  }

  const frames: GameState[] = [state];
  const keyFrames: LabKeyFrame[] = [];

  if (moveKey === 'combo_4hit') {
    let comboBudget = 220;
    const seenMoves = new Set<string>();
    while (comboBudget-- > 0) {
      const f0 = state.fighters[0];
      let input0: InputBitfield = 0;
      if (frames.length === 1) {
        input0 = INPUT_BITS.LIGHT;
      } else if (f0.action === 'attack' && f0.currentMove) {
        const m = MOVES[f0.currentMove];
        if (m.canCancelInto.length > 0 && f0.actionFrame >= m.cancelWindowStart - 2) {
          input0 = INPUT_BITS.LIGHT;
        }
      }
      const next = step(state, [input0, 0]);
      const idx = frames.length;
      frames.push(next);
      state = next;

      const mv = next.fighters[0].currentMove;
      if (mv && !seenMoves.has(mv)) {
        seenMoves.add(mv);
        keyFrames.push({ label: mv, frame: idx + MOVES[mv].startup });
      }
      if (seenMoves.has('light4') && next.fighters[0].action === 'idle' && next.fighters[0].actionFrame >= 6) {
        break;
      }
    }
    return {
      label: '4-Hit Light Combo',
      subtitle: 'light1 -> light2 -> light3 (aerial) -> light4',
      p1Char,
      p2Char,
      stageId,
      p1X: p1Px,
      p2X: p2Px,
      frames,
      keyFrames: dedupeKeyFrames(keyFrames, frames.length - 1),
    };
  }

  const move = MOVES[moveKey];
  const inputFlag: InputBitfield =
    moveKey === 'heavy'
      ? INPUT_BITS.HEAVY
      : moveKey === 'unblockable'
        ? INPUT_BITS.UNBLOCKABLE
        : moveKey === 'grab'
          ? INPUT_BITS.GRAB
          : INPUT_BITS.LIGHT;

  const totalFrames = getMoveTotalFrames(move) + move.hitstop + 14;
  let recordedStartup = false;
  let recordedActive = false;
  let recordedHit = false;
  let recordedRec = false;

  for (let i = 0; i < totalFrames; i += 1) {
    const next = step(state, [i === 0 ? inputFlag : 0, 0]);
    const idx = frames.length;
    frames.push(next);
    state = next;

    const f0 = next.fighters[0];
    if (!recordedStartup && f0.action === 'attack' && f0.actionFrame >= Math.floor(move.startup * 0.6)) {
      recordedStartup = true;
      keyFrames.push({ label: 'Startup', frame: idx });
    }
    if (!recordedActive && f0.action === 'attack' && f0.actionFrame >= move.startup) {
      recordedActive = true;
      keyFrames.push({ label: 'Active', frame: idx });
    }
    if (!recordedHit && next.events.some((e) => e.type === 'HIT')) {
      recordedHit = true;
      keyFrames.push({ label: 'Impact', frame: idx });
    }
    if (!recordedRec && f0.action === 'attack' && f0.actionFrame >= move.startup + move.active + 2) {
      recordedRec = true;
      keyFrames.push({ label: 'Recovery', frame: idx });
    }
  }

  return {
    label: `${move.name} (${move.id})`,
    subtitle: `Move · ${move.startup}f startup / ${move.active}f active / ${move.recovery}f recovery · ${move.damage} dmg`,
    p1Char,
    p2Char,
    stageId,
    p1X: p1Px,
    p2X: p2Px,
    frames,
    keyFrames: dedupeKeyFrames(keyFrames, frames.length - 1),
  };
}

function buildStateSequence(
  stateId: LabStateId,
  p1Char: CharacterId,
  p2Char: CharacterId,
  stageId: StageId,
  p1PxOverride?: number,
  p2PxOverride?: number,
): LabSequence {
  const defaultClose = stateId === 'parry_active' || stateId === 'guard_break';
  const p1Px = clampStagePx(p1PxOverride ?? (defaultClose ? 560 : 510));
  const p2Px = clampStagePx(p2PxOverride ?? (stateId === 'parry_active' ? 650 : stateId === 'guard_break' ? 640 : 770));
  let state = makeBaseFightingState(p1Char, p2Char, stageId, p1Px, p2Px, true);
  const frames: GameState[] = [];
  const keyFrames: LabKeyFrame[] = [];

  if (stateId === 'character_showcase' || stateId === 'idle') {
    frames.push(state);
    for (let i = 0; i < 60; i += 1) {
      state = step(state, [0, 0]);
      frames.push(state);
    }
    keyFrames.push({ label: 'Frame 0', frame: 0 }, { label: 'Mid Breath', frame: 30 });
  } else if (stateId === 'walk_fwd' || stateId === 'walk_back') {
    const dirBit = stateId === 'walk_fwd' ? INPUT_BITS.RIGHT : INPUT_BITS.LEFT;
    frames.push(state);
    for (let i = 0; i < 60; i += 1) {
      state = step(state, [dirBit, 0]);
      frames.push(state);
    }
    keyFrames.push({ label: 'Stride 1', frame: 12 }, { label: 'Stride 2', frame: 32 }, { label: 'Stride 3', frame: 52 });
  } else if (stateId === 'crouch') {
    frames.push(state);
    for (let i = 0; i < 45; i += 1) {
      state = step(state, [INPUT_BITS.DOWN, 0]);
      frames.push(state);
    }
    keyFrames.push({ label: 'Crouch', frame: 15 });
  } else if (stateId === 'jump') {
    frames.push(state);
    for (let i = 0; i < 54; i += 1) {
      state = step(state, [i === 0 ? INPUT_BITS.UP | INPUT_BITS.RIGHT : INPUT_BITS.RIGHT, 0]);
      frames.push(state);
    }
    keyFrames.push({ label: 'Takeoff', frame: 4 }, { label: 'Apex', frame: 19 }, { label: 'Landing', frame: 39 });
  } else if (stateId === 'dodge') {
    frames.push(state);
    for (let i = 0; i < 32; i += 1) {
      state = step(state, [i === 0 ? INPUT_BITS.DODGE | INPUT_BITS.RIGHT : 0, 0]);
      frames.push(state);
    }
    keyFrames.push({ label: 'Startup', frame: 2 }, { label: 'Invuln Mid', frame: 10 }, { label: 'Recovery', frame: 23 });
  } else if (stateId === 'parry_active') {
    frames.push(state);
    for (let i = 0; i < 65; i += 1) {
      const p1In = i >= 18 && i <= 32 ? INPUT_BITS.BLOCK : 0;
      const p2In = i === 0 ? INPUT_BITS.HEAVY : 0;
      state = step(state, [p1In, p2In]);
      const idx = frames.length;
      frames.push(state);
      if (state.events.some((e) => e.type === 'PARRY')) {
        keyFrames.push({ label: 'Parry Impact', frame: idx });
      }
    }
    keyFrames.push({ label: 'Counter Ready', frame: Math.min(frames.length - 1, (keyFrames[0]?.frame ?? 20) + 12) });
  } else if (stateId === 'parry_whiff') {
    frames.push(state);
    for (let i = 0; i < 34; i += 1) {
      state = step(state, [i === 0 ? INPUT_BITS.BLOCK : 0, 0]);
      frames.push(state);
    }
    keyFrames.push({ label: 'Parry Flash', frame: 1 }, { label: 'Whiff Stagger', frame: 8 });
  } else if (stateId === 'guard_break') {
    state = {
      ...state,
      fighters: [state.fighters[0], { ...state.fighters[1], guard: 20 }],
    };
    frames.push(state);
    for (let i = 0; i < 80; i += 1) {
      state = step(state, [i === 0 ? INPUT_BITS.HEAVY : 0, i < 45 ? INPUT_BITS.BLOCK : 0]);
      const idx = frames.length;
      frames.push(state);
      if (state.events.some((e) => e.type === 'GUARD_BREAK')) {
        keyFrames.push({ label: 'Guard Break', frame: idx });
      }
    }
  } else if (stateId === 'knockdown_getup') {
    state = {
      ...state,
      fighters: [state.fighters[0], { ...state.fighters[1], action: 'knockdown', actionFrame: 0 }],
    };
    frames.push(state);
    for (let i = 0; i < BALANCE.KNOCKDOWN_FRAMES + BALANCE.GETUP_FRAMES + 10; i += 1) {
      state = step(state, [0, 0]);
      frames.push(state);
    }
    keyFrames.push(
      { label: 'Knockdown', frame: 10 },
      { label: 'Getup Hand', frame: BALANCE.KNOCKDOWN_FRAMES + 6 },
      { label: 'Getup Knee', frame: BALANCE.KNOCKDOWN_FRAMES + 16 },
      { label: 'Recovered', frame: BALANCE.KNOCKDOWN_FRAMES + BALANCE.GETUP_FRAMES + 2 },
    );
  } else if (stateId === 'slab_hazard') {
    state = {
      ...state,
      config: { ...state.config, enableHazards: true },
      hazards: [{ id: 1, x: 640_000, phase: 'telegraph', frame: 0, hitMask: 0 }],
      events: [{ type: 'SLAB_TELEGRAPH', slabId: 1, x: 640_000 }],
    };
    frames.push(state);
    const total = BALANCE.SLAB_TELEGRAPH_FRAMES + BALANCE.SLAB_ACTIVE_FRAMES + BALANCE.SLAB_RECOVERY_FRAMES + 4;
    for (let i = 0; i < total; i += 1) {
      state = step(state, [0, 0]);
      const idx = frames.length;
      frames.push(state);
      if (state.events.some((e) => e.type === 'SLAB_BURST')) {
        keyFrames.push({ label: 'Slab Burst', frame: idx });
      }
    }
    keyFrames.unshift({ label: 'Telegraph', frame: Math.floor(BALANCE.SLAB_TELEGRAPH_FRAMES * 0.7) });
  }

  return {
    label: LAB_STATE_ITEMS.find((s) => s.id === stateId)?.label ?? stateId,
    subtitle: `${CHARACTERS[p1Char].name} vs ${CHARACTERS[p2Char].name} · ${frames.length} frames`,
    p1Char,
    p2Char,
    stageId,
    p1X: p1Px,
    p2X: p2Px,
    frames,
    keyFrames: dedupeKeyFrames(keyFrames, frames.length - 1),
  };
}

/** Builds a deterministic frame-by-frame LabSequence for any category/item. */
export function buildLabSequence(req: LabScenarioRequest): LabSequence {
  const hitTarget = req.hitTarget ?? true;
  switch (req.category) {
    case 'player_special':
      return buildPlayerSpecialSequence(
        req.id as PlayerSpecialId,
        req.p1Char,
        req.p2Char,
        req.stageId,
        req.p1X,
        req.p2X,
      );
    case 'finisher':
      return buildFinisherSequence(
        req.id as FinisherId,
        req.p1Char,
        req.p2Char,
        req.stageId,
        req.p1X,
        req.p2X,
      );
    case 'boss_special':
      return buildBossSpecialSequence(
        req.id,
        req.p1Char,
        req.p2Char,
        req.stageId,
        hitTarget,
        req.p1X,
        req.p2X,
      );
    case 'move':
      return buildMoveSequence(
        req.id as MoveId | 'combo_4hit',
        req.p1Char,
        req.p2Char,
        req.stageId,
        hitTarget,
        req.p1X,
        req.p2X,
      );
    case 'state':
      return buildStateSequence(
        req.id as LabStateId,
        req.p1Char,
        req.p2Char,
        req.stageId,
        req.p1X,
        req.p2X,
      );
  }
}
