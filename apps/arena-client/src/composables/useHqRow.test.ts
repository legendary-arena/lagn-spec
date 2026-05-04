import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { UIDecksState, UIHQState } from '@legendary-arena/game-engine';
import { useHqRow, type HqCell } from './useHqRow';

const decks: UIDecksState = { villainDeckCount: 0, heroDeckCount: 42 };

describe('useHqRow (WP-129)', () => {
  test('returns N+1 cells for an N-slot HQ (5 hero slots → 6 cells)', () => {
    const hq: UIHQState = { slots: [null, null, null, null, null] };
    const { cells } = useHqRow(hq, decks);
    assert.equal(cells.length, 6);
    for (let i = 0; i < 5; i += 1) {
      assert.equal(cells[i]!.kind, 'hero');
    }
    assert.equal(cells[5]!.kind, 'heroDeck');
  });

  test('extends to 7 cells when a 6-slot scenario projects (D-12903 graceful extension)', () => {
    const hq: UIHQState = { slots: [null, null, null, null, null, null] };
    const { cells } = useHqRow(hq, decks);
    assert.equal(cells.length, 7);
    assert.equal(cells[6]!.kind, 'heroDeck');
  });

  test('hero cells expose hqIndex and bare CardExtId from hq.slots', () => {
    const hq: UIHQState = { slots: ['wolverine', null, 'storm', null, null] };
    const { cells } = useHqRow(hq, decks);
    const wolverine = cells[0] as Extract<HqCell, { kind: 'hero' }>;
    assert.equal(wolverine.hqIndex, 0);
    assert.equal(wolverine.cardId, 'wolverine');

    const empty = cells[1] as Extract<HqCell, { kind: 'hero' }>;
    assert.equal(empty.cardId, null);
  });

  test('hero cells carry display payload from parallel slotDisplay array', () => {
    const hq: UIHQState = {
      slots: ['wolverine', null, 'storm', null, null],
      slotDisplay: [
        {
          extId: 'wolverine',
          display: {
            extId: 'wolverine',
            name: 'Wolverine',
            imageUrl: 'https://images.barefootbetters.com/wolverine.png',
            cost: 4,
          },
        },
        null,
        {
          extId: 'storm',
          display: {
            extId: 'storm',
            name: 'Storm',
            imageUrl: 'https://images.barefootbetters.com/storm.png',
            cost: 5,
          },
        },
        null,
        null,
      ],
    };
    const { cells } = useHqRow(hq, decks);
    const wolverine = cells[0] as Extract<HqCell, { kind: 'hero' }>;
    assert.equal(wolverine.display?.cost, 4);
    assert.equal(wolverine.display?.name, 'Wolverine');
  });

  test('hero deck cell reflects decks.heroDeckCount', () => {
    const hq: UIHQState = { slots: [null, null, null, null, null] };
    const { cells } = useHqRow(hq, { villainDeckCount: 0, heroDeckCount: 42 });
    const deckCell = cells[5] as Extract<HqCell, { kind: 'heroDeck' }>;
    assert.equal(deckCell.count, 42);
  });

  test('display is null when slotDisplay is undefined (engine not yet projecting it)', () => {
    const hq: UIHQState = { slots: ['wolverine', null, null, null, null] };
    const { cells } = useHqRow(hq, decks);
    const wolverine = cells[0] as Extract<HqCell, { kind: 'hero' }>;
    assert.equal(wolverine.display, null);
  });
});
