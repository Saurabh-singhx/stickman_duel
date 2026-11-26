import { Graphics } from 'pixi.js';

/**
 * Draws layered soft radial glow halos (zero external assets, GPU-friendly).
 */
export function drawSoftGlow(
  g: Graphics,
  x: number,
  y: number,
  radius: number,
  color: number,
  intensity = 1,
): void {
  if (intensity <= 0) return;
  const layers = [
    { scale: 1.45, alpha: 0.06 * intensity },
    { scale: 1.0, alpha: 0.11 * intensity },
    { scale: 0.62, alpha: 0.16 * intensity },
  ];
  for (const layer of layers) {
    g.circle(x, y, radius * layer.scale).fill({ color, alpha: layer.alpha });
  }
}
