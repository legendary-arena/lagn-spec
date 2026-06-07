import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import PendingHeroChoicePrompt from './PendingHeroChoicePrompt.vue';
import type { UIPendingHeroChoice } from '@legendary-arena/game-engine';
import type { SubmitMove, UiMoveName } from './uiMoveName.types';

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

const sampleChoice: UIPendingHeroChoice = {
  choiceType: 'discard-or-return',
  cardId: 'core/black-widow/strike#0',
  playerID: '0',
  display: {
    extId: 'core/black-widow/strike#0',
    name: 'Mission Accomplished',
    imageUrl: 'https://images.legendary-arena.com/core/hero-black-widow-1.webp',
    cost: 2,
  },
};

describe('PendingHeroChoicePrompt (WP-222 / EC-254)', () => {
  test('renders card name when viewer is the choosing player', () => {
    const { submitMove } = recorder();
    const wrapper = mount(PendingHeroChoicePrompt, {
      props: {
        pendingHeroChoice: sampleChoice,
        viewerPlayerId: '0',
        submitMove,
      },
    });
    const nameEl = wrapper.find('[data-testid="pending-hero-choice-card-name"]');
    assert.ok(nameEl.exists(), 'card-name element must be rendered');
    assert.equal(nameEl.text(), 'Mission Accomplished');
  });

  test('"Discard" button fires resolveHeroChoice with resolution:discard', () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(PendingHeroChoicePrompt, {
      props: {
        pendingHeroChoice: sampleChoice,
        viewerPlayerId: '0',
        submitMove,
      },
    });
    void wrapper.find('[data-testid="pending-hero-choice-discard"]').trigger('click');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, 'resolveHeroChoice');
    assert.deepEqual(calls[0]!.args, { resolution: 'discard' });
  });

  test('"Put it back" button fires resolveHeroChoice with resolution:return', () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(PendingHeroChoicePrompt, {
      props: {
        pendingHeroChoice: sampleChoice,
        viewerPlayerId: '0',
        submitMove,
      },
    });
    void wrapper.find('[data-testid="pending-hero-choice-return"]').trigger('click');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, 'resolveHeroChoice');
    assert.deepEqual(calls[0]!.args, { resolution: 'return' });
  });

  test('prompt is hidden when pendingHeroChoice is undefined', () => {
    const { submitMove } = recorder();
    const wrapper = mount(PendingHeroChoicePrompt, {
      props: {
        pendingHeroChoice: undefined,
        viewerPlayerId: '0',
        submitMove,
      },
    });
    assert.equal(
      wrapper.find('[data-testid="pending-hero-choice-prompt"]').exists(),
      false,
      'prompt must not render when pendingHeroChoice is undefined',
    );
  });

  test('prompt is hidden when viewerPlayerId does not match the choosing player', () => {
    const { submitMove } = recorder();
    const wrapper = mount(PendingHeroChoicePrompt, {
      props: {
        pendingHeroChoice: sampleChoice,
        viewerPlayerId: '1',
        submitMove,
      },
    });
    assert.equal(
      wrapper.find('[data-testid="pending-hero-choice-prompt"]').exists(),
      false,
      'prompt must not render for a viewer who is not the choosing player',
    );
  });

  test('prompt is hidden when viewerPlayerId is null', () => {
    const { submitMove } = recorder();
    const wrapper = mount(PendingHeroChoicePrompt, {
      props: {
        pendingHeroChoice: sampleChoice,
        viewerPlayerId: null,
        submitMove,
      },
    });
    assert.equal(
      wrapper.find('[data-testid="pending-hero-choice-prompt"]').exists(),
      false,
      'prompt must not render when viewerPlayerId is null (spectator frame)',
    );
  });

  test('both buttons are disabled after the first click (double-submit prevention)', async () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(PendingHeroChoicePrompt, {
      props: {
        pendingHeroChoice: sampleChoice,
        viewerPlayerId: '0',
        submitMove,
      },
    });

    const discardBtn = wrapper.find('[data-testid="pending-hero-choice-discard"]');
    const returnBtn = wrapper.find('[data-testid="pending-hero-choice-return"]');

    // First click — submits the move and sets isSubmitting.
    await discardBtn.trigger('click');
    assert.equal(calls.length, 1, 'exactly one move must be submitted on first click');

    // After first click both buttons must be disabled.
    assert.equal(
      discardBtn.attributes('disabled'),
      '',
      '"Discard" must be disabled after first click',
    );
    assert.equal(
      returnBtn.attributes('disabled'),
      '',
      '"Put it back" must be disabled after first click',
    );

    // Second click on return must be a no-op.
    await returnBtn.trigger('click');
    assert.equal(
      calls.length,
      1,
      'second click must not submit another move (isSubmitting guard)',
    );
  });
});
