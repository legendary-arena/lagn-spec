# WP-172 — Villain-Deck Display Data Coverage (Suffixed Villains, Master Strikes, Scheme Twists, Bystanders)

**Status:** Ready
**Primary Layer:** Game Engine / Setup (`packages/game-engine/src/setup/`)
**Dependencies:** WP-167 ✅ (registry villain `copies` + scheme counts), WP-168 ✅ (engine villain-deck composition; introduced the suffixed ext_id grammar this WP fills display data for), WP-111 / EC-118 ✅ (introduced `G.cardDisplayData`)

---

## Drafting Gates (01.0a §Step 5)

- **Drafting baseline:** `origin/main @ c3f1f07` (`INFRA: author xmen Tokens +
  Horrors + ssw2 Ambitions`, 2026-05-23). Verified via `git rev-parse
  origin/main` from the canonical clone at the moment the draft branch
  `claude/wp172-villain-deck-display-data-coverage` forked.
- **Pre-flight (`01.4`) verdict:** `READY TO EXECUTE` (2026-05-23). Class:
  Behavior (setup-time pure builder; output written to `G.cardDisplayData`
  by `buildInitialGameState` at `Game.setup()`). All three prerequisite WPs
  (WP-111 / EC-118, WP-167, WP-168) complete on `origin/main`. Dependency
  Contract Verification: every locked value cited by the WP was verified
  line-by-line against the actual source files — `villainDeck.setup.ts:121`
  (`HENCHMAN_COPIES_PER_GROUP = 10`), `:124` (`SCHEME_TWIST_COUNT = 8`),
  `:130` (`MASTER_STRIKE_COUNT = 5`), `:203` (villain grammar), `:223`
  (henchman grammar), `:247` (scheme-twist grammar), `:266` (bystander
  grammar), `:279` (master-strike grammar), `:262` (`context.ctx.numPlayers`
  bystander fallback), `:389-394` (`readVillainCopyCount`), plus
  `buildCardDisplayData.ts:423-451` (villain section), `:474` (literal `10`
  henchman fan-out), `:491` (mastermind soft-skip), `:513` (mastermind
  section end), and `uiState.build.ts:73-101` (`resolveDisplay`) / `:75`
  (`'<unknown>'` literal). All citations accurate. No risk-review items
  open. Scope lock: 7-file closed allowlist.
- **Copilot check (`01.7`) verdict:** `RISK` (2026-05-23) — HOLD candidate
  on one finding: EC-190 exceeds the EC-TEMPLATE.md 60-line content cap
  (83 non-empty / ~73 content lines). Two scope-neutral fixes available
  (template-conformant trim OR justified carve-out). 28 of 30 issues PASS
  outright. No `BLOCK`. No mandatory governance follow-up at draft time
  (`D-17201` lands at execution per the WP §Definition of Done). Full
  report at `docs/ai/invocations/copilot-wp172-villain-deck-display-data-coverage.md`
  (gitignored scratchpad per `.claude/rules/work-packets.md` Invocation
  Artifacts policy).
- **Lint gate (`00.3`) self-review:** PASS (38 items: 32 ✅ direct, 5 N/A
  with non-tautological justification, 1 ❌ — EC line-cap, same finding as
  Copilot RISK; tracked separately so the resolution clears both). See
  §Lint Gate Self-Review at the foot of this document.
- **Session prompt:** Written at
  `docs/ai/invocations/session-wp172-villain-deck-display-data-coverage.md`
  (gitignored scratchpad). Closes 01.0a §Step 6 REQUIRED for this WP.
- **EC line-cap carve-out (operator override, 2026-05-23):** EC-190 is
  83 non-empty lines / ~73 content-lines, exceeding EC-TEMPLATE.md's
  ≤60 cap. Operator decision: accept the over-cap. Rationale: every
  line earns its place — the tiered-lookup specification (Master Strike
  + Scheme Twist + Bystander, each with three tiers) is the load-
  bearing correctness logic and trimming it would invite re-derivation
  at execution time; the 10-item Common Failure Smells section gives
  concrete debugging hints tied to known empirical data gaps (5/40
  sets carrying `mastermind-strike`, 4/40 carrying `scheme-twist`,
  cvwr/ssw2/xmen/dstr bystander-data quirks) that a future executor
  will hit. Resolving Copilot RISK and Lint ❌ via documented
  override per 01.0a Step 5 (`RISK requires the concern documented
  inline in the WP`).

---

## Session Context

WP-168 rewrote `buildVillainDeck` to emit suffixed villain copies (`{setAbbr}-villain-{groupSlug}-{cardSlug}-{NN}` per D-16802), generic Master Strikes (`master-strike-{NN}` per D-16801), and (already pre-WP-168) virtual scheme-twists (`scheme-twist-{schemeSlug}-{NN}`) and villain-deck bystanders (`bystander-villain-deck-{NN}`); `buildCardDisplayData` (WP-111 / EC-118) was never updated to register display data for any of those four ext_id grammars, so the `UIState` projection's `resolveDisplay` fallback returns `UNKNOWN_DISPLAY_PLACEHOLDER` (literal name `<unknown>`) for every one of those cards on every play surface.

---

## Goal

After this session, `G.cardDisplayData` contains a `UICardDisplay` entry for every ext_id `buildVillainDeck` puts into the villain deck. Specifically: one entry per villain copy at the suffixed ext_id (mirrors the WP-135 hero-card-instance per-copy fan-out already in this same file), one entry per generic Master Strike (`master-strike-{NN}` × 5), one entry per scheme-twist virtual card (`scheme-twist-{schemeSlug}-{NN}` × scheme's twist count), and one entry per villain-deck bystander (`bystander-villain-deck-{NN}` × scheme's bystander count or `numPlayers`). The `<unknown>` placeholder that the play surface's RevealOverlay currently shows for "Master Strike", "Scheme Twist", and "Enters the City" labels disappears for matches loaded from any of the 40 curated set files, and any other UIState surface that resolves a villain-deck ext_id (escaped pile, future hand/victory projections) renders the correct card name and image.

---

## Assumes

- WP-167 complete. Specifically:
  - `packages/registry/src/schema.ts` exposes optional `VillainCardSchema.copies`, `SchemeSchema.villainDeckTwistCount`, and `SchemeSchema.villainDeckBystanderCount` (D-16701, D-16702).
  - All 40 `data/cards/*.json` set files carry the curated `copies` / scheme-count fields.
- WP-168 complete. Specifically:
  - `packages/game-engine/src/villainDeck/villainDeck.setup.ts` exports `buildVillainDeck` and emits these four ext_id grammars:
    - `{setAbbr}-villain-{groupSlug}-{cardSlug}-{NN}` (villain copies, D-16802)
    - `henchman-{groupSlug}-{NN}` (henchman virtual copies — already covered by `buildCardDisplayData`; not in scope here)
    - `scheme-twist-{schemeSlug}-{NN}` (scheme-twist virtual copies)
    - `bystander-villain-deck-{NN}` (villain-deck bystander virtual copies)
    - `master-strike-{NN}` (generic Master Strikes — `MASTER_STRIKE_COUNT = 5`, D-16801)
  - `MASTER_STRIKE_COUNT = 5` and `SCHEME_TWIST_COUNT = 8` are module-private constants in `villainDeck.setup.ts`. This WP inlines the same literal values verbatim into `buildCardDisplayData.ts` rather than introducing a cross-file constant import — they are tabletop rule invariants per D-16801 / D-1411, not tuning knobs, and the two-file duplication is the same RS-1 precedent used for `HENCHMAN_COPIES_PER_GROUP` (already inlined as the literal `10` in `buildCardDisplayData.ts:474`).
