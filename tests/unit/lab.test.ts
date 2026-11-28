import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../src/data/characters';
import { FINISHER_IDS } from '../../src/data/finishers';
import { PLAYER_SPECIAL_IDS } from '../../src/data/specials';
import { buildLabSequence, getLabCatalog } from '../../src/debug/LabScenarios';

describe('Animation Lab Scenarios', () => {
  it('catalogs all characters, player specials, finishers, boss specials, moves, and states', () => {
    const cat = getLabCatalog();
    expect(cat.characters.length).toBe(Object.keys(CHARACTERS).length);
    expect(cat.playerSpecials.length).toBe(PLAYER_SPECIAL_IDS.length);
    expect(cat.finishers.length).toBe(FINISHER_IDS.length);
    expect(cat.bossSpecials.length).toBe(24);
    expect(cat.moves.length).toBe(9);
    expect(cat.states.length).toBe(12);
  });

  it('builds deterministic sequences with valid keyframes for every special, finisher, boss special, and move', () => {
    const cat = getLabCatalog();

    for (const sp of cat.playerSpecials) {
      const seq = buildLabSequence({
        category: 'player_special',
        id: sp.id,
        p1Char: 'hero',
        p2Char: 'warden',
        stageId: 'beige_plain',
      });
      expect(seq.frames.length).toBeGreaterThan(30);
      expect(seq.frames.some((f) => f.activeSpecial?.specialId === sp.id)).toBe(true);
      expect(seq.keyFrames.some((k) => k.label === 'Impact')).toBe(true);
      for (const kf of seq.keyFrames) {
        expect(kf.frame).toBeGreaterThanOrEqual(0);
        expect(kf.frame).toBeLessThan(seq.frames.length);
      }
    }

    for (const fin of cat.finishers) {
      const seq = buildLabSequence({
        category: 'finisher',
        id: fin.id,
        p1Char: 'hero',
        p2Char: 'warden',
        stageId: 'dusk_desert',
      });
      expect(seq.frames.some((f) => f.activeFinisherId === fin.id)).toBe(true);
      expect(seq.keyFrames.some((k) => k.label === 'Impact')).toBe(true);
    }

    for (const bs of cat.bossSpecials) {
      const seq = buildLabSequence({
        category: 'boss_special',
        id: bs.id,
        p1Char: 'hero',
        p2Char: bs.ownerChar ?? 'warden',
        stageId: 'ruined_hall',
      });
      expect(seq.frames.some((f) => f.bossSpecials.some((s) => s.specialId === bs.id && s.phase === 'active'))).toBe(true);
      expect(seq.keyFrames.some((k) => k.label === 'Active Mid')).toBe(true);
    }

    for (const mv of cat.moves) {
      const seq = buildLabSequence({
        category: 'move',
        id: mv.id,
        p1Char: 'hero',
        p2Char: 'swordsman',
        stageId: 'beige_plain',
      });
      expect(seq.frames.length).toBeGreaterThan(15);
      expect(seq.keyFrames.length).toBeGreaterThan(0);
    }
  });

  it('supports custom close, far, and swapped character X positions across scenarios', () => {
    const farSpecial = buildLabSequence({
      category: 'player_special',
      id: 'aerial_lasers',
      p1Char: 'hero',
      p2Char: 'warden',
      stageId: 'beige_plain',
      p1X: 190,
      p2X: 1090,
    });
    expect(farSpecial.p1X).toBe(190);
    expect(farSpecial.p2X).toBe(1090);
    expect(farSpecial.frames[0]?.fighters[0].x).toBe(190_000);
    expect(farSpecial.frames[0]?.fighters[1].x).toBe(1090_000);
    expect(farSpecial.frames[0]?.fighters[0].facing).toBe(1);

    const swappedFinisher = buildLabSequence({
      category: 'finisher',
      id: 'low_lunge',
      p1Char: 'hero',
      p2Char: 'warden',
      stageId: 'dusk_desert',
      p1X: 980,
      p2X: 240,
    });
    expect(swappedFinisher.frames[0]?.phase).toBe('finisher');
    expect(swappedFinisher.frames[0]?.fighters[0].facing).toBe(-1);
    expect(swappedFinisher.frames[0]?.fighters[1].facing).toBe(1);
  });
});
