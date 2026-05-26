/**
 * Competent Heuristic (T2) AI policy for the Legendary Arena balance
 * simulation framework (WP-049).
 *
 * createCompetentHeuristicPolicy builds an AIPolicy whose decideTurn scores
 * each legal move against five behavioral heuristics modeling experienced,
 * rules-faithful human play:
 *
 *   1. Threat prioritization — bystander villains first, imminent escapes
 *      urgently
 *   2. Heroism bias — civilian rescue is always worth the efficiency cost
 *   3. Economy awareness — fight when fighting is possible, never stall
 *   4. Limited deck awareness — coarse early/mid/late posture, no counting
 *   5. Local optimization — evaluate this turn and next, no deep lookahead
 *
 * Scoring is deterministic; ties are broken by a seeded mulberry32 PRNG
 * closed over the policy-seed hash. The decision PRNG never shares state
 * with the run-level shuffle PRNG (D-3604 two-domain invariant).
 *
 * No boardgame.io imports. No @legendary-arena/registry imports. No
 * Math.random(). No .reduce() with branching. No IO.
 */

import type { AIPolicy, LegalMove } from './ai.types.js';
import type { UIState, UICityCard, UICityState } from '../ui/uiState.types.js';
import type { ClientTurnIntent } from '../network/intent.types.js';

// ---------------------------------------------------------------------------
// Seeded PRNG helpers — duplicated from ai.random.ts per WP-036 Scope Lock.
// ---------------------------------------------------------------------------

// why: policy-level decision RNG must derive only from the policy seed and
// must never share state with the run-level shuffle RNG (D-3604). Tests
// reseed one domain without perturbing the other.

/**
 * Deterministic 32-bit seed for mulberry32 derived from a string via djb2.
 *
 * Duplicated from ai.random.ts / simulation.runner.ts per WP-036 Scope
 * Lock — the simulation subsystem keeps its tiny PRNG plumbing inline
 * rather than introducing a shared helper file (ARCHITECTURE.md forbids
 * growing the simulation surface beyond what WP-036 locked).
 *
 * @param seed - Arbitrary seed string.
 * @returns Non-negative 32-bit integer derived from the seed.
 */
