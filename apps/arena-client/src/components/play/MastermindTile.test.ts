import '../../testing/jsdom-setup';

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import MastermindTile from './MastermindTile.vue';
import type {
  UIMastermindState,
  UITurnEconomyState,
} from '@legendary-arena/game-engine';
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

function mastermindLive(over: Partial<UIMastermindState> = {}): UIMastermindState {
  return {
    id: 'doctor-doom',
    tacticsRemaining: 4,
    tacticsDefeated: 0,
    display: {
      extId: 'mastermind-doom',
      name: 'Doctor Doom',
      imageUrl: 'https://images.barefootbetters.com/doom.png',
      cost: 6,
    },
    attachedBystanders: [],
    strikePile: [],
    ...over,
  };
}

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

describe('MastermindTile (WP-129 — extends WP-100)', () => {
  test('click emits fightMastermind with empty payload at play.main when affordable', () => {
    const { calls, submitMove } = recorder();
    const wrapper = mount(MastermindTile, {
      props: {
        mastermind: mastermindLive(),
        currentStage: 'main',
        economy: economy({ attack: 6, availableAttack: 6 }),
        submitMove,
      },
    });
    void wrapper.find('[data-testid="play-mastermind-button"]').trigger('click');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.name, 'fightMastermind');
    assert.deepEqual(calls[0]!.args, {});
  });

  test('disabled with stage tooltip when currentStage is not main', () => {
    const { submitMove } = recorder();
    for (const stage of ['start', 'cleanup'] as const) {
      const wrapper = mount(MastermindTile, {
        props: {
          mastermind: mastermindLive(),
          currentStage: stage,
          economy: economy({ availableAttack: 9 }),
          submitMove,
        },
      });
      const button = wrapper.find('[data-testid="play-mastermind-button"]');
      assert.equal(button.attributes('disabled'), '');
      assert.match(button.attributes('title')!, /Only available during the Main/);
    }
  });

  test('disabled with cost tooltip when economy short of mastermind.display.cost', () => {
    const { submitMove } = recorder();
    const wrapper = mount(MastermindTile, {
      props: {
        mastermind: mastermindLive(),
        currentStage: 'main',
        economy: economy({ attack: 4, availableAttack: 4 }),
        submitMove,
      },
    });
    const button = wrapper.find('[data-testid="play-mastermind-button"]');
    assert.equal(button.attributes('disabled'), '');
    assert.match(button.attributes('title')!, /Needs 6 attack, you have 4\./);
  });

  test('disabled with structural tooltip when tacticsRemaining is zero (precedence: stage+cost met)', () => {
    const { submitMove } = recorder();
    const wrapper = mount(MastermindTile, {
      props: {
        mastermind: mastermindLive({ tacticsRemaining: 0, tacticsDefeated: 4 }),
        currentStage: 'main',
        economy: economy({ availableAttack: 9 }),
        submitMove,
      },
    });
    const button = wrapper.find('[data-testid="play-mastermind-button"]');
    assert.equal(button.attributes('disabled'), '');
    assert.match(button.attributes('title')!, /All tactics defeated/);
  });

  test('renders display name + cost + tactics remaining', () => {
    const { submitMove } = recorder();
    const wrapper = mount(MastermindTile, {
      props: {
        mastermind: mastermindLive(),
        currentStage: 'main',
        economy: economy({ availableAttack: 9 }),
        submitMove,
      },
    });
    const tile = wrapper.find('[data-testid="card-tile"]');
    assert.equal(tile.exists(), true);
    assert.equal(tile.attributes('title'), 'Doctor Doom');
    const costBadge = wrapper.find('[data-testid="card-tile-cost-badge"]');
    assert.equal(costBadge.exists(), true);
    assert.equal(costBadge.text(), '6');
    const tactics = wrapper.find('[data-testid="play-mastermind-tactics-remaining"]');
    assert.match(tactics.text(), /Tactics remaining: 4/);
  });

  test('renders empty placeholder when attachedBystanders is empty (SAFE-SKIP-WP128)', () => {
    const { submitMove } = recorder();
    const wrapper = mount(MastermindTile, {
      props: {
        mastermind: mastermindLive(),
        currentStage: 'main',
        economy: economy({ availableAttack: 9 }),
        submitMove,
      },
    });
    assert.equal(
      wrapper.find('[data-testid="play-mastermind-bystanders-empty"]').exists(),
      true,
    );
  });

  test('renders attachedBystanders list when projected (forward-compat)', () => {
    const { submitMove } = recorder();
    const wrapper = mount(MastermindTile, {
      props: {
        mastermind: mastermindLive({
          attachedBystanders: [
            {
              extId: 'bystander-1',
              display: {
                extId: 'bystander-1',
                name: 'Civilian Alpha',
                imageUrl: 'https://images.barefootbetters.com/bystander-1.png',
                cost: null,
              },
            },
          ],
        }),
        currentStage: 'main',
        economy: economy({ availableAttack: 9 }),
        submitMove,
      },
    });
    assert.match(
      wrapper.find('[data-testid="play-mastermind-bystanders-list"]').text(),
      /Civilian Alpha/,
    );
  });
});
