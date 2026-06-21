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
    assert.equal(top.exists(), true);
    const tile = top.find('[data-testid="card-tile"]');
    assert.equal(tile.exists(), true);
    assert.equal(tile.attributes('title'), 'S.H.I.E.L.D. Officer');
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

  test('WP-243: collapsed by default — the full discard list is hidden until expanded', () => {
    const wrapper = mount(YourDeckDiscardZone, {
      props: {
        deckCount: 10,
        discardCount: 2,
        discardCards: ['hero-a', 'hero-b'],
        discardDisplay: [
          { extId: 'hero-a', name: 'Hero A', imageUrl: '', cost: 1 },
          { extId: 'hero-b', name: 'Hero B', imageUrl: '', cost: 2 },
        ],
      },
    });
    assert.equal(
      wrapper.find('[data-testid="play-your-discard-all"]').exists(),
      false,
      'full discard list hidden when collapsed',
    );
    assert.equal(
      wrapper.find('[data-testid="play-your-discard-expand"]').exists(),
      true,
      'expand toggle present when discardCards is non-empty',
    );
  });

  test('WP-243: expanding "View all" lists every discard card', async () => {
    const wrapper = mount(YourDeckDiscardZone, {
      props: {
        deckCount: 10,
        discardCount: 2,
        discardCards: ['hero-a', 'hero-b'],
        discardDisplay: [
          { extId: 'hero-a', name: 'Hero A', imageUrl: '', cost: 1 },
          { extId: 'hero-b', name: 'Hero B', imageUrl: '', cost: 2 },
        ],
      },
    });
    await wrapper.find('[data-testid="play-your-discard-expand"]').trigger('click');
    const all = wrapper.find('[data-testid="play-your-discard-all"]');
    assert.equal(all.exists(), true, 'full discard list shown after expanding');
    const tiles = all.findAll('[data-testid="card-tile"]');
    assert.equal(tiles.length, 2, 'one tile per discard card');
  });

  test('WP-243: no expand toggle when discardCards is empty or redacted', () => {
    const wrapper = mount(YourDeckDiscardZone, {
      props: { deckCount: 10, discardCount: 0 },
    });
    assert.equal(
      wrapper.find('[data-testid="play-your-discard-expand"]').exists(),
      false,
      'no expand toggle without discardCards',
    );
  });
});
