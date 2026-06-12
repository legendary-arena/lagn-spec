import type { Ctx, FnContext, Game, PlayerID } from 'boardgame.io';
import type { MatchConfiguration, LegendaryGameState } from './types.js';
import { validateMatchSetup, type CardRegistryReader } from './matchSetup.validate.js';
import { buildInitialGameState } from './setup/buildInitialGameState.js';
import { TURN_STAGES } from './turn/turnPhases.types.js';
import { advanceTurnStage } from './turn/turnLoop.js';
import { drawCards, playCard, endTurn } from './moves/coreMoves.impl.js';
import { HAND_SIZE, drawCardsIntoHand } from './moves/drawCards.logic.js';
import { resolveHeroChoice } from './moves/heroChoice.resolve.js';
import { executeRuleHooks } from './rules/ruleRuntime.execute.js';
import { applyRuleEffects } from './rules/ruleRuntime.effects.js';
import { DEFAULT_IMPLEMENTATION_MAP } from './rules/ruleRuntime.impl.js';
import { evaluateEndgame } from './endgame/endgame.evaluate.js';
import { setPlayerReady, startMatchIfReady } from './lobby/lobby.moves.js';
import { revealVillainCard } from './villainDeck/villainDeck.reveal.js';
import { fightVillain } from './moves/fightVillain.js';
import { recruitHero } from './moves/recruitHero.js';
import { fightMastermind } from './moves/fightMastermind.js';
import { resetTurnEconomy } from './economy/economy.logic.js';
import { runAllInvariantChecks } from './invariants/runAllChecks.js';
import { buildUIState } from './ui/uiState.build.js';
import { filterUIStateForAudience } from './ui/uiState.filter.js';
import type { UIState } from './ui/uiState.types.js';

// why: The registry must be available to Game.setup() for ext_id validation,
// but boardgame.io's setup function signature does not include a registry
// parameter. This module-level holder allows the server to configure the
// registry at startup (via setRegistryForSetup) before any matches are
// created. Tests that bypass registry validation do not set this.
let gameRegistry: CardRegistryReader | undefined;

/**
 * Configures the card registry used by Game.setup() for match validation
 * and initial state construction. Must be called by the server at startup
 * before creating any matches.
 *
 * @param registry - The card registry for ext_id existence checks.
 */
export function setRegistryForSetup(registry: CardRegistryReader): void {
  gameRegistry = registry;
}

/**
 * Clears the registry previously set by setRegistryForSetup. Test-only —
 * never call in production server code.
 *
 * Without this, a test that calls setRegistryForSetup would leave the
 * registry set for all subsequent tests in the same process, causing
 * test pollution.
 */
export function clearRegistryForSetup(): void {
  gameRegistry = undefined;
}

// why: No-op registry satisfies the CardRegistryReader interface when the
// real registry has not been configured. Used only in test contexts where
// setup validation is intentionally skipped.
// why: D-10014 — satisfies wider CardRegistryReader for test-context skip
// path. PS-3 widened the interface to `{ listCards, listSets, getSet }`
// so the validator can build per-field qualified-ID sets; the empty
// registry must satisfy the wider shape too.
const EMPTY_REGISTRY: CardRegistryReader = {
  listCards: () => [],
  listSets: () => [],
  getSet: () => undefined,
};

/** Move context provided by boardgame.io 0.50.x to every move function. */
type MoveContext = FnContext<LegendaryGameState> & { playerID: PlayerID };

/**
 * Advances the current turn stage to the next stage in the canonical
 * sequence (start -> main -> cleanup -> turn ends).
 *
 * Delegates entirely to advanceTurnStage from turnLoop.ts, which uses
 * getNextTurnStage for ordering — no stage strings are hardcoded here.
 *
 * @param context - boardgame.io move context with G and events.
 */
function advanceStage({ G, events }: MoveContext): void {
  // why: turn cannot end while a player-choice reveal is pending; at cleanup,
  // advanceTurnStage would otherwise call events.endTurn() and bypass the
  // endTurn-move guard (D-22002)
  if (G.currentStage === 'cleanup' && G.pendingHeroChoice !== undefined) { return; }
  advanceTurnStage(G, { events: { endTurn: () => events.endTurn() } });
}

