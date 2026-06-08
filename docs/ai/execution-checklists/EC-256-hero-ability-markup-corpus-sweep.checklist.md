# EC-256 — Hero Ability Markup Corpus Sweep (Execution Checklist)

**Source:** docs/ai/work-packets/WP-224-hero-ability-markup-corpus-sweep.md
**Layer:** Offline Tooling + Card Data (no engine, no script changes)

## Before Starting

- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0
- [ ] `git diff --name-only data/cards/ scripts/convert-cards/` — empty (clean baseline)
- [ ] `hero-ability-markers.json` `_deferred` block has exactly **4** entries before this session
- [ ] All 40 card sets present under `data/cards/` (`ls data/cards/*.json | wc -l` = 40)

## Locked Values (do not re-derive)

- **Active entries added:** 0 — `data/cards/*.json` are NOT modified under this WP
- **`_deferred` entries added:** 30 (exact list in WP-224 §Deferred Entries to Add)
- **`_deferred` total after:** 34
- **Invariant:** initial (4) + added (30) = final (34)
- **`_deferred` object shape** (no new fields permitted):
  ```json
  {
    "setAbbr": "...",
    "heroSlug": "...",
    "cardSlug": "...",
    "abilityIndex": 0,
    "abilityText": "...",
    "reason": "..."
  }
  ```
- **`_deferred` sort order:** entire array sorted by `setAbbr` (primary), `heroSlug`
  (secondary), `cardSlug` (tertiary), `abilityIndex` (quaternary). Category groupings
  in WP-224 are editorial only — do NOT affect JSON order.
- **D-entry:** D-22401 — Corpus Sweep All 40 Sets, zero active entries, 30 deferred
- **Commit message:** `EC-256: hero-ability-markers corpus sweep — 30 deferred entries, all 40 sets covered`

## Guardrails

- `data/cards/*.json` **must not be modified** — `git diff data/` must be empty at close
- `scripts/convert-cards/apply-hero-ability-markers.mjs` **must not be modified**
- `packages/game-engine/src/**` **zero diff** — engine is fully out of scope
- **`--propose` stop condition.** If ANY candidate appears for a set in:
  `{ anni, antm, asrd, bkpt, bkwd, dims, dstr, fear, gotg, mdns, msmc, nmut, noir,`
  `pttr, rlmk, rvlt, shld, vill, vnom, wpnx, wtif, xmen }` → **STOP**, amend WP-224,
  do not add any `[keyword:X]` token under this WP
- **Slug fidelity is strict.** `setAbbr`, `heroSlug`, and `cardSlug` MUST exactly match
  values in `data/cards/*.json`. Mismatch = blocking error; reconcile before proceeding
- **Uniqueness constraint.** No two `_deferred` entries may share the same
  `(setAbbr, heroSlug, cardSlug, abilityIndex)` tuple. Duplicate detection is a
  blocking error
- **Minimal diff rule.** Only add new `_deferred` entries. No reformatting, reordering
  of existing entries, or whitespace-only changes permitted
- Only the 5 files in §Files to Produce may be modified — `git diff --name-only` enforces this

## Files to Produce

- `scripts/convert-cards/inputs/hero-ability-markers.json` — **modified** — +30 `_deferred` entries
- `docs/ai/DECISIONS.md` — **modified** — D-22401
- `docs/ai/STATUS.md` — **modified** — WP-224 executed
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-224 `[ ]` → `[x]` with date
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-256 Draft → Done

## After Completing

- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs --propose` exits 0 —
      no candidate rows for any of the 22 unscanned sets
- [ ] JSON parse check exits 0:
      `node -e "JSON.parse(require('fs').readFileSync('scripts/convert-cards/inputs/hero-ability-markers.json','utf8'))"`
- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0
- [ ] `_deferred` block has exactly **34** entries (invariant: 4 + 30 = 34):
      `node -e "const j=JSON.parse(require('fs').readFileSync('scripts/convert-cards/inputs/hero-ability-markers.json','utf8')); console.log(j._deferred.length)"` = 34
- [ ] `git diff data/` — empty (no `data/cards/*.json` touched)
- [ ] `pnpm -r build` exits 0
- [ ] D-22401 Active in `docs/ai/DECISIONS.md` with Landed date
- [ ] `docs/ai/STATUS.md` updated — WP-224 executed
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-224 `[x]` Done with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-256 Done

## Common Failure Smells

- `--validate` fails after editing → JSON syntax error in `_deferred` block (trailing comma,
  missing quote, mismatched brace); run the JSON parse check (step 2.5) to locate the error
- `_deferred` count = 33 not 34 → one entry was accidentally omitted; recount against WP-224 tables
  (A=13, B=14, C=3; total=30 new + 4 existing = 34)
- `git diff data/` non-empty → an apply run fired unintentionally; revert with `git checkout HEAD -- data/`
- `--propose` shows unexpected candidate in an unscanned set → STOP, amend WP-224, do not proceed
- Slug mismatch in `_deferred` entry → `heroSlug` or `cardSlug` does not match `data/cards/*.json`;
  look up the exact value from the card JSON before inserting
- Duplicate `(setAbbr, heroSlug, cardSlug, abilityIndex)` tuple → grep `_deferred` block for the
  tuple before inserting; duplicate is a blocking error
