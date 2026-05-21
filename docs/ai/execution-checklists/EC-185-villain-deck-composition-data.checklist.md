# EC-185 — Villain Deck Composition Data (Execution Checklist)

**Source:** docs/ai/work-packets/WP-167-villain-deck-composition-data.md
**Layer:** Registry (`packages/registry/src/schema.ts`) + Card Data Pipeline (`scripts/convert-cards/`) + Reference (`docs/ai/REFERENCE/00.2-data-requirements.md`)

## Before Starting
- [ ] SPEC commit recording D-16701 + D-16702 + D-16703 has landed.
- [ ] `scripts/convert-cards/inputs/leads.json` has the `core → magneto → brotherhood` entry.
- [ ] `scripts/convert-cards/inputs/hero-card-counts.json` exists (shape model for the villain counts file).
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
- Source `alwaysLeads`/`ledBy` from `leads.json` (replace the hardcoded `[]` at ~line 542/569).
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
- `scripts/convert-cards/apply-card-counts.mjs` — **modified (if needed)** — villain `copies` for the 4 outlier sets
- `scripts/convert-cards/inputs/villain-card-counts.json` — **new** — outlier copy counts
- `scripts/convert-cards/inputs/scheme-deck-counts.json` — **new** — per-scheme villain-deck counts (Midtown 8/12)
- `data/cards/*.json` — **regenerated** — additive `copies`, populated leads, scheme counts
- `docs/ai/REFERENCE/00.2-data-requirements.md` — **modified** — §1.4, §1.5
- `packages/registry/src/schema.villainDeckComposition.test.ts` — **new** — schema + regenerated-core.json regression

## After Completing
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] Converter ran; regenerating a second time yields no diff (idempotent)
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0
- [ ] All 40 `data/cards/*.json` validate against `SetDataSchema`
- [ ] No files outside the WP `## Files Expected to Change` modified (`git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` D-16701 + D-16702 + D-16703 flipped to Active
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-167 checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-185 marked Done

## Common Failure Smells (Optional)
- An existing set file fails validation after the change → a field was made required, not optional.
- `alwaysLeads`/`ledBy` still `[]` after regen → the converter still ignores `leads.json`.
- Hand-edited `core.json` reverts on regen → counts/leads were edited in output instead of the converter inputs.
