import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import HQRow from './HQRow.vue';
import type {
  UIDecksState,
  UIHQCard,
  UIHQState,
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

function hero(extId: string, name: string, cost: number): UIHQCard {
  return {
    extId,
    display: {
      extId,
      name,
      imageUrl: `https://images.barefootbetters.com/${extId}.png`,
      cost,
    },
  };
}

function fullHq(): UIHQState {
  return {
    slots: ['cap-rogers', null, 'iron-man-stark', 'spider-man-parker', null],
    slotDisplay: [
      hero('cap-rogers', 'Captain America', 4),
      null,
      hero('iron-man-stark', 'Iron Man', 6),
      hero('spider-man-parker', 'Spider-Man', 3),
      null,
    ],
  };
}

const DECKS: UIDecksState = { villainDeckCount: 0, heroDeckCount: 42 };

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

describe('HQRow (WP-129 — extends WP-100)', () => {
  test('renders 6-cell row: 5 hero slots + hero deck', () => {
    const { submitMove } = recorder();
    const wrapper = mount(HQRow, {
      props: {
        hq: fullHq(),
        decks: DECKS,
        currentStage: 'main',
        economy: economy({ recruit: 9, availableRecruit: 9 }),
        submitMove,
      },
    });
    const heroes = wrapper.findAll('[data-testid="play-hq-hero"]');
    const empties = wrapper.findAll('[data-testid="play-hq-empty"]');
    assert.equal(heroes.length, 3);
    assert.equal(empties.length, 2);
    assert.equal(wrapper.find('[data-testid="play-hq-hero-deck"]').exists(), true);
  });

  test('hero buttons map hqIndex to engine slot 0..4', () => {
    const { submitMove } = recorder();
    const wrapper = mount(HQRow, {
      props: {
        hq: fullHq(),
        decks: DECKS,
        currentStage: 'main',
        economy: economy({ recruit: 9, availableRecruit: 9 }),
        submitMove,
      },
    });
    const heroes = wrapper.findAll('[data-testid="play-hq-hero"]');
    const indices = heroes.map((b) => b.attributes('data-hq-index'));
    assert.deepEqual(indices, ['0', '2', '3']);
  });

  test('clicking a hero emits recruitHero with hqIndex', () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(HQRow, {
      props: {
        hq: fullHq(),
        decks: DECKS,
        currentStage: 'main',
        economy: economy({ recruit: 9, availableRecruit: 9 }),
        submitMove,
      },
    });
    const heroes = wrapper.findAll('[data-testid="play-hq-hero"]');
    void heroes[2]!.trigger('click');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, 'recruitHero');
    assert.deepEqual(calls[0]!.args, { hqIndex: 3 });
  });

  test('disables heroes with stage tooltip when currentStage is not main', () => {
    const { submitMove } = recorder();
    for (const stage of ['start', 'cleanup'] as const) {
      const wrapper = mount(HQRow, {
        props: {
          hq: fullHq(),
          decks: DECKS,
          currentStage: stage,
          economy: economy({ recruit: 9, availableRecruit: 9 }),
          submitMove,
        },
      });
      const heroes = wrapper.findAll('[data-testid="play-hq-hero"]');
      for (const button of heroes) {
        assert.equal(button.attributes('disabled'), '');
        assert.match(button.attributes('title')!, /Only available during the Main/);
      }
    }
  });

  test('disables heroes with cost tooltip when economy is short (precedence: stage met first)', () => {
    const { submitMove } = recorder();
    const wrapper = mount(HQRow, {
      props: {
        hq: fullHq(),
        decks: DECKS,
        currentStage: 'main',
        economy: economy({ recruit: 4, availableRecruit: 4 }),
        submitMove,
      },
    });
    const heroes = wrapper.findAll('[data-testid="play-hq-hero"]');
    // iron-man costs 6; available=4 → disabled with cost reason
    const ironMan = heroes.find((b) => b.attributes('data-card-id') === 'iron-man-stark');
    assert.notEqual(ironMan, undefined);
    assert.equal(ironMan!.attributes('disabled'), '');
    assert.match(ironMan!.attributes('title')!, /Needs 6 recruit, you have 4/);

    // cap-rogers costs 4; available=4 → enabled
    const cap = heroes.find((b) => b.attributes('data-card-id') === 'cap-rogers');
    assert.equal(cap!.attributes('disabled'), undefined);
  });

  test('hero deck cell reflects decks.heroDeckCount', () => {
    const { submitMove } = recorder();
    const wrapper = mount(HQRow, {
      props: {
        hq: fullHq(),
        decks: { villainDeckCount: 0, heroDeckCount: 42 },
        currentStage: 'main',
        economy: economy({ availableRecruit: 9 }),
        submitMove,
      },
    });
    assert.match(wrapper.find('[data-testid="play-hq-hero-deck"]').text(), /\[42\]/);
  });
});
