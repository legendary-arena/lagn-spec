# Wiki Index

> **20 / 50** entity pages.
> Last regenerated: 2026-05-16.
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
- [Homepage Spec](homepage-spec.md) — Build document for the homepage:
  hero copy, Problem → Product → Result sections, Final Homepage
  Output, readiness checklist, severity-tiered GO / NO-GO.
- [Homepage Appendix](homepage-appendix.md) — Strategy reference:
  Player Needs Pyramid, 28-problem catalog, badge architecture,
  L2→L4 dependency, content framework (Sales / Narrative / Authority).
- [Homepage Review Template](homepage-review-template.md) —
  Original unified SB7 review: full 28-problem catalog, Player Needs
  Pyramid, badge architecture, and readiness checklist in one document.
- [Brevo Email Pipeline](brevo-email-pipeline.md) — Brevo email
  engagement pipeline: signup, double opt-in, welcome sequence,
  nurture drip, and re-engagement flows.
- [Hugo Web System](hugo-web-system.md) — Marketing site Hugo
  architecture: PaperMod theme overrides, template hierarchy,
  partials pipeline, brand tokens, Pagefind search integration.
- [Ewiki Authoring](ewiki-authoring.md) — Style and formatting
  reference for writing ewiki content: blockquotes, tables, code
  blocks, emoji, CSS variables, and two-repo editing procedures.

## Tutorial

Step-by-step walkthroughs for completing specific tasks.

- [Wiki Viewer](wiki-viewer.md) — How to create, edit, preview,
  and publish ewiki pages: page template, commit prefixes, build
  pipeline, markdown syntax, and local dev server.
- [Figma Logo Design](figma-logo-design.md) — Deterministic
  pipeline for building production-grade SVG logo systems in Figma.
- [Blog Post Authoring](blog-post-authoring.md) — Writing and
  styling blog posts on `www.legendary-arena.com`: Mode C content
  framework, 28-problem catalog mapping, brand tokens, CTA system,
  image conventions, and annotated template.

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
- **`hugo`** — Pages covering Hugo site infrastructure:
  [Wiki Viewer](wiki-viewer.md),
  [Hugo Web System](hugo-web-system.md),
  [Ewiki Authoring](ewiki-authoring.md)
- **`layer-marketing`** — Pages anchored in the marketing layer:
  [Homepage Marketing Scorecard](homepage-marketing-scorecard.md),
  [Homepage Spec](homepage-spec.md),
  [Homepage Appendix](homepage-appendix.md),
  [Homepage Review Template](homepage-review-template.md)
- **`layer-registry`** — Pages anchored in the registry layer:
  [Card Type Taxonomy](card-type-taxonomy.md),
  [CardExtId](cardextid.md) (cross-cuts engine + registry).

---

*To regenerate this index after page changes, see
[README.md § Updating an existing page](README.md).*
