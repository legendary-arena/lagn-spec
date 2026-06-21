/**
 * Tests for the OptionalKoRewardPrompt component (WP-249 / EC-280).
 *
 * Covers render gates (present only for the chooser), the derived reward label,
 * render-all-and-only the projected eligible hand + discard (in projection
 * order), KO-select move dispatch with the clicked { zone, cardId }, Decline
 * dispatch with { decline: true }, the non-dismissible contract (the only exits
 * are a KO selection or Decline — no close affordance), and the no-double-submit
 * guard (handler early-return on isSubmitting; re-enable on the next frame).
 *
 * Uses node:test + @vue/test-utils (arena-client test infrastructure).
 */

import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import type { UIPendingOptionalKoReward } from '@legendary-arena/game-engine';
import type { SubmitMove, UiMoveName } from './uiMoveName.types';

import OptionalKoRewardPrompt from './OptionalKoRewardPrompt.vue';

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

const mockPending: UIPendingOptionalKoReward = {
  playerID: 'player-0',
  rewardLabel: '+3 Attack',
  eligibleHand: [
    {
      zone: 'hand',
      cardId: 'hand-card-1',
      display: { extId: 'hand-card-1', name: 'Hand Card 1', imageUrl: 'https://example.com/h1.jpg', cost: 2 },
    },
    {
      zone: 'hand',
      cardId: 'hand-card-2',
      display: { extId: 'hand-card-2', name: 'Hand Card 2', imageUrl: 'https://example.com/h2.jpg', cost: 3 },
    },
  ],
  eligibleDiscard: [
    {
      zone: 'discard',
      cardId: 'disc-card-1',
      display: { extId: 'disc-card-1', name: 'Discard Card 1', imageUrl: 'https://example.com/d1.jpg', cost: 1 },
    },
  ],
};

