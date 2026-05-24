# WP-173 — Well-Known Ext_id Display Data Coverage (Pile + Starting Cards)

**Status:** Drafted
**Primary Layer:** Game Engine / Setup (`packages/game-engine/src/setup/`)
**Dependencies:** WP-172 ✅ (introduced D-17201 tiered display resolution + structural reader pattern this WP extends), WP-111 / EC-118 ✅ (introduced `G.cardDisplayData`)

---

## Drafting Gates (01.0a §Step 5)

- **Drafting baseline:** `origin/main @ 19871c9` (`WP-172: villain-deck
  display data coverage (D-17201)`, 2026-05-23). Verified via
  `git rev-parse origin/main` from the canonical clone at the moment
  the draft branch `claude/wp173-well-known-ext-id-display-data`
  forked.
- **Pre-flight (`01.4`) verdict:** authored at draft time as a
  self-review against the recently-landed WP-172 pattern; expected
  `READY TO EXECUTE` at the execution session's pre-flight invocation
  (class: Behavior; setup-time pure builder; output written to
  `G.cardDisplayData` by `buildInitialGameState` at `Game.setup()`).
  Direct surface continuation of WP-172 (D-17201 pattern); no
  dependency drift; no new layer interaction. Re-validate at
  execution-session start per `01.0b §Step 8`.
- **Copilot check (`01.7`) verdict:** N/A at draft time (no separate
  copilot session run). The WP body documents the locked tier-1 +
  tier-2 resolution paths verbatim and the empirical source-of-truth
  for each ext_id; the §Lint Gate Self-Review covers the 38-item
  checklist with explicit pass / N/A justifications.
- **Lint gate (`00.3`) self-review:** PASS (38 items: 33 ✅ direct,
  5 N/A with non-tautological justification, 0 ❌). See §Lint Gate
  Self-Review at the foot of this document.
- **External review tightening pass (2026-05-23):** post-draft
  external review surfaced 6 actionable improvements + 3
  micro-tightenings; 6 of 7 integrated (the optional helper-rename
  was skipped — the existing naming asymmetry reflects parameter-
  shape differences and renaming would worsen consistency, not
  improve it). Integrated changes: (1) the constants-import
  surface was rewritten to inline literals at the emission site
  with test-side drift-detection (avoids a circular import path
  via `buildInitialGameState.ts`); (2) explicit no-shadow
  contract added — Section 8 emissions are authoritative for the
  six `pile-*` / `starting-shield-*` keys, with shadow-detection
  via the value-shape assertion in the Coverage Invariant test;
  (3) section-ordering lock — Section 8 is a terminal augmentation
  pass placed immediately before the final `return result;`;
  (5) negative-overlap test added — partial-malformed `core.heroes[]`
  entries (object with correct slug but wrong-type fields) fall
  back to tier-2; (6) HandRow audit framing — the test change is
  a fixture refresh, not a UI behavior change; (7) Sidekick
  future-proofing — single-set lookup is intentional; future
  multi-set entries require a separate WP. Plus three
  micro-tightenings in the §Required `// why:` Comments locking
  verbatim phrases. File allowlist unchanged at 7 files.
- **Session prompt:** Written at
  `docs/ai/invocations/session-wp173-well-known-ext-id-display-data.md`
  (gitignored scratchpad per `.claude/rules/work-packets.md` Invocation
  Artifacts policy). Closes 01.0a §Step 6 REQUIRED for this WP.

---

## Session Context

WP-172 closed the gap for the four **villain-deck** ext_id grammars
(per-copy villains, master strikes, scheme twists, villain-deck
bystanders). Production verification of WP-172 against
`play.legendary-arena.com` match `WT_9sGMLmdG` on 2026-05-23 surfaced
a second class of `<unknown>` cards in the player's hand, discard, and
victory pile: **well-known generic game-component ext_ids** that exist
independent of any registry set and were never registered in
`G.cardDisplayData` since `G.cardDisplayData` was introduced
(WP-111 / EC-118).

The six well-known ext_ids are exported as constants from
`packages/game-engine/src/setup/pilesInit.ts` (`BYSTANDER_EXT_ID`,
`WOUND_EXT_ID`, `SHIELD_OFFICER_EXT_ID`, `SIDEKICK_EXT_ID`) and
`packages/game-engine/src/setup/buildInitialGameState.ts`
(`SHIELD_AGENT_EXT_ID`, `SHIELD_TROOPER_EXT_ID`). All six are well-
known tabletop cards present in every Legendary match — they have
canonical printed names and (with the exception of Sidekick) live in
the `core` set's data, but in shapes that `buildCardDisplayData` does
not currently walk.

The arena-client `HandRow.vue:71–82` carries an explicit
`humanizeCardId(cardId)` fallback with a `// why:` comment that names
this exact gap and points at "a future engine WP will close the gap" —
this WP is that close. Two existing arena-client tests
(`HandRow.test.ts`) lock the current `<unknown>` shape as expected
input to the humanize fallback; both tests will need their fixture
expectations updated to the new engine-resolved names as part of this
WP's execution (the WP's allowlist includes `HandRow.test.ts` to keep
the test suite green; production `HandRow.vue` keeps its humanize
fallback as defense-in-depth for any future ext_id grammar this WP
doesn't yet cover).

---

## Goal

After this session, `G.cardDisplayData` contains a `UICardDisplay`
entry for every one of the six well-known generic ext_ids
(`pile-bystander`, `pile-wound`, `pile-shield-officer`, `pile-sidekick`,
`starting-shield-agent`, `starting-shield-trooper`). Cards in the
shared rescue-pile supply, the wound pile, the officer pile, the
sidekick pile, and each player's starting deck render with their
correct printed-card name and image in every UIState projection
(`handDisplay`, `discardTopCard`, `victoryCards`, and any future
projection of these zones). The `<unknown>` literal that the
production RevealOverlay popup currently surfaces for `pile-bystander`
captured-from-supply bystanders ending up in the victory pile (and for
`starting-shield-agent` / `starting-shield-trooper` cards in any
projection) disappears.

---

## Assumes

- WP-172 complete. Specifically:
  - `packages/game-engine/src/setup/buildCardDisplayData.ts` exports
    `buildCardDisplayData(registry, matchConfig, numPlayers)`; the
    structural `CardDisplayDataRegistryReader` interface is in place;
    the D-17201 tiered display resolution pattern + helpers
    (`findOtherEntryByCardType`, `findGenericBystanderEntry`,
    `findFirstBystanderEntry`, `findSchemeInSetForDisplay`) are
    available as local helpers in the same file.
  - The cross-builder superset invariant test
    (`'Object.keys(displayMap) ⊇ [...villainDeck.deck, ...villainDeck.discard]'`)
    is in place at `buildCardDisplayData.test.ts`; this WP adds a
    parallel **well-known coverage** test rather than extending the
    villain-deck superset test (different builder pair).
