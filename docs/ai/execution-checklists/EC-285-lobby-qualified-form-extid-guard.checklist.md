# EC-285 — Lobby Qualified-Form Ext_id Guard (Execution Checklist)

**Source:** docs/ai/work-packets/WP-254-lobby-qualified-form-extid-guard.md
**Layer:** Arena Client (`apps/arena-client/src/lobby/**`) + one governance-reference reconciliation (`MATCH-SETUP-VALIDATION.md`).
**No engine, registry, server, or `data/cards/**` change.**
**Decision:** D-24025 (reserved).

Authoritative execution contract for WP-254. Compliance is binary.

---

## Before Starting

- [ ] On `main`, clean, ff-synced. `pnpm --filter @legendary-arena/arena-client test` + `typecheck` exit 0 on the base.
- [ ] Read `apps/arena-client/src/lobby/parseLoadoutJson.ts` end-to-end. Record verbatim: the `ParseErrorCode` union (nine codes), the `COMPOSITION_FIELDS` list + the type-check loop, the **fail-fast first-error return** discipline, the locked `UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE` const + `renderUnsupportedModeMessage`, and the successful-return shape (nine-field `ParsedLoadout`).
- [ ] Read `packages/game-engine/src/matchSetup.validate.ts §parseQualifiedId` for the envelope grammar to mirror (reference only — DO NOT import it; arena-client may not import the engine setup surface, D-14401).
- [ ] Confirm `MATCH-SETUP-JSON-SCHEMA.json` composition-id fields already carry `^[a-z0-9-]+/[a-z0-9-]+$` (D-24018) and `MATCH-SETUP-VALIDATION.md §Stage 2` still says the stale `^[a-z0-9-]+$`.

---

## Locked Values

- **WP:** WP-254. **EC:** EC-285. **Decision:** D-24025 (reserved).
- **New error code (1, additive):** `"unqualified_ext_id"`. `ParseErrorCode` goes from **nine to exactly ten** members. The existing nine — `"invalid_json"`, `"not_object"`, `"missing_composition"`, `"composition_not_object"`, `"missing_field"`, `"wrong_type"`, `"missing_player_count"`, `"player_count_out_of_range"`, `"unsupported_hero_selection_mode"` — are byte-unchanged.
- **The five entity-id fields checked (locked):** `schemeId`, `mastermindId` (scalars); each element of `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`. The four count fields (`bystandersCount`, `woundsCount`, `officersCount`, `sidekicksCount`) are **never** id-checked.
- **Envelope grammar (locked — mirror of `parseQualifiedId`, NOT the JSON-schema charset):** `isQualifiedExtId(value)` is true iff ALL of: `value === value.trim()`; `value` contains exactly one `/`; the part before the slash is non-empty; the part after the slash is non-empty. Anything else (no slash, ≥2 slashes, empty segment, surrounding whitespace, empty string) → false → `unqualified_ext_id`. **Do NOT add a charset (`[a-z0-9-]`) check** — the engine owns charset/existence; a lobby charset check could reject an engine-valid id (the inverse of the bug).
- **Message (single-home — NOT the five-copy gate):**
  `The loadout field "<field>" value "<value>" is not a set-qualified ext_id of the form "<setAbbr>/<slug>" (for example, "core/black-widow"). This usually means the loadout was exported before the qualified-ext_id fix; re-export it from the Registry Viewer loadout builder at cards.barefootbetters.com.`
  `<field>` and `<value>` are the ONLY permitted substitutions, via `renderUnqualifiedExtIdMessage(field, value)`. This message lives in exactly ONE place (`parseLoadoutJson.ts`); it is documented (NOT byte-locked) in `MATCH-SETUP-VALIDATION.md`. It MUST NOT be added to the WP-093 five-copy byte-identity gate, and MUST NOT reuse/paraphrase the heroSelectionMode template.
