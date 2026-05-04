import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import HandRow from './HandRow.vue';
import type { UICardDisplay } from '@legendary-arena/game-engine';
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

function display(extId: string, name: string, cost: number | null = null): UICardDisplay {
  return {
    extId,
    name,
    imageUrl: `https://images.barefootbetters.com/${extId}.png`,
    cost,
  };
}

describe('HandRow (WP-129 — extends WP-100)', () => {
  test('renders one button per CardExtId in the hand', () => {
    const { submitMove } = recorder();
    const wrapper = mount(HandRow, {
      props: {
        handCards: ['cap-rogers', 'iron-man-stark', 'spider-man-parker'],
        currentStage: 'main',
        submitMove,
      },
    });
    const buttons = wrapper.findAll('[data-testid="play-hand-card"]');
    assert.equal(buttons.length, 3);
    assert.equal(buttons[0]!.attributes('data-card-id'), 'cap-rogers');
  });

  test('uses handDisplay names when provided (WP-128 parallel array)', () => {
    const { submitMove } = recorder();
    const wrapper = mount(HandRow, {
      props: {
        handCards: ['cap-rogers', 'iron-man-stark'],
        handDisplay: [display('cap-rogers', 'Captain America'), display('iron-man-stark', 'Iron Man')],
        currentStage: 'main',
        submitMove,
      },
    });
    const buttons = wrapper.findAll('[data-testid="play-hand-card"]');
    assert.equal(buttons[0]!.text(), 'Captain America');
    assert.equal(buttons[1]!.text(), 'Iron Man');
  });

  test('falls back to humanized cardId when handDisplay is missing', () => {
    const { submitMove } = recorder();
    const wrapper = mount(HandRow, {
      props: {
        handCards: ['cap-rogers'],
        currentStage: 'main',
        submitMove,
      },
    });
    assert.equal(wrapper.find('[data-testid="play-hand-card"]').text(), 'cap rogers');
  });

  test('falls back to humanized cardId when handDisplay entry is the WP-111 placeholder', () => {
    // why: regression — starter cards (`starting-shield-agent` /
    // `starting-shield-trooper`) are engine-synthetic and not in the
    // registry, so buildCardDisplayData does not populate display
    // entries for them. The projection falls back to
    // UNKNOWN_DISPLAY_PLACEHOLDER (name === '<unknown>'). HandRow must
    // detect this shape and render a humanized cardId instead.
    const { submitMove } = recorder();
    const wrapper = mount(HandRow, {
      props: {
        handCards: ['starting-shield-agent', 'starting-shield-trooper'],
        handDisplay: [
          { extId: 'starting-shield-agent', name: '<unknown>', imageUrl: '', cost: null },
          { extId: 'starting-shield-trooper', name: '<unknown>', imageUrl: '', cost: null },
        ],
        currentStage: 'main',
        submitMove,
      },
    });
    const buttons = wrapper.findAll('[data-testid="play-hand-card"]');
    assert.equal(buttons[0]!.text(), 'starting shield agent');
    assert.equal(buttons[1]!.text(), 'starting shield trooper');
  });

  test('click emits playCard with the card id at play.main', () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(HandRow, {
      props: {
        handCards: ['cap-rogers', 'iron-man-stark'],
        currentStage: 'main',
        submitMove,
      },
    });
    void wrapper.findAll('[data-testid="play-hand-card"]')[1]!.trigger('click');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, 'playCard');
    assert.deepEqual(calls[0]!.args, { cardId: 'iron-man-stark' });
  });

  test('disables every button at play.start and play.cleanup with stage-gating tooltip', () => {
    const { submitMove } = recorder();
    for (const stage of ['start', 'cleanup'] as const) {
      const wrapper = mount(HandRow, {
        props: { handCards: ['a', 'b'], currentStage: stage, submitMove },
      });
      const buttons = wrapper.findAll('[data-testid="play-hand-card"]');
      for (const button of buttons) {
        assert.equal(button.attributes('disabled'), '', `disabled in stage '${stage}'`);
        assert.equal(button.attributes('aria-disabled'), 'true');
        assert.match(button.attributes('title')!, /Only available during the Main/);
      }
    }
  });

  test('renders empty placeholder when handCards is empty', () => {
    const { submitMove } = recorder();
    const wrapper = mount(HandRow, {
      props: { handCards: [], currentStage: 'main', submitMove },
    });
    assert.equal(wrapper.find('[data-testid="play-hand-empty"]').exists(), true);
    assert.equal(wrapper.findAll('[data-testid="play-hand-card"]').length, 0);
  });
});
