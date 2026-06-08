# WP-221 — Theme Supplemental Setup Fields + Tips Display

**Status:** Ready
**Primary Layer:** Registry (schema) + Registry Viewer (UI)
**Dependencies:** WP-055 (ThemeDefinition v2 contract), WP-123 (set.other[] dispatch)

---

## Session Context

WP-055 locked `ThemeDefinitionSchema` at version 2 with five `setupIntent` fields
(`mastermindId`, `schemeId`, `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`).
The schema intentionally excluded count fields (`bystandersCount`, `woundsCount`,
`officersCount`, `sidekicksCount`) because themes describe *which* cards to use,
not pile sizing. This packet adds the missing *which* fields — supplemental bystander
sets, wound sets, sidekick cards, and officer cards — plus a top-level `tips` array
for gameplay guidance. None of these fields touch the engine.

---

## Goal

After this session the registry package exports an extended `ThemeSetupIntentSchema`
with four new optional array fields (`bystanderSetIds`, `woundSetIds`,
`sidekickCardIds`, `officerCardIds`) and `ThemeDefinitionSchema` gains a top-level
optional `tips` field. `ThemeDetail.vue` in the registry viewer renders all five
new fields when present. `content/themes/inhumans-royal-family.json` is fully
populated with all new fields as the reference implementation.

---

## Assumes

- WP-055 complete. Specifically:
  - `packages/registry/src/theme.schema.ts` exports `ThemeDefinitionSchema`,
    `ThemeSetupIntentSchema`, `ThemeDefinition` (WP-055)
  - `packages/registry/src/theme.validate.ts` exports `validateTheme`,
    `validateThemeFile` (WP-055)
  - `packages/registry/src/theme.schema.test.ts` exists with 10 tests (WP-055)
- WP-123 complete (set.other[] dispatch wired so sidekick/officer card types
  can eventually be emitted by `flattenSet`)
- `pnpm --filter @legendary-arena/registry test` exits 0
- `pnpm --filter @legendary-arena/registry build` exits 0
- `pnpm --filter registry-viewer test` exits 0
- `content/themes/inhumans-royal-family.json` exists with `themeSchemaVersion: 2`
- `docs/ai/DECISIONS.md` exists
- `docs/ai/ARCHITECTURE.md` exists

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirm the
  Registry layer boundary. `packages/registry/` must not import from
  `game-engine`, `server`, or `apps/*`.
- `packages/registry/src/theme.schema.ts` — read entirely before modifying.
  Understand the existing field structure, the `// why:` comments explaining
  D-5504 and D-5509, and the intentional exclusion of count fields.
- `packages/registry/src/theme.schema.test.ts` — read entirely. Understand
  the `fullTheme` fixture (test #1) and the v2-literal check (test #9);
  both must continue to pass without modification.
- `apps/registry-viewer/src/components/ThemeDetail.vue` — read entirely before
  modifying. Understand how the existing `setupIntent` fields are rendered so
  the new fields follow the same pattern.
- `content/themes/inhumans-royal-family.json` — read entirely before modifying.
  The `tips` field was added in a prior session (non-schema-validated); this
  packet formalizes it in the schema.
- `docs/ai/REFERENCE/00.2-data-requirements.md §8.1` — confirm canonical field
  names for `MatchSetupConfig`. The new theme fields deliberately differ (they
  hold set abbreviations and card slugs, not counts), so naming must not collide.
- `docs/ai/DECISIONS.md` — scan for D-5504 (schema versioning rule) and D-5509
  (v2 music field addition). D-22101 in this packet explains why a version bump
  is not required for this purely additive optional-field extension.
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no abbreviations),
  Rule 6 (`// why:` comments), Rule 9 (`node:` prefix), Rule 11 (full-sentence
  error messages), Rule 13 (ESM only).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only
