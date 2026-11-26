import { loadVersioned, saveVersioned } from '../systems/SaveSystem';
import type { ReplayRecording } from './Recorder';

const GHOST_STORAGE_KEY = 'duskblade.ghosts';
const MAX_LOCAL_GHOSTS = 50;

/**
 * Documented interface hook for fetching community ghosts from a future backend endpoint.
 * Kept strictly offline by default (zero runtime network requests).
 */
export interface RemoteGhostProvider {
  fetchGhosts(limit: number): Promise<readonly ReplayRecording[]>;
  uploadGhost(recording: ReplayRecording): Promise<void>;
}

/**
 * Manages up to 50 locally stored Ghost Duelist recordings in localStorage.
 * Prioritizes the highest-rated (most parries/combos/finishers) fights.
 */
export class GhostStore {
  private remoteProvider: RemoteGhostProvider | null = null;

  /** Registers an optional remote ghost provider for future server integration. */
  public setRemoteProvider(provider: RemoteGhostProvider | null): void {
    this.remoteProvider = provider;
  }

  /** Lists all stored local ghost recordings sorted by excitement rating descending. */
  public list(): ReplayRecording[] {
    const items = loadVersioned<ReplayRecording[]>(GHOST_STORAGE_KEY, [], (raw) =>
      Array.isArray(raw) ? (raw as ReplayRecording[]) : [],
    );
    return items.sort((a, b) => b.scoreRating - a.scoreRating);
  }

  /** Saves a finished fight as a ghost, capping total storage at 50 entries. */
  public save(recording: ReplayRecording): void {
    const existing = this.list().filter((g) => g.id !== recording.id);
    existing.push(recording);
    existing.sort((a, b) => b.scoreRating - a.scoreRating);
    const trimmed = existing.slice(0, MAX_LOCAL_GHOSTS);
    saveVersioned(GHOST_STORAGE_KEY, trimmed);
  }

  /** Picks a stored ghost deterministically by index, or returns null if none exist yet. */
  public pick(index = 0): ReplayRecording | null {
    const all = this.list();
    if (all.length === 0) return null;
    return all[index % all.length] ?? null;
  }

  /** Optional hook to pull remote ghosts when a provider is configured. */
  public async fetchRemoteGhosts(limit = 10): Promise<readonly ReplayRecording[]> {
    if (!this.remoteProvider) return [];
    return this.remoteProvider.fetchGhosts(limit);
  }
}
