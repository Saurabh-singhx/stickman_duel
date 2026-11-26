import type { InputBitfield } from './InputFrame';

/**
 * Fixed-capacity ring buffer for inspecting recent InputBitfields
 * and recording/playing back training dummy sequences.
 */
export class InputBuffer {
  private readonly items: InputBitfield[] = [];
  private readonly maxLen: number;

  constructor(maxLen = 3600) {
    this.maxLen = maxLen;
  }

  /** Appends an input frame to the buffer. */
  public push(input: InputBitfield): void {
    this.items.push(input);
    if (this.items.length > this.maxLen) {
      this.items.shift();
    }
  }

  /** Clears all recorded frames. */
  public clear(): void {
    this.items.length = 0;
  }

  /** Returns the number of stored frames. */
  public get length(): number {
    return this.items.length;
  }

  /** Returns the input at a given index (wraps cleanly if looping). */
  public at(index: number): InputBitfield {
    if (this.items.length === 0) return 0;
    return this.items[index % this.items.length] ?? 0;
  }

  /** Returns a shallow copy of all buffered inputs. */
  public toArray(): InputBitfield[] {
    return [...this.items];
  }
}
