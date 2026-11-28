import type { VolumeConfig } from '../audio/AudioEngine';
import { DEFAULT_GAMEPAD_MAPPING, type GamepadMapping } from '../input/Gamepad';
import { DEFAULT_P1_KEYS, DEFAULT_P2_KEYS, type KeyBindings } from '../input/Keyboard';
import type { RenderOptions } from '../render/Renderer';
import { CURRENT_SAVE_VERSION, loadVersioned, saveVersioned } from './SaveSystem';

/** Feature flags for experimental capabilities. */
export interface FeatureFlags {
  readonly experimentalRollbackStub: boolean;
  readonly showFrameGraph: boolean;
}

/** Visibility mode for the non-intrusive on-screen combat guide. */
export type ControlHintsMode = 'auto' | 'on' | 'off';

/** Complete persisted user settings and accessibility preferences. */
export interface UserSettings {
  readonly volumes: VolumeConfig;
  readonly p1Keys: KeyBindings;
  readonly p2Keys: KeyBindings;
  readonly gamepad: GamepadMapping;
  readonly screenShake: boolean;
  readonly glowEnabled: boolean;
  readonly quality: 'low' | 'high';
  readonly reduceFlashing: boolean;
  readonly parryAssist: boolean;
  readonly colorblindTelegraph: boolean;
  readonly controlHints: ControlHintsMode;
  readonly touchControls: boolean;
  readonly touchMode: 'auto' | 'on' | 'off';
  readonly touchSize: 'normal' | 'large';
  readonly touchOpacity: number;
  readonly flags: FeatureFlags;
}

const SETTINGS_KEY = 'duskblade.settings';

/** Default settings tuned for 60 fps and accessible presentation. */
export const DEFAULT_SETTINGS: UserSettings = {
  volumes: { master: 0.8, music: 0.55, sfx: 0.85 },
  p1Keys: { ...DEFAULT_P1_KEYS },
  p2Keys: { ...DEFAULT_P2_KEYS },
  gamepad: { ...DEFAULT_GAMEPAD_MAPPING },
  screenShake: true,
  glowEnabled: true,
  quality: 'high',
  reduceFlashing: false,
  parryAssist: false,
  colorblindTelegraph: false,
  controlHints: 'auto',
  touchControls: false,
  touchMode: 'auto',
  touchSize: 'normal',
  touchOpacity: 0.85,
  flags: {
    experimentalRollbackStub: false,
    showFrameGraph: false,
  },
};

/** Migrates older settings schema versions cleanly into the current UserSettings shape. */
export function migrateSettings(raw: unknown, fromVersion: number): UserSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };
  const obj = raw as Partial<UserSettings>;
  const mergedP1 = { ...DEFAULT_SETTINGS.p1Keys, ...(obj.p1Keys ?? {}) };
  if (fromVersion < 3) {
    if (mergedP1.up === 'KeyW') mergedP1.up = 'Space';
    if (mergedP1.down === 'KeyS') mergedP1.down = 'KeyC';
  }
  if (fromVersion < 4) {
    if (!mergedP1.special) mergedP1.special = 'KeyE';
  }
  if (fromVersion < 5) {
    if (mergedP1.block === 'KeyL') mergedP1.block = 'KeyQ';
  }
  return {
    ...DEFAULT_SETTINGS,
    ...obj,
    volumes: { ...DEFAULT_SETTINGS.volumes, ...(obj.volumes ?? {}) },
    p1Keys: mergedP1,
    p2Keys: { ...DEFAULT_SETTINGS.p2Keys, ...(obj.p2Keys ?? {}) },
    gamepad: { ...DEFAULT_SETTINGS.gamepad, ...(obj.gamepad ?? {}) },
    flags: { ...DEFAULT_SETTINGS.flags, ...(obj.flags ?? {}) },
  };
}

/** Loads persisted user settings. */
export function loadSettings(): UserSettings {
  return migrateSettings(
    loadVersioned(SETTINGS_KEY, { ...DEFAULT_SETTINGS }, migrateSettings),
    CURRENT_SAVE_VERSION,
  );
}

/** Saves user settings to persistent storage. */
export function saveSettings(settings: UserSettings): void {
  saveVersioned(SETTINGS_KEY, settings);
}

/** Extracts RenderOptions from UserSettings. */
export function toRenderOptions(s: UserSettings): RenderOptions {
  return {
    screenShake: s.screenShake,
    glowEnabled: s.glowEnabled,
    reduceFlashing: s.reduceFlashing,
    colorblindTelegraph: s.colorblindTelegraph,
    quality: s.quality,
  };
}
