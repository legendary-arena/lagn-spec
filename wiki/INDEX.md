# Wiki Index

> **11 / 50** entity pages.
> Last regenerated: 2026-05-15.
> See [SCHEMA.md](SCHEMA.md) for the entity-page contract and
> [README.md](README.md) for purpose, conventions, and authority.

---

## Mechanic

Discrete in-game mechanics with specific triggers and effects.

- [Master Strike](master-strike.md) — Trigger fired on
  `mastermind-strike` reveal from the villain deck. MVP handler
  increments `masterStrikeCount`; full per-mastermind tactic
  resolution pending a future WP.
- [Scheme Twist](scheme-twist.md) — Trigger fired on `scheme-twist`
  reveal. Drives the `ENDGAME_CONDITIONS.SCHEME_LOSS` counter via the
  predict-post-effect handler pattern.

## System

Coordinated subsystems spanning multiple files / phases.

- [Villain Deck](villain-deck.md) — Reveal pipeline for the
  antagonist stack; classifies drawn cards into one of five
  `RevealedCardType` values and routes the appropriate trigger.
- [Turn System](turn-system.md) — Two-level temporal state machine:
  four match phases (`MATCH_PHASES`) × three turn stages
  (`TURN_STAGES`); transition discipline via `// why:` comments.
- [Rule Execution Pipeline](rule-execution-pipeline.md) — Two-
  registry (data in `G`, functions outside), two-phase
  (`executeRuleHooks` → `applyRuleEffects`) mechanism for
  translating triggers into deterministic state changes.
- [Scoring](scoring.md) — Two-layer measurement: scenario `ParBaseline`
  (Layer A) + per-match `FinalScore` (Layer B); version-pinned,
  replay-verified, JSON-serializable.

## Concept

Abstract data shapes, contracts, and design concepts.

- [CardExtId](cardextid.md) — Named `string` alias for card
  identifiers; format `<setAbbr>/<slug>`; the zone-storage
  invariant — every zone in `G` stores `CardExtId` strings only.
- [Card Type Taxonomy](card-type-taxonomy.md) — Registry-side
  closed-set classification (13 entries: 10 top-level + 3 SHIELD
  sub-chips); consumed by the Registry Viewer ribbon, **not** by
  the engine or registry loaders.
- [Board Keywords](board-keywords.md) — `patrol` · `ambush` · `guard`
  closed three-value union; structural City rules (not hero
  abilities); Ambush wound-flow uses an inline pattern (D-2403)
  pending future migration to a `gainWound` `RuleEffect`.

## Card-Type

High-level card categorizations recognised by the engine.

- [Scheme](scheme.md) — Macro-villain plot; the three-layer scheme
  machinery (configuration field via `MatchSetupConfig.schemeId`,
  setup-time mutator via `SchemeSetupInstruction`, runtime
  participant via Scheme Twist).

## Guide

Cross-cutting governance, methodology, and readiness assessments.

- [Homepage Marketing Scorecard](homepage-marketing-scorecard.md) —
  SB7 + Player Needs Pyramid graded assessment of the homepage;
  tracks readiness across three questions (Problem / Product / Results).

## Keyword

*No v1 entries.* Hero keywords (Recruit, Attack, Draw, etc.) and
additional structural keywords are candidates for future entries
once the v2 anchor list is locked.

---

## By tag (selected)

Wiki pages carry open-vocabulary `tags` in front-matter. The
following are useful entry points:

- **`drift-detection`** — Closed sets backed by canonical readonly
  arrays + drift-detection tests:
  [Villain Deck](villain-deck.md),
  [Rule Execution Pipeline](rule-execution-pipeline.md),
  [Turn System](turn-system.md),
  [Card Type Taxonomy](card-type-taxonomy.md),
  [Board Keywords](board-keywords.md),
  [Scoring](scoring.md)
- **`determinism`** — Pages where the engine's determinism invariant
  is the load-bearing concern:
  [Rule Execution Pipeline](rule-execution-pipeline.md),
  [Turn System](turn-system.md),
  [CardExtId](cardextid.md),
  [Scoring](scoring.md)
- **`trigger`** — Pages that emit or consume rule triggers:
  [Villain Deck](villain-deck.md),
  [Master Strike](master-strike.md),
  [Scheme Twist](scheme-twist.md),
  [Rule Execution Pipeline](rule-execution-pipeline.md),
  [Turn System](turn-system.md)
- **`layer-engine`** — Pages anchored in the engine layer (most
  pages — see individual front-matter for the full set).
- **`layer-marketing`** — Pages anchored in the marketing layer:
  [Homepage Marketing Scorecard](homepage-marketing-scorecard.md)
- **`layer-registry`** — Pages anchored in the registry layer:
  [Card Type Taxonomy](card-type-taxonomy.md),
  [CardExtId](cardextid.md) (cross-cuts engine + registry).

---

*To regenerate this index after page changes, see
[README.md § Updating an existing page](README.md).*
