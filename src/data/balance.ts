/**
 * Central combat and game-feel balance constants.
 * All spatial values are fixed-point integers where 1000 = 1 logical pixel.
 * All durations are in 60 Hz simulation frames.
 */
export const BALANCE = {
  /** Fixed-point multiplier: 1000 units = 1 pixel. */
  FP_SCALE: 1000,
  /** Simulation tick rate in Hz. */
  TICK_RATE: 60,

  /** Arena logical dimensions in pixels (multiplied by FP_SCALE in sim). */
  STAGE_WIDTH_PX: 1280,
  STAGE_LEFT_PX: 90,
  STAGE_RIGHT_PX: 1190,
  FLOOR_Y_PX: 540,

  /** Fighter physical dimensions in fixed-point units. */
  FIGHTER_HALF_WIDTH: 24_000,
  FIGHTER_HEIGHT: 116_000,
  FIGHTER_CROUCH_HEIGHT: 74_000,
  PUSHBOX_HALF_WIDTH: 26_000,

  /** Starting fighter vitals. */
  MAX_HP: 100,
  MAX_GUARD: 100,
  GUARD_REGEN_PER_TICK_NUM: 1,
  /** Regenerates 1 guard point every N idle frames. */
  GUARD_REGEN_INTERVAL: 6,
  /** Block reduces incoming normal damage by 80% (takes 20%). */
  BLOCK_DAMAGE_PERCENT: 20,
  /** Minimum chip damage on blocked attack. */
  BLOCK_MIN_CHIP: 1,

  /** Movement speeds in fixed-point units per frame. */
  WALK_SPEED: 4_400,
  BACKWALK_SPEED: 3_400,
  BLOCK_WALK_SPEED: 1_800,
  JUMP_VELOCITY_Y: -15_500,
  GRAVITY: 820,
  FRICTION: 1_100,
  AIR_DRAG: 150,

  /** Dodge parameters (18 frames total, invincible frames 4..12). */
  DODGE_TOTAL_FRAMES: 26,
  DODGE_INVULN_START: 4,
  DODGE_INVULN_END: 21,
  DODGE_SPEED: 11_200,
  /** Last-moment dodge window (within first 4 frames of dodge when hit overlaps). */
  PERFECT_DODGE_WINDOW: 6,
  /** Opponent sim-level slow duration after perfect dodge. */
  PERFECT_DODGE_SLOW_FRAMES: 30,
  /** Opponent updates once every N frames while slowed. */
  PERFECT_DODGE_SLOW_DIVISOR: 3,

  /** Parry & guard break parameters. */
  PARRY_WINDOW_FRAMES: 12,
  /** Extra parry frames when parry-assist accessibility option is enabled. */
  PARRY_ASSIST_BONUS_FRAMES: 4,
  PARRY_STAGGER_FRAMES: 40,
  PARRY_WHIFF_RECOVERY_FRAMES: 20,
  PARRY_HITSTOP_FRAMES: 10,
  GUARD_BREAK_STUN_FRAMES: 60,
  GUARD_BREAK_HITSTOP_FRAMES: 12,
  COUNTER_WINDOW_FRAMES: 36,

  /** Stagger execution (non-lethal finisher on guard-broken opponent with HP > 0). */
  EXECUTION_COOLDOWN_FRAMES: 900, // 15 seconds at 60 Hz
  EXECUTION_DAMAGE: 24,
  EXECUTION_HEAL: 12,
  EXECUTION_DURATION_FRAMES: 26,

  /** Cinematic lethal finisher duration in sim frames. */
  FINISHER_DURATION_FRAMES: 54,
  KO_HITSTOP_FRAMES: 14,
  ROUND_START_FREEZE_FRAMES: 45,
  ROUND_END_FRAMES: 90,

  /** Input buffer length in frames for attacks, dodge, jump, grab. */
  INPUT_BUFFER_FRAMES: 6,
  /** Brief anti-spam cooldown after completing a 4-hit light combo. */
  LIGHT_CHAIN_COOLDOWN_FRAMES: 30,
  /** Brief cooldown after ending any light attack without chaining to prevent LMB mash spam. */
  LIGHT_WHIFF_COOLDOWN_FRAMES: 16,

  /** Player Special Power meter (0..100), recharged ONLY by Parry and Perfect Dodge. */
  MAX_SPECIAL_METER: 100,
  SPECIAL_GAIN_ON_PARRY: 34,
  SPECIAL_GAIN_ON_PERFECT_DODGE: 34,

  /** Knockdown & invulnerable get-up animation frames after a player special attack. */
  KNOCKDOWN_FRAMES: 24,
  GETUP_FRAMES: 30,

  /** Boss arena special cooldown in frames (~4.2 seconds). */
  BOSS_SPECIAL_COOLDOWN_FRAMES: 250,
  /** Coyote time after leaving a ledge/jump initiation window. */
  COYOTE_FRAMES: 4,

  /** Default round timer (99 seconds = 5940 frames). */
  DEFAULT_ROUND_TIMER_FRAMES: 99 * 60,
  /** Best of 3 rounds => 2 rounds to win. */
  ROUNDS_TO_WIN: 2,

  /** Coffin slab boss hazard defaults. */
  SLAB_TELEGRAPH_FRAMES: 38,
  SLAB_ACTIVE_FRAMES: 16,
  SLAB_RECOVERY_FRAMES: 24,
  SLAB_HALF_WIDTH: 36_000,
  SLAB_HEIGHT: 148_000,
  SLAB_DAMAGE: 20,
  SLAB_GUARD_DAMAGE: 35,
  SLAB_INTERVAL_FRAMES: 240,
} as const;