- WP-111 / EC-118 complete. Specifically:
  - `G.cardDisplayData: Readonly<Record<CardExtId, UICardDisplay>>` is
    populated at `Game.setup()` and consumed by `resolveDisplay` in
    `uiState.build.ts`.
  - `UNKNOWN_DISPLAY_PLACEHOLDER` lives at
    `packages/game-engine/src/ui/uiState.build.ts:73–78` (locked
    contract).
- The six well-known ext_id constants are at the locked paths:
  - `pilesInit.ts:22` `BYSTANDER_EXT_ID = 'pile-bystander'`
  - `pilesInit.ts:25` `WOUND_EXT_ID = 'pile-wound'`
  - `pilesInit.ts:28` `SHIELD_OFFICER_EXT_ID = 'pile-shield-officer'`
  - `pilesInit.ts:31` `SIDEKICK_EXT_ID = 'pile-sidekick'`
  - `buildInitialGameState.ts:74` `SHIELD_AGENT_EXT_ID = 'starting-shield-agent'`
  - `buildInitialGameState.ts:77` `SHIELD_TROOPER_EXT_ID = 'starting-shield-trooper'`
- Registry data shapes for the four tier-1 source paths are at the
  locked paths (verified 2026-05-23 against `data/cards/`):
  - `core.json bystanders[0]` — `{ slug: 'bystander', name: 'Bystander', imageUrl: 'https://images.legendary-arena.com/core/core-by-bystander.webp' }`
  - `core.json wounds[0]` — `{ slug: 'wound', name: 'Wound', imageUrl: 'https://images.legendary-arena.com/core/core-wd-wound.webp' }`
  - `core.json heroes[i]` where `slug === 'agent' | 'trooper' | 'officer'` — name verbatim from `cards[0].name` (`'S.H.I.E.L.D. Agent'` / `'S.H.I.E.L.D. Trooper'` / `'S.H.I.E.L.D. Officer'`); imageUrl from `physicalCards[0].imageUrl`
  - `ssw1.json other[0]` where `cardType === 'sidekick'` — `{ name: 'Sidekick', slug: 'sidekick', cardType: 'sidekick', imageUrl: 'https://images.legendary-arena.com/ssw1/ssw1-sk-sidekick.webp' }`
- `pnpm --filter @legendary-arena/game-engine build` exits 0 on
  baseline `origin/main @ 19871c9` (no uncommitted engine changes).
- `pnpm --filter @legendary-arena/game-engine test` exits 0 on
  baseline (773 / 0 fail per WP-172 closeout).
