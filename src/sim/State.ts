import type { CharacterId } from '../data/characters';
import type { FinisherId } from '../data/finishers';
import type { MoveId } from '../data/moves';
import type { PlayerSpecialId } from '../data/specials';
import type { StageId } from '../data/stages';

/** Compact bitfield flags for one frame of fighter input. */
export const INPUT_BITS = {
  LEFT: 1 << 0,
  RIGHT: 1 << 1,
  UP: 1 << 2,
  DOWN: 1 << 3,
  LIGHT: 1 << 4,
  HEAVY: 1 << 5,
  BLOCK: 1 << 6,
  DODGE: 1 << 7,
  GRAB: 1 << 8,
  UNBLOCKABLE: 1 << 9,
  SPECIAL: 1 << 10,
  BOSS_SPECIAL: 1 << 11,
} as const;

/** A single frame of input encoded as an integer bitmask. */
export type InputBitfield = number;

/** Fighter slot index: 0 = Player 1, 1 = Player 2. */
export type FighterSlot = 0 | 1;

/** High-level fighter state machine states. */
export type FighterAction =
  | 'idle'
  | 'walk'
  | 'crouch'
  | 'jump'
  | 'attack'
  | 'block'
  | 'parry_active'
  | 'parry_whiff'
  | 'dodge'
  | 'hitstun'
  | 'blockstun'
  | 'parry_stagger'
  | 'guard_break'
  | 'execution_atk'
  | 'execution_vic'
  | 'finisher_atk'
  | 'finisher_vic'
  | 'special_startup'
  | 'special_atk'
  | 'special_vic'
  | 'knockdown'
  | 'getup'
  | 'ko'
  | 'victory';

/** Buffered action intent stored inside FighterState for deterministic 6-frame buffering. */
export type BufferedIntent = 'none' | 'light' | 'heavy' | 'unblockable' | 'grab' | 'dodge' | 'jump' | 'special';

/** Serializable fighter state. All coordinates and velocities are fixed-point integers. */
export interface FighterState {
  readonly slot: FighterSlot;
  readonly charId: CharacterId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly facing: 1 | -1;
  readonly grounded: boolean;
  readonly hp: number;
  readonly maxHp: number;
  readonly guard: number;
  readonly maxGuard: number;
  readonly guardRegenTimer: number;
  readonly action: FighterAction;
  readonly actionFrame: number;
  readonly stunFrames: number;
  readonly currentMove: MoveId | null;
  readonly moveHitLanded: boolean;
  readonly lastMoveUsed: MoveId | null;
  readonly parryCooldown: number;
  readonly counterWindow: number;
  readonly executionCooldown: number;
  readonly lightChainCooldown: number;
  readonly specialMeter: number;
  readonly bossSpecialCooldown: number;
  readonly slowFrames: number;
  readonly coyoteFrames: number;
  readonly comboCount: number;
  readonly comboTimer: number;
  readonly prevInput: InputBitfield;
  readonly bufferedIntent: BufferedIntent;
  readonly bufferFrames: number;
  readonly dodgeDir: 1 | -1;
  readonly perfectDodgeTriggered: boolean;
}

/** Stage hazard: coffin-shaped stone slab bursting up from the floor. */
export interface HazardSlab {
  readonly id: number;
  readonly x: number;
  readonly phase: 'telegraph' | 'active' | 'recovery';
  readonly frame: number;
  readonly hitMask: number;
}

/** Round lifecycle phase. */
/** Active half-arena or full-arena boss special zone. */
export interface ActiveBossSpecial {
  readonly id: number;
  readonly ownerSlot: FighterSlot;
  readonly specialId: string;
  readonly left: number;
  readonly right: number;
  readonly lowGround: boolean;
  readonly parryable: boolean;
  readonly phase: 'telegraph' | 'active';
  readonly frame: number;
  readonly telegraphFrames: number;
  readonly activeFrames: number;
  readonly damage: number;
  readonly guardDamage: number;
  readonly hitMask: number;
}

/** Active player cinematic special sequence state. */
export interface ActivePlayerSpecial {
  readonly attacker: FighterSlot;
  readonly victim: FighterSlot;
  readonly specialId: PlayerSpecialId;
  readonly frame: number;
}

export type MatchPhase = 'intro' | 'fighting' | 'special' | 'finisher' | 'round_end' | 'match_end';

/** Per-match combat telemetry used for results screen and daily score. */
export interface FighterStats {
  readonly damageDealt: number;
  readonly hitsLanded: number;
  readonly parries: number;
  readonly perfectDodges: number;
  readonly guardBreaks: number;
  readonly finishers: number;
  readonly maxCombo: number;
}

/** Match setup parameters stored in GameState for deterministic round resets. */
export interface MatchConfig {
  readonly seed: number;
  readonly stageId: StageId;
  readonly p1Char: CharacterId;
  readonly p2Char: CharacterId;
  readonly roundsToWin: number;
  readonly roundTimerFrames: number;
  readonly enableHazards: boolean;
  readonly parryAssist: boolean;
  readonly infiniteGuardP2: boolean;
  readonly trainingMode: boolean;
}

