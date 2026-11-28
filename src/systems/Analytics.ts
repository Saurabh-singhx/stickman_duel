import posthog from 'posthog-js';
import type { StageId } from '../data/stages';
import type { RoomStatus } from '../net/WebRtcTransport';
import type { MenuAction } from '../ui/Menus';

export type AnalyticsPrimitive = string | number | boolean;
export type AnalyticsProperties = Record<string, AnalyticsPrimitive | undefined>;

export interface AnalyticsClient {
  capture(event: string, properties?: Record<string, AnalyticsPrimitive>): void;
  register?(properties: Record<string, AnalyticsPrimitive>): void;
}

export interface AnalyticsInitOptions {
  key?: string;
  host?: string;
  client?: AnalyticsClient;
}

const GAME_ID = 'stickman_duel';
const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

let activeClient: AnalyticsClient | null = null;
let initialized = false;

/** Removes undefined values so event payloads stay clean and strictly typed. */
function sanitizeProperties(
  properties?: AnalyticsProperties,
): Record<string, AnalyticsPrimitive> | undefined {
  if (!properties) return undefined;
  const clean: Record<string, AnalyticsPrimitive> = {};
  let hasKeys = false;
  for (const [k, v] of Object.entries(properties)) {
    if (v !== undefined) {
      clean[k] = v;
      hasKeys = true;
    }
  }
  return hasKeys ? clean : undefined;
}

/**
 * Initializes PostHog once when VITE_POSTHOG_KEY is configured.
 * Disables autocapture and session recording to avoid overhead during 60 Hz PixiJS combat.
 */
export function initAnalytics(options: AnalyticsInitOptions = {}): boolean {
  if (initialized) return true;

  const key = (options.key ?? import.meta.env.VITE_POSTHOG_KEY ?? '').trim();
  if (!key) return false;

  if (options.client) {
    activeClient = options.client;
    activeClient.register?.({ game: GAME_ID });
    initialized = true;
    return true;
  }

  if (typeof window === 'undefined') return false;

  const host = (options.host ?? import.meta.env.VITE_POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST).trim();
  posthog.init(key, {
    api_host: host || DEFAULT_POSTHOG_HOST,
    autocapture: false,
    disable_session_recording: true,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage',
  });
  posthog.register({ game: GAME_ID });

  activeClient = posthog;
  initialized = true;
  return true;
}

/** Resets analytics state; intended for unit tests. */
export function resetAnalyticsForTests(): void {
  activeClient = null;
  initialized = false;
}

/** Emits a named analytics event when analytics is active. */
export function trackEvent(event: string, properties?: AnalyticsProperties): void {
  if (!activeClient) return;
  activeClient.capture(event, sanitizeProperties(properties));
}

export interface ModeStartedPayload {
  action: MenuAction;
  modeId: string;
  stageId: StageId;
  touchDevice: boolean;
}

/** Tracks when a player enters a match or mode. */
export function trackModeStarted(payload: ModeStartedPayload): void {
  const { action, modeId, stageId, touchDevice } = payload;
  const difficulty =
    action.type === 'QUICK_PLAY' || action.type === 'VS_BOT' ? action.difficulty : undefined;

  trackEvent('mode_started', {
    actionType: action.type,
    modeId,
    stageId,
    difficulty,
    touchDevice,
  });
}

export interface MatchEndedPayload {
  actionType: MenuAction['type'];
  modeId: string;
  stageId: StageId;
  p1Char: string;
  p2Char: string;
  won: boolean;
  durationSec: number;
  parries: number;
  perfectDodges: number;
  bossRushStage?: number;
  bossRushCleared?: boolean;
  wavesReached?: number;
  wavesScore?: number;
}

/** Tracks match or run completion metrics once results are shown. */
export function trackMatchEnded(payload: MatchEndedPayload): void {
  trackEvent('match_ended', {
    actionType: payload.actionType,
    modeId: payload.modeId,
    stageId: payload.stageId,
    p1Char: payload.p1Char,
    p2Char: payload.p2Char,
    won: payload.won,
    durationSec: payload.durationSec,
    parries: payload.parries,
    perfectDodges: payload.perfectDodges,
    bossRushStage: payload.bossRushStage,
    bossRushCleared: payload.bossRushCleared,
    wavesReached: payload.wavesReached,
    wavesScore: payload.wavesScore,
  });
}

/** Tracks PeerJS room lifecycle transitions without recording room codes. */
export function trackOnlineStatus(
  status: RoomStatus,
  isHost: boolean,
  stageId: StageId,
): void {
  if (status === 'connecting') return;
  trackEvent('online_room_status', {
    status,
    role: isHost ? 'host' : 'guest',
    stageId,
  });
}