- `pnpm --filter @legendary-arena/arena-client test` exits 0 on
  baseline (the two `HandRow.test.ts` `<unknown>` regression-fixture
  expectations will need updating in this WP's allowlist; see §Scope).

If any of the above is false, this packet is **BLOCKED** and must not
proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` —
  confirms the engine setup-time registry-reader pattern (local
  structural interface, no `@legendary-arena/registry` import).
- `.claude/rules/architecture.md §Game Engine Layer (Gameplay
  Authority)` — confirms `Game.setup()` may throw but moves and
  setup-time builders must remain JSON-serializable and deterministic.
- `packages/game-engine/src/setup/buildCardDisplayData.ts` — read
  entirely. This packet **extends** the file by adding Section 8
  (Well-Known Generic Cards) AFTER the existing sections 5–7
  (Master Strikes / Scheme Twists / Villain-Deck Bystanders) ending
  at the new `return result;`. The D-17201 tiered-resolution pattern
  + helpers (`findOtherEntryByCardType`,
  `findGenericBystanderEntry`) are the precedent to mirror.
- `packages/game-engine/src/setup/pilesInit.ts` — read entirely.
  The four pile ext_id constants live at lines 22 / 25 / 28 / 31;
  this WP does **not modify this file** (well-known constants are
  locked).
- `packages/game-engine/src/setup/buildInitialGameState.ts` lines
  73–78 + 293–294 — the two starting-card ext_ids and the
  hard-coded `cardStats` entries for them; this WP fills the
  parallel `cardDisplayData` gap. Do **not** modify the
  `cardStats[SHIELD_AGENT_EXT_ID] = ...` / `cardStats[SHIELD_TROOPER_EXT_ID] = ...`
  lines.
- `packages/game-engine/src/ui/uiState.build.ts` lines 73–101 —
  `UNKNOWN_DISPLAY_PLACEHOLDER` and `resolveDisplay`; read-only.
  This WP fixes the upstream map so the placeholder is unhit for the
  six well-known ext_ids.
- `apps/arena-client/src/components/play/HandRow.vue:71–82` —
  the `humanizeCardId` fallback's `// why:` block names this exact
  gap and points at "a future engine WP". This WP closes it; the
  humanize fallback stays in place as defense-in-depth (not removed
  in this WP — keep client-side resilience for any future ext_id
  grammar the engine doesn't cover).
- `apps/arena-client/src/components/play/HandRow.test.ts` — two
  test cases lock the current `<unknown>` shape as expected input
  to the humanize fallback. This WP's allowlist includes
  `HandRow.test.ts`: update the fixture `display.name` values from
  `'<unknown>'` to the engine-resolved names (`'S.H.I.E.L.D. Agent'`
  / `'S.H.I.E.L.D. Trooper'`) so the assertions exercise the new
  tier-1 path instead of the humanize fallback. The humanize
  fallback test itself can stay (covers future unknown ext_ids).
- `data/cards/core.json` lines 1635–1714 (SHIELD Agent / Trooper /
  Officer hero entries) + lines 2530–2558 (Bystander + Wound
  arrays) — the tier-1 source data this WP reads. Verify the
  shapes before writing the helpers.
- `data/cards/ssw1.json` lines 2356–2362 — the Sidekick `other[]`
  entry (the only set carrying it); tier-1 source for
  `pile-sidekick`.
- `docs/ai/DECISIONS.md §D-17201` — the WP-172 tiered display
  resolution pattern this WP extends. The closely-related new
  decision D-17301 covers the six well-known ext_id resolutions.
- `docs/ai/REFERENCE/00.2-data-requirements.md` — canonical field
  names; `name` / `imageUrl` / `slug` / `cardType` references must
  match.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4 (no
  abbreviations), Rule 5 (functions fit on one screen), Rule 6
  (`// why:` on non-obvious code), Rule 7 (no `.reduce()` with
  branching), Rule 9 (`node:` prefix), Rule 13 (ESM only), Rule 14
  (field names match data contract).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*`
  only (setup-time builders use no randomness at all).
- Never throw inside boardgame.io move functions — return void on
  invalid input.
- Never persist `G`, `ctx`, or any runtime state — see
  ARCHITECTURE.md §Persistence Boundary.
- `G` must be JSON-serializable at all times — no class instances,
  Maps, Sets, or functions. `G.cardDisplayData` values are plain
  `UICardDisplay` objects (`{ extId, name, imageUrl, cost }`).
- ESM only, Node v22+ — all new files use `import`/`export`,
  never `require()`.
- `node:` prefix on all Node.js built-in imports (`node:test`,
  `node:assert`, etc.).
- Test files use `.test.ts` extension — never `.test.mjs`.
- No database or network access inside move functions or pure
  helpers.
- Full file contents for every new or modified file in the output —
  no diffs, no snippets.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.

**Packet-specific:**
- `buildCardDisplayData.ts` must not import
  `@legendary-arena/registry` — extend the existing local
  structural `CardDisplayDataRegistryReader` interface only (already
  in place from WP-111 / WP-172).
- `buildCardDisplayData.ts` must not import `boardgame.io` — pure
  helper.
- `pilesInit.ts` must not be modified — well-known constants are
  locked.
- `buildInitialGameState.ts` may NOT change the
  `cardStats[SHIELD_AGENT_EXT_ID] = ...` /
  `cardStats[SHIELD_TROOPER_EXT_ID] = ...` lines at 293–294 (locked
  cardStats entries from WP-111 / WP-018); the WP-173 fix is a
  parallel addition to `cardDisplayData`, not a change to
  `cardStats`.
- `uiState.build.ts` must not be modified —
  `UNKNOWN_DISPLAY_PLACEHOLDER` and `resolveDisplay` remain
  unchanged; this WP fixes the missing entries upstream so the
  placeholder is never hit for these six ext_ids.
- `HandRow.vue` must not be modified — the client-side
  `humanizeCardId` fallback stays in place as defense-in-depth for
  any future ext_id grammar this WP does not cover. Only
  `HandRow.test.ts` is updated (fixture-expectation refresh; the
  test assertions stay structurally the same).
- The six well-known ext_id literal strings used by Section 8 must
  be **byte-identical** to the constants exported by `pilesInit.ts`
  and `buildInitialGameState.ts`. **Implementation MUST inline the
  six literal strings** at the Section 8 emission site (with a
  `// why:` block naming the two source-of-truth constant locations
  and pointing at the drift-detection test). DO NOT import the
  constants into `buildCardDisplayData.ts` itself: `buildInitialGameState.ts`
  imports the `buildCardDisplayData` function, so a reverse value
  import from `buildInitialGameState.ts` would create a true ESM
  circular import path. ESM tolerates value-only cycles in lazy
  contexts, but the cycle is brittle and a layering smell.
  **Drift detection lives in the test:** `buildCardDisplayData.test.ts`
  imports the four constants from `pilesInit.ts` and the two from
  `buildInitialGameState.ts` (test file is a different module — no
  cycle) and asserts `result[CONSTANT]` is defined and shape-equal
  to the inlined Section 8 literal. Any future drift in either the
  constants or the inlined literals fails the test.
- Tiered display resolution per D-17301 (proposed). Each of the
  six ext_ids has a specific tier-1 source path; tier-2 is the
  literal printed-card-name fallback with `imageUrl: ''`:
  - `pile-bystander` → tier-1 `core.bystanders[0]` (`slug-match
    'bystander'`); tier-2 `{ name: 'Bystander', imageUrl: '' }`.
  - `pile-wound` → tier-1 `core.wounds[0]` (`slug-match 'wound'`);
    tier-2 `{ name: 'Wound', imageUrl: '' }`.
  - `pile-shield-officer` → tier-1
    `core.heroes[*]` where `slug === 'officer'`, read `cards[0].name`
    + `physicalCards[0].imageUrl`; tier-2
    `{ name: 'S.H.I.E.L.D. Officer', imageUrl: '' }`.
  - `pile-sidekick` → tier-1
    `ssw1.other[*]` where `cardType === 'sidekick'`; tier-2
    `{ name: 'Sidekick', imageUrl: '' }`.
  - `starting-shield-agent` → tier-1 `core.heroes[*]` where
    `slug === 'agent'`, read as above; tier-2
    `{ name: 'S.H.I.E.L.D. Agent', imageUrl: '' }`.
  - `starting-shield-trooper` → tier-1 `core.heroes[*]` where
    `slug === 'trooper'`, read as above; tier-2
    `{ name: 'S.H.I.E.L.D. Trooper', imageUrl: '' }`.
- **No-shadow contract:** the six well-known ext_ids are
  prefix-disjoint from every prior section's output (sections 1–2
  emit `{setAbbr}-{cardType}-...`; section 3 emits
  `henchman-{slug}-NN`; section 4 emits the qualified mastermind
  base-card key; sections 5–7 emit `master-strike-`,
  `scheme-twist-`, `bystander-villain-deck-` prefixes). Section 8
  emissions are **authoritative** for the six `pile-*` /
  `starting-shield-*` keys. If a future WP introduces a card type
  whose ext_id grammar collides with any of these six, that WP must
  explicitly resolve precedence in its own scope; this WP locks
  Section 8 as the sole legitimate writer for the six keys. The
  Well-Known Coverage Invariant test (§Scope B) doubles as the
  no-shadow guard: it asserts each of the six entries' `name` field
  matches one of the six locked literals (tier-1 registry-resolved
  OR tier-2 literal) — any accidental shadow from a prior section
  would emit a different `name` value and fail.
- All six new entry types carry `cost: null` (no printed cost on
  the physical token / starter cards). The shape and the
  `cost: null` decision are locked. Rationale: SHIELD Agent
  (recruit 1) and SHIELD Trooper (attack 1) are starter cards that
  have no recruit cost (they cost 0 to play); SHIELD Officer
  (recruit cost 3) IS purchasable from the supply but its display
  cost is read from a different surface (the supply pile UI shows
  the cost separately) — the WP-111 `UICardDisplay.cost` field is
  the "printed cost" not the "fight cost", so even for SHIELD
  Officer the answer is `cost: null` here (Officer's cost lives in
  `G.cardStats[SHIELD_OFFICER_EXT_ID]` which is separate). All
  pile tokens (Bystander, Wound, Sidekick) similarly have no
  printed cost. **Defensive verification:** the EC's
  cross-reference test asserts every new entry's cost is `null`.
- Defensive registry reads — `setData.heroes`, `setData.bystanders`,
  `setData.wounds`, `setData.other` are typed `unknown[]` (or in
  the case of `heroes`, structurally walked through the existing
  hero-resolution helpers; not all sets have all arrays populated).
  Every iteration MUST gate with
  `typeof entry === 'object' && entry !== null` first, then read
  `slug` / `cardType` / `name` / `imageUrl` with
  `typeof === 'string'` guards. Soft-skip on parse / lookup
  failure (mirrors the WP-172 section-5 / section-6 / section-7
  defensive-read pattern). Only `Game.setup()` may throw.
- New helpers (one per source-shape: hero-slug + physicalCard,
  bystanders-slug, wounds-slug) added as private functions in
  `buildCardDisplayData.ts`. Do NOT extract these helpers into a
  separate file (Rule §16.1: two-call-site duplication is OK).
