/**
 * Drift-detection tests for the WP-067 UIState additions.
 *
 * These tests pin the field names of `UIProgressCounters` and `UIParBreakdown`
 * via `satisfies` against literal fixtures. A future renamer of any of the six
 * field names (`bystandersRescued`, `escapedVillains`, `rawScore`, `parScore`,
 * `finalScore`, `scoringConfigVersion`) fails typecheck here before any
 * runtime test could catch it. WP-062's HUD aria-labels bind to these
 * names verbatim — the contract is non-negotiable.
 *
 * WP-128 / EC-131 — extends the drift suite with type-pinning + value-pinning
 * for the new board-layout projection contract: top-level `decks` / `piles` /
 * `koPile`, per-player `inPlayCards?` / `inPlayDisplay?` / `discardTopCard?` /
 * `victoryCards?` / `victoryVP?`, required new fields on existing types
 * (`mastermind.attachedBystanders`, `mastermind.strikePile`, `scheme.twistPile`,
 * `city.escapedPile`, `economy.piercing`, `economy.woundsDrawn`), and
 * safe-skip default-value pinning per D-12806.
 *
 * Uses node:test and node:assert only. No boardgame.io imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  UIProgressCounters,
  UIParBreakdown,
  UICardDisplay,
  UIHQCard,
  UICityCard,
  UIHQState,
  UIPlayerState,
  UIMastermindState,
  UISchemeState,
  UICityState,
  UITurnEconomyState,
  UIDecksState,
  UISharedPilesState,
  UIKoPileState,
  UIDisplayEntry,
} from './uiState.types.js';
import { buildUIState } from './uiState.build.js';
import { buildInitialGameState } from '../setup/buildInitialGameState.js';
import { makeMockCtx } from '../test/mockCtx.js';
import type { MatchSetupConfig } from '../matchSetup.types.js';
import type { CardRegistryReader } from '../matchSetup.validate.js';

describe('UIState type drift (WP-067)', () => {
  it('UIProgressCounters field names match the locked WP-048/WP-062 contract', () => {
    // why: literal fixture spelled exactly as the contract requires. Any
    // rename of `bystandersRescued` or `escapedVillains` fails this
    // `satisfies` check at compile time.
    const fixture = {
      bystandersRescued: 4,
      escapedVillains: 1,
    } satisfies UIProgressCounters;

    // Runtime keyset assertion mirrors the type-level pin so a future
    // contributor cannot silently widen the interface and skip the gate.
    assert.deepStrictEqual(Object.keys(fixture).sort(), [
      'bystandersRescued',
      'escapedVillains',
    ]);
  });

  it('UIParBreakdown field names mirror WP-048 ScoreBreakdown verbatim', () => {
    // why: literal fixture spelled exactly as the contract requires. Any
    // rename of `rawScore`, `parScore`, `finalScore`, or
    // `scoringConfigVersion` fails this `satisfies` check at compile time.
    const fixture = {
      rawScore: 100,
      parScore: 80,
      finalScore: 20,
      scoringConfigVersion: 1,
    } satisfies UIParBreakdown;

    assert.deepStrictEqual(Object.keys(fixture).sort(), [
      'finalScore',
      'parScore',
      'rawScore',
      'scoringConfigVersion',
    ]);
  });
});

describe('UIState type drift (WP-111 / EC-118)', () => {
  it('UICardDisplay has exactly the six locked fields', () => {
    // why: WP-111 locked the first four fields; WP-179 adds `heroClass`
    // and `team` (optional in TS, always assigned at runtime). Adding
    // further fields (e.g., `cardType`, `keywords`) is scope creep —
    // separate WP required.
    const fixture = {
      extId: 'core/black-widow/strike#0',
      name: 'Mission Accomplished',
      imageUrl: 'https://images.barefootbetters.com/core/core-hero-black-widow-1.webp',
      cost: 2,
      heroClass: 'covert',
      team: 'avengers',
    } satisfies UICardDisplay;

    assert.deepStrictEqual(Object.keys(fixture).sort(), [
      'cost',
      'extId',
      'heroClass',
      'imageUrl',
      'name',
      'team',
    ]);
  });

  it('UICardDisplay.cost accepts null (registry "no cost shown")', () => {
    // why: PS-4 lock — null preserves the UX distinction from `0` ("free").
    const fixture: UICardDisplay = {
      extId: 'core-bystander-noop',
      name: 'No-Cost Card',
      imageUrl: '',
      cost: null,
      heroClass: null,
      team: null,
    };
    assert.equal(fixture.cost, null);
    assert.equal(fixture.heroClass, null);
    assert.equal(fixture.team, null);
  });

  it('UIHQCard has exactly the two locked fields', () => {
    // why: WP-111 §Locked Values — UIHQCard shape is `extId` (canonical
    // join key, repeated for UI convenience and drift-detection sanity)
    // plus `display: UICardDisplay`.
    const fixture = {
      extId: 'core/black-widow/strike#0',
      display: {
        extId: 'core/black-widow/strike#0',
        name: 'Mission Accomplished',
        imageUrl: 'https://images.barefootbetters.com/core/core-hero-black-widow-1.webp',
        cost: 2,
      },
    } satisfies UIHQCard;

    assert.deepStrictEqual(Object.keys(fixture).sort(), ['display', 'extId']);
  });

  it('UICityCard retains existing fields AND has additive display', () => {
    // why: WP-111 — additive extension of UICityCard; existing extId /
    // type / keywords preserved verbatim.
    const fixture = {
      extId: 'core-villain-brotherhood-magneto-00',
      type: 'villain',
      keywords: ['ambush'],
      display: {
        extId: 'core-villain-brotherhood-magneto-00',
        name: 'Magneto',
        imageUrl: '',
        cost: 5,
      },
    } satisfies UICityCard;

    assert.deepStrictEqual(Object.keys(fixture).sort(), [
      'display',
      'extId',
      'keywords',
      'type',
    ]);
  });

  it('UIHQState retains slots: (string | null)[] AND has optional slotDisplay', () => {
    // why: pre-flight 2026-04-29 PS-6 fallback — `slots` shape preserved
    // verbatim (Q3 audit blocked the breaking-change form). `slotDisplay`
    // is an optional parallel array.
    const withDisplay = {
      slots: ['core/black-widow/strike#0', null] as (string | null)[],
      slotDisplay: [
        {
          extId: 'core/black-widow/strike#0',
          display: {
            extId: 'core/black-widow/strike#0',
            name: 'Mission Accomplished',
            imageUrl: '',
            cost: 2,
          },
        },
        null,
      ] as (UIHQCard | null)[],
    } satisfies UIHQState;

    // slotDisplay is optional — the without-display form must also satisfy.
    const withoutDisplay = {
      slots: ['core/black-widow/strike#0', null] as (string | null)[],
    } satisfies UIHQState;

    assert.equal(withDisplay.slots.length, withDisplay.slotDisplay.length);
    assert.equal(withoutDisplay.slots.length, 2);
  });

  it('UIPlayerState retains handCards? AND has optional handDisplay', () => {
    // why: WP-111 — additive parallel-array; handCards: string[] (already
    // optional) preserved verbatim, handDisplay added optional.
    const withDisplay = {
      playerId: '0',
      deckCount: 8,
      handCount: 2,
      discardCount: 0,
      inPlayCount: 0,
      victoryCount: 0,
      woundCount: 0,
      handCards: ['starting-shield-agent', 'starting-shield-agent'],
      handDisplay: [
        {
          extId: 'starting-shield-agent',
          name: 'S.H.I.E.L.D. Agent',
          imageUrl: '',
          cost: null,
        },
        {
          extId: 'starting-shield-agent',
          name: 'S.H.I.E.L.D. Agent',
          imageUrl: '',
          cost: null,
        },
      ],
    } satisfies UIPlayerState;

    // both optional fields may be omitted (redacted form).
    const redacted = {
      playerId: '1',
      deckCount: 8,
      handCount: 4,
      discardCount: 0,
      inPlayCount: 0,
      victoryCount: 0,
      woundCount: 0,
    } satisfies UIPlayerState;

    assert.equal(withDisplay.handCards.length, withDisplay.handDisplay.length);
    assert.equal(redacted.handCount, 4);
  });

  it('UIMastermindState retains existing fields AND has display', () => {
    // why: WP-111 — additive extension; existing id / tacticsRemaining /
    // tacticsDefeated preserved verbatim. WP-128 extends with required
    // attachedBystanders + strikePile (covered in the WP-128 drift block
    // below).
    const fixture: UIMastermindState = {
      id: 'core/dr-doom',
      tacticsRemaining: 4,
      tacticsDefeated: 0,
      display: {
        extId: 'core-mastermind-dr-doom-doctor-doom',
        name: 'Dr. Doom',
        imageUrl: '',
        cost: 9,
      },
      attachedBystanders: [],
      strikePile: [],
      gameText: ['Master Strike: Each player reveals a Hero or discards.'],
    };

    assert.deepStrictEqual(Object.keys(fixture).sort(), [
      'attachedBystanders',
      'display',
      'gameText',
      'id',
      'strikePile',
      'tacticsDefeated',
      'tacticsRemaining',
    ]);
  });
});

// ---------------------------------------------------------------------------
// WP-128 / EC-131 — board-layout projection contract drift
// ---------------------------------------------------------------------------

describe('UIState type drift (WP-128 / EC-131) — type pinning', () => {
  it('UIDisplayEntry has exactly { extId, display }', () => {
    // why: WP-128 / D-12805 — shared alias used by victoryCards /
    // strikePile / twistPile / escapedPile / koPile.cards / koPile.topCard /
    // discardTopCard / attachedBystanders. Repeating the inline literal
    // at every consumer site would be a DRY violation; this pin guards
    // the alias's two-field shape.
    const fixture = {
      extId: 'core-villain-brotherhood-magneto-00',
      display: {
        extId: 'core-villain-brotherhood-magneto-00',
        name: 'Magneto',
        imageUrl: '',
        cost: 5,
      },
    } satisfies UIDisplayEntry;

    assert.deepStrictEqual(Object.keys(fixture).sort(), ['display', 'extId']);
  });

  it('UIDecksState pins villainDeckCount + heroDeckCount field names', () => {
    // why: WP-128 — counts only; next-card identity NEVER projected per
    // WP-014A determinism contract. Both fields required (never optional).
    const fixture = {
      villainDeckCount: 24,
      heroDeckCount: 0,
    } satisfies UIDecksState;

    assert.deepStrictEqual(Object.keys(fixture).sort(), [
      'heroDeckCount',
      'villainDeckCount',
    ]);
  });

  it('UISharedPilesState pins all five count field names including horrorsCount', () => {
    // why: WP-128 / D-12802 — `horrorsCount` always present (required, not
    // optional). All five count fields are pinned here so a rename to
    // e.g. `bystanderCount` (singular) trips at compile time.
    const fixture = {
      bystandersCount: 10,
      woundsCount: 15,
      horrorsCount: 0,
      officersCount: 20,
      sidekicksCount: 5,
    } satisfies UISharedPilesState;

    assert.deepStrictEqual(Object.keys(fixture).sort(), [
      'bystandersCount',
      'horrorsCount',
      'officersCount',
      'sidekicksCount',
      'woundsCount',
    ]);
  });

  it('UIKoPileState pins count + topCard + cards (count must be number; topCard nullable)', () => {
    // why: WP-128 / D-12804 — KO pile is shared and face-up. `topCard`
    // is `UIDisplayEntry | null` (null when count === 0); `cards` is
    // the full pile in deterministic insertion order. Source path is
    // top-level `G.ko` per `types.ts:481` — NOT `G.piles.ko`.
    const populated: UIKoPileState = {
      count: 2,
      topCard: {
        extId: 'core-villain-brotherhood-toad-00',
        display: {
          extId: 'core-villain-brotherhood-toad-00',
          name: 'Toad',
          imageUrl: '',
          cost: 2,
        },
      },
      cards: [
        {
          extId: 'core-villain-brotherhood-pyro-00',
          display: {
            extId: 'core-villain-brotherhood-pyro-00',
            name: 'Pyro',
            imageUrl: '',
            cost: 3,
          },
        },
        {
          extId: 'core-villain-brotherhood-toad-00',
          display: {
            extId: 'core-villain-brotherhood-toad-00',
            name: 'Toad',
            imageUrl: '',
            cost: 2,
          },
        },
      ],
    };

    const empty: UIKoPileState = { count: 0, topCard: null, cards: [] };

    assert.deepStrictEqual(Object.keys(populated).sort(), [
      'cards',
      'count',
      'topCard',
    ]);
    assert.equal(empty.topCard, null);
    assert.equal(empty.count, 0);
  });

  it('UISchemeState retains id + twistCount AND adds required twistPile', () => {
    // why: WP-128 — additive extension; existing id + twistCount preserved
    // verbatim. `twistPile: UIDisplayEntry[]` is required (safe-skip `[]`
    // until a future WP adds `G.scheme.twistPile`).
    const fixture: UISchemeState = {
      id: 'core/scheme-001',
      twistCount: 0,
      twistPile: [],
      display: {
        extId: 'core-scheme-midtown-bank-robbery',
        name: 'Midtown Bank Robbery',
        imageUrl: '',
        cost: null,
      },
      gameText: ['Twist: Any Villain in the Bank captures 2 Bystanders.'],
    };

    assert.deepStrictEqual(Object.keys(fixture).sort(), [
      'display',
      'gameText',
      'id',
      'twistCount',
      'twistPile',
    ]);
  });

  it('UICityState retains spaces AND adds required escapedPile', () => {
    // why: WP-128 — additive extension; existing `spaces` preserved
    // verbatim. `escapedPile: UIDisplayEntry[]` is required (safe-skip
    // `[]` until a future WP adds `G.city.escapedPile`).
    const fixture: UICityState = {
      spaces: [null, null, null, null, null],
      escapedPile: [],
    };

    assert.deepStrictEqual(Object.keys(fixture).sort(), [
      'escapedPile',
      'spaces',
    ]);
  });

  it('UITurnEconomyState retains existing fields AND adds piercing + woundsDrawn', () => {
    // why: WP-128 — additive extension; existing attack / recruit /
    // availableAttack / availableRecruit preserved verbatim. piercing
    // and woundsDrawn ship as `0` safe-skip per D-12806.
    const fixture: UITurnEconomyState = {
      attack: 0,
      recruit: 0,
      availableAttack: 0,
      availableRecruit: 0,
      piercing: 0,
      woundsDrawn: 0,
    };

    assert.deepStrictEqual(Object.keys(fixture).sort(), [
      'attack',
      'availableAttack',
      'availableRecruit',
      'piercing',
      'recruit',
      'woundsDrawn',
    ]);
  });

  it('all 8 safe-skip sites (D-12806) project typed-stable defaults on empty match; koPile uses G.ko top-level path (NOT G.piles.ko, PS-1)', () => {
    // why: D-12806 commits to deterministic safe-skip values when the
    // underlying G source is absent. When a future WP adds the source,
    // only the value flips — the field shape stays identical. This
    // test pins every safe-skip default so a future contributor adding
    // the real source value sees the test fail before drift propagates.
    // Also pins the PS-1 koPile correction: source path is `G.ko`
    // (top-level, line 481 of types.ts) — NOT `G.piles.ko` (no such
    // path). Empty match has `G.ko === []`, so count === 0, topCard
    // === null, cards === [].
    const ui = buildEmptyMatchUIState();

    // 1. mastermind.attachedBystanders === [] (Interpretation B; do NOT
    //    flatten G.attachedBystanders city-villain captures here).
    assert.deepStrictEqual(ui.mastermind.attachedBystanders, []);
    // 2. mastermind.strikePile === [] (Master Strike cards live in
    //    G.villainDeck.discard today; future WP preserves them on G).
    assert.deepStrictEqual(ui.mastermind.strikePile, []);
    // 3. scheme.twistPile === [] (no G.scheme object today).
    assert.deepStrictEqual(ui.scheme.twistPile, []);
    // 4. city.escapedPile === [] (CityZone is a 5-tuple; escapes
    //    increment counter only).
    assert.deepStrictEqual(ui.city.escapedPile, []);
    // 5. economy.piercing === 0 (no G.turnEconomy.piercing today).
    assert.equal(ui.economy.piercing, 0);
    // 6. economy.woundsDrawn === 0 (no G.turnEconomy.woundsDrawn today).
    assert.equal(ui.economy.woundsDrawn, 0);
    // 7. decks.heroDeckCount === 0 — narrow registry produces an empty
    //    G.heroDeck reservoir per WP-135's soft-skip on incomplete
    //    RegistryReader (mirrors sibling builders). The value still
    //    derives from gameState.heroDeck.length now (safe-skip
    //    constant 0 graduated by WP-135 per D-12806 closure for this
    //    site); the assignment-site SAFE-SKIP-WP128 marker is removed
    //    on this projection field. The line-14 JSDoc reference is
    //    unchanged. See the positive-value assertion below for the
    //    real-shape registry case.
    assert.equal(ui.decks.heroDeckCount, 0);
    // 8. piles.horrorsCount === 0 (D-12802 always-present default).
    assert.equal(ui.piles.horrorsCount, 0);

    // PS-1 koPile path: G.ko (NOT G.piles.ko)
    assert.equal(ui.koPile.count, 0);
    assert.equal(ui.koPile.topCard, null);
    assert.deepStrictEqual(ui.koPile.cards, []);
  });

  it('UIPlayerState adds optional inPlayCards / inPlayDisplay / discardTopCard / victoryCards / victoryVP', () => {
    // why: WP-128 — additive optional extensions. All five flag the
    // audience-filter redaction posture (D-12803): inPlayCards /
    // inPlayDisplay redacted for non-self / spectator; discardTopCard /
    // victoryCards / victoryVP NOT redacted (public).
    const populated: UIPlayerState = {
      playerId: '0',
      deckCount: 6,
      handCount: 4,
      discardCount: 2,
      inPlayCount: 1,
      victoryCount: 3,
      woundCount: 0,
      handCards: ['hero-001'],
      handDisplay: [
        { extId: 'hero-001', name: 'Hero One', imageUrl: '', cost: 2 },
      ],
      inPlayCards: ['hero-002'],
      inPlayDisplay: [
        { extId: 'hero-002', name: 'Hero Two', imageUrl: '', cost: 1 },
      ],
      discardTopCard: {
        extId: 'hero-003',
        display: {
          extId: 'hero-003',
          name: 'Hero Three',
          imageUrl: '',
          cost: 0,
        },
      },
      victoryCards: [
        {
          extId: 'villain-001',
          display: {
            extId: 'villain-001',
            name: 'Villain One',
            imageUrl: '',
            cost: 4,
          },
        },
      ],
      victoryVP: 7,
    };

    // Empty discard projects null; redacted form omits the optional fields.
    const emptyDiscard: UIPlayerState = {
      playerId: '1',
      deckCount: 8,
      handCount: 4,
      discardCount: 0,
      inPlayCount: 0,
      victoryCount: 0,
      woundCount: 0,
      discardTopCard: null,
      victoryCards: [],
      victoryVP: 0,
    };

    assert.equal(populated.victoryVP, 7);
    assert.equal(populated.inPlayCards!.length, populated.inPlayDisplay!.length);
    assert.equal(emptyDiscard.discardTopCard, null);
  });
});

// ---------------------------------------------------------------------------
// WP-128 / EC-131 — safe-skip default-value pinning (D-12806)
// (folded into the WP-128 type-drift describe above to keep the suite
// count within EC-131 §5 budget — same conceptual block.)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// WP-135 — heroDeckCount graduation from safe-skip constant 0 to
// gameState.heroDeck.length. The drift suite asserts both directions:
// the empty-registry case (count === 0; covered above) and the
// loaded-hero case (count > 0; covered here).
// ---------------------------------------------------------------------------

describe('UIState — WP-135 heroDeckCount graduation', () => {
  it('decks.heroDeckCount > 0 when the registry exposes a hero with a 14-card cards[] array', () => {
    // why: WP-135 — the projection now reads gameState.heroDeck.length.
    // For a 1-hero loadout against a real-shape registry that supplies
    // the four-label rarity set, buildHeroDeck produces 14 cards; HQ
    // takes the first 5; G.heroDeck holds the remaining 9.
    const setData = {
      abbr: 'core',
      schemes: [{ slug: 's' }],
      masterminds: [{ slug: 'mm', cards: [{ slug: 'mm-base', tactic: false }] }],
      henchmen: [{ slug: 'h' }],
      villains: [{ slug: 'v', cards: [{ slug: 'v1', vAttack: '4' }] }],
      heroes: [
        {
          slug: 'hero-x',
          cards: [
            { slug: 'card-c1', rarityLabel: 'Common 1' },
            { slug: 'card-c2', rarityLabel: 'Common 2' },
            { slug: 'card-uncommon', rarityLabel: 'Uncommon' },
            { slug: 'card-rare', rarityLabel: 'Rare' },
          ],
        },
      ],
    };
    const registry = {
      listCards: () => [],
      listSets: () => [{ abbr: 'core' }],
      getSet: (abbr: string) => (abbr === 'core' ? setData : undefined),
    };
    const config: MatchSetupConfig = {
      schemeId: 'core/s',
      mastermindId: 'core/mm',
      villainGroupIds: ['core/v'],
      henchmanGroupIds: ['core/h'],
      heroDeckIds: ['core/hero-x'],
      bystandersCount: 1,
      woundsCount: 1,
      officersCount: 1,
      sidekicksCount: 1,
    };
    const setupContext = makeMockCtx({ numPlayers: 1 });
    const gameState = buildInitialGameState(config, registry, setupContext);
    const ctx = { phase: 'play' as string | null, turn: 1, currentPlayer: '0' };
    const ui = buildUIState(gameState, ctx);

    // 14 cards built (5 + 3 + 3 + 3); HQ takes 5; heroDeck holds 9.
    assert.equal(
      ui.decks.heroDeckCount,
      9,
      'heroDeckCount must equal G.heroDeck.length post-WP-135 (1 hero × 14 - 5 = 9)',
    );
  });

  it('G.heroDeck field is pinned on LegendaryGameState shape (WP-135 — type drift gate)', () => {
    // why: locks the heroDeck field onto LegendaryGameState so a future
    // rename or removal trips this assertion at runtime in addition to
    // typecheck. Mirrors the WP-128 board-layout fields' type-drift
    // assertions above.
    const config: MatchSetupConfig = {
      schemeId: 'test-scheme-001',
      mastermindId: 'test-mastermind-001',
      villainGroupIds: ['test-villain-group-001'],
      henchmanGroupIds: ['test-henchman-group-001'],
      heroDeckIds: ['test-hero-deck-001'],
      bystandersCount: 1,
      woundsCount: 1,
      officersCount: 1,
      sidekicksCount: 1,
    };
    const registry: CardRegistryReader = { listCards: () => [] };
    const setupContext = makeMockCtx();
    const gameState = buildInitialGameState(config, registry, setupContext);

    assert.ok(
      Array.isArray(gameState.heroDeck),
      'G.heroDeck must be present and an array on LegendaryGameState',
    );
  });
});

/** Shared test-config helper for safe-skip + path-correction pinning. */
function buildEmptyMatchUIState() {
  const config: MatchSetupConfig = {
    schemeId: 'test-scheme-001',
    mastermindId: 'test-mastermind-001',
    villainGroupIds: ['test-villain-group-001'],
    henchmanGroupIds: ['test-henchman-group-001'],
    heroDeckIds: ['test-hero-deck-001', 'test-hero-deck-002'],
    bystandersCount: 10,
    woundsCount: 15,
    officersCount: 20,
    sidekicksCount: 5,
  };
  const registry: CardRegistryReader = { listCards: () => [] };
  const setupContext = makeMockCtx();
  const gameState = buildInitialGameState(config, registry, setupContext);
  const ctx = { phase: 'play' as string | null, turn: 1, currentPlayer: '0' };
  return buildUIState(gameState, ctx);
}
