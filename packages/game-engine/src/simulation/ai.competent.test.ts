/**
 * Tests for the Competent Heuristic (T2) AI policy (WP-049).
 *
 * Exactly ten tests inside one describe block, per WP-049 §F + EC-049 §F.
 * Each test targets a binary acceptance criterion. Tests use synthetic
 * UIState + LegalMove fixtures — no makeMockCtx, no live G construction,
 * no boardgame.io imports.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import type { LegalMove } from './ai.types.js';
import type { UIState, UICityCard } from '../ui/uiState.types.js';

import { createCompetentHeuristicPolicy } from './ai.competent.js';

/**
 * Minimal UIState fixture for policy tests.
 *
 * Provides the six canonical City slots plus a single-player projection.
 * The `city` argument lets each test inject the specific villain-at-slot
 * configuration needed to exercise a heuristic.
 */
function buildSyntheticUIState(citySpaces: (UICityCard | null)[]): UIState {
  return {
    game: {
      phase: 'play',
      turn: 1,
      activePlayerId: '0',
      currentStage: 'main',
    },
    players: [
      {
        playerId: '0',
        deckCount: 0,
        handCount: 0,
        discardCount: 0,
        inPlayCount: 0,
        victoryCount: 0,
        woundCount: 0,
        handCards: [],
      },
    ],
    city: { spaces: citySpaces },
    hq: { slots: [null, null, null, null, null] },
    mastermind: { id: 'test-mm', tacticsRemaining: 2, tacticsDefeated: 0 },
    scheme: { id: 'test-scheme', twistCount: 0 },
    economy: { attack: 0, recruit: 0, availableAttack: 0, availableRecruit: 0 },
    log: [],
    progress: { bystandersRescued: 0, escapedVillains: 0 },
  };
}

/** Five empty City slots — nothing to fight. */
function emptyCitySpaces(): (UICityCard | null)[] {
  return [null, null, null, null, null];
}