- **Section 8 is a terminal augmentation pass** — placed after
  sections 5–7 and immediately before the final `return result;`.
  Sections 5–7 (villain-deck composition) read scheme + mastermind
  data; Section 8 reads only the canonical generic-card data and
  has no shared state with prior sections. The placement order is
  semantic, not runtime-dependent: Section 8 is the last logical
  pass because it covers cards that aren't part of any
  match-configuration-driven composition. Future refactors must
  preserve "Section 8 last" — re-ordering would silently change
  the section's role from "always-applied augmentation" to "one of
  many builder steps", which would invite mis-classification.
- Required `// why:` comments at each of the six tier-1 + tier-2
  resolution sites and at the new helpers (see §Scope).

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and
  ask the human before proceeding — never guess or invent field
  names, type shapes, or file paths.

**Locked contract values (do not paraphrase or re-derive):**

- **`UICardDisplay` shape**
  (`packages/game-engine/src/ui/uiState.types.ts`):
  `{ extId: string; name: string; imageUrl: string; cost: number | null }`
- **`UNKNOWN_DISPLAY_PLACEHOLDER` literal name field**
  (`uiState.build.ts:75`): `'<unknown>'` (the symptom string; this
  WP exists to keep the placeholder unhit for these six ext_ids).
- **Six well-known ext_id constants** (do not re-type):
  - `BYSTANDER_EXT_ID = 'pile-bystander'` (`pilesInit.ts:22`)
  - `WOUND_EXT_ID = 'pile-wound'` (`pilesInit.ts:25`)
  - `SHIELD_OFFICER_EXT_ID = 'pile-shield-officer'` (`pilesInit.ts:28`)
  - `SIDEKICK_EXT_ID = 'pile-sidekick'` (`pilesInit.ts:31`)
  - `SHIELD_AGENT_EXT_ID = 'starting-shield-agent'` (`buildInitialGameState.ts:74`)
  - `SHIELD_TROOPER_EXT_ID = 'starting-shield-trooper'` (`buildInitialGameState.ts:77`)
- **Six tier-2 literal display payloads** (printed-card names —
  match the physical Legendary cards verbatim; periods in the
  S.H.I.E.L.D. acronym match the printed art):
  - `pile-bystander` → `{ name: 'Bystander', imageUrl: '' }`
  - `pile-wound` → `{ name: 'Wound', imageUrl: '' }`
  - `pile-shield-officer` → `{ name: 'S.H.I.E.L.D. Officer', imageUrl: '' }`
  - `pile-sidekick` → `{ name: 'Sidekick', imageUrl: '' }`
  - `starting-shield-agent` → `{ name: 'S.H.I.E.L.D. Agent', imageUrl: '' }`
  - `starting-shield-trooper` → `{ name: 'S.H.I.E.L.D. Trooper', imageUrl: '' }`
- **`SHIELD set abbreviation` for Sidekick tier-1 lookup:** `'ssw1'`
  (the only set carrying `cardType === 'sidekick'` in `other[]` as
  of 2026-05-23). Inlined verbatim; do NOT add a "scan all sets"
  loop (Rule §16.1 — single call site). **Future-proofing:** if a
  later set introduces a second `cardType === 'sidekick'` entry,
  this WP's single-set lookup is intentional; a future WP must
  explicitly broaden the scope (e.g. to a tiered cross-set fallback
  mirroring the D-17201 `core`-set pattern for Master Strike +
  Scheme Twist). Do not silently widen this lookup.
- **Core set abbreviation:** `'core'` (the tier-1 source for the
  other five ext_ids).

---

## Debuggability & Diagnostics

All behavior introduced by this packet must be debuggable via
deterministic reproduction and state inspection. Logging,
breakpoints, or "printf debugging" are not acceptable debugging
strategies.

The following requirements are mandatory:

- Behavior introduced by this packet must be fully reproducible
  given identical registry data (`data/cards/core.json` +
  `data/cards/ssw1.json` at a given commit).
- Execution must be externally observable via deterministic state
  changes: `G.cardDisplayData[extId]` is defined for every one of
  the six well-known ext_ids after `Game.setup()` returns.
- This packet must not introduce any state mutation that cannot be
  inspected post-execution or validated via tests.
- The following invariants must always hold after `Game.setup()`:
  - `G` remains JSON-serializable.
  - **Well-Known Coverage Invariant (D-17301):** for every ext_id
    in the locked six-element set `[BYSTANDER_EXT_ID,
    WOUND_EXT_ID, SHIELD_OFFICER_EXT_ID, SIDEKICK_EXT_ID,
    SHIELD_AGENT_EXT_ID, SHIELD_TROOPER_EXT_ID]`,
    `G.cardDisplayData[extId]` is defined with a `UICardDisplay`
    whose `name` is non-empty (tier-1 registry-resolved OR tier-2
    literal — both produce non-empty names).
- Failures attributable to this packet must be localizable via
  violation of the above coverage invariant — the new contract
  test in §Scope C asserts it directly.

---

## Scope (In)

### A) Section 8 — Well-Known Generic Cards (new)

- **`packages/game-engine/src/setup/buildCardDisplayData.ts`** —
  modified:
  - Add a new section **after** the existing section 7 (Villain-
    Deck Bystanders) and **before** the final `return result;`. The
    section iterates the locked six-element set (one entry per
    ext_id) and emits `result[extId] = { extId, name, imageUrl,
    cost: null }` using the per-ext_id tier-1 resolution path
    (with tier-2 literal fallback).
  - Inline the six ext_id literal strings at the Section 8 emission
    site with a `// why:` block naming the two source-of-truth
    constant locations (`pilesInit.ts:22/25/28/31`,
    `buildInitialGameState.ts:74/77`) and pointing at the
    drift-detection test in `buildCardDisplayData.test.ts`. Do NOT
    import the constants into `buildCardDisplayData.ts` — see
    §Non-Negotiable Constraints for the circular-import rationale.
    The test file imports the actual constants for drift detection
    (different module, no cycle).
  - Soft-skip when the source set is not loaded (e.g., `core` set
    missing for a narrow test mock; `ssw1` set missing for matches
    that don't load it). The tier-2 literal fallback fires.
  - Mirror the WP-172 D-17201 defensive-read pattern verbatim:
    `typeof entry === 'object' && entry !== null` gate, then
    `typeof === 'string'` field guards. Per-entry fresh object
    literals — no aliasing across keys.
  - Required `// why:` comments at:
    - The section header naming D-17301 + the WP-172 / D-17201
      precedent it extends. Must include the verbatim phrase
      "terminal augmentation pass — ensures well-known ext_ids
      always resolve" to lock the placement semantic.
    - The Sidekick `'ssw1'` hardcoded set lookup explaining why
      this is single-set rather than cross-set (only set carrying
      the entry as of 2026-05-23; Rule §16.1; future-proofing note
      per §Non-Negotiable Constraints).
    - The `cost: null` decision for SHIELD Officer. Must include
      the verbatim phrase "printed-cost surface only; gameplay
      cost resolved elsewhere" referencing
      `G.cardStats[SHIELD_OFFICER_EXT_ID]`.
    - The six inlined ext_id literal strings (single `// why:`
      block above the Section 8 emission site): name both
      source-of-truth constant locations
      (`pilesInit.ts:22/25/28/31`,
      `buildInitialGameState.ts:74/77`), the circular-import
      rationale (don't import — function consumer is the
      orchestrator), and the test-side drift-detection contract.
    - Each new helper function: must include the verbatim phrase
      "defensive read of registry data (unknown shape per
      ARCHITECTURE.md)" naming the source-data shape.

