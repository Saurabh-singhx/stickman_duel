/**
 * Playable and enemy character archetypes.
 */
export type CharacterId = 'hero' | 'swordsman' | 'brawler' | 'assassin' | 'warden' | 'vesper';

/**
 * Weapon silhouette type rendered procedurally by FighterView.
 */
export type WeaponStyle = 'golden_blade' | 'dark_katana' | 'fists' | 'twin_daggers' | 'greatsword';

/**
 * Data-driven character definition controlling stats, visual palette, and kit modifiers.
 */
export interface CharacterSpec {
  readonly id: CharacterId;
  readonly name: string;
  readonly title: string;
  readonly maxHp: number;
  readonly maxGuard: number;
  /** Speed multiplier in percent (100 = 1.0x). */
  readonly speedPercent: number;
  /** Damage multiplier in percent (100 = 1.0x). */
  readonly damagePercent: number;
  /** Weapon reach multiplier in percent (100 = 1.0x). */
  readonly reachPercent: number;
  readonly weapon: WeaponStyle;
  readonly hasCape: boolean;
  readonly hasHood: boolean;
  readonly hasMask: boolean;
  readonly hasGlow: boolean;
  readonly bodyColor: number;
  readonly accentColor: number;
  readonly weaponColor: number;
  readonly capeColor: number;
  readonly slashColor: number;
  readonly finisherId: string;
}

/**
 * Character roster. Adding a character requires only adding an entry here.
 */
export const CHARACTERS: Record<CharacterId, CharacterSpec> = {
  vesper: {
    id: 'vesper', name: 'Vesper', title: 'The Eclipse Sentinel',
    maxHp: 135, maxGuard: 110, speedPercent: 104, damagePercent: 108,
    reachPercent: 106, weapon: 'dark_katana',
    hasCape: true, hasHood: false, hasMask: true, hasGlow: false,
    bodyColor: 0xd9ddec, accentColor: 0xb8a0ff, weaponColor: 0xbdefff,
    capeColor: 0x493866, slashColor: 0xb8a0ff, finisherId: 'eclipse_iaijutsu',
  },
  hero: {
    id: 'hero',
    name: 'Duskblade',
    title: 'The Pale Wanderer',
    maxHp: 100,
    maxGuard: 100,
    speedPercent: 100,
    damagePercent: 100,
    reachPercent: 100,
    weapon: 'golden_blade',
    hasCape: true,
    hasHood: false,
    hasMask: false,
    hasGlow: true,
    bodyColor: 0xf8f6f0,
    accentColor: 0xf5c84c,
    weaponColor: 0xffd55a,
    capeColor: 0x161618,
    slashColor: 0xffd452,
    finisherId: 'low_lunge',
  },
  swordsman: {
    id: 'swordsman',
    name: 'Ash Ronin',
    title: 'Dark Swordsman',
    maxHp: 100,
    maxGuard: 100,
    speedPercent: 98,
    damagePercent: 100,
    reachPercent: 102,
    weapon: 'dark_katana',
    hasCape: false,
    hasHood: false,
    hasMask: false,
    hasGlow: false,
    bodyColor: 0x26262a,
    accentColor: 0x8e929c,
    weaponColor: 0x454952,
    capeColor: 0x1d1d21,
    slashColor: 0xc5cad4,
    finisherId: 'rising_slash',
  },
  brawler: {
    id: 'brawler',
    name: 'Ochre Brute',
    title: 'Yellow Brawler',
    maxHp: 120,
    maxGuard: 115,
    speedPercent: 88,
    damagePercent: 115,
    reachPercent: 86,
    weapon: 'fists',
    hasCape: false,
    hasHood: false,
    hasMask: false,
    hasGlow: false,
    bodyColor: 0x2c281e,
    accentColor: 0xe6b422,
    weaponColor: 0xf2c12e,
    capeColor: 0x2c281e,
    slashColor: 0xf2c12e,
    finisherId: 'overhead_slam',
  },
  assassin: {
    id: 'assassin',
    name: 'Crimson Shade',
    title: 'Red Hooded Assassin',
    maxHp: 85,
    maxGuard: 80,
    speedPercent: 114,
    damagePercent: 95,
    reachPercent: 92,
    weapon: 'twin_daggers',
    hasCape: true,
    hasHood: true,
    hasMask: true,
    hasGlow: false,
    bodyColor: 0x231d1f,
    accentColor: 0xc92c34,
    weaponColor: 0xd94148,
    capeColor: 0xa61e26,
    slashColor: 0xef4444,
    finisherId: 'spin_cut',
  },
  warden: {
    id: 'warden',
    name: 'Casket Warden',
    title: 'Final Boss',
    maxHp: 140,
    maxGuard: 120,
    speedPercent: 96,
    damagePercent: 115,
    reachPercent: 110,
    weapon: 'greatsword',
    hasCape: true,
    hasHood: true,
    hasMask: true,
    hasGlow: false,
    bodyColor: 0x18171c,
    accentColor: 0xe0523c,
    weaponColor: 0x3b3842,
    capeColor: 0x241d26,
    slashColor: 0xf97316,
    finisherId: 'sepulcher_split',
  },
};
