# WP-128 — UIState Projection Extensions for Board Layout

**Status:** Ready
**Primary Layer:** Game Engine — UI projection (`packages/game-engine/src/ui/`)
**Dependencies:** WP-028 (UIState contract); WP-089 (`LegendaryGame.playerView` projection wiring); WP-111 (sibling-snapshot projection precedent — `G.cardDisplayData`); WP-029 (audience filtering)

---

## Session Context

WP-111 established the sibling-snapshot pattern (`G.cardDisplayData` built once at setup, projected through `buildUIState` as additive `display` fields on existing `UIState` slots, with `uiState.types.drift.test.ts` pinning every field name) — this packet extends `UIState` along the same pattern with the ~15 `Pending` projections enumerated in `docs/ai/DESIGN-BOARD-LAYOUT.md §4` so a future board-layout WP has every field it needs without re-deriving the projection contract.

---

## Goal

After this packet, `packages/game-engine/src/ui/uiState.types.ts` exposes every field the board-layout wireframe (`docs/ai/DESIGN-BOARD-LAYOUT.md`) marks as `Pending` — shared-pile counts (Wounds / Bystanders / Officers / Sidekicks / Horrors / KO / Hero Deck / Villain Deck), destination piles (Master Strike Pile contents and count, Scheme Twist Pile contents and count, Escaped Villain pile contents), per-player extensions (in-play card array + display, discard top card, victory-pile contents + VP total + composition counters), Mastermind captured-bystanders array, and the two missing economy fields (`piercing`, `woundsDrawn`). `buildUIState` populates each field deterministically from `G`; `filterUIStateForAudience` redacts only the fields that contain card-identity information not already public; `uiState.types.drift.test.ts` pins the new field set.

---

## Assumes

- WP-028 complete. Specifically:
  - `packages/game-engine/src/ui/uiState.types.ts` exports `UIState` with the locked top-level fields `game`, `players`, `city`, `hq`, `mastermind`, `scheme`, `economy`, `log`, `progress`, `gameOver?`
  - `packages/game-engine/src/ui/uiState.build.ts` exports `buildUIState(G, ctx, ownPlayerId): UIState`
  - `packages/game-engine/src/ui/uiState.types.drift.test.ts` pins the current field set
- WP-029 complete. Specifically:
  - `packages/game-engine/src/ui/uiState.filter.ts` exports `filterUIStateForAudience(state, audience)` redacting `players[i].handCards` and `players[i].handDisplay` per audience
- WP-089 complete. `LegendaryGame.playerView = buildPlayerView` wires `buildUIState` + `filterUIStateForAudience` through the boardgame.io player-view seam.
- WP-111 complete. `G.cardDisplayData` projection sibling-snapshot pattern is the precedent this packet mirrors.
- `docs/ai/DESIGN-BOARD-LAYOUT.md` exists at `277bcca` (committed 2026-05-03 as the wireframe artifact this packet consumes as a non-normative input).
- `pnpm --filter @legendary-arena/game-engine build` exits 0 on `main` HEAD.
- `pnpm --filter @legendary-arena/game-engine test` exits 0 (baseline 604/132/0 post-WP-111).

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §"Layer Boundary (Authoritative)"` — confirms the engine layer's responsibilities and the engine→UI projection direction. The engine never reads UI state; the UI never reads `G` directly. UIState is the only contract crossing the boundary.
- `docs/ai/ARCHITECTURE.md §"Persistence Boundaries"` — `G` is runtime-only; the projection extensions in this packet must not change that posture.
- `packages/game-engine/src/ui/uiState.types.ts` — read entirely. This is the live UIState contract the packet extends. Every new field must follow the existing patterns (readonly preferred, JSON-serializable, no engine internals leaked).
- `packages/game-engine/src/ui/uiState.build.ts` — read entirely. The packet extends `buildUIState` with new field projections. Existing field mappings must not change.
- `packages/game-engine/src/ui/uiState.filter.ts` — read entirely. The audience filter currently redacts only `handCards` / `handDisplay`. Some new fields (e.g., per-player victory-pile contents) need filter rules added.
- `packages/game-engine/src/ui/uiState.types.drift.test.ts` — read entirely. The drift test pins every field name; this packet extends it.
- `packages/game-engine/src/types.ts` — `LegendaryGameState` shape. The packet derives projections from existing `G` fields (no new `G` fields are added by this packet).
- `docs/ai/DESIGN-BOARD-LAYOUT.md §4` — the audited mapping table that enumerates the `Pending` rows this packet resolves. Non-normative input.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4 (no abbreviations), Rule 6 (`// why:` comments), Rule 11 (full-sentence error messages), Rule 13 (ESM only), Rule 14 (canonical field names per `00.2-data-requirements.md`).
- `docs/ai/REFERENCE/00.2-data-requirements.md` — confirm canonical field names before naming any new UIState entry (`bystandersRescued`, `escapedVillains`, etc.).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only.
- Never throw inside boardgame.io move functions — return void on invalid input. Only `Game.setup()` may throw.
- Never persist `G`, `ctx`, or any runtime state.
- `G` must be JSON-serializable at all times — no class instances, Maps, Sets, or functions.
- ESM only, Node v22+ — `import`/`export`, never `require()`.
- `node:` prefix on all Node.js built-in imports.
- Test files use `.test.ts` extension — never `.test.mjs`.
- No database or network access inside move functions or pure helpers.
- Full file contents for every new or modified file in the output — no diffs, no snippets.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.

