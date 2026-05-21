# WP-167 — Villain Deck Composition Data (Registry)

**Status:** Draft — BLOCKED pending SPEC commit (D-16701, D-16702, D-16703) and human review
**Primary Layer:** Registry / Schema + Card Data Pipeline (`scripts/convert-cards/`)
**Dependencies:** none blocking. Supersedes the count assumptions in D-1411 and D-1412 (see `## Decisions to Record`).

---

## Session Context

WP-014B established the villain deck builder (`buildVillainDeck`) and locked its
composition counts under D-1410..D-1413: henchmen and scheme twists are virtual
instanced cards, villain cards come straight from the registry `FlatCard` keys,
scheme-twist count defaults to a hardcoded `8`, and villain-deck bystanders are
derived from `numPlayers`. This packet adds the registry data the engine needs
so those counts can come from the scheme and from per-villain copy counts
instead of being fixed; the matching engine change is WP-168.

---

## Goal

After this session, `@legendary-arena/registry` can express, per scheme, how
many scheme twists and how many bystanders belong in the villain deck, and how
many physical copies of each villain card a villain group contributes.
`VillainCardSchema` gains an optional `copies` field; `SchemeSchema` gains
optional `villainDeckTwistCount` and `villainDeckBystanderCount` fields. These
are produced by the **card data pipeline**, not hand-edited: the converter
(`convert-cards-v15.mjs`) writes `copies` on every villain card (default 2; a
new `inputs/villain-card-counts.json` supplies outliers), sources
`mastermind.alwaysLeads[]` / `villainGroup.ledBy[]` from the existing
`inputs/leads.json` (today they are hardcoded `[]`), and applies scheme
villain-deck counts from a new `inputs/scheme-deck-counts.json`. All 40
`data/cards/*.json` are then regenerated. For the Midtown Bank Robbery / Magneto
/ Brotherhood loadout this yields 8 villain cards (4 villains × 2), the 8/12
scheme counts, and a non-empty `magneto → brotherhood` lead. New fields are
additive and optional, so every set file still validates.

---

## Assumes

- `packages/registry/src/schema.ts` exports `VillainCardSchema`,
  `VillainGroupSchema`, `SchemeSchema`, `MastermindSchema`, `SetDataSchema` (WP-013+).
- `scripts/convert-cards/convert-cards-v15.mjs` is the main converter for the 36
  npm-derived sets; `apply-card-counts.mjs` is the companion for the 4 outlier
  sets (`2099`, `amwp`, `wpnx`, `wtif`).
- `scripts/convert-cards/inputs/leads.json` exists and contains
  `{ "set": "core", "mastermind": "magneto", "villainGroups": ["brotherhood"] }`
  and the equivalent entries for the other sets.
- `scripts/convert-cards/inputs/hero-card-counts.json` exists; its
  `{ setAbbr: { entitySlug: { "Card Name": count } } }` shape is the model for
  the villain counts file.
- `scripts/convert-cards/inputs/villain-card-counts.json` **already exists**
  (scaffolded by commit 308ecab, default 2 per card with the outlier sets
  pre-enumerated); this packet populates/curates it and wires the converter to
  read it. It must not be recreated from scratch.
- All 40 `data/cards/*.json` validate today against `SetDataSchema`.
- `pnpm --filter @legendary-arena/registry build` and `test` exit 0.
- `docs/ai/DECISIONS.md` exists; highest decision id is D-16703 (after this SPEC).
- The SPEC commit recording D-16701, D-16702, D-16703 has landed (this packet is
  BLOCKED until then — the counts it encodes supersede accepted D-1411/D-1412).

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — Registry layer
  responsibilities. Registry validates data; the converter is build tooling that
  produces the data Registry validates. Neither contains gameplay logic.
- `packages/registry/src/schema.ts` — read entirely. `VillainCardSchema`
  (~line 279), `SchemeSchema` (~line 299), `SetDataSchema` (~line 308). Note the
  additive-optional pattern already used for nullable unions.
