# WP-254 — Lobby Qualified-Form Ext_id Guard (parseLoadoutJson)

**Status:** **DONE 2026-06-16** (EC-285 commit `25f40038`, merged #342 `765f75c2`; arena-client `test` 568 → 576 / 0, `typecheck` 0). **✅ D-24026 LIVE-VERIFIED** — play.legendary-arena.com serves bundle `index-BXp3Og8h.js` embedding `__GIT_SHA__` `765f75c` and containing the new `unqualified_ext_id` guard (see Definition of Done + STATUS.md).
**Primary Layer:** Arena Client (`apps/arena-client/src/lobby/**`) + governance reconciliation
**User-Visible Surface:** play.legendary-arena.com (D-24026; resolved 2026-06-16 — NOT `none — infrastructure`; see `## User-Visible Impact`)
**Dependencies:** WP-092 ✅ (the `parseLoadoutJson` shape guard + locked 9-code error enum this extends), WP-093 ✅ (the locked `heroSelectionMode` template — this WP must NOT disturb it), WP-113 ✅ / D-10014 (the engine's `<setAbbr>/<slug>` qualified-ID contract this mirrors), WP-244/245 ✅ (the LAGN intake path that routes through `parseLoadoutJson`), D-24018 (the canonical-extId fix that made the viewer emit qualified ids and widened `MATCH-SETUP-JSON-SCHEMA.json`)

---

## Session Context

WP-092 locked `parseLoadoutJson` as a pure lobby **shape guard** with a closed nine-code error enum and a byte-identical WP-093 `heroSelectionMode` template (five copies, stop-ship on drift per D-9201); WP-113/D-10014 made the engine's `validateMatchSetup` reject any composition id not in the `<setAbbr>/<slug>` qualified form, and D-24018 widened `MATCH-SETUP-JSON-SCHEMA.json`'s composition-id pattern to `^[a-z0-9-]+/[a-z0-9-]+$` to match. This packet closes the one remaining gap: the lobby shape guard never checks id **grammar**, so a stale or wrong-id-space loadout reaches the server and 500s instead of failing in the lobby with an actionable message.

---

## Goal

After this session, `parseLoadoutJson` rejects any of the five composition entity-id fields (`schemeId`, `mastermindId`, and every entry of `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`) whose value is not in the set-qualified `<setAbbr>/<slug>` envelope form, returning a new tenth error code `"unqualified_ext_id"` with a full-sentence message that names the failing field, quotes the offending value, and tells the user to re-export from the Registry Viewer loadout builder. The check is a hand-rolled envelope-grammar guard (exactly one `/`, non-empty `setAbbr` and `slug`, no surrounding whitespace) that mirrors the engine's `parseQualifiedId` (D-10014) and the canonical JSON schema's composition-id pattern — re-derived locally because the arena-client layer must not import the registry or the engine's setup-tooling surface at runtime. Both the MATCH-SETUP intake path and the LAGN intake path (which converts to a composition document and routes through `parseLoadoutJson`) gain the guard from this one change. A pre-D-24018 export — flat-card keys like `"core-scheme-midtown-bank-robbery"` or bare slugs like `"black-widow"` — now fails in the lobby with a clear "re-export" message instead of producing an opaque server `HTTP 500`.

Because the guard newly rejects bare-slug ids, the pre-existing valid-loadout **test fixtures** that still use the pre-qualified form (`parseLoadoutJson.test.ts`'s `VALID_COMPOSITION` and the one inline array override, and `lobbyApi.test.ts`'s `SAMPLE_CONFIG`) are migrated to qualified `<setAbbr>/<slug>` ids in the same change. This is a mechanical fixture-value update that leaves every existing assertion byte-identical — the same migration the engine side already did at D-10014/D-24018. It is **in scope** (see §Scope (In) B1 and D); omitting it leaves the WP-092 valid-path tests red, which is exactly what the original draft missed.

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
- **The existing nine error codes, the `COMPOSITION_FIELDS` type-check loop, and the fail-fast return order are unchanged.** The new check runs as a **separate pass after** the `COMPOSITION_FIELDS` type-check loop succeeds and **before** the `playerCount` checks — so a structurally valid composition with stale id-space values fails with `unqualified_ext_id` before non-composition validation continues. A value must already be a string / array-of-non-empty-strings before its grammar is checked.
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
- **Template literal encoding:** In `parseLoadoutJson.ts` the new message template uses **literal angle brackets**, not HTML entities — exactly as the existing `UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE` uses literal `<value>`. The placeholders are exactly `"<field>"` and `"<value>"`; the explanatory form inside the message is exactly `"<setAbbr>/<slug>"`. Do not emit `&lt;`/`&gt;` entities into TypeScript source.
- **Renderer visibility:** `renderUnqualifiedExtIdMessage(field, value)` is a **module-private** helper — do NOT export it (despite `renderUnsupportedModeMessage` being exported per WP-092; the new message has no cross-file contract). Tests assert the full user-facing message byte-for-byte against a literal expected string; they must not import the renderer or create a second reusable message source outside `parseLoadoutJson.ts`.
- **Internal helper visibility:** `isQualifiedExtId` and the array-walk helper are also module-private — tested through `parseLoadoutJson`, never imported directly.

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
  - `function renderUnqualifiedExtIdMessage(field: string, value: string): string` — substitutes `<field>` then `<value>`; never construct alternative phrasing. **Module-private** (not exported); the template uses literal angle brackets, never `&lt;`/`&gt;` entities (see Locked contract values).
- **Add a local grammar predicate** `function isQualifiedExtId(value: string): boolean` — returns true iff `value === value.trim()`, `value` contains exactly one `/`, and both the part before and the part after the slash are non-empty. JSDoc cites D-10014 / `parseQualifiedId` as the mirrored authority and notes it is re-derived (layer boundary). No `.reduce()`; explicit checks.
- **Add a new validation pass** that runs **after** the `COMPOSITION_FIELDS` type-check loop returns successfully and **before** the `playerCount` checks, so a structurally valid composition with stale id-space values fails with `unqualified_ext_id` before non-composition validation continues. (Ordering is locked, not optional: a value must already be a string / non-empty-string array before its grammar is meaningful, and the stale-id error is the one this WP exists to surface.) The pass checks, in field order, fail-fast (first offender returned):
  1. `compositionRaw['schemeId']` (string, already type-checked) — if not `isQualifiedExtId` → return `unqualified_ext_id`, `field: 'composition.schemeId'`.
  2. `compositionRaw['mastermindId']` — likewise, `field: 'composition.mastermindId'`.
  3. Each entry of `villainGroupIds`, then `henchmanGroupIds`, then `heroDeckIds` — first offending entry → return `unqualified_ext_id`, `field: 'composition.<name>[<index>]'`.
  - Implement as a small named helper that walks the three array fields (it appears three times → a helper is justified per §16.1; mirror the engine validator's `checkArrayExtIds` shape) plus two inline scalar checks, OR a single explicit pass over a local list of the five fields. Either way: explicit `for...of` / `for (let index …)`, no `.reduce()`, descriptive loop variables, each function ≤ 30 lines with JSDoc.
- The successful return path (the nine-field `ParsedLoadout`) is unchanged.

### B) `apps/arena-client/src/lobby/parseLoadoutJson.test.ts` — modified

**B1 — Migrate the shared valid-loadout fixtures to qualified ids (required; the guard now rejects bare slugs).** The WP-092 block's shared `VALID_COMPOSITION` fixture and the one inline `villainGroupIds / henchmanGroupIds / heroDeckIds` override (in the "returns ok for a document with multiple entries per array" test) carry bare-slug ids the new guard rejects. Without this migration every WP-092 valid-path test — the `ok: true` cases and every playerCount / heroSelectionMode case, which must first pass the composition — returns `unqualified_ext_id` and goes red. Migrate every composition id in those fixtures to qualified `<setAbbr>/<slug>` form per the mapping below. **Change only fixture VALUES — no WP-092 test assertion, name, count, or logic changes.** The `deepEqual` assertions compare against the same migrated constant and stay green; the `missing_field` / `wrong_type` tests already fail in the type-check loop before the guard and are unaffected. This migration is also what makes B2's single-field-injection cases writable: post-migration `buildValidDocument()` yields a guard-*passing* document, so a test can inject one bad id and isolate that field.

Migration mapping (bare-slug → qualified; the slug is arbitrary for a grammar-only guard — these values match the engine's qualified examples):

| Fixture field | Before | After |
|---|---|---|
| `schemeId` | `scheme-midtown-bank-robbery` | `core/midtown-bank-robbery` |
| `mastermindId` | `mastermind-magneto` | `core/magneto` |
| `villainGroupIds` | `['villains-brotherhood']` | `['core/brotherhood']` |
| `henchmanGroupIds` | `['henchmen-hand-ninjas']` | `['core/hand-ninjas']` |
| `heroDeckIds` | `['hero-spider-man', …, 'hero-black-widow']` | `['core/spider-man', 'core/hulk', 'core/wolverine', 'core/black-widow']` |
| inline `villainGroupIds` | `['villains-a','villains-b','villains-c']` | `['core/villains-a','core/villains-b','core/villains-c']` |
| inline `henchmanGroupIds` | `['henchmen-a','henchmen-b']` | `['core/henchmen-a','core/henchmen-b']` |
| inline `heroDeckIds` | `['hero-1', …, 'hero-5']` | `['core/hero-1', 'core/hero-2', 'core/hero-3', 'core/hero-4', 'core/hero-5']` |

**B2 — Add a `describe('parseLoadoutJson qualified-form guard (WP-254)')` block** (do not modify the WP-092 block's 30 test cases beyond the B1 fixture-value migration). Cover:
- A flat-card-key `schemeId` (`"core-scheme-midtown-bank-robbery"`, the exact field-report value) → `{ ok: false }`, `error.code === 'unqualified_ext_id'`, `error.field === 'composition.schemeId'`, and `assert.strictEqual` on the full rendered message.
- A bare-slug `mastermindId` (`"magneto"`) → `unqualified_ext_id`, `field === 'composition.mastermindId'`.
- A flat-key entry in `heroDeckIds` at index 2 → `field === 'composition.heroDeckIds[2]'` (proves bracket indexing + first-offender fail-fast).
- Edge envelope failures, each rejected: empty `setAbbr` (`"/black-widow"`), empty `slug` (`"core/"`), multiple slashes (`"core/x/y"`), leading/trailing whitespace (`" core/x"`, `"core/x "`).
- A fully-qualified valid document (`"core/midtown-bank-robbery"`, `"core/magneto"`, `["core/skrulls"]`, `["core/sentinel"]`, `["core/thor","core/black-widow"]`, valid counts, `playerCount: 2`) → `{ ok: true }` (proves no false rejection of engine-valid ids).
- A regression assertion that an existing WP-092 case (e.g. `missing_field` or the heroSelectionMode template) still returns its original code + message unchanged (proves the new pass is additive and ordered after the type checks).
- A **type-precedence** case: a non-string `schemeId` (e.g. `42`) or an array entry that is not a non-empty string still returns the original WP-092 `wrong_type` (or `missing_field`) code — never `unqualified_ext_id` — proving the qualified-form pass runs only after the `COMPOSITION_FIELDS` type-check loop succeeds. (Better than relying on the generic WP-092 regression case.)
- A **cross-field first-offender** case: a document with both `villainGroupIds[1]` and `heroDeckIds[0]` unqualified returns `field === 'composition.villainGroupIds[1]'`, proving deterministic array-field ordering (villain → henchman → hero) fails fast before later arrays are inspected — not a "collect-all-then-return-some-order" implementation.
- Tests use `node:test` + `node:assert` only; no `boardgame.io`, no network, no DB; `assert.strictEqual` on the full message (no substring / `.includes` / `assert.match`).

### C) `docs/ai/REFERENCE/MATCH-SETUP-VALIDATION.md` — modified

- **Reconcile §Stage 2** stale prose: change "ID patterns match `^[a-z0-9-]+$`" to reflect the actual canonical pattern — composition entity-ids match `^[a-z0-9-]+/[a-z0-9-]+$` (the set-qualified `<setAbbr>/<slug>` form, per `MATCH-SETUP-JSON-SCHEMA.json` and D-10014). Add a short rationale note in Markdown **prose** (this is a docs file, not source — do not write a literal `// why:` comment) citing D-24018 (the fix that widened the schema) and D-24025 (this reconciliation).
- **Add a short "Lobby pre-check (client)" note** under the existing validation infrastructure: `apps/arena-client`'s `parseLoadoutJson` performs a client-side **envelope-grammar** pre-check of the five entity-id fields before submission, rejecting non-qualified ids with error code `"unqualified_ext_id"` so a stale loadout fails in the lobby instead of as an opaque `Game.setup()` 500. Note it is grammar-only (the engine remains the existence authority) and is layer-boundary-safe (re-derived, no registry/engine import). Cite WP-254 / D-24025.
- Add the new code to the §Validation Failure Semantics / error-contract enumeration if one is present (keep the existing `unsupported_hero_selection_mode` text byte-unchanged).

### D) `apps/arena-client/src/lobby/lobbyApi.test.ts` — modified

Migrate this file's own `SAMPLE_CONFIG` fixture to qualified ids using the **same B1 mapping**. Two tests in its `parseLoadoutJson + createMatch (WP-092)` block round-trip `SAMPLE_CONFIG` through `parseLoadoutJson` and assert `parsed.ok === true`; the new guard rejects the bare-slug `SAMPLE_CONFIG` until it is migrated, so these two tests go red without this change (this is the second file — outside the original three-file allowlist — that the empirical scaffold surfaced). **Change only the fixture VALUES — no assertion, name, or logic changes.** The `lobbyApi (WP-090)` tests above it (`createMatch` / `listMatches`) do not route through `parseLoadoutJson`, so the guard does not apply to them; they assert round-trip equality against the same `SAMPLE_CONFIG` constant and stay green with the migrated values.

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
- `apps/arena-client/src/lobby/parseLoadoutJson.test.ts` — **modified** — new `WP-254` describe block (B2) + `VALID_COMPOSITION` / inline-override fixture migration to qualified ids (B1); WP-092 test assertions, names, and count unchanged.
- `apps/arena-client/src/lobby/lobbyApi.test.ts` — **modified** — `SAMPLE_CONFIG` fixture migration to qualified ids (D); assertions, names, and count unchanged.
- `docs/ai/REFERENCE/MATCH-SETUP-VALIDATION.md` — **modified** — §Stage 2 id-pattern reconciliation + lobby pre-check note + new error code.

Governance at close (not in the SPEC-draft commit; landed by the execution session): `docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (**D-24025**), `docs/ai/work-packets/WORK_INDEX.md` (WP-254 ✅), `docs/ai/execution-checklists/EC_INDEX.md` (EC-285 Done), `docs/05-ROADMAP-MINDMAP.md`.

**Commit-scope split:** the implementation/code commit (`EC-285:`) contains **only the four Files Expected to Change** above (`parseLoadoutJson.ts`, `parseLoadoutJson.test.ts`, `lobbyApi.test.ts`, `MATCH-SETUP-VALIDATION.md`). The governance-close files are updated in a separate closeout commit/phase **after** code verification — never bundled into the parser/docs code commit. A governance file appearing in the code commit's `git diff --name-only` is a scope failure.

No other files may be modified.

---

## Acceptance Criteria

All items binary pass/fail.

### A) Parser
- [ ] `ParseErrorCode` contains exactly ten members; the new one is `"unqualified_ext_id"`; the original nine are unchanged in spelling and order-of-declaration intent.
- [ ] `isQualifiedExtId` returns `false` for `"core-scheme-midtown-bank-robbery"`, `"black-widow"`, `"/x"`, `"core/"`, `"core/x/y"`, `" core/x"`, `"core/x "`, and `""`; returns `true` for `"core/black-widow"` and `"vill/magneto"`.
- [ ] The qualified-form pass runs only after the `COMPOSITION_FIELDS` type-check loop succeeds; a value that already failed a type check returns its original code (`missing_field` / `wrong_type`), never `unqualified_ext_id`.
- [ ] An `unqualified_ext_id` error always carries `field`; an array offender uses bracket notation (`composition.heroDeckIds[2]`); the message equals `renderUnqualifiedExtIdMessage(field, value)` byte-for-byte.
- [ ] `parseLoadoutJson.ts` contains no import from `@legendary-arena/registry`, `@legendary-arena/game-engine`, or `@legendary-arena/game-engine/setup`, and contains no runtime call to the engine qualified-id parser. A comment may name `parseQualifiedId` only as the mirrored authority (confirmed with `Select-String` — see Verification Steps 3 and 3b; the import grep must not flag the JSDoc citation).
- [ ] The WP-093 `UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE` const is byte-unchanged (confirmed with `Select-String` / `git diff`).

### B) Tests
- [ ] `pnpm --filter @legendary-arena/arena-client test` exits 0. The WP-092 30-test block passes with its **assertions, names, and count unchanged** — only the `VALID_COMPOSITION` / inline-override fixture VALUES were migrated to qualified ids (B1). The `lobbyApi.test.ts` `parseLoadoutJson + createMatch (WP-092)` block passes with `SAMPLE_CONFIG` migrated (D); the `lobbyApi (WP-090)` block is unaffected.
- [ ] The new block asserts the flat-key, bare-slug, array-index, and all four edge-envelope rejections, plus the all-qualified accept, plus one WP-092 regression, plus the type-precedence case (`wrong_type`/`missing_field` wins over `unqualified_ext_id`) and the cross-field first-offender case (`composition.villainGroupIds[1]` before `heroDeckIds`) — each with `assert.strictEqual` on the full message where a message is asserted.
- [ ] Both test files import only `node:test` / `node:assert` for the new/changed lines (no `boardgame.io`, no network, no DB).

### C) Docs
- [ ] `MATCH-SETUP-VALIDATION.md §Stage 2` no longer states the bare `^[a-z0-9-]+$` pattern for composition entity-ids; it states the qualified `^[a-z0-9-]+/[a-z0-9-]+$` form and cites D-24018 / D-24025.
- [ ] `MATCH-SETUP-VALIDATION.md` documents the lobby `unqualified_ext_id` pre-check (grammar-only, layer-boundary-safe) citing WP-254 / D-24025.

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified (confirmed with `git diff --name-only`).
- [ ] In the implementation/code commit, only the four Files Expected to Change appear; governance-close files (`STATUS.md`, `DECISIONS.md`, `WORK_INDEX.md`, `EC_INDEX.md`, `05-ROADMAP-MINDMAP.md`) land only in the separate closeout commit after verification.

---

## Verification Steps

```pwsh
# Step 1 — arena-client tests (the package that owns parseLoadoutJson)
pnpm --filter @legendary-arena/arena-client test
# Expected: all tests pass, 0 failing (WP-092 block + new WP-254 block)

# Step 2 — arena-client typecheck (the green-path gate per the UIState backfill history)
pnpm --filter @legendary-arena/arena-client typecheck
# Expected: exits 0, no vue-tsc errors

# Step 3 — confirm the layer boundary: no registry / engine import (import lines only)
Select-String -Path "apps\arena-client\src\lobby\parseLoadoutJson.ts" -Pattern "from\s+['""]@legendary-arena/(registry|game-engine)"
# Expected: no output

# Step 3b — confirm any engine qualified-id parser reference is comment-only
Select-String -Path "apps\arena-client\src\lobby\parseLoadoutJson.ts" -Pattern "parseQualifiedId"
# Expected: matches ONLY the JSDoc / why: comment that names the mirrored authority —
# no import statement and no call site (no `parseQualifiedId(` invocation).
# Step 3 deliberately targets import lines so the required JSDoc citation does not self-trip the gate.

# Step 4 — confirm the WP-093 template is byte-unchanged
git diff -- apps/arena-client/src/lobby/parseLoadoutJson.ts | Select-String -Pattern "UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE"
# Expected: no removed/changed line for the template const (only additions elsewhere in the file)

# Step 5 — confirm exactly the expected files changed
git diff --name-only
# During the implementation/code commit: ONLY the four files in ## Files Expected to Change
#   (parseLoadoutJson.ts, parseLoadoutJson.test.ts, lobbyApi.test.ts, MATCH-SETUP-VALIDATION.md).
# During governance closeout: those four plus STATUS.md, DECISIONS.md, WORK_INDEX.md,
#   EC_INDEX.md, and 05-ROADMAP-MINDMAP.md. Governance files must NOT appear in the code commit.
```

---

## User-Visible Impact

On `play.legendary-arena.com`, a user who uploads or pastes a stale loadout (a pre-D-24018 export with flat-card keys like `core-scheme-midtown-bank-robbery` or bare slugs like `black-widow`) now sees an actionable in-lobby error — `unqualified_ext_id`: "…re-export it from the Registry Viewer loadout builder…" — instead of the previous opaque `Game.setup()` HTTP 500. The success path is unchanged: a current, qualified loadout submits exactly as before. This is an **error-path UX improvement**, not a new feature — observable, but only when a malformed loadout is submitted. (Surface reachability: the lobby loadout-paste / upload path is the WP-092 / WP-244–245 ingestion surface; the live-verification evidence states honestly whether it is fully user-facing or developer/beta on live play today.)

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
- **§17 Vision:** N/A — declared above with reasons (no trigger surface). **§18 prose-vs-grep:** PASS — Step 3 targets **import lines only** (`from '@legendary-arena/(registry|game-engine)'`), and Step 3b checks `parseQualifiedId` separately with an expected-comment-only result, so the required JSDoc citation of `parseQualifiedId` (the mirrored authority) does not self-trip the layer-boundary gate. This WP's prose names `@legendary-arena/registry`/`parseQualifiedId` as the things NOT imported, citing the governing layer-boundary rule rather than as a forbidden-token enumeration under the grep's path. **§19 bridge-vs-HEAD:** N/A (not a repo-state-summary artifact). **§20 funding / §21 API catalog:** N/A — declared above with reasons.

---

## Pre-Flight Self-Review (drafting session)

- **Behavior identity (CORRECTED 2026-06-15):** the new pass is additive and ordered after the type-check loop, so a *malformed-type* value still returns its original WP-092 code. But the original draft's claim "no existing test's expected code/message changes" was **wrong**: the new code fires on any value that is a valid string lacking the `/` envelope, and the pre-existing valid-loadout fixtures (`VALID_COMPOSITION`, the inline array override, and `lobbyApi.test.ts`'s `SAMPLE_CONFIG`) are exactly that — bare-slug strings. An empirical scaffold run (see the redraft note below) showed 16 WP-092 tests go red until those fixtures are migrated to qualified ids. The fixture migration (B1 + D) is therefore in scope; with it, every WP-092 assertion is unchanged and green.
- **Layer boundary holds:** the grammar is re-derived (≈6 lines), matching the module's existing hand-rolled-predicate posture; no new import edge into registry/engine.
- **Envelope-not-charset is intentional:** mirroring `parseQualifiedId`'s looser grammar (not the JSON-schema charset) avoids a lobby check that could reject an engine-valid id — the inverse of the bug being fixed. Documented as a `// why:`.
- **Five-copy gate untouched:** the new message is single-home; the WP and EC explicitly forbid joining it to the WP-093 byte-identity gate.
- **Open question for review:** none blocking. Optional follow-up (NOT this WP): a future packet could also surface the *granularity* hint (per-card vs per-group) — but that needs registry data the lobby cannot import, so it stays server-side. Noted, not scoped.
- **Hardening pass (post-draft, 2026-06-15):** an operator audit-review tightened the spec without changing scope, contract, or the file allowlist: (1) the qualified-form pass ordering is now **locked** after the `COMPOSITION_FIELDS` type loop and **before** `playerCount` (was "either acceptable"); (2) the layer-boundary verification grep is split — Step 3 targets `from '@legendary-arena/...'` import lines, Step 3b checks `parseQualifiedId` as comment-only — so the required mirrored-authority JSDoc citation no longer self-trips the gate (§18); (3) `renderUnqualifiedExtIdMessage` / `isQualifiedExtId` / the array-walk helper are locked **module-private** (despite the exported `renderUnsupportedModeMessage`); (4) two tests added (type-precedence: `wrong_type` wins over `unqualified_ext_id`; cross-field first-offender: `villainGroupIds[1]` before `heroDeckIds`); (5) literal-angle-bracket template encoding locked; (6) the implementation/code commit vs governance-closeout file scope split made explicit. Per `01.0a §Step 3`, this is a `SPEC:` surgical correction, not a new draft; the re-run rule was honored — **pre-flight re-verdict: READY TO EXECUTE; copilot re-verdict: PASS; lint: 21/21 resolved** (against the edited artifacts, dependency contracts re-confirmed: `parseQualifiedId` @ `matchSetup.validate.ts:102`, schema composition-id pattern `^[a-z0-9-]+/[a-z0-9-]+$`, stale `MATCH-SETUP-VALIDATION.md §Stage 2` @ line 155).
  - **NOTE (2026-06-15):** this hardening-pass re-verdict was reached by *reasoning*, not by running the suite, and it inherited the false "no existing test changes" claim. That is precisely the failure the redraft below corrects.
- **Redraft after empirical scaffold (2026-06-15):** this WP *tightens* validation on an existing input path, so per the new `01.0a §Step 3` framing question and `01.4 §Empirical Scaffold (Validation-Tightening WPs)` (both added in the same incident), the re-verdict is grounded in an observed run, not an argument. Procedure: the parser change (tenth code + `isQualifiedExtId` + the fail-fast pass) was prototyped on a throwaway branch and `pnpm --filter @legendary-arena/arena-client test` was run. **Observed: 568 → 552 pass / 16 fail.** All 16 root-caused to bare-slug valid-loadout fixtures — 14 in `parseLoadoutJson.test.ts` (shared `VALID_COMPOSITION` + the one inline override) and 2 in `lobbyApi.test.ts` (`SAMPLE_CONFIG`, outside the original three-file allowlist). Corrections folded in: (a) fixture migration to qualified ids is in scope (B1, D); (b) `lobbyApi.test.ts` added to the allowlist — **four** code files now; (c) the "WP-092 untouched" language is now "assertions unchanged, fixtures migrated"; (d) the false behavior-identity claim above is corrected; (e) the missing `WORK_INDEX` / `EC_INDEX` / `DECISIONS` rows (a Phase-1 DoD gap in #332/#334) are landed by this redraft SPEC commit. The throwaway branch was discarded; the execution session re-implements against this corrected scope and confirms final-green. **Re-verdict: READY TO EXECUTE (empirically grounded); copilot: PASS; lint: 21/21 resolved.**

---

## Definition of Done

- [x] All acceptance criteria pass.
- [x] `pnpm --filter @legendary-arena/arena-client test` exits 0 (568 → 576 / 0); `pnpm --filter @legendary-arena/arena-client typecheck` exits 0.
- [x] `ParseErrorCode` has exactly ten members; WP-093 template byte-unchanged; no registry/engine import in `parseLoadoutJson.ts` (import-line grep empty; `parseQualifiedId` comment-only).
- [x] No files outside `## Files Expected to Change` modified in the `EC-285:` code commit (`git diff --name-only` = the four files).
- [x] `docs/ai/STATUS.md` updated — the lobby now rejects non-qualified loadout ids with an actionable message instead of a server 500.
- [x] `docs/ai/DECISIONS.md` updated — **D-24025** flipped Reserved → Active.
- [x] `docs/ai/work-packets/WORK_INDEX.md` has WP-254 checked off (2026-06-16, EC-285 `25f40038`).
- [x] `docs/ai/execution-checklists/EC_INDEX.md` has EC-285 marked Done.
- [x] `docs/05-ROADMAP-MINDMAP.md` WP-254 node added; `node scripts/roadmap-counts.mjs --check` passes.
- [x] **D-24026 live-verification (User-Visible Surface = play.legendary-arena.com)** — ✅ **2026-06-16.** PR #342 merged (`765f75c2`); the Cloudflare Pages play deploy is serving `assets/index-BXp3Og8h.js`, whose embedded `__GIT_SHA__` = `765f75c` (the merge SHA) and which contains both the `unqualified_ext_id` code and the `set-qualified ext_id` guard message — deploy-confirmed-SHA evidence with the new code string present in the served bundle. Recorded in STATUS.md.
