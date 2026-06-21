/**
 * Fight mastermind move tests for WP-019.
 *
 * Verifies fightMastermind follows the three-step validation contract,
 * gates to main stage, defeats tactics, spends attack, and triggers
 * victory when all tactics are defeated.
 *
 * Uses node:test and node:assert only. Uses makeMockCtx. No boardgame.io
 * imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fightMastermind } from './fightMastermind.js';
import { mastermindStrikeHandler } from '../rules/mastermindHandlers.js';
import type { LegendaryGameState } from '../types.js';
import type { CardExtId } from '../state/zones.types.js';
import { makeMockCtx } from '../test/mockCtx.js';
import { buildDefaultHookDefinitions } from '../rules/ruleRuntime.impl.js';
import { initializeCity, initializeHq } from '../board/city.logic.js';
import { ENDGAME_CONDITIONS } from '../endgame/endgame.types.js';

// ---------------------------------------------------------------------------
// Mock G factory
// ---------------------------------------------------------------------------

/**
 * Creates a minimal LegendaryGameState for fightMastermind tests.
 */
function createMockGameState(options?: {
  currentStage?: LegendaryGameState['currentStage'];
  turnEconomy?: LegendaryGameState['turnEconomy'];
  cardStats?: LegendaryGameState['cardStats'];
  mastermind?: LegendaryGameState['mastermind'];
}): LegendaryGameState {
  const config = {
    schemeId: 'test-scheme',
    mastermindId: 'test-mastermind',
    villainGroupIds: ['test-villain-group'],
    henchmanGroupIds: ['test-henchman-group'],
    heroDeckIds: ['test-hero-deck'],
    bystandersCount: 1,
    woundsCount: 1,
    officersCount: 1,
    sidekicksCount: 1,
  };

  return {
    matchConfiguration: config,
    selection: {
      schemeId: config.schemeId,
      mastermindId: config.mastermindId,
      villainGroupIds: [...config.villainGroupIds],
      henchmanGroupIds: [...config.henchmanGroupIds],
      heroDeckIds: [...config.heroDeckIds],
    },
    currentStage: options?.currentStage ?? 'main',
    playerZones: {
      '0': {
        deck: [],
        hand: [],
        discard: [],
        inPlay: [],
        victory: [],
      },
    },
    piles: {
      bystanders: [],
      wounds: [],
      officers: [],
      sidekicks: [],
    },
    messages: [],
    counters: {},
    hookRegistry: buildDefaultHookDefinitions(config),
    villainDeck: { deck: [], discard: [] },
    villainDeckCardTypes: {},
    ko: [],
    attachedBystanders: {},
    mastermind: options?.mastermind ?? {
      id: 'test-mastermind' as CardExtId,
      baseCardId: 'test-mastermind-base' as CardExtId,
      tacticsDeck: ['tactic-1', 'tactic-2', 'tactic-3'] as CardExtId[],
      tacticsDefeated: [] as CardExtId[],
    },
    turnEconomy: options?.turnEconomy ?? { attack: 0, recruit: 0, spentAttack: 0, spentRecruit: 0 },
    cardStats: options?.cardStats ?? {
      'test-mastermind-base': { attack: 0, recruit: 0, cost: 0, fightCost: 8 },
    },
    city: initializeCity(),
    hq: initializeHq(),
    lobby: {
      requiredPlayers: 1,
      ready: {},
      started: false,
    },
    notableEvents: [],
  };
}

/**
 * Creates a mock MoveContext for fightMastermind.
 */
