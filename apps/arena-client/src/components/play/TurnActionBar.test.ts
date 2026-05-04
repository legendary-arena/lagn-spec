import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import TurnActionBar from './TurnActionBar.vue';
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

describe('TurnActionBar (WP-129 — 3-step rewrite of WP-100)', () => {
  test('Reveal click emits revealVillainCard with empty payload at play.start', () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(TurnActionBar, {
      props: { currentStage: 'start', handCount: 0, submitMove },
    });
    void wrapper.find('[data-testid="play-action-reveal"]').trigger('click');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, 'revealVillainCard');
    assert.deepEqual(calls[0]!.args, {});
  });

  test('Reveal is enabled only in start with stage tooltip otherwise', () => {
    const { submitMove } = recorder();
    const startWrapper = mount(TurnActionBar, {
      props: { currentStage: 'start', handCount: 0, submitMove },
    });
    assert.equal(
      startWrapper.find('[data-testid="play-action-reveal"]').attributes('disabled'),
      undefined,
    );

    for (const stage of ['main', 'cleanup'] as const) {
      const wrapper = mount(TurnActionBar, {
        props: { currentStage: stage, handCount: 0, submitMove },
      });
      const reveal = wrapper.find('[data-testid="play-action-reveal"]');
      assert.equal(reveal.attributes('disabled'), '');
      assert.match(reveal.attributes('title')!, /Only available during the Start/);
    }
  });

  test('Pass-priority click emits advanceStage per D-10011 (canonical, not no-op)', () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(TurnActionBar, {
      props: { currentStage: 'main', handCount: 0, submitMove },
    });
    void wrapper.find('[data-testid="play-action-pass-priority"]').trigger('click');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, 'advanceStage');
    assert.deepEqual(calls[0]!.args, {});
  });

  test('Pass-priority is enabled at every stage (D-10011 stage-advance vocabulary)', () => {
    const { submitMove } = recorder();
    for (const stage of ['start', 'main', 'cleanup'] as const) {
      const wrapper = mount(TurnActionBar, {
        props: { currentStage: stage, handCount: 0, submitMove },
      });
      assert.equal(
        wrapper.find('[data-testid="play-action-pass-priority"]').attributes('disabled'),
        undefined,
        `pass-priority should be enabled at stage '${stage}'`,
      );
    }
  });

  test('End Turn click emits endTurn with empty payload at play.cleanup', () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(TurnActionBar, {
      props: { currentStage: 'cleanup', handCount: 0, submitMove },
    });
    void wrapper.find('[data-testid="play-action-end-turn"]').trigger('click');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, 'endTurn');
    assert.deepEqual(calls[0]!.args, {});
  });

  test('End Turn is enabled only in cleanup with stage tooltip otherwise', () => {
    const { submitMove } = recorder();
    for (const stage of ['start', 'main'] as const) {
      const wrapper = mount(TurnActionBar, {
        props: { currentStage: stage, handCount: 0, submitMove },
      });
      const endTurn = wrapper.find('[data-testid="play-action-end-turn"]');
      assert.equal(endTurn.attributes('disabled'), '');
      assert.match(endTurn.attributes('title')!, /Only available during the Cleanup/);
    }

    const cleanupWrapper = mount(TurnActionBar, {
      props: { currentStage: 'cleanup', handCount: 0, submitMove },
    });
    assert.equal(
      cleanupWrapper.find('[data-testid="play-action-end-turn"]').attributes('disabled'),
      undefined,
    );
  });

  test('Draw click emits drawCards with count = max(0, 6 - handCount) at play.start', () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(TurnActionBar, {
      props: { currentStage: 'start', handCount: 0, submitMove },
    });
    void wrapper.find('[data-testid="play-action-draw"]').trigger('click');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, 'drawCards');
    assert.deepEqual(calls[0]!.args, { count: 6 });
  });

  test('Draw caps count to fill exactly to 6 cards (D-10013 idempotency)', () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(TurnActionBar, {
      props: { currentStage: 'main', handCount: 4, submitMove },
    });
    void wrapper.find('[data-testid="play-action-draw"]').trigger('click');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]!.args, { count: 2 });
  });

  test('Draw is disabled with full-sentence tooltip when hand is already at 6 cards', () => {
    const { submitMove } = recorder();
    const wrapper = mount(TurnActionBar, {
      props: { currentStage: 'main', handCount: 6, submitMove },
    });
    const draw = wrapper.find('[data-testid="play-action-draw"]');
    assert.equal(draw.attributes('disabled'), '');
    assert.match(draw.attributes('title')!, /Hand already at 6 cards/);
  });

  test('Draw is disabled at play.cleanup with stage-gating tooltip', () => {
    const { submitMove } = recorder();
    const wrapper = mount(TurnActionBar, {
      props: { currentStage: 'cleanup', handCount: 0, submitMove },
    });
    const draw = wrapper.find('[data-testid="play-action-draw"]');
    assert.equal(draw.attributes('disabled'), '');
    assert.match(draw.attributes('title')!, /Only available during the Start.*or Main step/);
  });

  test('renders 3 steps with the active step flagged', () => {
    const { submitMove } = recorder();
    const wrapper = mount(TurnActionBar, {
      props: { currentStage: 'main', handCount: 0, submitMove },
    });
    const root = wrapper.find('[data-testid="play-turn-action-bar"]');
    assert.equal(root.attributes('data-active-step'), '2');
    assert.equal(wrapper.find('[data-testid="play-turn-step-1"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-turn-step-2"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-turn-step-3"]').exists(), true);
  });
});