- Never throw inside boardgame.io move functions — return void on invalid input
- Never persist `G`, `ctx`, or any runtime state — see ARCHITECTURE.md §Section 3
- `G` must be JSON-serializable at all times — no class instances, Maps, Sets, or functions
- ESM only, Node v22+ — all new files use `import`/`export`, never `require()`
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, etc.)
- Test files use `.test.ts` extension — never `.test.mjs`
- No database or network access inside move functions or pure helpers
- Full file contents for every new or modified file in the output — no diffs, no snippets
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- This packet touches only `packages/registry/` and `apps/registry-viewer/` —
  no `packages/game-engine/`, `apps/server/`, or `apps/arena-client/` changes
- `packages/registry/src/theme.schema.ts` is being extended — not replaced.
  All existing fields, their types, their `// why:` comments, and the exported
  `ThemeDefinition` type must be preserved byte-identical
- `themeSchemaVersion` stays as `z.literal(2)` — no version bump (see D-22101)
- All five new fields are optional with empty-array or undefined defaults;
  the Zod `.default([])` pattern matches the existing `henchmanGroupIds` field
- The four new `setupIntent` fields hold string arrays only — never counts,
  never objects, never nested structures
- `sidekickCardIds` and `officerCardIds` values use the `<setAbbr>/<slug>` format
  (e.g. `"cvwr/lockjaw"`) to resolve ambiguity across sets (D-22104)
- `bystanderSetIds` and `woundSetIds` values use bare set abbreviations
  (e.g. `"core"`, `"xmen"`) matching the `abbr` field in card set JSON (D-22103)
- The `tips` field lives at the top level of `ThemeDefinitionSchema`, not inside
  `setupIntent` — tips are editorial guidance, not composition data (D-22102)
- `ThemeDetail.vue` must not implement any gameplay logic or engine imports —
  display only
- No new npm dependencies

**Session protocol:**
- If any field name, Zod shape, or file path is unclear, stop and ask before
  proceeding — never invent field names or type shapes

**Locked contract values:**

- **MatchSetupConfig fields** (do NOT reuse these names for the new theme fields):
  `schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`,
  `heroDeckIds`, `bystandersCount`, `woundsCount`, `officersCount`, `sidekicksCount`
- **New ThemeSetupIntent fields** (exact names, must match across schema + Vue + JSON):
  `bystanderSetIds`, `woundSetIds`, `sidekickCardIds`, `officerCardIds`
- **New ThemeDefinition top-level field** (exact name):
  `tips`
- **Set abbreviation format** (for `bystanderSetIds` and `woundSetIds`):
  bare lowercase string matching the `abbr` field in card set JSON, e.g. `"core"`,
  `"xmen"`, `"cvwr"`, `"wpnx"`, `"nmut"`
- **Card reference format** (for `sidekickCardIds` and `officerCardIds`):
  `"<setAbbr>/<slug>"` — forward-slash separator, no spaces, all lowercase,
  e.g. `"cvwr/lockjaw"`, `"cvwr/redwing"`, `"shld/maria-hill"`

---

## Debuggability & Diagnostics

All behavior introduced by this packet is purely additive and editorial:

- New schema fields are optional with empty-array defaults — existing themes
  parse identically to before; no runtime behavior changes
- `ThemeDetail.vue` renders new sections only when the arrays are non-empty;
  empty arrays produce no visible output — no error states introduced
- Failures attributable to this packet are localizable via:
  - Zod parse errors on malformed field values (non-string array elements,
    malformed `<setAbbr>/<slug>` format)
  - Vue rendering assertions in component tests

---

## Scope (In)

### A) `packages/registry/src/theme.schema.ts` — modified

Extend `ThemeSetupIntentSchema` with four new optional fields after the existing
`henchmanGroupIds` line:

```typescript
bystanderSetIds: z.array(z.string().min(1)).default([]),
woundSetIds: z.array(z.string().min(1)).default([]),
sidekickCardIds: z.array(z.string().min(1)).default([]),
officerCardIds: z.array(z.string().min(1)).default([]),
```

Add a `// why:` comment block above these four fields explaining:
- `bystanderSetIds` and `woundSetIds` use bare set abbreviations (e.g. `"core"`,
  `"xmen"`) matching the `abbr` field in each card set JSON — a set reference
  includes all bystander/wound cards from that set (D-22103)