- **`field` presence (locked):** every `unqualified_ext_id` error carries `field`. Scalars: `composition.schemeId` / `composition.mastermindId`. Array element: `composition.<name>[<index>]` with bracket notation (e.g. `composition.heroDeckIds[2]`), mirroring the engine validator's `checkArrayExtIds` field style.
- **Ordering (locked):** the qualified-form pass runs **after** the `COMPOSITION_FIELDS` type-check loop has fully succeeded (every entity-id is already a string / non-empty-string array) and is **fail-fast** (first offender returned, scalar fields before array fields, arrays in the order villain → henchman → hero, ascending index). A value that fails a type check returns its original `missing_field` / `wrong_type` code — it never reaches the qualified pass.
- **Commit message (execution):** `EC-285: lobby qualified-form ext_id guard — parseLoadoutJson (D-24025)`. (`EC-###:` prefix — code staged. The drafting commit that lands this WP+EC is a separate `SPEC:` commit.)

---

## Guardrails

- **Layer boundary (hard):** `parseLoadoutJson.ts` imports NOTHING from `@legendary-arena/registry`, `@legendary-arena/game-engine`, `@legendary-arena/game-engine/setup`, or any runtime engine/registry code. The grammar is re-derived locally (the module already does this for its shape predicates).
- **WP-093 template frozen:** `UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE` and `renderUnsupportedModeMessage` are byte-unchanged; the five-copy byte-identity gate (DECISIONS D-9301, MATCH-SETUP-VALIDATION.md, `setupContract.types.ts:117`, the dist `.d.ts`, this file) is untouched. The new message does NOT join it.
- **Existing nine codes + type loop frozen:** no rename, reorder, or removal; the `COMPOSITION_FIELDS` loop body is unchanged. The change is purely additive (one code, one const, one helper predicate, one new pass).
- **Pure parser preserved:** no I/O, no clock, no randomness, no mutation; identical input → identical `ParseResult`. No `boardgame.io` import anywhere in the file or its test.
- **No `.reduce()`** in the new pass or the array-walk helper; explicit `for...of` / indexed `for` with descriptive loop variables; each function ≤ 30 lines with JSDoc.
- **Grammar-only:** never attempt registry existence, set-loaded, charset, or hero-group-vs-card granularity checks — those stay server-side (D-10014). The lobby's job is to catch the obvious no-slash id-space mistake before submission.
- **`LobbyView.vue` / `lagnLoadout.ts` unchanged:** `applyParseResult` already surfaces `result.error.message`; the LAGN path already routes through `parseLoadoutJson`. Both gain the guard with zero edits. If `tsc` wants either touched, the change leaked out of the parser — re-confine.
- **`MATCH-SETUP-VALIDATION.md` is the ONLY non-arena-client file touched in the code commit.** Do not edit `MATCH-SETUP-JSON-SCHEMA.json` (already qualified) or `MATCH-SETUP-SCHEMA.md`.

---

## Required `// why:` Comments

- At `isQualifiedExtId`: it mirrors the engine's `parseQualifiedId` envelope grammar (D-10014) and is **re-derived by hand** because the arena-client layer must not import the engine setup surface (D-14401) — cite both.
- At the envelope-not-charset decision: why the lobby checks only the slash envelope and NOT `[a-z0-9-]` — a charset check could reject an engine-valid id (the inverse of the D-24018 bug); the engine owns charset/existence (D-24025).
- At `UNQUALIFIED_EXT_ID_TEMPLATE`: this message is **single-home** and is deliberately NOT part of the WP-093 five-copy byte-identity gate (D-9301) — paraphrase/assembly is fine to avoid here, but it carries no cross-file lock (D-24025).
- At the new qualified-form pass: why it runs AFTER the type-check loop (a value must be a valid string / non-empty-string array before its grammar is meaningful) and is fail-fast.

---

## Files to Produce

