import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initAnalytics,
  resetAnalyticsForTests,
  trackEvent,
  trackMatchEnded,
  trackModeStarted,
  trackOnlineStatus,
} from '../../src/systems/Analytics';

describe('Analytics', () => {
  beforeEach(() => {
    resetAnalyticsForTests();
  });

  it('stays a no-op when no PostHog key is provided', () => {
    const capture = vi.fn();
    expect(initAnalytics({ key: '', client: { capture } })).toBe(false);
    trackEvent('mode_started', { modeId: 'vs_bot' });
    expect(capture).not.toHaveBeenCalled();
  });

  it('initializes once with a key, registers game super-property, and strips undefined properties', () => {
    const capture = vi.fn();
    const register = vi.fn();
    expect(initAnalytics({ key: 'phc_test_key', client: { capture, register } })).toBe(true);
    // Duplicate init returns true without replacing client
    expect(initAnalytics({ key: 'phc_other_key', client: { capture: vi.fn() } })).toBe(true);
    expect(register).toHaveBeenCalledWith({ game: 'stickman_duel' });

    trackModeStarted({
      action: { type: 'LOCAL_2P', stageId: 'beige_plain' },
      modeId: 'local_2p',
      stageId: 'beige_plain',
      touchDevice: false,
    });

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('mode_started', {
      actionType: 'LOCAL_2P',
      modeId: 'local_2p',
      stageId: 'beige_plain',
      touchDevice: false,
    });
  });

  it('tracks match_ended and ignores transient connecting online statuses', () => {
    const capture = vi.fn();
    initAnalytics({ key: 'phc_test_key', client: { capture } });

    trackMatchEnded({
      actionType: 'WAVES',
      modeId: 'waves',
      stageId: 'ruined_hall',
      p1Char: 'hero',
      p2Char: 'assassin',
      won: false,
      durationSec: 42,
      parries: 3,
      perfectDodges: 2,
      wavesReached: 4,
      wavesScore: 9500,
    });

    trackOnlineStatus('connecting', true, 'beige_plain');
    trackOnlineStatus('connected', true, 'beige_plain');

    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenNthCalledWith(1, 'match_ended', {
      actionType: 'WAVES',
      modeId: 'waves',
      stageId: 'ruined_hall',
      p1Char: 'hero',
      p2Char: 'assassin',
      won: false,
      durationSec: 42,
      parries: 3,
      perfectDodges: 2,
      wavesReached: 4,
      wavesScore: 9500,
    });
    expect(capture).toHaveBeenNthCalledWith(2, 'online_room_status', {
      status: 'connected',
      role: 'host',
      stageId: 'beige_plain',
    });
  });
});
