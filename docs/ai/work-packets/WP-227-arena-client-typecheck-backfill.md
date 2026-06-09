# WP-227 — Arena Client Typecheck Restoration (WP-214 + WP-222 UIState/UICityCard Backfill)

**Status:** Draft (2026-06-09) — pre-flight READY TO EXECUTE; queued (EC-259)
**Primary Layer:** Client (`apps/arena-client/**`) — App layer only; zero engine/registry/server/preplan changes
**Dependencies:** WP-214 (landed — added `UIState.villainAttachedHeroes` + `UICityCard.attachedHeroes`/`fightCost`), WP-222 (landed — added `UIState.pendingHeroChoice?`). Both contracts are correct and read-only here; only the arena-client consumers were never conformed.

---

## Session Context

Two engine UI-projection contracts shipped without their arena-client test
fixtures and one component prop being conformed:

- **WP-214** made `UIState.villainAttachedHeroes: Record<string, string[]>` a
  **required** field and added `UICityCard.attachedHeroes: string[]` +
  `UICityCard.fightCost: number` (both required)
  (`packages/game-engine/src/ui/uiState.types.ts:66,230,232`).
- **WP-222** added the optional `UIState.pendingHeroChoice?: UIPendingHeroChoice`
  field (`uiState.types.ts:75`), consumed by `PendingHeroChoicePrompt.vue`.

The arena-client's inline-`UIState` / inline-`UICityCard` test fixtures, the
three committed JSON fixtures, and the `PendingHeroChoicePrompt` prop type were
never updated, so `vue-tsc --noEmit` reports **19 errors across 14 files**. The
`Typecheck Arena Client` CI gate (re-wired into the unified CI workflow by #240,
`a1cbe23`, after WP-224) now exercises this on every PR; WP-225's PR (#243) was
the first to surface it. Because `main` is not branch-protected, the red gate
did not block the WP-214/222/223/224 merges — the drift accumulated silently.

This is the same class of work as **WP-166 / EC-184** ("Restore arena-client
vue-tsc green + CI typecheck gate") and **WP-207a / WP-207b** (the
`notableEvents` fixture/test backfill); it differs only in which engine fields
drifted. The engine contracts are correct and **read-only** here — the fix is
entirely client-side conformance, no runtime behavior change.

**Single-WP rationale:** all 16 files serve one goal — restore `vue-tsc` green
for the WP-214 + WP-222 deltas. The gate only flips green when **every** error
clears, so splitting into per-contract WPs (à la WP-207a/b) would create
"BLOCKED until sibling lands" coupling for no benefit and is the
over-decomposition the WP-design guidance warns against. The edits are
homogeneous mechanical backfills in one layer, lock zero new decisions, and
cross no layer boundary.

---

## Goal

After this session, `pnpm --filter @legendary-arena/arena-client typecheck`
(`vue-tsc --noEmit`) exits 0 and the `Typecheck Arena Client` CI gate is green.
The fix backfills the two required WP-214 fields (`villainAttachedHeroes` on
inline `UIState`; `attachedHeroes` + `fightCost` on inline `UICityCard`) into
the arena-client test fixtures and the three JSON fixtures, and widens the
`PendingHeroChoicePrompt` `pendingHeroChoice` prop type to accept `undefined`
(the WP-222 `exactOptionalPropertyTypes` mismatch). The arena-client test suite
(`vitest`) continues to pass. No engine, registry, server, or preplan code is
touched.

---

## Assumes

- **WP-214 landed and is correct.** `packages/game-engine/src/ui/uiState.types.ts`
  exports `UIState.villainAttachedHeroes: Record<string, string[]>` (required,
  line 66), `UICityCard.attachedHeroes: string[]` (line 230), and
  `UICityCard.fightCost: number` (line 232). These are read-only here.
- **WP-222 landed and is correct.** `uiState.types.ts:75` exports the optional
  `UIState.pendingHeroChoice?: UIPendingHeroChoice`. `PendingHeroChoicePrompt.vue`
  declares the prop `pendingHeroChoice` as
  `type: Object as PropType<UIPendingHeroChoice>, required: false, default: undefined`
  (line 26–30), which under `exactOptionalPropertyTypes: true` rejects an
  explicit `undefined` passed from `snapshot.pendingHeroChoice`
  (`UIPendingHeroChoice | undefined`).
