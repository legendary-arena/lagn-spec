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

  test('slot cells map cityIndex 0..4 to Bridge..Sewers in left-to-right order', () => {
    const city = makeCity([null, null, null, null, null]);
    const { cells } = useCityRow(city, decks);
    const expected = ['Bridge', 'Streets', 'Rooftops', 'Bank', 'Sewers'];
    for (let i = 0; i < 5; i += 1) {
      const cell = cells[i + 1] as Extract<CityCell, { kind: 'slot' }>;
      assert.equal(cell.slotName, expected[i]);
      assert.equal(cell.cityIndex, i);
    }
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

  test('occupied slot carries the UICityCard payload from city.spaces', () => {
    const city = makeCity([null, null, 'henchman-a', 'doom', null]);
    const { cells } = useCityRow(city, decks);
    const rooftops = cells[3] as Extract<CityCell, { kind: 'slot' }>;
    assert.equal(rooftops.slotName, 'Rooftops');
    assert.equal(rooftops.card?.extId, 'henchman-a');
  });
});