/**
 * Reshapes the client-visible state from LegendaryGameState to
 * audience-filtered UIState. Registered on LegendaryGame.playerView so
 * every state frame boardgame.io pushes to a connected client is already
 * audience-filtered — clients never observe raw G.
 *
 * Pure function: no I/O, no RNG, no mutation of G or ctx, no entries
 * appended to G.messages, never throws. Given identical (G, ctx, playerID),
 * the output is byte-identical.
 *
 * Runs on every state push — keep cheap. Delegates to WP-028 / WP-029
 * helpers which already carry the copy discipline that prevents aliasing
 * G into the projection.
 *
 * // why: parameter shape is the single context object { G, ctx, playerID }
 * because boardgame.io 0.50.2's Game<G>['playerView'] is declared as
 * `(context: { G, ctx, playerID }) => any`. The engine call-site is the
 * boardgame.io runtime itself — it passes a single object. A three-arg
 * positional signature would be type-compatible only via a double-cast and
 * would still be wrong at runtime. WP-089 / EC-089 / RS-3 locked a
 * three-arg signature that reflected the WP's design intent but conflicted
 * with the library's actual runtime shape under TS `exactOptionalPropertyTypes`;
 * resolved during execution per user-authorized RS-3 refinement (see
 * 01.6 post-mortem — "RS-3 cast refinement").
 *
 * @param context - boardgame.io single-argument context: { G, ctx, playerID }.
 * @returns Audience-filtered UIState for the viewing client.
 */
function buildPlayerView({
  G,
  ctx,
  playerID,
}: {
  G: LegendaryGameState;
  ctx: Ctx;
  playerID: PlayerID | null;
}): UIState {
  const uiBuildContext = {
    phase: ctx.phase,
    turn: ctx.turn,
    currentPlayer: ctx.currentPlayer,
  };
  const fullUIState = buildUIState(G, uiBuildContext);

  // why: null and any non-string playerID map to spectator because
  // boardgame.io represents unauthenticated / unseated clients as null
  // on the WebSocket transport; runtime paths that accidentally pass
  // undefined are defended by the same typeof check. Empty string '' is
  // NOT mapped to spectator: it is a valid seat ID in the 0.50.x
  // "0" | "1" | ... convention and routes to { kind: 'player', playerId: '' }.
  // EC-089 §Locked Values line 25 locks the typeof check verbatim.
  const audience = typeof playerID === 'string'
    ? { kind: 'player' as const, playerId: playerID }
    : { kind: 'spectator' as const };

  return filterUIStateForAudience(fullUIState, audience);
}

/**
 * The authoritative boardgame.io Game object for Legendary Arena.
 *
 * All phases, moves, hooks, and endgame logic are registered through this
 * single Game instance. No parallel or experimental Game objects may exist.
 *
 * @see docs/ai/ARCHITECTURE.md -- "The LegendaryGame Object"
 */
