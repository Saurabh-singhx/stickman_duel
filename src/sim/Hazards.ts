import { BALANCE } from '../data/balance';
import { clampInt } from './Fixed';
import { nextRangeInt } from './Rng';
import type { FighterState, HazardSlab, SimEvent } from './State';

export interface HazardStepOutput {
  readonly hazards: readonly HazardSlab[];
  readonly hazardTimer: number;
  readonly nextHazardId: number;
  readonly rngState: number;
  readonly events: readonly SimEvent[];
}

/**
 * Advances all active coffin slabs and periodically spawns new slabs when enabled.
 */
export function stepHazards(
  hazards: readonly HazardSlab[],
  hazardTimer: number,
  nextHazardId: number,
  rngState: number,
  fighters: readonly [FighterState, FighterState],
  enabled: boolean,
): HazardStepOutput {
  const events: SimEvent[] = [];
  const nextHazards: HazardSlab[] = [];

  for (const slab of hazards) {
    const nextFrame = slab.frame + 1;
    if (slab.phase === 'telegraph') {
      if (nextFrame >= BALANCE.SLAB_TELEGRAPH_FRAMES) {
        events.push({ type: 'SLAB_BURST', slabId: slab.id, x: slab.x });
        nextHazards.push({ ...slab, phase: 'active', frame: 0 });
      } else {
        nextHazards.push({ ...slab, frame: nextFrame });
      }
    } else if (slab.phase === 'active') {
      if (nextFrame >= BALANCE.SLAB_ACTIVE_FRAMES) {
        nextHazards.push({ ...slab, phase: 'recovery', frame: 0 });
      } else {
        nextHazards.push({ ...slab, frame: nextFrame });
      }
    } else {
      if (nextFrame < BALANCE.SLAB_RECOVERY_FRAMES) {
        nextHazards.push({ ...slab, frame: nextFrame });
      }
    }
  }

  let nextTimer = hazardTimer;
  let nextId = nextHazardId;
  let nextRng = rngState;

  if (enabled) {
    nextTimer -= 1;
    if (nextTimer <= 0) {
      const targetChoice = nextRangeInt(nextRng, 0, 2);
      nextRng = targetChoice.nextState;
      const jitter = nextRangeInt(nextRng, -70_000, 70_000);
      nextRng = jitter.nextState;

      let targetX: number;
      if (targetChoice.value === 0) {
        targetX = fighters[0].x + jitter.value;
      } else if (targetChoice.value === 1) {
        targetX = fighters[1].x + jitter.value;
      } else {
        targetX = Math.trunc((fighters[0].x + fighters[1].x) / 2) + jitter.value;
      }

      const minX = (BALANCE.STAGE_LEFT_PX + 70) * BALANCE.FP_SCALE;
      const maxX = (BALANCE.STAGE_RIGHT_PX - 70) * BALANCE.FP_SCALE;
      const clampedX = clampInt(targetX, minX, maxX);

      const newSlab: HazardSlab = {
        id: nextId,
        x: clampedX,
        phase: 'telegraph',
        frame: 0,
        hitMask: 0,
      };
      nextHazards.push(newSlab);
      events.push({ type: 'SLAB_TELEGRAPH', slabId: nextId, x: clampedX });
      nextId += 1;

      const intervalJitter = nextRangeInt(nextRng, -30, 30);
      nextRng = intervalJitter.nextState;
      nextTimer = BALANCE.SLAB_INTERVAL_FRAMES + intervalJitter.value;
    }
  }

  return {
    hazards: nextHazards,
    hazardTimer: nextTimer,
    nextHazardId: nextId,
    rngState: nextRng,
    events,
  };
}