describe('OptionalKoRewardPrompt (WP-249 / EC-280)', () => {
  test('renders when pending choice exists and viewer is the chooser', () => {
    const { submitMove } = recorder();
    const wrapper = mount(OptionalKoRewardPrompt, {
      props: { pendingOptionalKoReward: mockPending, viewerPlayerId: 'player-0', submitMove },
    });
    assert.ok(wrapper.find('[data-testid="optional-ko-reward-prompt"]').exists());
  });

  test('does not render when pending choice is undefined', () => {
    const { submitMove } = recorder();
    const wrapper = mount(OptionalKoRewardPrompt, {
      props: { pendingOptionalKoReward: undefined, viewerPlayerId: 'player-0', submitMove },
    });
    assert.ok(!wrapper.find('[data-testid="optional-ko-reward-prompt"]').exists());
  });

  test('does not render when viewer is not the chooser', () => {
    const { submitMove } = recorder();
    const wrapper = mount(OptionalKoRewardPrompt, {
      props: { pendingOptionalKoReward: mockPending, viewerPlayerId: 'player-1', submitMove },
    });
    assert.ok(!wrapper.find('[data-testid="optional-ko-reward-prompt"]').exists());
  });

  test('does not render when viewer is a spectator (null playerId)', () => {
    const { submitMove } = recorder();
    const wrapper = mount(OptionalKoRewardPrompt, {
      props: { pendingOptionalKoReward: mockPending, viewerPlayerId: null, submitMove },
    });
    assert.ok(!wrapper.find('[data-testid="optional-ko-reward-prompt"]').exists());
  });

  test('shows the derived reward label', () => {
    const { submitMove } = recorder();
    const wrapper = mount(OptionalKoRewardPrompt, {
      props: { pendingOptionalKoReward: mockPending, viewerPlayerId: 'player-0', submitMove },
    });
    const reward = wrapper.find('[class*="reward"]');
    assert.ok(reward.exists() && reward.text().includes('+3 Attack'));
  });

  test('renders exactly the projected eligible hand + discard entries in projection order', () => {
    const { submitMove } = recorder();
    const wrapper = mount(OptionalKoRewardPrompt, {
      props: { pendingOptionalKoReward: mockPending, viewerPlayerId: 'player-0', submitMove },
    });
    const cardButtons = wrapper.findAll('[data-testid^="optional-ko-reward-card-"]');
    assert.equal(
      cardButtons.length,
      mockPending.eligibleHand.length + mockPending.eligibleDiscard.length,
      'one button per eligible hand + discard entry',
    );
    // projection order: eligibleHand first (hand-card-1, hand-card-2), then eligibleDiscard.
    assert.equal(cardButtons[0]!.attributes('data-testid'), 'optional-ko-reward-card-hand-hand-card-1');
    assert.equal(cardButtons[1]!.attributes('data-testid'), 'optional-ko-reward-card-hand-hand-card-2');
    assert.equal(cardButtons[2]!.attributes('data-testid'), 'optional-ko-reward-card-discard-disc-card-1');
  });

  test('clicking an eligible card fires resolveOptionalKoReward with that zone + cardId (round-trip)', async () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(OptionalKoRewardPrompt, {
      props: { pendingOptionalKoReward: mockPending, viewerPlayerId: 'player-0', submitMove },
    });
    await wrapper.find('[data-testid="optional-ko-reward-card-discard-disc-card-1"]').trigger('click');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, 'resolveOptionalKoReward');
    assert.deepEqual(calls[0]!.args, { zone: 'discard', cardId: 'disc-card-1' });
  });

  test('clicking Decline fires resolveOptionalKoReward with { decline: true }', async () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(OptionalKoRewardPrompt, {
      props: { pendingOptionalKoReward: mockPending, viewerPlayerId: 'player-0', submitMove },
    });
    await wrapper.find('[data-testid="optional-ko-reward-decline"]').trigger('click');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, 'resolveOptionalKoReward');
    assert.deepEqual(calls[0]!.args, { decline: true });
  });

  test('non-dismissible: the only controls are the eligible cards + Decline (no close/cancel affordance)', () => {
    const { submitMove } = recorder();
    const wrapper = mount(OptionalKoRewardPrompt, {
      props: { pendingOptionalKoReward: mockPending, viewerPlayerId: 'player-0', submitMove },
    });
    const allButtons = wrapper.findAll('button');
    const expected = mockPending.eligibleHand.length + mockPending.eligibleDiscard.length + 1; // + Decline
    assert.equal(allButtons.length, expected, 'no dismiss/close button beyond the KO cards + Decline');
  });

  test('a same-frame double-click on a card fires resolveOptionalKoReward exactly once (isSubmitting early-return)', async () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(OptionalKoRewardPrompt, {
      props: { pendingOptionalKoReward: mockPending, viewerPlayerId: 'player-0', submitMove },
    });
    const btn = wrapper.find('[data-testid="optional-ko-reward-card-hand-hand-card-1"]');
    await btn.trigger('click');
    await btn.trigger('click');
    assert.equal(calls.length, 1, 'second click is a no-op (handler early-returns on isSubmitting)');
  });

  test('Decline after a KO selection in the same frame is a no-op (no double-submit)', async () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(OptionalKoRewardPrompt, {
      props: { pendingOptionalKoReward: mockPending, viewerPlayerId: 'player-0', submitMove },
    });
    await wrapper.find('[data-testid="optional-ko-reward-card-hand-hand-card-1"]').trigger('click');
    await wrapper.find('[data-testid="optional-ko-reward-decline"]').trigger('click');
    assert.equal(calls.length, 1, 'Decline blocked after a KO submit in the same frame');
  });

  test('re-enables after the pending choice changes so the next queued choice is resolvable', async () => {
    // why: the prompt is kept mounted for the whole match by the parent page
    // (only its inner content is v-if'd), so isSubmitting must reset when a new
    // pendingOptionalKoReward arrives. Without the reset the panel would freeze
    // under WP-248's block-all guard.
    const { calls, submitMove } = recorder();
    const wrapper = mount(OptionalKoRewardPrompt, {
      props: { pendingOptionalKoReward: mockPending, viewerPlayerId: 'player-0', submitMove },
    });
    await wrapper.find('[data-testid="optional-ko-reward-card-hand-hand-card-1"]').trigger('click');
    assert.equal(calls.length, 1);

    const secondChoice: UIPendingOptionalKoReward = {
      playerID: 'player-0',
      rewardLabel: 'Rescue a Bystander',
      eligibleHand: [],
      eligibleDiscard: [
        {
          zone: 'discard',
          cardId: 'disc-card-2',
          display: { extId: 'disc-card-2', name: 'Discard Card 2', imageUrl: 'https://example.com/d2.jpg', cost: 0 },
        },
      ],
    };
    await wrapper.setProps({ pendingOptionalKoReward: secondChoice });

    await wrapper.find('[data-testid="optional-ko-reward-card-discard-disc-card-2"]').trigger('click');
    assert.equal(calls.length, 2, 'the next queued choice is resolvable (panel not frozen)');
    assert.deepEqual(calls[1]!.args, { zone: 'discard', cardId: 'disc-card-2' });
  });
});