export const LegendaryGame: Game<LegendaryGameState, Record<string, unknown>, MatchConfiguration> = {
  name: 'legendary-arena',

  // why: Legendary supports 1-5 players. Solo play (1) is a core mode in the
  // physical game; 5 is the maximum supported by the base set rules.
  minPlayers: 1,
  maxPlayers: 5,

  /**
   * Validates setupData before setup() is called. boardgame.io calls this
   * from the lobby create endpoint -- returning a string triggers a 400
   * response with the string as the error message.
   *
   * @param setupData - the setupData from the create request body
   * @param _numPlayers - player count (validated separately by boardgame.io)
   * @returns an error message string if invalid, undefined if valid
   */
  validateSetupData: (
    setupData: MatchConfiguration | undefined,
    _numPlayers: number,
  ): string | undefined => {
    if (!setupData) {
      return 'Missing setupData. The create request must include a setupData ' +
        'object with a valid MatchConfiguration (schemeId, mastermindId, etc.).';
    }
    return undefined;
  },

  /**
   * Initializes the game state from a MatchConfiguration payload.
   *
   * setup() is the single external-input boundary for the engine. After this
   * function returns, the engine operates solely on G and ctx -- no further
   * external configuration is accepted.
   *
   * @param context - boardgame.io setup context (ctx, events, random, log)
   * @param matchConfiguration - the match setup payload with card ext_ids and counts
   * @returns the initial LegendaryGameState
   * @throws {Error} if matchConfiguration is not provided or validation fails
   */
  // why: setup() accepts MatchConfiguration so the server can pass in the
  // match parameters chosen during lobby/matchmaking. This is the only point
  // where external configuration enters the engine.
  setup: (context, matchConfiguration?: MatchConfiguration): LegendaryGameState => {
    // why: validateSetupData guards this at the lobby API layer, but setup()
    // can also be called directly in tests or by boardgame.io internals
    // (e.g. rematch). This check is a belt-and-suspenders safety net.
    if (!matchConfiguration) {
      throw new Error(
        'LegendaryGame.setup() requires a MatchConfiguration argument. ' +
        'The server must pass the match setup payload when creating a new game.'
      );
    }

    // why: When a registry is available (set by the server via
    // setRegistryForSetup), validate the config against the registry before
    // building state. This catches invalid ext_ids at match creation time.
    // Game.setup() is the ONLY place in the engine where throwing is correct
    // — an invalid config must abort match creation immediately.
    if (gameRegistry) {
      const result = validateMatchSetup(matchConfiguration, gameRegistry);
      if (!result.ok) {
        const firstError = result.errors[0];
        const errorMessage = firstError
          ? firstError.message
          : 'Match setup validation failed with an unknown error.';
        throw new Error(errorMessage);
      }
    }

    // why: The registry parameter allows buildInitialGameState to resolve
    // card data in future Work Packets (hero deck, villain deck construction).
    // For WP-005B, starting decks and piles use well-known ext_ids that do
    // not require registry lookup. EMPTY_REGISTRY is used when the server has
    // not configured a registry (e.g., in unit tests).
    const registryForSetup = gameRegistry ?? EMPTY_REGISTRY;

    // why: runAllInvariantChecks enforces structural, gameRules,
    // determinism, and lifecycle invariants after buildInitialGameState
    // constructs G. Setup is the one engine-wide call site permitted to
    // throw per .claude/skills/legendary-game-engine/SKILL.md §Throwing Convention row 1,
    // so assertInvariant's throw is safe here. Per D-3102, per-move
    // wiring is deferred to a follow-up WP.
    const initialState = buildInitialGameState(
      matchConfiguration,
      registryForSetup,
      context,
    );
    runAllInvariantChecks(initialState, {
      phase: context.ctx.phase,
      turn: context.ctx.turn,
    });
    return initialState;
  },

  // why: playerView is the sole engine→client projection boundary.
  // Clients never observe raw LegendaryGameState — this hook reshapes
  // every state frame into audience-filtered UIState via buildUIState
  // (WP-028) + filterUIStateForAudience (WP-029). filterUIStateForAudience
  // is the project's audience authority per D-0302 / D-8901; boardgame.io's
  // built-in secret-stripping helper is intentionally not used (see D-8901).
  //
  // why: cast anchor is NonNullable<Game<LegendaryGameState>['playerView']>
  // (narrowest refinement of RS-3's locked `Game<...>['playerView']` anchor).
  // The refinement strips the `| undefined` half of the indexed-access type
  // that exactOptionalPropertyTypes: true otherwise carries onto the object
  // literal field. It preserves RS-3's intent (anchor to boardgame.io's
  // Game<...>.playerView property type; do NOT modify the Game<...> generic)
  // while satisfying the compiler. Documented as an RS-3 cast refinement in
  // the 01.6 post-mortem; no DECISIONS entry needed — tooling variance, not
  // architecture.
  playerView: buildPlayerView as NonNullable<Game<LegendaryGameState>['playerView']>,

  // why: every state-mutating move is registered in long-form with
  // `client: false` per D-10008. Background: `playerView` (above) reshapes
  // the engine's authoritative G (LegendaryGameState) into UIState — a
  // completely different shape — for delivery to clients. Without
  // `client: false`, boardgame.io's default behavior runs each move
  // optimistically on the client's local G, which is actually UIState
  // (no `playerZones`, no `lobby`, no `villainDeck`, etc.). Every
  // state-mutating move would crash on the client with "Cannot read
  // properties of undefined" the first time it tries to mutate a G field
  // that doesn't exist on UIState. Setting `client: false` makes each
  // move server-only — the client dispatches via the multiplayer
  // transport but never tries to run the move locally. Server-side
  // execution against real G works; the next server frame broadcasts
  // the new state via playerView. This pattern applies uniformly to
  // ALL state-mutating moves in the engine. The 01.5 triggers remain
  // absent: no new LegendaryGameState field, no buildInitialGameState
  // shape change, no new LegendaryGame.moves entry (the move *names* and
  // their function bodies are unchanged — only the registration form
  // changes from short-form `move` to long-form `{ move, client: false }`),
  // and no new phase hook. Logged as D-10008.
  moves: {
    drawCards: { move: drawCards, client: false },
    playCard: { move: playCard, client: false },
    endTurn: { move: endTurn, client: false },
    advanceStage: { move: advanceStage, client: false },
    revealVillainCard: { move: revealVillainCard, client: false },
    fightVillain: { move: fightVillain, client: false },
    recruitHero: { move: recruitHero, client: false },
    fightMastermind: { move: fightMastermind, client: false },
    resolveHeroChoice: { move: resolveHeroChoice, client: false },
  },

  // why: phase `next` fields declare the intended linear progression
  // (lobby -> setup -> play -> end) but do not cause automatic transitions.
  // Actual transitions require explicit ctx.events.setPhase() calls, which
  // will be added by subsequent Work Packets.
  phases: {
    lobby: {
      start: true,
      next: 'setup',
      // why: `activePlayers: { all: 'lobbyReady' }` plus the matching
      // empty `stages.lobbyReady: {}` block tells boardgame.io: every
      // seated player (not just ctx.currentPlayer) is in the
      // 'lobbyReady' stage and may submit phase-level moves. Equivalent
      // at runtime to boardgame.io's ActivePlayers.ALL constant (which
      // expands to `{ all: Stage.NULL }` where Stage.NULL: null) — but
      // type-clean because `StageArg = StageName | object` rejects the
      // bare `null` literal even though the runtime accepts it. The
      // empty `stages` block adds no new behavior; the lobby phase's
      // top-level `moves: { setPlayerReady, startMatchIfReady }` are
      // the only callable moves regardless of stage. Without this
      // activePlayers config, boardgame.io's server-side dispatch
      // rejects setPlayerReady from any player other than the
      // turn-holder with "player not active - playerID=[N] -
      // action[setPlayerReady]" — making multi-player lobby ready-up
      // impossible. Logged as D-10007. Per the four 01.5 triggers,
      // this is a phase-configuration property (not a phase hook), no
      // new LegendaryGameState field, no buildInitialGameState shape
      // change, no new LegendaryGame.moves entry — 01.5 NOT INVOKED.
      // The 'lobbyReady' stage name is local to this phase and has no
      // semantic meaning beyond "anonymous stage that authorizes all
      // players to submit phase moves".
      turn: {
        activePlayers: { all: 'lobbyReady' },
        stages: {
          lobbyReady: {},
        },
      },
      // why: lobby-phase moves are also long-form with `client: false`
      // per D-10008 — same playerView-vs-UIState shape mismatch as the
      // top-level moves. setPlayerReady mutates G.lobby.ready and
      // startMatchIfReady mutates G.lobby.started + calls
      // events.setPhase('play'); both crash on the client because
      // UIState has no `lobby` field. Server-only dispatch is the fix.
      moves: {
        setPlayerReady: { move: setPlayerReady, client: false },
        startMatchIfReady: { move: startMatchIfReady, client: false },
      },
    },
    setup: {
      next: 'play',
    },
    play: {
      next: 'end',
      // why: endIf must be pure -- all endgame state is read from G.counters
      // which the rule pipeline maintains via applyRuleEffects. Delegates
      // entirely to evaluateEndgame; no inline counter logic here.
      // boardgame.io stores any truthy endIf return as ctx.gameover at runtime;
      // the phase-level type definition is narrower than what it accepts, so
      // we assert the return to satisfy the compiler.
      endIf: ({ G }) => {
        const result = evaluateEndgame(G);
        return (result ?? undefined) as unknown as boolean | void;
      },
      turn: {
        // why: explicit `activePlayers: { currentPlayer: 'playTurn' }` plus
        // empty `stages.playTurn: {}` per D-10009. Without it,
        // boardgame.io's InitTurnOrderState falls back to
        // `SetActivePlayers(ctx, turn.activePlayers || {})` — passing the
        // empty object literal. SetActivePlayers with `{}` returns
        // `ctx.activePlayers = {}` (truthy empty object, NOT null). Then
        // IsPlayerActive evaluates `if (ctx.activePlayers)` → truthy
        // branch → `playerID in {}` → false for ALL players, blocking
        // every move including drawCards from the seated current player.
        // The explicit `{ currentPlayer: 'playTurn' }` config writes
        // `ctx.activePlayers = { '<currentPlayer>': 'playTurn' }`, so
        // IsPlayerActive correctly returns true only for ctx.currentPlayer
        // — restoring turn-based "only current player can move" semantics.
        // The empty `stages.playTurn: {}` block adds no behavior; the
        // top-level LegendaryGame.moves bag remains the active move
        // vocabulary (drawCards, playCard, fightVillain, etc.) per the
        // getMove precedence chain (stage.moves → phase.moves → global
        // moves). The 01.5 triggers remain absent: this is a
        // phase-configuration property, not a phase hook.
        activePlayers: { currentPlayer: 'playTurn' },
        stages: {
          playTurn: {},
        },
        // why: Each new turn must begin at the first canonical turn stage.
        // TURN_STAGES[0] is used instead of a hardcoded string to prevent
        // drift if stage names ever change in turnPhases.types.ts.
        onBegin: ({ G, ctx, random }) => {
          // why: TURN_STAGES is a readonly array with known contents. The
          // non-null assertion is safe because TURN_STAGES always has at
          // least one element (enforced by drift-detection tests in WP-007A).
          G.currentStage = TURN_STAGES[0]!;

          // why: economy resets at start of each player turn — accumulated
          // and spent values from previous turn are cleared
          G.turnEconomy = resetTurnEconomy();

          // why: the once-per-turn villain reveal allowance refreshes at the
          // start of every player turn; without this reset the wrapper guard
          // would permanently block reveals from turn 2 onward.
          G.villainRevealedThisTurn = false;

          // why: the once-per-turn draw allowance refreshes at the start of
          // every player turn; without this reset the drawCards move guard
          // would permanently block draws from turn 2 onward.
          G.hasDrawnThisTurn = false;

          // why: the engine owns the start-of-turn draw — the former
          // TurnActionBar "Draw to 6" UI scaffold is retired. Fill the active
          // player's hand to HAND_SIZE from their deck (reshuffling the
          // discard on exhaustion via the engine's deterministic shuffle — no
          // new randomness source). This runs BEFORE the onTurnStart hooks
          // below so a hand-reading turn-start hook (e.g. Magneto's hand-size
          // trim) observes the freshly drawn hand. hasDrawnThisTurn is set so
          // a subsequent drawCards submission is a guarded no-op.
          const activePlayerZones = G.playerZones[ctx.currentPlayer];
          if (activePlayerZones) {
            const cardsToDraw = Math.max(0, HAND_SIZE - activePlayerZones.hand.length);
            drawCardsIntoHand(activePlayerZones, cardsToDraw, { random });
            G.hasDrawnThisTurn = true;
          }

          // why: trigger -> collect effects -> apply effects pipeline.
          // onTurnStart fires at the beginning of each player's turn so
          // scheme hooks can react to the new turn.
          const turnStartEffects = executeRuleHooks(
            G,
            ctx,
            'onTurnStart',
            { currentPlayerId: ctx.currentPlayer },
            G.hookRegistry,
            DEFAULT_IMPLEMENTATION_MAP,
          );
          applyRuleEffects(G, ctx, turnStartEffects);
        },

        onEnd: ({ G, ctx }) => {
          // why: trigger -> collect effects -> apply effects pipeline.
          // onTurnEnd fires at the end of each player's turn so mastermind
          // hooks can react to the turn ending.
          const turnEndEffects = executeRuleHooks(
            G,
            ctx,
            'onTurnEnd',
            { currentPlayerId: ctx.currentPlayer },
            G.hookRegistry,
            DEFAULT_IMPLEMENTATION_MAP,
          );
          applyRuleEffects(G, ctx, turnEndEffects);
        },
      },
    },
    end: {},
  },
};
