import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import CityRow from './CityRow.vue';
import type {
  UICityCard,
  UICityState,
  UIDecksState,
  UITurnEconomyState,
} from '@legendary-arena/game-engine';
import type { SubmitMove, UiMoveName } from './uiMoveName.types';

interface RecordedCall {
  name: UiMoveName;
  args: unknown;
}

function recorder(): { calls: RecordedCall[]; submitMove: SubmitMove } {
  const calls: RecordedCall[] = [];
  const submitMove: SubmitMove = (name, args) => {
    calls.push({ name, args });
  };
  return { calls, submitMove };
}

function villain(extId: string, cost: number): UICityCard {
  return {
    extId,
    type: 'villain',
    keywords: [],
    display: {
      extId,
      name: extId,
      imageUrl: `https://images.barefootbetters.com/${extId}.png`,
      cost,
    },
  };
}

function fullCity(): UICityState {
  return {
    spaces: [
      villain('doom-bot', 3),
      null,
      villain('electro', 5),
      null,
      villain('thug', 2),
    ],
    escapedPile: [],
  };
}

const DECKS: UIDecksState = { villainDeckCount: 14, heroDeckCount: 0 };

function economy(over: Partial<UITurnEconomyState> = {}): UITurnEconomyState {
  return {
    attack: 0,
    recruit: 0,
    availableAttack: 0,
    availableRecruit: 0,
    piercing: 0,
    woundsDrawn: 0,
    ...over,
  };
}

describe('CityRow (WP-129 — extends WP-100)', () => {
  test('renders 7-cell row: escaped + 5 slots + villain deck', () => {
    const { submitMove } = recorder();
    const wrapper = mount(CityRow, {
      props: {
        city: fullCity(),
        decks: DECKS,
        currentStage: 'main',
        economy: economy({ attack: 9, availableAttack: 9 }),
        submitMove,
      },
    });
    assert.equal(wrapper.find('[data-testid="play-escaped-pile"]').exists(), true);
    const villains = wrapper.findAll('[data-testid="play-city-villain"]');
    const empties = wrapper.findAll('[data-testid="play-city-empty"]');
    assert.equal(villains.length + empties.length, 5);
    assert.equal(wrapper.find('[data-testid="play-city-villain-deck"]').exists(), true);
  });

  test('villain buttons render in visual left-to-right order with engine indices reversed', () => {
    // why: fullCity() has occupants at engine indices 0 (doom-bot,
    // newly entered), 2 (electro), 4 (thug, about to escape). Visually
    // these render as Bridge=engine4=thug, Rooftops=engine2=electro,
    // Sewers=engine0=doom-bot — so reading left-to-right the
    // data-city-index attributes are 4, 2, 0 (entry edge sits on the
    // right per DESIGN-BOARD-LAYOUT.md §7.1).
    const { submitMove } = recorder();
    const wrapper = mount(CityRow, {
      props: {
        city: fullCity(),
        decks: DECKS,
        currentStage: 'main',
        economy: economy({ attack: 9, availableAttack: 9 }),
        submitMove,
      },
    });
    const villains = wrapper.findAll('[data-testid="play-city-villain"]');
    const indices = villains.map((b) => b.attributes('data-city-index'));
    assert.deepEqual(indices, ['4', '2', '0']);
  });

  test('clicking a villain emits fightVillain with cityIndex', () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(CityRow, {
      props: {
        city: fullCity(),
        decks: DECKS,
        currentStage: 'main',
        economy: economy({ attack: 9, availableAttack: 9 }),
        submitMove,
      },
    });
    void wrapper.findAll('[data-testid="play-city-villain"]')[1]!.trigger('click');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, 'fightVillain');
    assert.deepEqual(calls[0]!.args, { cityIndex: 2 });
  });

  test('disables villains with stage tooltip when currentStage is not main', () => {
    const { submitMove } = recorder();
    for (const stage of ['start', 'cleanup'] as const) {
      const wrapper = mount(CityRow, {
        props: {
          city: fullCity(),
          decks: DECKS,
          currentStage: stage,
          economy: economy({ attack: 9, availableAttack: 9 }),
          submitMove,
        },
      });
      const villains = wrapper.findAll('[data-testid="play-city-villain"]');
      for (const button of villains) {
        assert.equal(button.attributes('disabled'), '');
        assert.match(button.attributes('title')!, /Only available during the Main/);
      }
    }
  });

  test('disables villains with cost tooltip when economy is short (precedence: stage met first)', () => {
    const { submitMove } = recorder();
    const wrapper = mount(CityRow, {
      props: {
        city: fullCity(),
        decks: DECKS,
        currentStage: 'main',
        economy: economy({ attack: 4, availableAttack: 4 }),
        submitMove,
      },
    });
    const villains = wrapper.findAll('[data-testid="play-city-villain"]');
    // electro costs 5; available=4 → disabled with cost reason
    const electro = villains.find((b) => b.attributes('data-card-id') === 'electro');
    assert.notEqual(electro, undefined);
    assert.equal(electro!.attributes('disabled'), '');
    assert.match(electro!.attributes('title')!, /Needs 5 attack, you have 4\./);

    // doom-bot costs 3; available=4 → enabled
    const doom = villains.find((b) => b.attributes('data-card-id') === 'doom-bot');
    assert.equal(doom!.attributes('disabled'), undefined);
  });

  test('villain deck cell reflects decks.villainDeckCount', () => {
    const { submitMove } = recorder();
    const wrapper = mount(CityRow, {
      props: {
        city: fullCity(),
        decks: { villainDeckCount: 22, heroDeckCount: 0 },
        currentStage: 'main',
        economy: economy({ availableAttack: 9 }),
        submitMove,
      },
    });
    assert.match(
      wrapper.find('[data-testid="play-city-villain-deck"]').text(),
      /\[22\]/,
    );
  });
});