**Packet-specific:**
- This packet ADDS fields to `UIState`; it does NOT modify or remove any existing field. The drift test must continue to pin every existing field plus the new ones.
- Every new field on `UIState` must be JSON-serializable — no functions, no `Date`, no `Map` / `Set` (use plain object / array).
- Per-player victory-pile contents (`players[i].victoryCards[]`) carry only `extId` + `display: UICardDisplay` — never registry runtime objects, never raw card data from `data/cards/*.json`.
- Composition counters are NOT projected by this packet — the future board-layout WP (WP-129) computes them from `players[i].victoryCards[]` + registry metadata at render time. This packet only ships the pile contents.
- Scenario-specific composition counters (S.H.I.E.L.D. Level / HYDRA Level) are deferred entirely to WP-129's client-side derivation; no engine-side support.
- `mastermind.attachedBystanders` projects only the count + the array of `extId` strings — no card-identity leakage beyond what attaching to a face-up villain already implies.
- `villainDeck.count` / `heroDeck.count` are projected as numbers only. The next-card identity is **never** projected (revealing future villains breaks determinism per WP-014A).
- `economy.piercing` and `economy.woundsDrawn` are projected from `G.turnEconomy` — confirm those fields exist in `G` per WP-018; if missing, this packet adds the corresponding `G` projection only (no new gameplay logic).
- `01.5 IS INVOKED` — this packet adds new fields to the `UIState` shape (the projection contract changes); replay-hash literal updates may cascade and are permitted as 01.5-cascade allowlist additions per WP-111 precedent.
- The `filterUIStateForAudience` extensions must redact only the per-player fields that contain card-identity information not already public. **Public information** (face-up — counts, top cards visible to all): not redacted. **Private information** (face-down or hidden — `handCards`/`handDisplay`, opponents' victory-pile contents until they choose to reveal): redacted.

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask the human before proceeding — never guess or invent field names.

**Locked contract values (do not paraphrase):**
- **Existing `UIState` top-level fields (must not change):** `game`, `players`, `city`, `hq`, `mastermind`, `scheme`, `economy`, `log`, `progress`, `gameOver?`.
- **Existing `UIPlayerState` fields (must not change):** `playerId`, `deckCount`, `handCount`, `discardCount`, `inPlayCount`, `victoryCount`, `woundCount`, `handCards?`, `handDisplay?`.
- **GlobalPiles keys (`G.piles`):** `bystanders`, `wounds`, `officers`, `sidekicks` (per WP-006A; the packet adds `horrors` only if `horrorsCount > 0` is supported by `MatchSetupConfig` — confirm before adding).
- **PlayerZones keys:** `deck`, `hand`, `discard`, `inPlay`, `victory`.
- **Audience values (`UIAudience`):** the existing closed set in `uiAudience.types.ts`. Do not extend.

---

## Debuggability & Diagnostics

All projection extensions in this packet must be:
- **Deterministic.** Identical `G` + `ctx` + `audience` → identical `UIState`. No randomness, no time, no I/O inside `buildUIState` or `filterUIStateForAudience`.
- **Inspectable.** Every new field must be traceable to a specific `G` source path. The drift test enumerates the paths.
- **JSON-serializable.** `JSON.stringify(uiState)` succeeds for every projection result.
- **Aliasing-defended.** The projection produces fresh arrays / objects — never shared references with `G`. Mirrors the WP-111 D-11102 / D-11103 / D-11105 aliasing-prevention discipline.

---

## Scope (In)

### A) `UIState` type extensions

- **`packages/game-engine/src/ui/uiState.types.ts`** — modified:
  - Extend `UIPlayerState` with:
    - `inPlayCards?: string[]` — `extId[]` for in-play cards (own audience full-array; opponents redacted to count via existing `inPlayCount`). Length matches `inPlayCount` exactly when present.
    - `inPlayDisplay?: UICardDisplay[]` — parallel array aligned by index with `inPlayCards`.
    - `discardTopCard?: { extId: string; display: UICardDisplay } | null` — top-of-discard projection (face-up; visible to all audiences). `null` when `discardCount === 0`.
    - `victoryCards?: { extId: string; display: UICardDisplay }[]` — full victory-pile contents (face-up; visible to all audiences — VP cards are public knowledge by design). Length matches `victoryCount` exactly when present.
    - `victoryVp?: number` — total VP for the player's victory pile, derived per WP-020 scoring.
  - Extend `UIMastermindState` with:
    - `attachedBystanders: { extId: string; display: UICardDisplay }[]` — bystanders captured by villains attached to the mastermind (face-up, visible to all).
    - `strikePile: { extId: string; display: UICardDisplay }[]` — face-up destination pile of resolved Master Strike cards.
  - Extend `UISchemeState` with:
    - `twistPile: { extId: string; display: UICardDisplay }[]` — face-up destination pile of resolved Scheme Twist cards.
  - Extend `UICityState` with:
    - `escapedPile: { extId: string; display: UICardDisplay }[]` — face-up destination pile of villains pushed off the Bridge edge. **Does not duplicate** `progress.escapedVillains` (which stays as the count surface).
  - Extend `UITurnEconomyState` with:
    - `piercing: number`
    - `woundsDrawn: number`
  - Add new top-level field `decks: UIDecksState` with:
    - `villainDeckCount: number`
    - `heroDeckCount: number`
  - Add new top-level field `piles: UISharedPilesState` with:
    - `bystandersCount: number`
    - `woundsCount: number`
    - `horrorsCount: number` (always present; `0` when the scenario doesn't use Horrors)
    - `officersCount: number`
    - `sidekicksCount: number`
  - Add new top-level field `koPile: UIKoPileState` with:
    - `count: number`
    - `topCard: { extId: string; display: UICardDisplay } | null` — `null` when `count === 0`
    - `cards: { extId: string; display: UICardDisplay }[]` — full pile contents (face-up; public)
  - Module-header JSDoc updated to cite WP-128 + the wireframe at `docs/ai/DESIGN-BOARD-LAYOUT.md §4` as the design input.
  - Required `// why:` comments at: each new optional-vs-required field decision (why `inPlayCards?` is optional + redactable while `attachedBystanders` is required + always-public).

### B) `buildUIState` projection extensions

- **`packages/game-engine/src/ui/uiState.build.ts`** — modified:
  - Add per-player projection of `inPlayCards`, `inPlayDisplay`, `discardTopCard`, `victoryCards`, `victoryVp` from `G.playerZones[playerId].{inPlay, discard, victory}` and `G.cardDisplayData`. Use the WP-111 aliasing-defense pattern (per-entry shallow copies) for every entry.
  - Add `mastermind.{attachedBystanders, strikePile}` projection from `G.mastermind.{attachedBystanders, strikePile}` (or equivalent — confirm against current `G` shape before writing).
  - Add `scheme.twistPile` projection from `G.scheme.twistPile` (or equivalent).
  - Add `city.escapedPile` projection from `G.city.escapedPile` (or equivalent).
  - Add `economy.{piercing, woundsDrawn}` projection from `G.turnEconomy.{piercing, woundsDrawn}`.
  - Add `decks` projection from `G.{villainDeck, heroDeck}` lengths.
  - Add `piles` projection from `G.piles.{bystanders, wounds, officers, sidekicks}` lengths plus `horrors` (zero if absent).
  - Add `koPile` projection from `G.piles.ko` (or equivalent — confirm).
  - **No new `G` fields are introduced by this packet.** If a needed `G` field is missing, log it as a STOP gate and surface to human before proceeding.

### C) `filterUIStateForAudience` extensions

- **`packages/game-engine/src/ui/uiState.filter.ts`** — modified:
  - For `audience !== ownPlayerId`: redact `players[i].inPlayCards` + `players[i].inPlayDisplay` (in-play this turn is technically face-up at the table BUT the count via `inPlayCount` is sufficient for opponent panels; full-array drill-down is owner-only by design).
  - For `audience === 'spectator'`: redact `inPlayCards` / `inPlayDisplay` for all players (spectators see counts only — same posture as `handCards`/`handDisplay`).
  - For all audiences: `discardTopCard`, `victoryCards`, `victoryVp` — all NOT redacted (public information by design).
  - Mastermind / scheme / city / decks / piles / koPile fields — all NOT redacted (shared board state, public to all audiences).

### D) Drift test extensions

- **`packages/game-engine/src/ui/uiState.types.drift.test.ts`** — modified:
  - Extend the locked-field-set assertion with every new field added in (A).
  - Add a `JSON.stringify(uiState)` round-trip test for a fixture covering all new fields populated.
  - Add an aliasing test asserting that mutating a returned `UIState` does not affect a subsequent `buildUIState` call (per-call freshness).
  - Add an audience-filtering test asserting the redaction rules from (C).

### E) `01.5` cascade — replay-hash literal updates

- **`packages/game-engine/src/replay/replay.execute.test.ts`** — modified ONLY if the new fields cause `computeStateHash` to produce a different hash for existing replay fixtures (per WP-111 precedent). Pre-flight: re-run the existing replay-determinism fixtures and compare hashes before/after the projection changes; if any cascade, update the locked literals with `// why:` comments citing 01.5 + WP-128 cascade.

### F) Tests

Add `node:test` tests in `packages/game-engine/src/ui/uiState.build.test.ts`:
- Build with empty match → all new array fields are `[]`, all new count fields are `0`.
- Build with populated match → each new field's values match the corresponding `G` source.
- Aliasing: mutate every returned array → next `buildUIState` returns un-corrupted shape.
- Filter: opponent audience redacts in-play arrays; spectator redacts hand + in-play; own audience receives all fields.
- JSON round-trip: every new field survives `JSON.stringify` + `JSON.parse`.

---

## Out of Scope

- No new `G` fields. The packet projects existing `G` state. If a needed `G` field is missing, it's a separate WP.
- No client UI changes — the packet ships projection only. Vue components consuming the new fields are WP-129's scope.
- No composition-counter computation. Composition counters (Bystanders rescued, Villains defeated, S.H.I.E.L.D. Level, HYDRA Level, etc.) derive from `players[i].victoryCards[]` + registry metadata at render time; that's WP-129's scope.
- No `UIAudience` extension. The closed set in `uiAudience.types.ts` is locked.
- No move logic changes. No new moves, no new phase hooks, no new endgame conditions.
- No registry changes. `packages/registry/**` is untouched.
- No server changes. `apps/server/**` is untouched.
- Refactors / cleanups / "while I'm here" improvements are **out of scope** unless explicitly listed in Scope (In).

---

## Files Expected to Change

- `packages/game-engine/src/ui/uiState.types.ts` — **modified** — extends `UIState`, `UIPlayerState`, `UIMastermindState`, `UISchemeState`, `UICityState`, `UITurnEconomyState`; adds `UIDecksState`, `UISharedPilesState`, `UIKoPileState`.
- `packages/game-engine/src/ui/uiState.build.ts` — **modified** — projects every new field.
- `packages/game-engine/src/ui/uiState.filter.ts` — **modified** — adds redaction rules for the per-player in-play arrays.
- `packages/game-engine/src/ui/uiState.types.drift.test.ts` — **modified** — extends locked-field-set + adds JSON round-trip + aliasing + filter tests.
- `packages/game-engine/src/ui/uiState.build.test.ts` — **modified** — adds projection tests for every new field.
- `packages/game-engine/src/ui/uiState.filter.test.ts` — **modified** — adds redaction tests.
- `packages/game-engine/src/replay/replay.execute.test.ts` — **modified ONLY IF** the new fields cascade through `computeStateHash` (per the 01.5 protocol). Confirm at execution start; skip if hashes match pre-/post-projection.
- `docs/ai/DECISIONS.md` — **modified** — D-12801..D-12806 (or similar block) recording: (1) the public-vs-private redaction rule for new per-player fields, (2) `victoryVp` projection at engine vs UI computation, (3) horrors-count-always-present-zero-when-absent vs conditional rendering, (4) aliasing-defense pattern reused from WP-111, (5) the `01.5` cascade decision (cascaded or didn't), (6) drift-test boundary.
- `docs/ai/STATUS.md` — **modified** — `### WP-128 / EC-131 Executed` block.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-128 row flipped.
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-131 row flipped.

No other files may be modified.

---

## Acceptance Criteria

### A — Type extensions

- [ ] `uiState.types.ts` exports `UIDecksState`, `UISharedPilesState`, `UIKoPileState` as new types.
- [ ] `UIState` adds top-level fields `decks: UIDecksState`, `piles: UISharedPilesState`, `koPile: UIKoPileState`.
- [ ] `UIPlayerState` adds optional `inPlayCards?`, `inPlayDisplay?`, `discardTopCard?`, `victoryCards?`, `victoryVp?`.
- [ ] `UIMastermindState` adds required `attachedBystanders`, `strikePile`.
- [ ] `UISchemeState` adds required `twistPile`.
- [ ] `UICityState` adds required `escapedPile`.
- [ ] `UITurnEconomyState` adds required `piercing`, `woundsDrawn`.
- [ ] No existing field is renamed, removed, or has its type narrowed.

### B — Projection

- [ ] `buildUIState` populates every new field deterministically from `G`.
- [ ] No new field reads `Math.random()`, `Date.now()`, or any I/O.
- [ ] Per-entry shallow-copy aliasing-defense applied to every projected array entry per the WP-111 D-11105 pattern.

### C — Filter

- [ ] `filterUIStateForAudience` redacts `inPlayCards` + `inPlayDisplay` for `audience !== ownPlayerId` and for `'spectator'`.
- [ ] `filterUIStateForAudience` does NOT redact `discardTopCard`, `victoryCards`, `victoryVp`, mastermind/scheme/city extensions, decks, piles, koPile.

### D — Drift + filter + aliasing tests

- [ ] Drift test pins every new field name (existing fields preserved).
- [ ] JSON round-trip test passes for a fully-populated `UIState` fixture.
- [ ] Aliasing test mutates every returned array; next `buildUIState` returns un-corrupted shape.
- [ ] Filter test verifies redaction matrix from (C).

### E — 01.5 cascade

- [ ] Replay-determinism fixtures re-hashed pre/post projection. If any cascade: hash literals updated with `// why: WP-128 cascade per 01.5` comments. If no cascade: documented in post-mortem and DECISIONS.md.

### Tests

- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0; baseline `604/132/0` → `604+N/132+M/0` with N+M = 12-20 new tests.
- [ ] No test file imports from `boardgame.io` (verified by `Select-String`).
- [ ] Tests use `node:test` + `node:assert` + `makeMockCtx` only.

### Scope Enforcement

- [ ] No files outside `## Files Expected to Change` were modified (verified by `git diff --name-only`).
- [ ] No `UIAudience` value added (verified by `git diff packages/game-engine/src/ui/uiAudience.types.ts` returning empty).
- [ ] No `boardgame.io` import in `uiState.{types,build,filter}.ts`.

---

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0, no TypeScript errors

# Step 2 — run all engine tests
pnpm --filter @legendary-arena/game-engine test
# Expected: pass 604+N / fail 0 / skipped 0 (baseline 604/132/0 + 12-20 new)

# Step 3 — confirm no UIAudience extension
git diff packages/game-engine/src/ui/uiAudience.types.ts
# Expected: no output

# Step 4 — confirm no Math.random / Date.now / network in projection
Select-String -Path "packages\game-engine\src\ui\uiState.build.ts","packages\game-engine\src\ui\uiState.filter.ts" -Pattern "Math\.random|Date\.now|fetch\(|require\("
# Expected: no output

# Step 5 — confirm no boardgame.io import in projection or filter
Select-String -Path "packages\game-engine\src\ui\uiState.build.ts","packages\game-engine\src\ui\uiState.filter.ts","packages\game-engine\src\ui\uiState.types.ts" -Pattern "from ['\"]boardgame\.io"
# Expected: no output

# Step 6 — confirm scope-locked files unchanged
git diff --name-only
# Expected: only files listed in ## Files Expected to Change

# Step 7 — confirm drift test extended
Select-String -Path "packages\game-engine\src\ui\uiState.types.drift.test.ts" -Pattern "victoryCards|strikePile|twistPile|escapedPile|koPile|piercing|woundsDrawn"
# Expected: at least one match per new field
```

---

## Vision Alignment

§3 (Player Trust & Fairness): preserved — the projection is deterministic; the filter preserves audience-filtering integrity. §11 (Stateless Client Philosophy): aligned — clients consume the extended projection and need no additional engine queries. §14 (Explicit Decisions, No Silent Drift): preserved — the drift test pins every new field name; field additions are audited. §15 (Built for Contributors): aligned — the projection extensions follow the WP-111 sibling-snapshot precedent verbatim, so future contributors can pattern-match. NG-1 (no monetization): not crossed. NG-3 (no engine network): preserved — projection is pure. NG-6 (deterministic engine): preserved — `buildUIState` is pure + JSON-serializable. **Determinism preservation:** every new field is derived from existing `G` state via pure projection; no new randomness, no time reads, no I/O. **§20 Funding Surface Gate: N/A** with explicit justification (engine projection extension; no funding-adjacent surface introduced). **§21 API Catalog: N/A** (no `apps/server/**` files touched, no HTTP surface affected).

---

## Decision Points

The following decisions surface as `[DECISION REQUIRED]` blocks for the executor at draft-execution time. Recommended defaults documented; executor may override with rationale recorded in DECISIONS.md.

### D-DEC-1 — `victoryVp` projected at engine or computed at UI?
**Recommended default:** projected at engine via `players[i].victoryVp: number`. The WP-020 scoring already computes per-player VP; surfacing it through the projection is cheaper than re-computing in the client and avoids client-server scoring drift.
**Alternative:** UI computes from `victoryCards[]` + registry — rejected because it duplicates WP-020's authority surface.

### D-DEC-2 — `horrors` projection always-present vs conditional?
**Recommended default:** `piles.horrorsCount: number` always present; `0` when scenario doesn't use Horrors. Avoids `?` typing churn for set-dependent mechanics.
**Alternative:** `piles.horrorsCount?: number` (optional). Adds `if defined` checks throughout consumers; rejected for ergonomics.

### D-DEC-3 — `inPlayCards` redacted for opponents and spectators?
**Recommended default:** YES, redact for `audience !== ownPlayerId` AND `'spectator'`. Mirrors `handCards` posture; in-play cards are technically face-up at the physical table, but the wireframe shows count-only in opponent panels.
**Alternative:** project for all audiences. Rejected — increases bandwidth and breaks the wireframe's opponent-panel-summary discipline.

### D-DEC-4 — KO pile contents fully projected vs count-only?
**Recommended default:** full contents in `koPile.cards[]` plus `count` and `topCard`. The KO pile is shared and face-up; full visibility matches physical-table semantics.
**Alternative:** count + topCard only. Rejected — limits the wireframe's "click to view all" drill-down.

### D-DEC-5 — Mastermind `attachedBystanders` shape: array of `{ extId, display }` vs string array?
**Recommended default:** `{ extId: string; display: UICardDisplay }[]`. Mirrors `victoryCards` shape; lets clients render bystander art without a separate registry lookup.
**Alternative:** `string[]` of ext_ids; UI resolves display via existing registry path. Rejected — diverges from the WP-111 inline-`display` pattern.

---

## Definition of Done

- [ ] All §Acceptance Criteria pass.
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0; baseline `604+N/132+M/0` with N+M ∈ [12, 20].
- [ ] `01.5 IS INVOKED` declared in the executed commit; cascade resolution recorded.
- [ ] D-12801..D-12806 inserted in numeric order in `DECISIONS.md`.
- [ ] STATUS.md `### WP-128 / EC-131 Executed` block at top of `## Current State`.
- [ ] WORK_INDEX.md WP-128 row checked off with date + commit hash.
- [ ] EC_INDEX.md EC-131 row flipped Draft → Done.
- [ ] 01.6 post-mortem MANDATORY (new long-lived projection surface — `decks` + `piles` + `koPile` + per-player victory contents are new contract types consumed by future board-layout WPs).
- [ ] Single `EC-131:` commit with the locked file count.
