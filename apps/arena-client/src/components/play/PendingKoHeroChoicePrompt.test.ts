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

  test('a second click on a DIFFERENT card after the first submit is also a no-op', async () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(PendingKoHeroChoicePrompt, {
      props: { pendingKoHeroChoice: mockPendingChoice, viewerPlayerId: 'player-0', submitMove },
    });
    await wrapper.find('[data-testid="pending-ko-hero-choice-card-discard-test-hero-1"]').trigger('click');
    await wrapper.find('[data-testid="pending-ko-hero-choice-card-hand-test-hero-2"]').trigger('click');
    assert.equal(calls.length, 1, 'exactly one move per mount');
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
