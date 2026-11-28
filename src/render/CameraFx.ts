/**
 * Render-only cinematic camera controller: smooth fighter framing, hit zoom,
 * trauma shake, slow-motion presentation scaling, and flash overlays.
 */
export class CameraFx {
  public x = 640;
  public y = 390;
  public zoom = 1;
  public shakeX = 0;
  public shakeY = 0;
  public flashAlpha = 0;
  public flashColor = 0xffffff;
  public slowMoFactor = 1;

  private trauma = 0;
  private targetZoom = 1;
  private rng = 0x19a4f1;

  /** Adds camera shake trauma scaled by damage/impact intensity. */
  public addShake(amount: number, enabled: boolean): void {
    if (!enabled) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Triggers a brief screen flash (respects reduceFlashing accessibility setting). */
  public triggerFlash(color: number, alpha: number, reduceFlashing: boolean): void {
    if (reduceFlashing) return;
    this.flashColor = color;
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
  }

  /** Updates camera position, zoom, shake, and flash smoothly. */
  public update(
    p1x: number,
    p2x: number,
    p1y: number,
    p2y: number,
    forcedZoom: number | null,
    isSlowMo: boolean,
  ): void {
    const midX = (p1x + p2x) * 0.5;
    const midY = Math.min(p1y, p2y) - 75;
    const dist = Math.abs(p2x - p1x);

    const fitZoom = Math.min(1.6, Math.max(0.86, 1000 / Math.max(240, dist + 240)));
    const dynamicZoom =
      forcedZoom !== null
        ? Math.min(forcedZoom, fitZoom)
        : Math.max(0.92, Math.min(1.22, 1.28 - dist / 1450));
    this.targetZoom = dynamicZoom;
    this.zoom += (this.targetZoom - this.zoom) * 0.12;

    const clampedMidX = Math.max(360, Math.min(920, midX));
    this.x += (clampedMidX - this.x) * 0.14;
    this.y += (Math.min(410, Math.max(320, midY)) - this.y) * 0.12;

    this.slowMoFactor = isSlowMo ? 0.35 : 1;

    if (this.trauma > 0.001) {
      this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
      const rx = (this.rng / 0xffffffff) * 2 - 1;
      this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
      const ry = (this.rng / 0xffffffff) * 2 - 1;
      const mag = this.trauma * this.trauma * 18;
      this.shakeX = rx * mag;
      this.shakeY = ry * mag;
      this.trauma = Math.max(0, this.trauma - 0.065);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }

    if (this.flashAlpha > 0.005) {
      this.flashAlpha *= 0.82;
    } else {
      this.flashAlpha = 0;
    }
  }

  /** Resets camera to default center framing. */
  public reset(): void {
    this.x = 640;
    this.y = 390;
    this.zoom = 1;
    this.trauma = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flashAlpha = 0;
    this.slowMoFactor = 1;
  }
}
