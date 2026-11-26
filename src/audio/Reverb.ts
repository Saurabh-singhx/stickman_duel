/**
 * Generates a procedural stereo impulse response buffer for Web Audio ConvolverNode.
 */
export function createReverbImpulse(
  ctx: AudioContext,
  durationSec = 1.6,
  decay = 2.6,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * durationSec));
  const buffer = ctx.createBuffer(2, length, rate);
  let seed = 0x4a2f19;
  const rand = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
  };

  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      const env = Math.pow(1 - i / length, decay);
      data[i] = rand() * env * 0.55;
    }
  }
  return buffer;
}
