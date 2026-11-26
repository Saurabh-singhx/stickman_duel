/**
 * Frame-step controller for pausing the simulation and advancing exactly one 60 Hz frame at a time.
 * Bound to F2 (toggle pause/step mode) and F3 / Period (advance 1 frame).
 */
export class FrameStepController {
  public enabled = false;
  private pendingSteps = 0;

  /** Toggles frame-step pause mode on or off. */
  public toggle(): boolean {
    this.enabled = !this.enabled;
    this.pendingSteps = 0;
    return this.enabled;
  }

  /** Requests advancing the simulation by exactly one frame while paused. */
  public requestStep(): void {
    if (!this.enabled) {
      this.enabled = true;
    }
    this.pendingSteps += 1;
  }

  /** Returns true if the simulation should execute a step on this tick. */
  public consumeShouldStep(): boolean {
    if (!this.enabled) return true;
    if (this.pendingSteps > 0) {
      this.pendingSteps -= 1;
      return true;
    }
    return false;
  }
}
