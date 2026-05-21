# EC-185 — Villain Deck Composition Data (Execution Checklist)

**Source:** docs/ai/work-packets/WP-167-villain-deck-composition-data.md
**Layer:** Registry (`packages/registry/src/schema.ts`) + Card Data Pipeline (`scripts/convert-cards/`) + Reference (`docs/ai/REFERENCE/00.2-data-requirements.md`)

## Before Starting
- [ ] SPEC commit recording D-16701 + D-16702 + D-16703 has landed.
- [ ] `scripts/convert-cards/inputs/leads.json` has the `core → magneto → brotherhood` entry.
- [ ] `scripts/convert-cards/inputs/hero-card-counts.json` exists (shape model for the villain counts file).
- [ ] `scripts/convert-cards/inputs/villain-card-counts.json` exists (308ecab scaffold) — curate it, do NOT recreate.
- [ ] `packages/registry/src/schema.ts` exports `VillainCardSchema`, `SchemeSchema`, `SetDataSchema`.
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0

## Locked Values (do not re-derive)
- `VillainCardSchema` add: `copies: z.number().int().min(1).optional()`
- `SchemeSchema` add: `villainDeckTwistCount: z.number().int().min(0).optional()`
- `SchemeSchema` add: `villainDeckBystanderCount: z.number().int().min(0).optional()`
- Villain copy converter default: **2** per villain card (outliers in `villain-card-counts.json`)
- Midtown Bank Robbery: `villainDeckTwistCount: 8`, `villainDeckBystanderCount: 12`
- Brotherhood result: 4 villains × `copies: 2` = 8 villain cards
- Magneto: `alwaysLeads: ["brotherhood"]`. Brotherhood: `ledBy: ["magneto"]` (sourced from `leads.json`)
- Field names verbatim: `copies`, `villainDeckTwistCount`, `villainDeckBystanderCount`

## Guardrails
- All three new fields are **optional + additive** — every existing `data/cards/*.json` must still validate.
- `data/cards/*.json` are generated — do NOT hand-edit; change the converter / input files and regenerate.
- Villain copy default is 2; outliers come ONLY from `villain-card-counts.json`. Never invent ad-hoc counts.
- **Copies coverage:** every villain card in all 40 sets must end up with `copies`. Absent ⇒ 1 is an engine-side schema fallback only; the converter never omits it. The 4 outlier sets (`2099`/`amwp`/`wpnx`/`wtif`) are produced only by `apply-card-counts.mjs`, so it MUST gain the overlay too.
- Source `alwaysLeads`/`ledBy` from `leads.json` (replace the hardcoded `[]` at ~line 542/569). Also wire leads for the 4 outlier sets in `apply-card-counts.mjs`.
- **Leads symmetry (villain groups only):** `alwaysLeads[]` ↔ `ledBy[]`, deduplicated. A group may be led by >1 mastermind (`wpnx/berserkers`); a mastermind may lead >1 group. Groups with no `leads.json` entry, henchmen-only masterminds, and `_anyVillainGroup` wildcards (`wtif/hank-pym`) correctly keep empty arrays — empty is NOT a failure. Skip the `PLACEHOLDER_DELETE_THIS` row and `{ "_set": … }` / `_note` comment markers.
- **Loud-fail:** exact slug match only (villain → `groupSlug`+`cardSlug`; scheme → `schemeSlug`; leads → mastermind+group slug). Unmatched entry → full-sentence error (set, entity, key) + non-zero exit, thrown before the affected set is written. No partial overwrite.
- **Clean diff:** append new fields; do NOT reorder/sort existing keys (key-sorting would churn all 40 files). Second regen must yield zero diff.
- **No unintended mutation:** only `copies`, lead arrays, and scheme counts may change. Hero cards, keywords, image URLs, abilities, henchmen, `physicalCards[]` unchanged.
- Counts/leads appliers must loud-fail on an input entry matching no card/scheme/group.
- Henchmen unchanged — 10 per group is an engine constant (D-1410); no henchman counts data.
- Registry must NOT import `@legendary-arena/game-engine`, `apps/server`, `boardgame.io`, or `pg`.
- `config.bystandersCount` (supply pile) is unrelated — do not touch it.

## Required `// why:` Comments
- `VillainCardSchema.copies`: absent ⇒ 1 copy; the converter normally writes a value.
- `SchemeSchema` count fields: optional so unannotated schemes fall back to engine defaults (8 twists; `numPlayers` bystanders).
- Converter villain-copy default: default-2 is the common 4-villain × 2 group (D-16703).
- Converter leads wiring: the relationship already exists in `leads.json`; the converter never read it (D-16703).

## Files to Produce
- `packages/registry/src/schema.ts` — **modified** — three optional fields
- `scripts/convert-cards/convert-cards-v15.mjs` — **modified** — villain `copies`, leads sourcing, scheme counts
- `scripts/convert-cards/apply-card-counts.mjs` — **modified** — villain `copies` + `alwaysLeads`/`ledBy` for the 4 outlier sets
- `scripts/convert-cards/inputs/villain-card-counts.json` — **already exists (308ecab scaffold)** — populate/curate; do NOT recreate
- `scripts/convert-cards/inputs/scheme-deck-counts.json` — **new** — per-scheme villain-deck counts (Midtown 8/12)
- `data/cards/*.json` — **regenerated** — additive `copies`, populated leads, scheme counts
- `docs/ai/REFERENCE/00.2-data-requirements.md` — **modified** — §1.4, §1.5
- `packages/registry/src/schema.villainDeckComposition.test.ts` — **new** — schema + regenerated-core.json regression

## After Completing
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] Converter ran; regenerating a second time yields no diff (idempotent, no key reordering)
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0
- [ ] All 40 `data/cards/*.json` validate against `SetDataSchema`
- [ ] Every villain card across all 40 sets has a `copies` value (no omissions)
- [ ] Leads symmetric on `core.json`: Magneto `alwaysLeads` ⊇ `brotherhood`, Brotherhood `ledBy` ⊇ `magneto`
- [ ] No unintended mutation: only `copies`, lead arrays, and scheme counts changed across the 40 files
- [ ] Loud-fail verified (manual): a bogus input entry exits non-zero before writing; reverted, not committed
- [ ] No files outside the WP `## Files Expected to Change` modified (`git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` D-16701 + D-16702 + D-16703 flipped to Active
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-167 checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-185 marked Done

## Common Failure Smells (Optional)
- An existing set file fails validation after the change → a field was made required, not optional.
- `alwaysLeads`/`ledBy` still `[]` after regen → the converter still ignores `leads.json`.
- Outlier-set (`2099`/`amwp`/`wpnx`/`wtif`) villains have no `copies` → `apply-card-counts.mjs` overlay was skipped.
- Huge diff across all 40 files (key order shifted) → keys were sorted/rewritten instead of appended.
- Converter crashes on `wtif/hank-pym` or a `{ "_set": … }` row → non-data / wildcard rows weren't skipped.
- `berserkers.ledBy` has only one mastermind in `wpnx` → multi-mastermind dedup/append not handled.
- Hand-edited `core.json` reverts on regen → counts/leads were edited in output instead of the converter inputs.
