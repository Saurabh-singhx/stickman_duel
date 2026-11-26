import type { CharacterId } from './characters';

/** Identifiers for all 5 player cinematic special powers (triggered with E at 100% meter). */
export type PlayerSpecialId =
  | 'aerial_lasers'
  | 'arena_greatsword'
  | 'unarmed_launch'
  | 'blade_impale'
  | 'black_thunder';

/** Data specification for a player cinematic special attack. */
export interface PlayerSpecialSpec {
  readonly id: PlayerSpecialId;
  readonly name: string;
  /** Frames of telegraph before the connect check (parry / perfect dodge window). */
  readonly telegraphFrames: number;
  /** Total cinematic duration in 60 Hz frames once connected. */
  readonly cinematicFrames: number;
  /** Frame within cinematic when main damage & knockdown trigger. */
  readonly impactFrame: number;
  /** Intermediate audio/visual beat frames during the cinematic. */
  readonly beatFrames: readonly number[];
  /** Uniform damage dealt by every player special power. */
  readonly damage: number;
  /** Whether this special launches the victim to the far edge of the arena. */
  readonly launchToEdge: boolean;
  /** Accent color for VFX. */
  readonly color: number;
}

/** Uniform damage for all 5 player special powers. */
export const PLAYER_SPECIAL_DAMAGE = 34;

/** All 5 player cinematic special attacks. */
export const PLAYER_SPECIALS: Record<PlayerSpecialId, PlayerSpecialSpec> = {
  aerial_lasers: {
    id: 'aerial_lasers',
    name: 'SOLAR BARRAGE',
    telegraphFrames: 16,
    cinematicFrames: 145, // ~2.4s
    impactFrame: 122,
    beatFrames: [22, 46, 70, 94],
    damage: PLAYER_SPECIAL_DAMAGE,
    launchToEdge: false,
    color: 0xffe066,
  },
  arena_greatsword: {
    id: 'arena_greatsword',
    name: 'TITAN DUSKBLADE',
    telegraphFrames: 16,
    cinematicFrames: 145, // ~2.4s
    impactFrame: 92,
    beatFrames: [24, 58],
    damage: PLAYER_SPECIAL_DAMAGE,
    launchToEdge: false,
    color: 0xffc83d,
  },
  unarmed_launch: {
    id: 'unarmed_launch',
    name: 'EMPTY-HAND BREAKER',
    telegraphFrames: 16,
    cinematicFrames: 108, // ~1.8s
    impactFrame: 56,
    beatFrames: [18, 42],
    damage: PLAYER_SPECIAL_DAMAGE,
    launchToEdge: true,
    color: 0xfef08a,
  },
  blade_impale: {
    id: 'blade_impale',
    name: 'STOLEN STEEL',
    telegraphFrames: 16,
    cinematicFrames: 120, // ~2.0s
    impactFrame: 76,
    beatFrames: [26, 52],
    damage: PLAYER_SPECIAL_DAMAGE,
    launchToEdge: false,
    color: 0xef4444,
  },
  black_thunder: {
    id: 'black_thunder',
    name: 'OBSIDIAN THUNDERBOLT',
    telegraphFrames: 16,
    cinematicFrames: 138, // ~2.3s
    impactFrame: 78,
    beatFrames: [20, 48],
    damage: PLAYER_SPECIAL_DAMAGE,
    launchToEdge: false,
    color: 0x93c5fd,
  },
};

export const PLAYER_SPECIAL_IDS: readonly PlayerSpecialId[] = [
  'aerial_lasers',
  'arena_greatsword',
  'unarmed_launch',
  'blade_impale',
  'black_thunder',
];

/** Selects one of the 5 player specials deterministically using a sim RNG integer. */
export function selectPlayerSpecialId(rngValue: number): PlayerSpecialId {
  return PLAYER_SPECIAL_IDS[Math.abs(rngValue) % PLAYER_SPECIAL_IDS.length] ?? 'aerial_lasers';
}

