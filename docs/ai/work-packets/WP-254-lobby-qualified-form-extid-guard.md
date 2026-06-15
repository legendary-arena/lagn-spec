# WP-254 — Lobby Qualified-Form Ext_id Guard (parseLoadoutJson)

**Status:** Draft — pending review.
**Primary Layer:** Arena Client (`apps/arena-client/src/lobby/**`) + governance reconciliation
**Dependencies:** WP-092 ✅ (the `parseLoadoutJson` shape guard + locked 9-code error enum this extends), WP-093 ✅ (the locked `heroSelectionMode` template — this WP must NOT disturb it), WP-113 ✅ / D-10014 (the engine's `<setAbbr>/<slug>` qualified-ID contract this mirrors), WP-244/245 ✅ (the LAGN intake path that routes through `parseLoadoutJson`), D-24018 (the canonical-extId fix that made the viewer emit qualified ids and widened `MATCH-SETUP-JSON-SCHEMA.json`)

---

## Session Context

WP-092 locked `parseLoadoutJson` as a pure lobby **shape guard** with a closed nine-code error enum and a byte-identical WP-093 `heroSelectionMode` template (five copies, stop-ship on drift per D-9201); WP-113/D-10014 made the engine's `validateMatchSetup` reject any composition id not in the `<setAbbr>/<slug>` qualified form, and D-24018 widened `MATCH-SETUP-JSON-SCHEMA.json`'s composition-id pattern to `^[a-z0-9-]+/[a-z0-9-]+$` to match. This packet closes the one remaining gap: the lobby shape guard never checks id **grammar**, so a stale or wrong-id-space loadout reaches the server and 500s instead of failing in the lobby with an actionable message.

---

## Goal

After this session, `parseLoadoutJson` rejects any of the five composition entity-id fields (`schemeId`, `mastermindId`, and every entry of `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`) whose value is not in the set-qualified `<setAbbr>/<slug>` envelope form, returning a new tenth error code `"unqualified_ext_id"` with a full-sentence message that names the failing field, quotes the offending value, and tells the user to re-export from the Registry Viewer loadout builder. The check is a hand-rolled envelope-grammar guard (exactly one `/`, non-empty `setAbbr` and `slug`, no surrounding whitespace) that mirrors the engine's `parseQualifiedId` (D-10014) and the canonical JSON schema's composition-id pattern — re-derived locally because the arena-client layer must not import the registry or the engine's setup-tooling surface at runtime. Both the MATCH-SETUP intake path and the LAGN intake path (which converts to a composition document and routes through `parseLoadoutJson`) gain the guard from this one change. A pre-D-24018 export — flat-card keys like `"core-scheme-midtown-bank-robbery"` or bare slugs like `"black-widow"` — now fails in the lobby with a clear "re-export" message instead of producing an opaque server `HTTP 500`.

---

## Assumes

Verify before writing a single line. If any is false, this packet is **BLOCKED**.

- WP-092 complete. Specifically:
  - `apps/arena-client/src/lobby/parseLoadoutJson.ts` exists and exports `parseLoadoutJson(input: string): ParseResult`, the `ParseErrorCode` union (nine codes today), `ParsedLoadout`, `ParseError`, `ParseResult`, the locked `UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE` const, and `renderUnsupportedModeMessage` (WP-092 / D-9201).
  - `apps/arena-client/src/lobby/parseLoadoutJson.test.ts` exists with its WP-092 `describe('parseLoadoutJson (WP-092)')` block (30 tests).
- WP-244/245 complete. `apps/arena-client/src/lobby/lagnLoadout.ts` exports `convertLagnUpload(input: string): LagnConversion`, and `apps/arena-client/src/lobby/LobbyView.vue` `applyParseResult` routes a converted LAGN document through `parseLoadoutJson` (D-24018).
- D-10014 in force. `packages/game-engine/src/matchSetup.validate.ts` exports `parseQualifiedId(input: string): { setAbbr: string; slug: string } | null` — the authoritative envelope-grammar definition this WP mirrors (it must NOT be imported by arena-client; it is read for reference only).
- `MATCH-SETUP-JSON-SCHEMA.json` composition-id fields already carry `"pattern": "^[a-z0-9-]+/[a-z0-9-]+$"` (D-24018). `docs/ai/REFERENCE/MATCH-SETUP-VALIDATION.md §Stage 2` still says `^[a-z0-9-]+$` (stale prose this WP reconciles).
- `pnpm --filter @legendary-arena/arena-client test` exits 0 on the base.
- `docs/ai/DECISIONS.md`, `docs/ai/ARCHITECTURE.md` exist.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` and `.claude/rules/architecture.md §Import Rules` — the `apps/arena-client` row: arena-client may import `@legendary-arena/game-engine` only via the Runtime-Safe Engine Surface (`.` subpath), and must NOT import `@legendary-arena/game-engine/setup` (Boundary Leakage per D-14401) or `registry` at runtime. This is **why** the qualified-form grammar is re-derived by hand here rather than importing `parseQualifiedId` — read it before deciding the helper's home.
- `apps/arena-client/src/lobby/parseLoadoutJson.ts` — read entirely. The `COMPOSITION_FIELDS` type-check loop, the fail-fast (first-error) return discipline, the locked `UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE` const + `renderUnsupportedModeMessage` helper, and the `ParseErrorCode` union are all WP-092-locked. This WP **adds** to the union and **adds** a new pass; it does not touch the existing nine codes, the type-check loop, or the heroSelectionMode template.
- `apps/arena-client/src/lobby/lagnLoadout.ts` — confirm the LAGN path emits a composition document consumed by `parseLoadoutJson` (so the guard covers LAGN too; no change needed in this file).
- `apps/arena-client/src/lobby/LobbyView.vue §applyParseResult` — confirm `result.error.message` is surfaced verbatim to `errorMessage.value` (so the new message reaches the user with no UI change).
- `packages/game-engine/src/matchSetup.validate.ts §parseQualifiedId` — read the envelope grammar to mirror: rejects empty string, leading/trailing whitespace, missing slash, multiple slashes, empty `setAbbr`/`slug`. Reference only — do not import.
- `docs/ai/REFERENCE/00.2-data-requirements.md §7` — the nine `MatchSetupConfig` composition field names (canonical spelling). The five entity-id fields checked here are `schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`.
- `docs/ai/REFERENCE/MATCH-SETUP-VALIDATION.md` — the canonical validation reference (Stages 1–4); §Stage 2 carries the stale `^[a-z0-9-]+$` prose this WP reconciles, and is where the lobby pre-check + new error code are documented.
- `docs/ai/DECISIONS.md` — scan D-9201 (WP-092 nine-code enum + five-copy byte-identity gate), D-9301 (WP-093 template), D-10014 (qualified-ID contract), D-24018 (canonical-extId fix). The new decision is **D-24025** (reserved; landed at execution close).
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no abbreviations), Rule 6 (`// why:` comments), Rule 11 (full-sentence error messages), Rule 13 (ESM only), Rule 14 (field names match the data contract).

---

## Non-Negotiable Constraints

**Always apply (do not remove):**
- ESM only, Node v22+ — `import`/`export`, never `require()`; `node:` prefix on built-in imports.
- Test files use `.test.ts` — never `.test.mjs`.
- Full file contents for every modified file in the output — no diffs, no snippets.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` — explicit control flow, no `.reduce()` with branching, no abbreviations, every non-obvious block carries a `// why:`.
- Error messages are full sentences naming what failed and what to do (Rule 11).

**Packet-specific:**
- **Layer boundary (hard).** `parseLoadoutJson.ts` must NOT import `@legendary-arena/registry`, `@legendary-arena/game-engine/setup`, `parseQualifiedId`, or any engine/registry runtime code. The qualified-form grammar is re-derived locally (the same posture the WP-092 module header already documents for its hand-rolled shape predicates).
- **The existing nine error codes, the `COMPOSITION_FIELDS` type-check loop, and the fail-fast return order are unchanged.** The new check runs as a **separate pass after** the type-check loop succeeds (a value must already be a string / array-of-non-empty-strings before its grammar is checked).
- **The new code is additive: `ParseErrorCode` becomes exactly ten codes.** No existing code is renamed, removed, or reordered.
- **The WP-093 `heroSelectionMode` template and its five-copy byte-identity gate (D-9201) are NOT touched.** The new `unqualified_ext_id` message is a new, **single-home** message that lives only in `parseLoadoutJson.ts` (documented, not byte-locked, in `MATCH-SETUP-VALIDATION.md`). It does NOT join the five-copy gate. Do not paraphrase, reuse, or extend the heroSelectionMode template.
- **Grammar = envelope only, never existence.** The check verifies the `<setAbbr>/<slug>` envelope (exactly one `/`, non-empty parts, no surrounding whitespace). It must NOT attempt registry existence, set-loaded, or charset validation — those remain the engine's authority (D-10014). Mirroring the engine's looser envelope grammar (not the stricter JSON-schema `^[a-z0-9-]+/[a-z0-9-]+$` charset) is deliberate: a lobby charset check could reject an id the engine would accept, re-introducing the inverse of the bug this WP fixes.

**Session protocol:**
- If any field name, error code, or the heroSelectionMode template's byte-identity status is unclear, STOP and ask — never guess or invent.

**Locked contract values (verbatim — do not re-derive):**
- **MatchSetupConfig composition fields (nine):** `schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`, `bystandersCount`, `woundsCount`, `officersCount`, `sidekicksCount`.
- **The five entity-id fields the guard checks:** `schemeId`, `mastermindId` (strings); `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds` (each array element). The four count fields are never id-checked.
- **Existing nine error codes (unchanged):** `"invalid_json"`, `"not_object"`, `"missing_composition"`, `"composition_not_object"`, `"missing_field"`, `"wrong_type"`, `"missing_player_count"`, `"player_count_out_of_range"`, `"unsupported_hero_selection_mode"`.
- **New tenth code (this WP):** `"unqualified_ext_id"`.
- **Qualified envelope grammar (mirror of `parseQualifiedId`):** value is a string; `value === value.trim()`; exactly one `/`; the substring before the slash (`setAbbr`) is non-empty; the substring after the slash (`slug`) is non-empty. Any failure → `unqualified_ext_id`.

---

## Debuggability & Diagnostics

- The parser stays pure, deterministic, and side-effect free: identical input → identical `ParseResult`. No I/O, no clock, no randomness.
- Every failure path remains observable as a structured `{ ok: false, error: { code, message, field } }` — `unqualified_ext_id` always carries `field` (a dot-path for the scalar fields, bracket notation for an array element, e.g. `composition.heroDeckIds[2]`), matching the existing `missing_field` / `wrong_type` discipline.
- No state is mutated; the function returns a fresh result object as today.

---

## Scope (In)

### A) `apps/arena-client/src/lobby/parseLoadoutJson.ts` — modified

- **Extend `ParseErrorCode`** with `"unqualified_ext_id"` (tenth member). Update the doc comment ("Locked enum of nine error codes") to read ten and cite D-24025.
- **Add a single-home message const + render helper** near the top, alongside the existing locked template (but visibly separate from it — a `// why:` must state this message is NOT part of the WP-093 five-copy byte-identity gate):
  - `const UNQUALIFIED_EXT_ID_TEMPLATE = "The loadout field \"<field>\" value \"<value>\" is not a set-qualified ext_id of the form \"<setAbbr>/<slug>\" (for example, \"core/black-widow\"). This usually means the loadout was exported before the qualified-ext_id fix; re-export it from the Registry Viewer loadout builder at cards.barefootbetters.com."` — `<field>` and `<value>` are the only permitted substitutions.
  - `function renderUnqualifiedExtIdMessage(field: string, value: string): string` — substitutes `<field>` then `<value>`; never construct alternative phrasing.
- **Add a local grammar predicate** `function isQualifiedExtId(value: string): boolean` — returns true iff `value === value.trim()`, `value` contains exactly one `/`, and both the part before and the part after the slash are non-empty. JSDoc cites D-10014 / `parseQualifiedId` as the mirrored authority and notes it is re-derived (layer boundary). No `.reduce()`; explicit checks.
- **Add a new validation pass** that runs **after** the `COMPOSITION_FIELDS` type-check loop returns successfully and **before** the `playerCount` checks (or after them — either is acceptable as long as it is after the composition-type loop and fail-fast). The pass checks, in field order, fail-fast (first offender returned):
  1. `compositionRaw['schemeId']` (string, already type-checked) — if not `isQualifiedExtId` → return `unqualified_ext_id`, `field: 'composition.schemeId'`.
  2. `compositionRaw['mastermindId']` — likewise, `field: 'composition.mastermindId'`.
  3. Each entry of `villainGroupIds`, then `henchmanGroupIds`, then `heroDeckIds` — first offending entry → return `unqualified_ext_id`, `field: 'composition.<name>[<index>]'`.
  - Implement as a small named helper that walks the three array fields (it appears three times → a helper is justified per §16.1; mirror the engine validator's `checkArrayExtIds` shape) plus two inline scalar checks, OR a single explicit pass over a local list of the five fields. Either way: explicit `for...of` / `for (let index …)`, no `.reduce()`, descriptive loop variables, each function ≤ 30 lines with JSDoc.
- The successful return path (the nine-field `ParsedLoadout`) is unchanged.

### B) `apps/arena-client/src/lobby/parseLoadoutJson.test.ts` — modified

Add a `describe('parseLoadoutJson qualified-form guard (WP-254)')` block (do not touch the WP-092 block's 30 tests). Cover:
- A flat-card-key `schemeId` (`"core-scheme-midtown-bank-robbery"`, the exact field-report value) → `{ ok: false }`, `error.code === 'unqualified_ext_id'`, `error.field === 'composition.schemeId'`, and `assert.strictEqual` on the full rendered message.
- A bare-slug `mastermindId` (`"magneto"`) → `unqualified_ext_id`, `field === 'composition.mastermindId'`.
- A flat-key entry in `heroDeckIds` at index 2 → `field === 'composition.heroDeckIds[2]'` (proves bracket indexing + first-offender fail-fast).
- Edge envelope failures, each rejected: empty `setAbbr` (`"/black-widow"`), empty `slug` (`"core/"`), multiple slashes (`"core/x/y"`), leading/trailing whitespace (`" core/x"`, `"core/x "`).
- A fully-qualified valid document (`"core/midtown-bank-robbery"`, `"core/magneto"`, `["core/skrulls"]`, `["core/sentinel"]`, `["core/thor","core/black-widow"]`, valid counts, `playerCount: 2`) → `{ ok: true }` (proves no false rejection of engine-valid ids).
- A regression assertion that an existing WP-092 case (e.g. `missing_field` or the heroSelectionMode template) still returns its original code + message unchanged (proves the new pass is additive and ordered after the type checks).
- Tests use `node:test` + `node:assert` only; no `boardgame.io`, no network, no DB; `assert.strictEqual` on the full message (no substring / `.includes` / `assert.match`).

### C) `docs/ai/REFERENCE/MATCH-SETUP-VALIDATION.md` — modified

- **Reconcile §Stage 2** stale prose: change "ID patterns match `^[a-z0-9-]+$`" to reflect the actual canonical pattern — composition entity-ids match `^[a-z0-9-]+/[a-z0-9-]+$` (the set-qualified `<setAbbr>/<slug>` form, per `MATCH-SETUP-JSON-SCHEMA.json` and D-10014). A `// why:`-style note may cite D-24018 (the fix that widened the schema) and D-24025 (this reconciliation).
- **Add a short "Lobby pre-check (client)" note** under the existing validation infrastructure: `apps/arena-client`'s `parseLoadoutJson` performs a client-side **envelope-grammar** pre-check of the five entity-id fields before submission, rejecting non-qualified ids with error code `"unqualified_ext_id"` so a stale loadout fails in the lobby instead of as an opaque `Game.setup()` 500. Note it is grammar-only (the engine remains the existence authority) and is layer-boundary-safe (re-derived, no registry/engine import). Cite WP-254 / D-24025.
- Add the new code to the §Validation Failure Semantics / error-contract enumeration if one is present (keep the existing `unsupported_hero_selection_mode` text byte-unchanged).

---

## Out of Scope

- **No engine change.** `matchSetup.validate.ts` / `parseQualifiedId` already enforce the qualified form server-side (D-10014); this WP does not touch them.
- **No registry-viewer change.** `setupContract.validate.ts` already checks `card.extId` existence (D-24018); the gap is the arena-client lobby only.
- **No existence, set-loaded, charset, or granularity checking in the lobby** — grammar (slash envelope) only. A qualified-but-nonexistent or wrong-granularity id (e.g. a hero *card* extId in `heroDeckIds`) remains caught server-side by the engine; the lobby cannot import the registry to check it.
- **No change to the WP-093 `heroSelectionMode` template or its five-copy byte-identity gate.**
- **No change to `MATCH-SETUP-JSON-SCHEMA.json`** — its composition-id pattern is already qualified (D-24018). Only the stale VALIDATION.md prose is reconciled.
- **No new error UX, modal, or LobbyView.vue logic** — the existing `errorMessage.value` surface renders the new message unchanged.
- Refactors, cleanups, or "while I'm here" improvements outside the above are **out of scope**.

---

## Files Expected to Change

- `apps/arena-client/src/lobby/parseLoadoutJson.ts` — **modified** — tenth `ParseErrorCode` `"unqualified_ext_id"`; `UNQUALIFIED_EXT_ID_TEMPLATE` const + `renderUnqualifiedExtIdMessage` helper; `isQualifiedExtId` predicate; new fail-fast qualified-form pass over the five entity-id fields.
- `apps/arena-client/src/lobby/parseLoadoutJson.test.ts` — **modified** — new `WP-254` describe block; WP-092 block untouched.
- `docs/ai/REFERENCE/MATCH-SETUP-VALIDATION.md` — **modified** — §Stage 2 id-pattern reconciliation + lobby pre-check note + new error code.

Governance at close (not in the SPEC-draft commit; landed by the execution session): `docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (**D-24025**), `docs/ai/work-packets/WORK_INDEX.md` (WP-254 ✅), `docs/ai/execution-checklists/EC_INDEX.md` (EC-285 Done), `docs/05-ROADMAP-MINDMAP.md`.

No other files may be modified.

---

## Acceptance Criteria

All items binary pass/fail.

### A) Parser
- [ ] `ParseErrorCode` contains exactly ten members; the new one is `"unqualified_ext_id"`; the original nine are unchanged in spelling and order-of-declaration intent.
- [ ] `isQualifiedExtId` returns `false` for `"core-scheme-midtown-bank-robbery"`, `"black-widow"`, `"/x"`, `"core/"`, `"core/x/y"`, `" core/x"`, `"core/x "`, and `""`; returns `true` for `"core/black-widow"` and `"vill/magneto"`.
- [ ] The qualified-form pass runs only after the `COMPOSITION_FIELDS` type-check loop succeeds; a value that already failed a type check returns its original code (`missing_field` / `wrong_type`), never `unqualified_ext_id`.
- [ ] An `unqualified_ext_id` error always carries `field`; an array offender uses bracket notation (`composition.heroDeckIds[2]`); the message equals `renderUnqualifiedExtIdMessage(field, value)` byte-for-byte.
- [ ] `parseLoadoutJson.ts` contains no import of `@legendary-arena/registry`, `@legendary-arena/game-engine`, or `parseQualifiedId` (confirmed with `Select-String`).
- [ ] The WP-093 `UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE` const is byte-unchanged (confirmed with `Select-String` / `git diff`).

### B) Tests
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0; the WP-092 30-test block still passes unchanged.
- [ ] The new block asserts the flat-key, bare-slug, array-index, and all four edge-envelope rejections, plus the all-qualified accept, plus one WP-092 regression — each with `assert.strictEqual` on the full message where a message is asserted.
- [ ] Test file imports only `node:test` / `node:assert` (no `boardgame.io`, no network, no DB).

### C) Docs
- [ ] `MATCH-SETUP-VALIDATION.md §Stage 2` no longer states the bare `^[a-z0-9-]+$` pattern for composition entity-ids; it states the qualified `^[a-z0-9-]+/[a-z0-9-]+$` form and cites D-24018 / D-24025.
- [ ] `MATCH-SETUP-VALIDATION.md` documents the lobby `unqualified_ext_id` pre-check (grammar-only, layer-boundary-safe) citing WP-254 / D-24025.

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`).

---

## Verification Steps

```pwsh
# Step 1 — arena-client tests (the package that owns parseLoadoutJson)
pnpm --filter @legendary-arena/arena-client test
# Expected: all tests pass, 0 failing (WP-092 block + new WP-254 block)

# Step 2 — arena-client typecheck (the green-path gate per the UIState backfill history)
pnpm --filter @legendary-arena/arena-client typecheck
# Expected: exits 0, no vue-tsc errors

# Step 3 — confirm the layer boundary: no registry / engine / parseQualifiedId import
Select-String -Path "apps\arena-client\src\lobby\parseLoadoutJson.ts" -Pattern "@legendary-arena/registry|@legendary-arena/game-engine|parseQualifiedId"
# Expected: no output

# Step 4 — confirm the WP-093 template is byte-unchanged
git diff -- apps/arena-client/src/lobby/parseLoadoutJson.ts | Select-String -Pattern "UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE"
# Expected: no removed/changed line for the template const (only additions elsewhere in the file)

# Step 5 — confirm exactly the expected files changed
git diff --name-only
# Expected: only the three files in ## Files Expected to Change (plus governance at close)
```

---

## Vision Alignment

**§17 status: N/A — declared, not omitted.** This WP touches none of the §17.1 trigger surfaces: it is a client-side input-validation guard on match-setup ingestion. It does not touch scoring/PAR/leaderboards, replays or replay verification, player identity/accounts, multiplayer sync/reconnection, determinism/RNG sourcing, card-data/content semantics, monetization, live-ops/beta gates, accessibility/i18n, or the Registry Viewer public surface (the change is in `apps/arena-client`, not `apps/registry-viewer`). If anything, it strengthens the MATCH-SETUP "invalid setup must be rejected before a game exists" trust boundary by catching a malformed setup earlier, but it introduces no new behavior on any §17.1 surface. **§20 Funding:** N/A — client-side validation only; no funding affordances, channels, or user-visible funding copy. **§21 API Catalog:** N/A — no `apps/server` HTTP endpoint or `Library-only` function is added, modified, removed, or restatused; the change is client-side validation before an existing, unchanged `create` endpoint.

---

## Lint Gate Self-Review (`00.3`)

All 21 sections resolved (PASS or justified N/A):
- **§1 structure / §2 constraints / §3 assumes / §4 context / §5 files / §6 naming:** PASS — all mandatory sections present; ≥2 explicit out-of-scope items; canonical `00.2 §7` field names used verbatim; Non-Negotiable Constraints cites `00.6` and forbids partial output.
- **§7 deps:** PASS — no new npm dependency.
- **§8 architecture:** PASS — the central constraint IS the layer boundary (no registry/engine-setup import at runtime); the WP re-derives the grammar locally and cites ARCHITECTURE.md + `.claude/rules/architecture.md`.
- **§9 Windows:** PASS — Verification Steps use `pwsh` + `Select-String`. **§10 env / §11 auth:** N/A (no env vars, no auth surface).
- **§12 tests:** PASS — `node:test`/`node:assert` only, no `boardgame.io`, no network/DB. The `makeMockCtx` / golden-deck sub-items are N/A: `parseLoadoutJson` is a pure string parser with no `ctx` and no deck construction.
- **§13 commands / §14 acceptance / §15 DoD:** PASS — exact `pnpm` commands with expected output; binary criteria aligned to deliverables; DoD includes STATUS/DECISIONS/WORK_INDEX/EC_INDEX/mindmap.
- **§16 code style:** PASS — named helpers (the array-walk helper is justified by 3× use per §16.1), full-sentence message, `// why:` on the layer-boundary re-derivation and the not-part-of-the-five-copy-gate note, no `.reduce()`, no abbreviations.
- **§17 Vision:** N/A — declared above with reasons (no trigger surface). **§18 prose-vs-grep:** PASS — the Step 3 grep targets import tokens; this WP's prose names `@legendary-arena/registry`/`parseQualifiedId` as the things NOT imported, citing the governing layer-boundary rule rather than as a forbidden-token enumeration under the grep's path (the grep path is the source file, not this doc). **§19 bridge-vs-HEAD:** N/A (not a repo-state-summary artifact). **§20 funding / §21 API catalog:** N/A — declared above with reasons.

---

## Pre-Flight Self-Review (drafting session)

- **Behavior identity:** the new pass is strictly additive and ordered after the existing type-check loop; a malformed-type value returns its original WP-092 code, so no existing test's expected code/message changes. The new code only fires on a value that is already a valid string / non-empty-string-array but lacks the `/` envelope.
- **Layer boundary holds:** the grammar is re-derived (≈6 lines), matching the module's existing hand-rolled-predicate posture; no new import edge into registry/engine.
- **Envelope-not-charset is intentional:** mirroring `parseQualifiedId`'s looser grammar (not the JSON-schema charset) avoids a lobby check that could reject an engine-valid id — the inverse of the bug being fixed. Documented as a `// why:`.
- **Five-copy gate untouched:** the new message is single-home; the WP and EC explicitly forbid joining it to the WP-093 byte-identity gate.
- **Open question for review:** none blocking. Optional follow-up (NOT this WP): a future packet could also surface the *granularity* hint (per-card vs per-group) — but that needs registry data the lobby cannot import, so it stays server-side. Noted, not scoped.

---

## Definition of Done

- [ ] All acceptance criteria pass.
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0; `pnpm --filter @legendary-arena/arena-client typecheck` exits 0.
- [ ] `ParseErrorCode` has exactly ten members; WP-093 template byte-unchanged; no registry/engine import in `parseLoadoutJson.ts` (`Select-String`).
- [ ] No files outside `## Files Expected to Change` modified (`git diff --name-only`).
- [ ] `docs/ai/STATUS.md` updated — the lobby now rejects non-qualified loadout ids with an actionable message instead of a server 500.
- [ ] `docs/ai/DECISIONS.md` updated — **D-24025** (lobby qualified-form ext_id guard; tenth `parseLoadoutJson` error code `unqualified_ext_id`; grammar-only, layer-boundary-safe; reconciles the stale MATCH-SETUP-VALIDATION.md §Stage 2 pattern).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-254 checked off with today's date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` has EC-285 marked Done.
- [ ] `docs/05-ROADMAP-MINDMAP.md` WP-254 node added; `node scripts/roadmap-counts.mjs --check` passes.