- **`packages/game-engine/src/setup/buildCardDisplayData.ts`** —
  modified (helper additions, at the end of the helpers block
  alongside the WP-172 helpers):
  - `findHeroByExactSlug(setData: unknown, heroSlug: string)` —
    defensively walks `setData.heroes[]` for a hero whose `slug`
    matches exactly; returns `{ name: string; imageUrl: string }`
    (name from `cards[0].name`; imageUrl from
    `physicalCards[0].imageUrl`) or `null` on miss.
  - `findBystanderArrayEntry(setData: unknown, targetSlug:
    string)` — defensively walks `setData.bystanders[]` for an
    entry whose `slug` matches exactly; returns `{ name: string;
    imageUrl: string }` or `null`. **Distinct from the WP-172
    `findGenericBystanderEntry` helper** because that one is
    hard-coded to `slug === 'bystander'`; this one is parameterized
    on the slug so it can resolve `'bystander'` for `pile-
    bystander` (the same literal, but kept parameterized as a
    forward-compatibility seam; do NOT consolidate with the WP-
    172 helper — Rule §16.1 forbids 2-call-site abstraction across
    sections).
  - `findWoundArrayEntry(setData: unknown)` — defensively walks
    `setData.wounds[]` for the first well-formed entry where
    `slug === 'wound'`; returns `{ name: string; imageUrl: string }`
    or `null`. Single call site; inlined-then-extracted (single
    helper, single caller).

### B) Tests

- **`packages/game-engine/src/setup/buildCardDisplayData.test.ts`**
  — modified:
  - Extend `buildFixtureRegistry()` to add:
    - `core` set: `bystanders: [{ slug: 'bystander', name: 'Bystander',
      imageUrl: 'core-by.webp' }]`, `wounds: [{ slug: 'wound', name:
      'Wound', imageUrl: 'core-wd.webp' }]`, and three `heroes` entries
      for `slug === 'agent' | 'trooper' | 'officer'` each with one
      `cards` entry carrying the canonical name and one `physicalCards`
      entry carrying a verifiable `imageUrl` + `sides: [slug]`.
    - `ssw1` set: `other: [{ cardType: 'sidekick', slug: 'sidekick',
      name: 'Sidekick', imageUrl: 'ssw1-sk.webp' }]`. Plus the
      minimum fields needed to satisfy `MockSetData` (empty heroes /
      villains / henchmen / masterminds / schemes / bystanders /
      wounds; existing `other` extended only with the sidekick entry).
    - Widen `MockSetData` to add `wounds?: unknown[]`; the existing
      `bystanders?` / `other?` from WP-172 already cover the rest.
    - Widen `getSet` to return the ssw1 mock when queried for
      `'ssw1'`.
  - Add tests (one describe block — `'WP-173 well-known ext_id
    coverage'`):
    - **Bystander tier-1:** `pile-bystander` resolves to
      `{ name: 'Bystander', imageUrl: 'core-by.webp', cost: null }`.
    - **Wound tier-1:** `pile-wound` resolves to
      `{ name: 'Wound', imageUrl: 'core-wd.webp', cost: null }`.
    - **SHIELD Officer tier-1:** `pile-shield-officer` resolves to
      `{ name: 'S.H.I.E.L.D. Officer', imageUrl: 'core-officer.webp',
      cost: null }` (verbatim period-separated S.H.I.E.L.D. acronym).
    - **SHIELD Agent tier-1:** `starting-shield-agent` resolves to
      `{ name: 'S.H.I.E.L.D. Agent', imageUrl: 'core-agent.webp',
      cost: null }`.
    - **SHIELD Trooper tier-1:** `starting-shield-trooper` resolves
      to `{ name: 'S.H.I.E.L.D. Trooper', imageUrl: 'core-trooper.webp',
      cost: null }`.
    - **Sidekick tier-1:** `pile-sidekick` resolves to
      `{ name: 'Sidekick', imageUrl: 'ssw1-sk.webp', cost: null }`.
    - **Tier-2 fallback (core unloaded):** when `getSet('core')`
      returns `undefined`, each of the five core-sourced ext_ids
      falls back to the literal `{ name: '<printed-name>', imageUrl:
      '' }`; `cost: null` preserved.
    - **Tier-2 fallback (ssw1 unloaded):** when `getSet('ssw1')`
      returns `undefined`, `pile-sidekick` falls back to
      `{ name: 'Sidekick', imageUrl: '' }`.
    - **No aliasing across the six entries:** mutating
      `result[BYSTANDER_EXT_ID].name = 'Mutated'` does not change
      `result[WOUND_EXT_ID].name`.
    - **Well-Known Coverage Invariant (the load-bearing test):**
      for the locked six-element ext_id set, every entry is defined
      in `result` AND has a non-empty `name` field (regardless of
      tier-1 hit or tier-2 fallback). This is the direct assertion
      of D-17301; mirrors the WP-172 cross-builder superset
      invariant pattern (different builder pair: the
      `pilesInit` + `buildInitialGameState` constants vs the
      `buildCardDisplayData` output).
    - **Defensive parsing on `core.heroes[]`:** when
      `core.heroes[]` carries malformed entries (`null`,
      primitive, missing `cards` / `physicalCards`), the helpers
      silently skip and the affected ext_id falls back to tier-2
      literal.
    - **Partial-malformed (object present, field wrong type):**
      when a hero entry exists with the correct `slug` but
      `physicalCards[0].imageUrl` is a number (or
      `cards[0].name` is `null`), the helper rejects the entry
      via its `typeof === 'string'` field guards and the affected
      ext_id falls back to tier-2 literal. Distinct from the
      missing-key case; closes the silent-data-corruption surface.
    - **Constants drift detection:** imports the six ext_id
      constants from `pilesInit.ts` (4) + `buildInitialGameState.ts`
      (2) and asserts `result[CONSTANT]` is defined and matches
      the inlined Section 8 literal for each — fails if either
      side drifts.
  - All tests use `node:test` and `node:assert/strict`; no
    `boardgame.io` import; no network; no DB.

