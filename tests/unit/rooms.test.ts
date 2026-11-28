import { describe, expect, it } from 'vitest';
import { generateRoomCode, normalizeRoomCode } from '../../src/net/Rooms';

describe('room input', () => {
  it('accepts every generated code and human formatting', () => {
    for (let seed = 1; seed < 1000; seed++) {
      const code = generateRoomCode(seed);
      expect(normalizeRoomCode(code.toLowerCase())).toBe(code);
    }
    expect(normalizeRoomCode(' abc-234 ')).toBe('ABC234');
  });
  it('extracts the code from a full invite without uppercasing the URL query', () => {
    expect(normalizeRoomCode('https://game.example/?room=abc234')).toBe('ABC234');
  });
  it('rejects malformed input instead of silently deleting arbitrary characters', () => {
    for (const value of ['', 'ABCDE', 'ABCDEFG', 'ABC!234', 'https://game.example/', 'https://%']) {
      expect(normalizeRoomCode(value)).toBeNull();
    }
  });
});
