import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import type { UIState } from '@legendary-arena/game-engine';
import TopHudBar from './TopHudBar.vue';

function fixture(overrides: Partial<UIState['game']> = {}): UIState {
  return {
    game: {
      phase: 'play',
      turn: 4,
      activePlayerId: 'alice',
      currentStage: 'main',
      ...overrides,
    },
    players: [],
    city: { spaces: [null, null, null, null, null], escapedPile: [] },
    hq: { slots: [null, null, null, null, null] },
    mastermind: {
      id: 'core/loki',
      tacticsRemaining: 3,
      tacticsDefeated: 1,
      display: {
        extId: 'mastermind-loki',
        name: 'Loki',
        imageUrl: 'https://images.barefootbetters.com/loki.png',
        cost: null,
      },
      attachedBystanders: [],
      strikePile: [],
    },
    scheme: {
      id: 'core/capture-five-bystanders',
      twistCount: 2,
      twistPile: [],
    },
    economy: {
      attack: 0,
      recruit: 0,
      availableAttack: 0,
      availableRecruit: 0,
      piercing: 0,
      woundsDrawn: 0,
    },
    log: [],
    progress: { bystandersRescued: 1, escapedVillains: 3 },
    decks: { villainDeckCount: 14, heroDeckCount: 0 },
    piles: {
      bystandersCount: 12,
      woundsCount: 24,
      horrorsCount: 0,
      officersCount: 22,
      sidekicksCount: 13,
    },
    koPile: { count: 0, topCard: null, cards: [] },
  };
}

describe('TopHudBar (WP-129)', () => {
  test('renders phase / turn / active / stage', () => {
    const wrapper = mount(TopHudBar, {
      props: {
        snapshot: fixture(),
        mastermindTacticsTotal: 4,
        schemeTwistThreshold: 8,
      },
    });
    assert.equal(wrapper.find('[data-testid="play-hud-phase"]').text(), 'Phase: play');
    assert.equal(wrapper.find('[data-testid="play-hud-turn"]').text(), 'Turn 4');
    assert.equal(wrapper.find('[data-testid="play-hud-active"]').text(), 'Active: alice');
    assert.equal(wrapper.find('[data-testid="play-hud-stage"]').text(), 'Stage: main');
  });

  test('renders twist + mastermind + bystanders + escaped counters', () => {
    const wrapper = mount(TopHudBar, {
      props: {
        snapshot: fixture(),
        mastermindTacticsTotal: 4,
        schemeTwistThreshold: 8,
      },
    });
    assert.equal(wrapper.find('[data-testid="play-hud-twists"]').text(), 'Twists: 2/8');
    assert.equal(wrapper.find('[data-testid="play-hud-strikes"]').text(), 'Strikes: 1/4');
    assert.match(wrapper.find('[data-testid="play-hud-bystanders"]').text(), /Bystanders rescued: 1/);
    assert.equal(wrapper.find('[data-testid="play-hud-escaped"]').text(), 'Escaped: 3');
  });

  test('falls back to "pending" when activePlayerId is empty', () => {
    const wrapper = mount(TopHudBar, {
      props: {
        snapshot: fixture({ activePlayerId: '' }),
        mastermindTacticsTotal: 4,
        schemeTwistThreshold: 8,
      },
    });
    assert.equal(wrapper.find('[data-testid="play-hud-active"]').text(), 'Active: pending');
  });

  test('renders D-12907 skin-selector slot placeholder when no slot content provided', () => {
    const wrapper = mount(TopHudBar, {
      props: {
        snapshot: fixture(),
        mastermindTacticsTotal: 4,
        schemeTwistThreshold: 8,
      },
    });
    const placeholder = wrapper.find('[data-testid="play-hud-skin-placeholder"]');
    assert.equal(placeholder.exists(), true);
    assert.match(placeholder.text(), /Skin: Classic/);
  });
});