- **`apps/arena-client/src/components/play/HandRow.test.ts`** —
  modified:
  - Two existing fixtures at lines 38-39 (or wherever the
    `<unknown>` literal is asserted) lock the current `<unknown>`
    shape as expected input to `humanizeCardId`. Update the
    fixtures to the engine-resolved names
    (`'S.H.I.E.L.D. Agent'` / `'S.H.I.E.L.D. Trooper'`) so the
    assertions exercise the new tier-1 path. The humanize-fallback
    test itself (assertion that an unknown extId gets humanized)
    can stay; that test exercises the defense-in-depth path with a
    synthesized unknown ext_id, not one of the six fixed-by-this-WP
    ones.
  - No other arena-client changes; `HandRow.vue` is byte-identical
    pre- and post-execution.
  - **Audit framing:** the `HandRow.test.ts` change is a fixture
    refresh consequent to the engine output shape change, not a
    UI behavior change. `HandRow.vue` rendering, props, methods,
    and emit signatures are unchanged. A reviewer auditing the
    diff should expect the client-side change to be exactly two
    string literal replacements in test fixtures and zero changes
    elsewhere in the arena-client tree.

### C) Acceptance + Verification

- See §Acceptance Criteria + §Verification Steps below.

---

## Out of Scope

- **`packages/game-engine/src/setup/pilesInit.ts` modifications** —
  well-known constants are locked; this WP only registers display
  data for the existing ext_ids.
- **`packages/game-engine/src/setup/buildInitialGameState.ts`
  modifications** — the SHIELD_AGENT/TROOPER constants and the
  `cardStats[...] = ...` hard-coded entries stay unchanged. The
  WP-173 fix is purely additive to `buildCardDisplayData`.
- **`packages/game-engine/src/ui/uiState.build.ts` modifications**
  — `UNKNOWN_DISPLAY_PLACEHOLDER` and `resolveDisplay` are
  unchanged. This WP eliminates placeholder-hit cases by
  populating the upstream map; it does not change how the
  placeholder is shaped, formatted, or rendered.
- **`apps/arena-client/src/components/play/HandRow.vue`
  modifications** — the `humanizeCardId(cardId)` fallback stays in
  place as client-side defense-in-depth for any future ext_id
  grammar the engine doesn't cover. Only `HandRow.test.ts` is
  updated (fixture-expectation refresh).
- **Other arena-client / registry-viewer components** —
  HandRow.vue is the only client surface with an explicit
  humanize-fallback `// why:` block pointing at this gap. Other
  components (RevealOverlay, victory-pile rendering, etc.) consume
  whatever `display.name` the engine provides; populating the
  upstream map is sufficient.
- **`@legendary-arena/registry` runtime import** in the engine —
  still forbidden; this WP extends the local structural
  `CardDisplayDataRegistryReader` interface only.
- **`UICardDisplay` shape changes** — the four-field record
  (`extId`, `name`, `imageUrl`, `cost`) is unchanged. No new
  fields added, none removed.
- **`G.cardStats` parity for the well-known ext_ids** — the
  SHIELD Agent / Trooper `cardStats` entries at
  `buildInitialGameState.ts:293-294` remain hard-coded; this WP
  does not touch the gameplay-stats surface. The display-data
  fix is orthogonal.
- **Cross-builder superset extension to villain-deck superset
  test** — different builder pair; this WP adds a parallel
  "Well-Known Coverage" test rather than extending the existing
  villain-deck one. Both tests must pass.
- **Registry data backfill** — the six ext_ids resolve to data
  already present in `core.json` / `ssw1.json`; no registry data
  changes. If a future WP introduces a generic "well-known
  cards" `other[]` section in `core.json` (e.g., for
  `cardType === 'shield-agent'` / etc.), this WP's helpers stay
  unchanged (the lookup paths are scoped per-ext_id, not via
  `other[]`).
- **Card-image hyphenation / URL formatting** — image URLs are
  passed through verbatim from registry data, consistent with the
  existing WP-172 sections.
- **WOUND_EXT_ID in player zones** — wounds attach to player
  decks via existing engine flows (wounds from villain escapes,
  master-strike effects, etc.); the projection-time
  `resolveDisplay` lookup will now hit a real entry for
  `pile-wound` instead of `<unknown>`. No engine-flow changes
  here.
- **Refactors, cleanups, or "while I'm here" improvements** are
  **out of scope** unless explicitly listed in Scope (In) above.
  In particular: no consolidation of `findGenericBystanderEntry`
  (WP-172) and `findBystanderArrayEntry` (WP-173) — Rule §16.1
  forbids 2-call-site abstraction; both helpers stay distinct.

---

## Files Expected to Change

- `packages/game-engine/src/setup/buildCardDisplayData.ts` —
  **modified** — add Section 8 (Well-Known Generic Cards) +
  three new defensive-read helpers
  (`findHeroByExactSlug`,
  `findBystanderArrayEntry`,
  `findWoundArrayEntry`).
- `packages/game-engine/src/setup/buildCardDisplayData.test.ts` —
  **modified** — extend fixture registry; add tests for tier-1 /
  tier-2 / aliasing / well-known coverage invariant / defensive
  parsing.
- `apps/arena-client/src/components/play/HandRow.test.ts` —
  **modified** — fixture-expectation refresh for the two
  `<unknown>` literals (`starting-shield-agent` /
  `starting-shield-trooper`) to the engine-resolved names
  (`'S.H.I.E.L.D. Agent'` / `'S.H.I.E.L.D. Trooper'`).
- `docs/ai/STATUS.md` — **modified** — record that the
  `<unknown>` placeholder is no longer hit for the six
  well-known ext_ids.
- `docs/ai/DECISIONS.md` — **modified** — append `D-17301`
  (tiered display resolution for the six well-known generic
  ext_ids; mirrors D-17201 pattern).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — append
  WP-173 entry with done status + commit hash on close.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** —
  append EC-191 entry.

No other files may be modified. (7 files total — at the §00.3 §5
~8-file cap; no split needed.)

---

## Vision Alignment

This WP touches **§17.1 trigger:** *"Card data, card images, or
content semantics (Vision §1, §2, §10)."* It is a card-display
faithfulness fix for the well-known generic game-component cards.

**Vision clauses touched:** §1 (tabletop faithfulness — card names
and art match the printed Legendary cards, including the
period-separated S.H.I.E.L.D. acronym), §10 (registry is the
authoritative data source where data exists; the engine reads it
once at setup and never at runtime).

**Conflict assertion:** No conflict. The six tier-2 literal
fallbacks (`'Bystander'` / `'Wound'` / `'S.H.I.E.L.D. Officer'` /
`'Sidekick'` / `'S.H.I.E.L.D. Agent'` / `'S.H.I.E.L.D. Trooper'`)
are the printed card names verbatim — they are not engine
inventions but transcriptions of physical cards every Legendary
match uses. Tier-1 reads from the registry where data exists;
tier-2 covers the registry-data-missing case with the verbatim
printed name as the least-bad UX.

**Non-Goal proximity check:** None of NG-1..7 are crossed. No
monetization, no persuasive copy, no competitive-balance change.
Display-only correctness fix.