- `scripts/convert-cards/convert-cards-v15.mjs` — read the villain-group,
  scheme, and mastermind emit paths. It currently writes `alwaysLeads: []`
  (~line 542) and `ledBy: []` (~line 569) as hardcoded empties.
- `scripts/convert-cards/apply-card-counts.mjs` — the loud-fail counts-overlay
  pattern (`hero-card-counts.json`) this packet mirrors for villains.
- `scripts/convert-cards/inputs/leads.json` — the mastermind↔group relationship
  source the converter must read.
- `scripts/convert-cards/inputs/hero-card-counts.json` — shape model for the new
  villain counts file.
- `docs/ai/REFERENCE/00.2-data-requirements.md §1.4, §1.5, §1.7` — villain
  group / scheme field tables and the copy-count ("N copies") precedent.
- `docs/ai/DECISIONS.md` — D-1410..D-1413, D-13501 (hero copy-count map), and the
  new D-16701/16702/16703.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rule 4 (no abbreviations), Rule 6
  (`// why:`), Rule 11 (full-sentence errors), Rule 14 (field names match contract).

---

## Vision Alignment

Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §17`. Clause numbers
reference `docs/01-VISION.md`. Triggered by §17.1 "Card data, card images, or
content semantics."

**Vision clauses touched:** §1 (Rules Authenticity — the villain deck must
match the exact Marvel Legendary composition; the current deck omits copies,
scheme-driven bystander counts, and Master Strikes), §2 (Content Authenticity —
per-villain copy counts and printed scheme setup text are part of authentic
card content, not digital reinterpretation), §10 (Content as Data — counts and
the Always-Leads relationship flow through the data pipeline, not hand-edits or
engine constants), §14 (Explicit Decisions, No Silent Drift — D-16701/16702/16703
explicitly supersede the count assumptions in D-1411 and D-1412 rather than
silently changing behavior).

**Conflict assertion:** No conflict: this WP preserves all touched clauses. It
moves the project closer to §1/§2 authenticity by sourcing real counts from
data, and advances §10 by making composition counts and lead relationships
data-driven.

**Non-Goal proximity (NG-1..7):** This packet adds optional, additive registry
fields and regenerates card data through the converter. It introduces no
user-facing, paid, persuasive, or competitive surface; no card is gated, sold,
or varied by ownership or payer status. None of NG-1 through NG-7 are crossed.

**Determinism preservation (§3, §8):** This packet is schema + data-pipeline
only; it adds no engine behavior or randomness. New fields are optional and
additive, so every regenerated `data/cards/*.json` validates and resolves
unchanged except for the additive `copies` and the now-populated lead arrays.
The deterministic engine (§8) consumes this data at setup time exactly as
before; identical setup config plus identical seed still produce identical
decks.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+ — `import`/`export`, never `require()`
- `node:` prefix on all Node.js built-in imports
- Test files use `.test.ts` extension — never `.test.mjs`
- No database or network access in the registry package
- Full file contents for every new or modified file — no diffs, no snippets
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- Registry must NOT import `@legendary-arena/game-engine`, `apps/server`, or `pg`.
- New schema fields are **optional and additive** — adding them must not break
  validation of any existing `data/cards/*.json` file.
- `copies`, `villainDeckTwistCount`, `villainDeckBystanderCount` are the locked
  field names; do not abbreviate or rename (Rule 14, lint §6).
- `data/cards/*.json` are **generated** — do not hand-edit them. Change the
  converter and/or its input files, then regenerate.
- Villain copies: converter default is **2 per villain card**; per-card outliers
  come only from `inputs/villain-card-counts.json`. Never invent ad-hoc counts.
- The counts/leads appliers must **loud-fail** on an input entry that matches no
  card / mastermind / group (mirroring `apply-card-counts.mjs`).
- Henchmen are unchanged — a fixed 10 per group is an engine constant (D-1410);
  no henchman counts data is added.

**Tightening invariants (WP-167):**
- **Copies coverage:** the converter MUST emit `copies` on every villain card in
  every set it produces (default 2; outliers only from
  `villain-card-counts.json`). Missing `copies` in generated data is a defect,
  not a valid state. D-16701's "absent ⇒ 1" is a schema-robustness fallback for
  legacy or malformed input, never a converter output path. Because the 4
  outlier sets (`2099`, `amwp`, `wpnx`, `wtif`) are produced **only** by
  `apply-card-counts.mjs`, that script MUST gain the same villain-`copies`
  overlay (and the same leads wiring below) — otherwise outlier-set villains
  silently lack `copies` and break this invariant.
- **Leads relationship (villain groups only):** for every `leads.json` entry
  that lists a villain group, the mastermind's `alwaysLeads[]` includes that
  group slug AND the group's `ledBy[]` includes that mastermind slug (symmetric).
  Both arrays are deduplicated. A villain group may be led by more than one
  mastermind (e.g., `wpnx` `berserkers` ← `omega-red` + `sabretooth`), and a
  mastermind may lead more than one group (e.g., `amwp` `kang-quantum-conqueror`
  → `armada-of-kang` + `quantum-realm`) — neither is an error. A villain group
  with no `leads.json` entry keeps an empty `ledBy[]` (e.g., the `ssw1`
  unassigned groups) — empty is valid, not a failure. The converter skips
  non-data rows (the `PLACEHOLDER_DELETE_THIS` row and comment-only
  `{ "_set": … }` / `_note` markers) and does NOT enumerate `_anyVillainGroup`
  wildcard masterminds (e.g., `wtif` `hank-pym`) into `alwaysLeads[]`.
  Henchmen-lead wiring is out of scope — this packet populates villain-group
  leads only.
- **Loud-fail contract:** matching is exact slug equality (villain counts →
  `groupSlug` + `cardSlug`; scheme counts → `schemeSlug`; leads → mastermind
  slug + group slug), never fuzzy or name-normalized. Any input entry matching
  no card / scheme / mastermind / group throws a full-sentence error naming the
  set, entity, and key, and exits non-zero — mirroring `apply-card-counts.mjs`.
  The throw happens **before** the affected set's output is written
  (validate-then-write per set, as the existing applier does at
  `apply-card-counts.mjs:141`), so a mismatched set is never partially
  overwritten.
- **Clean-diff / determinism:** new fields are appended in a fixed position;
  existing keys are NOT reordered, re-sorted, or rewritten. Do NOT introduce
  key-sorting — it would churn all 40 files and violate the no-unintended-mutation
  rule. Regenerating twice yields zero diff (idempotent).
- **No unintended mutation:** the only deltas in regenerated `data/cards/*.json`
  are the additive villain `copies`, populated `alwaysLeads[]` / `ledBy[]`, and
  the scheme `villainDeckTwistCount` / `villainDeckBystanderCount` where
  supplied. Hero cards, keywords, image URLs, abilities, henchmen, and
  `physicalCards[]` are unchanged.

**Session protocol:**
- If any field name, default, or scheme count is unclear, stop and ask before
  proceeding — never guess counts or invent field names.

**Locked contract values (relevant subset):**
- **MatchSetupConfig composition fields** (unchanged, do not touch):
  `schemeId`, `mastermindId`, `villainGroupIds`, `henchmanGroupIds`,
  `heroDeckIds`, `bystandersCount`, `woundsCount`, `officersCount`,
  `sidekicksCount`. `config.bystandersCount` sizes the bystander **supply
  pile** and is unrelated to the villain-deck bystander count this packet adds.
- **Villain card shape (current):** `name`, `slug`, `vp`, `vAttack`,
  `imageUrl`, `abilities` — this packet adds optional `copies`.
- **Scheme shape (current):** `id`, `name`, `slug`, `imageUrl`, `cards` —
  this packet adds optional `villainDeckTwistCount`, `villainDeckBystanderCount`.
- **Villain copy default:** `2` per villain card.
- **Midtown Bank Robbery counts:** `villainDeckTwistCount: 8`,
  `villainDeckBystanderCount: 12`.

---

## Scope (In)

### A) Schema — `packages/registry/src/schema.ts` (modified)
- `VillainCardSchema`: add `copies: z.number().int().min(1).optional()`.
  `// why:` absent ⇒ engine treats as 1; the converter normally writes a value.
- `SchemeSchema`: add `villainDeckTwistCount: z.number().int().min(0).optional()`
  and `villainDeckBystanderCount: z.number().int().min(0).optional()`.
  `// why:` both optional so schemes without setup metadata fall back to engine
  defaults (8 twists; `numPlayers` bystanders).

### B) Converter — `scripts/convert-cards/convert-cards-v15.mjs` (modified)
- Write `copies` on every villain card: look the card up in
  `inputs/villain-card-counts.json`; if absent, default to **2**. `// why:`
  default-2 is the common 4-villain × 2 group; cite D-16703.
- Populate `mastermind.alwaysLeads[]` and `villainGroup.ledBy[]` from
  `inputs/leads.json` (replacing the hardcoded `[]`). `// why:` the relationship
  data already exists in `leads.json`; the converter never read it (D-16703).
- Apply `villainDeckTwistCount` / `villainDeckBystanderCount` to schemes from
  `inputs/scheme-deck-counts.json`; omit the fields when the scheme is absent
  from the file. Loud-fail on any input entry matching no card/scheme/group.
- Extend `apply-card-counts.mjs` to apply the same villain-`copies` overlay AND
  the same `alwaysLeads[]` / `ledBy[]` wiring for the 4 outlier sets (`2099`,
  `amwp`, `wpnx`, `wtif`), mirroring its loud-fail pattern. This is required
  (not conditional): those sets contain villain groups and have `leads.json`
  entries, and `apply-card-counts.mjs` is the only producer for them, so the
  copies-coverage and leads invariants cannot hold for all 40 sets otherwise.

### C) Pipeline inputs
- `scripts/convert-cards/inputs/villain-card-counts.json` — **already exists**
  (scaffolded by commit 308ecab; default 2 per card, outlier sets pre-enumerated),
  shape `{ setAbbr: { groupSlug: { cardSlug: copies } } }`. Populate / curate it —
  do NOT recreate or overwrite the scaffold. The converter reads it; cards absent
  from it default to 2.
- `scripts/convert-cards/inputs/scheme-deck-counts.json` — **new** — per-scheme
  villain-deck counts, shape `{ setAbbr: { schemeSlug: { villainDeckTwistCount,
  villainDeckBystanderCount } } }`. Populate at least
  `core.midtown-bank-robbery: { 8, 12 }`.

### D) Regenerate data — `data/cards/*.json` (regenerated)
- Run the converter (and the outlier applier) to regenerate all 40 set files.
  The only gameplay-relevant deltas are additive `copies` on villain cards,
  populated `alwaysLeads` / `ledBy`, and the scheme counts where supplied.

### E) Data contract — `docs/ai/REFERENCE/00.2-data-requirements.md` (modified)
- §1.4: add the `copies` row to the villain-card field table.
- §1.5: add `villainDeckTwistCount` / `villainDeckBystanderCount` rows.

### F) Tests — `packages/registry/src/schema.villainDeckComposition.test.ts` (new)
- `VillainCardSchema` accepts `copies: 3` and a card with no `copies`; rejects
  `copies: 0` and `copies: -1`.
- `SchemeSchema` accepts both new fields. Negative case: a scheme omitting both
  fields validates AND the parsed object has neither key present (proves the
  fields are genuinely optional, not silently defaulted).
- Regenerated `core.json` parses against `SetDataSchema`; Brotherhood villains
  each have `copies: 2`; Midtown resolves twist 8 / bystander 12; Magneto
  `alwaysLeads` includes `"brotherhood"`; Brotherhood `ledBy` includes `"magneto"`.
- Round-trip stability: re-stringifying then re-parsing the regenerated
  `core.json` validates again and is structurally unchanged.
- Does not import `boardgame.io` or `@legendary-arena/game-engine`.

---

## Out of Scope

- No engine changes — `buildVillainDeck` consuming these fields is **WP-168**.
- No new generic Master Strike data — Master Strikes are engine virtual cards
  (WP-168), not registry data.
- No henchman copy-count data — henchman copies stay an engine constant (D-1410).
- No `MatchSetupConfig` changes — composition counts stay rules-driven (D-1412).
- No image-URL, hero, or keyword regeneration changes — only the villain
  `copies`, lead arrays, and scheme counts deltas are introduced.
- Refactors or "while I'm here" cleanups of the converter beyond the above.

---

## Files Expected to Change

- `packages/registry/src/schema.ts` — **modified** — add optional `copies`,
  `villainDeckTwistCount`, `villainDeckBystanderCount`.
- `scripts/convert-cards/convert-cards-v15.mjs` — **modified** — write villain
  `copies`, source `alwaysLeads`/`ledBy` from `leads.json`, apply scheme counts.
- `scripts/convert-cards/apply-card-counts.mjs` — **modified** — villain `copies`
  overlay and `alwaysLeads` / `ledBy` wiring for the 4 outlier sets.
- `scripts/convert-cards/inputs/villain-card-counts.json` — **modified
  (already exists; scaffolded by 308ecab)** — populate/curate villain copy
  counts; do not recreate.
- `scripts/convert-cards/inputs/scheme-deck-counts.json` — **new** — per-scheme
  villain-deck twist/bystander counts.
- `data/cards/*.json` — **regenerated** — additive `copies`, populated leads,
  scheme counts where supplied (all 40 files).
- `docs/ai/REFERENCE/00.2-data-requirements.md` — **modified** — document new fields.
- `packages/registry/src/schema.villainDeckComposition.test.ts` — **new** —
  `node:test` coverage + regenerated-`core.json` regression.
- `docs/ai/DECISIONS.md` — **modified** — D-16701, D-16702, D-16703.
- `docs/ai/STATUS.md` — **modified** — record the new capability.
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-167.

No other files may be modified.

---

## Acceptance Criteria

### Schema
- [ ] `VillainCardSchema` accepts `copies` as an optional positive integer and
      rejects `0` / negative values.
- [ ] `SchemeSchema` accepts `villainDeckTwistCount` and
      `villainDeckBystanderCount` as optional non-negative integers.
- [ ] A villain card with no `copies` and a scheme with neither field validate.

### Pipeline + data
- [ ] Every villain card in all 40 regenerated set files has a `copies` value
      (default 2; outliers from `villain-card-counts.json`) — no omissions in
      generated data.
- [ ] Leads are symmetric: every mastermind that leads a villain group has that
      group in `alwaysLeads[]`, and every led group has its mastermind(s) in
      `ledBy[]`. Masterminds that lead only henchmen, `_anyVillainGroup`
      wildcards, and groups with no `leads.json` entry correctly keep empty
      arrays. Both arrays are deduplicated.
- [ ] Regenerated `core.json`: each Brotherhood villain has `copies: 2`; Midtown
      Bank Robbery has `villainDeckTwistCount: 8` / `villainDeckBystanderCount: 12`;
      Magneto `alwaysLeads` includes `"brotherhood"`; Brotherhood `ledBy`
      includes `"magneto"`.
- [ ] All 40 `data/cards/*.json` validate against `SetDataSchema`.
- [ ] No unintended mutation: the only deltas across all 40 files are villain
      `copies`, populated `alwaysLeads[]` / `ledBy[]`, and scheme counts where
      supplied. Hero cards, keywords, image URLs, abilities, henchmen, and
      `physicalCards[]` are unchanged.
- [ ] Regenerating a second time produces zero diff (idempotent; no key
      reordering introduced).
- [ ] The counts/leads appliers loud-fail (full-sentence error, non-zero exit,
      no partial write of the affected set) on an input entry matching no
      card / scheme / mastermind / group.

### Tests
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0.
- [ ] New test file uses `node:test` / `node:assert`; no `boardgame.io` /
      `@legendary-arena/game-engine` import.

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` modified (`git diff --name-only`).

---

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm --filter @legendary-arena/registry build
# Expected: exits 0, no TypeScript errors

# Step 2 — regenerate card data
node scripts/convert-cards/convert-cards-v15.mjs
node scripts/convert-cards/apply-card-counts.mjs
# Expected: exits 0; loud-fails only on genuine input mismatches

# Step 3 — run all registry tests (includes 40-file validation + core.json regression)
pnpm --filter @legendary-arena/registry test
# Expected: TAP output — all tests passing, 0 failing

# Step 4 — confirm the new field names appear in schema
Select-String -Path "packages\registry\src\schema.ts" -Pattern "copies|villainDeckTwistCount|villainDeckBystanderCount"
# Expected: three matches (one per field)

# Step 5 — confirm Brotherhood copies + Magneto lead landed
Select-String -Path "data\cards\core.json" -Pattern "brotherhood"
# Expected: appears in Magneto alwaysLeads and Brotherhood ledBy

# Step 6 — confirm only expected files changed
git diff --name-only
# Expected: schema.ts, converter scripts, two new input files, data/cards/*.json, 00.2, test, governance

# Step 7 — idempotency: a second regen must produce zero diff
node scripts/convert-cards/convert-cards-v15.mjs
node scripts/convert-cards/apply-card-counts.mjs
git diff --name-only -- data/cards/
# Expected: empty output (no files changed by the second run)

# Step 8 — loud-fail (manual): temporarily add a bogus entry to one input file
#   (e.g. a fake cardSlug in villain-card-counts.json), run the converter,
#   confirm it exits non-zero with a full-sentence error naming the set/entity/key,
#   then revert the edit. Do NOT commit the bogus entry.
```

---

## Decisions to Record

- **D-16701 — Villain cards carry an optional `copies` field.** Optional `copies`
  integer on `VillainCardSchema`; absent ⇒ one copy. The value is produced at
  convert time (D-16703). Supersedes the implicit one-copy-per-`FlatCard`
  assumption D-1410 left for villains. The engine (WP-168) instances copies.
- **D-16702 — Villain-deck twist and bystander counts come from scheme
  metadata.** Optional `villainDeckTwistCount` / `villainDeckBystanderCount` on
  `SchemeSchema`. Supersedes D-1411's hardcoded 8 and D-1412's `numPlayers`
  derivation as the *source*; engine defaults remain as fallbacks.
- **D-16703 — Villain copies and Always-Leads are populated by the converter.**
  `convert-cards-v15.mjs` writes `copies` (default 2; outliers in
  `villain-card-counts.json`), sources `alwaysLeads` / `ledBy` from `leads.json`,
  and applies scheme counts from `scheme-deck-counts.json`; all 40 set files are
  regenerated.

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0
- [ ] All 40 `data/cards/*.json` validate against `SetDataSchema`
- [ ] Every villain card across all 40 sets has a `copies` value (no omissions)
- [ ] Leads are symmetric across all 40 sets (`alwaysLeads[]` ↔ `ledBy[]`)
- [ ] Regenerating the data a second time produces no diff (converter is idempotent)
- [ ] No unintended mutation: only `copies`, lead arrays, and scheme counts changed
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated — registry expresses villain copies, scheme
      villain-deck counts, and populated Always-Leads
- [ ] `docs/ai/DECISIONS.md` updated — D-16701, D-16702, D-16703 recorded
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-167 checked off with today's date