- `apps/arena-client/src/lobby/parseLoadoutJson.ts` — **modified** — tenth code `"unqualified_ext_id"`; `UNQUALIFIED_EXT_ID_TEMPLATE` + `renderUnqualifiedExtIdMessage`; `isQualifiedExtId`; the fail-fast qualified-form pass + array-walk helper.
- `apps/arena-client/src/lobby/parseLoadoutJson.test.ts` — **modified** — new `describe('parseLoadoutJson qualified-form guard (WP-254)')` block; the WP-092 30-test block untouched.
- `docs/ai/REFERENCE/MATCH-SETUP-VALIDATION.md` — **modified** — §Stage 2 pattern reconciliation (`^[a-z0-9-]+$` → `^[a-z0-9-]+/[a-z0-9-]+$` for composition entity-ids, cite D-24018/D-24025) + the lobby `unqualified_ext_id` pre-check note (grammar-only, layer-boundary-safe, cite WP-254/D-24025).
- Governance (execution close, NOT the SPEC commit): `STATUS.md`, `DECISIONS.md` (D-24025), `WORK_INDEX.md` (WP-254 ✅), `EC_INDEX.md` (EC-285 Done), `05-ROADMAP-MINDMAP.md`.

---

## After Completing

- [ ] `pnpm --filter @legendary-arena/arena-client test` — all pass / 0 fail; WP-092 block unchanged; new WP-254 block green.
- [ ] `pnpm --filter @legendary-arena/arena-client typecheck` exits 0.
- [ ] `ParseErrorCode` has exactly 10 members; `"unqualified_ext_id"` present; nine originals byte-unchanged.
- [ ] `isQualifiedExtId` truth table holds: false for `"core-scheme-midtown-bank-robbery"`, `"black-widow"`, `"/x"`, `"core/"`, `"core/x/y"`, `" core/x"`, `"core/x "`, `""`; true for `"core/black-widow"`, `"vill/magneto"`.
- [ ] A flat-key `schemeId` → `unqualified_ext_id`, `field === 'composition.schemeId'`, `assert.strictEqual` on the full message; a flat-key `heroDeckIds[2]` → `field === 'composition.heroDeckIds[2]'`; an all-qualified document → `{ ok: true }`; a WP-092 regression case still returns its original code/message.
- [ ] `Select-String -Path apps\arena-client\src\lobby\parseLoadoutJson.ts -Pattern "@legendary-arena/registry|@legendary-arena/game-engine|parseQualifiedId"` → no output.
- [ ] WP-093 template const byte-unchanged (`git diff` shows additions only, no edit to `UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE`).
- [ ] `MATCH-SETUP-VALIDATION.md §Stage 2` no longer carries the bare `^[a-z0-9-]+$` for composition ids; the lobby pre-check is documented.
- [ ] `git diff --name-only` → only the three Files to Produce (+ governance at close).
- [ ] `node scripts/roadmap-counts.mjs --check` passes (WP-254 node present).

---

## Common Failure Smells

- A pre-existing WP-092 test's expected **code or message** changed → the new pass is not additive/ordered-after; it must only fire on a value that already passed its type check. Revert and re-order.
- The new message reuses or paraphrases the heroSelectionMode template, or gets added to the five-copy gate → it is single-home; keep it separate (D-24025 vs D-9301).
- `parseLoadoutJson.ts` imports `parseQualifiedId` / the engine / the registry → layer-boundary violation; re-derive the ≈6-line grammar locally.
- A valid qualified id (`"core/black-widow"`) is rejected → a charset check crept in; the grammar is slash-envelope ONLY.
- `isQualifiedExtId("core/")` or `("/x")` returns true → the empty-segment guard is missing.
- An array offender's `field` is `composition.heroDeckIds` without the `[index]` → bracket notation missing (mirror the engine's `checkArrayExtIds`).
- `LobbyView.vue`, `lagnLoadout.ts`, `MATCH-SETUP-JSON-SCHEMA.json`, or any engine/registry file in the diff → the change leaked; re-confine to the three Files to Produce.
- The qualified pass runs before the type-check loop and throws/`undefined`-derefs on a non-string id → it must run only after the type loop succeeds.
- `assert.match` / `.includes()` / substring used on the message → use `assert.strictEqual` on the full rendered message.