**Determinism preservation:** `buildCardDisplayData` remains a
setup-time pure function. It uses no `ctx.random.*`. Given
identical registry data, the function returns byte-identical
output. Replay-faithful by construction (Vision §22).

---

## Funding Surface Gate

**§20 N/A** — engine setup-layer change in
`packages/game-engine/src/setup/**`; no UI surfaces touched
beyond a test-fixture refresh (no `<template>` / `<script>` /
`<style>` SFC change), no user-visible funding copy, no funding
channels referenced.

---

## API Catalog Update

**§21 N/A** — no `apps/server/src/**` change; no HTTP endpoints
added, modified, removed, or status-flipped; no `Library-only`
server library functions added or modified.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### Tier-1 resolution (registry hit)
- [ ] `result['pile-bystander']` reads `name` from
  `core.bystanders[0].name` and `imageUrl` from
  `core.bystanders[0].imageUrl` when `core.bystanders[]` carries
  a `slug === 'bystander'` entry.
- [ ] `result['pile-wound']` reads `name` from
  `core.wounds[0].name` and `imageUrl` from
  `core.wounds[0].imageUrl` when `core.wounds[]` carries a
  `slug === 'wound'` entry.
- [ ] `result['pile-shield-officer']` reads `name` from
  `core.heroes[i].cards[0].name` and `imageUrl` from
  `core.heroes[i].physicalCards[0].imageUrl` where
  `core.heroes[i].slug === 'officer'`.
- [ ] `result['pile-sidekick']` reads `name` and `imageUrl`
  from `ssw1.other[i]` where `cardType === 'sidekick'`.
- [ ] `result['starting-shield-agent']` reads via the
  `core.heroes` `slug === 'agent'` path.
- [ ] `result['starting-shield-trooper']` reads via the
  `core.heroes` `slug === 'trooper'` path.

### Tier-2 fallback (literal)
- [ ] When `getSet('core')` returns `undefined`, the five
  core-sourced ext_ids each carry the literal printed-card name
  with `imageUrl: ''`.
- [ ] When `getSet('ssw1')` returns `undefined`,
  `pile-sidekick` carries `{ name: 'Sidekick', imageUrl: '' }`.

### Locked shape
- [ ] Every one of the six entries carries `cost: null`.
- [ ] Every one of the six entries' `extId` field matches its
  map key byte-for-byte (the literal constants from
  `pilesInit.ts` / `buildInitialGameState.ts`).
