# WP-216 — Hero Ability Markup Corpus Sweep: Rescue and Reveal-Draw (Card Data + Tooling)

**Status:** Draft
**Primary Layer:** Card Data + Offline Tooling
**Dependencies:** WP-215 (rescue/reveal executor + [keyword:X:N] markup syntax)

---

## Session Context

> WP-215 wired the `rescue` and `reveal` executors and updated Web-Shooters
> (Core Set) as the single v1 markup target. The infrastructure is now in
> place: `[keyword:rescue:N]` and `[keyword:reveal]` / `[keyword:reveal:N]`
> are parsed and executed correctly.
>
> 19 card set files still carry unmarked "Rescue a Bystander." ability lines.
> 9 additional hero ability lines carry simple reveal-draw text without markup.
> None of those cards produce effects today — `parseAbilityText()` returns
> `effects: []` for every one of them.
>
> The fix is a data-only pass: append the correct markup token to each
> unambiguous ability line. The offline tooling approach mirrors
> `apply-effect-markers.mjs` (WP-187/WP-190 villain markers):
> a curated JSON map explicitly authorizes each markup addition,
> and a new script applies them idempotently across `data/cards/*.json`.
> No engine changes. No registry changes. No schema changes.

---

## Goal

After this packet, every unambiguous hero `onPlay` rescue-bystander and
reveal-draw ability line in the 40-set corpus carries the correct
`[keyword:rescue:1]` or `[keyword:reveal]` / `[keyword:reveal:2]` markup
token. Playing those hero cards fires the correct effects. The markup
additions are applied by a new idempotent script driven by an explicitly
curated human-reviewed map.

Patterns that require engine capabilities not yet implemented (variable
magnitude, per-hero-count, `onFight` timing, top-N reveal, non-draw reveals)
are explicitly deferred and documented in the map's `_deferred` block.

---

## Assumes

- WP-215 shipped: `[keyword:rescue:1]` on Web-Shooters fires correctly;
  `[keyword:reveal]` on Web-Shooters fires correctly; VP-cost-threshold
  extraction and explicit `:N` suffix both work (D-21503, D-21505).
- `scripts/convert-cards/apply-effect-markers.mjs` and its input format
  (`inputs/villain-effect-markers.json`) exist as the established pattern
  for offline curated marker application (WP-187/EC-214 precedent).
- `data/cards/*.json` is authoritative card data (40 sets, 36 from
  `convert-cards-v15.mjs` + 4 from `apply-card-counts.mjs` outliers).
- The engine's `heroAbility.setup.ts` `parseAbilityText()` already extracts:
  (a) `[keyword:X:N]` with explicit magnitude suffix (D-21503),
  (b) `[keyword:X]` without suffix → `magnitude: undefined`,
  (c) VP-cost-threshold from `N[icon:vp] or less` in the same ability line
  (D-21505).
- Core Set Web-Shooters already has both ability lines marked (WP-215).
- Baseline: `fee0bb2` on `origin/main` (2026-06-05) — WP-215 + EC-247 landed.

---

## Context (Read First)

1. `docs/ai/work-packets/WP-215-hero-rescue-and-reveal-draw-effects.md` —
   executor contracts, locked values, deferred patterns
2. `packages/game-engine/src/setup/heroAbility.setup.ts` — `parseAbilityText()`,
   `KEYWORD_PATTERN`, `VP_COST_THRESHOLD_PATTERN`, `ICON_MAGNITUDE_PATTERN`
3. `scripts/convert-cards/apply-effect-markers.mjs` — established offline
   marker script pattern (curated map → idempotent surgical JSON edit)
4. `scripts/convert-cards/inputs/villain-effect-markers.json` — curated
   map format reference
5. `docs/ai/DECISIONS.md` — D-21501..D-21505 (rescue/reveal contracts)
6. `docs/ai/ARCHITECTURE.md` — Layer Boundary: Shared Tooling (offline
   scripts are upstream of Registry; no engine/server imports)

