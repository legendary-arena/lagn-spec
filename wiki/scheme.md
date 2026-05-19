---
title: Scheme
type: Card-Type
tags:
  - card-type
  - scheme
  - layer-engine
  - layer-registry
  - setup
  - phase-setup
  - loss-condition
related:
  - villain-deck.md
  - master-strike.md
  - scheme-twist.md
  - rule-execution-pipeline.md
  - turn-system.md
  - cardextid.md
  - card-type-taxonomy.md
  - board-keywords.md
  - scoring.md
status: canonical
source:
  - ../.claude/skills/legendary-game-engine/SKILL.md
  - ../packages/game-engine/src/scheme/schemeSetup.types.ts
  - ../packages/game-engine/src/scheme/schemeSetup.execute.ts
  - ../packages/game-engine/src/setup/buildSchemeSetupInstructions.ts
  - ../packages/game-engine/src/matchSetup.types.ts
  - ../data/metadata/card-types.json
  - ../docs/ai/ARCHITECTURE.md
  - ../docs/ai/work-packets/WP-005A-match-setup-contracts.md
  - ../docs/ai/work-packets/WP-026-scheme-setup-instructions-city-modifiers.md
  - ../docs/ai/work-packets/WP-113-engine-server-registry-wiring-and-validator-alignment.md
  - ../docs/ai/REFERENCE/00.2-data-requirements.md
  - ../docs/10-GLOSSARY.md
last-reviewed: 2026-05-07
---

# Scheme

## Summary

A scheme is the macro-villain plot for a match — the scenario-level
configuration card that decides what the heroes are fighting against
and how the heroes lose if they fail to stop it. The engine handles
schemes across three distinct layers (configuration, setup, runtime),
each with a different responsibility and lifecycle. The Scheme card
itself never enters the villain deck and is not played by any
player.

## Mechanics

The engine separates scheme machinery into three layers. Conflating
them is the most common scheme-related drift; the layers share the
word *scheme* but are otherwise independent.

### Layer 1: configuration field

`MatchSetupConfig.schemeId` is one of the 9 locked composition fields
(see [00.2 §8.1](../docs/ai/REFERENCE/00.2-data-requirements.md) and
[`matchSetup.types.ts`](../packages/game-engine/src/matchSetup.types.ts)).
It is a [`CardExtId`](cardextid.md) whose format is
`<setAbbr>/<slug>` per D-10014
(locked by WP-113). The validator enforces this format; malformed
values fail match creation in `validateMatchSetup`. There is exactly
one scheme per match; there is no "no scheme" option.

### Layer 2: setup-time mutator (D-2601 RBE)

A scheme expresses its setup-time effects as a list of declarative
`SchemeSetupInstruction` entries — data-only contracts that follow
D-2601 (Representation Before Execution). The closed
`SchemeSetupType` union has four entries:

| Type | Effect |
|---|---|
| `modifyCitySize` | Stubbed at MVP — `CityZone` is a fixed 5-tuple per D-2602 |
| `addCityKeyword` | Adds a board keyword (Patrol / Ambush / Guard) to a specific City card |
| `addSchemeCounter` | Initializes a named counter on `G.counters` for scheme-specific tracking |
| `initialCityState` | Pre-populates a City space before the first villain-deck reveal |

`buildSchemeSetupInstructions(schemeId, registry)` in
[`buildSchemeSetupInstructions.ts`](../packages/game-engine/src/setup/buildSchemeSetupInstructions.ts)
resolves these instructions at setup time. The MVP implementation
returns `[]` for all schemes — the registry does not yet expose
structured setup-instruction metadata. The builder skeleton, the
type guard `isSchemeRegistryReader`, and the four instruction types
all exist so that a future Work Packet can populate real instructions
without refactoring the call site.

`executeSchemeSetup(state, instructions)` in
[`schemeSetup.execute.ts`](../packages/game-engine/src/scheme/schemeSetup.execute.ts)
applies each instruction with a switch on `instruction.type`. It is a
pure function — never mutates inputs, never throws. Unknown types log
a warning and continue (graceful degradation per D-1234).

