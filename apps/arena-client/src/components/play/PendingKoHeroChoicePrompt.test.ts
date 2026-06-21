/**
 * Tests for the PendingKoHeroChoicePrompt component (WP-243 / EC-274).
 *
 * Covers render gates (present only for the chooser), move dispatch with the
 * clicked { zone, cardId }, double-click single-submit (handler early-return on
 * isSubmitting), render-all-and-only the projected eligible, and the fail-safe
 * empty-eligible case (no actionable entry, no move fired).
 *
 * Uses node:test + @vue/test-utils (arena-client test infrastructure).
 */

import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import type { UIPendingKoHeroChoice } from '@legendary-arena/game-engine';
import type { SubmitMove, UiMoveName } from './uiMoveName.types';

import PendingKoHeroChoicePrompt from './PendingKoHeroChoicePrompt.vue';

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

const mockPendingChoice: UIPendingKoHeroChoice = {
  choiceType: 'ko-hero',
  playerID: 'player-0',
  remaining: 2,
  eligible: [
    {
      zone: 'discard',
      cardId: 'test-hero-1',
      display: { extId: 'test-hero-1', name: 'Test Hero 1', imageUrl: 'https://example.com/hero1.jpg', cost: 5 },
    },
    {
      zone: 'hand',
      cardId: 'test-hero-2',
      display: { extId: 'test-hero-2', name: 'Test Hero 2', imageUrl: 'https://example.com/hero2.jpg', cost: 6 },
    },
  ],
};

