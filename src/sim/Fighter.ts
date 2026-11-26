import { BALANCE } from '../data/balance';
import { CHARACTERS, type CharacterId } from '../data/characters';
import { getMoveTotalFrames, MOVES, type MoveId } from '../data/moves';
import { approachInt, clampInt, scalePercent } from './Fixed';
import {
  INPUT_BITS,
  type BufferedIntent,
  type FighterSlot,
  type FighterState,
  type InputBitfield,
  type MatchConfig,
  type SimEvent,
} from './State';

/**
 * Creates a fresh FighterState positioned on their starting side of the arena.
 */
export function createFighter(slot: FighterSlot, charId: CharacterId): FighterState {
  const spec = CHARACTERS[charId];
  const startX = slot === 0 ? 410_000 : 870_000;
  const floorY = BALANCE.FLOOR_Y_PX * BALANCE.FP_SCALE;
  return {
    slot,
    charId,
    x: startX,
    y: floorY,
    vx: 0,
    vy: 0,
    facing: slot === 0 ? 1 : -1,
    grounded: true,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    guard: spec.maxGuard,
    maxGuard: spec.maxGuard,
    guardRegenTimer: 0,
    action: 'idle',
    actionFrame: 0,
    stunFrames: 0,
    currentMove: null,
    moveHitLanded: false,
    lastMoveUsed: null,
    parryCooldown: 0,
    counterWindow: 0,
    executionCooldown: 0,
    lightChainCooldown: 0,
    specialMeter: 0,
    bossSpecialCooldown: 90,
    slowFrames: 0,
    coyoteFrames: 0,
    comboCount: 0,
    comboTimer: 0,
    prevInput: 0,
    bufferedIntent: 'none',
    bufferFrames: 0,
    dodgeDir: slot === 0 ? 1 : -1,
    perfectDodgeTriggered: false,
  };
}

/**
 * Checks whether a fighter is currently in the invincible frames of a dodge.
 */
export function isDodgeInvincible(f: FighterState): boolean {
  return (
    f.action === 'dodge' &&
    f.actionFrame >= BALANCE.DODGE_INVULN_START &&
    f.actionFrame <= BALANCE.DODGE_INVULN_END
  );
}

/**
 * Checks whether a fighter is invulnerable on the ground (knockdown or getting up).
 */
export function isWakeupInvincible(f: FighterState): boolean {
  return f.action === 'knockdown' || f.action === 'getup';
}

/**
 * Checks whether a fighter is within the last-moment perfect dodge window.
 */
export function isPerfectDodgeWindow(f: FighterState): boolean {
  return f.action === 'dodge' && f.actionFrame <= BALANCE.PERFECT_DODGE_WINDOW;
}

/**
 * Returns the effective parry window in frames, accounting for parry-assist.
 */
export function getParryWindowFrames(config: MatchConfig): number {
  return (
    BALANCE.PARRY_WINDOW_FRAMES + (config.parryAssist ? BALANCE.PARRY_ASSIST_BONUS_FRAMES : 0)
  );
}

/**
 * Extracts newly pressed action intent for the 6-frame input buffer.
 */
function detectNewIntent(input: InputBitfield, prev: InputBitfield): BufferedIntent {
  const pressed = input & ~prev;
  if (pressed & INPUT_BITS.SPECIAL) return 'special';
  if (pressed & INPUT_BITS.UNBLOCKABLE) return 'unblockable';
  if ((pressed & INPUT_BITS.HEAVY) && (input & INPUT_BITS.DOWN)) return 'unblockable';
  if (pressed & INPUT_BITS.GRAB) return 'grab';
  if (pressed & INPUT_BITS.DODGE) return 'dodge';
  if (pressed & INPUT_BITS.HEAVY) return 'heavy';
  if (pressed & INPUT_BITS.LIGHT) return 'light';
  if (pressed & INPUT_BITS.UP) return 'jump';
  return 'none';
}

export interface FighterStepResult {
  readonly fighter: FighterState;
  readonly events: readonly SimEvent[];
}

/**
 * Advances a single fighter's state machine and physics by one 60 Hz simulation frame.
 */