### Layer 3: runtime trigger participant

A scheme's runtime impact is mediated entirely through
[Scheme Twist](scheme-twist.md). When a `scheme-twist` card is
revealed from the villain deck, `schemeTwistHandler` increments
`schemeTwistCount` and — at the MVP threshold — increments
`ENDGAME_CONDITIONS.SCHEME_LOSS`. The Scheme entity itself is not
read at runtime; the threshold and counter wiring live in the
handler, not in the scheme. Per-scheme thresholds are pending a
future WP. See [Scheme Twist](scheme-twist.md) for the trigger
mechanics; this page does not duplicate that detail.

### Registry classification

The [Card Type Taxonomy](card-type-taxonomy.md) — 13 entries in
[`data/metadata/card-types.json`](../data/metadata/card-types.json)
— classifies schemes under
`{ slug: 'scheme', label: 'Scheme', emoji: '📜', order: 50,
parentType: null }`. This is registry-side metadata only, consumed
by the Registry Viewer ribbon (per WP-086 / D-8601). It is not read
by match-setup validation or runtime logic.

## Interactions

- **[Scheme Twist](scheme-twist.md).** The runtime side of scheme
  behaviour. The Scheme entity supplies the loss condition's anchor
  via `ENDGAME_CONDITIONS.SCHEME_LOSS`; Scheme Twist drives the
  counter that crosses the threshold.
- **[Villain Deck](villain-deck.md).** The Scheme card itself is
  *not* in the villain deck — only `scheme-twist` cards are. The
  Scheme entity does not participate in `revealVillainCard`'s
  classification step.
- **[Master Strike](master-strike.md).** Both schemes and masterminds
  contribute to the scenario-level configuration of a match (`schemeId`
  and `mastermindId` are sibling fields in `MatchSetupConfig`). The
  two are otherwise independent — Master Strike does not read
  scheme state, and Scheme Twist does not read mastermind state.
- **City.** Scheme setup instructions can populate `G.city` and
  `G.cardKeywords` at setup time via `addCityKeyword` and
  `initialCityState`. This is the primary route by which a scheme
  shapes the early board.
- **Counters.** `addSchemeCounter` initializes named counters on
  `G.counters` for scheme-specific tracking. These coexist with
  `ENDGAME_CONDITIONS` keys but are scheme-local; their semantics
  are scheme-defined.
- **[Scoring](scoring.md).** PAR is computed per *scenario* — the
  combination of Scheme + Mastermind + Villain Groups (see VISION
  §20 and [`12-SCORING-REFERENCE.md`](../docs/12-SCORING-REFERENCE.md)).
  The Scheme contributes one of three slugs that build the
  `ScenarioKey`; changing it changes PAR.

## Edge Cases

- **The three layers are not interchangeable.** A change in Layer 2
  (setup instructions) does not affect Layer 3 (twist threshold), and
  vice versa. A scheme that, say, lowers its twist threshold in
  tabletop must touch the runtime handler — not the setup
  instruction list.
- **MVP returns `[]` for every scheme.** Until the future WP populates
  real per-scheme instructions, no scheme actually mutates the board
  at setup. The MVP behaviour is uniform across all 40+ schemes in
  the registry; visual variety in the Registry Viewer does not
  reflect runtime gameplay variety yet.
- **WP-113 follow-up note.** The original `buildSchemeSetupInstructions`
  guard checked for a `getScheme(schemeId)` method that never
  existed on the real `CardRegistry`. The function fell into its
  early-return path on every match-create, which preserved the
  D-2601 "returns []" semantic *by accident*. WP-113 realigned the
  interface and guard to the real `listSets` / `getSet` shape; MVP
  behaviour is unchanged but is now correct by design.
