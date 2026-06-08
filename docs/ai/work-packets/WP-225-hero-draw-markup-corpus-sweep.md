# WP-225 — Hero Draw Markup Corpus Sweep (Card Data + Tooling)

**Status:** Draft (2026-06-08)
**Primary Layer:** Card Data + Offline Tooling (no engine changes)
**Dependencies:** WP-216 (`apply-hero-ability-markers.mjs` + `hero-ability-markers.json` baseline). No hard engine dependency — the `draw` executor already ships (WP-021/WP-215). May execute in parallel with any other hero-ability WP.

---

## Session Context

WP-215 wired the hero-effects executor; WP-216 built the curated markup
pipeline (`apply-hero-ability-markers.mjs` + `hero-ability-markers.json`) and
WP-217 through WP-224 extended it across the rescue and reveal-* keyword
families. The pipeline was deliberately scoped to **rescue and reveal only**
(D-21601 locks the valid token set to `[keyword:rescue:N]` /
`[keyword:reveal]` / `[keyword:reveal:N]` and the reveal-* extensions).

The most basic hero effect — **"Draw a card."** — was never brought into the
pipeline. The engine has always supported it: `'draw'` is in the
`HeroKeyword` union and `HERO_KEYWORDS` array (`heroKeywords.ts`), the parser
captures a `[keyword:draw:N]` magnitude (`heroAbility.setup.ts`
`KEYWORD_PATTERN`), and `executeHeroEffects` has a `case 'draw'` that calls
`drawFromPlayerDeck` (`heroEffects.execute.ts:222`). But **no `[keyword:draw]`
token exists in any of the 40 card sets**, and `parseAbilityText()` performs
no natural-language inference. A bare `"Draw a card."` ability line therefore
parses to `effects: []` and draws nothing when the card is played.

This was surfaced on play.legendary-arena.com: Black Widow's **Mission
Accomplished** (`core` / `3dtc` / `msp1`) reads `["Draw a Card.", "[hc:tech]:
Rescue a Bystander. [keyword:rescue:1]"]`. The rescue half fires (it carries a
marker from WP-216); the draw half is a silent no-op. The same gap affects
**98 hero ability lines across 30 sets** (see §Scope).

The fix mirrors WP-216 exactly, one keyword over: extend the offline markup
pipeline to recognize a `[keyword:draw:N]` token, curate the unambiguous draw
lines into `hero-ability-markers.json`, and apply the tokens to
`data/cards/*.json`. No engine changes — the executor is already correct.

---

## Goal

After this packet, every unambiguous hero `onPlay` fixed-count draw ability
line in the 40-set corpus carries a `[keyword:draw:N]` markup token, and
playing those hero cards draws the correct number of cards. The pipeline's
valid token set is extended (D-22501) to include `[keyword:draw:N]` (N ≥ 1).
The `apply-hero-ability-markers.mjs` `--propose` mode gains an `isDrawCandidate`
/ `suggestDrawToken` detector so the sweep is reproducible. Patterns that are
not a fixed-count top-of-deck draw (cumulative "another/more", bottom-of-deck,
reveal-then-draw, game-state-conditional, replacement-draw triggers,
timing-gated, and compound multi-effect lines) are explicitly deferred and
documented in the map's `_deferred` block.

---

## Assumes

- WP-216 shipped and is unchanged: `scripts/convert-cards/apply-hero-ability-markers.mjs`
  exists with `apply` (default), `--propose`, and `--validate` modes; and
  `scripts/convert-cards/inputs/hero-ability-markers.json` exists as the curated
  map (keyed by `setAbbr`, with a `_deferred` block, 34 entries as of WP-224).
- The engine's draw path already works end-to-end and needs **no changes**:
  - `packages/game-engine/src/rules/heroKeywords.ts` exports `HeroKeyword`
    union and `HERO_KEYWORDS` array, both already containing `'draw'`.
  - `packages/game-engine/src/setup/heroAbility.setup.ts` `parseAbilityText()`
    extracts `[keyword:draw:N]` via `KEYWORD_PATTERN` (keyword + optional `:N`
    magnitude) and attaches any leading `[hc:X]:` / `[team:X]:` as conditions.
  - `packages/game-engine/src/hero/heroEffects.execute.ts` has `case 'draw'`
    (line ~222) calling `drawFromPlayerDeck(G, playerID, magnitude, ctx)`, which
    draws from the top of the player's deck with discard-reshuffle on exhaustion.
  - `packages/game-engine/src/moves/coreMoves.impl.ts` `playCard` calls
    `executeHeroEffects(...)` (line ~122).
- All 40 card sets are present under `data/cards/` (`ls data/cards/*.json | wc -l` = 40).
- Card data is authoritative and structurally uniform: each set file has a
  top-level `heroes[]`, each hero a `slug` and `cards[]`, each card a `slug`
  and `abilities[]` array of strings (the resolution path
  `apply-hero-ability-markers.mjs` already relies on).
