import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { activeStepFor, useTurnActions } from './useTurnActions';

describe('useTurnActions (WP-129)', () => {
  test('activeStepFor maps start → 1, main → 2, cleanup → 3', () => {
    assert.equal(activeStepFor('start'), 1);
    assert.equal(activeStepFor('main'), 2);
    assert.equal(activeStepFor('cleanup'), 3);
  });

  test('canRevealVillain allowed only in start', () => {
    assert.equal(useTurnActions('start').canRevealVillain().allowed, true);
    assert.equal(useTurnActions('main').canRevealVillain().allowed, false);
    assert.equal(useTurnActions('cleanup').canRevealVillain().allowed, false);
  });

  test('canPlayCard allowed only in main with full-sentence reason elsewhere', () => {
    assert.equal(useTurnActions('main').canPlayCard().allowed, true);
    const startResult = useTurnActions('start').canPlayCard();
    assert.equal(startResult.allowed, false);
    assert.match(startResult.reason!, /Only available during the Main/);
  });

  test('canFightVillain / canRecruitHero / canFightMastermind allowed only in main', () => {
    const main = useTurnActions('main');
    assert.equal(main.canFightVillain().allowed, true);
    assert.equal(main.canRecruitHero().allowed, true);
    assert.equal(main.canFightMastermind().allowed, true);

    const cleanup = useTurnActions('cleanup');
    assert.equal(cleanup.canFightVillain().allowed, false);
    assert.equal(cleanup.canRecruitHero().allowed, false);
    assert.equal(cleanup.canFightMastermind().allowed, false);
  });

  test('canPassPriority allowed at every stage (D-10011 advanceStage canonical)', () => {
    assert.equal(useTurnActions('start').canPassPriority().allowed, true);
    assert.equal(useTurnActions('main').canPassPriority().allowed, true);
    assert.equal(useTurnActions('cleanup').canPassPriority().allowed, true);
  });

  test('canEndTurn allowed only in cleanup', () => {
    assert.equal(useTurnActions('cleanup').canEndTurn().allowed, true);
    assert.equal(useTurnActions('start').canEndTurn().allowed, false);
    assert.equal(useTurnActions('main').canEndTurn().allowed, false);
  });

  test('disabled reason cites the current stage so the user understands why', () => {
    const result = useTurnActions('cleanup').canPlayCard();
    assert.equal(result.allowed, false);
    assert.match(result.reason!, /current: cleanup/);
  });

  test('activeStep field on the returned record matches activeStepFor', () => {
    assert.equal(useTurnActions('start').activeStep, 1);
    assert.equal(useTurnActions('main').activeStep, 2);
    assert.equal(useTurnActions('cleanup').activeStep, 3);
  });
});
