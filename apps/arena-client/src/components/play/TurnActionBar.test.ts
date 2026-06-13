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

describe('TurnActionBar (WP-129 — 3-step rewrite of WP-100; WP-236 — Draw scaffold retired)', () => {
  test('Reveal click emits revealVillainCard with empty payload at play.start', () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(TurnActionBar, {
      props: { currentStage: 'start', submitMove },
    });
    void wrapper.find('[data-testid="play-action-reveal"]').trigger('click');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, 'revealVillainCard');
    assert.deepEqual(calls[0]!.args, {});
  });

  test('Reveal is enabled only in start with stage tooltip otherwise', () => {
    const { submitMove } = recorder();
    const startWrapper = mount(TurnActionBar, {
      props: { currentStage: 'start', submitMove },
    });
    assert.equal(
      startWrapper.find('[data-testid="play-action-reveal"]').attributes('disabled'),
      undefined,
    );

    for (const stage of ['main', 'cleanup'] as const) {
      const wrapper = mount(TurnActionBar, {
        props: { currentStage: stage, submitMove },
      });
      const reveal = wrapper.find('[data-testid="play-action-reveal"]');
      assert.equal(reveal.attributes('disabled'), '');
      assert.match(reveal.attributes('title')!, /Only available during the Start/);
    }
  });

  test('Pass-priority click emits advanceStage per D-10011 (canonical, not no-op)', () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(TurnActionBar, {
      props: { currentStage: 'main', submitMove },
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
        props: { currentStage: stage, submitMove },
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
      props: { currentStage: 'cleanup', submitMove },
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
        props: { currentStage: stage, submitMove },
      });
      const endTurn = wrapper.find('[data-testid="play-action-end-turn"]');
      assert.equal(endTurn.attributes('disabled'), '');
      assert.match(endTurn.attributes('title')!, /Only available during the Cleanup/);
    }

    const cleanupWrapper = mount(TurnActionBar, {
      props: { currentStage: 'cleanup', submitMove },
    });
    assert.equal(
      cleanupWrapper.find('[data-testid="play-action-end-turn"]').attributes('disabled'),
      undefined,
    );
  });

  test('Draw scaffold is gone — no play-action-draw control rendered (WP-236)', () => {
    // why: WP-236 retired the "Draw to 6" scaffold button. The engine now
    // auto-draws the start-of-turn hand at onBegin, so the button (and its
    // handCount prop) are deleted, not refactored. The control must not render
    // in any stage.
    const { submitMove } = recorder();
    for (const stage of ['start', 'main', 'cleanup'] as const) {
      const wrapper = mount(TurnActionBar, {
        props: { currentStage: stage, submitMove },
      });
      assert.equal(
        wrapper.find('[data-testid="play-action-draw"]').exists(),
        false,
        `the Draw control must not render at stage '${stage}'`,
      );
    }
  });

  test('renders 3 steps with the active step flagged', () => {
    const { submitMove } = recorder();
    const wrapper = mount(TurnActionBar, {
      props: { currentStage: 'main', submitMove },
    });
    const root = wrapper.find('[data-testid="play-turn-action-bar"]');
    assert.equal(root.attributes('data-active-step'), '2');
    assert.equal(wrapper.find('[data-testid="play-turn-step-1"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-turn-step-2"]').exists(), true);
    assert.equal(wrapper.find('[data-testid="play-turn-step-3"]').exists(), true);
  });

  test('End Turn is disabled with pending-choice tooltip at cleanup when hasPendingChoice is true', () => {
    // why: D-22203 — the engine's dual turn-end guard (WP-220) blocks endTurn
    // when pendingHeroChoice is set; the client gate surfaces the reason.
    const { submitMove } = recorder();
    const wrapper = mount(TurnActionBar, {
      props: { currentStage: 'cleanup', submitMove, hasPendingChoice: true },
    });
    const endTurn = wrapper.find('[data-testid="play-action-end-turn"]');
    assert.equal(endTurn.attributes('disabled'), '');
    assert.match(
      endTurn.attributes('title')!,
      /Resolve the revealed card choice/,
      'End Turn tooltip must cite the pending choice gate reason',
    );
  });

  test('Pass Priority is disabled with pending-choice tooltip at cleanup when hasPendingChoice is true', () => {
    // why: D-22203 — pass-priority at cleanup also blocked to prevent the
    // player from advancing past cleanup without resolving the choice.
    const { submitMove } = recorder();
    const wrapper = mount(TurnActionBar, {
      props: { currentStage: 'cleanup', submitMove, hasPendingChoice: true },
    });
    const passPriority = wrapper.find('[data-testid="play-action-pass-priority"]');
    assert.equal(passPriority.attributes('disabled'), '');
    assert.match(
      passPriority.attributes('title')!,
      /Resolve the revealed card choice/,
      'Pass Priority tooltip must cite the pending choice gate reason at cleanup',
    );
  });

  test('End Turn + Pass Priority are disabled at EVERY stage with the KO tooltip when hasPendingKoChoice is true (D-24012)', () => {
    // why: D-24012 — a pending KO-a-Hero choice freezes the board, so both
    // end-turn and pass-priority are blocked at every stage (not just cleanup).
    const { submitMove } = recorder();
    for (const stage of ['start', 'main', 'cleanup'] as const) {
      const wrapper = mount(TurnActionBar, {
        props: { currentStage: stage, submitMove, hasPendingKoChoice: true },
      });
      const endTurn = wrapper.find('[data-testid="play-action-end-turn"]');
      const passPriority = wrapper.find('[data-testid="play-action-pass-priority"]');
      assert.equal(passPriority.attributes('disabled'), '', `pass-priority disabled at ${stage}`);
      assert.match(passPriority.attributes('title')!, /Choose a Hero to KO/);
      if (stage === 'cleanup') {
        assert.equal(endTurn.attributes('disabled'), '', 'end-turn disabled at cleanup');
        assert.match(endTurn.attributes('title')!, /Choose a Hero to KO/);
      }
    }
  });

  test('KO gate reason takes precedence over the hero-choice reason when both are active', () => {
    // why: D-24012 — when both pending systems are active at cleanup, the KO
    // gate reason wins in the TurnActionBar messaging.
    const { submitMove } = recorder();
    const wrapper = mount(TurnActionBar, {
      props: { currentStage: 'cleanup', submitMove, hasPendingChoice: true, hasPendingKoChoice: true },
    });
    const endTurn = wrapper.find('[data-testid="play-action-end-turn"]');
    assert.match(
      endTurn.attributes('title')!,
      /Choose a Hero to KO/,
      'KO gate reason takes precedence over the hero-choice reason',
    );
  });
});
