# EC-257 — Hero Draw Markup Corpus Sweep (Execution Checklist)

**Source:** docs/ai/work-packets/WP-225-hero-draw-markup-corpus-sweep.md
**Layer:** Offline Tooling (`apply-hero-ability-markers.mjs` +
`hero-ability-markers.json`) + Card Data (`data/cards/*.json`). No engine changes.

## Before Starting

- [ ] Read WP-225 in full, plus WP-216 (the direct precedent).
- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0.
- [ ] `git diff --name-only data/cards/ scripts/convert-cards/ packages/game-engine/` — empty (clean baseline).
- [ ] All 40 card sets present (`ls data/cards/*.json | wc -l` = 40).
- [ ] Confirm the engine draw path is already present (no changes needed):
      `'draw'` in `HERO_KEYWORDS` (`heroKeywords.ts`); `case 'draw'` in
      `heroEffects.execute.ts`; `KEYWORD_PATTERN` magnitude capture in
      `heroAbility.setup.ts`.

## Locked Values (do not re-derive)

- **Active draw entries added:** 98 (83 `[keyword:draw:1]` + 13 `[keyword:draw:2]` + 2 `[keyword:draw:3]`).
- **Set files modified:** 30 — `3dtc amwp anni antm asrd bkpt bkwd ca75 chmp core cosm cvwr dead dkcy dstr ff04 mgtg msis msmc msp1 pttr rlmk rvlt shld smhc ssw1 vill wtif wwhk xmen`.
- **Per-set candidate counts:**
  `3dtc=1 amwp=2 anni=1 antm=3 asrd=1 bkpt=1 bkwd=3 ca75=2 chmp=3 core=9`
  `cosm=2 cvwr=10 dead=2 dkcy=9 dstr=1 ff04=1 mgtg=4 msis=3 msmc=2 msp1=4`
  `pttr=2 rlmk=1 rvlt=2 shld=2 smhc=1 ssw1=3 vill=3 wtif=4 wwhk=9 xmen=7`  (sum = 98)
- **New token form:** `[keyword:draw:N]`, grammar N ≥ 1 (regex `^\[keyword:draw:[1-9]\d*\]$`); zero-magnitude rejected. **This WP emits only N ∈ {1,2,3}** — `four`/`five` and N ≥ 4 are NOT emitted (deferred if encountered).
- **`VALID_TOKEN_PATTERN` + `assertValidToken` extension is ADDITIVE only:** existing rescue/reveal branches kept byte-for-byte intact; draw form appended as one new `|` alternation. No existing branch edited/reordered.
- **Engine files modified:** 0 — `packages/game-engine/**` is a zero diff at close.
- **Detector (locked):** operating on `line.trim()`, a line is a draw candidate iff
  `/^(?:\[(?:hc|team):[^\]]+\]:\s*)?Draw (a|one|two|three) cards?\.$/i`
  AND it contains neither `Reveal` nor an existing `[keyword:` token.
  Magnitude: `a`/`one`→1, `two`→2, `three`→3. No internal-whitespace collapse; the card line is never rewritten (token appended to verbatim string).
- **Detector branch placement:** `isDrawCandidate` MUST sit AFTER all reveal-family branches in `collectProposeRowsForSet` (reveal keeps first-match priority).
- **`assertValidToken` message:** single canonical sentence listing all allowed forms incl. `[keyword:draw:N]`; content invariant across runs.
- **"Skipped" semantics:** Skipped counts ONLY entries whose exact `markupToken` is already present (prior rescue/reveal or re-run). Lookup failures / structural mismatches / regex misses MUST hard-exit non-zero, never count as Skipped.
- **`_deferred` discipline:** pattern-based, deduplicated — each deferred draw pattern class appears exactly once as ONE real exemplar line; `reason` names the class, not the instance. No per-instance enumeration.
- **Active entry shape (unchanged):** `{ heroSlug, cardSlug, abilityIndex, markupToken }`.
- **`_deferred` entry shape (unchanged):** `{ setAbbr, heroSlug, cardSlug, abilityIndex, abilityText, reason }`.
- **D-entry:** D-22501 — `[keyword:draw:N]` token form + 98-line corpus sweep.
- **Commit message:** `EC-257: hero draw markup corpus sweep — [keyword:draw:N] + 98 lines across 30 sets`.

## Order of Operations

1. Edit `apply-hero-ability-markers.mjs` (additive only — existing branches byte-for-byte intact):
   - Append `|^\[keyword:draw:[1-9]\d*\]$` to `VALID_TOKEN_PATTERN` (add a
     `// why: D-22501` comment). Do not edit existing alternations.
   - Append `[keyword:draw:N]` to the `assertValidToken` allowed-token list
     (single canonical sentence; do not rewrite existing wording).
   - Add `isDrawCandidate(line)` + `suggestDrawToken(line)` (full JSDoc;
     operate on `line.trim()`; magnitudes 1–3 only) and a new branch in
     `collectProposeRowsForSet` placed **after all reveal-family branches**.
2. `node scripts/convert-cards/apply-hero-ability-markers.mjs --propose | grep "suggested=\[keyword:draw" | wc -l` → **98**. Verify per-set counts.
3. Curate the 98 candidate rows into `hero-ability-markers.json` active entries
   (human-review each against the detection rule; do not blind-dump `--propose`).
   Add deferred draw **patterns** to `_deferred` — one exemplar per class, `reason`
   names the class (catalogue, not per-line).
