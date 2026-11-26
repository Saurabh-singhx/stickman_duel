/**
 * Identifiers for all combat moves available to fighters.
 */
export type MoveId =
  | 'light1'
  | 'light2'
  | 'light3'
  | 'light4'
  | 'heavy'
  | 'unblockable'
  | 'grab'
  | 'counter';

/**
 * Pure frame-data specification for a single attack move.
 * All distances are in fixed-point units (1000 = 1px).
 * Paced deliberately at 60 Hz so every windup, swing, parry, and dodge is readable and weighty.
 */
export interface MoveSpec {
  readonly id: MoveId;
  readonly name: string;
  readonly startup: number;
  readonly active: number;
  readonly recovery: number;
  readonly damage: number;
  readonly guardDamage: number;
  readonly hitstop: number;
  readonly hitstun: number;
  readonly blockstun: number;
  readonly pushback: number;
  readonly lunge: number;
  readonly rangeX: number;
  readonly offsetY: number;
  readonly halfHeight: number;
  readonly unblockable: boolean;
  readonly isGrab: boolean;
  readonly isCounter: boolean;
  readonly canCancelInto: readonly MoveId[];
  /** Frame when combo follow-up may begin (end of recovery: no mid-swing animation canceling). */
  readonly cancelWindowStart: number;
}

/**
 * Master move table used by the deterministic simulation.
 * 4-hit light combo plays each full animation in sequence:
 *   1. light1: Normal Sword Swing
 *   2. light2: Rising Uppercut Sword
 *   3. light3: Jump Sword Cleave (leaps into the air!)
 *   4. light4: Dusk Finisher Thrust (followed by anti-spam cooldown)
 */
export const MOVES: Record<MoveId, MoveSpec> = {
  light1: {
    id: 'light1',
    name: 'Normal Sword Swing',
    startup: 12,
    active: 5,
    recovery: 18,
    damage: 8,
    guardDamage: 10,
    hitstop: 6,
    hitstun: 22,
    blockstun: 14,
    pushback: 4_200,
    lunge: 3_600,
    rangeX: 98_000,
    offsetY: -64_000,
    halfHeight: 34_000,
    unblockable: false,
    isGrab: false,
    isCounter: false,
    canCancelInto: ['light2'],
    cancelWindowStart: 32,
  },
  light2: {
    id: 'light2',
    name: 'Uppercut Sword',
    startup: 14,
    active: 5,
    recovery: 20,
    damage: 9,
    guardDamage: 12,
    hitstop: 6,
    hitstun: 24,
    blockstun: 14,
    pushback: 4_600,
    lunge: 4_200,
    rangeX: 104_000,
    offsetY: -72_000,
    halfHeight: 42_000,
    unblockable: false,
    isGrab: false,
    isCounter: false,
    canCancelInto: ['light3'],
    cancelWindowStart: 36,
  },
  light3: {
    id: 'light3',
    name: 'Jump Sword Cleave',
    startup: 16,
    active: 6,
    recovery: 22,
    damage: 11,
    guardDamage: 15,
    hitstop: 7,
    hitstun: 26,
    blockstun: 16,
    pushback: 5_400,
    lunge: 5_400,
    rangeX: 112_000,
    offsetY: -66_000,
    halfHeight: 44_000,
    unblockable: false,
    isGrab: false,
    isCounter: false,
    canCancelInto: ['light4'],
    cancelWindowStart: 41,
  },
  light4: {
    id: 'light4',
    name: 'Dusk Finisher Thrust',
    startup: 16,
    active: 6,
    recovery: 28,
    damage: 14,
    guardDamage: 20,
    hitstop: 9,
    hitstun: 28,
    blockstun: 18,
    pushback: 12_000,
    lunge: 7_400,
    rangeX: 122_000,
    offsetY: -62_000,
    halfHeight: 38_000,
    unblockable: false,
    isGrab: false,
    isCounter: false,
    canCancelInto: [],
    cancelWindowStart: 99,
  },
  heavy: {
    id: 'heavy',
    name: 'Cleaving Arc',
    startup: 24,
    active: 6,
    recovery: 32,
    damage: 24,
    guardDamage: 34,
    hitstop: 11,
    hitstun: 30,
    blockstun: 20,
    pushback: 14_000,
    lunge: 7_800,
    rangeX: 130_000,
    offsetY: -68_000,
    halfHeight: 46_000,
    unblockable: false,
    isGrab: false,
    isCounter: false,
    canCancelInto: [],
    cancelWindowStart: 99,
  },
  unblockable: {
    id: 'unblockable',
    name: 'Crimson Rend',
    startup: 32,
    active: 6,
    recovery: 30,
    damage: 28,
    guardDamage: 100,
    hitstop: 12,
    hitstun: 32,
    blockstun: 0,
    pushback: 15_000,
    lunge: 9_600,
    rangeX: 132_000,
    offsetY: -62_000,
    halfHeight: 40_000,
    unblockable: true,
    isGrab: false,
    isCounter: false,
    canCancelInto: [],
    cancelWindowStart: 99,
  },
  grab: {
    id: 'grab',
    name: 'Pommel Throw',
    startup: 16,
    active: 5,
    recovery: 24,
    damage: 14,
    guardDamage: 25,
    hitstop: 8,
    hitstun: 28,
    blockstun: 0,
    pushback: 12_000,
    lunge: 4_500,
    rangeX: 68_000,
    offsetY: -58_000,
    halfHeight: 38_000,
    unblockable: false,
    isGrab: true,
    isCounter: false,
    canCancelInto: [],
    cancelWindowStart: 99,
  },
  counter: {
    id: 'counter',
    name: 'Golden Riposte',
    startup: 9,
    active: 6,
    recovery: 18,
    damage: 28,
    guardDamage: 40,
    hitstop: 12,
    hitstun: 32,
    blockstun: 0,
    pushback: 13_500,
    lunge: 10_500,
    rangeX: 138_000,
    offsetY: -64_000,
    halfHeight: 44_000,
    unblockable: true,
    isGrab: false,
    isCounter: true,
    canCancelInto: [],
    cancelWindowStart: 99,
  },
};

/**
 * Returns total duration of a move in 60 Hz frames.
 */
export function getMoveTotalFrames(move: MoveSpec): number {
  return move.startup + move.active + move.recovery;
}
