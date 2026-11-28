/** Unambiguous alphabet (omits 0, O, 1, I, L). */
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

/**
 * Generates a 6-character room code from an unambiguous alphabet.
 */
export function generateRoomCode(seed?: number): string {
  let state = seed !== undefined ? (seed >>> 0) || 1 : ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) || 1;
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    code += ROOM_ALPHABET[state % ROOM_ALPHABET.length] ?? 'A';
  }
  return code;
}

/**
 * Normalizes and validates a user-entered room code.
 */
export function normalizeRoomCode(raw: string): string | null {
  let value = raw.trim();
  if (/^https?:\/\//i.test(value)) {
    try { value = new URL(value).searchParams.get('room') ?? ''; } catch { return null; }
  }
  const cleaned = value.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z0-9]+$/.test(cleaned)) return null;
  if (cleaned.length !== ROOM_CODE_LENGTH) return null;
  return cleaned;
}

/**
 * Builds a shareable invite URL (?room=ABC123) that auto-joins when opened.
 */
export function buildInviteLink(roomCode: string): string {
  if (typeof window === 'undefined') return `?room=${roomCode}`;
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomCode);
  return url.toString();
}

/**
 * Reads an invite room code from the current page URL query (?room=ABC123), if present.
 */
export function getInviteRoomFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('room');
  return raw ? normalizeRoomCode(raw) : null;
}