4. JSON parse check, then **pre-apply gate** (distribution 83/13/2, see §After
   Completing), then `--validate`, then apply mode, then idempotence re-run,
   then **post-apply gate** (30 set files touched).

## Guardrails

- `packages/game-engine/src/**` **zero diff** — engine is fully out of scope.
- **Never hand-edit `data/cards/*.json`** — all 98 tokens are written by apply mode.
- **`--propose` count gate.** If the draw candidate count is **not 98**, or any
  per-set count disagrees with the table above → **STOP**, reconcile against the
  card data (the corpus may have drifted since drafting), and amend WP-225
  before curating.
- **Curated map is authoritative** — `--propose` is a bootstrap aid only.
- **Idempotence (mechanism)** — for each line, if the exact `markupToken`
  substring is already present, no mutation; else append once with a single
  leading space. No duplicate append, exact string comparison, no whitespace
  normalization of the card line, never a partial write. Second apply run → a
  zero-line `git diff data/cards/`.
- **Pre-apply / post-apply gates are blocking** — the distribution gate (83/13/2)
  runs before apply; the 30-set gate runs after. Either failing stops the EC.
- **Slug fidelity is strict** — `heroSlug` / `cardSlug` must exactly match
  `data/cards/*.json`; mismatch is a blocking loud-fail.
- **Uniqueness** — no two active entries share `(setAbbr, heroSlug, cardSlug, abilityIndex)`.
- Only the 7 files in §Files to Produce may be modified — `git diff --name-only` enforces this.

## Files to Produce

- `scripts/convert-cards/apply-hero-ability-markers.mjs` — **modified** — token pattern + message + draw detector
- `scripts/convert-cards/inputs/hero-ability-markers.json` — **modified** — +98 active draw entries + `_deferred` draw patterns
- `data/cards/*.json` — **modified** — `[keyword:draw:N]` appends across 30 set files (apply mode only)
- `docs/ai/DECISIONS.md` — **modified** — D-22501 Active with Landed date
- `docs/ai/STATUS.md` — **modified** — WP-225 executed
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-225 `[ ]` → `[x]` with date
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-257 Draft → Done

## After Completing

- [ ] `--propose` prints exactly 98 draw candidate rows (per-set table matches).
- [ ] JSON parse check exits 0:
      `node -e "JSON.parse(require('fs').readFileSync('scripts/convert-cards/inputs/hero-ability-markers.json','utf8'))"`
- [ ] **PRE-APPLY GATE** passes (map holds exactly 98 draw entries, distribution
      83/13/2) — run the one-liner in WP-225 §Verification Steps; must print
      `PRE-APPLY GATE PASS` and exit 0 **before** apply mode.
- [ ] Apply mode exits 0; `Processed: 128 / Updated: 98 / Skipped: 30`.
- [ ] `--validate` exits 0.
- [ ] Second apply run → `git diff data/cards/` empty (idempotence).
- [ ] `grep -rho "\[keyword:draw:[0-9]*\]" data/cards/ | sort | uniq -c` → 83×`:1`, 13×`:2`, 2×`:3`.
- [ ] `grep -rho "\[keyword:draw:[0-9]*\]" data/cards/ | grep -Ev "\[keyword:draw:[123]\]"` → empty (no `draw:0`, no `draw:4`+).
- [ ] **POST-APPLY GATE:** `grep -rl "\[keyword:draw:" data/cards/ | wc -l` → 30.
- [ ] `core/black-widow/mission-accomplished` idx 0 carries `[keyword:draw:1]`.
- [ ] `git diff --name-only packages/game-engine/` → empty.
- [ ] `pnpm --filter @legendary-arena/game-engine test` → 0 fail.
- [ ] `pnpm -r build` → exits 0.
- [ ] D-22501 Active in DECISIONS.md with Landed date.
- [ ] STATUS.md updated; WORK_INDEX.md WP-225 `[x]`; EC_INDEX.md EC-257 Done.

## Common Failure Smells

- `--propose` count ≠ 98 → corpus drift or detector regex mismatch; recheck the
  locked regex and per-set table before curating.
- A reveal-draw line shows up as a draw candidate → the detector's `Reveal`
  exclusion (rule 2) or the `^…$` anchor is wrong; reveal-then-draw belongs to
  the reveal family, never the draw detector.
- `Updated` < 98 → a curated active entry was dropped or a slug mismatch made
  the script loud-fail mid-run; reconcile against `--propose` output.
- `git diff packages/game-engine/` non-empty → an engine file was touched; the
  engine is out of scope — revert it.
- `git diff data/cards/` non-empty on second apply → a token was hand-edited or
  the idempotence guard regressed; re-derive from apply mode only.
- `[keyword:draw:0]` present → a zero-magnitude token slipped in; the
  `[1-9]\d*` pattern must reject it (loud-fail), so this means the pattern edit
  is wrong.
- `[keyword:draw:4]`+ present → magnitude leaked past the 1–3 cap; the detector
  regex or `suggestDrawToken` was widened beyond `three`, or a map entry was
  hand-curated with N ≥ 4. The pre-apply gate must have caught this — re-run it.
- An existing rescue/reveal token vanished or `--validate` flags drift on a
  rescue/reveal entry → `VALID_TOKEN_PATTERN` was rewritten instead of extended
  additively; restore the existing branches byte-for-byte and append only.
- A reveal line gets a draw token because a future reveal pattern was loosened →
  `isDrawCandidate` was placed before the reveal-family branches; move it after.