- WP-111 / EC-118 complete. Specifically:
  - `packages/game-engine/src/setup/buildCardDisplayData.ts` exports `buildCardDisplayData(registry, matchConfig)` and `UNKNOWN_DISPLAY_PLACEHOLDER` lives at `packages/game-engine/src/ui/uiState.build.ts`.
  - `G.cardDisplayData: Readonly<Record<CardExtId, UICardDisplay>>` is populated at `Game.setup()` and consumed by `resolveDisplay` in `uiState.build.ts`.
- `pnpm --filter @legendary-arena/game-engine build` exits 0 on baseline `main @ HEAD` (no uncommitted engine changes other than `data/metadata/card-types.json`, which this WP does not touch).
- `pnpm --filter @legendary-arena/game-engine test` exits 0 on baseline (755 / 0 fail per WP-168 closeout).

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirms the engine setup-time registry-reader pattern (local structural interface, no `@legendary-arena/registry` import).
- `.claude/rules/architecture.md §Game Engine Layer (Gameplay Authority)` — confirms `Game.setup()` may throw but moves and setup-time builders must remain JSON-serializable and deterministic.
- `packages/game-engine/src/setup/buildCardDisplayData.ts` — read entirely. This packet **extends** sections 2 (villains), 3 (henchmen — already covered), and **adds** new sections for scheme-twists, master-strikes, and villain-deck bystanders. The hero card-instance fan-out at lines 353–421 (WP-135 / WP-137 / D-13502 / D-14102) is the exact pattern to mirror for the villain per-copy fan-out.
- `packages/game-engine/src/villainDeck/villainDeck.setup.ts` — read entirely. The five ext_id grammars and the count-resolution logic live here; this WP must produce the byte-identical grammars and the byte-identical count resolution. `MASTER_STRIKE_COUNT = 5`, `SCHEME_TWIST_COUNT = 8`, `HENCHMAN_COPIES_PER_GROUP = 10` are the constants to inline verbatim per RS-1.
- `packages/game-engine/src/ui/uiState.build.ts` lines 73–101 — `UNKNOWN_DISPLAY_PLACEHOLDER` shape and `resolveDisplay` per-key fallback; this is the surface the missing entries fall through to today.
- `packages/registry/src/schema.ts §SchemeSchema` (lines 309–322) — confirms scheme entries carry `name`, `slug`, `imageUrl`, and the optional `villainDeckTwistCount` / `villainDeckBystanderCount` per D-16702.
- `data/cards/core.json` lines 2560–2575 — confirms every set's `other[]` array carries a `{ cardType: "mastermind-strike", name: "Master Strike", imageUrl: ... }` entry and a `{ cardType: "scheme-twist", name: "Scheme Twist", imageUrl: ... }` entry. These are the canonical name + imageUrl sources for the generic virtual cards. Note: `other[]` is `z.array(z.unknown())` in `SetDataSchema`, so values pass through verbatim and must be read defensively.
- `docs/ai/DECISIONS.md §D-16801` — Master Strikes are **generic** virtual instanced cards (no mastermind identity in the strike's ext_id or effect resolution); 5 per villain deck; the mastermind card itself is no longer a villain-deck card.
- `docs/ai/DECISIONS.md §D-16802` — villain copies are virtual-instanced with the `-{copyIndex}` suffix; "Display resolution must strip the trailing `-{copyIndex}` to resolve the base card art; that UI follow-up (arena-client / registry-viewer) is tracked separately and is not part of WP-168." This WP is that follow-up on the engine display-data side; the registry-viewer side (if any) remains tracked separately.
- `docs/ai/DECISIONS.md §D-13502 / D-14102` — hero per-copy fan-out precedent for instanced ext_ids in `G.cardDisplayData`.
- `docs/ai/REFERENCE/00.2-data-requirements.md §1.4 (Villains)` and `§1.5 (Schemes)` — canonical field names that must appear verbatim in any prose or test fixture.
- `docs/ai/REFERENCE/00.1-master-coordination-prompt.md` — non-negotiable constraints reminder.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4 (no abbreviations), Rule 5 (functions fit on one screen), Rule 6 (`// why:` on non-obvious code), Rule 7 (no `.reduce()` with branching), Rule 9 (`node:` prefix), Rule 13 (ESM only), Rule 14 (field names match data contract).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only (setup-time builders use no randomness at all; ordering is lexical-sort + framework-seeded shuffle, both already in `villainDeck.setup.ts` and unchanged by this WP).
- Never throw inside boardgame.io move functions — return void on invalid input.
- Never persist `G`, `ctx`, or any runtime state — see ARCHITECTURE.md §Persistence Boundary.
- `G` must be JSON-serializable at all times — no class instances, Maps, Sets, or functions. `G.cardDisplayData` values are plain `UICardDisplay` objects (`{ extId, name, imageUrl, cost }`).
- ESM only, Node v22+ — all new files use `import`/`export`, never `require()`.
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, etc.).
- Test files use `.test.ts` extension — never `.test.mjs`.
- No database or network access inside move functions or pure helpers.
- Full file contents for every new or modified file in the output — no diffs, no snippets.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.

**Packet-specific:**
- `buildCardDisplayData` must not import `@legendary-arena/registry` — extend the existing local structural `CardDisplayDataRegistryReader` interface only.
- `buildCardDisplayData` must not import `boardgame.io` — pure helper.
- `villainDeck.setup.ts` must not be modified — it is a locked contract from WP-168.
- `uiState.build.ts` must not be modified — `UNKNOWN_DISPLAY_PLACEHOLDER` and `resolveDisplay` remain unchanged; this WP fixes the missing entries upstream so the placeholder is never hit for villain-deck ext_ids.
- The four ext_id grammars produced by this WP must be **byte-identical** to those produced by `villainDeck.setup.ts`. No re-formatting, no padding-width drift, no separator changes. The grammars are:
  - `${setAbbr}-villain-${groupSlug}-${cardSlug}-${paddedIndex}` for `paddedIndex = String(copyIndex).padStart(2, '0')`, `copyIndex in [0, copies)`, `copies` from `VillainCardEntry.copies ?? 1`.
  - `master-strike-${paddedIndex}` for `paddedIndex = String(strikeIndex).padStart(2, '0')`, `strikeIndex in [0, 5)`.
  - `scheme-twist-${schemeSlug}-${paddedIndex}` for `paddedIndex = String(twistIndex).padStart(2, '0')`, `twistIndex in [0, twistCount)`, `twistCount = scheme.villainDeckTwistCount ?? 8`.
  - `bystander-villain-deck-${paddedIndex}` for `paddedIndex = String(bystanderIndex).padStart(2, '0')`, `bystanderIndex in [0, bystanderCount)`, `bystanderCount = scheme.villainDeckBystanderCount ?? matchConfig.numPlayers`. **Note:** `MatchSetupConfig` does not carry `numPlayers`; the engine setup signature takes a `SetupContext` whose `ctx.numPlayers` is the source. `buildCardDisplayData` currently does NOT take a `SetupContext`. See §Scope subsection D for the signature decision.