/** Typed simulation events emitted each step for render and audio systems. */
export type SimEvent =
  | { readonly type: 'ROUND_START'; readonly round: number }
  | { readonly type: 'ATTACK_START'; readonly slot: FighterSlot; readonly move: MoveId; readonly x: number; readonly y: number; readonly facing: 1 | -1 }
  | { readonly type: 'UNBLOCKABLE_TELEGRAPH'; readonly slot: FighterSlot; readonly x: number; readonly y: number }
  | { readonly type: 'HIT'; readonly attacker: FighterSlot; readonly defender: FighterSlot; readonly move: MoveId; readonly damage: number; readonly x: number; readonly y: number; readonly isHeavy: boolean; readonly isCounter: boolean }
  | { readonly type: 'BLOCK'; readonly attacker: FighterSlot; readonly defender: FighterSlot; readonly guardRemaining: number; readonly x: number; readonly y: number }
  | { readonly type: 'PARRY'; readonly parrier: FighterSlot; readonly attacker: FighterSlot; readonly x: number; readonly y: number }
  | { readonly type: 'PARRY_WHIFF'; readonly slot: FighterSlot; readonly x: number; readonly y: number }
  | { readonly type: 'GUARD_BREAK'; readonly victim: FighterSlot; readonly x: number; readonly y: number }
  | { readonly type: 'DODGE'; readonly slot: FighterSlot; readonly x: number; readonly y: number; readonly dir: 1 | -1 }
  | { readonly type: 'PERFECT_DODGE'; readonly dodger: FighterSlot; readonly x: number; readonly y: number }
  | { readonly type: 'EXECUTION'; readonly attacker: FighterSlot; readonly victim: FighterSlot; readonly x: number; readonly y: number }
  | { readonly type: 'FINISHER_START'; readonly attacker: FighterSlot; readonly victim: FighterSlot; readonly finisherId: FinisherId; readonly x: number; readonly y: number }
  | { readonly type: 'FINISHER_BEAT'; readonly attacker: FighterSlot; readonly victim: FighterSlot; readonly finisherId: FinisherId; readonly beatIndex: number; readonly x: number; readonly y: number }
  | { readonly type: 'FINISHER_IMPACT'; readonly attacker: FighterSlot; readonly victim: FighterSlot; readonly finisherId: FinisherId; readonly x: number; readonly y: number }
  | { readonly type: 'SLAB_TELEGRAPH'; readonly slabId: number; readonly x: number }
  | { readonly type: 'SLAB_BURST'; readonly slabId: number; readonly x: number }
  | { readonly type: 'LAND'; readonly slot: FighterSlot; readonly x: number; readonly y: number }
  | { readonly type: 'KO'; readonly winner: FighterSlot; readonly loser: FighterSlot; readonly x: number; readonly y: number }
  | { readonly type: 'ROUND_END'; readonly winner: FighterSlot | null; readonly round: number }
  | { readonly type: 'PLAYER_SPECIAL_START'; readonly attacker: FighterSlot; readonly victim: FighterSlot; readonly specialId: PlayerSpecialId; readonly x: number; readonly y: number }
  | { readonly type: 'PLAYER_SPECIAL_BEAT'; readonly attacker: FighterSlot; readonly victim: FighterSlot; readonly specialId: PlayerSpecialId; readonly beatIndex: number; readonly x: number; readonly y: number }
  | { readonly type: 'PLAYER_SPECIAL_IMPACT'; readonly attacker: FighterSlot; readonly victim: FighterSlot; readonly specialId: PlayerSpecialId; readonly x: number; readonly y: number }
  | { readonly type: 'PLAYER_SPECIAL_DENIED'; readonly attacker: FighterSlot; readonly defender: FighterSlot; readonly reason: 'parry' | 'perfect_dodge'; readonly x: number; readonly y: number }
  | { readonly type: 'BOSS_SPECIAL_TELEGRAPH'; readonly owner: FighterSlot; readonly specialId: string; readonly name: string; readonly left: number; readonly right: number }
  | { readonly type: 'BOSS_SPECIAL_ACTIVE'; readonly owner: FighterSlot; readonly specialId: string; readonly left: number; readonly right: number }
  | { readonly type: 'KNOCKDOWN'; readonly victim: FighterSlot; readonly x: number; readonly y: number }
  | { readonly type: 'MATCH_END'; readonly winner: FighterSlot | null };

/** Complete serializable game simulation state. */
export interface GameState {
  readonly frame: number;
  readonly round: number;
  readonly phase: MatchPhase;
  readonly phaseFrame: number;
  readonly roundTimer: number;
  readonly hitstopFrames: number;
  readonly rngState: number;
  readonly config: MatchConfig;
  readonly fighters: readonly [FighterState, FighterState];
  readonly scores: readonly [number, number];
  readonly stats: readonly [FighterStats, FighterStats];
  readonly hazards: readonly HazardSlab[];
  readonly hazardTimer: number;
  readonly nextHazardId: number;
  readonly bossSpecials: readonly ActiveBossSpecial[];
  readonly nextBossSpecialId: number;
  readonly activeSpecial: ActivePlayerSpecial | null;
  readonly activeFinisherId: FinisherId | null;
  readonly finisherAttacker: FighterSlot | null;
  readonly winner: FighterSlot | null;
  readonly events: readonly SimEvent[];
}
