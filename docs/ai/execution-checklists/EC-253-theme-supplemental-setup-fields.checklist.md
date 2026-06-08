# EC-253 — Theme Supplemental Setup Fields + Tips Display (Execution Checklist)

**Source:** docs/ai/work-packets/WP-221-theme-supplemental-setup-fields.md
**Layer:** Registry (schema) + Registry Viewer (UI)

## Before Starting
- [ ] WP-055 complete — `packages/registry/src/theme.schema.ts` exports `ThemeDefinitionSchema`, `ThemeSetupIntentSchema`, `ThemeDefinition`
- [ ] WP-055 complete — `packages/registry/src/theme.validate.ts` exports `validateTheme`, `validateThemeFile`
- [ ] WP-055 complete — `packages/registry/src/theme.schema.test.ts` exists with exactly 10 tests
- [ ] WP-123 complete — set.other[] dispatch wired
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] `pnpm --filter registry-viewer test` exits 0
- [ ] `content/themes/inhumans-royal-family.json` exists with `themeSchemaVersion: 2`

## Locked Values (do not re-derive)
- New `ThemeSetupIntentSchema` fields — exact names, in this order after `henchmanGroupIds`:
  - `bystanderSetIds: z.array(z.string().min(1)).default([])`
  - `woundSetIds: z.array(z.string().min(1)).default([])`
  - `sidekickCardIds: z.array(z.string().min(1)).default([])`
  - `officerCardIds: z.array(z.string().min(1)).default([])`
- New `ThemeDefinitionSchema` top-level field (after `flavorText`):
  - `tips: z.array(z.string().min(1)).default([])`
- `themeSchemaVersion` stays `z.literal(2)` — no version bump (D-22101)
- `bystanderSetIds` / `woundSetIds` values: bare lowercase set `abbr` strings (e.g. `"core"`, `"xmen"`, `"cvwr"`)
- `sidekickCardIds` / `officerCardIds` values: `"<setAbbr>/<slug>"` format (e.g. `"cvwr/lockjaw"`)
- `inhumans-royal-family.json` locked values:
  - `"bystanderSetIds": ["core", "xmen"]`
  - `"woundSetIds": ["core", "cvwr"]`
  - `"sidekickCardIds": ["cvwr/lockjaw"]`
  - `"officerCardIds": []`
  - `tips`: one entry — the Abomination mechanic explanation (already in file; preserve exactly)

## Guardrails
- Registry layer only — `packages/registry/` must not import from `game-engine`, `server`, or any `apps/*`
- `ThemeDetail.vue`: display only — no gameplay logic, no import from `@legendary-arena/game-engine` or `boardgame.io`
- All existing schema fields and their `// why:` comments in `theme.schema.ts` preserved byte-identical
- `tips` lives at the top level of `ThemeDefinitionSchema`, NOT inside `setupIntent`
- No new npm dependencies
- Only the 7 files in § Files to Produce may be modified — `git diff --name-only` enforces this at close
- 01.5 NOT INVOKED — `packages/game-engine/src/**` zero diff

## Required `// why:` Comments
- In `theme.schema.ts`, above the four new `setupIntent` fields:
  - `bystanderSetIds` / `woundSetIds` use bare set abbreviations matching the `abbr` field in card set JSON — a set reference includes all bystander/wound cards from that set (D-22103)
  - `sidekickCardIds` / `officerCardIds` use `<setAbbr>/<slug>` format to resolve ambiguity when the same slug appears in multiple sets (D-22104)
  - Count fields remain intentionally excluded — themes describe which cards, not pile sizing
- In `theme.schema.ts`, above the `tips` field:
  - Tips are editorial gameplay guidance displayed in the themes tab; top-level (not in setupIntent) because they describe how to play the theme, not what cards to include (D-22102)

## Files to Produce
- `packages/registry/src/theme.schema.ts` — **modified** — add 5 new optional fields (4 in setupIntent + tips at top level)
- `packages/registry/src/theme.schema.test.ts` — **modified** — add tests #11–13; update `fullTheme` fixture with all 5 new fields
- `apps/registry-viewer/src/components/ThemeDetail.vue` — **modified** — render Tips, Bystanders, Wounds, Sidekicks, Officers sections
- `content/themes/inhumans-royal-family.json` — **modified** — populate all 5 new fields
- `docs/ai/DECISIONS.md` — **modified** — D-22101..D-22104
- `docs/ai/STATUS.md` — **modified** — note supplemental fields in schema + rendered in ThemeDetail.vue
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-221 checked off with date

## After Completing
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0 — at least 13 tests passing (original 10 + 3 new)
- [ ] `pnpm -r build` exits 0
- [ ] No import from `@legendary-arena/game-engine` or `boardgame.io` in `ThemeDetail.vue`
  — confirmed: `Select-String -Path apps\registry-viewer\src\components\ThemeDetail.vue -Pattern "game-engine|boardgame"` returns no output
- [ ] `themeSchemaVersion: z.literal(2)` is unchanged
  — confirmed: `Select-String -Path packages\registry\src\theme.schema.ts -Pattern "z\.literal\(2\)"` returns one match
- [ ] `inhumans-royal-family.json` passes `validateTheme()` via smoke test (included in registry tests)
- [ ] `git diff --name-only` shows only the 7 files above — no engine, server, or arena-client edits
- [ ] `docs/ai/DECISIONS.md` updated — D-22101 (no version bump for additive-only optional fields), D-22102 (tips top-level), D-22103 (bare set abbr format), D-22104 (`<setAbbr>/<slug>` format)
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/work-packets/WORK_INDEX.md` — WP-221 checked off with date
- [ ] 01.5 NOT INVOKED — `packages/game-engine/src/**` zero diff confirmed

## Common Failure Smells
- Schema parses but `inhumans-royal-family.json` fails smoke test → `bystanderSetIds` / `woundSetIds` placed inside wrong schema (setupIntent vs top-level, or vice versa for tips)
- Zod strips new fields silently on parse → field added to wrong schema object (check `ThemeSetupIntentSchema` vs `ThemeDefinitionSchema` carefully)
- `themeSchemaVersion` bumped → revert; D-22101 explicitly locks v2 for additive-only optional fields
- `Select-String` finds a `game-engine` or `boardgame` match in ThemeDetail.vue → display-only constraint violated; remove the import