- Every call to `${...}.padStart(2, '0')` mirrors the `villainDeck.setup.ts` literal verbatim — no helper extracted, no width parameterization. The two-digit zero-pad is a tabletop-grammar invariant (D-16802), not a tuning knob.
- The base FlatCard-keyed villain entry (current behavior at lines 423–451) is **kept** as a defensive alias mirroring the hero base+per-copy dual-emission pattern at lines 332–351 + 353–421. Removing it could break unknown downstream consumers; the per-copy fan-out is purely additive.
- The fan-out emission for villain copies must use per-copy fresh object literals — no aliasing across keys (mirrors the WP-028 D-2802 + WP-135 D-13502 + D-14102 aliasing-prevention pattern already in this file).
- **No registry-reference leakage** — `string` fields read from registry structures (`setData.other[]`, `setData.bystanders[]`, `setData.schemes[]`) are copied by value (strings are immutable in JavaScript so this is automatic for `name` / `imageUrl`), but **no emitted `UICardDisplay` entry may store the source registry object itself by reference**. Every entry must be a freshly constructed `{ extId, name, imageUrl, cost }` literal. This closes a subtle aliasing class distinct from the per-copy-aliasing rule above: per-copy aliasing leaks within `G.cardDisplayData`; this rule leaks *from* registry data *into* `G`.
- Required `// why:` comments at the four new fan-out sites (see §Scope).

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask the human before proceeding — never guess or invent field names, type shapes, or file paths.

**Locked contract values (do not paraphrase or re-derive):**

- **`UICardDisplay` shape** (`packages/game-engine/src/ui/uiState.types.ts`):
  `{ extId: string; name: string; imageUrl: string; cost: number | null }`
- **`UNKNOWN_DISPLAY_PLACEHOLDER` literal name field** (uiState.build.ts:75):
  `'<unknown>'` (this is the symptom string; this WP exists to keep the placeholder unhit for villain-deck ext_ids).
- **`MASTER_STRIKE_COUNT`** (villainDeck.setup.ts:130, D-16801): `5`
- **`SCHEME_TWIST_COUNT` fallback** (villainDeck.setup.ts:124, D-1411 / D-16702 default): `8`
- **Bystander count fallback** (villainDeck.setup.ts:262, D-1412): `context.ctx.numPlayers`
- **`HENCHMAN_COPIES_PER_GROUP`** (villainDeck.setup.ts:121, D-1410): `10` (already correctly emitted by `buildCardDisplayData` section 3; reference for the zero-pad-2 grammar precedent).
- **MatchSetupConfig fields** (any packet touching setup or validation):
  `schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`,
  `heroDeckIds`, `bystandersCount`, `woundsCount`, `officersCount`,
  `sidekicksCount`. `numPlayers` is NOT in `MatchSetupConfig` — see §Scope D.

---

## Debuggability & Diagnostics

All behavior introduced by this packet must be debuggable via deterministic
reproduction and state inspection. Logging, breakpoints, or "printf debugging"
are not acceptable debugging strategies.

The following requirements are mandatory:

- Behavior introduced by this packet must be fully reproducible given:
  - identical `MatchSetupConfig`
  - identical registry data (the 40 curated `data/cards/*.json` files at a given commit)
  - identical `numPlayers` value
- Execution must be externally observable via deterministic state changes:
  `G.cardDisplayData[extId]` is defined for every ext_id `buildVillainDeck` puts into `G.villainDeck.deck` for the same config.
- This packet must not introduce any state mutation that cannot be inspected post-execution or validated via tests.
- The following invariants must always hold after `Game.setup()`:
  - `G` remains JSON-serializable.
  - **Display-Coverage Invariant (D-17201):** for every `extId` emitted by `buildVillainDeck` into `G.villainDeck.deck` or `G.villainDeck.discard`, `G.cardDisplayData[extId]` is defined. (Grep-friendly restatement of the superset rule; the cross-builder test in §Scope C asserts this directly.)
  - Per-copy entries do not alias each other (mutating `G.cardDisplayData[k1]` does not change `G.cardDisplayData[k2]`).
- Failures attributable to this packet must be localizable via violation of the above superset invariant — the new contract test in §Scope C asserts it directly.

---

## Scope (In)

### A) Villain per-copy fan-out (additive, alongside existing base-key emission)

- **`packages/game-engine/src/setup/buildCardDisplayData.ts`** — modified:
  - Extend the existing villain section (currently lines 423–451) so that for each `villainCard` resolved via `findVillainGroupCards`, after the existing base-FlatCard-keyed entry is emitted, an additional loop emits one entry per copy:
    - Read `copies = villainCard.copies` defensively: if `typeof villainCard.copies === 'number' && villainCard.copies >= 1`, use it; otherwise `1`. Mirrors `readVillainCopyCount` in `villainDeck.setup.ts:389–394` verbatim. Inline the check at the call site — do not extract a helper (Rule §16.1: appears in two files, two callers; copy is cheaper than coupling).
    - For `copyIndex in [0, copies)`, emit `result[${setAbbr}-villain-${groupSlug}-${cardSlug}-${paddedIndex}] = { extId, name, imageUrl, cost }` with the per-copy fresh object literal pattern.
    - `name`, `imageUrl`, and `cost` are read from the **same** `matchingFlatCard` + `villainCard.vAttack` that the base entry uses. The per-copy entries are display-aliases of the base; they share content by value, not by reference.
  - Add `// why:` comment at the per-copy loop: "WP-172 / D-16802 — villain copies are virtual-instanced; each suffixed ext_id needs its own display entry so the UIState projection's resolveDisplay does not fall through to UNKNOWN_DISPLAY_PLACEHOLDER for city-revealed villains."

### B) Master Strike, Scheme Twist, and Villain-Deck Bystander sections (new)