/** Coverage & counterplay geometry for boss arena special attacks. */
export type BossSpecialCoverage = 'half_arena' | 'full_arena';
export type BossSpecialShape = 'ground_wave' | 'sky_beams' | 'dash_slash' | 'shock_nova';

/** Data specification for a boss arena-covering special attack. */
export interface BossSpecialSpec {
  readonly id: string;
  readonly name: string;
  readonly coverage: BossSpecialCoverage;
  readonly shape: BossSpecialShape;
  readonly telegraphFrames: number;
  readonly activeFrames: number;
  readonly damage: number;
  readonly guardDamage: number;
  /** If true, occupies only the low floor strip so the player can JUMP over it. */
  readonly lowGround: boolean;
  /** If true, can be PARRIED (as well as dodged); otherwise must be dodged/jumped. */
  readonly parryable: boolean;
  readonly color: number;
}

/**
 * 4 distinct arena/half-arena special attacks for every boss archetype.
 * Adding new boss specials requires only adding entries here.
 */
export const BOSS_SPECIALS_BY_CHAR: Record<CharacterId, readonly BossSpecialSpec[]> = {
  hero: [],
  vesper: [
    { id: 'vesper_tide', name: 'Moonfall Tide', coverage: 'full_arena', shape: 'ground_wave',
      telegraphFrames: 52, activeFrames: 12, damage: 18, guardDamage: 24,
      lowGround: true, parryable: false, color: 0xb8a0ff },
    { id: 'vesper_lances', name: 'Astral Lances', coverage: 'half_arena', shape: 'sky_beams',
      telegraphFrames: 46, activeFrames: 12, damage: 20, guardDamage: 30,
      lowGround: false, parryable: true, color: 0xbdefff },
    { id: 'vesper_eclipse', name: 'Hollow Eclipse', coverage: 'half_arena', shape: 'shock_nova',
      telegraphFrames: 48, activeFrames: 12, damage: 22, guardDamage: 32,
      lowGround: false, parryable: true, color: 0xc4a0ff },
    { id: 'vesper_sever', name: 'Midnight Sever', coverage: 'half_arena', shape: 'dash_slash',
      telegraphFrames: 38, activeFrames: 10, damage: 20, guardDamage: 28,
      lowGround: false, parryable: true, color: 0xdceeff },
  ],
  swordsman: [
    {
      id: 'ronin_iaido_wave',
      name: 'Iaido Horizon Wave',
      coverage: 'half_arena',
      shape: 'ground_wave',
      telegraphFrames: 30,
      activeFrames: 14,
      damage: 18,
      guardDamage: 28,
      lowGround: true,
      parryable: true,
      color: 0xc5cad4,
    },
    {
      id: 'ronin_crescent_rain',
      name: 'Steel Rain',
      coverage: 'full_arena',
      shape: 'sky_beams',
      telegraphFrames: 34,
      activeFrames: 14,
      damage: 18,
      guardDamage: 30,
      lowGround: false,
      parryable: true,
      color: 0x94a3b8,
    },
    {
      id: 'ronin_dash_cleave',
      name: 'Flash Iaido',
      coverage: 'half_arena',
      shape: 'dash_slash',
      telegraphFrames: 26,
      activeFrames: 10,
      damage: 20,
      guardDamage: 32,
      lowGround: false,
      parryable: true,
      color: 0xe2e8f0,
    },
    {
      id: 'ronin_earth_rend',
      name: 'Ashen Floor Rend',
      coverage: 'full_arena',
      shape: 'ground_wave',
      telegraphFrames: 32,
      activeFrames: 14,
      damage: 19,
      guardDamage: 35,
      lowGround: true,
      parryable: false,
      color: 0xf97316,
    },
  ],
  brawler: [
    {
      id: 'brute_quake_slam',
      name: 'Seismic Tremor',
      coverage: 'full_arena',
      shape: 'ground_wave',
      telegraphFrames: 34,
      activeFrames: 16,
      damage: 22,
      guardDamage: 40,
      lowGround: true,
      parryable: false,
      color: 0xf2c12e,
    },
    {
      id: 'brute_meteor_charge',
      name: 'Ochre Bullrush',
      coverage: 'half_arena',
      shape: 'dash_slash',
      telegraphFrames: 28,
      activeFrames: 12,
      damage: 22,
      guardDamage: 38,
      lowGround: false,
      parryable: true,
      color: 0xeab308,
    },
    {
      id: 'brute_twin_pillars',
      name: 'Earthen Pillars',
      coverage: 'half_arena',
      shape: 'sky_beams',
      telegraphFrames: 32,
      activeFrames: 16,
      damage: 20,
      guardDamage: 35,
      lowGround: false,
      parryable: true,
      color: 0xf59e0b,
    },
    {
      id: 'brute_shock_clap',
      name: 'Thunderclap Nova',
      coverage: 'full_arena',
      shape: 'shock_nova',
      telegraphFrames: 34,
      activeFrames: 12,
      damage: 20,
      guardDamage: 36,
      lowGround: false,
      parryable: true,
      color: 0xfde047,
    },
  ],
  assassin: [
    {
      id: 'assassin_dagger_fan',
      name: 'Crimson Fan',
      coverage: 'half_arena',
      shape: 'dash_slash',
      telegraphFrames: 24,
      activeFrames: 12,
      damage: 16,
      guardDamage: 24,
      lowGround: false,
      parryable: true,
      color: 0xef4444,
    },
    {
      id: 'assassin_shadow_cross',
      name: 'Scarlet Lattice',
      coverage: 'full_arena',
      shape: 'sky_beams',
      telegraphFrames: 30,
      activeFrames: 12,
      damage: 18,
      guardDamage: 28,
      lowGround: false,
      parryable: true,
      color: 0xdc2626,
    },
    {
      id: 'assassin_floor_spikes',
      name: 'Blood Thorns',
      coverage: 'full_arena',
      shape: 'ground_wave',
      telegraphFrames: 30,
      activeFrames: 14,
      damage: 18,
      guardDamage: 30,
      lowGround: true,
      parryable: false,
      color: 0xb91c1c,
    },
    {
      id: 'assassin_blink_ambush',
      name: 'Phantom Mirage',
      coverage: 'half_arena',
      shape: 'shock_nova',
      telegraphFrames: 26,
      activeFrames: 12,
      damage: 19,
      guardDamage: 28,
      lowGround: false,
      parryable: true,
      color: 0xf87171,
    },
  ],
  warden: [
    {
      id: 'warden_coffin_barrage',
      name: 'Sepulcher Barrage',
      coverage: 'full_arena',
      shape: 'sky_beams',
      telegraphFrames: 34,
      activeFrames: 16,
      damage: 22,
      guardDamage: 40,
      lowGround: false,
      parryable: false,
      color: 0xf97316,
    },
    {
      id: 'warden_crimson_horizon',
      name: 'Dusk Horizon Beam',
      coverage: 'full_arena',
      shape: 'ground_wave',
      telegraphFrames: 34,
      activeFrames: 16,
      damage: 24,
      guardDamage: 45,
      lowGround: true,
      parryable: false,
      color: 0xef4444,
    },
    {
      id: 'warden_soul_nova',
      name: 'Warden Cataclysm',
      coverage: 'half_arena',
      shape: 'shock_nova',
      telegraphFrames: 30,
      activeFrames: 14,
      damage: 22,
      guardDamage: 38,
      lowGround: false,
      parryable: true,
      color: 0xfb923c,
    },
    {
      id: 'warden_abyssal_cleave',
      name: 'Abyssal Judgment',
      coverage: 'full_arena',
      shape: 'dash_slash',
      telegraphFrames: 32,
      activeFrames: 14,
      damage: 22,
      guardDamage: 40,
      lowGround: false,
      parryable: true,
      color: 0xf59e0b,
    },
  ],
};

/** Looks up a BossSpecialSpec by ID across all characters. */
export function findBossSpecial(id: string): BossSpecialSpec | null {
  for (const list of Object.values(BOSS_SPECIALS_BY_CHAR)) {
    const found = list.find((s) => s.id === id);
    if (found) return found;
  }
  return null;
}