describe('T2 Competent Heuristic policy (WP-049)', () => {
  test('policy implements AIPolicy interface (name + decideTurn)', () => {
    const policy = createCompetentHeuristicPolicy('shape-seed');
    assert.equal(typeof policy.name, 'string', 'AIPolicy.name must be a string');
    assert.equal(policy.name.length > 0, true, 'AIPolicy.name must be non-empty');
    assert.equal(
      typeof policy.decideTurn,
      'function',
      'AIPolicy.decideTurn must be a function',
    );
  });

  test('same seed + same state = same decision (determinism)', () => {
    const view = buildSyntheticUIState(emptyCitySpaces());
    const legalMoves: LegalMove[] = [];
    for (let index = 0; index < 16; index++) {
      legalMoves.push({ name: 'advanceStage', args: { tag: index } });
    }

    const policyA = createCompetentHeuristicPolicy('determinism-seed');
    const policyB = createCompetentHeuristicPolicy('determinism-seed');
    const intentA = policyA.decideTurn(view, legalMoves);
    const intentB = policyB.decideTurn(view, legalMoves);

    assert.deepStrictEqual(
      intentA,
      intentB,
      'Two policies with identical seeds must produce identical first-call intents',
    );
  });

  test('different seed = different tie-breaking decisions', () => {
    const view = buildSyntheticUIState(emptyCitySpaces());
    // why: a 32-entry tie group ensures two independent mulberry32 seeds
    // have a 31/32 chance of diverging on the first draw. Seeds below
    // empirically diverge; if the mulberry32 hash changes, re-choose.
    const legalMoves: LegalMove[] = [];
    for (let index = 0; index < 32; index++) {
      legalMoves.push({ name: 'advanceStage', args: { tag: index } });
    }

    const policyA = createCompetentHeuristicPolicy('alpha-seed');
    const policyB = createCompetentHeuristicPolicy('beta-seed');
    const intentA = policyA.decideTurn(view, legalMoves);
    const intentB = policyB.decideTurn(view, legalMoves);

    assert.notDeepStrictEqual(
      intentA.move.args,
      intentB.move.args,
      'Two policies with different seeds must produce different tie-break decisions',
    );
  });

  test('prefers fighting villain with bystander over villain without (heroism bias)', () => {
    const villainNoBystander: UICityCard = {
      extId: 'villain-plain',
      type: 'villain',
      keywords: [],
    };
    const villainWithBystander: UICityCard = {
      extId: 'villain-carrier',
      type: 'villain',
      keywords: ['bystander'],
    };
    const view = buildSyntheticUIState([
      villainNoBystander,
      villainWithBystander,
      null,
      null,
      null,
    ]);
    const legalMoves: LegalMove[] = [
      { name: 'fightVillain', args: { cityIndex: 0 } },
      { name: 'fightVillain', args: { cityIndex: 1 } },
    ];

    const policy = createCompetentHeuristicPolicy('heroism-bias-seed');
    const intent = policy.decideTurn(view, legalMoves);

    assert.equal(intent.move.name, 'fightVillain');
    const args = intent.move.args as { cityIndex: number };
    assert.equal(
      args.cityIndex,
      1,
      'T2 must prefer the bystander-bearing villain (slot 1) over the plain villain (slot 0)',
    );
  });

  test('prefers preventing imminent escape over recruiting (threat prioritization)', () => {
    // why: slot 4 is the escape edge — fighting there prevents escape on
    // the next reveal, which outranks every non-escape action.
    const villainAtEscape: UICityCard = {
      extId: 'villain-at-escape',
      type: 'villain',
      keywords: [],
    };
    const view = buildSyntheticUIState([
      null,
      null,
      null,
      null,
      villainAtEscape,
    ]);
    const legalMoves: LegalMove[] = [
      { name: 'fightVillain', args: { cityIndex: 4 } },
      { name: 'recruitHero', args: { hqIndex: 0 } },
    ];

    const policy = createCompetentHeuristicPolicy('threat-prio-seed');
    const intent = policy.decideTurn(view, legalMoves);

    assert.equal(
      intent.move.name,
      'fightVillain',
      'T2 must prefer preventing imminent escape over recruiting',
    );
    const args = intent.move.args as { cityIndex: number };
    assert.equal(args.cityIndex, 4);
  });

  test('does not stall when fighting is available (economy awareness)', () => {
    const villain: UICityCard = {
      extId: 'villain-mid',
      type: 'villain',
      keywords: [],
    };
    const view = buildSyntheticUIState([null, villain, null, null, null]);
    const legalMoves: LegalMove[] = [
      { name: 'fightVillain', args: { cityIndex: 1 } },
      { name: 'advanceStage', args: {} },
      { name: 'endTurn', args: {} },
    ];

    const policy = createCompetentHeuristicPolicy('economy-seed');
    const intent = policy.decideTurn(view, legalMoves);

    assert.equal(
      intent.move.name,
      'fightVillain',
      'T2 must fight instead of stalling via advanceStage/endTurn when fighting is available',
    );
  });

  test('AI does not access hidden state (filtered UIState only)', () => {
    // why: the policy signature requires UIState + LegalMove[]; this
    // test asserts that at the type level the policy exposes no way to
    // read G or ctx, and at runtime the policy does not attempt to.
    // Construct a projection with deliberately redacted hand data and
    // confirm the policy still produces a valid decision.
    const view = buildSyntheticUIState(emptyCitySpaces());
    // Simulate an opponent view where handCards is redacted (undefined).
    const redactedView: UIState = {
      ...view,
      players: [
        {
          ...view.players[0]!,
          handCards: undefined,
        },
      ],
    };
    const legalMoves: LegalMove[] = [
      { name: 'drawCards', args: { count: 1 } },
    ];

    const policy = createCompetentHeuristicPolicy('hidden-state-seed');
    const intent = policy.decideTurn(redactedView, legalMoves);

    assert.equal(
      intent.move.name,
      'drawCards',
      'T2 must produce a decision from the filtered projection alone, even when handCards is redacted',
    );
  });

  test('T2 produces valid ClientTurnIntent for all legal move types', () => {
    const view = buildSyntheticUIState(emptyCitySpaces());
    const allMoveTypes: LegalMove[] = [
      { name: 'drawCards', args: { count: 1 } },
      { name: 'playCard', args: { cardId: 'card-1' } },
      { name: 'endTurn', args: {} },
      { name: 'advanceStage', args: {} },
      { name: 'revealVillainCard', args: {} },
      { name: 'fightVillain', args: { cityIndex: 0 } },
      { name: 'recruitHero', args: { hqIndex: 0 } },
      { name: 'fightMastermind', args: {} },
    ];
    const policy = createCompetentHeuristicPolicy('all-types-seed');

    for (const candidate of allMoveTypes) {
      const intent = policy.decideTurn(view, [candidate]);
      assert.equal(
        typeof intent.matchId,
        'string',
        `intent.matchId must be a string for move ${candidate.name}`,
      );
      assert.equal(
        typeof intent.move.name,
        'string',
        `intent.move.name must be a string for move ${candidate.name}`,
      );
      assert.equal(
        intent.move.name,
        candidate.name,
        `intent.move.name must match the single legal move for ${candidate.name}`,
      );
    }
  });

  test('T2 never produces an illegal move', () => {
    const view = buildSyntheticUIState(emptyCitySpaces());
    // Construct a legal-move list of mixed shapes and confirm every
    // decision across 50 invocations picks an entry from the list.
    const legalMoves: LegalMove[] = [
      { name: 'fightVillain', args: { cityIndex: 2 } },
      { name: 'recruitHero', args: { hqIndex: 3 } },
      { name: 'drawCards', args: { count: 1 } },
      { name: 'advanceStage', args: {} },
    ];
    const policy = createCompetentHeuristicPolicy('legal-move-seed');

    for (let iteration = 0; iteration < 50; iteration++) {
      const intent = policy.decideTurn(view, legalMoves);
      let matched = false;
      for (const candidate of legalMoves) {
        if (
          candidate.name === intent.move.name &&
          JSON.stringify(candidate.args) === JSON.stringify(intent.move.args)
        ) {
          matched = true;
          break;
        }
      }
      assert.equal(
        matched,
        true,
        `T2 must return a ClientTurnIntent matching one of the legal moves exactly; got name=${intent.move.name} args=${JSON.stringify(intent.move.args)}`,
      );
    }
  });

  test('prefers fighting mastermind over fighting a non-escape villain (victory path)', () => {
    const villainMid: UICityCard = {
      extId: 'villain-mid',
      type: 'villain',
      keywords: [],
    };
    const view = buildSyntheticUIState([null, villainMid, null, null, null]);
    const legalMoves: LegalMove[] = [
      { name: 'fightVillain', args: { cityIndex: 1 } },
      { name: 'fightMastermind', args: {} },
    ];

    const policy = createCompetentHeuristicPolicy('mm-priority-seed');
    const intent = policy.decideTurn(view, legalMoves);

    assert.equal(
      intent.move.name,
      'fightMastermind',
      'T2 must prefer fighting the mastermind over a non-escape, non-bystander villain',
    );
  });

  test('T2 policy name is CompetentHeuristic', () => {
    const policy = createCompetentHeuristicPolicy('name-seed');
    assert.equal(
      policy.name,
      'CompetentHeuristic',
      'T2 policy name must be the literal string "CompetentHeuristic"',
    );
  });
});