function createMockMoveContext(gameState: LegendaryGameState) {
  const mockCtx = makeMockCtx({ numPlayers: 1 });
  return {
    G: gameState,
    ctx: {
      ...mockCtx.ctx,
      currentPlayer: '0',
      phase: 'play',
      turn: 1,
      numMoves: 0,
      playOrder: ['0'],
      playOrderPos: 0,
      activePlayers: null,
    },
    random: mockCtx.random,
    events: { endTurn: () => {}, setPhase: () => {}, endGame: () => {} },
    playerID: '0' as string,
    log: { setMetadata: () => {} },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fightMastermind', () => {
  it('successful fight defeats top tactic and spends attack', () => {
    const gameState = createMockGameState({
      turnEconomy: { attack: 10, recruit: 0, spentAttack: 0, spentRecruit: 0 },
    });

    const moveContext = createMockMoveContext(gameState);
    fightMastermind(moveContext);

    assert.deepStrictEqual(
      moveContext.G.mastermind.tacticsDeck,
      ['tactic-2', 'tactic-3'],
      'Top tactic must be removed from deck',
    );
    assert.deepStrictEqual(
      moveContext.G.mastermind.tacticsDefeated,
      ['tactic-1'],
      'Defeated tactic must be in tacticsDefeated',
    );
    assert.strictEqual(
      moveContext.G.turnEconomy.spentAttack,
      8,
      'spentAttack must be incremented by fightCost',
    );
  });

  it('insufficient attack: no G mutation', () => {
    const gameState = createMockGameState({
      turnEconomy: { attack: 5, recruit: 0, spentAttack: 0, spentRecruit: 0 },
    });

    const mastermindBefore = { ...gameState.mastermind };
    const economyBefore = { ...gameState.turnEconomy };

    const moveContext = createMockMoveContext(gameState);
    fightMastermind(moveContext);

    assert.deepStrictEqual(
      moveContext.G.mastermind.tacticsDeck,
      mastermindBefore.tacticsDeck,
      'Mastermind state must be unchanged when attack is insufficient',
    );
    assert.deepStrictEqual(
      moveContext.G.turnEconomy,
      economyBefore,
      'Economy must be unchanged when attack is insufficient',
    );
  });

  it('no tactics remaining: no G mutation', () => {
    const gameState = createMockGameState({
      turnEconomy: { attack: 10, recruit: 0, spentAttack: 0, spentRecruit: 0 },
      mastermind: {
        id: 'test-mastermind' as CardExtId,
        baseCardId: 'test-mastermind-base' as CardExtId,
        tacticsDeck: [],
        tacticsDefeated: ['t1', 't2', 't3'],
      },
    });

    const economyBefore = { ...gameState.turnEconomy };

    const moveContext = createMockMoveContext(gameState);
    fightMastermind(moveContext);

    assert.strictEqual(
      moveContext.G.mastermind.tacticsDeck.length,
      0,
      'Tactics deck must remain empty',
    );
    assert.deepStrictEqual(
      moveContext.G.turnEconomy,
      economyBefore,
      'Economy must be unchanged when no tactics remain',
    );
  });

  it('wrong stage (cleanup): no G mutation', () => {
    const gameState = createMockGameState({
      currentStage: 'cleanup',
      turnEconomy: { attack: 10, recruit: 0, spentAttack: 0, spentRecruit: 0 },
    });

    const tacticsDeckBefore = [...gameState.mastermind.tacticsDeck];
    const economyBefore = { ...gameState.turnEconomy };

    const moveContext = createMockMoveContext(gameState);
    fightMastermind(moveContext);

    assert.deepStrictEqual(
      moveContext.G.mastermind.tacticsDeck,
      tacticsDeckBefore,
      'Mastermind state must be unchanged in wrong stage',
    );
    assert.deepStrictEqual(
      moveContext.G.turnEconomy,
      economyBefore,
      'Economy must be unchanged in wrong stage',
    );
  });

  it('all tactics defeated: MASTERMIND_DEFEATED counter set to 1', () => {
    const gameState = createMockGameState({
      turnEconomy: { attack: 10, recruit: 0, spentAttack: 0, spentRecruit: 0 },
      mastermind: {
        id: 'test-mastermind' as CardExtId,
        baseCardId: 'test-mastermind-base' as CardExtId,
        tacticsDeck: ['last-tactic'] as CardExtId[],
        tacticsDefeated: ['t1', 't2'] as CardExtId[],
      },
    });

    const moveContext = createMockMoveContext(gameState);
    fightMastermind(moveContext);

    assert.strictEqual(
      moveContext.G.counters[ENDGAME_CONDITIONS.MASTERMIND_DEFEATED],
      1,
      'MASTERMIND_DEFEATED counter must be set to 1',
    );
    assert.strictEqual(
      moveContext.G.mastermind.tacticsDeck.length,
      0,
      'Tactics deck must be empty after defeating last tactic',
    );
    assert.deepStrictEqual(
      moveContext.G.mastermind.tacticsDefeated,
      ['t1', 't2', 'last-tactic'],
      'All defeated tactics must be in tacticsDefeated',
    );
  });

  it('all tactics defeated: captured bystanders awarded to victory and store cleared', () => {
    const gameState = createMockGameState({
      turnEconomy: { attack: 10, recruit: 0, spentAttack: 0, spentRecruit: 0 },
      mastermind: {
        id: 'test-mastermind' as CardExtId,
        baseCardId: 'test-mastermind-base' as CardExtId,
        tacticsDeck: ['last-tactic'] as CardExtId[],
        tacticsDefeated: ['t1', 't2'] as CardExtId[],
        strikePile: [] as CardExtId[],
        attachedBystanders: ['pile-bystander', 'pile-bystander'] as CardExtId[],
      },
    });

    const moveContext = createMockMoveContext(gameState);
    fightMastermind(moveContext);

    assert.deepStrictEqual(
      moveContext.G.playerZones['0']!.victory,
      ['last-tactic', 'pile-bystander', 'pile-bystander'],
      'Victory pile must hold the defeated tactic followed by both rescued bystanders',
    );
    assert.deepStrictEqual(
      moveContext.G.mastermind.attachedBystanders,
      [],
      'Mastermind attachedBystanders must be cleared after the award',
    );
    // why: D-20008 — defeating the mastermind emits exactly one
    // mastermindDefeated notable event carrying the rescued-bystander count
    // so the arena-client overlay can report the win + rescue.
    assert.equal(
      moveContext.G.notableEvents.length,
      1,
      'Exactly one notable event must be emitted on mastermind defeat',
    );
    const defeatEvent = moveContext.G.notableEvents[0]!;
    assert.equal(defeatEvent.type, 'mastermindDefeated', 'event type must be mastermindDefeated');
    assert.equal(
      defeatEvent.type === 'mastermindDefeated' && defeatEvent.bystandersRescued,
      2,
      'event must report 2 bystanders rescued',
    );
  });

  it('all tactics defeated: city-empty bystander mirror is awarded once and cleared', () => {
    const gameState = createMockGameState({
      turnEconomy: { attack: 10, recruit: 0, spentAttack: 0, spentRecruit: 0 },
      mastermind: {
        id: 'test-mastermind' as CardExtId,
        baseCardId: 'test-mastermind-base' as CardExtId,
        tacticsDeck: ['last-tactic'] as CardExtId[],
        tacticsDefeated: ['t1', 't2'] as CardExtId[],
        strikePile: [] as CardExtId[],
        attachedBystanders: ['pile-bystander'] as CardExtId[],
      },
    });
    // why: a bystander revealed while the City was empty lives in BOTH
    // G.mastermind.attachedBystanders and the city-villain map keyed by the
    // mastermind base card — verify the award counts it exactly once.
    gameState.attachedBystanders = {
      'test-mastermind-base': ['pile-bystander'],
    } as LegendaryGameState['attachedBystanders'];

    const moveContext = createMockMoveContext(gameState);
    fightMastermind(moveContext);

    assert.ok(
      !('test-mastermind-base' in moveContext.G.attachedBystanders),
      'Mastermind mirror entry must be removed from G.attachedBystanders',
    );
    assert.deepStrictEqual(
      moveContext.G.playerZones['0']!.victory,
      ['last-tactic', 'pile-bystander'],
      'Bystander must be awarded exactly once despite living in two stores',
    );
  });

  it('non-final fight: captured bystanders are rescued immediately, not held for the vanquish', () => {
    // why: regression test for the play.legendary-arena.com report — a
    // Mastermind holding bystanders must release them on EVERY tactic
    // defeat, not only the final blow (Universal Rules v23 §"When you fight
    // a Mastermind/Commander"). Three tactics remain after this fight, so
    // the mastermind is NOT vanquished, yet both held bystanders must move
    // to the victory pile.
    const gameState = createMockGameState({
      turnEconomy: { attack: 10, recruit: 0, spentAttack: 0, spentRecruit: 0 },
      mastermind: {
        id: 'test-mastermind' as CardExtId,
        baseCardId: 'test-mastermind-base' as CardExtId,
        tacticsDeck: ['tactic-1', 'tactic-2', 'tactic-3'] as CardExtId[],
        tacticsDefeated: [] as CardExtId[],
        strikePile: [] as CardExtId[],
        attachedBystanders: ['pile-bystander-a', 'pile-bystander-b'] as CardExtId[],
      },
    });

    const moveContext = createMockMoveContext(gameState);
    fightMastermind(moveContext);

    assert.equal(
      moveContext.G.counters[ENDGAME_CONDITIONS.MASTERMIND_DEFEATED],
      undefined,
      'MASTERMIND_DEFEATED must NOT be set while tactics remain',
    );
    assert.deepStrictEqual(
      moveContext.G.playerZones['0']!.victory,
      ['tactic-1', 'pile-bystander-a', 'pile-bystander-b'],
      'the defeated tactic and both held bystanders are awarded on this non-final fight',
    );
    assert.deepStrictEqual(
      moveContext.G.mastermind.attachedBystanders,
      [],
      'mastermind bystander store must be cleared after the non-final rescue',
    );
    assert.equal(
      moveContext.G.notableEvents.length,
      0,
      'the vanquish-only mastermindDefeated event must NOT fire while tactics remain',
    );
  });

  it('JSON.stringify(G) succeeds after fight', () => {
    const gameState = createMockGameState({
      turnEconomy: { attack: 10, recruit: 0, spentAttack: 0, spentRecruit: 0 },
    });

    const moveContext = createMockMoveContext(gameState);
    fightMastermind(moveContext);

    const serialized = JSON.stringify(moveContext.G);
    assert.ok(serialized.length > 0, 'G must be JSON-serializable after fight');
  });
});