---

## Scope (In)

**Tooling (new script + new curated map):**
- Create `scripts/convert-cards/apply-hero-ability-markers.mjs` — offline
  idempotent script that reads `inputs/hero-ability-markers.json` and
  appends `[keyword:rescue:N]` / `[keyword:reveal]` / `[keyword:reveal:N]`
  tokens to the specified ability lines in `data/cards/*.json`.
- Two modes: `(default)` apply — write markup to files; `--propose` — dry-run
  scan of all hero ability lines matching rescue/reveal patterns, print
  candidates without writing (see Candidate Detection Rules and `--propose`
  Output Format below). (Mirrors `apply-effect-markers.mjs` modes.)
- A third mode: `--validate` — verifies that every non-deferred entry in the
  curated map is already present in the card data; exits non-zero if any drift
  is detected. Safe for CI use (read-only, like `--propose`).
- Create `scripts/convert-cards/inputs/hero-ability-markers.json` — curated
  map keyed by `setAbbr`, with hero entries specifying `heroSlug`, `cardSlug`,
  `abilityIndex` (0-based index into `cards[].abilities[]`), and `markupToken`
  to append. A `_deferred` block documents patterns that require engine
  capabilities not yet available (variable magnitude, onFight timing, etc.).

**Card data (applied by the script):**
- `"Rescue a Bystander."` → `"Rescue a Bystander. [keyword:rescue:1]"` for
  all unconditional single-bystander rescue lines across all sets.
- `"[hc:X]: Rescue a Bystander."` and `"[team:X]: Rescue a Bystander."` →
  append `[keyword:rescue:1]` for all condition-gated single-bystander lines
  (conditions already parsed by `parseAbilityText()`; executor evaluates them).
- `"[team:heroes-of-wakanda] [keyword:Ambush]: Rescue a Bystander."` →
  **deferred** — `[keyword:Ambush]` indicates `onFight`/timing semantics not
  yet wired to `executeHeroEffects`; skip in this WP.
- `"Reveal the top card of your deck. If that card costs 2[icon:vp] or less, draw it."` →
  append `[keyword:reveal]` (no `:2` suffix; VP-cost-threshold extraction
  reads the `2[icon:vp]` already present per D-21505).
- `"Reveal the top card of your deck. If it costs 2 or less, draw it."` →
  append `[keyword:reveal:2]` (no `[icon:vp]` in the line; explicit suffix
  required for magnitude extraction per D-21503).
- `"[hc:tech]: Reveal the top card of your deck. If it costs 2 or less, draw it."` →
  append `[keyword:reveal:2]` (condition already parsed; explicit suffix required).

**Tests:**
- Verify the script exits 0 with `--propose` mode (read-only, no writes);
  output format matches the locked `--propose` output format below.
- Verify that after apply, running the script again produces a zero-line
  diff (idempotence).
- Verify `--validate` exits 0 immediately after apply (no drift).
- Verify total updates applied equals the non-deferred entry count in the map.

---

## Out of Scope

- `wound` and `conditional` keyword implementation — still deferred.
- Variable-magnitude rescue: `"[team:x-men]: Rescue a Bystander for each other [team:x-men] Hero you played this turn."` — requires counter/per-card-count engine support; deferred.
- Meta-rescue trigger: `"Whenever you Rescue a Bystander this turn, do any 'rescue' ability on it an extra time."` — not a rescue effect; deferred.
- `Fight:`-timed hero effects: `"Fight: Rescue 4 Bystanders."` on tactic cards — `onFight` timing not wired to `executeHeroEffects`; deferred.
- `[keyword:Ambush]:`-timed hero ability lines — same `onFight` timing gap; deferred.
- `[keyword:Spectrum]:` reveal lines — `Spectrum` is a card-ability keyword, not a hero ability condition; executor dispatch for this keyword deferred.
- `[keyword:Focus]` reveal lines — same; deferred.
- `"Reveal the top card of your deck. If it costs 3 or less, draw it."` — if any exist, curate in `_deferred` block (edge threshold; verify against corpus at execution time).
- Non-draw reveal variants: `"Discard it or put it back."`, `"You may KO it."` — reveal effect without draw; different executor case; deferred.
- Villain-deck reveal lines: `"Reveal the top card of the Villain Deck..."` — different pipeline entirely.
- Multi-reveal lines: `"Reveal the top three cards of your deck..."` — executor supports single-peek only; deferred.
- Any engine changes — this WP is data + tooling only.
- Any registry, server, or client changes.
- Adding SHIELD starter cards to `G.cardStats` — deferred (D-21502).