- **`modifyCitySize` is a no-op.** The instruction type exists in the
  closed union, but `executeSchemeSetup` logs a "not yet supported"
  message and skips it because `CityZone` is a fixed 5-tuple per
  D-2602. A future WP that converts `CityZone` to a dynamic array
  will activate this instruction type.
- **Scheme is one card per match.** There is no support for
  multi-scheme matches, scheme replacement during play, or scheme
  "stages". The `schemeId` field in `MatchSetupConfig` is locked at
  match creation and never re-assigned during a match.
- **Slug must match registry exactly.** `schemeId` is parsed at the
  builder boundary via `parseQualifiedId`. Any deviation from
  `<setAbbr>/<slug>` (extra slashes, leading whitespace, empty
  components) returns `null` and the builder gracefully skips —
  the validator is the authoritative format-error reporter (D-10014).

## Code Touchpoints

- [`packages/game-engine/src/matchSetup.types.ts`](../packages/game-engine/src/matchSetup.types.ts)
  — `MatchSetupConfig.schemeId` (Layer 1)
- [`packages/game-engine/src/scheme/schemeSetup.types.ts`](../packages/game-engine/src/scheme/schemeSetup.types.ts)
  — `SchemeSetupInstruction` and `SchemeSetupType` (Layer 2 contract)
- [`packages/game-engine/src/scheme/schemeSetup.execute.ts`](../packages/game-engine/src/scheme/schemeSetup.execute.ts)
  — `executeSchemeSetup` (Layer 2 executor)
- [`packages/game-engine/src/setup/buildSchemeSetupInstructions.ts`](../packages/game-engine/src/setup/buildSchemeSetupInstructions.ts)
  — `buildSchemeSetupInstructions`, `isSchemeRegistryReader`,
  `listSchemeSlugsInSet`, `parseQualifiedId` (Layer 2 builder)
- [`data/metadata/card-types.json`](../data/metadata/card-types.json)
  — registry-side `'scheme'` slug entry

## History

- WP-005A: `MatchSetupConfig.schemeId` introduced as one of the 9 locked composition fields
- WP-026: `SchemeSetupInstruction` data-only contract and `executeSchemeSetup` executor introduced; D-2601 (Representation Before Execution) formalised
- WP-113: `<setAbbr>/<slug>` schemeId format locked; `buildSchemeSetupInstructions` guard realigned to real registry shape (`listSets` / `getSet`); MVP `[]` semantic preserved by design rather than by accident

## References

- [`.claude/skills/legendary-game-engine/SKILL.md`](../.claude/skills/legendary-game-engine/SKILL.md)
  — Move Validation Contract (validators only return — `Game.setup()`
  may throw); Endgame contract (loss conditions evaluated before
  victory)
- [`docs/ai/ARCHITECTURE.md`](../docs/ai/ARCHITECTURE.md) — WP-026
  scheme-setup-instructions review notes; D-2601 RBE formalisation
- [`docs/ai/REFERENCE/00.2-data-requirements.md`](../docs/ai/REFERENCE/00.2-data-requirements.md)
  §8.1 — 9 locked composition fields
- [`docs/10-GLOSSARY.md`](../docs/10-GLOSSARY.md) — `MatchSetupConfig`,
  `SchemeSetupInstruction`, `SchemeSetupType`, `executeSchemeSetup`,
  `buildSchemeSetupInstructions`, `ENDGAME_CONDITIONS`
- [`docs/12-SCORING-REFERENCE.md`](../docs/12-SCORING-REFERENCE.md) —
  scenario keys (Scheme + Mastermind + Villain Groups)
- [`docs/legendary-universal-rules-v23.md`](../docs/legendary-universal-rules-v23.md)
  — tabletop semantics for Scheme cards, setup, twist behaviour, and
  loss conditions
- [WP-005A](../docs/ai/work-packets/WP-005A-match-setup-contracts.md),
  [WP-026](../docs/ai/work-packets/WP-026-scheme-setup-instructions-city-modifiers.md),
  [WP-113](../docs/ai/work-packets/WP-113-engine-server-registry-wiring-and-validator-alignment.md)