- **`packages/game-engine/src/setup/buildCardDisplayData.ts`** — modified (continued):
  - Add three new sections **after** the existing mastermind section (currently ending at line 513). Sections in the order: (5) Master Strikes, (6) Scheme Twists, (7) Villain-Deck Bystanders. **Section ordering differs from `villainDeck.setup.ts` intentionally** (which uses twists / bystanders / strikes as sections 3 / 4 / 5). Here, sections 6 + 7 share the scheme parse and `getSet(schemeSetAbbr)` lookup; section 5 uses the independent mastermind-set scope. Grouping by display-source scope (mastermind-set → scheme-set) keeps the shared resolution local. Do not "fix" the ordering to match `villainDeck.setup.ts` — that would re-derive the scheme parse twice for no benefit.
  - **Empirical data shape (verified 2026-05-23 against `data/cards/*.json`):**
    - `mastermind-strike` entries in per-set `other[]`: only **5 of 40 sets** carry them (`core`, `msp1`, `vill`, `wtif` each have 1; `ssw1` has 30 — its full Master Strike deck). The other **35 sets have no entry**.
    - `scheme-twist` entries in per-set `other[]`: only **4 of 40 sets** carry them (`core`, `msp1`, `vill`, `wtif`). The other **36 sets have no entry**.
    - `bystanders[]` shape: some sets (`cvwr`, `ssw2`, `xmen`) carry only named-character entries with no canonical `slug === 'bystander'`; some (`dstr`) carry an empty array.
    - **Implication:** a naive "use the set's own entry, else empty string" rule would produce broken-image tiles in the common case (35/40 Master Strike matches, 36/40 Scheme Twist matches, and the cvwr/ssw2/xmen bystander matches). Sections 5–7 below specify a tiered lookup that uses **`core` set's `other[]` entries as the cross-set fallback for Master Strike and Scheme Twist art** (D-17201 — `core` is the original Marvel Legendary printing and the canonical visual source for both generic cards), and a **two-tier lookup for bystanders** that prefers `slug === 'bystander'` over `bystanders[0]`.
  - **Section 5 — Master Strikes (mastermind-set art with `core`-set fallback):**
    - Parse `matchConfig.mastermindId` via the existing `parseQualifiedIdForSetup` helper. Soft-skip if `null` (mirrors the existing mastermind section's behavior at line 491).
    - Resolve the mastermind's set via `registry.getSet(mastermindSetAbbr)` and read its `other[]` array (typed `unknown[]` per `z.array(z.unknown())`). Defensively iterate, find the **first** entry where `cardType === 'mastermind-strike'`, read its `name` + `imageUrl` with `typeof === 'string'` guards.
    - **Tier 2 (cross-set fallback per D-17201):** if no entry found above, call `registry.getSet('core')` and repeat the same defensive scan. This catches the 35-of-40 sets that have no mastermind-strike entry of their own.
    - **Tier 3 (literal fallback):** if neither path resolves (e.g., `core` set not loaded — defense-in-depth for narrow test mocks), use literal `{ name: 'Master Strike', imageUrl: '' }`.
    - **Tier precedence lock:** The `name` field must always prefer the resolved entry's `name` field when tier-1 or tier-2 succeeds. The literal `'Master Strike'` is **only** used when both registry lookups fail (tier-3). Do not "normalize" the tier-1 / tier-2 names to a literal in a future cleanup — that would discard the per-set fidelity that justifies the registry lookup in the first place (e.g., `vill` carries `name: 'Command Strike'`, which is the printed-card name for that set and must surface verbatim).
    - Inline the literal `5` (the `MASTER_STRIKE_COUNT` value). Add `// why:` comment naming D-16801 and that the literal mirrors `villainDeck.setup.ts:130`.
    - Loop `strikeIndex in [0, 5)`, emit `result[master-strike-${paddedIndex}] = { extId, name, imageUrl, cost: null }` with fresh per-copy object literals.
    - `cost: null` — Master Strikes have no printed cost in Legendary; `null` mirrors `parseCostNullable(null)` semantics per the existing pattern in the file.
    - Add `// why:` at the tier-2 site naming D-17201 and citing the 5/40 data scarcity that motivates the `core`-set default.
  - **Section 6 — Scheme Twists (scheme-set art with `core`-set fallback):**
    - Reuse the scheme parse already needed for section 7; do the parse once before section 6 starts.
    - Soft-skip if `parsedScheme === null` or the scheme entry is not found in `setData.schemes`.
    - Find the canonical scheme entry: `scheme.name`, `scheme.slug`. The display **name** is always the literal `'Scheme Twist'` (matches the printed card per `core.json` `other[]`).
    - **Tier 1:** scan the scheme's set's `other[]` for an entry where `cardType === 'scheme-twist'`; read its `imageUrl` with `typeof === 'string'` guard.
    - **Tier 2 (cross-set fallback per D-17201):** if no entry found, scan `core`'s `other[]` for the same.
    - **Tier 3 (literal fallback):** `imageUrl: ''` if neither path resolves.
    - **Implementation note:** `core`'s `other[]` may already be resolved by section 5; the two scans are deliberately separate to keep section 5 / section 6 independent of execution order. The cost of the duplicate `registry.getSet('core')` call is negligible at setup time and avoids cross-section state.
    - Read `twistCount = scheme.villainDeckTwistCount` if `typeof === 'number'`, else inline literal `8` (the `SCHEME_TWIST_COUNT` fallback, D-1411). Mirrors `readSchemeTwistCount` + the fallback at `villainDeck.setup.ts:242–243`. Add `// why:` comment naming D-16702 and D-1411.
    - Loop `twistIndex in [0, twistCount)`, emit `result[scheme-twist-${schemeSlug}-${paddedIndex}] = { extId, name, imageUrl, cost: null }`.
    - Add `// why:` at the tier-2 site naming D-17201 and citing the 4/40 data scarcity.
  - **Section 7 — Villain-Deck Bystanders (two-tier scheme-set lookup; count from scheme or `numPlayers`):**
    - Reuse the section-6 scheme resolution.
    - **Tier 1:** scan the scheme set's `bystanders[]` (typed `z.array(z.unknown())`) for an entry where `slug === 'bystander'` (canonical generic Bystander); read its `name` + `imageUrl` with `typeof === 'string'` guards. **This must beat positional fallback** — some sets like `msp1` / `vill` / `wtif` carry the generic entry at non-zero positions or alongside named characters, and `bystanders[0]` would silently pick the wrong one.
    - **Tier 2 (acknowledged-imperfect named-character fallback):** if no `slug === 'bystander'` entry exists AND `bystanders[]` is non-empty, use `bystanders[0]`. This catches sets like `cvwr` (`[aspiring-hero, comic-shop-keeper]`), `ssw2` (`[alligator-trapper, ...]`), and `xmen` (10 named X-Men characters). The displayed art will be that named character (e.g., "Aspiring Hero" for `cvwr`) — least-bad choice until upstream registry data is backfilled. **No `core`-set fallback here** because bystander identity is conceptually per-scheme, not generic — a generic `core` bystander would be a misleading visual for a Civil War or Secret Wars II match.
    - **Tier 3 (literal fallback):** if `bystanders[]` is absent / empty (e.g., `dstr` has `bystanders: []`) or all entries are malformed, use literal `{ name: 'Bystander', imageUrl: '' }`.
    - Inline the two-tier scan — do not extract a helper. Single call site; code-style Rule §16.1.
    - Read `bystanderCount = scheme.villainDeckBystanderCount` if `typeof === 'number'`, else use the `numPlayers` value passed into `buildCardDisplayData` (see §Scope D).
    - Loop `bystanderIndex in [0, bystanderCount)`, emit `result[bystander-villain-deck-${paddedIndex}] = { extId, name, imageUrl, cost: null }`.
    - Add `// why:` at the tier-1/tier-2 split explaining why slug-match beats position (msp1/vill/wtif/wpnx have the generic entry mixed with named characters; positional fallback would silently mis-render); add a second `// why:` at tier-2 listing `cvwr` / `ssw2` / `xmen` / `dstr` by name as the known-imperfect cases.

### C) Tests

- **`packages/game-engine/src/setup/buildCardDisplayData.test.ts`** — modified:
  - Extend `buildFixtureRegistry()` to add:
    - A villain card with `copies: 3` in the brotherhood group (alongside the existing single-copy magneto, to exercise both the default-1 and the explicit-N branches).
    - **Set A (`core`)**: `other[]` carries `mastermind-strike` + `scheme-twist` entries (canonical defaults — these double as the tier-2 cross-set fallback fixtures for sections 5 + 6 tests); `bystanders[]` carries a single `slug: 'bystander'` entry with `name: 'Test Bystander A'` and a verifiable `imageUrl` (tier-1 for section 7).
    - **Set B (`testset-named`)**: `other[]` empty (exercises tier-2 `core` fallback for Master Strikes and Scheme Twists); `bystanders[]` carries `[{ slug: 'comic-shop-keeper', name: 'Comic Shop Keeper', imageUrl: 'b.webp' }, { slug: 'bystander', name: 'Test Bystander B', imageUrl: 'b-generic.webp' }]` — non-zero position of the generic entry exercises the "slug-match beats position" assertion.
    - **Set C (`testset-orphan`)**: `other[]` empty (tier-2 fallback); `bystanders[]` carries only `[{ slug: 'alligator-trapper', name: 'Alligator Trapper', imageUrl: 'c.webp' }]` — no generic entry; exercises tier-2 named-character fallback (the cvwr / ssw2 case).
    - **Set D (`testset-empty-bystanders`)**: `other[]` empty; `bystanders[]: []` — exercises tier-3 literal fallback (the `dstr` case).
    - A scheme entry on Set A with `slug: 'midtown-bombing'`, `name: 'Midtown Bombing'`, `villainDeckTwistCount: 4`, and `villainDeckBystanderCount: 2` (exercises explicit count branches and tier-1 art for sections 6 + 7).
    - A second scheme entry on Set A with neither count set (exercises the `8` and `numPlayers` fallback branches).
    - One scheme each on Sets B / C / D so the section-6 / section-7 tier-2 and tier-3 paths are reachable from a valid `MatchSetupConfig`.
  - Add tests:
    - **Villain per-copy fan-out (default 1):** for the single-copy `magneto` card, exactly one suffixed entry exists: `core-villain-brotherhood-magneto-00`, with `name === 'Magneto'`.
    - **Villain per-copy fan-out (explicit 3):** for a `copies: 3` villain, exactly three suffixed entries exist with paddings `00`, `01`, `02`, all carrying the same `name` + `imageUrl` + `cost` as the base entry.
    - **Villain base entry preserved:** `result['core-villain-brotherhood-magneto']` (no suffix) still exists with the same shape as before this WP.
    - **Villain per-copy entries do not alias:** mutating `result['core-villain-brotherhood-magneto-00'].name` does not change `result['core-villain-brotherhood-magneto-01'].name`.
    - **Master Strikes tier-1 (mastermind set carries entry):** mastermind from Set A produces 5 entries `master-strike-00`..`-04`, each with `name === 'Master Strike'`, the Set A `other[]` mastermind-strike `imageUrl`, and `cost === null`.
    - **Master Strikes tier-2 (cross-set `core` fallback):** mastermind from Set B (empty `other[]`) produces 5 entries using Set A's (`core`) `other[]` imageUrl — proves D-17201 cross-set fallback.
    - **Master Strikes tier-3 (literal fallback):** when `core` set is unloaded (mock returns `undefined` for `getSet('core')`) AND the mastermind set has no entry, all 5 strikes fall back to `name: 'Master Strike'`, `imageUrl: ''`.
    - **Scheme Twists tier-1 (scheme set carries entry):** scheme from Set A with `villainDeckTwistCount: 4` produces exactly 4 entries `scheme-twist-midtown-bombing-00`..`-03`, each with `name === 'Scheme Twist'` and Set A's `other[]` scheme-twist `imageUrl`.
    - **Scheme Twists tier-2 (cross-set `core` fallback):** scheme from Set B (empty `other[]`) produces twists with Set A's (`core`) imageUrl.
    - **Scheme Twists tier-3 (literal fallback):** when `core` unloaded AND scheme set has no entry, `imageUrl === ''`.
    - **Scheme Twists fallback count:** scheme without `villainDeckTwistCount` produces exactly 8 entries.
    - **Villain-Deck Bystanders tier-1 (slug-match beats position):** scheme using Set B produces bystander entries with `name === 'Test Bystander B'` and `imageUrl === 'b-generic.webp'` — the second entry by position but first by slug-match. This is the load-bearing regression-guard for the `bystanders[0]` anti-pattern.
    - **Villain-Deck Bystanders tier-2 (named-character fallback):** scheme using Set C produces entries with `name === 'Alligator Trapper'` and `imageUrl === 'c.webp'` (the only entry). Mirrors the cvwr / ssw2 / xmen real-set cases.
    - **Villain-Deck Bystanders tier-3 (literal fallback for empty array):** scheme using Set D produces entries with `name === 'Bystander'` and `imageUrl === ''`. Mirrors the dstr real-set case.
    - **Villain-Deck Bystanders explicit count:** Set A scheme with `villainDeckBystanderCount: 2` produces exactly 2 entries `bystander-villain-deck-00` and `-01`.
    - **Villain-Deck Bystanders `numPlayers` fallback:** Set A scheme without the count, called with `numPlayers: 3`, produces exactly 3 entries.
    - **Defensive parsing test (malformed `other[]` / `bystanders[]` entries):** when `other[]` or `bystanders[]` contains non-object values (e.g., `null`, `undefined`, primitives) or objects missing the expected `cardType` / `slug` / `name` / `imageUrl` string fields, those entries are silently skipped and resolution proceeds to the next tier (or the literal fallback). Fixture: a 5th set where `other[]: [null, { cardType: 'mastermind-strike' /* no imageUrl */ }, 'string-not-object', { cardType: 'mastermind-strike', name: 'OK', imageUrl: 'ok.webp' }]`; the 4th entry wins (first well-formed match) — proves the `typeof` guards in the defensive read actually work.
    - **Cross-builder superset invariant (the load-bearing test):** call both `buildVillainDeck` (the existing function) and `buildCardDisplayData` with the **same `MatchSetupConfig`, the same `registry` instance, and the same `numPlayers` value, in the same test setup**, and assert `Object.keys(G.cardDisplayData)` is a superset of `[...result.state.deck, ...result.state.discard]` where `result` is the return value of `buildVillainDeck` on that same call. The comparison must be against the post-`buildVillainDeck` final output — not against pre-shuffle or pre-instancing intermediate state. This is the test that would have caught the original WP-168-introduced gap.
  - All tests use `node:test` and `node:assert/strict`; no `boardgame.io` import; no network; no DB.

### D) Signature change: pass `numPlayers` into `buildCardDisplayData`

- **`packages/game-engine/src/setup/buildCardDisplayData.ts`** — modified (signature):
  - Current signature: `buildCardDisplayData(registry: unknown, matchConfig: MatchSetupConfig): Readonly<Record<CardExtId, UICardDisplay>>`.
  - New signature: `buildCardDisplayData(registry: unknown, matchConfig: MatchSetupConfig, numPlayers: number): Readonly<Record<CardExtId, UICardDisplay>>`. The third parameter is read only by section 7 (bystander count fallback). Other sections ignore it.
  - **Rationale:** `MatchSetupConfig` does not carry `numPlayers` (Match Setup Schema §Composition lock — the 9 fields are immutable per `.claude/rules/code-style.md`). `villainDeck.setup.ts` reads `context.ctx.numPlayers`; mirroring that exact source is the simplest contract. Passing a single `number` (not the whole `SetupContext`) keeps the builder's pure-helper posture intact (no `boardgame.io` import, no `ctx.random` exposure).
  - **`packages/game-engine/src/setup/buildInitialGameState.ts`** — modified:
    - The single call site to `buildCardDisplayData(...)` is updated to pass `ctx.numPlayers` as the third argument. This is a mechanical one-line change; no other logic in `buildInitialGameState` is touched.
  - Add `// why:` comment at the new parameter declaration: "WP-172 — bystander count fallback per D-1412 is `numPlayers`; `MatchSetupConfig` does not carry it (Match Setup composition lock), so `Game.setup()` passes `ctx.numPlayers` through. Mirrors the `villainDeck.setup.ts` pattern that reads `context.ctx.numPlayers`."

---

## Out of Scope

- **`packages/game-engine/src/villainDeck/villainDeck.setup.ts` modifications** — locked WP-168 contract; the four ext_id grammars stay byte-identical; this WP only adds display-data entries that match them.
- **`packages/game-engine/src/ui/uiState.build.ts` modifications** — `UNKNOWN_DISPLAY_PLACEHOLDER` and `resolveDisplay` are unchanged. This WP eliminates placeholder-hit cases by populating the upstream map; it does not change how the placeholder is shaped, formatted, or rendered.
- **`UICardDisplay` shape changes** — the four-field record (`extId`, `name`, `imageUrl`, `cost`) is unchanged. No new fields added, none removed.
- **`G.villainDeckCardTypes` changes** — type classifications already correct per WP-168; only display data is missing.
- **Registry schema changes** — `VillainCardSchema.copies` (WP-167), `SchemeSchema.villainDeckTwistCount` / `villainDeckBystanderCount` (WP-167), and per-set `other[]` / `bystanders[]` shapes are unchanged.
- **`@legendary-arena/registry` import in the engine** — still forbidden; this WP extends the local structural `CardDisplayDataRegistryReader` interface only.
- **Registry-viewer changes** — viewer-side villain copy display is tracked separately per D-16802 closing note; this WP touches only the engine.
- **Arena-client / RevealOverlay component changes** — the popup component is correct; it consumes whatever `display.name` the projection provides. Fixing the upstream projection is sufficient.
- **Mastermind tactic display data** — tactics are still projected as counts only per WP-111 §Card types NOT projected; out of scope here.
- **Wound display data** — `WOUND_EXT_ID` is not in the villain deck and not in scope.
- **Card-image hyphenation / URL formatting** — image URLs are passed through verbatim from registry data, consistent with the existing villain / henchman / hero sections.
- **D-16801 simplification (SW1 30-card Master Strike deck collapse)** — SW1 has a 30-card Master Strike deck in its registry data (`data/cards/ssw1.json` carries 30 `mastermind-strike` entries: Abduction / Bank Robbery / Breakout / …). D-16801 locks the engine to **5 generic Master Strikes per villain deck** regardless of set; this WP respects that constraint and therefore the 5 emitted `master-strike-{NN}` cards for an SW1 match all share the **first** SW1 strike's name + image (per the section-5 tier-1 rule). Making SW1 (and any future set with a Master Strike deck variant) tabletop-accurate requires changing D-16801 + `MASTER_STRIKE_COUNT` + likely the registry shape — out of scope here and a separate WP if pursued.
- **Registry data backfill** — the empirical `mastermind-strike` (5/40 sets) / `scheme-twist` (4/40) / generic-bystander (`slug === 'bystander'` missing from cvwr, ssw2, xmen) gaps documented in §Scope B are **data** problems, not engine problems. This WP makes the engine handle the gaps gracefully via the `core`-set cross-set fallback + two-tier bystander lookup. Backfilling the per-set art into the source data is a future registry-pipeline WP; this WP unblocks the play surface without waiting for that data work.
- **`MatchSetupConfig.bystandersCount` as a count source — DO NOT substitute.** The two fields represent different domains:
  - `numPlayers` (the new 3rd parameter) → **virtual villain-deck bystanders** count (D-1412, setup-time composition). This is what section 7 reads.
  - `matchConfig.bystandersCount` → **shared rescue-pile supply** in `G.sharedPiles.bystanders`. Out of scope here.

  Conflating them will silently break villain-deck composition correctness without raising a type error (both are `number`). The section-7 `// why:` on the `numPlayers` parameter must use the bulleted two-domain format above verbatim — so a future reviewer who looks at the code and asks "why not just use `matchConfig.bystandersCount`?" finds the answer in the comment, not in a follow-up PR review.
- **Refactors, cleanups, or "while I'm here" improvements** are **out of scope** unless explicitly listed in Scope (In) above. In particular: no extraction of a shared `padCopyIndex(n)` helper across `villainDeck.setup.ts` and `buildCardDisplayData.ts` — code-style Rule §16.1 (appears in two files, not three).

---

## Files Expected to Change

- `packages/game-engine/src/setup/buildCardDisplayData.ts` — **modified** — extend villain section with per-copy fan-out; add Master Strike, Scheme Twist, and Villain-Deck Bystander sections; add `numPlayers: number` third parameter.
- `packages/game-engine/src/setup/buildCardDisplayData.test.ts` — **modified** — extend fixture registry; add tests for per-copy fan-out, generic cards, fallbacks, no-aliasing, and the cross-builder superset invariant.
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** — pass `ctx.numPlayers` to `buildCardDisplayData(...)` (one-line call-site update).
- `docs/ai/STATUS.md` — **modified** — record that the `<unknown>` placeholder is no longer hit for villain-deck reveals.
- `docs/ai/DECISIONS.md` — **modified** — append `D-17201` (display-data coverage for the four villain-deck ext_id grammars).
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — append WP-172 entry with done status + commit hash on close.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — append EC-190 entry.

No other files may be modified. (7 files total — at the §00.3 §5 ~8-file cap; no split needed.)

### Allowlist Amendment (operator-approved at execution, 2026-05-23)

Two cascade re-baselines downstream of the WP's correct enlargement of
`G.cardDisplayData` (per-copy villains + master strikes + scheme twists +
bystanders shift the final-state hash). Mirrors WP-168 / EC-186's
`PRE_WP080_HASH` + `sentinel-core-doom-2p.replay.json` precedent
verbatim. Operator-approved on the execution session via
`AskUserQuestion` ("Approve amendment (mirror WP-168 precedent)").

- `packages/game-engine/src/replay/replay.execute.test.ts` — **modified**
  — `PRE_WP080_HASH` value-only change `'35fbe2fc'` → `'17c60ea9'`.
  Comment block at the declaration cites WP-172 + WP-168 cascade
  precedent.
- `packages/game-engine/src/test/fixtures/games/sentinel-core-doom-2p.replay.json`
  — **modified** — `expected.finalStateHash`
  `925cd7a2b598ceb81d15e1963231c0d4cec15633836886c2f45fb5cd6bbdc2e4` →
  `6263f12f6bc24d4689bb49978f817bf2c373dd3c4266bd414a66ec5a4d37829e`.
  Regenerated via `scripts/record-game-fixture.mjs` with identical
  `name` / `seed` / `createdAt` / `engineVersion` / `input.moves`; only
  the final-state hash differs. `meta.version` and all other fields are
  byte-identical pre- and post-execution.

Final allowlist (9 files): the 7 originally enumerated above plus the
2 cascade re-baselines.

---

## Vision Alignment

This WP touches **§17.1 trigger:** *"Card data, card images, or content semantics (Vision §1, §2, §10)."* It is a card-data / display-data faithfulness fix.

**Vision clauses touched:** §1 (tabletop faithfulness — display labels and art match the printed cards within the constraints D-16801 / D-16802 already set), §10 (registry is the authoritative data source; the engine reads it once at setup and never at runtime).

**Conflict assertion:** No conflict: this WP preserves all touched clauses **within the existing D-16801 simplification**. The Master Strike / Scheme Twist labels match the printed cards; the villain copies share the printed card's name and art per D-16802. **Caveat for §1 honesty:** D-16801 collapses every set's Master Strike content to 5 generic strikes regardless of the source set's printed card count — this is most visible for SW1's 30-card Master Strike deck (§Out of Scope). The simplification is the engine's existing constraint, not a WP-172 regression; this WP merely makes the engine's chosen labels resolve to real strings instead of `<unknown>`. A fully faithful SW1 Master Strike experience would require revising D-16801 and is out of scope.

**Non-Goal proximity check:** None of NG-1..7 are crossed. No monetization, no persuasive copy, no competitive-balance change. Display-only correctness fix.

**Determinism preservation:** `buildCardDisplayData` is a setup-time pure function. It uses no `ctx.random.*` (none of the engine setup builders do, by design). Given identical `MatchSetupConfig` + identical registry data + identical `numPlayers`, the function returns byte-identical output. Replay-faithful by construction (Vision §22).

---

## Funding Surface Gate

**§20 N/A** — engine setup-layer change in `packages/game-engine/src/setup/**`; no UI surfaces touched, no user-visible funding copy, no funding channels referenced, no `apps/arena-client/**` modifications.

---

## API Catalog Update

**§21 N/A** — no `apps/server/src/**` change; no HTTP endpoints added, modified, removed, or status-flipped; no `Library-only` server library functions added or modified.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### Villain per-copy fan-out
- [ ] For every villain card with `copies: N` (default 1) in the match config's villain groups, `buildCardDisplayData` emits exactly N entries with the suffixed grammar `{setAbbr}-villain-{groupSlug}-{cardSlug}-{NN}` where `NN = String(copyIndex).padStart(2, '0')` for `copyIndex in [0, N)`.
- [ ] Per-copy entries do not alias each other (confirmed by mutation test in §Scope C).
- [ ] The base FlatCard-keyed villain entry (no suffix) is still emitted as before this WP (defensive alias; the existing test asserting `result['core-villain-brotherhood-magneto']` still passes byte-identically).

### Master Strikes
- [ ] Exactly 5 `master-strike-{NN}` entries are emitted for `NN in {00, 01, 02, 03, 04}`.
- [ ] Each entry carries `name === 'Master Strike'` (verbatim, single-quoted constant inline) when no per-set `mastermind-strike` entry is found in either tier; when found, name is read from that entry's `name` field.
- [ ] Tier-1 hit: `imageUrl` is read from the mastermind set's `other[]` first `cardType === 'mastermind-strike'` entry when present.
- [ ] Tier-2 hit (D-17201): when the mastermind set has no `mastermind-strike` entry, `imageUrl` is read from the `core` set's `other[]` `mastermind-strike` entry.
- [ ] Tier-3 hit: when neither the mastermind set nor the `core` set carries the entry, each entry falls back to `imageUrl: ''` and `name: 'Master Strike'`.
- [ ] Each entry's `cost` is `null`.

### Scheme Twists
- [ ] Exactly `scheme.villainDeckTwistCount ?? 8` `scheme-twist-{schemeSlug}-{NN}` entries are emitted.
- [ ] Each entry carries `name === 'Scheme Twist'` (always — the printed-card name is fixed).
- [ ] Tier-1 hit: `imageUrl` is read from the scheme set's `other[]` first `cardType === 'scheme-twist'` entry when present.
- [ ] Tier-2 hit (D-17201): when the scheme set has no entry, `imageUrl` is read from the `core` set's `other[]` `scheme-twist` entry.
- [ ] Tier-3 hit: when neither carries the entry, `imageUrl: ''`.
- [ ] Each entry's `cost` is `null`.

### Villain-Deck Bystanders
- [ ] Exactly `scheme.villainDeckBystanderCount ?? numPlayers` `bystander-villain-deck-{NN}` entries are emitted.
- [ ] Tier-1 hit: when the scheme set's `bystanders[]` contains an entry where `slug === 'bystander'`, that entry's `name` + `imageUrl` is used **regardless of its position in the array** (must beat positional `bystanders[0]`).
- [ ] Tier-2 hit: when no `slug === 'bystander'` entry exists AND `bystanders[]` is non-empty, `bystanders[0]`'s `name` + `imageUrl` is used (acknowledged-imperfect named-character art).
- [ ] Tier-3 hit: when `bystanders[]` is absent or empty, fall back to `name: 'Bystander'`, `imageUrl: ''`.
- [ ] No `core`-set cross-set fallback for bystanders (bystander identity is per-scheme, not generic — see §Scope B Section 7 rationale).
- [ ] Each entry's `cost` is `null`.

### Signature change
- [ ] `buildCardDisplayData` now takes a third parameter `numPlayers: number`.
- [ ] `buildInitialGameState` is the only call site updated; it passes `ctx.numPlayers` as the third argument.

### Cross-builder superset invariant
- [ ] A test calls both `buildVillainDeck` and `buildCardDisplayData` with the same config / registry / numPlayers and asserts `Object.keys(G.cardDisplayData)` ⊇ `[...result.state.deck, ...result.state.discard]`. The test passes.
- [ ] **Grammar-identity assertion (governance chain):** for all four villain-deck grammars (villain copies, master strikes, scheme twists, villain-deck bystanders), the ext_id strings generated by `buildCardDisplayData` match byte-for-byte the ext_id strings generated by `buildVillainDeck` for the same inputs. This is verified *indirectly but completely* by the superset invariant test: if any grammar drifted (padding width, separator, slug position), some ext_id in `buildVillainDeck`'s output would be missing from `buildCardDisplayData`'s output and the superset assertion would fail. No separate string-compare test is required; the superset test subsumes it.
- [ ] **Defensive parsing test passes:** malformed `other[]` / `bystanders[]` entries are skipped (the test fixture with `null`, primitives, and missing fields resolves to the first well-formed entry — proves `typeof` guards work).

### Tests
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (the WP-168 baseline 755 passes; new tests bring the count higher with 0 failures).
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `buildCardDisplayData.test.ts` does not import from `boardgame.io` or `boardgame.io/testing`.
- [ ] `buildCardDisplayData.ts` does not import from `@legendary-arena/registry` (confirmed with `Select-String`).
- [ ] `buildCardDisplayData.ts` does not import from `boardgame.io` (confirmed with `Select-String`).

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`).

---

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0, no TypeScript errors

# Step 2 — run all engine tests
pnpm --filter @legendary-arena/game-engine test
# Expected: TAP output — baseline 755 tests pass plus the new tests added in
# this WP (roughly +10 to +15 new tests); 0 failing

# Step 3 — confirm no @legendary-arena/registry import in buildCardDisplayData.ts
Select-String -Path "packages\game-engine\src\setup\buildCardDisplayData.ts" -Pattern "@legendary-arena/registry"
# Expected: no output

# Step 4 — confirm no boardgame.io import in buildCardDisplayData.ts
Select-String -Path "packages\game-engine\src\setup\buildCardDisplayData.ts" -Pattern "boardgame.io"
# Expected: no output

# Step 5 — confirm the four new ext_id grammars appear in the test fixtures
Select-String -Path "packages\game-engine\src\setup\buildCardDisplayData.test.ts" -Pattern "master-strike-00|scheme-twist-midtown-bombing-00|bystander-villain-deck-00|core-villain-brotherhood-magneto-00"
# Expected: at least 4 matching lines (one per grammar)

# Step 6 — confirm no files outside scope were changed
git diff --name-only
# Expected: only the seven files listed in ## Files Expected to Change
```

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass.
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0.
- [ ] No `@legendary-arena/registry` import in `buildCardDisplayData.ts` (confirmed with `Select-String`).
- [ ] No `boardgame.io` import in `buildCardDisplayData.ts` (confirmed with `Select-String`).
- [ ] `villainDeck.setup.ts` was not modified (confirmed with `git diff`).
- [ ] `uiState.build.ts` was not modified (confirmed with `git diff`).
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`).
- [ ] `docs/ai/STATUS.md` updated — note that the `<unknown>` placeholder no longer surfaces for villain-deck reveals (Master Strike, Scheme Twist, city villain reveals, and any future bystander projection).
- [ ] `docs/ai/DECISIONS.md` updated — append `D-17201` (display-data coverage for the four villain-deck ext_id grammars; rationale: WP-168 fanned out the deck grammar without fanning out the display map; the cross-builder superset invariant test added by this WP would have caught the gap and is added retroactively as a regression guard).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-172 checked off with today's date and commit hash.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` has EC-190 entry appended.

---

## Lint Gate Self-Review

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Required WP sections present (Goal / Assumes / Context / Scope / Out of Scope / Files Expected to Change / Non-Negotiable Constraints / Acceptance Criteria / Verification Steps / Definition of Done) | ✅ | All ten present and non-empty |
| 2 | `## Out of Scope` non-empty with ≥ 2 deliberately-excluded items | ✅ | 12 items: locked `villainDeck.setup.ts`, locked `uiState.build.ts`, `UICardDisplay` shape, `G.villainDeckCardTypes`, registry schema, registry import, registry-viewer, RevealOverlay, mastermind tactics, WOUND_EXT_ID, hyphenation, D-16801 SW1 simplification, registry backfill, `bystandersCount` substitution |
| 3 | Non-Negotiable Constraints contain engine-wide (full-file, ESM, Node 22, code-style cite, no DB/network in moves) AND packet-specific (no registry/boardgame.io import; villainDeck.setup.ts locked; uiState.build.ts locked; grammar byte-identity; no padCopyIndex extraction; per-copy fresh literals; no registry-reference leakage) AND session protocol AND locked contract values | ✅ | All four blocks present |
| 4 | Constraints cite `00.6-code-style.md` | ✅ | Engine-wide block names "Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`" |
| 5 | No partial output permitted | ✅ | "Full file contents for every new or modified file in the output — no diffs, no snippets." in engine-wide block |
| 6 | `## Assumes` lists every prior WP + file dependency with required shape; no hidden dependencies | ✅ | WP-167 / WP-168 / WP-111 EC-118 listed; each cites the specific exports / shapes; baseline build + test invariants cited |
| 7 | `## Context (Read First)` is specific (sections cited, not "read the docs") | ✅ | 9 read targets with section / line citations (ARCHITECTURE.md Layer Boundary; `.claude/rules/architecture.md §Game Engine`; buildCardDisplayData.ts entirely; villainDeck.setup.ts entirely; uiState.build.ts:73-101; registry/src/schema.ts:309-322; data/cards/core.json:2560-2575; D-16801, D-16802, D-13502, D-14102; 00.2 §1.4 + §1.5; 00.6 rules 4/5/6/7/9/13/14) |
| 8 | Touches data shapes? If yes, cites `00.2-data-requirements.md` | ✅ | §1.4 (Villains) and §1.5 (Schemes) cited in §Context |
| 9 | `## Files Expected to Change` is an allowlist; ≤ ~8 files | ✅ | 7 files (1 modified src + 1 modified test + 1 modified call site + 4 governance) — at the cap, no split needed |
| 10 | No ambiguous "update / modify / show diff" language anywhere | ✅ | Every file entry uses "**modified**" with the change described; full-file-content requirement in §Non-Negotiable Constraints |
| 11 | Naming consistency with 00.2 and prior WPs | ✅ | `extId`, `name`, `imageUrl`, `cost`, `slug`, `villainDeckTwistCount`, `villainDeckBystanderCount`, `bystandersCount`, `numPlayers` — all match `00.2-data-requirements.md` §1.4 / §1.5 and `MatchSetupConfig` lock |
| 12 | No new npm dependency | ✅ | No package.json change |
| 13 | Forbidden packages explicitly excluded where relevant | ✅ | Tests use `node:test` only; no boardgame.io test imports; no fetch/network; no DB |
| 14 | Architectural boundaries respected | ✅ | game-engine setup only; no registry runtime import (extends local structural `CardDisplayDataRegistryReader`); no boardgame.io import; villainDeck.setup.ts locked WP-168 contract; uiState.build.ts unchanged |
| 15 | Windows / PowerShell-safe commands | ✅ | Verification uses `pnpm` + `Select-String` + `git diff`; no `bash` / `grep` / `~/.config` |
| 16 | Env vars documented | N/A | No env var touched |
| 17 | Auth model committed | N/A | No auth surface touched |
| 18 | Tests use `node:test` only; no boardgame.io / network / DB import | ✅ | `buildCardDisplayData.test.ts` extension only; existing harness uses `node:test` + `node:assert/strict` per §Scope C |
| 19 | Verification Steps are exact (commands + expected output) | ✅ | 6 steps, each with explicit "Expected:" line |
| 20 | Acceptance Criteria are binary + observable + specific | ✅ | 30+ items grouped into 7 sections (Villain per-copy / Master Strikes / Scheme Twists / Bystanders / Signature change / Cross-builder superset / Tests / Scope Enforcement); each cites a function / value / grammar / file |
| 21 | Definition of Done includes STATUS.md + DECISIONS.md + WORK_INDEX.md + scope-boundary check | ✅ | All four explicit; D-17201 append flagged; scope-boundary checked via `git diff --name-only` |
| 22 | No premature abstraction (≥ 3 uses) | ✅ | Explicitly forbids extracting `padCopyIndex(n)` helper across two files (Rule §16.1 cited inline) |
| 23 | No nested ternaries / complex `reduce` / dynamic known-key access | ✅ | Explicit "no `.reduce()` with branching" in EC §Guardrails; loops are explicit `for (...; ...; ...)` over numeric indices |
| 24 | Descriptive names | ✅ | EC §Guardrails: "no abbreviations: `copyIndex` not `i`, `strikeIndex` not `s`, `twistIndex` not `t`, `bystanderIndex` not `b`, `mastermindSetData` not `msd`" |
| 25 | Functions ≤ 30 lines with JSDoc | ✅ | Each new section is independent and short; the per-copy loop is ~5 lines; the tier-1/2/3 lookups are flat conditionals |
| 26 | `// why:` on non-obvious code | ✅ | EC §Required Comments locks 9 sites with the rationale each must cite (D-16802, D-16801, D-17201 ×2, D-16702/D-1411, D-1412, slug-match-vs-position, named-character-fallback list, cross-builder regression-guard); special two-domain bulleted format for the `numPlayers` parameter |
| 27 | No `import *` / barrel re-exports | ✅ | Named imports only |
| 28 | Error messages full sentences | N/A | No `throw new Error(...)` in this WP (setup-time builders soft-skip; only `Game.setup()` may throw) |
| 29 | §17 Vision Alignment section present (or explicit N/A with justification) | ✅ | Present — touches §17.1 trigger "Card data, card images, or content semantics (Vision §1, §2, §10)" |
| 30 | §17 cites clause numbers (or N/A justified) | ✅ | Cites §1 (tabletop faithfulness), §10 (registry authority), §22 (determinism) — clause numbers, not paraphrases |
| 31 | Vision conflict declared? | ✅ | "No conflict: this WP preserves all touched clauses within the existing D-16801 simplification." with explicit honesty caveat about SW1's 30-card Master Strike deck |
| 32 | Determinism preservation line if WP touches scoring/replay/RNG | ✅ | "buildCardDisplayData is a setup-time pure function. ... Given identical MatchSetupConfig + identical registry data + identical numPlayers, the function returns byte-identical output. Replay-faithful by construction (Vision §22)." |
| 33 | Grep-vs-prose discipline | ✅ | Verification greps target imports (`'@legendary-arena/registry'`, `'boardgame.io'`); the WP body cites the policy by D-entry / WP rule, never enumerating "the forbidden imports are X, Y, Z" verbatim adjacent to the grep |
| 34 | §20 Funding Surface Gate present (or N/A justified) | ✅ | Explicit N/A with reason — "engine setup-layer change in `packages/game-engine/src/setup/**`; no UI surfaces touched, no user-visible funding copy, no funding channels referenced, no `apps/arena-client/**` modifications" |
| 35 | §20 G-1..G-7 disposition (if §20 triggered) | N/A | §20 not triggered |
| 36 | §20 N/A justification non-tautological | ✅ | Names the reason (engine-only; no UI; no funding copy) |
| 37 | Public Blurb verbatim if funding copy present | N/A | No funding copy |
| 38 | No proposed future funding UI surface | ✅ | None |
| 21-API | §21 API Catalog Update present (or N/A justified) | ✅ | Explicit N/A with reason — "no `apps/server/src/**` change; no HTTP endpoints added, modified, removed, or status-flipped; no `Library-only` server library functions added or modified" |
| EC-LEN | EC-190 within EC-TEMPLATE.md 60-line content cap | ❌ | EC-190 is 83 non-empty / ~73 content-lines. Density is non-redundant (tiered lookup spec + 10-item Common Failure Smells); two scope-neutral fixes available — see Copilot Check §Documentation Density finding. RESOLVE BEFORE EXECUTION. |

**Lint gate verdict: PASS-WITH-HOLD** — 37 items resolved (32 ✅ direct, 5 N/A
with justification, 0 ❌ on the 38-item core checklist) plus 1 ❌ on the
template-conformance carve-out (EC line cap). The carve-out is the same
finding as the Copilot Check `RISK`; resolving either resolves both. Verdict
flips to PASS the moment the EC line-cap is reconciled (template trim OR
documented carve-out per Copilot §Documentation Density).
