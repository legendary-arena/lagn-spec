import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import type { UITurnEconomyState } from '@legendary-arena/game-engine';
import EconomyBar from './EconomyBar.vue';

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

describe('EconomyBar (WP-129)', () => {
  test('renders attack as "available/total"', () => {
    const wrapper = mount(EconomyBar, {
      props: { economy: economy({ attack: 5, availableAttack: 3 }) },
    });
    assert.equal(wrapper.find('[data-testid="play-economy-attack"]').text(), 'Attack: 3/5');
  });

  test('renders recruit as "available/total"', () => {
    const wrapper = mount(EconomyBar, {
      props: { economy: economy({ recruit: 6, availableRecruit: 4 }) },
    });
    assert.equal(wrapper.find('[data-testid="play-economy-recruit"]').text(), 'Recruit: 4/6');
  });

  test('renders piercing safe-skip 0 when economy projects 0', () => {
    const wrapper = mount(EconomyBar, {
      props: { economy: economy() },
    });
    assert.equal(wrapper.find('[data-testid="play-economy-piercing"]').text(), 'Pierce: 0');
  });

  test('renders woundsDrawn safe-skip 0 when economy projects 0', () => {
    const wrapper = mount(EconomyBar, {
      props: { economy: economy() },
    });
    assert.equal(wrapper.find('[data-testid="play-economy-wounds-drawn"]').text(), 'Wounds drawn: 0');
  });

  test('renders nonzero piercing and woundsDrawn when present (forward-compat)', () => {
    // why: when a future WP back-fills G.turnEconomy.piercing /
    // G.turnEconomy.woundsDrawn, this leaf must render the new values
    // without any code change.
    const wrapper = mount(EconomyBar, {
      props: { economy: economy({ piercing: 2, woundsDrawn: 1 }) },
    });
    assert.equal(wrapper.find('[data-testid="play-economy-piercing"]').text(), 'Pierce: 2');
    assert.equal(wrapper.find('[data-testid="play-economy-wounds-drawn"]').text(), 'Wounds drawn: 1');
  });
});
