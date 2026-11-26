/**
 * Stage identifiers.
 */
export type StageId = 'beige_plain' | 'dusk_desert' | 'ruined_hall' | 'night_rooftop';

/**
 * Data-driven stage definition for rendering, music, and hazards.
 */
export interface StageSpec {
  readonly id: StageId;
  readonly name: string;
  readonly skyTop: number;
  readonly skyBottom: number;
  readonly horizonFog: number;
  readonly floorColor: number;
  readonly floorLineColor: number;
  readonly silhouetteFar: number;
  readonly silhouetteMid: number;
  readonly accentColor: number;
  readonly hasCoffinHazards: boolean;
  readonly musicRootHz: number;
  readonly musicScale: readonly number[];
}

/**
 * Four playable stages with distinct atmospheric palettes and parallax silhouettes.
 */
export const STAGES: Record<StageId, StageSpec> = {
  beige_plain: {
    id: 'beige_plain',
    name: 'Ash Plain',
    skyTop: 0xdcd6c8,
    skyBottom: 0xc9c1b0,
    horizonFog: 0xe6e0d4,
    floorColor: 0xbab19f,
    floorLineColor: 0x736b5e,
    silhouetteFar: 0xb7ae9c,
    silhouetteMid: 0xa49b89,
    accentColor: 0xd9a843,
    hasCoffinHazards: false,
    musicRootHz: 110,
    musicScale: [0, 2, 3, 7, 10],
  },
  dusk_desert: {
    id: 'dusk_desert',
    name: 'Dusk Dunes',
    skyTop: 0xc79e7a,
    skyBottom: 0xd9b892,
    horizonFog: 0xe6c8a4,
    floorColor: 0xb08b66,
    floorLineColor: 0x6b4e35,
    silhouetteFar: 0xb88b68,
    silhouetteMid: 0x9c7252,
    accentColor: 0xe07a3d,
    hasCoffinHazards: false,
    musicRootHz: 98,
    musicScale: [0, 1, 5, 7, 8],
  },
  ruined_hall: {
    id: 'ruined_hall',
    name: 'Sunken Hall',
    skyTop: 0x9b9892,
    skyBottom: 0x7c7972,
    horizonFog: 0xb0ada5,
    floorColor: 0x68655e,
    floorLineColor: 0x3b3934,
    silhouetteFar: 0x7a7770,
    silhouetteMid: 0x5c5a54,
    accentColor: 0xd95f43,
    hasCoffinHazards: true,
    musicRootHz: 87.31,
    musicScale: [0, 2, 3, 6, 7, 10],
  },
  night_rooftop: {
    id: 'night_rooftop',
    name: 'Moonlit Spire',
    skyTop: 0x2b303c,
    skyBottom: 0x454d5e,
    horizonFog: 0x596275,
    floorColor: 0x262933,
    floorLineColor: 0x9da7bd,
    silhouetteFar: 0x333947,
    silhouetteMid: 0x20242e,
    accentColor: 0xe5c158,
    hasCoffinHazards: true,
    musicRootHz: 123.47,
    musicScale: [0, 3, 5, 7, 10],
  },
};

export const STAGE_LIST: readonly StageId[] = [
  'beige_plain',
  'dusk_desert',
  'ruined_hall',
  'night_rooftop',
];