describe('PendingKoHeroChoicePrompt (WP-243 / EC-274)', () => {
  test('renders when pending choice exists and viewer is the chooser', () => {
    const { submitMove } = recorder();
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: { pendingKoHeroChoice: mockPendingChoice, viewerPlayerId: 'player-0', submitMove },
    });
    assert.ok(wrapper.find('[data-testid="pending-ko-hero-choice-prompt"]').exists());
  });

  test('does not render when pending choice is undefined', () => {
    const { submitMove } = recorder();
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: { pendingKoHeroChoice: undefined, viewerPlayerId: 'player-0', submitMove },
    });
    assert.ok(!wrapper.find('[data-testid="pending-ko-hero-choice-prompt"]').exists());
  });

  test('does not render when viewer is not the chooser', () => {
    const { submitMove } = recorder();
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: { pendingKoHeroChoice: mockPendingChoice, viewerPlayerId: 'player-1', submitMove },
    });
    assert.ok(!wrapper.find('[data-testid="pending-ko-hero-choice-prompt"]').exists());
  });

  test('does not render when viewer is a spectator (null playerId)', () => {
    const { submitMove } = recorder();
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: { pendingKoHeroChoice: mockPendingChoice, viewerPlayerId: null, submitMove },
    });
    assert.ok(!wrapper.find('[data-testid="pending-ko-hero-choice-prompt"]').exists());
  });

  test('shows the remaining count when greater than 1', () => {
    const { submitMove } = recorder();
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: { pendingKoHeroChoice: mockPendingChoice, viewerPlayerId: 'player-0', submitMove },
    });
    const remaining = wrapper.find('[class*="remaining"]');
    assert.ok(remaining.exists() && remaining.text().includes('2'));
  });

  test('renders exactly the projected eligible entries (render-all-and-only)', () => {
    const { submitMove } = recorder();
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: { pendingKoHeroChoice: mockPendingChoice, viewerPlayerId: 'player-0', submitMove },
    });
    const buttons = wrapper.findAll('[data-testid^="pending-ko-hero-choice-card-"]');
    assert.equal(buttons.length, mockPendingChoice.eligible.length, 'one button per eligible entry');
    assert.ok(wrapper.find('[data-testid="pending-ko-hero-choice-card-discard-test-hero-1"]').exists());
    assert.ok(wrapper.find('[data-testid="pending-ko-hero-choice-card-hand-test-hero-2"]').exists());
  });

  test('clicking an eligible card fires resolveKoHeroChoice with that zone + cardId', async () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: { pendingKoHeroChoice: mockPendingChoice, viewerPlayerId: 'player-0', submitMove },
    });
    await wrapper.find('[data-testid="pending-ko-hero-choice-card-hand-test-hero-2"]').trigger('click');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, 'resolveKoHeroChoice');
    assert.deepEqual(calls[0]!.args, { zone: 'hand', cardId: 'test-hero-2' });
  });

  test('a same-frame double-click fires resolveKoHeroChoice exactly once (isSubmitting early-return)', async () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: { pendingKoHeroChoice: mockPendingChoice, viewerPlayerId: 'player-0', submitMove },
    });
    const btn = wrapper.find('[data-testid="pending-ko-hero-choice-card-discard-test-hero-1"]');
    await btn.trigger('click');
    await btn.trigger('click');
    assert.equal(calls.length, 1, 'second click is a no-op (handler early-returns on isSubmitting)');
  });

  test('a second click on a different card in the SAME frame is a no-op (debounce until next frame)', async () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: { pendingKoHeroChoice: mockPendingChoice, viewerPlayerId: 'player-0', submitMove },
    });
    await wrapper.find('[data-testid="pending-ko-hero-choice-card-discard-test-hero-1"]').trigger('click');
    await wrapper.find('[data-testid="pending-ko-hero-choice-card-hand-test-hero-2"]').trigger('click');
    // why: with NO new server frame (props unchanged), the second click is
    // debounced — isSubmitting clears only when the pendingKoHeroChoice prop
    // changes (next frame). See the re-enable regression test below.
    assert.equal(calls.length, 1, 'second same-frame click is blocked');
  });

  test('re-enables after the pending choice changes so the next queued KO is resolvable (freeze regression)', async () => {
    // why: regression for the play.legendary-arena.com freeze — the prompt is
    // kept mounted for the whole match by the parent page (only its inner
    // content is v-if'd), so isSubmitting must reset when a new choice arrives.
    // Without the reset, the front-popped SECOND choice in a multi-KO queue
    // (and every later KO choice in the match) rendered with disabled buttons,
    // freezing the board under the block-all guard.
    const { calls, submitMove } = recorder();
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: { pendingKoHeroChoice: mockPendingChoice, viewerPlayerId: 'player-0', submitMove },
    });

    // Resolve the first choice (remaining: 2).
    await wrapper.find('[data-testid="pending-ko-hero-choice-card-discard-test-hero-1"]').trigger('click');
    assert.equal(calls.length, 1);

    // The engine front-pops the queue; the next server frame delivers the
    // SECOND choice as a fresh object.
    const secondChoice: UIPendingKoHeroChoice = {
      choiceType: 'ko-hero',
      playerID: 'player-0',
      remaining: 1,
      eligible: [
        {
          zone: 'inPlay',
          cardId: 'test-hero-3',
          display: { extId: 'test-hero-3', name: 'Test Hero 3', imageUrl: 'https://example.com/hero3.jpg', cost: 4 },
        },
      ],
    };
    await wrapper.setProps({ pendingKoHeroChoice: secondChoice });

    // The buttons must be interactive again — the panel is NOT frozen.
    await wrapper.find('[data-testid="pending-ko-hero-choice-card-inPlay-test-hero-3"]').trigger('click');
    assert.equal(calls.length, 2, 'the next queued KO choice is resolvable (panel not frozen)');
    assert.deepEqual(calls[1]!.args, { zone: 'inPlay', cardId: 'test-hero-3' });
  });

  test('fail-safe: an empty eligible list renders no actionable entry and fires no move', () => {
    const { calls, submitMove } = recorder();
    const emptyChoice: UIPendingKoHeroChoice = {
      choiceType: 'ko-hero',
      playerID: 'player-0',
      remaining: 1,
      eligible: [],
    };
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: { pendingKoHeroChoice: emptyChoice, viewerPlayerId: 'player-0', submitMove },
    });
    const buttons = wrapper.findAll('[data-testid^="pending-ko-hero-choice-card-"]');
    assert.equal(buttons.length, 0, 'no actionable entry rendered for an empty eligible set');
    assert.equal(calls.length, 0, 'no move fired');
  });
});
