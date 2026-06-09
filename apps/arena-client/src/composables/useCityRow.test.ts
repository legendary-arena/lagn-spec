import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { UICityState, UIDecksState } from '@legendary-arena/game-engine';
import { useCityRow, type CityCell } from './useCityRow';

function makeCity(spaces: (string | null)[]): UICityState {
  return {
    spaces: spaces.map((id) =>
      id === null
        ? null
        : {
            extId: id,
            type: 'villain',
            keywords: [],
            display: {
              extId: id,
              name: id,
              imageUrl: `https://images.barefootbetters.com/${id}.png`,
              cost: 4,
            },
            attachedHeroes: [],
            fightCost: 0,
          },
    ),
    escapedPile: [],
  };
}

const decks: UIDecksState = { villainDeckCount: 14, heroDeckCount: 0 };

describe('useCityRow (WP-129)', () => {
  test('returns exactly 7 cells in locked left-to-right order', () => {
    const city = makeCity([null, null, null, null, null]);
    const { cells } = useCityRow(city, decks);
    assert.equal(cells.length, 7);
    assert.equal(cells[0]!.kind, 'escaped');
    assert.equal(cells[6]!.kind, 'villainDeck');
    for (let i = 1; i <= 5; i += 1) {
      assert.equal(cells[i]!.kind, 'slot');
    }
  });

  test('visual cells map left-to-right Bridge..Sewers to engine indices 4..0 (reversed)', () => {
    // why: engine's pushVillainIntoCity puts new villains at space 0 and
    // shifts toward space 4 (escape edge). Visually new villains enter at
    // Sewers (right) and advance leftward toward Bridge (escape). Visual
    // cells therefore render engine indices in reverse: visual leftmost
    // (Bridge) = engine index 4, visual rightmost (Sewers) = engine 0.
    const city = makeCity([null, null, null, null, null]);
    const { cells } = useCityRow(city, decks);
    const expectedNames = ['Bridge', 'Streets', 'Rooftops', 'Bank', 'Sewers'];
    const expectedEngineIndices = [4, 3, 2, 1, 0];
    for (let i = 0; i < 5; i += 1) {
      const cell = cells[i + 1] as Extract<CityCell, { kind: 'slot' }>;
      assert.equal(cell.slotName, expectedNames[i]);
      assert.equal(cell.cityIndex, expectedEngineIndices[i]);
    }
  });

  test('newly revealed villain at engine index 0 appears at the rightmost city cell (Sewers)', () => {
    const city = makeCity(['fresh-reveal', null, null, null, null]);
    const { cells } = useCityRow(city, decks);
    const sewers = cells[5] as Extract<CityCell, { kind: 'slot' }>;
    assert.equal(sewers.slotName, 'Sewers');
    assert.equal(sewers.cityIndex, 0);
    assert.equal(sewers.card?.extId, 'fresh-reveal');
  });

  test('villain at engine index 4 (escape edge) appears at the leftmost city cell (Bridge)', () => {
    const city = makeCity([null, null, null, null, 'about-to-escape']);
    const { cells } = useCityRow(city, decks);
    const bridge = cells[1] as Extract<CityCell, { kind: 'slot' }>;
    assert.equal(bridge.slotName, 'Bridge');
    assert.equal(bridge.cityIndex, 4);
    assert.equal(bridge.card?.extId, 'about-to-escape');
  });

  test('escaped cell carries the count and entries from city.escapedPile', () => {
    const city = makeCity([null, null, null, null, null]);
    city.escapedPile = [
      {
        extId: 'doom',
        display: {
          extId: 'doom',
          name: 'Dr. Doom',
          imageUrl: 'https://images.barefootbetters.com/doom.png',
          cost: 5,
        },
      },
    ];
    const { cells } = useCityRow(city, decks);
    const escaped = cells[0] as Extract<CityCell, { kind: 'escaped' }>;
    assert.equal(escaped.count, 1);
    assert.equal(escaped.entries[0]!.extId, 'doom');
  });

  test('villain deck cell reflects decks.villainDeckCount', () => {
    const city = makeCity([null, null, null, null, null]);
    const { cells } = useCityRow(city, { villainDeckCount: 22, heroDeckCount: 0 });
    const deckCell = cells[6] as Extract<CityCell, { kind: 'villainDeck' }>;
    assert.equal(deckCell.count, 22);
  });

  test('occupied slot at engine index 2 renders at visual Rooftops cell (cell 3)', () => {
    // why: engine index 2 maps to visual cell 3 (Rooftops) under the
    // reverse mapping (escapeEdge=4 - visualIndex=2 → engine=2).
    const city = makeCity([null, null, 'henchman-a', 'doom', null]);
    const { cells } = useCityRow(city, decks);
    const rooftops = cells[3] as Extract<CityCell, { kind: 'slot' }>;
    assert.equal(rooftops.slotName, 'Rooftops');
    assert.equal(rooftops.cityIndex, 2);
    assert.equal(rooftops.card?.extId, 'henchman-a');

    const streets = cells[2] as Extract<CityCell, { kind: 'slot' }>;
    assert.equal(streets.slotName, 'Streets');
    assert.equal(streets.cityIndex, 3);
    assert.equal(streets.card?.extId, 'doom');
  });
});
