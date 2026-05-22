# EC-187 — Scheme Villain-Deck Count Curation (Execution Checklist)

**Source:** docs/ai/work-packets/WP-169-scheme-villain-deck-count-curation.md
**Layer:** Registry / Card Data Pipeline

## Before Starting
- [ ] WP-167 is on `main`: `SchemeSchema` has optional `villainDeckTwistCount` / `villainDeckBystanderCount`; `convert-cards-v15.mjs` has `applySchemeDeckCounts`; `inputs/scheme-deck-counts.json` has the Midtown entry.
- [ ] `apply-card-counts.mjs` confirmed to have NO scheme-deck-count logic yet.
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0

## Locked Values (do not re-derive)
- Field names: `villainDeckTwistCount`, `villainDeckBystanderCount` (never abbreviate).
- Engine fallbacks (do NOT encode when printed value equals these): twists `8` (D-1411); bystanders `numPlayers` (D-1412).
- Input shape: `{ setAbbr: { schemeSlug: { villainDeckTwistCount?, villainDeckBystanderCount? } } }`; at least one count per entry (D-16803).
- Field placement: count field(s) appended AFTER the scheme's existing keys (after `cards`, as WP-167 Midtown), `villainDeckTwistCount` before `villainDeckBystanderCount`; never reorder existing keys.
- Keep existing entry: `core.midtown-bank-robbery → { 8, 12 }`.
- Outlier sets (applied by `apply-card-counts.mjs`): `2099`, `amwp`, `wpnx`, `wtif`.
- Explicit-zero case: `chmp.hypnotize-every-human → villainDeckBystanderCount: 0`.

## Guardrails
- Encode a `villainDeckTwistCount` ONLY for a single fixed twist count ≠ 8, extracted from the committed Setup line in `data/cards/*.json`. Never invent.
- Player-count-dependent / additive-per-player / non-constant twist counts: DO NOT encode — carve-out per D-16804; record in the finalized list.
- Encode `villainDeckBystanderCount` ONLY for an explicit printed villain-deck bystander count (incl. zero); mechanic-based bystander manipulation is NOT a count.
- Assign each count independently; never write an `undefined`-valued key.
- An entry with a real slug but neither count is malformed → loud-fail (full-sentence, non-zero exit), never silent skip (D-16803).
- Twists placed OUTSIDE the villain deck ("N additional Twists next to this Scheme") are excluded from the count, NOT a carve-out trigger — encode only the in-deck constant (Killbots → 5). Carve out only when the in-deck count itself is non-constant.
- Mutate ONLY the two count fields in place; do not clone/reconstruct/re-serialize the `scheme` object.
- Do NOT touch `schema.ts` (no schema change), the engine, `villain-card-counts.json`, `leads.json`, or `00.2` field tables.
- Preserve exact-slug loud-fail + validate-before-write in BOTH converters; never fuzzy-match.
- `data/cards/*.json` are generated — edit the input/converter then regenerate; no hand-edits; second regen = zero diff.

## Required `// why:` Comments
- `applySchemeDeckCounts` independent-assignment branch: omitted count keeps the engine default (D-16702/D-16803); no `undefined` key.
- `apply-card-counts.mjs` scheme overlay: it is the only producer for the 4 outlier sets, so without this their entries are silently ignored (D-16803).

## Files to Produce
- `scripts/convert-cards/convert-cards-v15.mjs` — **modified** — independent per-count assignment in `applySchemeDeckCounts`.
- `scripts/convert-cards/apply-card-counts.mjs` — **modified** — load + apply scheme-deck-counts for the 4 outlier sets (same loud-fail).
- `scripts/convert-cards/inputs/scheme-deck-counts.json` — **modified** — curate flat twist + explicit bystander overrides; update `_note`.
- `data/cards/*.json` — **regenerated** — curated scheme counts only.
- `packages/registry/src/schema.schemeDeckCounts.test.ts` — **new** — twist-only key-absent, zero bystander, outlier-set application, no-over-encoding, carve-out-not-encoded, 40-file validation.
- `docs/ai/DECISIONS.md` — **modified** — D-16803, D-16804 (D-16804 carries the finalized carve-out list).
- `docs/ai/STATUS.md` / `WORK_INDEX.md` / `EC_INDEX.md` — **modified** — record + check off.

## After Completing
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0
- [ ] Both converters run clean; second regen produces zero `data/cards/` diff
- [ ] `git diff --name-only` shows only the allowlist
- [ ] `docs/ai/STATUS.md` updated; `DECISIONS.md` D-16803/D-16804 recorded; `WORK_INDEX.md` WP-169 checked off with date; `EC_INDEX.md` EC-187 → Done

## Common Failure Smells
- A scheme with both fields where the Setup only prints a twist count → over-encoded a `numPlayers` bystander default (should be absent).
- An outlier-set (`2099`/`amwp`/`wpnx`/`wtif`) entry that silently no-ops → `apply-card-counts.mjs` overlay missing or not loud-failing.
- A flat value encoded for a "X players: a, Y players: b" scheme → carve-out misclassified as flat.