- `sidekickCardIds` and `officerCardIds` use `<setAbbr>/<slug>` format to resolve
  ambiguity when the same slug appears in multiple sets (D-22104)
- Count fields (`bystandersCount`, `woundsCount`, etc.) remain intentionally
  excluded — themes describe composition (which cards), not pile sizing (how many)

Extend `ThemeDefinitionSchema` with one new optional field after `flavorText`:

```typescript
tips: z.array(z.string().min(1)).default([]),
```

Add a `// why:` comment: tips are editorial gameplay guidance displayed in the
themes tab; they live at the top level (not inside setupIntent) because they
describe how to play the theme, not what cards to include (D-22102).

Export the updated `ThemeDefinition` type (already inferred from the schema via
`z.infer<typeof ThemeDefinitionSchema>` — no manual type change needed).

### B) `packages/registry/src/theme.schema.test.ts` — modified

Add three new tests to the existing describe block (tests #11, #12, #13):

- **Test #11** — `bystanderSetIds` and `woundSetIds` round-trip: a theme with
  `bystanderSetIds: ["core", "xmen"]` and `woundSetIds: ["core", "cvwr"]` parses
  successfully and the parsed values equal the inputs exactly
- **Test #12** — `sidekickCardIds` and `officerCardIds` round-trip: a theme with
  `sidekickCardIds: ["cvwr/lockjaw", "cvwr/redwing"]` and
  `officerCardIds: ["shld/maria-hill"]` parses and round-trips correctly
- **Test #13** — `tips` round-trip: a theme with
  `tips: ["The key mechanic is Abomination."]` parses and the parsed `tips`
  array equals the input; a theme without `tips` parses with `tips: []` as
  the default

Update the `fullTheme` fixture (used in test #1) to include all five new fields
with sample values so test #1 continues to exercise the full schema shape.

All new tests must:
- Use `node:test` and `node:assert` only
- Not import from `boardgame.io`
- Use `validateTheme` from `./theme.validate.js` (not the schema directly)

### C) `apps/registry-viewer/src/components/ThemeDetail.vue` — modified

Add display sections for all five new fields. Follow the existing pattern used
for `villainGroupIds` and `henchmanGroupIds` (badge-style chips for arrays,
conditional rendering when array is empty or undefined).

**Tips section** — render below the existing description/flavor text block, above
the comic reference section. Use a section heading "Tips". Render each string
in `theme.tips` as a separate paragraph or list item. Only render the section
when `theme.tips.length > 0`.

**Bystander Sets section** — render inside the Setup Intent block after the
henchman groups row. Label: "Bystanders". Render each `bystanderSetIds` entry
as a badge. Only render when `theme.setupIntent.bystanderSetIds.length > 0`.

**Wound Sets section** — same pattern as bystanders. Label: "Wounds".

**Sidekick Cards section** — same pattern. Label: "Sidekicks". Display the
`<setAbbr>/<slug>` strings as-is (no resolution to display names in v1).

**Officer Cards section** — same pattern. Label: "Officers".

No new composables, no new child components, no game logic. Display only.

### D) `content/themes/inhumans-royal-family.json` — modified

The `villainGroupIds` and `henchmanGroupIds` fields were updated in a prior
session (pre-WP). This packet populates the five new fields. Final `setupIntent`
must contain:

```json
"bystanderSetIds": ["core", "xmen"],
"woundSetIds": ["core", "cvwr"],
"sidekickCardIds": ["cvwr/lockjaw"],
"officerCardIds": []
```

The `tips` array at the top level (already present from prior session) must
contain exactly one entry:
```json
"tips": [
  "The key mechanic of this scheme is Abomination: each Villain gets +attack equal to the printed attack of the Hero in the HQ space directly under that Villain's city space. Prioritize fighting or KO-ing Heroes in the HQ who have high printed attack values to keep the Villain deck manageable."
]
```

`bystanderSetIds` rationale: `"core"` = the standard 30-card bystander pile;
`"xmen"` = the X-Men expansion bystanders which are the New Mutants characters
(cypher, karma, magik, magma, mirage, sunspot, warlock, wolfsbane, and others).

`woundSetIds` rationale: `"core"` = standard wounds; `"cvwr"` = the Civil War
named wounds (blinding-flash, blunt-force-trauma, corrosive-webbing, etc.) which
are the thematically appropriate "harder" wounds for this setup.

`sidekickCardIds`: `"cvwr/lockjaw"` is the Lockjaw pet sidekick card in
`cvwr.json` other[]. Bucky and X-Men sidekick references are deferred — they do
not exist as current structured card data entries and will be added when the
relevant set data is populated.

`officerCardIds`: left empty for now — Maria Hill is not yet in the structured
card data as a slug in any set's other[] array; to be populated when set data
is extended.

---

## Out of Scope

- No changes to the Zod schema version (`themeSchemaVersion` stays `z.literal(2)`)
  — see D-22101 for rationale; a future migration WP may bump to v3
- No changes to `scripts/generate-theme-catalog.mjs` or `content/themes/CATALOG.md`
  — CATALOG.md regeneration with new sections for bystanders/wounds/sidekicks/
  officers is a follow-up task once the data population is further along
- No changes to `packages/game-engine/` — this packet introduces no gameplay behavior
- No changes to `apps/server/` or `apps/arena-client/` — registry-viewer only
- No pile-sizing counts (`bystandersCount`, `woundsCount`, `officersCount`,
  `sidekicksCount`) — counts are match-configuration concerns, not theme concerns
- No resolution of sidekick/officer display names — `<setAbbr>/<slug>` strings
  displayed as-is in v1; a future WP may wire them through `flattenSet` lookups
- No population of `sidekickCardIds` entries for Bucky or X-Men generic sidekick
  cards — those cards do not exist as structured data in any current set JSON
- No changes to any other theme JSON file — only `inhumans-royal-family.json` is
  updated as the reference implementation
- Refactors, cleanups, or "while I'm here" improvements are out of scope

---

## Files Expected to Change

- `packages/registry/src/theme.schema.ts` — **modified** — add 5 new optional
  fields to `ThemeSetupIntentSchema` (4 fields) and `ThemeDefinitionSchema` (`tips`)
- `packages/registry/src/theme.schema.test.ts` — **modified** — add tests #11–13
  for new fields; update `fullTheme` fixture
- `apps/registry-viewer/src/components/ThemeDetail.vue` — **modified** — render
  tips, bystanderSetIds, woundSetIds, sidekickCardIds, officerCardIds
- `content/themes/inhumans-royal-family.json` — **modified** — populate all 5 new
  fields as the reference implementation
- `docs/ai/DECISIONS.md` — **modified** — D-22101..D-22104
- `docs/ai/STATUS.md` — **modified** — note theme supplemental fields available
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-221

No other files may be modified.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### A — Schema extension

- [ ] `ThemeSetupIntentSchema` exports exactly these fields (in order):
  `mastermindId`, `schemeId`, `villainGroupIds`, `henchmanGroupIds`,
  `heroDeckIds`, `bystanderSetIds`, `woundSetIds`, `sidekickCardIds`,
  `officerCardIds` — confirmed by reading the source file
- [ ] All four new `setupIntent` fields use `z.array(z.string().min(1)).default([])`
  — confirmed by reading the source file
- [ ] `ThemeDefinitionSchema` contains a `tips` field using
  `z.array(z.string().min(1)).default([])` — confirmed by reading the source file
- [ ] `themeSchemaVersion: z.literal(2)` is unchanged — confirmed by reading the
  source file
- [ ] All existing `// why:` comments from the original file are preserved
  byte-identical — confirmed by reading the source file

### B — Tests

- [ ] Tests #11, #12, #13 are present in `theme.schema.test.ts`
  — confirmed by reading the source file
- [ ] The `fullTheme` fixture includes all five new fields
  — confirmed by reading the source file
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0 with at least 13 tests
  passing (original 10 + 3 new)

### C — ThemeDetail.vue display

- [ ] `ThemeDetail.vue` renders a "Tips" section when `theme.tips.length > 0`
  — confirmed by reading the source file
- [ ] `ThemeDetail.vue` renders "Bystanders", "Wounds", "Sidekicks", "Officers"
  rows in the setup intent block when the respective arrays are non-empty
  — confirmed by reading the source file
- [ ] No import from `@legendary-arena/game-engine` or `boardgame.io` in
  `ThemeDetail.vue` — confirmed with `Select-String`

### D — Theme JSON

- [ ] `inhumans-royal-family.json` passes `validateTheme()` — confirmed by running
  `pnpm --filter @legendary-arena/registry test` (registry.smoke.test.ts loads all themes)
- [ ] `inhumans-royal-family.json` contains exactly these keys in `setupIntent`:
  `mastermindId`, `schemeId`, `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`,
  `bystanderSetIds`, `woundSetIds`, `sidekickCardIds`, `officerCardIds`
  — confirmed by reading the file
- [ ] `tips` array is present at the top level with at least one string entry
  — confirmed by reading the file

### Scope Enforcement

- [ ] `pnpm -r build` exits 0
- [ ] No files outside `## Files Expected to Change` were modified
  — confirmed with `git diff --name-only`

---

## Verification Steps

```pwsh
# Step 1 — build the registry package after changes
pnpm --filter @legendary-arena/registry build
# Expected: exits 0, no TypeScript errors

# Step 2 — run registry tests (must include the 3 new tests)
pnpm --filter @legendary-arena/registry test
# Expected: TAP output — 13+ tests passing, 0 failing

# Step 3 — confirm no game-engine or boardgame.io imports in ThemeDetail.vue
Select-String -Path "apps\registry-viewer\src\components\ThemeDetail.vue" -Pattern "game-engine|boardgame"
# Expected: no output

# Step 4 — confirm themeSchemaVersion literal is unchanged
Select-String -Path "packages\registry\src\theme.schema.ts" -Pattern "z\.literal\(2\)"
# Expected: one match

# Step 5 — confirm the five new field names are present in the schema
Select-String -Path "packages\registry\src\theme.schema.ts" -Pattern "bystanderSetIds|woundSetIds|sidekickCardIds|officerCardIds|tips"
# Expected: at least five matches

# Step 6 — validate the theme JSON passes smoke test
pnpm --filter @legendary-arena/registry test
# Expected: registry.smoke.test.ts passes (it loads all themes from content/themes/)

# Step 7 — confirm no files outside scope were modified
git diff --name-only
# Expected: only the 7 files listed in ## Files Expected to Change
```

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0 (13+ tests passing)
- [ ] `pnpm -r build` exits 0
- [ ] `inhumans-royal-family.json` passes `validateTheme()` via the smoke test
- [ ] `ThemeDetail.vue` contains no import from `game-engine` or `boardgame.io`
  (confirmed with `Select-String`)
- [ ] `themeSchemaVersion: z.literal(2)` is unchanged in `theme.schema.ts`
  (confirmed with `Select-String`)
- [ ] No files outside `## Files Expected to Change` were modified
  (confirmed with `git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated — theme supplemental fields (bystanderSetIds,
  woundSetIds, sidekickCardIds, officerCardIds, tips) are now in the schema and
  rendered in ThemeDetail.vue; inhumans-royal-family.json is the reference
  implementation
- [ ] `docs/ai/DECISIONS.md` updated — D-22101 (no version bump for additive-only
  optional fields), D-22102 (tips at top level, not in setupIntent), D-22103
  (bystanderSetIds/woundSetIds use bare set abbreviations), D-22104
  (sidekickCardIds/officerCardIds use `<setAbbr>/<slug>` format)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-221 checked off with today's date
- [ ] 01.5 NOT INVOKED — this packet touches no engine surface
  (`packages/game-engine/src/**` zero diff confirmed with `git diff --name-only`)

---

## Vision Alignment

§17 triggered by: Registry Viewer public surface (Vision §10a), card data
content semantics (Vision §10).

**Vision clauses touched:** §10, §10a.

**Conflict assertion:** No conflict. This WP adds editorial metadata fields to the
theme contract and renders them in the registry viewer. No gameplay logic,
no scoring, no determinism surfaces, no paid or user-identity surfaces are touched.

**Non-Goal proximity check:** NG-1 through NG-7 are not crossed — this WP adds
no pay-to-win mechanics, no per-player advantage, no monetization surface, and no
competitive scoring. The tips field is editorial information displayed publicly.

**Determinism preservation:** N/A — this WP introduces no randomness, no engine
integration, and no replay-affecting behavior.

---

## Funding Surface Gate

§20 N/A — this WP touches no §20.1 trigger surfaces. The registry viewer changes
are purely data display (new fields in ThemeDetail.vue); no global navigation
funding affordances (WP-097 §A), no registry viewer funding affordances
(WP-097 §B), no user profile or account surfaces (WP-097 §C), and no
tournament-specific funding channels are involved.

---

## API Catalog (§21)

§21 N/A — this WP adds no HTTP endpoints, modifies no existing HTTP endpoints,
and touches no `apps/server/src/**` library functions. No `api-endpoints.md`
update is required.

---

## Lint Gate Self-Review

Baseline: `HEAD` = `19e8d02` (2026-06-07). Registry: 112 tests / 0 fail. Registry-viewer: 39 tests / 0 fail.

| §  | Verdict | Notes |
|----|---------|-------|
| §1 | PASS | All 10 required sections present and non-empty |
| §2 | PASS | Engine-wide + packet-specific constraints; 00.6 referenced; locked contract values present |
| §3 | PASS | WP-055 + WP-123 listed with specific exports; file dependencies named; test baseline present |
| §4 | PASS | ARCHITECTURE.md §Layer Boundary, DECISIONS.md, 00.2 §8.1, 00.6 all cited specifically |
| §5 | PASS | 7 files listed as modified; no ambiguous output language |
| §6 | PASS | No canonical name violations; new names explicitly differentiated from MatchSetupConfig fields |
| §7 | PASS | "No new npm dependencies" explicit; no forbidden packages relevant to this WP |
| §8 | PASS | Registry layer boundary enforced; ThemeDetail.vue display-only constraint; no engine/DB surfaces |
| §9 | PASS | PowerShell Select-String; pnpm commands; filter name corrected (PS item) |
| §10 | N/A | No environment variables introduced or modified |
| §11 | N/A | No authentication surfaces |
| §12 | PASS | node:test + node:assert only; no boardgame.io; no network/DB |
| §13 | PASS | All pnpm commands; expected output shown inline |
| §14 | PASS | 16 AC items (recommended 6-12); all items are binary, observable, specific; over-count not a hard FAIL per Final Gate |
| §15 | PASS | STATUS.md, DECISIONS.md, WORK_INDEX.md all in DoD |
| §16 | PASS | No premature abstractions; explicit control flow; descriptive names; JSDoc required; `// why:` comments locked |
| §17 | PASS | §10, §10a cited; conflict assertion present; NG-1..7 checked; determinism N/A |
| §18 | PASS | Verification Step 3 grep scoped to ThemeDetail.vue only; no verbatim forbidden tokens in WP prose that create false positives |
| §19 | N/A | WP is not a repo-state-summarizing artifact |
| §20 | PASS | N/A with proper justification naming why no §20.1 surfaces are present |
| §21 | PASS | N/A with proper justification naming why no §21.1 surfaces are present |

**Pre-flight verdict:** READY TO EXECUTE  
**Copilot check verdict:** PASS (Contract-Only WP; no BLOCK or RISK items)  
**Correction applied:** `--filter @legendary-arena/registry-viewer` → `--filter registry-viewer` in `§ Assumes` and EC-253 `## Before Starting` (package name is unscoped — confirmed against `apps/registry-viewer/package.json`)