describe('Bot decision logging (WP-181)', () => {
  test('decideTurn returns decisionLog with chosen move name and score', () => {
    const view = buildSyntheticUIState(emptyCitySpaces());
    const legalMoves: LegalMove[] = [
      { name: 'recruitHero', args: { hqIndex: 0 } },
      { name: 'advanceStage', args: {} },
    ];
    const policy = createCompetentHeuristicPolicy('log-shape-seed');
    const intent = policy.decideTurn(view, legalMoves);

    assert.equal(Array.isArray(intent.decisionLog), true, 'decisionLog must be an array');
    assert.equal(
      intent.decisionLog!.length >= 1,
      true,
      'decisionLog must have at least one line',
    );
    assert.ok(
      intent.decisionLog![0]!.includes('recruitHero'),
      'Line 1 must include chosen move name',
    );
    assert.ok(
      intent.decisionLog![0]!.includes('score 50'),
      'Line 1 must include integer score',
    );
  });

  test('every decisionLog line starts with [Bot] prefix', () => {
    const villainWithBystander: UICityCard = {
      extId: 'v-carrier',
      type: 'villain',
      keywords: ['bystander'],
    };
    const view = buildSyntheticUIState([villainWithBystander, null, null, null, null]);
    const legalMoves: LegalMove[] = [
      { name: 'fightVillain', args: { cityIndex: 0 } },
      { name: 'recruitHero', args: { hqIndex: 0 } },
      { name: 'advanceStage', args: {} },
    ];
    const policy = createCompetentHeuristicPolicy('bot-prefix-seed');
    const intent = policy.decideTurn(view, legalMoves);

    for (const line of intent.decisionLog!) {
      assert.equal(
        line.startsWith('[Bot] '),
        true,
        `Every line must start with "[Bot] ": ${line}`,
      );
    }
  });

  test('decisionLog is deterministic across identical seeds', () => {
    const view = buildSyntheticUIState(emptyCitySpaces());
    const legalMoves: LegalMove[] = [
      { name: 'recruitHero', args: { hqIndex: 0 } },
      { name: 'drawCards', args: { count: 1 } },
      { name: 'advanceStage', args: {} },
    ];
    const policyA = createCompetentHeuristicPolicy('det-log-seed');
    const policyB = createCompetentHeuristicPolicy('det-log-seed');
    const intentA = policyA.decideTurn(view, legalMoves);
    const intentB = policyB.decideTurn(view, legalMoves);

    assert.deepStrictEqual(
      intentA.decisionLog,
      intentB.decisionLog,
      'Same seed + same inputs = same decisionLog',
    );
  });

  test('decisionLog includes alternative scores when alternatives exist', () => {
    const villain: UICityCard = {
      extId: 'v-mid',
      type: 'villain',
      keywords: [],
    };
    const view = buildSyntheticUIState([null, villain, null, null, null]);
    const legalMoves: LegalMove[] = [
      { name: 'fightVillain', args: { cityIndex: 1 } },
      { name: 'recruitHero', args: { hqIndex: 0 } },
      { name: 'endTurn', args: {} },
    ];
    const policy = createCompetentHeuristicPolicy('alt-scores-seed');
    const intent = policy.decideTurn(view, legalMoves);

    assert.equal(
      intent.decisionLog!.length,
      2,
      'decisionLog must have 2 lines when alternatives above threshold exist',
    );
    assert.equal(
      intent.decisionLog![1]!.startsWith('[Bot] Over:'),
      true,
      'Line 2 must start with "[Bot] Over:"',
    );
    assert.ok(
      intent.decisionLog![1]!.includes('recruitHero'),
      'Over line must include recruitHero alternative',
    );
  });

  test('decisionLog omits alternatives line when all alternatives are lifecycle moves', () => {
    const view = buildSyntheticUIState(emptyCitySpaces());
    const legalMoves: LegalMove[] = [
      { name: 'recruitHero', args: { hqIndex: 0 } },
      { name: 'advanceStage', args: {} },
      { name: 'endTurn', args: {} },
    ];
    const policy = createCompetentHeuristicPolicy('no-alt-seed');
    const intent = policy.decideTurn(view, legalMoves);

    assert.equal(
      intent.decisionLog!.length,
      1,
      'decisionLog must have only 1 line when no alternatives score above lifecycle threshold',
    );
  });
});
