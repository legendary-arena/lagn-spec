import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import type { UIPlayerState } from '@legendary-arena/game-engine';
import OpponentPanel from './OpponentPanel.vue';

function opponent(over: Partial<UIPlayerState> = {}): UIPlayerState {
  return {
    playerId: 'bob',
    deckCount: 14,
    handCount: 5,
    discardCount: 8,
    inPlayCount: 0,
    victoryCount: 4,
    woundCount: 0,
    victoryVP: 12,
    victoryCards: [
      {
        extId: 'doom',
        display: {
          extId: 'doom',
          name: 'Dr. Doom',
          imageUrl: 'https://images.barefootbetters.com/doom.png',
          cost: 5,
        },
      },
    ],
    ...over,
  };
}

describe('OpponentPanel (WP-129)', () => {
  test('renders all four count slots from UIPlayerState', () => {
    const wrapper = mount(OpponentPanel, {
      props: { player: opponent() },
    });
    assert.equal(wrapper.find('[data-testid="play-opponent-hand"]').text(), 'Hand: 5');
    assert.equal(wrapper.find('[data-testid="play-opponent-deck"]').text(), 'Deck: 14');
    assert.equal(wrapper.find('[data-testid="play-opponent-discard"]').text(), 'Discard: 8');
    assert.equal(wrapper.find('[data-testid="play-opponent-in-play"]').text(), 'In-play: 0');
  });

  test('victory button shows count + VP when projected', () => {
    const wrapper = mount(OpponentPanel, {
      props: { player: opponent() },
    });
    const button = wrapper.find('[data-testid="play-opponent-victory-button"]');
    assert.match(button.text(), /Victory: 4/);
    assert.match(button.text(), /12 VP/);
  });

  test('victory button does not crash when victoryVP is redacted', () => {
    const wrapper = mount(OpponentPanel, {
      props: { player: opponent({ victoryVP: undefined, victoryCards: undefined }) },
    });
    const button = wrapper.find('[data-testid="play-opponent-victory-button"]');
    assert.match(button.text(), /Victory: 4/);
  });

  test('clicking victory button opens the modal', async () => {
    const wrapper = mount(OpponentPanel, {
      props: { player: opponent() },
    });
    assert.equal(document.querySelector('[data-testid="play-opponent-victory-modal"]'), null);
    await wrapper.find('[data-testid="play-opponent-victory-button"]').trigger('click');
    const teleported = document.querySelector('[data-testid="play-opponent-victory-modal"]');
    assert.notEqual(teleported, null);
    wrapper.unmount();
  });

  test('panel root carries data-player-id for parent selection', () => {
    const wrapper = mount(OpponentPanel, {
      props: { player: opponent({ playerId: 'cara' }) },
    });
    assert.equal(
      wrapper.find('[data-testid="play-opponent-panel"]').attributes('data-player-id'),
      'cara',
    );
  });
});