// ---------------------------------------------------------------------------
// Integration: Master Strike capture (real handler) then per-fight rescue
// across two fights. Reproduces the play.legendary-arena.com report where a
// mastermind that captured bystanders was only releasing them on the final
// blow — proves the captured bystanders are awarded to victory on EACH tactic
// defeat, end-to-end through the real capture + fight code paths, with a
// fresh capture between fights to show the per-fight semantics.
// ---------------------------------------------------------------------------

/**
 * Builds a self-contained state for the strike-capture-then-fight integration
 * test. Includes notableEvents (the strike handler emits one) and a 2-tactic
 * mastermind with a non-Magneto id so only the generic capture runs.
 */
function makeIntegrationState(): LegendaryGameState {
  return {
    matchConfiguration: {
      schemeId: 'test-scheme',
      mastermindId: 'test-mastermind',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: 0,
      woundsCount: 0,
      officersCount: 0,
      sidekicksCount: 0,
    },
    selection: {
      schemeId: 'test-scheme',
      mastermindId: 'test-mastermind',
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
    },
    currentStage: 'main',
    playerZones: {
      '0': { deck: [], hand: [], discard: [], inPlay: [], victory: [] },
    },
    piles: {
      bystanders: ['bystander-001', 'bystander-002'] as CardExtId[],
      wounds: [],
      officers: [],
      sidekicks: [],
    },
    messages: [],
    counters: {},
    hookRegistry: [],
    villainDeck: { deck: [], discard: [] },
    villainDeckCardTypes: {},
    ko: [],
    attachedBystanders: {},
    turnEconomy: { attack: 100, recruit: 0, spentAttack: 0, spentRecruit: 0 },
    cardStats: {
      'test-mastermind-base': { attack: 0, recruit: 0, cost: 0, fightCost: 8 },
    },
    mastermind: {
      id: 'test-mastermind' as CardExtId,
      baseCardId: 'test-mastermind-base' as CardExtId,
      tacticsDeck: ['tactic-1', 'tactic-2'] as CardExtId[],
      tacticsDefeated: [] as CardExtId[],
      strikePile: [] as CardExtId[],
      attachedBystanders: [] as CardExtId[],
    },
    city: [null, null, null, null, null],
    hq: [null, null, null, null, null],
    lobby: { requiredPlayers: 1, ready: {}, started: false },
    notableEvents: [],
  } as unknown as LegendaryGameState;
}

