/**
 * Tests for the replay harness step-level API (WP-080 / EC-072).
 *
 * Covers applyReplayStep's determinism + same-reference contract (Case 1),
 * replayGame's byte-identical hash through the loop-delegation refactor
 * (Case 2 — regression guard via PRE_WP080_HASH), and the unknown-move
 * warning-and-skip path routed through applyReplayStep (Case 3).
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ReplayInput, ReplayMove } from './replay.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';
import { applyReplayStep, replayGame } from './replay.execute.js';
import { computeStateHash } from './replay.hash.js';
import { buildInitialGameState } from '../setup/buildInitialGameState.js';
import { makeMockCtx } from '../test/mockCtx.js';

// why: one-shot capture helper. Filled in by running the regression test
// ONCE against pre-refactor replayGame, then replaced with the literal
// hash. Not a permanent pattern — future WPs should not propagate it.
// This constant is WP-080's byte-identity anchor through the loop-delegation
// refactor; updating it casually would silently defeat the regression guard.
//
// @amended WP-113 PS-7: hash updated from 'a56f949e' → 'ba921e90' because
//   the standardInput fixture's bare-slug entity IDs were migrated to
//   set-qualified form per the qualified-ID contract. The hashed state
//   includes `matchConfiguration` which now contains the qualified
//   strings; the WP-080 byte-identity property still holds against the
//   migrated fixture (per D-10014).
// why: WP-111 / EC-118 — value-only update under
// docs/ai/REFERENCE/01.5-runtime-wiring-allowance.md. Adding
// cardDisplayData to LegendaryGameState legitimately changes the
// JSON-encoded structure hash. The change is dependency-driven (revert
// it by removing the new G field with no remaining diff) and limited
// to updating an existing literal — no behavioral or logic change to
// this test. Pre-flight 2026-04-29 §Runtime Readiness Check + session
// prompt §5 explicitly authorize this cascade.
// why: WP-135 / EC-138 — value-only update under
// docs/ai/REFERENCE/01.5-runtime-wiring-allowance.md, per WP-128 D-12807
// conditional-cascade procedure. Two simultaneous inputs to
// computeStateHash changed: (1) G.heroDeck: CardExtId[] field added to
// LegendaryGameState (the new hero deck reservoir built at Game.setup()
// from MatchSetupConfig.heroDeckIds via buildHeroDeck); (2) recruitHero
// G.messages line reshaped from the pre-WP-135 WP-016 format
// (`Player {playerId} recruited "{cardId}" from HQ slot {hqIndex}.`)
// to the WP-135 byte-locked format (`Player {playerId} recruited
// {heroExtId}; HQ slot {hqIndex} refilled from heroDeck (heroDeck.length:
// {N})`). Pre-edit hash: '46f7863c'. Post-edit hash: '2baeecc3'.
// why: WP-153 / EC-165 — three new G fields added to LegendaryGameState:
// G.mastermind.strikePile (CardExtId[]), G.scheme.twistPile (CardExtId[]),
// G.escapedPile (CardExtId[]). All initialize as [] at setup so JSON
// serialization includes them in computeStateHash input. Pre-edit hash:
// '2baeecc3'. Post-edit hash: '52c42094'. Literal-only update per 01.5.
// why: WP-154 adds G.mastermind.attachedBystanders (01.5 cascade)
// why: WP-155 adds TurnEconomy.piercing and .woundsDrawn (01.5 cascade)
// why: WP-156 adds G.piles.horrors (01.5 cascade) — new GlobalPiles field
// initialized as [] changes the JSON-encoded structure hash.
// why: adding cardStats entries for starting-shield-agent and
// starting-shield-trooper changed the initial state hash (01.5 cascade).
// why: WP-168 / EC-186 — value-only update. buildVillainDeck now always adds
// MASTER_STRIKE_COUNT (5) generic master-strike-{NN} cards (D-16801), which
// are data-independent and therefore present even for this empty mock
// registry, changing G.villainDeck.deck contents and the JSON-encoded state
// hash. Dependency-driven cascade (revert by undoing the WP-168 composition
// change with no remaining diff); no logic change to this test. Pre-edit
// hash: '6228d103'. Post-edit hash: '35fbe2fc'.
// why: WP-172 cascade re-baseline (2026-05-23) — `G.cardDisplayData`
// now carries per-copy villains + master strikes + scheme twists +
// villain-deck bystanders (was previously empty for those grammars), so
// the WP-080 regression-guard hash shifts. Same cascade pattern as
// WP-168 (`6228d103` → `35fbe2fc`). Operator-approved allowlist
// amendment recorded in WP-172 §Amendments / EC-190 §Notes.
// why: WP-179 cascade re-baseline — `G.cardTraits` added as a new
// sibling snapshot (Record<CardExtId, CardTraitEntry>), changing the
// JSON-encoded state hash. Same cascade pattern as WP-168/WP-172.
// why: hash updated after adding gameText to MastermindState + SchemeState
// why: WP-185 cascade re-baseline — `G.villainAbilityHooks` added as a new
// sibling field (initialized [] for this empty mock registry, which builds no
// hooks), changing the JSON-encoded state hash. Purely structural — no behavior
// change in this empty-registry replay (same cascade pattern as the
// heroAbilityHooks / cardTraits field additions). Pre-edit: 'eae128df'.
// why: WP-200 cascade re-baseline — `G.notableEvents: NotableGameEvent[]`
// added as a new sibling field on `LegendaryGameState`. Initialised `[]` in
// `buildInitialGameState`; no fire site emits during the empty-registry
// replay (no villain hooks → executor returns []; no Ambush keyword on any
// card; the registry path doesn't produce villains/strikes), so the only
// hash delta is the empty `notableEvents` array's existence. Pre-edit:
// '86895342'. Post-edit: 'a3d25f9e'. Dependency-driven (revert by removing
// the new G field with no remaining diff); no behavior change in this test.
const PRE_WP080_HASH = 'a3d25f9e';

/**
 * Minimal mock registry for replay tests. Mirrors replay.verify.test.ts.
 *
 * @amended WP-113 PS-4: now satisfies all four orchestration-side
 *   registry-reader guards (`listCards`, `listSets`, `getSet`) so
 *   `buildInitialGameState` does not push "skipped" diagnostics into
 *   `G.messages`. Preserves the WP-080 byte-identity anchor by keeping
 *   the empty-state shape identical. (`isSchemeRegistryReader` was
 *   realigned to `listSets`/`getSet` in the WP-113 follow-up alignment
 *   fix; per D-10014.)
 */
