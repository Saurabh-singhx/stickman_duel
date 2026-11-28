/**
 * Identifiers for all 10 game-inspired cinematic finishers.
 */
export type FinisherId =
  | 'low_lunge'
  | 'rising_slash'
  | 'spin_cut'
  | 'overhead_slam'
  | 'judgment_cut'
  | 'shinobi_deathblow'
  | 'eclipse_iaijutsu'
  | 'phantom_flurry'
  | 'sepulcher_split'
  | 'tempest_thunder';

/** Visual choreography theme rendered by FinisherFx. */
export type FinisherTheme =
  | 'horizontal'
  | 'rising'
  | 'spin'
  | 'overhead'
  | 'judgment'
  | 'deathblow'
  | 'eclipse'
  | 'flurry'
  | 'sepulcher'
  | 'thunder_storm';

/**
 * Data specification for a cinematic finisher sequence.
 */
export interface FinisherSpec {
  readonly id: FinisherId;
  readonly name: string;
  readonly inspiration: string;
  readonly durationFrames: number;
  /** Intermediate beat frames for multi-hit slashes, clashes, or lightning strikes. */
  readonly beatFrames: readonly number[];
  /** Frame on which the decisive killing blow lands. */
  readonly impactFrame: number;
  /** Camera zoom factor during the finisher. */
  readonly cameraZoom: number;
  /** Visual choreography style. */
  readonly theme: FinisherTheme;
  /** Whether the defeated target crawls/kneels before the final strike. */
  readonly victimCrawls: boolean;
  /** Accent color of the finisher slash. */
  readonly slashColor: number;
  /** Whether to transition the backdrop to night sky + storm rain/lightning. */
  readonly nightStormBackdrop: boolean;
}

/**
 * 10 distinct cinematic finishers inspired by Ghost of Tsushima, Devil May Cry,
 * Sekiro, Elden Ring, Samurai Shodown, Katana ZERO, Guilty Gear, and Blasphemous.
 */
export const FINISHERS: Record<FinisherId, FinisherSpec> = {
  low_lunge: {
    id: 'low_lunge',
    name: 'Dusk Execution',
    inspiration: 'Ghost of Tsushima Standoff',
    durationFrames: 64,
    beatFrames: [16],
    impactFrame: 38,
    cameraZoom: 1.48,
    theme: 'horizontal',
    victimCrawls: true,
    slashColor: 0xffd54f,
    nightStormBackdrop: false,
  },
  rising_slash: {
    id: 'rising_slash',
    name: 'Heavenward Sever',
    inspiration: 'Devil May Cry High Time',
    durationFrames: 66,
    beatFrames: [14, 40],
    impactFrame: 28,
    cameraZoom: 1.44,
    theme: 'rising',
    victimCrawls: false,
    slashColor: 0xffdf6b,
    nightStormBackdrop: false,
  },
  spin_cut: {
    id: 'spin_cut',
    name: 'Crescent Tempest',
    inspiration: 'Sekiro Spiral Cloud Passage',
    durationFrames: 72,
    beatFrames: [14, 26, 38],
    impactFrame: 48,
    cameraZoom: 1.45,
    theme: 'spin',
    victimCrawls: false,
    slashColor: 0xffc83d,
    nightStormBackdrop: false,
  },
  overhead_slam: {
    id: 'overhead_slam',
    name: 'Sundered Earth',
    inspiration: 'Elden Ring Lion Claw',
    durationFrames: 66,
    beatFrames: [18],
    impactFrame: 38,
    cameraZoom: 1.52,
    theme: 'overhead',
    victimCrawls: true,
    slashColor: 0xffbe2e,
    nightStormBackdrop: false,
  },
  judgment_cut: {
    id: 'judgment_cut',
    name: 'Judgment Cut End',
    inspiration: 'Devil May Cry Vergil',
    durationFrames: 84,
    beatFrames: [14, 22, 30, 38, 46],
    impactFrame: 58,
    cameraZoom: 1.5,
    theme: 'judgment',
    victimCrawls: false,
    slashColor: 0x93c5fd,
    nightStormBackdrop: false,
  },
  shinobi_deathblow: {
    id: 'shinobi_deathblow',
    name: 'Crimson Deathblow',
    inspiration: 'Sekiro Shinobi Execution',
    durationFrames: 70,
    beatFrames: [18, 32],
    impactFrame: 44,
    cameraZoom: 1.56,
    theme: 'deathblow',
    victimCrawls: true,
    slashColor: 0xef4444,
    nightStormBackdrop: false,
  },
  eclipse_iaijutsu: {
    id: 'eclipse_iaijutsu',
    name: 'Eclipse Iaijutsu',
    inspiration: 'Samurai Shodown / Katana ZERO',
    durationFrames: 76,
    beatFrames: [20],
    impactFrame: 42,
    cameraZoom: 1.46,
    theme: 'eclipse',
    victimCrawls: false,
    slashColor: 0xfff8dc,
    nightStormBackdrop: false,
  },
  phantom_flurry: {
    id: 'phantom_flurry',
    name: 'Phantom Flurry',
    inspiration: 'Guilty Gear Instant Kill',
    durationFrames: 82,
    beatFrames: [12, 20, 28, 36, 44],
    impactFrame: 56,
    cameraZoom: 1.42,
    theme: 'flurry',
    victimCrawls: false,
    slashColor: 0xfde047,
    nightStormBackdrop: false,
  },
  sepulcher_split: {
    id: 'sepulcher_split',
    name: 'Sepulcher Split',
    inspiration: 'Blasphemous Execution',
    durationFrames: 74,
    beatFrames: [16, 30],
    impactFrame: 46,
    cameraZoom: 1.52,
    theme: 'sepulcher',
    victimCrawls: true,
    slashColor: 0xf97316,
    nightStormBackdrop: false,
  },
  tempest_thunder: {
    id: 'tempest_thunder',
    name: 'Tempest of the Dusk',
    inspiration: 'Sekiro Sword Saint / Storm Duel',
    /** 6.5 seconds (390 frames @ 60 Hz) slow-motion stormy night duel finale. */
    durationFrames: 390,
    beatFrames: [30, 95, 160, 225, 280],
    impactFrame: 315,
    cameraZoom: 1.54,
    theme: 'thunder_storm',
    victimCrawls: false,
    slashColor: 0xfef08a,
    nightStormBackdrop: true,
  },
};

/** Ordered list of all 10 finishers for deterministic random selection. */
export const FINISHER_IDS: readonly FinisherId[] = [
  'low_lunge',
  'rising_slash',
  'spin_cut',
  'overhead_slam',
  'judgment_cut',
  'shinobi_deathblow',
  'eclipse_iaijutsu',
  'phantom_flurry',
  'sepulcher_split',
  'tempest_thunder',
];

/**
 * Selects one of the 10 finishers randomly using a deterministic integer roll from sim RNG.
 */
export function selectRandomFinisherId(rngValue: number): FinisherId {
  return FINISHER_IDS[Math.abs(rngValue) % FINISHER_IDS.length] ?? 'low_lunge';
}