describe('fightMastermind — integration: Master Strike capture then per-fight rescue', () => {
  it('rescues the held bystander on EACH tactic defeat, including a fresh capture between fights', () => {
    const gameState = makeIntegrationState();

    // A real Master Strike captures the first bystander onto the mastermind.
    mastermindStrikeHandler(gameState, {}, { cardId: 'strike-1' });
    assert.equal(
      gameState.mastermind.attachedBystanders.length,
      1,
      'one bystander must be captured onto the mastermind by the first strike',
    );

    const moveContext = createMockMoveContext(gameState);

    // First attack: defeats tactic-1 (NON-final) — must rescue the held
    // bystander immediately, not wait for the vanquish.
    fightMastermind(moveContext);
    assert.equal(
      moveContext.G.counters[ENDGAME_CONDITIONS.MASTERMIND_DEFEATED],
      undefined,
      'mastermind is NOT yet vanquished after only the first tactic falls',
    );
    assert.deepStrictEqual(
      moveContext.G.playerZones['0']!.victory,
      ['tactic-1', 'bystander-001'],
      'the first defeated tactic and the held bystander are both rescued on the non-final fight',
    );
    assert.equal(
      moveContext.G.mastermind.attachedBystanders.length,
      0,
      'mastermind bystander store is cleared after the non-final rescue',
    );

    // A second Master Strike captures another bystander BETWEEN fights.
    mastermindStrikeHandler(moveContext.G, {}, { cardId: 'strike-2' });
    assert.equal(
      moveContext.G.mastermind.attachedBystanders.length,
      1,
      'the second strike captures a fresh bystander before the final fight',
    );

    // Second attack: defeats tactic-2 (last) — vanquish — rescues the freshly
    // captured bystander (not the one already rescued on the first fight).
    fightMastermind(moveContext);
    assert.equal(
      moveContext.G.counters[ENDGAME_CONDITIONS.MASTERMIND_DEFEATED],
      1,
      'mastermind must be vanquished after the second attack',
    );
    assert.deepStrictEqual(
      moveContext.G.playerZones['0']!.victory,
      ['tactic-1', 'bystander-001', 'tactic-2', 'bystander-002'],
      'each tactic rescued the bystander the mastermind held at the moment of its defeat',
    );
    assert.equal(
      moveContext.G.mastermind.attachedBystanders.length,
      0,
      'mastermind bystander store must be cleared after the final rescue',
    );

    // The vanquish event reports only the bystander rescued on the FINAL fight.
    const defeatEvent = moveContext.G.notableEvents.find(
      (event) => event.type === 'mastermindDefeated',
    );
    assert.ok(defeatEvent, 'a mastermindDefeated event must be emitted on vanquish');
    assert.equal(
      defeatEvent.type === 'mastermindDefeated' && defeatEvent.bystandersRescued,
      1,
      'the vanquish event reports the single bystander rescued on the final fight',
    );
  });
});