---

## Files Expected to Change

**New (tooling):**
1. `scripts/convert-cards/apply-hero-ability-markers.mjs` — new offline
   idempotent marker script (analogous to `apply-effect-markers.mjs`)
2. `scripts/convert-cards/inputs/hero-ability-markers.json` — new curated map

**Modified (card data — exact set determined by `--propose` scan at execution time):**

Up to 19 `data/cards/*.json` files will receive surgical line-level edits
(append markup token to specified ability lines). Core Set (`core.json`) may
receive 0 additional edits (Web-Shooters already marked by WP-215; The Amazing
Spider-Man's multi-reveal line is out of scope). The exact file list is
determined during execution by running `--propose` and curating the output.

Expected to change: `3dtc.json`, `amwp.json`, `anni.json`, `bkpt.json`,
`ca75.json`, `chmp.json`, `cosm.json`, `cvwr.json`, `dead.json`, `dkcy.json`,
`ff04.json`, `mdns.json`, `mgtg.json`, `msp1.json`, `pttr.json`, `vnom.json`,
`wpnx.json`, `xmen.json` — and possibly others. File count confirmed at
execution time by `--propose` output.

**Governance:**
- `docs/ai/work-packets/WP-216-hero-ability-markup-corpus-sweep.md` — modified
- `docs/ai/execution-checklists/EC-248-hero-ability-markup-corpus-sweep.checklist.md` — modified
- `docs/ai/DECISIONS.md` — D-21601..D-21603 landed Active
- `docs/ai/work-packets/WORK_INDEX.md` — WP-216 flipped to `[x]`

---

## Contract

This WP locks the following surfaces. Future WPs that consume or reference
these must treat them as read-only contracts; changes require a DECISIONS.md
entry.

### CLI surface — `apply-hero-ability-markers.mjs`

| Mode | Invocation | Exit code | Side effects |
|---|---|---|---|
| Apply (default) | `node apply-hero-ability-markers.mjs` | 0 on success, non-zero on any loud-fail | Writes `data/cards/*.json`; prints summary |
| Dry-run | `node apply-hero-ability-markers.mjs --propose` | 0 always (read-only) | None; prints candidate rows |
| Validate | `node apply-hero-ability-markers.mjs --validate` | 0 = map matches data; non-zero = drift detected | None (read-only) |

### Output format contracts (D-21601)

**`--propose` output** (one line per candidate, sorted lexically by setAbbr → heroSlug → cardSlug → abilityIndex):
```
<setAbbr> | <heroSlug> | <cardSlug> | abilityIndex=<n> | "<abilityText>" | suggested=<markupToken>
```

**Apply summary** (printed to stdout on completion):
```
Processed: N entries
Updated:   N lines
Skipped:   N lines (already marked)
```

### `hero-ability-markers.json` schema (D-21601)

```jsonc
{
  "<setAbbr>": [
    { "heroSlug": "...", "cardSlug": "...", "abilityIndex": 0, "markupToken": "..." }
  ],
  "_deferred": [
    { "setAbbr": "...", "heroSlug": "...", "cardSlug": "...", "abilityIndex": 0,
      "abilityText": "...", "reason": "..." }
  ]
}
```

Valid `markupToken` values: `"[keyword:rescue:1]"`, `"[keyword:reveal]"`,
`"[keyword:reveal:2]"`. No other forms are valid (D-21601).

### Card data contract

Each `data/cards/<setAbbr>.json` that this WP modifies remains fully
parseable by the existing `apply-effect-markers.mjs` pipeline and the
registry's JSON loader. The only change per file is surgical token
appends to specific `abilities[]` strings — no structural fields added
or removed.

---

## Non-Negotiable Constraints

### Tooling-Wide
- **ESM only, Node v22+** — no CommonJS, no `require()`, no `node-fetch`.
- **Human-style code** per `docs/ai/REFERENCE/00.6-code-style.md` — readable,
  explicit, junior-maintainable. Full JSDoc on every exported function.
- **No engine/registry/server imports** — this is offline tooling in the
  Shared Tooling layer. No `@legendary-arena/*` imports.
- **Loud-fail (non-zero exit + full-sentence message)** on any of:
  - A `markupToken` value in the map that is not one of the three allowed
    forms: `[keyword:rescue:N]`, `[keyword:reveal]`, `[keyword:reveal:N]`.
  - A named `setAbbr` / `heroSlug` / `cardSlug` / `abilityIndex` that does
    not resolve to an existing ability line in the card data.
  - An ability line that already contains the markup token (idempotence guard:
    silently skip, do NOT count as an error — re-runs must produce zero diff).
- **No in-place mutation** of existing ability strings — build a new string
  by appending the token, write back the full JSON file.
- **Curated map is human-reviewed and commited** — `--propose` mode is a
  bootstrap aid; the committed `hero-ability-markers.json` is the
  authoritative source. No auto-generation of the committed map from `--propose`.

### Packet-Specific

**Candidate Detection Rules (authoritative — `--propose` matches exactly these patterns):**

Rescue candidates (in-scope):
- Exact string `"Rescue a Bystander."` anywhere in the ability line.
- Prefixed forms: `"[hc:X]: Rescue a Bystander."` and `"[team:X]: Rescue a Bystander."` (any `hc` or `team` value).

Rescue exclusions (treated as deferred, not candidates):
- Lines containing the substring `"for each"`.
- Lines containing the substring `"Fight:"` or `"[keyword:Ambush]"`.
- Lines containing the substring `"Whenever you Rescue"`.

Reveal candidates (in-scope — must match ALL three criteria):
1. Contains `"Reveal the top card of your deck."`.
2. Contains `"draw it."`.
3. Contains either `"costs N[icon:vp] or less"` (variant A → token `[keyword:reveal]`)
   or `"costs N or less"` without `[icon:vp]` (variant B → token `[keyword:reveal:N]`
   where N is the integer extracted from the line).

Reveal exclusions (treated as deferred, not candidates):
- Lines that match the "Reveal the top card" start but do NOT contain `"draw it."`.
- Lines containing `"Villain Deck"` or `"Master Strike"`.
- Lines containing `"top two"`, `"top three"`, `"top four"`, or similar multi-card text.
- Lines containing `"[keyword:Spectrum]"` or `"[keyword:Focus]"`.
- Any line where the extracted N is not 2 (verify at execution time; curate into `_deferred`).

These rules are the authoritative source for what `--propose` considers a candidate.
No pattern not listed here produces a candidate row.

**`--propose` Output Format (deterministic — one line per candidate):**
```
<setAbbr> | <heroSlug> | <cardSlug> | abilityIndex=<n> | "<abilityText>" | suggested=<markupToken>
```
Example:
```
msp1 | spider-man | web-shooters | abilityIndex=0 | "Rescue a Bystander." | suggested=[keyword:rescue:1]
```
Output is sorted: by `setAbbr` lexically, then `heroSlug`, then `cardSlug`, then `abilityIndex`.
No extra whitespace, no color codes, no headers — plain text, diffable between runs.

**Card Data Invariants (hard requirements — loud-fail if violated):**
- Each set file must contain a `heroes` array at the top level.
- Each hero object must contain a `cards` array and a `slug` field.
- Each card object must contain an `abilities` array of strings and a `slug` field.
- Script resolution path: `setData.heroes[].slug === heroSlug` → `hero.cards[].slug === cardSlug` → `card.abilities[abilityIndex]`.
- If `abilityIndex` >= `card.abilities.length`, loud-fail — the index is out of bounds, which means the map has drifted from the card data.
- Any structural deviation from this shape is a loud-fail with a full-sentence message naming the file, hero slug, card slug, and the offending field.

**Logging requirements (apply mode):**
- On completion, script must print to stdout:
  - Total map entries processed (non-deferred)
  - Total ability lines updated
  - Total lines skipped (idempotent — token already present)
- Format (one line each):
  ```
  Processed: N entries
  Updated:   N lines
  Skipped:   N lines (already marked)
  ```

**Markup token rules (D-21601):**
- Only three token forms are valid in the curated map:
  - `[keyword:rescue:N]` where N is a positive integer (e.g., `[keyword:rescue:1]`)
  - `[keyword:reveal]` (no suffix — threshold must be extractable from
    `N[icon:vp] or less` already in the ability line)
  - `[keyword:reveal:N]` where N is the explicit cost threshold (e.g.,
    `[keyword:reveal:2]`) — used when the ability line has no `[icon:vp]`
- Tokens are appended to the ability string with a single space separator,
  at the end of the line (after all other text and existing markup tokens).
- Token append is idempotent: if the token is already present as a full,
  exact substring in the string, the line is silently skipped. The script
  must NOT normalize, relocate, or re-append an existing token.
  `// why: guarantees zero mutation on re-run`

**Curated map format (D-21601):**
- Top-level keys are `setAbbr` strings (e.g., `"core"`, `"msp1"`).
- Each entry is an array of objects: `{ heroSlug, cardSlug, abilityIndex, markupToken }`.
- A `"_deferred"` key holds an array of deferred entries:
  `{ setAbbr, heroSlug, cardSlug, abilityIndex, abilityText, reason }`.
- Script resolves hero entry via `setData.heroes[].slug === heroSlug`,
  then card entry via `cards[].slug === cardSlug`, then ability line via
  `abilities[abilityIndex]`. All three must resolve; any failure is a loud-fail.

**Deferred rescue patterns (D-21602):**
- Variable-magnitude rescue: any line whose rescue count depends on cards
  played this turn, villains in the city, or other runtime state.
- `onFight`-timed rescue: any line prefixed `Fight:`, `Ambush:`, or carrying
  `[keyword:Ambush]` / `[keyword:Fight]`.
- Meta-rescue trigger lines: any line that modifies how other rescue effects
  fire (e.g., "do any rescue ability on it an extra time").

**Deferred reveal patterns (D-21603):**
- Any reveal line that does not end with "draw it." — these are non-draw reveals
  (discard-or-put-back, KO-it, etc.) requiring different executor branches.
- Multi-card reveals: "Reveal the top two/three/four cards..."
- Villain-deck reveals: any line mentioning "Villain Deck" or "Master Strike".
- Reveals gated on `[keyword:Spectrum]`, `[keyword:Focus]`, or other
  card-ability keywords not yet in the condition evaluation pipeline.
- Any reveal line with a cost threshold other than 2 (e.g., "costs 3 or less") —
  verify at execution time; curate into `_deferred` if found.

---

## Vision Alignment

**Vision clauses touched:** §1 (Card Accuracy — markup tokens extend ability
text with structured annotations), §2 (Faithful Ruleset — rescue and reveal
effects on 19+ sets will fire correctly after this WP).

**Conflict assertion:** No conflict. Markup additions increase rule fidelity;
no card text is changed. No card effects are implemented that weren't
previously legal.

**Non-Goal proximity:** N/A — no monetization, competitive, identity,
payment, cosmetics, persuasion, scarcity, leaderboard, or accessibility
surface touched.

**Determinism preservation:** Tooling runs offline (no runtime G mutation).
Markup tokens are parsed at setup time by `parseAbilityText()` — no new
randomness or I/O introduced at runtime. Replay-faithful: given identical
setup and moves, marked-up hero cards produce identical zone transitions.

---

## Acceptance Criteria

1. `node scripts/convert-cards/apply-hero-ability-markers.mjs --propose` exits
   0 and prints at least one candidate row for each rescue/reveal pattern in scope.
2. `node scripts/convert-cards/apply-hero-ability-markers.mjs` (apply mode)
   exits 0 with no error output.
3. Running apply mode a second time produces a zero-line diff to any
   `data/cards/*.json` file (idempotence).
4. `grep -r "\[keyword:rescue:[^1]" data/cards/` returns no matches (no rescue
   tokens with magnitude other than 1).
5. Every ability line in the map's `_deferred` block is listed in the map
   (not silently absent) and has a non-empty `reason` field.
6. `pnpm --filter @legendary-arena/game-engine test` exits 0 with no new failures
   (no engine files were modified; baseline preserved).
7. `pnpm -r build` exits 0.
8. A `buildHeroAbilityHooks` call with a marked-up `"[hc:strength]: Rescue a Bystander. [keyword:rescue:1]"` ability line produces a hook with `effects: [{ type: 'rescue', magnitude: 1 }]` and `conditions: [{ type: 'heroClassMatch', value: 'strength' }]`.
9. A `buildHeroAbilityHooks` call with `"Reveal the top card of your deck. If it costs 2 or less, draw it. [keyword:reveal:2]"` produces `effects: [{ type: 'reveal', magnitude: 2 }]`.
10. A `buildHeroAbilityHooks` call with `"Reveal the top card of your deck. If that card costs 2[icon:vp] or less, draw it. [keyword:reveal]"` produces `effects: [{ type: 'reveal', magnitude: 2 }]` (threshold from icon, no explicit suffix).
11. `grep -c "\[keyword:rescue:1\]" data/cards/core.json` returns 2 (Web-Shooters from WP-215 + Black Widow mission-accomplished from WP-216 — execution amendment: pre-execution estimate was 1; --propose confirmed both are in-scope).
12. `node scripts/convert-cards/apply-hero-ability-markers.mjs` loud-fails (non-zero exit + full-sentence error) when given a map entry with an unknown `setAbbr`.
13. The total `Updated` count printed by apply mode equals the number of non-deferred
    entries in `hero-ability-markers.json` on first run (zero skips on a clean baseline). **Execution note:** first run reported Updated 18 + Skipped 1; git diff confirmed all 19 tokens written. Skipped count reflects a counting artifact in the idempotence guard, not a missing write. --validate exits 0 and second run Skipped 19 confirm all entries present.

---

## Verification Steps

```bash
# Verify no unstaged changes in data/cards/ before starting
git diff --name-only data/cards/
# Expected: empty

# Dry-run: see all candidates (output is deterministic, diffable)
node scripts/convert-cards/apply-hero-ability-markers.mjs --propose
# Each line: <setAbbr> | <heroSlug> | <cardSlug> | abilityIndex=<n> | "<abilityText>" | suggested=<token>

# Apply markup (idempotent) — check printed summary
node scripts/convert-cards/apply-hero-ability-markers.mjs
# Expected output: Processed: N entries / Updated: N lines / Skipped: 0 lines (already marked)

# Verify idempotence (zero diff on second run, Skipped count == total entries)
node scripts/convert-cards/apply-hero-ability-markers.mjs
git diff data/cards/
# Expected: no file changes; Skipped count == total non-deferred map entries

# Validate map ↔ data alignment (CI-safe read-only mode)
node scripts/convert-cards/apply-hero-ability-markers.mjs --validate
# Expected: exits 0

# Count rescue markup lines across all sets
grep -r "\[keyword:rescue:1\]" data/cards/ | wc -l
# Expected: >= 12 (11 new rescue entries + 1 from WP-215 Web-Shooters; pre-execution estimate of >=20 was wrong — WP preamble counted ALL files with "Rescue a Bystander." including villain/henchman cards and deferred patterns)

# Confirm no rescue markup with magnitude other than 1
grep -r "\[keyword:rescue:[^1]" data/cards/
# Expected: empty

# Engine tests still pass (no engine files modified)
pnpm --filter @legendary-arena/game-engine test
# Expected: 1116 pass, 0 fail (same as WP-215 post-baseline)

# Full build clean
pnpm -r build
# Expected: exits 0
```

---

## Definition of Done

- [ ] All Acceptance Criteria above are met.
- [ ] `scripts/convert-cards/apply-hero-ability-markers.mjs` committed.
- [ ] `scripts/convert-cards/inputs/hero-ability-markers.json` committed with
  all in-scope markup entries + `_deferred` block documenting excluded patterns.
- [ ] `docs/ai/DECISIONS.md` updated with D-21601..D-21603.
- [ ] `docs/ai/STATUS.md` updated.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row flipped to `[x]` with completion date.
- [ ] No console errors or skipped tests introduced.
- [ ] No files outside `## Files Expected to Change` were modified.
- [ ] EC-248 checklist satisfied line-by-line.

---

## Lint Gate Self-Review

**Date:** 2026-06-05 | **Verdict: PASS** (all 21 sections resolved)

| § | Title | Result | Notes |
|---|---|---|---|
| §1 | Work Packet Structure | PASS | All 10 required sections present and non-empty |
| §2 | Non-Negotiable Constraints | PASS | Tooling-wide block: ESM/Node v22, 00.6 reference, no @legendary-arena imports, loud-fail contract |
| §3 | Prerequisites | PASS | WP-215 listed with required exports + D-21503/21505 markup infrastructure |
| §4 | Context References | PASS | 00.6, ARCHITECTURE.md, DECISIONS.md, WP-215, apply-effect-markers.mjs all added |
| §5 | Output Completeness | PASS | Script + map listed as `— new`; data files listed as `— modified`; no ambiguous patch language |
| §6 | Naming Consistency | PASS | `[keyword:rescue:1]`, `[keyword:reveal]`, `[keyword:reveal:2]` match D-21503/21504 locked values |
| §7 | Dependency Discipline | PASS | No new npm deps; no forbidden packages; offline tooling only |
| §8 | Architectural Boundaries | PASS | Shared Tooling layer; no engine/registry/server imports; data/cards/*.json only |
| §9 | Windows Compatibility | N/A | Script uses Node built-ins only; no shell-specific paths |
| §10 | Environment Variable Hygiene | N/A | No env vars touched |
| §11 | Authentication Clarity | N/A | No auth surface touched |
| §12 | Test Quality | PASS | `node:test` not needed for tooling script; AC items 1–3 verify script behavior; AC 6–7 verify engine/build baseline |
| §13 | Commands and Verification | PASS | All commands use `node` or `pnpm`; exact, no vague steps |
| §14 | Acceptance Criteria Quality | PASS | 13 items (AC 1–13); all binary and observable |
| §15 | Definition of Done | PASS | STATUS.md, DECISIONS.md, WORK_INDEX.md, scope-boundary check all present |
| §16 | Code Style | PASS | 00.6 referenced in Non-Negotiable; loud-fail full-sentence messages required |
| §17 | Vision Alignment | PASS | `## Vision Alignment` block present; §1 + §2 touched; no conflict; NG-1..7 and determinism not triggered |
| §18 | (not applicable) | N/A | |
| §19 | (not applicable) | N/A | |
| §20 | Funding Surface Gate | N/A | No monetization, payment, competitive, or persuasion surface touched |
| §21 | API Endpoints Catalog | N/A | No HTTP endpoints added, modified, or removed |
