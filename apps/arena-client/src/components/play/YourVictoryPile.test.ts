import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import type { UIDisplayEntry } from '@legendary-arena/game-engine';
import YourVictoryPile from './YourVictoryPile.vue';

function entry(extId: string): UIDisplayEntry {
  return {
    extId,
    display: {
      extId,
      name: extId,
      imageUrl: `https://images.barefootbetters.com/${extId}.png`,
      cost: null,
    },
  };
}

describe('YourVictoryPile (WP-129)', () => {
  test('renders count + VP from props', () => {
    const wrapper = mount(YourVictoryPile, {
      props: {
        victoryCards: [entry('doom'), entry('mystique')],
        victoryVp: 14,
      },
    });
    assert.equal(wrapper.find('[data-testid="play-your-victory-count"]').text(), '2 cards');
    assert.equal(wrapper.find('[data-testid="play-your-victory-vp"]').text(), '14 VP');
  });

  test('renders empty placeholder when victoryCards is empty', () => {
    const wrapper = mount(YourVictoryPile, {
      props: { victoryCards: [], victoryVp: 0 },
    });
    assert.equal(wrapper.find('[data-testid="play-your-victory-empty"]').exists(), true);
  });

  test('composition counters bin entries via prefix heuristic', () => {
    const wrapper = mount(YourVictoryPile, {
      props: {
        victoryCards: [
          entry('bystander-civilian-1'),
          entry('bystander-civilian-2'),
          entry('henchman-doombot-1'),
          entry('mastermind-doom-tactic-1'),
          entry('doom-himself'),
          entry('wound'),
        ],
        victoryVp: 18,
      },
    });
    assert.equal(wrapper.find('[data-testid="play-victory-bystanders"]').text(), '2');
    assert.equal(wrapper.find('[data-testid="play-victory-henchmen"]').text(), '1');
    assert.equal(wrapper.find('[data-testid="play-victory-mastermind"]').text(), '1');
    assert.equal(wrapper.find('[data-testid="play-victory-villains"]').text(), '1');
    assert.equal(wrapper.find('[data-testid="play-victory-wounds"]').text(), '1');
  });

  test('all-zero counters render when victoryCards default to empty array', () => {
    const wrapper = mount(YourVictoryPile, {
      props: {},
    });
    assert.equal(wrapper.find('[data-testid="play-victory-bystanders"]').text(), '0');
    assert.equal(wrapper.find('[data-testid="play-victory-villains"]').text(), '0');
  });
});