export function stepFighter(
  f: FighterState,
  opponent: FighterState,
  input: InputBitfield,
  config: MatchConfig,
  canAct: boolean,
): FighterStepResult {
  const events: SimEvent[] = [];
  const spec = CHARACTERS[f.charId];
  const floorY = BALANCE.FLOOR_Y_PX * BALANCE.FP_SCALE;
  const minX = BALANCE.STAGE_LEFT_PX * BALANCE.FP_SCALE;
  const maxX = BALANCE.STAGE_RIGHT_PX * BALANCE.FP_SCALE;

  // Tick down cooldowns & windows
  let parryCooldown = f.parryCooldown > 0 ? f.parryCooldown - 1 : 0;
  let counterWindow = f.counterWindow > 0 ? f.counterWindow - 1 : 0;
  const executionCooldown = f.executionCooldown > 0 ? f.executionCooldown - 1 : 0;
  let lightChainCooldown = f.lightChainCooldown > 0 ? f.lightChainCooldown - 1 : 0;
  const bossSpecialCooldown = f.bossSpecialCooldown > 0 ? f.bossSpecialCooldown - 1 : 0;
  let specialMeter = f.specialMeter;
  const comboTimer = f.comboTimer > 0 ? f.comboTimer - 1 : 0;
  const comboCount = comboTimer === 0 ? 0 : f.comboCount;

  // Update 6-frame input buffer
  const newIntent = canAct ? detectNewIntent(input, f.prevInput) : 'none';
  let bufferedIntent: BufferedIntent = f.bufferedIntent;
  let bufferFrames = f.bufferFrames > 0 ? f.bufferFrames - 1 : 0;
  if (newIntent !== 'none') {
    bufferedIntent = newIntent;
    bufferFrames = BALANCE.INPUT_BUFFER_FRAMES;
  } else if (bufferFrames === 0) {
    bufferedIntent = 'none';
  }

  let { x, y, vx, vy, facing, grounded, action, actionFrame, stunFrames } = f;
  let { currentMove, moveHitLanded, lastMoveUsed, guard, guardRegenTimer } = f;
  let { coyoteFrames, dodgeDir, perfectDodgeTriggered } = f;

  const blockPressed = canAct && (input & INPUT_BITS.BLOCK) !== 0;
  const blockJustPressed = canAct && ((input & ~f.prevInput) & INPUT_BITS.BLOCK) !== 0;
  const left = canAct && (input & INPUT_BITS.LEFT) !== 0;
  const right = canAct && (input & INPUT_BITS.RIGHT) !== 0;
  const down = canAct && (input & INPUT_BITS.DOWN) !== 0;
  const moveDir: -1 | 0 | 1 = left && !right ? -1 : right && !left ? 1 : 0;

  // Auto-face opponent in neutral states
  if (action === 'idle' || action === 'walk' || action === 'crouch' || action === 'block') {
    if (opponent.x > x + 2_000) facing = 1;
    else if (opponent.x < x - 2_000) facing = -1;
  }

  const startAttack = (moveId: MoveId): void => {
    const m = MOVES[moveId];
    action = 'attack';
    actionFrame = 0;
    currentMove = moveId;
    moveHitLanded = false;
    lastMoveUsed = moveId;
    bufferedIntent = 'none';
    bufferFrames = 0;
    vx = facing * scalePercent(m.lunge, spec.speedPercent);
    if (moveId === 'light3' && grounded) {
      // Jump Sword Cleave: launches the fighter into a crisp aerial arc
      vy = -10_200;
      grounded = false;
    }
    if (moveId === 'counter') {
      counterWindow = 0;
    }
    events.push({ type: 'ATTACK_START', slot: f.slot, move: moveId, x, y, facing });
    if (m.unblockable && !m.isCounter) {
      events.push({ type: 'UNBLOCKABLE_TELEGRAPH', slot: f.slot, x, y });
    }
  };

  // Advance state machine
  if (
    action === 'hitstun' ||
    action === 'blockstun' ||
    action === 'parry_stagger' ||
    action === 'guard_break' ||
    action === 'parry_whiff'
  ) {
    // Allow defender in blockstun to time a fresh parry against follow-up hits of a 4-hit combo
    if (action === 'blockstun' && canAct && blockJustPressed && grounded && stunFrames <= 6) {
      action = 'parry_active';
      actionFrame = 0;
      stunFrames = 0;
      parryCooldown = 0;
      vx = 0;
    } else {
      actionFrame += 1;
      stunFrames -= 1;
      vx = approachInt(vx, 0, BALANCE.FRICTION);
      if (stunFrames <= 0) {
        action = grounded ? 'idle' : 'jump';
        actionFrame = 0;
        stunFrames = 0;
      }
    }
  } else if (action === 'execution_atk' || action === 'execution_vic') {
    actionFrame += 1;
    vx = approachInt(vx, 0, BALANCE.FRICTION);
    if (actionFrame >= BALANCE.EXECUTION_DURATION_FRAMES) {
      action = 'idle';
      actionFrame = 0;
    }
  } else if (action === 'knockdown') {
    actionFrame += 1;
    vx = approachInt(vx, 0, BALANCE.FRICTION);
    if (actionFrame >= BALANCE.KNOCKDOWN_FRAMES) {
      action = 'getup';
      actionFrame = 0;
    }
  } else if (action === 'getup') {
    actionFrame += 1;
    vx = approachInt(vx, 0, BALANCE.FRICTION);
    if (actionFrame >= BALANCE.GETUP_FRAMES) {
      action = 'idle';
      actionFrame = 0;
    }
  } else if (action === 'special_startup') {
    actionFrame += 1;
    vx = approachInt(vx, 0, BALANCE.FRICTION);
  } else if (action === 'special_atk' || action === 'special_vic' || action === 'finisher_atk' || action === 'finisher_vic' || action === 'ko' || action === 'victory') {
    actionFrame += 1;
    vx = approachInt(vx, 0, BALANCE.FRICTION);
  } else if (action === 'dodge') {
    actionFrame += 1;
    if (actionFrame <= BALANCE.DODGE_INVULN_END) {
      vx = dodgeDir * scalePercent(BALANCE.DODGE_SPEED, spec.speedPercent);
    } else {
      vx = approachInt(vx, 0, BALANCE.FRICTION * 2);
    }
    if (actionFrame >= BALANCE.DODGE_TOTAL_FRAMES) {
      action = grounded ? 'idle' : 'jump';
      actionFrame = 0;
      perfectDodgeTriggered = false;
    }
  } else if (action === 'parry_active') {
    actionFrame += 1;
    vx = approachInt(vx, 0, BALANCE.FRICTION);
    const windowFrames = getParryWindowFrames(config);
    if (!blockPressed) {
      // Released parry tap without parrying => whiff recovery to block spam
      action = 'parry_whiff';
      actionFrame = 0;
      stunFrames = BALANCE.PARRY_WHIFF_RECOVERY_FRAMES;
      parryCooldown = BALANCE.PARRY_WHIFF_RECOVERY_FRAMES;
      events.push({ type: 'PARRY_WHIFF', slot: f.slot, x, y });
    } else if (actionFrame >= windowFrames) {
      // Guard stays safe; a fresh release/press can parry the next strike.
      action = 'block';
      actionFrame = 0;
      parryCooldown = 0;
    }
  } else if (action === 'attack' && currentMove !== null) {
    actionFrame += 1;
    const move = MOVES[currentMove];
    vx = approachInt(vx, 0, Math.trunc(BALANCE.FRICTION * 0.9));

    // Strict full-animation rule: never cancel mid-swing.
    // Only after the full swing + follow-through completes (actionFrame >= cancelWindowStart)
    // can a buffered light input advance cleanly to the next combo strike.
    const totalFrames = getMoveTotalFrames(move);
    if (
      canAct &&
      actionFrame >= move.cancelWindowStart &&
      actionFrame < totalFrames &&
      bufferedIntent === 'light'
    ) {
      if (move.canCancelInto.includes('light2')) {
        startAttack('light2');
      } else if (move.canCancelInto.includes('light3')) {
        startAttack('light3');
      } else if (move.canCancelInto.includes('light4')) {
        startAttack('light4');
      }
    }

    if (action === 'attack' && currentMove !== null) {
      const total = getMoveTotalFrames(MOVES[currentMove]);
      if (actionFrame >= total) {
        if (currentMove === 'light4') {
          lightChainCooldown = BALANCE.LIGHT_CHAIN_COOLDOWN_FRAMES;
        } else if (currentMove === 'light1' || currentMove === 'light2' || currentMove === 'light3') {
          lightChainCooldown = BALANCE.LIGHT_WHIFF_COOLDOWN_FRAMES;
        }
        action = grounded ? 'idle' : 'jump';
        actionFrame = 0;
        currentMove = null;
        moveHitLanded = false;
      }
    }
  } else {
    // Neutral states: idle, walk, crouch, jump, block
    const canJump = grounded || coyoteFrames > 0;

    if (canAct && blockJustPressed && grounded && parryCooldown === 0) {
      action = 'parry_active';
      actionFrame = 0;
      vx = 0;
    } else if (canAct && bufferedIntent === 'special' && specialMeter >= BALANCE.MAX_SPECIAL_METER && grounded) {
      action = 'special_startup';
      actionFrame = 0;
      specialMeter = 0;
      bufferedIntent = 'none';
      bufferFrames = 0;
      vx = 0;
    } else if (canAct && bufferedIntent === 'dodge') {
      action = 'dodge';
      actionFrame = 0;
      dodgeDir = moveDir !== 0 ? moveDir : facing;
      perfectDodgeTriggered = false;
      bufferedIntent = 'none';
      bufferFrames = 0;
      vx = dodgeDir * scalePercent(BALANCE.DODGE_SPEED, spec.speedPercent);
      events.push({ type: 'DODGE', slot: f.slot, x, y, dir: dodgeDir });
    } else if (canAct && (bufferedIntent === 'light' || bufferedIntent === 'heavy') && counterWindow > 0) {
      startAttack('counter');
    } else if (canAct && bufferedIntent === 'unblockable') {
      startAttack('unblockable');
    } else if (canAct && bufferedIntent === 'grab') {
      startAttack('grab');
    } else if (canAct && bufferedIntent === 'heavy') {
      startAttack('heavy');
    } else if (canAct && bufferedIntent === 'light' && lightChainCooldown === 0) {
      startAttack('light1');
    } else if (canAct && bufferedIntent === 'jump' && canJump) {
      vy = BALANCE.JUMP_VELOCITY_Y;
      grounded = false;
      coyoteFrames = 0;
      action = 'jump';
      actionFrame = 0;
      bufferedIntent = 'none';
      bufferFrames = 0;
    } else if (blockPressed && grounded) {
      action = 'block';
      actionFrame += 1;
      const spd = scalePercent(BALANCE.BLOCK_WALK_SPEED, spec.speedPercent);
      vx = moveDir * spd;
    } else if (!grounded) {
      action = 'jump';
      actionFrame += 1;
      const airSpd = scalePercent(BALANCE.WALK_SPEED, spec.speedPercent);
      if (moveDir !== 0) {
        vx = approachInt(vx, moveDir * airSpd, 900);
      } else {
        vx = approachInt(vx, 0, BALANCE.AIR_DRAG);
      }
    } else if (down) {
      action = 'crouch';
      actionFrame += 1;
      vx = approachInt(vx, 0, BALANCE.FRICTION);
    } else if (moveDir !== 0) {
      action = 'walk';
      actionFrame += 1;
      const baseSpd = moveDir === facing ? BALANCE.WALK_SPEED : BALANCE.BACKWALK_SPEED;
      vx = moveDir * scalePercent(baseSpd, spec.speedPercent);
    } else {
      action = 'idle';
      actionFrame += 1;
      vx = approachInt(vx, 0, BALANCE.FRICTION);
    }
  }

  // Guard regeneration when idle/walking
  if ((action === 'idle' || action === 'walk' || action === 'crouch') && guard < f.maxGuard) {
    guardRegenTimer += 1;
    if (guardRegenTimer >= BALANCE.GUARD_REGEN_INTERVAL) {
      guardRegenTimer = 0;
      guard = clampInt(guard + BALANCE.GUARD_REGEN_PER_TICK_NUM, 0, f.maxGuard);
    }
  } else {
    guardRegenTimer = 0;
  }

  // Infinite guard option in Training Mode for P2 dummy
  if (config.infiniteGuardP2 && f.slot === 1) {
    guard = f.maxGuard;
  }

  // Integrate physics (fixed-point integer only)
  x = clampInt(x + vx, minX, maxX);
  if (!grounded || vy < 0) {
    vy += BALANCE.GRAVITY;
    y += vy;
    if (y >= floorY) {
      y = floorY;
      vy = 0;
      grounded = true;
      coyoteFrames = BALANCE.COYOTE_FRAMES;
      if (action === 'jump') {
        action = 'idle';
        actionFrame = 0;
      }
      events.push({ type: 'LAND', slot: f.slot, x, y });
    } else {
      grounded = false;
      if (coyoteFrames > 0) coyoteFrames -= 1;
    }
  } else {
    coyoteFrames = BALANCE.COYOTE_FRAMES;
  }

  return {
    fighter: {
      ...f,
      x,
      y,
      vx,
      vy,
      facing,
      grounded,
      guard,
      guardRegenTimer,
      action,
      actionFrame,
      stunFrames,
      currentMove,
      moveHitLanded,
      lastMoveUsed,
      parryCooldown,
      counterWindow,
      executionCooldown,
      lightChainCooldown,
      specialMeter,
      bossSpecialCooldown,
      coyoteFrames,
      comboCount,
      comboTimer,
      prevInput: input,
      bufferedIntent,
      bufferFrames,
      dodgeDir,
      perfectDodgeTriggered,
    },
    events,
  };
}
