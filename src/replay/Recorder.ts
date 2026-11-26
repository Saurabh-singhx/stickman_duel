import type { InputBitfield, MatchConfig } from '../sim/State';

export const REPLAY_FORMAT_VERSION = 2;

/**
 * Compact run-length-encoded replay payload.
 * A 60-second fight compresses to a few kilobytes.
 */
export interface ReplayRecording {
  readonly version: number;
  readonly id: string;
  readonly label: string;
  readonly createdAtIso: string;
  readonly config: MatchConfig;
  /** Run-length encoded frames: [count, p1Input, p2Input, count, p1Input, p2Input, ...]. */
  readonly rleFrames: readonly number[];
  readonly totalFrames: number;
  readonly finalHash: number;
  readonly scoreRating: number;
}

/**
 * Records inputs frame-by-frame during a live match using run-length encoding.
 */
export class ReplayRecorder {
  private readonly config: MatchConfig;
  private readonly rle: number[] = [];
  private totalFrames = 0;

  constructor(config: MatchConfig) {
    this.config = { ...config };
  }

  /** Appends one frame of P1 and P2 inputs. */
  public recordFrame(p1: InputBitfield, p2: InputBitfield): void {
    const len = this.rle.length;
    if (len >= 3 && this.rle[len - 2] === p1 && this.rle[len - 1] === p2) {
      this.rle[len - 3] = (this.rle[len - 3] ?? 0) + 1;
    } else {
      this.rle.push(1, p1, p2);
    }
    this.totalFrames += 1;
  }

  /** Finalizes the recording into a serializable ReplayRecording. */
  public finalize(label: string, finalHash: number, scoreRating: number): ReplayRecording {
    return {
      version: REPLAY_FORMAT_VERSION,
      id: `rep_${this.config.seed}_${this.totalFrames}`,
      label,
      createdAtIso: new Date().toISOString(),
      config: { ...this.config },
      rleFrames: [...this.rle],
      totalFrames: this.totalFrames,
      finalHash,
      scoreRating,
    };
  }
}

/**
 * Expands a ReplayRecording's RLE input stream back into flat per-frame tuples.
 */
export function expandReplayFrames(rec: ReplayRecording): Array<readonly [InputBitfield, InputBitfield]> {
  const out: Array<readonly [InputBitfield, InputBitfield]> = [];
  for (let i = 0; i < rec.rleFrames.length; i += 3) {
    const count = rec.rleFrames[i] ?? 0;
    const p1 = rec.rleFrames[i + 1] ?? 0;
    const p2 = rec.rleFrames[i + 2] ?? 0;
    for (let k = 0; k < count; k += 1) {
      out.push([p1, p2]);
    }
  }
  return out;
}

/**
 * Encodes a ReplayRecording into a compact shareable base64 string.
 */
export function encodeReplayCode(rec: ReplayRecording): string {
  const json = JSON.stringify(rec);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin);
}

/**
 * Decodes and migrates a shareable base64 replay string back into a ReplayRecording.
 */
export function decodeReplayCode(code: string): ReplayRecording {
  const trimmed = code.trim();
  const bin = atob(trimmed);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  const json = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(json) as Partial<ReplayRecording>;
  if (!parsed || typeof parsed !== 'object' || !parsed.config || !Array.isArray(parsed.rleFrames)) {
    throw new Error('Invalid replay code format');
  }
  return migrateReplay(parsed);
}

/**
 * Migrates v1 replay objects into the current v2 schema.
 */
export function migrateReplay(raw: Partial<ReplayRecording>): ReplayRecording {
  return {
    version: REPLAY_FORMAT_VERSION,
    id: raw.id ?? `rep_migrated_${Date.now()}`,
    label: raw.label ?? 'Imported Duel',
    createdAtIso: raw.createdAtIso ?? new Date().toISOString(),
    config: raw.config!,
    rleFrames: raw.rleFrames ?? [],
    totalFrames: raw.totalFrames ?? 0,
    finalHash: raw.finalHash ?? 0,
    scoreRating: raw.scoreRating ?? 0,
  };
}