- Baseline: `origin/main` at `a1cbe23` (`git rev-parse origin/main`,
  2026-06-08). The only commit since `c8214c5` (WP-224 / EC-256) is `a1cbe23`
  (#240, dashboard CI gates) — `git diff c8214c5 origin/main` touches no
  `data/cards/`, hero-ability, or engine files, so the 98-line candidate count
  below is current. WP-224 added only `_deferred` entries and touched no
  `data/cards/*.json`.

---

## Context (Read First)

1. `docs/ai/work-packets/WP-216-hero-ability-markup-corpus-sweep.md` — the
   direct precedent. This WP follows its structure, contracts, and curation
   discipline; the only difference is the keyword (`draw` instead of
   `rescue`/`reveal`).
2. `scripts/convert-cards/apply-hero-ability-markers.mjs` — the script being
   modified. Read `VALID_TOKEN_PATTERN` (line ~51), `assertValidToken`
   (line ~193), and the `--propose` detector family + `collectProposeRowsForSet`
   (lines ~454–704).
3. `scripts/convert-cards/inputs/hero-ability-markers.json` — the curated map
   being extended. Inspect an existing active set entry (e.g. `core`) and the
   `_notes` block for the curation discipline.
4. `packages/game-engine/src/setup/heroAbility.setup.ts` — `parseAbilityText()`,
   `KEYWORD_PATTERN`. Confirms `[keyword:draw:N]` and leading `[hc:X]:` /
   `[team:X]:` conditions parse without engine changes.
5. `packages/game-engine/src/hero/heroEffects.execute.ts` — `case 'draw'` and
   `drawFromPlayerDeck`. Confirms the executor already draws `magnitude` cards.
6. `docs/ai/DECISIONS.md` — D-21601 (token-form / map-format / idempotence lock
   this WP extends), D-21602 / D-21603 (deferred-pattern precedent), D-21701
   (the canonical "add a new HeroKeyword token form" decision shape). Scan for
   related entries before drafting D-22501.
7. `docs/ai/REFERENCE/00.6-code-style.md` — human-style code rules for the
   `.mjs` script changes (JSDoc on new functions, `// why:` comments,
   full-sentence error messages, no abbreviations).
8. `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirms the
   markup script is Shared Tooling (offline, no `@legendary-arena/*` imports,
   upstream of Registry).

---

## Scope (In)

**Tooling (`apply-hero-ability-markers.mjs`):**
- Extend `VALID_TOKEN_PATTERN` to accept `[keyword:draw:N]` where N ≥ 1
  (form `^\[keyword:draw:[1-9]\d*\]$` — reject the zero-magnitude form, same
  discipline as `reveal-attack-choose` / `reveal-ko-attack`). The extension is
  **additive only**: the existing pattern string is kept byte-for-byte intact
  and the draw form is added as a new `|`-alternation (OR branch) at the end.
  No existing rescue/reveal branch may be edited, reordered, or reflowed
  (D-21601 lock).
- Extend the `assertValidToken` error message to list `[keyword:draw:N]` among
  the locked token forms (see §Non-Negotiable Constraints → Error Message Lock
  for the canonical form).
- Add `isDrawCandidate(line)` and `suggestDrawToken(line)` helpers and a new
  branch in `collectProposeRowsForSet` so `--propose` surfaces draw candidates.
  Detection rules are locked below (§Non-Negotiable Constraints → Candidate
  Detection Rules). `suggestDrawToken` emits **only** `[keyword:draw:1]`,
  `[keyword:draw:2]`, or `[keyword:draw:3]` — the magnitudes present in the
  corpus. `four` / `five` and higher are **intentionally not emitted** by this
  WP (see §Out of Scope → magnitudes ≥ 4).

**Curated map (`hero-ability-markers.json`):**
- Add exactly **98** active draw entries
  (`{ heroSlug, cardSlug, abilityIndex, markupToken }`, `markupToken` one of
  `[keyword:draw:1]` / `[keyword:draw:2]` / `[keyword:draw:3]`) across **30**
  set keys, curated from `--propose` output. Distribution: **83** `draw:1`,
  **13** `draw:2`, **2** `draw:3`.
- Add `_deferred` entries documenting the draw patterns that are **not**
  fixed-count top-of-deck draws (see §Out of Scope for the pattern catalogue).
  Deferred draw lines are catalogued by **pattern**, not exhaustively
  enumerated per line, consistent with WP-216's `_deferred` discipline.

**Card data (applied by the script, never hand-edited):**
- `"Draw a card."` / `"Draw a Card."` → append `[keyword:draw:1]`.
- `"Draw two cards."` → append `[keyword:draw:2]`; `"Draw three cards."` →
  `[keyword:draw:3]`.
- `"[hc:X]: Draw a card."` and `"[team:X]: Draw a card."` (single leading
  condition) → append `[keyword:draw:1]` (the condition is already parsed by
  `parseAbilityText()`; the executor evaluates it).
- Surgical line-level appends only, applied by `apply-hero-ability-markers.mjs`
  in apply mode. Exactly **30** `data/cards/*.json` files receive edits
  (per-set counts in §Verification Steps).

**Governance:**
- `docs/ai/DECISIONS.md` — add D-22501 (Active, with Landed date) at execution.
- `docs/ai/STATUS.md` — record WP-225 execution.
- `docs/ai/work-packets/WORK_INDEX.md` — flip WP-225 `[ ]` → `[x]` Done.
- `docs/ai/execution-checklists/EC_INDEX.md` — flip EC-257 Draft → Done.

---

## Out of Scope

These draw-related patterns are **deferred** (documented in `_deferred` as
patterns; **not** marked with `[keyword:draw:N]` in this WP). Each is a
candidate for a future executor or pipeline WP.

- **Cumulative "another / more" conditional draws** — `"[hc:tech]: Draw another
  card."`, `"[hc:tech]: Draw two more cards."`. The literal count is
  unambiguous, but "another/more" reads as an additive top-up on a sibling
  ability line; marking it correctly requires confirming each card's
  intended total. Deferred for a focused follow-up. (e.g.
  `core/iron-man/endless-invention[1]`, `core/iron-man/quantum-breakthrough[1]`.)
- **Bottom-of-deck draws** — `"[hc:instinct]: Draw a card from the bottom of
  your deck."` (`2099/ravage-2099/down-in-the-dregs`). `drawFromPlayerDeck`
  draws from the **top** (`deck[0]`); bottom-draw is a different mechanic.
- **Reveal-then-draw** — `"Reveal the top card of your deck. … draw it."` These
  belong to the `reveal` / `reveal:N` / `reveal-min` / `reveal-odd-draw` /
  `reveal-ko-or-draw` families and are handled (or deferred) by the reveal
  pipeline, not the draw pipeline. The draw detector excludes any line
  containing "Reveal".
- **Game-state-conditional draws** — `"If there are no Villains on the
  Rooftops, draw a card."`, `"… if you have a Villain in your Victory Pile
  worth 2[icon:piercing] or less, draw a card."`. The condition is not a
  `[hc:X]:` / `[team:X]:` prefix the parser evaluates.
- **Replacement-draw triggers** — `"When you draw a new hand this turn, draw an
  extra card."`. A draw-hand-replacement trigger, not an `onPlay` draw; no
  timing dispatch exists.
- **Timing-/keyword-gated draws** — lines prefixed or gated by
  `[keyword:Heist]`, `[keyword:Cyber-Mod]`, `Fight:`, `[keyword:Ambush]`, or
  similar (`amwp/ant-man/tiny-little-risk[1]`,
  `2099/spider-man-2099/*`). Deferred on the same `onFight`/timing grounds as
  D-21602.
- **Compound multi-effect lines** — any line that draws **and** does something
  else in the same sentence/line (`"Draw a card. KO a card from your hand or
  discard pile."`, draw-plus-discard, draw-plus-attack). Compound executor
  territory.
- **Multi-condition cost prefixes** — `"[hc:covert][hc:covert]: Draw a card."`
  The doubled `[hc:covert]` encodes a "pay 2 covert" cost the condition
  evaluator does not model; deferred.
- **Magnitudes ≥ 4** — the current corpus contains only `Draw a/one/two/three
  card(s).` (max draw:3). `suggestDrawToken` and the candidate regex stop at
  `three`, so a hypothetical `"Draw four cards."` is **not** auto-marked. If a
  future corpus introduces one, it is out of scope for this WP and the curator
  must add it to `_deferred` (the `[keyword:draw:N]` grammar already permits
  N ≥ 4 per D-22501, but emitting it is a separate WP).

Also out of scope (unchanged from the pipeline's standing boundaries):
- **No engine changes.** `heroKeywords.ts`, `heroAbility.setup.ts`,
  `heroEffects.execute.ts`, and all engine tests are untouched.
- **No registry, server, or client changes.**
- **No schema changes** to card data — only surgical token appends to existing
  `abilities[]` strings.

---

## Files Expected to Change

**Tooling:**
1. `scripts/convert-cards/apply-hero-ability-markers.mjs` — **modified** —
   extend `VALID_TOKEN_PATTERN` + `assertValidToken` message; add
   `isDrawCandidate` + `suggestDrawToken` + a `--propose` branch.
2. `scripts/convert-cards/inputs/hero-ability-markers.json` — **modified** —
   +98 active draw entries across 30 set keys; `_deferred` block extended with
   the deferred draw-pattern catalogue.

**Card data (applied by the script):**
3. `data/cards/*.json` — **modified** — surgical `[keyword:draw:N]` appends
   across exactly **30** set files (`3dtc`, `amwp`, `anni`, `antm`, `asrd`,
   `bkpt`, `bkwd`, `ca75`, `chmp`, `core`, `cosm`, `cvwr`, `dead`, `dkcy`,
   `dstr`, `ff04`, `mgtg`, `msis`, `msmc`, `msp1`, `pttr`, `rlmk`, `rvlt`,
   `shld`, `smhc`, `ssw1`, `vill`, `wtif`, `wwhk`, `xmen`). Exact per-set
   counts in §Verification Steps; the authoritative list is the `--propose`
   output at execution time.

**Governance:**
4. `docs/ai/DECISIONS.md` — **modified** — D-22501 Active with Landed date.
5. `docs/ai/STATUS.md` — **modified** — WP-225 execution entry.
6. `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-225 `[ ]` → `[x]`.
7. `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-257 → Done.

No files are created. No files outside this list may be modified. The
`data/cards/*.json` group is a single logical deliverable (one apply run), not
30 independent edits.

---

## Contract

This WP extends the surfaces locked by WP-216 (D-21601). The additions:

### Token form (extends D-21601)

| Token | Meaning | Magnitude rule |
|---|---|---|
| `[keyword:draw:N]` | Draw N cards from the top of the player's deck on play | Grammar: N ≥ 1 (integer); zero-magnitude form rejected. **This WP emits only N ∈ {1, 2, 3}** (the corpus maximum); N ≥ 4 is reserved for a future WP. |

Appended at the end of the ability string with a single space separator;
idempotent (silently skipped if already present) — identical to all existing
token forms.

### `--propose` detector (extends the WP-216 detector family)

- `isDrawCandidate(line)` returns true iff, operating on `line.trim()` and after
  stripping at most one leading `[hc:X]:` / `[team:X]:` condition prefix, the
  **entire** line equals `Draw <count> card(s).` where `<count>` ∈ {`a`, `one`,
  `two`, `three`} — and the line contains neither `Reveal` nor an existing
  `[keyword:` token. (Locked regex in §Non-Negotiable Constraints.)
- `suggestDrawToken(line)` maps `a`/`one`→`[keyword:draw:1]`, `two`→`:2`,
  `three`→`:3`. No other mappings — `four`/`five` are not matched (see §Out of
  Scope → magnitudes ≥ 4).
- `--propose` output format is unchanged (the locked D-21601 row format).

### Curated map (unchanged schema)

Active entries keep the locked `{ heroSlug, cardSlug, abilityIndex, markupToken }`
shape. `_deferred` entries keep the locked `{ setAbbr, heroSlug, cardSlug,
abilityIndex, abilityText, reason }` shape. No new fields.

---

## Non-Negotiable Constraints

### Engine-wide (always apply)
- **Full file contents** for every new or modified file — no diffs, no
  snippets, no "show only the changed section".
- **ESM only, Node v22+** — no CommonJS, no `require()`, no `node-fetch`.
- **Human-style code** per `docs/ai/REFERENCE/00.6-code-style.md` — explicit,
  junior-maintainable. Full JSDoc on `isDrawCandidate` and `suggestDrawToken`;
  `// why:` comments on the `VALID_TOKEN_PATTERN` addition (cite D-22501);
  full-sentence error messages.
- **No `@legendary-arena/*` imports** in the script — Shared Tooling layer,
  offline only.

### Packet-specific
- **No engine code changes.** `packages/game-engine/src/**` must show a zero
  diff. The draw executor already exists; this WP adds data + tooling only.
- **`VALID_TOKEN_PATTERN` is extended additively.** The existing pattern string
  is kept **byte-for-byte intact**; `[keyword:draw:N]` is added as one new
  `|`-alternation branch only. Editing, reordering, or reflowing any existing
  rescue/reveal branch is prohibited (D-21601 lock). The same applies to the
  `assertValidToken` allowed-token list — append, do not rewrite.
- **Curated map is human-reviewed.** `--propose` is a bootstrap aid; the
  committed `hero-ability-markers.json` is authoritative. Do not auto-dump
  `--propose` output into the map without per-row review against the detection
  rules below.
- **Apply mode writes card data; never hand-edit `data/cards/*.json`.** All 98
  tokens are written by `node apply-hero-ability-markers.mjs` (apply mode).
- **Loud-fail (non-zero exit + full-sentence message)** on: a `markupToken`
  not in the now-extended locked set; an unknown `setAbbr` / `heroSlug` /
  `cardSlug` / `abilityIndex`; a structural violation of the `heroes[] → slug →
  cards[] → abilities[]` shape.

**Apply-Mode Behavior Contract (clarifies the existing WP-216 script semantics — no behavior change):**
- **"Skipped" means exactly one thing:** the entry's `markupToken` is already
  present (exact substring) in the resolved ability line — i.e. an entry already
  satisfied by a prior WP (the 30 existing rescue/reveal entries) or a re-run.
  The printed `Skipped` count MUST NOT include lookup failures, structural
  mismatches, or regex misses. **Every such failure mode hard-exits non-zero**
  (per the loud-fail rule above) — it is never silently counted as a skip.
- **Idempotence mechanism (exact):** for each target ability line, if the exact
  `markupToken` substring is already present, no mutation occurs; otherwise the
  token is appended once with a single leading space. No duplicate token is ever
  appended, string comparison is exact (no whitespace normalization of the card
  line), and a violation produces zero modifications — never a partial write. A
  second apply run therefore yields a zero-line `git diff data/cards/`.

**Candidate Detection Rules (authoritative — `isDrawCandidate` matches exactly these):**

Detection operates on `normalizedLine = line.trim()` (strip leading/trailing
whitespace only — the `/i` flag handles case; **no** internal-whitespace
collapse and **no** rewrite of the line; the token is later appended to the
verbatim original string).

A line is an in-scope draw candidate **iff all** of:
1. `normalizedLine` matches `/^(?:\[(?:hc|team):[^\]]+\]:\s*)?Draw (a|one|two|three) cards?\.$/i`
   (the whole line is a single fixed-count draw of 1–3 cards, optionally
   prefixed by exactly one `[hc:X]:` or `[team:X]:` condition).
2. It does **not** contain the substring `Reveal` (reveal-then-draw is the
   reveal family's domain).
3. It does **not** already contain a `[keyword:` token (excludes
   already-marked lines and timing-keyword-gated lines like `[keyword:Heist]:`).

Magnitude: `a`/`one`→1, `two`→2, `three`→3. The regex stops at `three`; `four`
/ `five` are not matched (see §Out of Scope → magnitudes ≥ 4).

Everything else that mentions drawing is **deferred** (see §Out of Scope):
"another"/"more"/"extra", bottom-of-deck, reveal-then-draw, game-state
conditionals, replacement-draw triggers, timing-gated, compound multi-effect,
multi-condition cost prefixes, and draw counts ≥ 4. The `^…$` anchor in rule 1
excludes all of these by construction; rules 2–3 are defense-in-depth.

**Branch placement (locked):** `isDrawCandidate` shares no anchor text with any
existing rescue/reveal detector (draw lines contain neither `"Rescue a
Bystander."` nor `"Reveal the top card of your deck."`), so it is mutually
exclusive with every existing `--propose` branch. It MUST nonetheless be placed
**after all reveal-family detector branches** in the `collectProposeRowsForSet`
if/else chain (and before any future fallback / "unknown" branch) — reveal
detectors retain first-match priority, so a reveal line can never be
misclassified as a draw even if a future change loosens a reveal pattern.

**Error Message Lock (`assertValidToken`):** the message must list the full set
of allowed token forms — including the appended `[keyword:draw:N]` — in a single
canonical sentence, with content invariant across runs (no interpolated counts,
timestamps, or per-call variation). The draw form is appended to the existing
enumeration; the existing wording is not otherwise rewritten.

**Deferred Catalogue Discipline (`_deferred`):** the **draw additions** to the
`_deferred` block are **pattern-based, deduplicated** (the 34 existing
rescue/reveal entries are untouched). Each deferred draw pattern class (the
bullets in §Out of Scope: "another/more/extra", bottom-of-deck, reveal-then-draw,
game-state-conditional, draw-new-hand trigger, timing/keyword-gated, compound
multi-effect, multi-condition cost prefix, magnitudes ≥ 4) appears **exactly
once**. Because the locked `_deferred` schema is per-instance
(`{ setAbbr, heroSlug, cardSlug, abilityIndex, abilityText, reason }`), each
pattern is represented by **one real exemplar line** whose `reason` names the
**class of behavior** (not the single card) and points the future executor at
the pattern. Duplicate pattern classes — or per-instance enumeration of every
matching line — are prohibited (WP-216 precedent; prevents map bloat).

### Session protocol
- If `--propose` surfaces a candidate count **other than 98**, or a per-set
  count that disagrees with §Verification Steps, **STOP** and reconcile against
  the card data before curating — the corpus may have drifted since drafting.
- If a draw line resists clean classification (ambiguous magnitude, hidden
  compound), **defer it** with a `_deferred` entry and a `reason` — do not
  guess a token.

### Locked contract values
- Active draw entries added: **98**, distribution **exactly** 83 `draw:1` +
  13 `draw:2` + 2 `draw:3` (the pre-apply gate in §Verification Steps asserts
  this distribution before any card data is written).
- Set files modified: **exactly 30** (the post-apply gate asserts the count of
  set files that gained a draw token equals 30).
- Token forms emitted by this WP: `[keyword:draw:1]`, `[keyword:draw:2]`,
  `[keyword:draw:3]` only. The `[keyword:draw:N]` grammar permits N ≥ 1, but no
  token with N ≥ 4 (or N = 0) is produced.
- Engine files modified: **0**.

---

## Vision Alignment

**Vision clauses touched:** §1 (Card Accuracy — markup tokens annotate existing
ability text), §2 (Faithful Ruleset — 98 hero draw lines across 30 sets will
fire correctly after this WP).

**Conflict assertion:** No conflict: this WP preserves all touched clauses.
Markup additions increase rule fidelity; no card text is rewritten and no new
mechanic is invented (the `draw` executor predates this WP).

**Non-Goal proximity check:** N/A — no monetization, competitive, identity,
payment, cosmetics, persuasion, scarcity, leaderboard, or accessibility
surface is touched. NG-1..7 are not crossed.

**Determinism preservation:** Tooling runs offline (no runtime `G` mutation).
`[keyword:draw:N]` is parsed at setup time by `parseAbilityText()`; the
runtime draw uses `drawFromPlayerDeck`, which draws from `deck[0]` and reshuffles
the discard via the existing `ShuffleProvider` — no new randomness or I/O.
Replay-faithful: given identical setup and moves, a marked-up draw line
produces identical zone transitions.

## Funding Surface Gate

**N/A** — this WP touches card data and offline tooling only; it implements no
navigation, profile, registry-viewer, or tournament funding affordance and
introduces no user-visible funding copy (none of WP-097 §A/§B/§C surfaces).

---

## Acceptance Criteria

1. `node scripts/convert-cards/apply-hero-ability-markers.mjs --propose` exits 0
   and prints exactly **98** draw candidate rows (suggested
   `[keyword:draw:1|2|3]`), across the 30 sets listed in §Files Expected to Change.
2. `node scripts/convert-cards/apply-hero-ability-markers.mjs` (apply mode)
   exits 0 with no error output; the printed `Updated` count equals the number
   of new active draw entries on a clean baseline (98).
3. A second apply run produces a zero-line `git diff data/cards/` (idempotence).
4. `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0.
5. `grep -rho "\[keyword:draw:[0-9]*\]" data/cards/ | sort | uniq -c` reports
   exactly 83 × `[keyword:draw:1]`, 13 × `[keyword:draw:2]`, 2 × `[keyword:draw:3]`
   (total 98).
6. `grep -rho "\[keyword:draw:[0-9]*\]" data/cards/ | grep -Ev "\[keyword:draw:[123]\]"`
   returns no matches — only magnitudes 1–3 are emitted (no `draw:0`, no `draw:4`+).
7. `git diff --name-only packages/game-engine/` is empty — no engine files modified.
8. `buildHeroAbilityHooks` over a card whose ability line is
   `"Draw a Card. [keyword:draw:1]"` produces a hook with
   `effects: [{ type: 'draw', magnitude: 1 }]` and no conditions.
9. `buildHeroAbilityHooks` over `"[hc:tech]: Draw a card. [keyword:draw:1]"`
   produces `effects: [{ type: 'draw', magnitude: 1 }]` **and**
   `conditions: [{ type: 'heroClassMatch', value: 'tech' }]`.
10. `core/black-widow/mission-accomplished` ability index 0 contains
    `[keyword:draw:1]` after apply (`grep -A1 '"Draw a Card.' data/cards/core.json`
    shows the appended token).
11. `pnpm --filter @legendary-arena/game-engine test` exits 0 with no new
    failures (engine baseline preserved — zero engine files changed).
12. `pnpm -r build` exits 0.

---

## Verification Steps

```bash
# Clean baseline
git diff --name-only data/cards/ scripts/convert-cards/
# Expected: empty

# Dry-run: 98 draw candidates across 30 sets (deterministic, diffable)
node scripts/convert-cards/apply-hero-ability-markers.mjs --propose | grep "suggested=\[keyword:draw" | wc -l
# Expected: 98

# Per-set candidate counts (sanity table — must match exactly):
#   3dtc=1 amwp=2 anni=1 antm=3 asrd=1 bkpt=1 bkwd=3 ca75=2 chmp=3 core=9
#   cosm=2 cvwr=10 dead=2 dkcy=9 dstr=1 ff04=1 mgtg=4 msis=3 msmc=2 msp1=4
#   pttr=2 rlmk=1 rvlt=2 shld=2 smhc=1 ssw1=3 vill=3 wtif=4 wwhk=9 xmen=7

# PRE-APPLY GATE (must pass before apply) — map holds exactly 98 draw entries,
# distribution 83/13/2. Aborts the run if curation is partial or over-marked.
node -e "const j=JSON.parse(require('fs').readFileSync('scripts/convert-cards/inputs/hero-ability-markers.json','utf8')); let d={}; for(const k of Object.keys(j)){if(k.startsWith('_'))continue; for(const e of j[k]){const m=/^\[keyword:draw:(\d+)\]$/.exec(e.markupToken); if(m)d[m[1]]=(d[m[1]]||0)+1;}} const ok=d['1']===83&&d['2']===13&&d['3']===2&&!d['0']&&!d['4']; console.log('draw distribution',JSON.stringify(d)); if(!ok){console.error('PRE-APPLY GATE FAIL: expected {1:83,2:13,3:2}'); process.exit(1);} console.log('PRE-APPLY GATE PASS (98 draw entries)');"
# Expected: PRE-APPLY GATE PASS (98 draw entries)

# Apply markup (idempotent) — check printed summary
node scripts/convert-cards/apply-hero-ability-markers.mjs
# Expected: Processed: 128 entries (30 existing rescue/reveal + 98 new draw) /
#           Updated: 98 lines / Skipped: 30 lines (existing rescue/reveal already marked)

# Idempotence: second run is a zero-line diff
node scripts/convert-cards/apply-hero-ability-markers.mjs
git diff data/cards/
# Expected: no file changes

# Validate map <-> data alignment (read-only)
node scripts/convert-cards/apply-hero-ability-markers.mjs --validate
# Expected: exits 0

# Token magnitude census
grep -rho "\[keyword:draw:[0-9]*\]" data/cards/ | sort | uniq -c
# Expected: 83 [keyword:draw:1] / 13 [keyword:draw:2] / 2 [keyword:draw:3]

# Only magnitudes 1–3 emitted (no draw:0, no draw:4+)
grep -rho "\[keyword:draw:[0-9]*\]" data/cards/ | grep -Ev "\[keyword:draw:[123]\]"
# Expected: empty

# POST-APPLY GATE — exactly 30 set files gained a draw token (corpus-drift guard)
grep -rl "\[keyword:draw:" data/cards/ | wc -l
# Expected: 30

# Engine untouched
git diff --name-only packages/game-engine/
# Expected: empty

# Engine tests + full build
pnpm --filter @legendary-arena/game-engine test
# Expected: 0 fail (same baseline as WP-224 close)
pnpm -r build
# Expected: exits 0
```

---

## Definition of Done

- [ ] All Acceptance Criteria above are met.
- [ ] `scripts/convert-cards/apply-hero-ability-markers.mjs` updated
  (`VALID_TOKEN_PATTERN` + `assertValidToken` message + `isDrawCandidate` +
  `suggestDrawToken` + `--propose` branch).
- [ ] `scripts/convert-cards/inputs/hero-ability-markers.json` updated with 98
  active draw entries + the deferred draw-pattern catalogue in `_deferred`.
- [ ] `data/cards/*.json` updated by apply mode only (30 files; `git diff` shows
  only `[keyword:draw:N]` appends).
- [ ] `docs/ai/DECISIONS.md` updated with D-22501 (Active, Landed date).
- [ ] `docs/ai/STATUS.md` updated with the WP-225 entry.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-225 row flipped to `[x]` with date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-257 flipped to Done.
- [ ] `git diff --name-only packages/game-engine/` is empty.
- [ ] No files outside `## Files Expected to Change` were modified.
- [ ] EC-257 checklist satisfied line-by-line.

---

## Decisions to Record

### D-22501 — Hero Draw Markup: `[keyword:draw:N]` Token Form + Corpus Sweep (WP-225)

**Decision:** Extend the `hero-ability-markers.json` valid token set (D-21601)
with a fourth base form, `[keyword:draw:N]` where N is a positive integer
(grammar: N ≥ 1; the zero-magnitude form is rejected). The token marks a hero
ability line that draws a fixed count of cards from the top of the player's deck
on play. `VALID_TOKEN_PATTERN` and the `assertValidToken` allowed-token list are
extended **additively** — the existing rescue/reveal branches are kept
byte-for-byte intact and the draw form is appended as one new alternation.
`apply-hero-ability-markers.mjs` gains `isDrawCandidate` / `suggestDrawToken`
detectors: a line is a candidate iff, operating on the trimmed line and after
stripping at most one leading `[hc:X]:` / `[team:X]:` condition, the whole line
equals `Draw <a|one|two|three> card(s).` and contains neither `Reveal` nor an
existing `[keyword:` token. The detector is placed after all reveal-family
branches (reveal retains first-match priority). The corpus sweep marks **98**
lines across **30** sets (83 `draw:1`, 13 `draw:2`, 2 `draw:3`). **This WP emits
only magnitudes 1–3** — the corpus maximum; `four`/`five` are not matched and N
≥ 4 is reserved for a future WP (the grammar permits it, but no such token is
produced here). The engine is unchanged — `'draw'` was already in
`HERO_KEYWORDS` and `executeHeroEffects` since WP-021/WP-215; this WP only
supplies the missing markup so `parseAbilityText()` emits the `draw` effect that
was always intended.

**Deferred draw patterns (this WP does NOT mark, documented in `_deferred`):**
cumulative "another/more/extra" conditional draws; bottom-of-deck draws;
reveal-then-draw lines (reveal family); game-state-conditional draws;
draw-a-new-hand replacement triggers; timing-/keyword-gated draws
(`[keyword:Heist]`, `[keyword:Cyber-Mod]`, `Fight:`, `[keyword:Ambush]`);
compound multi-effect lines; multi-condition cost prefixes
(`[hc:covert][hc:covert]:`); and fixed-count draws of 4 or more cards.
Each pattern class appears exactly once in `_deferred`, represented by one real
exemplar line whose `reason` names the class (per-instance enumeration is
prohibited).

**Rationale:** "Draw a card." is the most common hero effect, and its absence
from the markup pipeline meant ~100 hero cards silently drew nothing on
play.legendary-arena.com (surfaced via Black Widow / Mission Accomplished). The
executor was always present; only the curated markup was missing. Constraining
the candidate rule to a whole-line fixed-count draw (optionally one parsed
condition) keeps the sweep unambiguous, exactly as D-21601 constrained the
rescue/reveal forms.

**Packet:** WP-225 / EC-257.
**Drafted:** 2026-06-08. **Landed:** (set at execution).
**Status:** Draft (Active on execution).

---

## Lint Gate Self-Review

Gate: `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`. Run 2026-06-08.

| § | Title | Result | Notes |
|---|---|---|---|
| §1 | Work Packet Structure | **PASS** | All 10 required sections present and non-empty; Out of Scope lists >2 explicit exclusions |
| §2 | Non-Negotiable Constraints | **PASS** | Engine-wide block (full files, ESM/Node v22, 00.6 reference, no `@legendary-arena/*`) + packet-specific + session protocol + locked contract values; no partial-output permitted |
| §3 | Prerequisites (Assumes) | **PASS** | WP-216 script/map baseline, engine draw-path exports, 40-set presence, card-data shape, baseline commit all listed |
| §4 | Context References | **PASS** | WP-216, the script, the map, `heroAbility.setup.ts`, `heroEffects.execute.ts`, DECISIONS (D-21601/02/03/21701), 00.6, ARCHITECTURE §Layer Boundary — all specific. 00.2 not triggered (no 00.2 §8.1 setup-payload field names used; markup-token + `_deferred` fields are pipeline-local and locked by D-21601) |
| §5 | Output Completeness | **PASS** | 7 logical deliverables, each marked new/modified with a one-line change description; `data/cards/*.json` bounded as a single apply-run group (WP-216 precedent) |
| §6 | Naming Consistency | **PASS** | Token forms match D-21601 family grammar; `heroSlug`/`cardSlug`/`abilityIndex`/`markupToken` match the locked map schema; no 00.2 canonical names contradicted |
| §7 | Dependency Discipline | **PASS** | No new npm dependencies; offline tooling, Node built-ins only |
| §8 | Architectural Boundaries | **PASS** | Shared Tooling layer; no engine/registry/server imports; `data/cards/*.json` + script + governance only |
| §9 | Windows Compatibility | **PASS** | All commands use `node` / `git` / `pnpm` / `grep`; no Unix-only path assumptions in the script (Node built-ins) |
| §10 | Env Variable Hygiene | **N/A** | No env vars used |
| §11 | Authentication | **N/A** | No auth surface touched |
| §12 | Test Quality | **PASS** | No new test files; AC 1–6 verify script behavior, AC 8–9 verify `buildHeroAbilityHooks` parse, AC 11 verifies engine baseline; no boardgame.io / network / DB in any check |
| §13 | Commands and Verification | **PASS** | All commands exact (`node`/`pnpm`/`git`/`grep`) with expected output inline |
| §14 | Acceptance Criteria | **PASS** | 12 binary, observable, file/value-specific items aligned to deliverables |
| §15 | Definition of Done | **PASS** | STATUS.md, DECISIONS.md, WORK_INDEX.md, EC_INDEX.md, and the scope-boundary check all present |
| §16 | Code Style | **PASS** | 00.6 referenced; JSDoc + `// why:` + full-sentence errors required for the two new helpers and the pattern change |
| §17 | Vision Alignment | **PASS** | §17.1 triggered (card data / content semantics §1, §2); `## Vision Alignment` present with clause numbers, no-conflict assertion, NG check, determinism line |
| §18 | Prose-vs-Grep | **N/A** | Verification greps target `[keyword:draw:N]` markup tokens (the WP's own additions), not forbidden-token identifiers; no adjacent prose enumerates forbidden imports/calls |
| §19 | Bridge Staleness | **N/A** | No repo-state-summarizing artifact authored |
| §20 | Funding Surface Gate | **N/A** | Justified inline: card-data + offline-tooling only; no WP-097 §A/§B/§C surface, no user-visible funding copy |
| §21 | API Catalog | **N/A** | No HTTP endpoints and no `apps/server/src/**` library functions added or modified |

**Lint Gate Verdict: PASS**

---

## Pre-Flight Verdict

**Verdict: READY TO EXECUTE** (2026-06-08) — per `docs/ai/REFERENCE/01.4-pre-flight-invocation.md`.

**Baseline:** `origin/main` at `a1cbe23`. The only commit since `c8214c5`
(WP-224) is `a1cbe23` (#240, dashboard CI) — it touches no card-data,
hero-ability, or engine file (`git diff c8214c5 origin/main` over those paths is
empty), so the 98-line / 30-set / 83-13-2 figures are current against `origin/main`.

**Justification:**
- **Dependency readiness.** The sole hard input — WP-216's
  `apply-hero-ability-markers.mjs` + `hero-ability-markers.json` — is present and
  unchanged; the `draw` executor path (`HERO_KEYWORDS` ∋ `'draw'`, `case 'draw'`
  in `heroEffects.execute.ts:222`, `KEYWORD_PATTERN` magnitude capture in
  `heroAbility.setup.ts`) is verified to exist, so **no engine work is required**
  and there is no in-flight blocker.
- **Contract fidelity.** Token grammar `[keyword:draw:N]` matches the existing
  `reveal-*:N` family; `heroSlug`/`cardSlug`/`abilityIndex`/`markupToken` are the
  locked WP-216 map fields; the additive `VALID_TOKEN_PATTERN` extension preserves
  D-21601 byte-for-byte. The 98 candidates were enumerated by running the locked
  detector regex against `data/cards/` at `origin/main` (per-set table in
  §Verification Steps), not estimated.
- **Scope lock.** 7 logical deliverables, closed allowlist; engine, registry,
  server, client are explicitly zero-diff. Magnitude is capped at 1–3 with a
  pre-apply distribution gate, so no `draw:0` / `draw:4+` can leak.
- **Risks resolved.** The only behavioral risk — a reveal-then-draw line being
  miscaptured — is closed by the `Reveal`-exclusion rule + the locked
  after-reveal-family branch placement. Corpus-drift risk is closed by the
  pre-apply (98 / 83-13-2) and post-apply (30-set) gates.
- **Architectural boundary confidence.** Shared Tooling layer only; no
  `@legendary-arena/*` imports; `G`/`ctx`/persistence untouched; determinism
  preserved (setup-time parse, runtime draw via the existing `ShuffleProvider`).

**Risk items (non-blocking):**
- **RS-1.** Local `main` (`ce30933`) is diverged from `origin/main` (`a1cbe23`)
  by pre-existing dashboard-CI INFRA commits that shipped as squash-merge #240.
  This is unrelated to WP-225 and does not affect the baseline (origin is
  authoritative and card data is identical). The execution session should open in
  a worktree branched from a clean `origin/main`; if the canonical clone is the
  edit target, sync it first (`git fetch && git reset --hard origin/main` after
  preserving the dashboard work) — operator decision, outside this WP's scope.
- **RS-2.** Cannot run `pnpm`/`--propose` from the drafting session to re-confirm
  the repo is green. The execution session's EC-257 §Before Starting checkpoint
  (`--validate` exits 0; clean baseline) is the first action that closes this.

**Invocation Prompt Conformance Check:** PASS — the session prompt transcribes
the EC-257 locked values verbatim; introduces no new keyword, helper, file path,
or timing rule; file paths/counts match the WP exactly; resolves no ambiguity not
already resolved here.

**Authorized Next Step:** READY TO EXECUTE → session execution prompt authorized at
`docs/ai/invocations/session-wp225-hero-draw-markup-corpus-sweep.md`.

---

## Copilot Check Verdict

**Verdict: PASS** (2026-06-08) — per `docs/ai/REFERENCE/01.7-copilot-check.md`.
**Pre-flight verdict under review:** READY TO EXECUTE (2026-06-08).

WP-225 is a data + offline-tooling WP with zero engine/runtime/UI/persistence
surface, so most of the 30 issues collapse to PASS or N/A. The pre-flight verdict
holds; no finding would cause architectural or determinism damage.

**Findings (non-trivial surface only; all others PASS/N/A):**

1. **Separation of Concerns (#1)** — PASS. Engine, registry, server, client are
   zero-diff; the change lives entirely in Shared Tooling + card data.
2. **Determinism (#2)** — PASS. Offline tooling; `[keyword:draw:N]` parsed at
   setup time; runtime draw reuses the existing `ShuffleProvider`. No new RNG/IO.
3. **Type Safety / Contract Integrity (#4)** — PASS. `'draw'` already in the
   closed `HeroKeyword` union + `HERO_KEYWORDS` array (no drift-test change);
   token grammar matches the `reveal-*:N` family; `VALID_TOKEN_PATTERN` extended
   additively (D-21601 preserved byte-for-byte).
4. **Persistence / Serialization (#5)** — PASS. `_deferred`/active entries are
   plain JSON; card data gains only string token appends; no `G` persistence.
5. **Testing / Invariant Enforcement (#6)** — PASS. Pre-apply distribution gate
   (83/13/2) + post-apply 30-set gate + idempotence re-run + `--validate` give
   loud, observable invariants; engine test baseline asserted unchanged.
6. **Scope & Execution Governance (#7)** — PASS. Closed 7-file allowlist;
   `git diff --name-only` boundary check; magnitude capped 1–3 (no 4/5 leak).
7. **Extensibility (#8)** — PASS. Detector is additive; `N ≥ 1` grammar leaves
   room for a future draw:4+ WP without re-locking the token form.
8. **Documentation & Intent (#9)** — PASS. `// why: D-22501` required on the
   pattern edit; JSDoc required on both new helpers; error message locked.
9. **Error Handling / Failure Semantics (#10)** — PASS. Loud-fail on unknown
   slug/index/token + structural violation; "Skipped" semantics pinned so
   failures never masquerade as skips.

**Mandatory Governance Follow-ups:** DECISIONS.md entry D-22501 (reserved here;
landed at execution). No `02-CODE-CATEGORIES.md` / `.claude/rules/*.md` change.

**Pre-Flight Verdict Disposition:** **CONFIRM** — READY TO EXECUTE stands.
Session-prompt generation authorized.