function hashSeedString(seed: string): number {
  let hash = 5381;
  for (const character of seed) {
    hash = ((hash << 5) + hash + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

/**
 * Creates a deterministic mulberry32 PRNG bound to the given 32-bit seed.
 *
 * Duplicated from ai.random.ts per WP-036 Scope Lock. Simulation-internal
 * only — not cryptographic. Same seed + same call sequence = same output
 * sequence.
 *
 * @param seed - 32-bit integer seed.
 * @returns A nullary function returning a float in [0, 1) on each call.
 */
function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let accumulator = state;
    accumulator = Math.imul(accumulator ^ (accumulator >>> 15), accumulator | 1);
    accumulator ^= accumulator + Math.imul(accumulator ^ (accumulator >>> 7), accumulator | 61);
    return ((accumulator ^ (accumulator >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Heuristic scoring constants.
// ---------------------------------------------------------------------------

// why: heuristic score weights are integer ranks, not physical units, so
// the scoring has a strict ordering that survives tie-breaking. Heroism
// bias (bystander rescue) outranks pure efficiency wins; threat
// prioritization (imminent escape prevention) outranks both.

/** Base score for fighting a villain that is NOT carrying a bystander. */
const SCORE_FIGHT_VILLAIN_BASE = 100;

/** Bonus for fighting a villain that IS carrying a bystander (heroism bias). */
const SCORE_BYSTANDER_RESCUE_BONUS = 500;

/**
 * Bonus for fighting a villain at City slot 4 (the escape edge).
 *
 * Slot 4 is where the next reveal would push a villain out of the City
 * (per WP-015 pushVillainIntoCity). Preventing escape at slot 4 is the
 * highest-urgency threat response.
 */
const SCORE_IMMINENT_ESCAPE_BONUS = 800;

/** Base score for fighting the mastermind (path to victory — highest combat priority). */
const SCORE_FIGHT_MASTERMIND_BASE = 1500;

/** Base score for recruiting a hero from HQ. */
const SCORE_RECRUIT_BASE = 50;

/** Base score for playing a card from hand (economy building). */
const SCORE_PLAY_CARD_BASE = 200;

/** Base score for drawing a card at start or main stage. */
const SCORE_DRAW_CARDS_BASE = 150;

/** Base score for revealing a villain at start stage (mandatory action). */
const SCORE_REVEAL_VILLAIN_BASE = 400;

/** Base score for advancing the turn stage (progression). */
const SCORE_ADVANCE_STAGE_BASE = 10;

/** Base score for ending the turn at cleanup (termination). */
const SCORE_END_TURN_BASE = 5;

// ---------------------------------------------------------------------------
// Scored move record.
// ---------------------------------------------------------------------------

/**
 * Internal pairing of a LegalMove with its heuristic score.
 *
 * Scores are integer ranks used only for deterministic ordering — never
 * surfaced outside the policy. Ties on score are resolved by the seeded
 * mulberry32 RNG (index-based).
 */
interface ScoredMove {
  readonly move: LegalMove;
  readonly score: number;
}

// ---------------------------------------------------------------------------
// Heuristic evaluators — one per WP-049 §A heuristic.
// ---------------------------------------------------------------------------

/**
 * Reads the extId of a city slot, returning null when the slot is empty.
 */
function readCityCard(city: UICityState, slotIndex: number): UICityCard | null {
  if (slotIndex < 0 || slotIndex >= city.spaces.length) {
    return null;
  }
  return city.spaces[slotIndex] ?? null;
}

/**
 * Determines whether a city slot contains a bystander-bearing villain.
 *
 * The UIState projection flags bystander carriage via the 'bystander'
 * keyword on the projected UICityCard. WP-017 attaches bystanders during
 * pushVillainIntoCity; the keyword survives projection so the AI can see
 * what a human player would see.
 */
function cityCardHasBystander(card: UICityCard | null): boolean {
  if (card === null) {
    return false;
  }
  for (const keyword of card.keywords) {
    if (keyword === 'bystander') {
      return true;
    }
  }
  return false;
}

/**
 * Scores a fightVillain move using heuristics 1 + 2 + 5.
 *
 * // why: heuristic 1 (threat prioritization) — villains at slot 4 are one
 * reveal away from escape, which is the most impactful scoring event;
 * bystander carriers rescue civilians on defeat, the second-most impactful.
 * Heuristic 2 (heroism bias) — the bystander rescue bonus always exceeds
 * the plain-fight score, so the policy prefers rescue even when a
 * non-bystander villain is "easier". Heuristic 5 (local optimization) —
 * the fight value depends only on the current City snapshot; no
 * multi-turn lookahead.
 */
function scoreFightVillain(move: LegalMove, city: UICityState): number {
  const args = move.args as { cityIndex?: number } | null | undefined;
  const slotIndex = args?.cityIndex ?? -1;
  const card = readCityCard(city, slotIndex);

  let score = SCORE_FIGHT_VILLAIN_BASE;
  if (cityCardHasBystander(card)) {
    score += SCORE_BYSTANDER_RESCUE_BONUS;
  }
  // why: slot 4 is the escape edge per WP-015 City shift semantics —
  // next reveal pushes this card out of the City, producing an escape.
  // Preventing escape at slot 4 outranks every other action.
  const escapeSlotIndex = city.spaces.length - 1;
  if (slotIndex === escapeSlotIndex && card !== null) {
    score += SCORE_IMMINENT_ESCAPE_BONUS;
  }
  return score;
}

/**
 * Scores a recruitHero move.
 *
 * // why: heuristic 3 (economy awareness) — recruiting is always available
 * when affordable, but fighting is preferred when it scores higher. Plain
 * recruit baseline sits below fight baseline so the policy avoids VP
 * farming via hoarded recruits.
 */
function scoreRecruitHero(_move: LegalMove): number {
  return SCORE_RECRUIT_BASE;
}

/**
 * Scores a playCard move.
 *
 * // why: heuristic 3 (economy awareness) — playing cards converts hand
 * into attack/recruit points, which is always the correct next action
 * when in the main stage and holding cards. Outranks plain fighting so
 * the policy front-loads hand expenditure.
 */
function scorePlayCard(_move: LegalMove): number {
  return SCORE_PLAY_CARD_BASE;
}

/**
 * Scores a drawCards move.
 *
 * // why: heuristic 4 (limited deck awareness) — drawing is valuable when
 * hand is empty and less valuable when hand is full, but the AI does not
 * count cards. A single score favours drawing when other higher-impact
 * actions are unavailable.
 */
function scoreDrawCards(_move: LegalMove): number {
  return SCORE_DRAW_CARDS_BASE;
}

/**
 * Scores a fightMastermind move.
 *
 * // why: defeating mastermind tactics is the ONLY path to victory —
 * it outranks all other combat actions including imminent-escape
 * prevention and bystander rescue. A competent player always fights
 * the mastermind when affordable because each tactic defeated moves
 * toward winning the game.
 */
function scoreFightMastermind(_move: LegalMove): number {
  return SCORE_FIGHT_MASTERMIND_BASE;
}

/**
 * Returns the base score for a non-decision move (reveal, advance, end).
 *
 * // why: heuristic 5 (local optimization) — these moves are lifecycle
 * transitions, not decisions. Reveal at start stage is essentially
 * mandatory; advance/end are cleanup. Scoring them below all decision
 * moves ensures the AI exhausts real choices before progressing.
 */
function scoreLifecycleMove(move: LegalMove): number {
  if (move.name === 'revealVillainCard') {
    return SCORE_REVEAL_VILLAIN_BASE;
  }
  if (move.name === 'advanceStage') {
    return SCORE_ADVANCE_STAGE_BASE;
  }
  if (move.name === 'endTurn') {
    return SCORE_END_TURN_BASE;
  }
  // why: unknown move names are scored zero and will lose to every real
  // move; the policy never generates an unknown name itself but handles
  // one gracefully if the caller supplies a non-canonical LegalMove.
  return 0;
}

/**
 * Scores a single legal move against all five heuristics.
 */
function scoreOneMove(move: LegalMove, view: UIState): number {
  if (move.name === 'fightVillain') {
    return scoreFightVillain(move, view.city);
  }
  if (move.name === 'fightMastermind') {
    return scoreFightMastermind(move);
  }
  if (move.name === 'recruitHero') {
    return scoreRecruitHero(move);
  }
  if (move.name === 'playCard') {
    return scorePlayCard(move);
  }
  if (move.name === 'drawCards') {
    return scoreDrawCards(move);
  }
  return scoreLifecycleMove(move);
}

// ---------------------------------------------------------------------------
// Tie-break selection.
// ---------------------------------------------------------------------------

/**
 * Selects the highest-scoring move, breaking ties via the policy RNG.
 *
 * Steps:
 *   1. Score every move into a ScoredMove array using for...of (no .reduce).
 *   2. Walk the array to find the maximum score.
 *   3. Collect every move whose score equals the maximum.
 *   4. If a single winner, return it. Otherwise, select a winner by
 *      indexing into the tie group with the next mulberry32 draw.
 */
function selectBestMove(
  legalMoves: LegalMove[],
  view: UIState,
  nextRandom: () => number,
): LegalMove {
  const scored: ScoredMove[] = [];
  for (const move of legalMoves) {
    scored.push({ move, score: scoreOneMove(move, view) });
  }

  let maxScore = scored[0]!.score;
  for (const entry of scored) {
    if (entry.score > maxScore) {
      maxScore = entry.score;
    }
  }

  const tieGroup: LegalMove[] = [];
  for (const entry of scored) {
    if (entry.score === maxScore) {
      tieGroup.push(entry.move);
    }
  }

  if (tieGroup.length === 1) {
    return tieGroup[0]!;
  }
  const tieIndex = Math.floor(nextRandom() * tieGroup.length);
  return tieGroup[tieIndex]!;
}

// ---------------------------------------------------------------------------
// Public factory.
// ---------------------------------------------------------------------------

/**
 * Creates the Competent Heuristic (T2) AI policy.
 *
 * The returned policy closes over its own mulberry32 instance created at
 * this call. Two policies built with the same seed produce identical
 * first-call decisions for identical (view, moves) inputs because each
 * starts with a fresh PRNG at state hashSeedString(seed). Subsequent
 * calls advance the same closure, so a single policy's decision sequence
 * depends on call order.
 *
 * Forbidden behaviors (permanent, not just at MVP):
 *   - Caching or memoizing decisions across calls.
 *   - Closing over G, ctx, or any engine internal.
 *   - Retaining state between calls beyond the mulberry32 closure.
 *   - Reading or writing any external resource (filesystem, network, clock).
 *   - Exact card counting or hidden-state inference.
 *   - Adapting behaviour based on "knowing it is a simulation".
 *
 * @param seed - Non-empty seed string; hashed to 32 bits via djb2.
 * @returns An AIPolicy implementing the five T2 heuristics deterministically.
 */
export function createCompetentHeuristicPolicy(seed: string): AIPolicy {
  const seedNumber = hashSeedString(seed);
  const nextRandom = createMulberry32(seedNumber);

  return {
    name: 'CompetentHeuristic',
    decideTurn(playerView: UIState, legalMoves: LegalMove[]): ClientTurnIntent {
      if (legalMoves.length === 0) {
        // why: zero-legal-moves fallback mirrors ai.random.ts. The policy
        // returns an endTurn intent so the runner can either dispatch it
        // (cleanup stage) or flag the game stuck (any other stage).
        return {
          matchId: `simulation-${seed}`,
          playerId: playerView.game.activePlayerId,
          turnNumber: playerView.game.turn,
          move: { name: 'endTurn', args: {} },
        };
      }

      const chosen = selectBestMove(legalMoves, playerView, nextRandom);
      return {
        matchId: `simulation-${seed}`,
        playerId: playerView.game.activePlayerId,
        turnNumber: playerView.game.turn,
        move: { name: chosen.name, args: chosen.args },
      };
    },
  };
}
