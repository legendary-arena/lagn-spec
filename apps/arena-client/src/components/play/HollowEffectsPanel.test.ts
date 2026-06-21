import '../../testing/jsdom-setup';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { HollowEffectRecord, UIState } from '@legendary-arena/game-engine';
import HollowEffectsPanel from './HollowEffectsPanel.vue';
import { useUiStateStore } from '../../stores/uiState';
import { loadUiStateFixture } from '../../fixtures/uiState/index';

/**
 * Builds two sample HollowEffectRecord values for the render tests.
 */
function sampleHollowEffectRecords(): HollowEffectRecord[] {
  return [
    {
      cardId: 'core/black-widow/covert-operation#0',
      cardType: 'hero',
      timing: 'onPlay',
      mechanic: 'covert-operation',
      reason: 'no-handler',
      turn: 3,
    },
    {
      cardId: 'core/doombot-legion#1',
      cardType: 'villain',
      timing: 'onAmbush',
      mechanic: 'ambush-discard',
      reason: 'unsupported-keyword',
      turn: 5,
    },
  ];
}

/**
 * Builds a UIState snapshot from the mid-turn fixture with the given
 * hollowEffects field. Spreads the fixture so the shared module singleton is
 * never mutated across tests.
 */
function snapshotWithHollowEffects(
  hollowEffects: HollowEffectRecord[] | undefined,
): UIState {
  const base = loadUiStateFixture('mid-turn');
  if (hollowEffects === undefined) {
    return { ...base };
  }
  return { ...base, hollowEffects };
}

test('HollowEffectsPanel renders one row per record when hollowEffects has entries', () => {
  setActivePinia(createPinia());
  const records = sampleHollowEffectRecords();
  const store = useUiStateStore();
  store.setSnapshot(snapshotWithHollowEffects(records));

  const wrapper = mount(HollowEffectsPanel);

  assert.equal(
    wrapper.find('[data-testid="hollow-effects-panel"]').exists(),
    true,
  );
  const rows = wrapper.findAll('[data-testid="hollow-effects-row"]');
  assert.equal(rows.length, 2);

  // First row carries the five rendered fields (cardType/mechanic/timing/reason/turn).
  assert.equal(
    rows[0]?.find('[data-testid="hollow-effects-cardType"]').text(),
    'hero',
  );
  assert.equal(
    rows[0]?.find('[data-testid="hollow-effects-mechanic"]').text(),
    'covert-operation',
  );
  assert.equal(
    rows[0]?.find('[data-testid="hollow-effects-timing"]').text(),
    'onPlay',
  );
  assert.equal(
    rows[0]?.find('[data-testid="hollow-effects-reason"]').text(),
    'no-handler',
  );
  assert.equal(rows[0]?.find('[data-testid="hollow-effects-turn"]').text(), '3');

  assert.equal(
    rows[1]?.find('[data-testid="hollow-effects-reason"]').text(),
    'unsupported-keyword',
  );
  assert.equal(rows[1]?.find('[data-testid="hollow-effects-turn"]').text(), '5');
});

test('HollowEffectsPanel renders nothing when hollowEffects is an empty array', () => {
  setActivePinia(createPinia());
  const store = useUiStateStore();
  store.setSnapshot(snapshotWithHollowEffects([]));

  const wrapper = mount(HollowEffectsPanel);

  assert.equal(
    wrapper.find('[data-testid="hollow-effects-panel"]').exists(),
    false,
  );
  assert.equal(
    wrapper.find('[data-testid="hollow-effects-row"]').exists(),
    false,
  );
});

test('HollowEffectsPanel renders nothing when hollowEffects is absent from the snapshot', () => {
  setActivePinia(createPinia());
  const store = useUiStateStore();
  store.setSnapshot(snapshotWithHollowEffects(undefined));

  const wrapper = mount(HollowEffectsPanel);

  assert.equal(
    wrapper.find('[data-testid="hollow-effects-panel"]').exists(),
    false,
  );
});

test('HollowEffectsPanel renders nothing when the snapshot is null', () => {
  setActivePinia(createPinia());
  const wrapper = mount(HollowEffectsPanel);

  assert.equal(
    wrapper.find('[data-testid="hollow-effects-panel"]').exists(),
    false,
  );
});