- `pnpm --filter @legendary-arena/arena-client typecheck` currently exits 2
  (FAILING). At baseline it reports exactly **three error classes**: (a) inline
  `UIState` objects missing `villainAttachedHeroes`; (b) inline `UICityCard`
  objects missing `attachedHeroes` and/or `fightCost`; (c) an
  `exactOptionalPropertyTypes` error on the `pendingHeroChoice` prop. **The error
  classes and the affected file set (`## Files Expected to Change`) are
  authoritative.** The observed totals (19 errors / 14 files) and the exact line
  numbers are expected-but-**advisory** — they may shift by ±1 as edits land and
  must NOT, on their own, trigger a STOP. A STOP fires only on a *new* error class
  (`## Hard Stop Conditions` #3) or a *missing* expected class.
- The arena-client `vitest` suite currently passes (runtime is unaffected by the
  typecheck failures; `vitest` uses esbuild, which does not type-check).
- Baseline: `origin/main` at `26fbc911` (`git rev-parse origin/main`,
  2026-06-09).

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirms
  arena-client lives on the client side of the engine boundary. The `UIState` /
  `UICityCard` / `UIPendingHeroChoice` contracts are engine-owned and **read-only**
  here; this WP touches only client test fixtures, JSON fixtures, and one
  component prop type.
- `packages/game-engine/src/ui/uiState.types.ts` — read the `UIState`,
  `UICityCard`, and `UIPendingHeroChoice` declarations (lines 43, 66, 75, 220–232,
  431). Confirm the three required fields and the optional `pendingHeroChoice`.
  **Do not modify** — the contract is correct.
- `apps/arena-client/src/fixtures/uiState/typed.ts` and `index.ts` — read both
  fully. Each `<json> satisfies UIState` (typed.ts) and the `return`s in index.ts
  fail **because the JSON they wrap is stale**. **Do not modify either file** —
  their errors are downstream of the JSON (WP-207a discipline).
- `apps/arena-client/src/components/play/PendingHeroChoicePrompt.vue` — read the
  `props` block (line 25–41). The single fix is widening the `pendingHeroChoice`
  `PropType`; the component's runtime logic already handles `undefined`
  (`shouldRender()`, line 49–55).
- `docs/ai/work-packets/WP-207a-arena-client-uistate-fixture-backfill.md` and
  `WP-207b-...` — the direct precedent for the JSON-fixture and test-file backfill
  discipline.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 14 (field names match the data
  contract): the added members use the canonical engine names `villainAttachedHeroes`,
  `attachedHeroes`, `fightCost` — no abbreviation or paraphrase.

---

## Scope (In)

**Component prop (1 file):**
- `PendingHeroChoicePrompt.vue` — widen the `pendingHeroChoice` prop from
  `PropType<UIPendingHeroChoice>` to `PropType<UIPendingHeroChoice | undefined>`
  (keep `required: false`, `default: undefined`). This is the single change that
  clears all three `pendingHeroChoice` `exactOptionalPropertyTypes` errors
  (`PlayDesktop.vue:453`, `PlayMobile.vue:272`, `PendingHeroChoicePrompt.test.ts:83`).

**JSON fixtures (3 files):**
- Add top-level `"villainAttachedHeroes": {}` to `mid-turn.json`,
  `endgame-win.json`, `endgame-loss.json`.
- Add `"attachedHeroes": []` and `"fightCost": 0` to **each non-null city card**
  in `mid-turn.json` (3 cards) and `endgame-loss.json` (5 cards). `endgame-win.json`
  has 0 city cards, so only the top-level field is added.

**Inline-`UIState` / inline-`UICityCard` test files (9 files):**
- Add `villainAttachedHeroes: {}` to each inline `UIState` literal in:
  `components/AutoplayControls.test.ts`, `components/play/TopHudBar.test.ts`,
  `pages/PlayDesktop.test.ts`, `pages/PlayMobile.test.ts`,
  `services/autoplayPlayback.test.ts`, `preplan/mutationDetector.test.ts`,
  `preplan/mutationMiddleware.test.ts`.
- Add `attachedHeroes: []` + `fightCost: 0` to each inline `UICityCard` literal
  in: `components/play/CityRow.test.ts`, `composables/useCityRow.test.ts`,
  `preplan/mutationDetector.test.ts` (the latter contains both an inline `UIState`
  and an inline `UICityCard`).

**Governance (3 files):**
- `docs/ai/STATUS.md` — Done entry.
- `docs/ai/work-packets/WORK_INDEX.md` — status Ready → Done.
- `docs/ai/execution-checklists/EC_INDEX.md` — status Ready → Done.

## Out of Scope

- **Modifying `index.ts` or `typed.ts`** — both are correct; their 6 errors are
  downstream of the stale JSON (WP-207a discipline). Editing them masks the real fix.
- **Modifying the engine-owned types** (`uiState.types.ts`) — the WP-214/222
  contracts are correct; only the consumers drifted.
- **Modifying `PendingHeroChoicePrompt.test.ts`** — its `pendingHeroChoice: undefined`
  mount becomes valid once the component prop is widened; the test needs no edit.
- **Changing runtime behavior** — the prop widening is type-only; the component
  already branches on `pendingHeroChoice !== undefined`.
- **Any engine, registry, server, preplan, or registry-viewer code.**
- **Adding new tests, refactoring fixtures, or changing existing assertions**
  beyond the additive field backfill. If a `vitest` assertion breaks from the
  backfilled value (e.g. a snapshot now shows `fightCost: 0`), update that one
  assertion in-place; do not expand scope.

---

## Files Expected to Change

**Source (13):**
1. `apps/arena-client/src/components/play/PendingHeroChoicePrompt.vue` — widen `pendingHeroChoice` `PropType` (fixes `PlayDesktop.vue:453`, `PlayMobile.vue:272`, `PendingHeroChoicePrompt.test.ts:83`)
2. `apps/arena-client/src/fixtures/uiState/mid-turn.json` — `+villainAttachedHeroes:{}`; `+attachedHeroes:[]`/`+fightCost:0` on 3 city cards
3. `apps/arena-client/src/fixtures/uiState/endgame-win.json` — `+villainAttachedHeroes:{}` (0 city cards)
4. `apps/arena-client/src/fixtures/uiState/endgame-loss.json` — `+villainAttachedHeroes:{}`; `+attachedHeroes:[]`/`+fightCost:0` on 5 city cards
5. `apps/arena-client/src/components/AutoplayControls.test.ts` — `+villainAttachedHeroes:{}`
6. `apps/arena-client/src/components/play/CityRow.test.ts` — `+attachedHeroes:[]`/`+fightCost:0`
7. `apps/arena-client/src/components/play/TopHudBar.test.ts` — `+villainAttachedHeroes:{}`
8. `apps/arena-client/src/composables/useCityRow.test.ts` — `+attachedHeroes:[]`/`+fightCost:0`
9. `apps/arena-client/src/pages/PlayDesktop.test.ts` — `+villainAttachedHeroes:{}`
10. `apps/arena-client/src/pages/PlayMobile.test.ts` — `+villainAttachedHeroes:{}`
11. `apps/arena-client/src/preplan/mutationDetector.test.ts` — `+villainAttachedHeroes:{}` + `+attachedHeroes:[]`/`+fightCost:0`
12. `apps/arena-client/src/preplan/mutationMiddleware.test.ts` — `+villainAttachedHeroes:{}`
13. `apps/arena-client/src/services/autoplayPlayback.test.ts` — `+villainAttachedHeroes:{}`

**Governance (3):**
14. `docs/ai/STATUS.md` — Done entry
15. `docs/ai/work-packets/WORK_INDEX.md` — status Ready → Done
16. `docs/ai/execution-checklists/EC_INDEX.md` — status Ready → Done

16 files total. **No DECISIONS.md entry** — this WP conforms client consumers to
existing engine contracts (WP-214 D-21401..05, WP-222 D-22201..03); it makes no
new decisions (WP-207b precedent: mechanical backfill ⇒ no D-entry). The exact
inline-literal line numbers are the executor's to find via the `vue-tsc` output;
the authoritative target is "every reported error clears."

---

## Contract

This WP conforms client consumers to **existing, already-locked** engine
contracts; it introduces no new contract of its own.

- **Locked surfaces (read-only, engine-owned):**
  - `UIState.villainAttachedHeroes: Record<string, string[]>` (required; WP-214; `uiState.types.ts:66`)
  - `UICityCard.attachedHeroes: string[]` (required; WP-214; `uiState.types.ts:230`)
  - `UICityCard.fightCost: number` (required; WP-214; `uiState.types.ts:232`)
  - `UIState.pendingHeroChoice?: UIPendingHeroChoice` (optional; WP-222; `uiState.types.ts:75`)
- **Values this WP locks for the fixtures/tests:** `villainAttachedHeroes: {}`
  (empty record — fixtures model no captures); `attachedHeroes: []` (empty array);
  `fightCost: 0` (assertion-neutral — no existing test reads `UICityCard.fightCost`).
- **Component prop fix:** `PropType<UIPendingHeroChoice>` →
  `PropType<UIPendingHeroChoice | undefined>` on the `pendingHeroChoice` prop only.
  Type-level change; runtime behavior unchanged.

**Structural invariants (enforcement-grade — a compiling-but-wrong shape is still a FAIL):**
- `villainAttachedHeroes` appears **exactly once, at the top level** of each
  `UIState` literal / JSON object — never nested inside another member.
- `attachedHeroes` and `fightCost` appear on **every non-null city card object**, at
  the **same object level** as the existing card fields (`extId` / `type` /
  `keywords` / `display`) — never nested.
- **"Non-null city card"** is defined executably as every **truthy** element of
  `(o.city && o.city.spaces) || []` for a fixture/state object `o` — identical to
  the verification one-liners; no interpretation.
- The widened `pendingHeroChoice` prop type is **exactly** `UIPendingHeroChoice | undefined`
  — it MUST accept `undefined` and MUST **NOT** accept `null` (never `... | null`),
  mirroring the engine's optional-field (`?:`) semantics.

---

## Non-Negotiable Constraints

**Engine-wide (always apply):**
- Never use `Math.random()` — N/A (no randomness touched).
- Never throw inside boardgame.io moves — N/A (no moves touched).
- Never persist `G`/`ctx` — N/A.
- ESM only, Node v22+, `node:` prefix — N/A for JSON; the `.vue`/`.ts` edits add
  no imports.
- Human-style code per `00.6` — added members use canonical engine field names.
- Full file contents for every modified file in session output — no diffs/snippets.

**Packet-specific:**
- **Engine types are read-only** — do not modify `uiState.types.ts` or any
  `packages/**` file.
- **`index.ts` / `typed.ts` are read-only — REVERT on sight.** Their errors are
  downstream of the stale JSON; backfilling the JSON clears them. If `git diff`
  ever shows a change to `fixtures/uiState/index.ts` or `fixtures/uiState/typed.ts`,
  **revert it immediately** (`git checkout -- <file>`) before proceeding — editing
  either masks the real fix.
- **`PendingHeroChoicePrompt.test.ts` is read-only** — the prop widening makes its
  `undefined` mount valid; do not edit it.
- **Field names are exact:** `villainAttachedHeroes`, `attachedHeroes`, `fightCost`
  — no abbreviation, rename, or paraphrase.
- **Locked literal values:** `villainAttachedHeroes: {}`, `attachedHeroes: []`,
  `fightCost: 0`. Do not invoke factories or populate sample data.
- **Additive only, append at end:** add each required member at the **end** of its
  object; do not reorder, reformat, or alter any existing member or its key order.
  Each JSON file must remain **valid JSON** — **no trailing comma after the final
  member** (the previously-final member gains the separating comma). No
  formatter-induced churn: if a save adds non-functional reformatting, revert the
  file and re-apply only the minimal additive edit.
- **The component prop change is type-only:** widen the `PropType` union; keep
  `required: false` and `default: undefined`. Do not alter the component's
  template or runtime logic.
- **Idempotent end state:** the conformed codebase is a fixed point — re-applying
  the same additive edits is a no-op (zero further file changes) and `typecheck` is
  already exit 0. No member is ever added twice; no duplicate `villainAttachedHeroes`
  / `attachedHeroes` / `fightCost` may appear in any object.
- **Commit boundary is a hard STOP:** if `git diff --name-only` or
  `git status --porcelain` ever lists a path outside the 16-file allowlist, **STOP
  immediately** — do not stage a partial commit. (The pre-existing untracked
  dashboard / WP-226 files are out of scope and must remain unstaged.)

**Session protocol:** see `## Hard Stop Conditions (Authoritative)`.

---

## Hard Stop Conditions (Authoritative)

STOP and report if **any** of the following is observed:

- The engine types reveal `villainAttachedHeroes`, `attachedHeroes`, or `fightCost`
  is **not** required, or `pendingHeroChoice` is **not** optional — the contract
  differs from WP-214/222 and this WP's premise is wrong.
- Baseline `typecheck` reports a materially different error set than the 19 errors
  across the 14 files enumerated above (a different fix already landed, or new
  drift appeared).
- **Scope-violation STOP (binary):** after the backfill, `typecheck` surfaces ANY
  error whose message does **not** reference one of `villainAttachedHeroes`,
  `attachedHeroes`, `fightCost`, or `pendingHeroChoice`. A field beyond these four
  means the drift is wider than this WP assumes — STOP and report; do not guess past
  it. (Errors that *do* reference one of the four — even at a new site — remain in
  scope and are fixed, not stopped on.)
- The arena-client `vitest` suite, which passes at baseline, fails after the
  backfill in a way **not** resolvable by updating a single additive-value
  assertion in the same test file — STOP; the change is not behavior-neutral as
  assumed.

---

## Acceptance Criteria

1. `pnpm --filter @legendary-arena/arena-client typecheck` exits 0 (**zero**
   `vue-tsc` errors). This is the **only** success condition — a reduced-but-nonzero
   error count is a FAIL, not partial progress; do not stop or commit until the count
   is zero.
2. `mid-turn.json`, `endgame-win.json`, `endgame-loss.json` each contain exactly
   one top-level `"villainAttachedHeroes"` member with value `{}`, and each still
   parses as valid JSON.
3. Every non-null city card in `mid-turn.json` (3) and `endgame-loss.json` (5)
   has `"attachedHeroes": []` and `"fightCost": 0`.
4. `apps/arena-client/src/fixtures/uiState/index.ts` and `typed.ts` are
   byte-identical to baseline (`git diff` empty).
5. `PendingHeroChoicePrompt.vue` `pendingHeroChoice` prop type is
   `PropType<UIPendingHeroChoice | undefined>`; `required: false` and
   `default: undefined` are unchanged; the template and `setup()` are otherwise
   unchanged.
6. `pnpm --filter @legendary-arena/arena-client test` passes (no new failures vs
   baseline).
7. `git diff --name-only packages/ apps/registry-viewer apps/server` is empty —
   no engine/registry/server/viewer files modified.
8. No file outside `## Files Expected to Change` is modified — verified by
   `git status --porcelain`.

---

## Verification Steps

```bash
# 1. Typecheck green (the headline gate)
pnpm --filter @legendary-arena/arena-client typecheck; echo "exit: $?"
# Expected: exit 0

# 2. Top-level villainAttachedHeroes present + valid JSON in all 3 fixtures
for f in mid-turn endgame-win endgame-loss; do
  node -e "const o=require('./apps/arena-client/src/fixtures/uiState/$f.json'); const ok=JSON.stringify(o.villainAttachedHeroes)==='{}'; if(!ok)process.exit(1); console.log('$f.json: villainAttachedHeroes === {}');"
done
# Expected: each prints "... === {}"

# 3. Every city card carries the two WP-214 fields
for f in mid-turn endgame-loss; do
  node -e "const o=require('./apps/arena-client/src/fixtures/uiState/$f.json'); const cards=((o.city&&o.city.spaces)||[]).filter(Boolean); const bad=cards.filter(c=>!Array.isArray(c.attachedHeroes)||typeof c.fightCost!=='number').length; if(bad)process.exit(1); console.log('$f.json: '+cards.length+' city cards conformant');"
done
# Expected: mid-turn.json: 3 ... ; endgame-loss.json: 5 ...

# 4. index.ts / typed.ts untouched
git diff --name-only apps/arena-client/src/fixtures/uiState/index.ts apps/arena-client/src/fixtures/uiState/typed.ts | wc -l
# Expected: 0

# 5. Component prop widened (type-only)
grep -n "PropType<UIPendingHeroChoice | undefined>" apps/arena-client/src/components/play/PendingHeroChoicePrompt.vue
# Expected: one match on the pendingHeroChoice prop

# 6. Test suite still green
pnpm --filter @legendary-arena/arena-client test 2>&1 | tail -3
# Expected: all tests pass

# 7. No engine/registry/server/viewer changes
git diff --name-only packages/ apps/registry-viewer apps/server | wc -l
# Expected: 0

# 8. Working tree is exactly the 16 expected files
git status --porcelain | awk '{print $2}' | sort
# Expected: the 13 source + 3 governance paths, nothing else
```

---

## Edit Pattern (Illustrative)

```jsonc
// JSON fixture, top-level (preceding member gains a trailing comma):
  "notableEvents": [],
  "villainAttachedHeroes": {}

// JSON fixture, each city card:
  { "extId": "...", "type": "...", "keywords": [], "display": { "...": "..." },
    "attachedHeroes": [], "fightCost": 0 }
```

```ts
// inline UIState literal in a *.test.ts:
  villainAttachedHeroes: {},

// inline UICityCard literal in a *.test.ts:
  attachedHeroes: [], fightCost: 0,
```

```ts
// PendingHeroChoicePrompt.vue — prop type widening only:
    pendingHeroChoice: {
      type: Object as PropType<UIPendingHeroChoice | undefined>,
      required: false,
      default: undefined,
    },
```

---

## Definition of Done

- [ ] All 8 Acceptance Criteria pass.
- [ ] No `## Hard Stop Conditions` trigger was hit.
- [ ] All 8 Verification Steps produce the expected output.
- [ ] `docs/ai/STATUS.md` updated with the WP-227 Done entry.
- [ ] `docs/ai/DECISIONS.md` NOT updated (mechanical backfill of existing contracts).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-227 flipped Ready → Done.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-259 flipped Ready → Done.
- [ ] No files outside `## Files Expected to Change` were modified.
- [ ] Commit message uses the `EC-259:` prefix (source under `apps/`, so SPEC:/INFRA: do not apply).

---

## Vision Alignment

**N/A.** This WP conforms client test fixtures and one component prop type to
existing engine UI-projection contracts. It touches no §17.1 trigger surface:
no scoring, replays, identity, multiplayer sync, determinism, card data,
monetization, live ops, accessibility, or Registry Viewer public surface. The
fields backfilled (`villainAttachedHeroes`, `attachedHeroes`, `fightCost`,
`pendingHeroChoice`) were vision-reviewed as part of WP-214 / WP-222.

## Funding Surface Gate

**N/A.** Touches no §20.1 trigger surface — no global navigation, Registry Viewer
funding affordance, profile/account funding attribution, tournament-funding
channel, or user-visible funding copy. Internal test-fixture + type maintenance.

## API Catalog Update

**N/A.** No HTTP endpoint, no `apps/server/src/**` library function, no route
registration, no catalog row. Client-side fixture/type maintenance only.

---

## Lint Gate Self-Review

Gate: `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`. Run 2026-06-09. Every
claim verified against the live `typecheck` output and the actual source (engine
types, the three JSON fixtures, the component prop block) — not WP text alone.

| § | Title | Result | Notes |
|---|---|---|---|
| §1 | Structure | **PASS** | All required sections present; Out of Scope excludes >2 surfaces (index.ts/typed.ts, engine types, prompt test, registry-viewer). |
| §2 | Non-Negotiable Constraints | **PASS** | Engine-wide + packet-specific + session-protocol + locked-value blocks; full-file-output required. |
| §3 | Assumes | **PASS** | WP-214/222 with verified type-file line numbers; baseline 19-error state; vitest-green baseline; baseline commit. |
| §4 | Context | **PASS** | Specific files/sections cited; 00.2 N/A (UI-projection fields, not 00.2 card-data/setup-payload). |
| §5 | Files Expected to Change | **PASS** | 16 files, each marked modified with a one-line change; source set is the real fix locus (not index.ts/typed.ts). |
| §6 | Naming Consistency | **PASS** | Canonical engine field names; no 00.2 names contradicted. |
| §7 | Dependency Discipline | **PASS** | No new npm dependencies. |
| §8 | Architectural Boundaries | **PASS** | Client-only; engine/registry/server/viewer read-only or untouched; engine contracts read-only. |
| §9 | Windows Compatibility | **PASS** | `pnpm`/`node`/`git` verification one-liners via the Bash tool; no Unix-only paths. |
| §10 | Env Var Hygiene | **N/A** | No env vars. |
| §11 | Authentication | **N/A** | No auth surface. |
| §12 | Test Quality | **PASS** | Produces no new tests; AC 1/6 assert typecheck-green + suite-green; no boardgame.io/network/DB in checks. |
| §13 | Commands and Verification | **PASS** | `pnpm`/`node`/`git` exact with expected output inline. |
| §14 | Acceptance Criteria | **PASS** | 8 binary, observable, file/command-specific items; AC2/3 self-guard against partial fixes; AC1 is the headline gate. |
| §15 | Definition of Done | **PASS** | STATUS, explicit DECISIONS no-update, WORK_INDEX, EC_INDEX, scope-boundary check all present. |
| §16 | Code Style | **PASS** | Backfilled literals + one PropType union; no abstraction/control-flow/error-message surface. |
| §17 | Vision Alignment | **PASS** | `## Vision Alignment` present, N/A against §17.1 with reasons. |
| §18 | Prose-vs-Grep | **N/A** | Verification greps target the canonical field/PropType, not forbidden tokens. |
| §19 | Bridge Staleness | **N/A** | No repo-state-summarizing artifact authored. |
| §20 | Funding Surface Gate | **PASS** | `## Funding Surface Gate` present, N/A justified. |
| §21 | API Catalog | **PASS** | `## API Catalog Update` present, N/A justified. |

**Lint Gate Verdict: PASS**

---

## Pre-Flight Verdict

**Verdict: READY TO EXECUTE** (2026-06-09) — per `docs/ai/REFERENCE/01.4-pre-flight-invocation.md`.

**Baseline:** `origin/main` at `26fbc911`. The 19-error / 14-file failing set
was enumerated by running `pnpm --filter @legendary-arena/arena-client typecheck`
against the baseline, not estimated.

**Justification:**
- **Dependency readiness.** WP-214 and WP-222 are landed; their contracts are
  the read-only targets. No in-flight blocker; the fix is purely client-side
  conformance.
- **Contract fidelity.** The four locked surfaces are cited with exact
  `uiState.types.ts` line numbers; the backfill values (`{}`, `[]`, `0`) and the
  PropType widening conform to those surfaces without widening or narrowing them.
- **Scope lock.** 16-file closed allowlist; engine/registry/server/viewer are
  zero-diff; `index.ts`/`typed.ts`/`PendingHeroChoicePrompt.test.ts` are explicitly
  read-only with the rationale (downstream / auto-fixed).
- **Risks resolved.** The one behavioral risk — a `vitest` assertion breaking on
  a backfilled value — is bounded by the Hard Stop (resolve a single additive-value
  assertion in-place, else STOP) and AC #6. The "wider hidden field" risk is
  closed by the third Hard Stop + AC #1's exit-0 requirement.
- **Architectural boundary confidence.** App layer only; no `@legendary-arena/*`
  runtime surface changed; the component change is type-level.

**Risk items (non-blocking):**
- **RS-1.** `fightCost: 0` could surface in a `CityRow`/`useCityRow` render
  assertion if one snapshots fight cost. None do at baseline (the field postdates
  those tests); if one breaks, the Hard Stop authorizes an in-place single-assertion
  update.

**Invocation Prompt Conformance Check:** to be confirmed when the session prompt
is authored — it must transcribe these locked values verbatim and introduce no
new field, file, or value.

**Authorized Next Step:** READY TO EXECUTE → session execution prompt authorized.

---

## Copilot Check Verdict

**Verdict: PASS** (2026-06-09) — per `docs/ai/REFERENCE/01.7-copilot-check.md`.
**Pre-flight verdict under review:** READY TO EXECUTE (2026-06-09).

WP-227 is a client-only conformance backfill with zero engine/runtime/persistence
surface, so most of the 30 issues collapse to PASS or N/A.

1. **Separation of Concerns (#1)** — PASS. Engine/registry/server/viewer zero-diff;
   change lives entirely in arena-client fixtures/tests + one prop type.
2. **Determinism (#2)** — PASS. No randomness, no `G`, no runtime logic changed.
3. **Type Safety / Contract Integrity (#4)** — PASS. Conforms to existing
   engine-owned required/optional fields; the PropType widening matches the
   component's existing `undefined` handling; no engine type edited.
4. **Persistence (#5)** — PASS. Plain JSON/test literals; no `G` persistence.
5. **Testing / Invariant Enforcement (#6)** — PASS. AC #1 (typecheck exit 0) +
   AC #6 (vitest green) are loud, observable gates; backfill is additive.
6. **Scope & Execution Governance (#7)** — PASS. Closed 16-file allowlist;
   `git status --porcelain` boundary check; read-only files called out.
7. **Documentation & Intent (#9)** — PASS. Field names canonical; the one prop
   change is type-only and self-documenting.
8. **Error Handling (#10)** — N/A. No error-handling surface touched.

**Mandatory Governance Follow-ups:** none — no DECISIONS / rules / category change.

**Pre-Flight Verdict Disposition:** **CONFIRM** — READY TO EXECUTE stands.
Session-prompt generation authorized.
