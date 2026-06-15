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

describe('useTurnActions — hasPendingChoice gating (WP-222 / EC-254 / D-22203)', () => {
  test('canEndTurn blocked at cleanup when hasPendingChoice is true', () => {
    const result = useTurnActions('cleanup', true, true).canEndTurn();
    assert.equal(result.allowed, false);
    assert.equal(
      result.reason,
      'Resolve the revealed card choice before ending your turn.',
      'gate reason must match locked value from EC-254',
    );
  });

  test('canPassPriority blocked at cleanup when hasPendingChoice is true', () => {
    const result = useTurnActions('cleanup', true, true).canPassPriority();
    assert.equal(result.allowed, false);
    assert.equal(
      result.reason,
      'Resolve the revealed card choice before ending your turn.',
      'gate reason must match locked value from EC-254',
    );
  });

  test('canEndTurn and canPassPriority allowed at cleanup when hasPendingChoice is false', () => {
    // why: default false — existing callers must be unaffected
    const actions = useTurnActions('cleanup', true, false);
    assert.equal(actions.canEndTurn().allowed, true);
    assert.equal(actions.canPassPriority().allowed, true);
  });

  test('canPassPriority allowed at start and main even when hasPendingChoice is true', () => {
    // why: D-22203 — only cleanup is blocked; start and main must remain
    // passable so the player can advance through stages to reach the prompt.
    assert.equal(useTurnActions('start', true, true).canPassPriority().allowed, true);
    assert.equal(useTurnActions('main', true, true).canPassPriority().allowed, true);
  });
});

describe('useTurnActions — hasPendingKoChoice gating (WP-243 / EC-274 / D-24012)', () => {
  const KO_REASON = 'Choose a Hero to KO before taking another action.';

  test('canEndTurn blocked at EVERY stage when hasPendingKoChoice is true', () => {
    for (const stage of ['start', 'main', 'cleanup'] as const) {
      const result = useTurnActions(stage, true, false, true).canEndTurn();
      assert.equal(result.allowed, false, `endTurn blocked at ${stage}`);
      assert.equal(result.reason, KO_REASON, 'KO gate reason matches the locked value');
    }
  });

  test('canPassPriority blocked at EVERY stage when hasPendingKoChoice is true (board frozen)', () => {
    for (const stage of ['start', 'main', 'cleanup'] as const) {
      const result = useTurnActions(stage, true, false, true).canPassPriority();
      assert.equal(result.allowed, false, `passPriority blocked at ${stage}`);
      assert.equal(result.reason, KO_REASON);
    }
  });

  test('defaults false — both allowed when no KO choice pending', () => {
    const actions = useTurnActions('cleanup', true, false, false);
    assert.equal(actions.canEndTurn().allowed, true);
    assert.equal(actions.canPassPriority().allowed, true);
  });

  test("OR'd gate: blocked when EITHER hasPendingChoice OR hasPendingKoChoice; KO reason takes precedence when both active", () => {
    // hero-only at cleanup → hero reason
    const heroOnly = useTurnActions('cleanup', true, true, false).canEndTurn();
    assert.equal(heroOnly.allowed, false);
    assert.match(heroOnly.reason!, /revealed card choice/);

    // KO-only at main → KO reason (hero gate would not fire at main)
    const koOnly = useTurnActions('main', true, false, true).canEndTurn();
    assert.equal(koOnly.allowed, false);
    assert.equal(koOnly.reason, KO_REASON);

    // both active at cleanup → KO reason takes precedence
    const both = useTurnActions('cleanup', true, true, true).canEndTurn();
    assert.equal(both.allowed, false);
    assert.equal(both.reason, KO_REASON, 'KO gate reason takes precedence over the hero reason');
  });
});

describe('useTurnActions — hasPendingOptionalKoReward gating (WP-249 / EC-280 / D-24020)', () => {
  const OPTIONAL_REASON = 'Choose a card to KO or Decline before taking another action.';

  test('canEndTurn blocked at EVERY stage when hasPendingOptionalKoReward is true', () => {
    for (const stage of ['start', 'main', 'cleanup'] as const) {
      const result = useTurnActions(stage, true, false, false, true).canEndTurn();
      assert.equal(result.allowed, false, `endTurn blocked at ${stage}`);
      assert.equal(result.reason, OPTIONAL_REASON, 'optional-KO-reward gate reason matches the locked value');
    }
  });

  test('canPassPriority blocked at EVERY stage when hasPendingOptionalKoReward is true (board frozen)', () => {
    for (const stage of ['start', 'main', 'cleanup'] as const) {
      const result = useTurnActions(stage, true, false, false, true).canPassPriority();
      assert.equal(result.allowed, false, `passPriority blocked at ${stage}`);
      assert.equal(result.reason, OPTIONAL_REASON);
    }
  });

  test('defaults false — both allowed at cleanup when no optional-KO-reward choice pending', () => {
    const actions = useTurnActions('cleanup', true, false, false, false);
    assert.equal(actions.canEndTurn().allowed, true);
    assert.equal(actions.canPassPriority().allowed, true);
  });
});