const mockRegistry: CardRegistryReader = {
  listCards: () => [],
  listSets: () => [],
  getSet: (_abbr: string) => undefined,
};

/**
 * Standard test ReplayInput. Mirrors replay.verify.test.ts verbatim so the
 * Case 2 regression guard is anchored to the same fixture WP-027 exercises.
 *
 * @amended WP-113 PS-7: bare slug fixtures migrated to set-qualified
 *   form `'<setAbbr>/<slug>'` per the qualified-ID contract
 *   (per D-10014).
 */
const standardInput: ReplayInput = {
  seed: 'test-seed-001',
  setupConfig: {
    schemeId: 'test/test-scheme-001',
    mastermindId: 'test/test-mastermind-001',
    villainGroupIds: ['test/test-villain-group-001'],
    henchmanGroupIds: ['test/test-henchman-group-001'],
    heroDeckIds: ['test/test-hero-deck-001', 'test/test-hero-deck-002'],
    bystandersCount: 10,
    woundsCount: 15,
    officersCount: 20,
    sidekicksCount: 5,
  },
  playerOrder: ['0', '1'],
  moves: [],
};

describe('applyReplayStep', () => {
  it('produces identical state for identical inputs and returns the same reference', () => {
    const numPlayers = standardInput.playerOrder.length;
    const setupContext = makeMockCtx({ numPlayers });
    const original = buildInitialGameState(
      standardInput.setupConfig,
      mockRegistry,
      setupContext,
    );
    const clone = structuredClone(original);

    const move: ReplayMove = {
      moveName: 'setPlayerReady',
      playerId: '0',
      args: { ready: true },
    };

    const originalResult = applyReplayStep(original, move, numPlayers);
    const cloneResult = applyReplayStep(clone, move, numPlayers);

    assert.strictEqual(
      computeStateHash(originalResult),
      computeStateHash(cloneResult),
      'applyReplayStep must produce byte-identical state for identical inputs',
    );
    assert.strictEqual(
      originalResult,
      original,
      'applyReplayStep must return the same reference it received (Q2 = A, D-6304)',
    );
  });

  it('preserves replayGame stateHash byte-identically (regression guard via PRE_WP080_HASH)', () => {
    const result = replayGame(standardInput, mockRegistry);

    if (PRE_WP080_HASH === '__CAPTURE_ME__') {
      // why: first-run capture path. Print the hash so it can be pasted into
      // PRE_WP080_HASH, then fail loudly so the refactor cannot proceed until
      // the regression anchor is locked against pre-refactor replayGame.
      console.log('WP-080 CAPTURE:', result.stateHash);
      assert.fail(
        'Paste the printed hash into PRE_WP080_HASH, then re-run this test before refactoring replayGame.',
      );
    }

    assert.strictEqual(
      result.stateHash,
      PRE_WP080_HASH,
      'replayGame stateHash must be byte-identical through the WP-080 loop-delegation refactor',
    );
  });

  it('emits warning-and-skip for unknown move name without throwing', () => {
    const numPlayers = standardInput.playerOrder.length;
    const setupContext = makeMockCtx({ numPlayers });
    const gameState = buildInitialGameState(
      standardInput.setupConfig,
      mockRegistry,
      setupContext,
    );
    const messagesBefore = gameState.messages.length;

    const unknownMove: ReplayMove = {
      moveName: 'nonexistentMove',
      playerId: '0',
      args: undefined,
    };

    const returned = applyReplayStep(gameState, unknownMove, numPlayers);

    assert.strictEqual(
      returned,
      gameState,
      'applyReplayStep must return the same reference even when the move is unknown',
    );
    assert.strictEqual(
      gameState.messages.length,
      messagesBefore + 1,
      'Unknown move must append exactly one message to gameState.messages',
    );
    assert.strictEqual(
      gameState.messages[gameState.messages.length - 1],
      'Replay warning: unknown move name "nonexistentMove" — skipped.',
      'Unknown-move message text must match the canonical warning-and-skip string',
    );
  });
});
