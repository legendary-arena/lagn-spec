# EC-248 — Hero Ability Markup Corpus Sweep: Rescue and Reveal-Draw (Execution Checklist)

**Source:** docs/ai/work-packets/WP-216-hero-ability-markup-corpus-sweep.md
**Layer:** Card Data + Offline Tooling (Shared Tooling — no engine/registry/server imports)

## Before Starting
- [ ] WP-215 done: rescue/reveal executors live; D-21501..D-21505 active
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (clean baseline)
- [ ] `pnpm -r build` exits 0
- [ ] `git diff --name-only data/cards/` is empty (no unstaged card-data changes)
- [ ] Read `apply-effect-markers.mjs` in full before writing the new script
- [ ] Read `villain-effect-markers.json` to understand curated map format
- [ ] Run `--propose` BEFORE curating `hero-ability-markers.json` — never skip

## Locked Values (do not re-derive — see WP-216 §Contract and §Candidate Detection Rules)
- Valid tokens: `[keyword:rescue:1]` · `[keyword:reveal]` · `[keyword:reveal:2]` only
- `[keyword:reveal]` — only when ability line already contains `N[icon:vp] or less`
- `[keyword:reveal:2]` — when ability line has no `[icon:vp]` (explicit suffix required)
- Token appended with one space at end of string; idempotence = full exact substring match; never relocate
- `--propose` output (sorted, one line per candidate): `<setAbbr> | <heroSlug> | <cardSlug> | abilityIndex=<n> | "<text>" | suggested=<token>`
- Apply summary: `Processed: N entries / Updated: N lines / Skipped: N lines (already marked)`
- Map resolution: `heroes[].slug` → `cards[].slug` → `abilities[abilityIndex]`; all three must resolve or loud-fail
- `data/cards/core.json` Web-Shooters lines already have WP-215 markup — idempotence guard skips them

## Guardrails
- NO `@legendary-arena/*` or `boardgame.io` imports — offline tooling only; ESM, no `require()`
- Loud-fail (non-zero + full-sentence message) on: invalid token form, unknown setAbbr/heroSlug/cardSlug, abilityIndex out of bounds
- Card data structure violations (missing `heroes[]`, `.slug`, `cards[]`, `abilities[]`) are loud-fails naming the offending file and field
- `--validate` exits non-zero on any map ↔ data drift; exits 0 only when all non-deferred entries are present
- `apply-effect-markers.mjs` and `villain-effect-markers.json` must remain byte-identical (do NOT touch)
- Heroes only — no villain card ability lines receive markup

## Required `// why:` Comments
- Idempotence skip: `// why: token already present — re-runs must produce zero diff`
- Invalid-token loud-fail: `// why: only three token forms are valid per D-21601 — catch typos before data is written`

## Files to Produce
- `scripts/convert-cards/apply-hero-ability-markers.mjs` — new (supports `--propose`, apply, `--validate`)
- `scripts/convert-cards/inputs/hero-ability-markers.json` — new curated map with `_deferred` block
- Up to ~19 `data/cards/*.json` — surgical token appends only; exact list from `--propose` output
- Governance (SPEC commit): `DECISIONS.md` D-21601..D-21603, `STATUS.md`, `WORK_INDEX.md`, `EC_INDEX.md`

## After Completing
- [ ] `--propose` exits 0; output format matches locked format above
- [ ] Apply exits 0; `Updated` count equals non-deferred map entry count (first run)
- [ ] Second apply run: `git diff data/cards/` empty; `Skipped` count equals entry count (idempotence)
- [ ] `--validate` exits 0 immediately after apply
- [ ] `grep -r "\[keyword:rescue:1\]" data/cards/ | wc -l` ≥ 20
- [ ] `grep -r "\[keyword:rescue:[^1]" data/cards/` empty
- [ ] `grep "keyword:rescue:1" data/cards/core.json | wc -l` = 1 (no duplicate)
- [ ] `grep "keyword:reveal\]" data/cards/core.json | wc -l` = 1 (no duplicate)
- [ ] Every `_deferred` entry has non-empty `reason` field
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0; `pnpm -r build` exits 0
- [ ] `DECISIONS.md` D-21601..D-21603 Active; `STATUS.md`, `WORK_INDEX.md`, `EC_INDEX.md` updated
- [ ] No files outside WP-216 `## Files Expected to Change` were modified

## Common Failure Smells
- Token appended twice on re-run — idempotence check must be `String.includes(token)` exact substring, not `startsWith` or partial
- `[keyword:reveal]` on a line without `[icon:vp]` — VP-threshold pattern finds nothing; executor silently fails; use `[keyword:reveal:2]`
- abilityIndex off-by-one vs actual `abilities[]` array — verify each entry against `--propose` output; script loud-fails on out-of-bounds
- `Updated` count on first run ≠ map entry count — a count mismatch means at least one entry silently skipped; investigate before closing
