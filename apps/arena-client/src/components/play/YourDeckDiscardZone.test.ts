import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import YourDeckDiscardZone from './YourDeckDiscardZone.vue';

describe('YourDeckDiscardZone (WP-129)', () => {
  test('renders deck count + face-down annotation', () => {
    const wrapper = mount(YourDeckDiscardZone, {
      props: { deckCount: 18, discardCount: 0 },
    });
    const deck = wrapper.find('[data-testid="play-your-deck"]');
    assert.match(deck.text(), /\[18 — face-down\]/);
    assert.match(deck.text(), /Top card NEVER visible/);
  });

  test('renders discard count + top card when present', () => {
    const wrapper = mount(YourDeckDiscardZone, {
      props: {
        deckCount: 18,
        discardCount: 6,
        discardTopCard: {
          extId: 'shield-officer',
          display: {
            extId: 'shield-officer',
            name: 'S.H.I.E.L.D. Officer',
            imageUrl: 'https://images.barefootbetters.com/shield-officer.png',
            cost: 1,
          },
        },
      },
    });
    const top = wrapper.find('[data-testid="play-your-discard-top"]');
    assert.equal(top.text(), 'Top: S.H.I.E.L.D. Officer');
  });

  test('renders Empty placeholder when discardTopCard is null', () => {
    const wrapper = mount(YourDeckDiscardZone, {
      props: { deckCount: 18, discardCount: 0, discardTopCard: null },
    });
    assert.equal(wrapper.find('[data-testid="play-your-discard-empty"]').exists(), true);
  });

  test('renders Empty placeholder when discardTopCard is undefined (redacted)', () => {
    const wrapper = mount(YourDeckDiscardZone, {
      props: { deckCount: 18, discardCount: 0 },
    });
    assert.equal(wrapper.find('[data-testid="play-your-discard-empty"]').exists(), true);
  });
});