- [ ] No aliasing across entries (mutating one's `name` does
  not change another's).

### Well-Known Coverage Invariant (D-17301)
- [ ] For the locked six-element ext_id set, every entry is
  defined in `result` AND has a non-empty `name` field (the
  load-bearing test).
- [ ] The S.H.I.E.L.D. period-separated acronym is preserved
  verbatim in both tier-1 (when registry carries it) and tier-2
  (literal fallback): `'S.H.I.E.L.D. Officer'`,
  `'S.H.I.E.L.D. Agent'`, `'S.H.I.E.L.D. Trooper'`.

### Defensive parsing
- [ ] Malformed `core.heroes[]` entries (`null`, primitive,
  missing `cards` / `physicalCards`) are silently skipped; the
  affected ext_id falls back to tier-2 literal.
- [ ] Partial-malformed entries (object with correct `slug` but
  wrong-type fields such as `physicalCards[0].imageUrl` as a
  number or `cards[0].name` as `null`) are rejected by the
  helper's `typeof === 'string'` field guards; the affected
  ext_id falls back to tier-2 literal.

### No-shadow contract + ordering
- [ ] Section 8 is placed AFTER sections 5–7 and IMMEDIATELY
  BEFORE the final `return result;` in `buildCardDisplayData`.
- [ ] No-shadow contract is asserted indirectly via the Well-Known
  Coverage Invariant test (each of the six entries' `name` field
  matches one of the six locked literals — any accidental shadow
  from a prior section would emit a different `name` and fail).

### Constants drift detection
- [ ] `buildCardDisplayData.ts` does NOT import any of the six
  well-known ext_id constants (preserves the
  setup-orchestrator-vs-setup-helper layering; avoids the
  circular import that would form against `buildInitialGameState`).
- [ ] `buildCardDisplayData.test.ts` imports the four pile
  constants from `pilesInit.ts` and the two starting-card
  constants from `buildInitialGameState.ts`; the drift-detection
  test asserts `result[CONSTANT]` is defined and equals the
  inlined Section 8 literal for each.

### Scope enforcement
- [ ] `pilesInit.ts` was NOT modified.
- [ ] `buildInitialGameState.ts` was NOT modified.
- [ ] `uiState.build.ts` was NOT modified.
- [ ] `HandRow.vue` was NOT modified.
- [ ] No `@legendary-arena/registry` import added to
  `buildCardDisplayData.ts`.
- [ ] No `boardgame.io` import added to
  `buildCardDisplayData.ts`.
- [ ] No files outside `## Files Expected to Change` were
  modified (`git diff --name-only` lists exactly the 7 files).

### Tests
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits
  0 (baseline 773 + new tests; 0 failing).
- [ ] `pnpm --filter @legendary-arena/game-engine build`
  exits 0.
- [ ] `pnpm --filter @legendary-arena/arena-client test`
  exits 0 (HandRow fixture refresh keeps the suite green).
- [ ] `pnpm -r build` exits 0.

---

## Verification Steps

```pwsh
# Step 1 — build all packages
pnpm -r build
# Expected: exits 0, no TypeScript errors anywhere in the monorepo

# Step 2 — run engine tests
pnpm --filter @legendary-arena/game-engine test
# Expected: TAP output — baseline 773 + new WP-173 tests; 0 failing.

# Step 3 — run arena-client tests
pnpm --filter @legendary-arena/arena-client test
# Expected: TAP output — baseline preserved; the two HandRow.test.ts
# fixtures now exercise tier-1 (S.H.I.E.L.D. Agent / Trooper) instead
# of the humanize-fallback path. The humanize-fallback regression
# guard test (synthesized unknown extId) still passes.

# Step 4 — confirm no @legendary-arena/registry import added
Select-String -Path "packages\game-engine\src\setup\buildCardDisplayData.ts" -Pattern "@legendary-arena/registry"
# Expected: no output

# Step 5 — confirm no boardgame.io import added
Select-String -Path "packages\game-engine\src\setup\buildCardDisplayData.ts" -Pattern "boardgame.io"
# Expected: no output

# Step 6 — confirm the six well-known ext_id constants appear in test
Select-String -Path "packages\game-engine\src\setup\buildCardDisplayData.test.ts" -Pattern "pile-bystander|pile-wound|pile-shield-officer|pile-sidekick|starting-shield-agent|starting-shield-trooper"
# Expected: at least 6 matching lines (one per ext_id)

# Step 7 — confirm scope-boundary
git diff --name-only
# Expected: only the seven files listed in ## Files Expected to Change
```

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass.
- [ ] `pnpm -r build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0.
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0.
- [ ] No `@legendary-arena/registry` import in
  `buildCardDisplayData.ts` (confirmed via `Select-String`).
- [ ] No `boardgame.io` import in `buildCardDisplayData.ts`
  (confirmed via `Select-String`).
- [ ] `pilesInit.ts` / `buildInitialGameState.ts` /
  `uiState.build.ts` / `HandRow.vue` byte-identical pre- and
  post-execution (confirmed via `git diff`).
- [ ] No files outside `## Files Expected to Change` were
  modified (confirmed via `git diff --name-only`).
- [ ] `docs/ai/STATUS.md` updated — note that the `<unknown>`
  placeholder no longer surfaces for the six well-known ext_ids.
- [ ] `docs/ai/DECISIONS.md` updated — append `D-17301`
  (tiered display resolution for the six well-known generic
  ext_ids; reference the WP-172 D-17201 precedent and the
  per-ext_id source path for each).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-173 checked
  off with today's date and commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` has EC-191
  entry appended.

---

## Lint Gate Self-Review

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Required WP sections present | ✅ | All ten present and non-empty |
| 2 | `## Out of Scope` non-empty with ≥ 2 deliberately-excluded items | ✅ | 11 items including the four locked-file no-touch entries, scope of `HandRow.vue` vs `.test.ts`, no helper consolidation across WPs |
| 3 | Non-Negotiable Constraints contain engine-wide + packet-specific + session protocol + locked contract values | ✅ | All four blocks present |
| 4 | Constraints cite `00.6-code-style.md` | ✅ | Engine-wide block names "Human-style code per docs/ai/REFERENCE/00.6-code-style.md" |
| 5 | No partial output permitted | ✅ | "Full file contents for every new or modified file in the output — no diffs, no snippets." in engine-wide block |
| 6 | `## Assumes` lists every prior WP + file dependency with required shape | ✅ | WP-172 / WP-111 EC-118 listed; six ext_id constant locations cited; four tier-1 source data paths cited with verified field shapes |
| 7 | `## Context (Read First)` is specific | ✅ | 10 read targets with section / line citations |
| 8 | Touches data shapes? cites `00.2-data-requirements.md` | ✅ | Named in §Context |
| 9 | `## Files Expected to Change` is an allowlist; ≤ ~8 files | ✅ | 7 files (1 modified src + 1 modified engine test + 1 modified client test + 4 governance) — at the cap |
| 10 | No ambiguous "update / modify / show diff" language | ✅ | Every file entry uses "**modified**" with the change described; full-file requirement in §Non-Negotiable Constraints |
| 11 | Naming consistency with 00.2 and prior WPs | ✅ | `extId`, `name`, `imageUrl`, `cost`, `slug`, `cardType`, all match `00.2-data-requirements.md` |
| 12 | No new npm dependency | ✅ | No package.json change |
| 13 | Forbidden packages explicitly excluded | ✅ | No boardgame.io test imports; no fetch/network; no DB |
| 14 | Architectural boundaries respected | ✅ | game-engine setup only; no registry runtime import (extends local structural `CardDisplayDataRegistryReader`); no boardgame.io import; `pilesInit.ts` / `buildInitialGameState.ts` / `uiState.build.ts` / `HandRow.vue` locked |
| 15 | Windows / PowerShell-safe commands | ✅ | Verification uses `pnpm` + `Select-String` + `git diff`; no `bash` / `grep` / `~/.config` |
| 16 | Env vars documented | N/A | No env var touched |
| 17 | Auth model committed | N/A | No auth surface touched |
| 18 | Tests use `node:test` only; no boardgame.io / network / DB | ✅ | Existing harness preserved |
| 19 | Verification Steps are exact (commands + expected output) | ✅ | 7 steps, each with explicit "Expected:" line |
| 20 | Acceptance Criteria are binary + observable + specific | ✅ | 25+ items grouped into 6 sections (Tier-1 / Tier-2 / Locked shape / Coverage invariant / Defensive parsing / Scope enforcement / Tests) |
| 21 | Definition of Done includes STATUS.md + DECISIONS.md + WORK_INDEX.md + scope-boundary check | ✅ | All four explicit; D-17301 append flagged; scope-boundary checked via `git diff --name-only` |
| 22 | No premature abstraction (≥ 3 uses) | ✅ | Explicitly forbids consolidating `findGenericBystanderEntry` (WP-172) and `findBystanderArrayEntry` (WP-173) — Rule §16.1 cited inline |
| 23 | No nested ternaries / complex `reduce` / dynamic known-key access | ✅ | Explicit "no `.reduce()` with branching" in §Non-Negotiable Constraints |
| 24 | Descriptive names | ✅ | `findHeroByExactSlug`, `findBystanderArrayEntry`, `findWoundArrayEntry` — full English |
| 25 | Functions ≤ 30 lines with JSDoc | ✅ | Each new helper is short and independent; JSDoc on every new function |
| 26 | `// why:` on non-obvious code | ✅ | EC §Required Comments locks 4 sites with the rationale each must cite (D-17301 section header, ssw1 hardcoded set lookup, SHIELD Officer cost: null, each helper) |
| 27 | No `import *` / barrel re-exports | ✅ | Named imports only |
| 28 | Error messages full sentences | N/A | No `throw new Error(...)` in this WP (setup-time builders soft-skip; only `Game.setup()` may throw) |
| 29 | §17 Vision Alignment present | ✅ | Present — touches §17.1 trigger "Card data, card images, or content semantics" |
| 30 | §17 cites clause numbers | ✅ | Cites §1 (tabletop faithfulness), §10 (registry authority), §22 (determinism) |
| 31 | Vision conflict declared | ✅ | "No conflict. The six tier-2 literal fallbacks are the printed card names verbatim..." |
| 32 | Determinism preservation line | ✅ | "Given identical registry data, the function returns byte-identical output. Replay-faithful by construction." |
| 33 | Grep-vs-prose discipline | ✅ | Verification greps target imports (`'@legendary-arena/registry'`, `'boardgame.io'`); the WP body cites the policy by D-entry / WP rule, never enumerating "the forbidden imports are X, Y, Z" verbatim adjacent to the grep |
| 34 | §20 Funding Surface Gate present | ✅ | Explicit N/A with reason — engine setup-layer; no UI surfaces touched (test fixture refresh only); no funding copy |
| 35 | §20 G-1..G-7 disposition | N/A | §20 not triggered |
| 36 | §20 N/A justification non-tautological | ✅ | Names the reason (engine-only; no SFC change; no funding copy) |
| 37 | Public Blurb verbatim if funding copy present | N/A | No funding copy |
| 38 | No proposed future funding UI surface | ✅ | None |
| 21-API | §21 API Catalog Update present | ✅ | Explicit N/A with reason — "no apps/server/src/** change" |

**Lint gate verdict: PASS** — 38 items resolved (33 ✅ direct, 5 N/A
with non-tautological justification, 0 ❌).
