# WP-217 — Hero Reveal Executor Extensions: Reveal-KO-If-Zero and Reveal-Draw-At-Least (Engine + Data)

**Status:** Draft
**Primary Layer:** Game Engine + Card Data + Offline Tooling
**Dependencies:** WP-216 (hero ability markup corpus sweep complete; D-21601..D-21603 active)

---

## Session Context

> WP-215 wired the `rescue` and `reveal` executors for the "draw if cost ≤ N"
> pattern and marked Web-Shooters as the v1 card. WP-216 swept the 40-set corpus
> for that pattern, producing 19 marked entries across 10 sets.
>
> Two reveal-related executor shapes remain unimplemented and unmarkable under
> the WP-215/216 token vocabulary:
>
> 1. **Reveal-KO-if-zero:** "Reveal the top card of your deck. If it costs 0, KO it."
>    — 3 clean hero cards across cvwr and wwhk. Zero executor case; peek deck
>    top, move to KO pile if cost = 0, otherwise put back face-down.
>
> 2. **Reveal-draw-at-least:** "Reveal the top card of your deck. If it costs N
>    or more, draw it." — 2 clean hero cards across cvwr and wwhk. Opposite
>    threshold direction from WP-215's ≤N executor: draw only the expensive
>    cards.
>
> Both require: (a) new `HeroKeyword` entries, (b) new executor branches,
> (c) a `KEYWORD_PATTERN` regex extension to allow hyphens, (d) new tokens
> in `hero-ability-markers.json`, and (e) applied markup in card data.
>
> 5 hero cards in total. 2 sets (cvwr, wwhk). Clean patterns with no bonus
> effects, no Fight: timing, no "Otherwise" branches.

---

## Goal

After this packet, the `executeHeroEffects` executor handles two new effect
types — `reveal-ko` and `reveal-min` — and every in-scope hero ability line
matching these patterns carries the correct markup token. Playing a cvwr or
wwhk hero card with one of these effects produces correct state transitions.

Patterns that require new infrastructure (runtime card property lookup for
class/team/icon conditions; combined KO+draw; bonus effects after KO;
Fight:-timed reveals) are deferred and documented.

---

## Assumes

- WP-216 shipped: `hero-ability-markers.json`, `apply-hero-ability-markers.mjs`,
  and 19 markup entries are committed and passing `--validate`.
- `KEYWORD_PATTERN` in `packages/game-engine/src/setup/heroAbility.setup.ts`
  is currently `/\[keyword:([a-zA-Z]+)(?::(\d+))?\]/g` — no hyphens allowed.
- `HeroKeyword` in `packages/game-engine/src/rules/heroKeywords.ts` is a closed
  union; `HERO_KEYWORDS` is its canonical array; a drift-detection test asserts
  parity. Adding a keyword requires updating both.
- `executeSingleEffect()` in `packages/game-engine/src/hero/heroEffects.execute.ts`
  uses `MVP_KEYWORDS` set to gate dispatch; new keywords must be added to that set.
- `G.cardStats[extId].cost` is the authoritative recruit cost for all hero deck
  cards at runtime (WP-021 / D-21502).
- `G.heroDeck[playerID]` is the player's draw pile; `[0]` is the top card.
- KO destination: `G.piles.ko` (or equivalent KO pile used by existing `'ko'`
  executor case — verify at execution time).
- Baseline: `ac739d3` on `origin/main` (2026-06-05) — WP-216 + governance landed.

---

## Context (Read First)

1. `packages/game-engine/src/rules/heroKeywords.ts` — `HeroKeyword` union,
   `HERO_KEYWORDS` canonical array, drift-detection note
2. `packages/game-engine/src/setup/heroAbility.setup.ts` — `KEYWORD_PATTERN`,
   `parseAbilityText()`, `VP_COST_THRESHOLD_PATTERN`, `ICON_MAGNITUDE_PATTERN`
3. `packages/game-engine/src/hero/heroEffects.execute.ts` — `MVP_KEYWORDS`,
   `executeSingleEffect()`, existing `'rescue'` and `'reveal'` cases
4. `packages/game-engine/src/rules/heroAbility.setup.test.ts` — drift-detection
   test that asserts `HERO_KEYWORDS` matches the `HeroKeyword` union
5. `packages/game-engine/src/hero/heroEffects.execute.test.ts` — existing
   executor tests (model for new test cases)
6. `scripts/convert-cards/apply-hero-ability-markers.mjs` — `VALID_TOKEN_PATTERN`
   regex (must be extended), `--propose` detection functions (new functions needed)
7. `scripts/convert-cards/inputs/hero-ability-markers.json` — curated map
   (new entries added for 5 cards; deferred block extended)
8. `docs/ai/DECISIONS.md` — D-21601..D-21603 (prior reveal/rescue decisions)
9. `docs/ai/REFERENCE/00.6-code-style.md` — human-style code constraints
10. `docs/ai/ARCHITECTURE.md` — Layer Boundary; Shared Tooling vs Game Engine

---

## Scope (In)

### Engine

1. **Extend `KEYWORD_PATTERN`** in `heroAbility.setup.ts` to allow hyphens in
   keyword names: change `[a-zA-Z]+` to `[a-zA-Z][a-zA-Z-]*`. This makes
   `[keyword:reveal-ko]` and `[keyword:reveal-min:N]` parseable. Extend any
   associated regex documentation comment to reflect the new character class.

2. **Add `'reveal-ko'` and `'reveal-min'` to `HeroKeyword`** union and
   `HERO_KEYWORDS` canonical array in `heroKeywords.ts`. Follow the existing
   closed-union pattern with a `// why:` DECISIONS.md citation. The drift-
   detection test must continue to pass.

3. **Add `'reveal-ko'` and `'reveal-min'` to `MVP_KEYWORDS`** set in
   `heroEffects.execute.ts`.

4. **Add `'reveal-ko'` executor branch** in `executeSingleEffect()`:
   - Peek `G.heroDeck[playerID][0]` (deck top, if present).
   - Look up `G.cardStats[topCardExtId]?.cost`.
   - If cost = 0, move the card from deck top to the KO pile (same destination
     as the existing `'ko'` case — verify the actual pile name at execution time).
   - If cost ≠ 0 or deck is empty, no mutation (silent no-op).
   - `magnitude` is unused for `reveal-ko`; skip the magnitude pre-check gate.
   - Add a `// why:` comment: `// why: reveal-ko peeks one card and KOs it
     only when cost = 0; deck empty is a silent no-op per D-21502 precedent`

5. **Add `'reveal-min'` executor branch** in `executeSingleEffect()`:
   - Peek `G.heroDeck[playerID][0]` (deck top, if present).
   - Look up `G.cardStats[topCardExtId]?.cost`.
   - If cost ≥ `effect.magnitude`, draw it (move from deck top to player hand —
     same mutation as the existing `'reveal'` case when threshold passes).
   - If cost < `effect.magnitude` or deck is empty, no mutation (silent no-op).
   - `magnitude` is required for `reveal-min`; apply the existing magnitude
     pre-check gate (undefined magnitude → skip, same as `draw`/`attack`/`recruit`).
   - Add a `// why:` comment: `// why: reveal-min draws the card only when cost
     >= threshold — opposite direction from 'reveal' which draws when cost <= threshold`

6. **Tests** in `heroEffects.execute.test.ts` (or a new
   `heroEffects.execute.revealKo.test.ts` if the existing file is large — verify
   at execution time):
   - `reveal-ko` on a deck with cost-0 top card → card moved to KO pile
   - `reveal-ko` on a deck with cost-1 top card → no mutation
   - `reveal-ko` with empty deck → no mutation
   - `reveal-min:1` with cost-0 top card → no draw (0 < 1)
   - `reveal-min:1` with cost-1 top card → draw (1 ≥ 1)
   - `reveal-min:3` with cost-2 top card → no draw (2 < 3)
   - `reveal-min:3` with cost-3 top card → draw (3 ≥ 3)
   - `reveal-min` with undefined magnitude → no mutation (magnitude gate)
   - `reveal-min:2` with empty deck → no mutation

### Tooling — `apply-hero-ability-markers.mjs`

7. **Extend `VALID_TOKEN_PATTERN`** to accept the two new forms:
   - `[keyword:reveal-ko]` (no suffix)
   - `[keyword:reveal-min:N]` where N is a positive integer

   Updated regex (one option — verify readability at execution time):
   ```
   /^\[keyword:rescue:\d+\]$|^\[keyword:reveal\]$|^\[keyword:reveal:\d+\]$|^\[keyword:reveal-ko\]$|^\[keyword:reveal-min:\d+\]$/
   ```

8. **Add `isRevealKoCandidate(line)`** detection function:
   - Returns `true` when ALL of:
     - Contains `'Reveal the top card of your deck.'`
     - Contains `'If it costs 0, KO it.'` (exact phrase — excludes `0[icon:vp]` variant)
     - Does NOT contain `'Fight:'` or `'[keyword:Fight]'`
     - Does NOT contain `'[keyword:Excessive'`
     - Does NOT contain `'Otherwise,'` (no two-branch choice)
     - Does NOT contain `'and you'` (no bonus effect after KO)
     - Does NOT contain `'[keyword:reveal-ko]'` (already marked — idempotence)

9. **Add `isRevealMinCandidate(line)`** detection function:
   - Returns `true` when ALL of:
     - Contains `'Reveal the top card of your deck.'`
     - Contains `'or more, draw it.'`
     - Does NOT contain `'Fight:'` or `'[keyword:Fight]'`
     - Does NOT contain `'Otherwise,'`
     - Does NOT contain `'[keyword:reveal-min:'` (already marked — idempotence)

10. **Add `suggestRevealMinToken(line)`** — extract N from `'costs N or more'`
    regex, return `[keyword:reveal-min:N]`.

11. **Update `runPropose()`** to scan with the two new detection functions, emit
    candidate rows in the same format, merged into the sorted output stream.

12. **Update `runValidate()`** to accept `reveal-ko` and `reveal-min:N` tokens
    when checking map entries against card data.

### Data — `hero-ability-markers.json` and `data/cards/*.json`

13. **Add 5 new entries** to `hero-ability-markers.json`:

    ```json
    "cvwr": [
      /* existing entries ... */
      { "heroSlug": "cloak-dagger", "cardSlug": "darkness", "abilityIndex": 0,
        "markupToken": "[keyword:reveal-ko]" },
      { "heroSlug": "cloak-dagger", "cardSlug": "light", "abilityIndex": 0,
        "markupToken": "[keyword:reveal-min:1]" },
      { "heroSlug": "hercules", "cardSlug": "prince-of-power", "abilityIndex": 0,
        "markupToken": "[keyword:reveal-ko]" }
    ],
    "wwhk": [
      { "heroSlug": "bruce-banner", "cardSlug": "dangerous-testing", "abilityIndex": 0,
        "markupToken": "[keyword:reveal-ko]" },
      { "heroSlug": "rick-jones", "cardSlug": "captain-marvel", "abilityIndex": 0,
        "markupToken": "[keyword:reveal-min:3]" }
    ]
    ```

    Run `--propose` BEFORE editing the map to confirm slugs and indices.
    Update `_deferred` block to document the excluded patterns (see §Deferred).

14. **Apply markup** to `data/cards/cvwr.json` and `data/cards/wwhk.json` using
    `node scripts/convert-cards/apply-hero-ability-markers.mjs`.

---

## Out of Scope

- Class/team/icon condition reveal-draw: `"If it's [hc:tech] or [hc:strength], draw it."` etc. — requires runtime lookup of revealed card's class/team/icon properties, which is not available in the current executor surface. Deferred per D-21703.
- Combined KO + draw: `"If it costs 0, KO it. If it costs 1 or 2, draw it."` (ssw2/silk) — multi-branch single-ability effect chain; deferred.
- KO + bonus effect: `"If it costs 0, KO it and you get +1[icon:attack]."` (ssw2/dr-punisher) — bonus effect after KO; deferred.
- `0[icon:vp]` VP-cost KO variant: `"If it costs 0[icon:vp], KO it."` (dkcy/punisher/boom-goes-the-dynamite) — VP-cost check semantics differ from recruit cost; deferred.
- Fight:-timed reveal-KO: `cosm.json:1400`, `3dtc.json:539` — `onFight` timing not wired to hero effects; deferred.
- Reveal + "Otherwise" branches: `anni/brainstorm/borrow-from-the-future` ("Otherwise, discard it or put it back.") — two-branch single ability; deferred.
- `onFight`-timed deferred entries from WP-216 (amwp/Heist:, dead/Excessive Violence:, mgtg/Excessive Kindness:) — different WP; not touched here.
- `wound` and `conditional` keyword implementation — still deferred.
- Any engine changes beyond `heroKeywords.ts`, `heroAbility.setup.ts`, `heroEffects.execute.ts`, and their tests.
- Any registry, server, or client changes.

---

## Files Expected to Change

**Engine (modified):**
1. `packages/game-engine/src/rules/heroKeywords.ts` — add `'reveal-ko'` and `'reveal-min'` to union + array
2. `packages/game-engine/src/setup/heroAbility.setup.ts` — extend `KEYWORD_PATTERN` regex
3. `packages/game-engine/src/hero/heroEffects.execute.ts` — add `'reveal-ko'` and `'reveal-min'` to `MVP_KEYWORDS` + executor cases

**Engine tests (modified or new):**
4. `packages/game-engine/src/hero/heroEffects.execute.test.ts` — new test cases for both executors (or new file if existing is large)
5. `packages/game-engine/src/rules/heroAbility.setup.test.ts` — drift-detection test already asserts `HERO_KEYWORDS` ↔ union parity; no changes needed IF union + array are updated correctly, but verify it still passes

**Tooling (modified):**
6. `scripts/convert-cards/apply-hero-ability-markers.mjs` — extend `VALID_TOKEN_PATTERN`, add new detection/suggestion functions, update `--propose` + `--validate`

**Data (modified):**
7. `scripts/convert-cards/inputs/hero-ability-markers.json` — 5 new entries + deferred block additions
8. `data/cards/cvwr.json` — markup appended to 3 ability lines (cloak-dagger/darkness, cloak-dagger/light, hercules/prince-of-power)
9. `data/cards/wwhk.json` — markup appended to 2 ability lines (bruce-banner/dangerous-testing, rick-jones/captain-marvel)

**Governance:**
10. `docs/ai/DECISIONS.md` — D-21701..D-21704 (new decisions)
11. `docs/ai/STATUS.md` — WP-217 drafted → executed
12. `docs/ai/work-packets/WORK_INDEX.md` — WP-217 `[ ]` → `[x]`
13. `docs/ai/execution-checklists/EC_INDEX.md` — EC-249 Draft → Done

---

## Contract

This WP locks the following surfaces. Future WPs that consume or reference
these must treat them as read-only contracts.

### New token forms (D-21701, D-21702)

| Token | Executor | Semantics |
|---|---|---|
| `[keyword:reveal-ko]` | `reveal-ko` | Peek deck top; KO it if cost = 0; otherwise no-op |
| `[keyword:reveal-min:N]` | `reveal-min` | Peek deck top; draw it if cost ≥ N; otherwise no-op |

`reveal-ko` takes no magnitude suffix. `reveal-min` requires an integer suffix
(the minimum cost threshold).

### `KEYWORD_PATTERN` extension (D-21701)

New pattern: `/\[keyword:([a-zA-Z][a-zA-Z-]*)(?::(\d+))?\]/g`

The character class `[a-zA-Z][a-zA-Z-]*` allows hyphens after the first
character, enabling multi-word keyword names. The existing single-word keywords
(`draw`, `attack`, etc.) continue to match.

### `HeroKeyword` union additions (D-21701, D-21702)

```typescript
export type HeroKeyword =
  | 'draw' | 'attack' | 'recruit' | 'ko'
  | 'rescue' | 'wound' | 'reveal' | 'conditional'
  | 'reveal-ko'   // D-21701
  | 'reveal-min'; // D-21702
```

`HERO_KEYWORDS` canonical array must include both entries in the same position.

### Executor contracts (D-21701, D-21702)

**`reveal-ko`:**
- Deck empty → silent no-op (no error, no mutation)
- `G.cardStats[topExtId]` missing → silent no-op (defensive; cards in deck must have stats but guard anyway)
- cost = 0 → move `topExtId` from `G.heroDeck[playerID]` head to KO pile
- cost > 0 → silent no-op (card stays on deck top, face-down)
- `magnitude` is not used; never gate on magnitude for this case

**`reveal-min`:**
- `magnitude` = undefined → skip (same pre-check gate as `draw`/`attack`/`recruit`)
- Deck empty → silent no-op
- `G.cardStats[topExtId]` missing → silent no-op
- cost ≥ magnitude → move `topExtId` from `G.heroDeck[playerID]` head to player hand
- cost < magnitude → silent no-op

Both executors do NOT trigger deck reshuffle (same D-21502 precedent as `'reveal'`).

---

## Candidate Detection Rules (authoritative for `--propose` extensions)

### `isRevealKoCandidate(line)` — new function

Line is a candidate when ALL of:
- Contains `'Reveal the top card of your deck.'`
- Contains `'If it costs 0, KO it.'`
- Does NOT contain `'Fight:'`
- Does NOT contain `'[keyword:Fight]'`
- Does NOT contain `'[keyword:Excessive'`
- Does NOT contain `'Otherwise,'`
- Does NOT contain `'and you'`
- Does NOT contain `'[keyword:reveal-ko]'` (idempotence)

Suggested token: always `[keyword:reveal-ko]`.

### `isRevealMinCandidate(line)` — new function

Line is a candidate when ALL of:
- Contains `'Reveal the top card of your deck.'`
- Contains `'or more, draw it.'`
- Does NOT contain `'Fight:'`
- Does NOT contain `'[keyword:Fight]'`
- Does NOT contain `'Otherwise,'`
- Does NOT contain `'[keyword:reveal-min:'` (idempotence)

Suggested token: `[keyword:reveal-min:N]` where N is extracted from `costs N or more` via
`/costs (\d+) or more/` regex.

These rules are the authoritative source for what `--propose` emits for the
new pattern types. No other exclusions are valid without a DECISIONS.md entry.

---

## Deferred Patterns (D-21703, D-21704)

### D-21703 — Class/Team/Icon Condition Reveal-Draw

The following ability line patterns are deferred because they require runtime
lookup of the REVEALED card's class, team, or icon properties — data not
currently available in the executor surface:

- `"Reveal the top card of your deck. If it's an [team:x-men] Hero, draw it."` (core/gambit)
- `"Reveal the top card of your deck. If it's [hc:instinct] or [hc:tech], draw it."` (pttr/moon-knight)
- `"Reveal the top card of your deck. If that card has an [icon:attack] icon, draw it."` (pttr/spider-woman)
- `"Reveal the top card of your deck. If it's [hc:tech] or [hc:strength], draw it."` (ssw2/beast)
- `"[hc:tech]: Reveal the top card of your deck. If it's a [team:shield], draw it."` (wwhk)
- Other class/team/icon condition variants discovered at execution time

These require a new `revealDrawIfClass` / `revealDrawIfTeam` / `revealDrawIfIcon`
executor infrastructure — a separate WP.

### D-21704 — Combined or Bonus-Effect Reveal Variants

The following are deferred because they require combined or chained effects
not yet supported by single-token markup:

- `ssw2/silk/silk-stalking` — "If it costs 0, KO it. If it costs 1 or 2, draw it." (KO + conditional draw)
- `ssw2/dr-punisher/youre-a-slow-learner` — "If it costs 0, KO it and you get +1[icon:attack]." (KO + bonus)
- `anni/brainstorm/borrow-from-the-future` — "If it costs 2 or more, draw it. Otherwise, discard it or put it back." (draw-or-discard choice)
- `cosm/captain-mar-vell/channel-the-nega-bands` — "If it costs 1 or more, gain a [rule:Shard]. If it costs 0, KO it." (non-draw outcome)
- `dkcy/punisher/boom-goes-the-dynamite` — "If it costs 0[icon:vp], KO it." (VP-cost variant)

---

## Non-Negotiable Constraints

### Engine
- New executor cases must use `for` loops where iteration is needed — no `.reduce()`.
- `G.heroDeck[playerID]` mutation must go through `zoneOps.ts` helpers (same as
  existing `'rescue'` and `'reveal'` cases — verify at execution time).
- KO pile mutation must use the same helper as the existing `'ko'` case.
- `effect.magnitude` for `reveal-ko` must NOT be checked — no magnitude gate.
- Both executors emit silent no-ops on empty deck; no throw, no log.
- `HERO_KEYWORDS` canonical array and `HeroKeyword` union must stay in parity.
  Drift-detection test must pass.

### Tooling
- ESM only, Node v22+ — no `require()`, no `node-fetch`.
- No `@legendary-arena/*` imports. Offline Shared Tooling layer only.
- `assertValidToken()` must still reject all tokens not in the extended valid set.
- New detection functions must be independently testable; each must have a JSDoc.
- Updated `--propose` output format remains identical (one line per candidate,
  sorted lexically; same `<setAbbr> | <heroSlug> | <cardSlug> | abilityIndex=<n> | "<abilityText>" | suggested=<token>` format).

### Data
- Only surgical token appends — no structural JSON changes.
- `hero-ability-markers.json` entries added to existing set arrays (do not
  replace existing entries or restructure the file).
- Run `--propose` before curating — never skip.

---

## Vision Alignment

**Vision clauses touched:** §1 (Card Accuracy — new markup tokens extend ability
text with structured annotations), §2 (Faithful Ruleset — reveal-KO and
reveal-draw-at-least effects on 5 hero cards will fire correctly after this WP).

**Conflict assertion:** No conflict. Executor additions increase rule fidelity
for existing card text. No new card effects beyond what the printed rules specify.

**Non-Goal proximity:** N/A — no monetization, competitive, identity, payment,
cosmetics, persuasion, scarcity, leaderboard, or accessibility surface touched.

**Determinism preservation:** `G.cardStats[extId].cost` is deterministic
(set from registry at setup time, never mutated). Both new executors are
deterministic: same deck-top card + same cost threshold → same outcome on
every replay. No new randomness introduced.

---

## Acceptance Criteria

1. `pnpm --filter @legendary-arena/game-engine test` exits 0 with no new failures
   after all engine changes.
2. `pnpm -r build` exits 0.
3. `HERO_KEYWORDS` canonical array and `HeroKeyword` union both contain `'reveal-ko'`
   and `'reveal-min'`; drift-detection test passes.
4. `[keyword:reveal-ko]` ability line with cost-0 deck-top card → card moves
   to KO pile (confirmed by test).
5. `[keyword:reveal-ko]` ability line with cost-1 deck-top card → no mutation
   (confirmed by test).
6. `[keyword:reveal-min:3]` ability line with cost-2 deck-top card → no draw
   (confirmed by test).
7. `[keyword:reveal-min:3]` ability line with cost-3 deck-top card → draw
   (confirmed by test).
8. `parseAbilityText('[hc:tech]: Reveal the top card of your deck. If it costs 0, KO it. [keyword:reveal-ko]')`
   returns `effects: [{ type: 'reveal-ko', magnitude: undefined }]` and
   `conditions: [{ type: 'heroClassMatch', value: 'tech' }]`.
9. `parseAbilityText('[hc:ranged]: Reveal the top card of your deck. If it costs 1 or more, draw it. [keyword:reveal-min:1]')`
   returns `effects: [{ type: 'reveal-min', magnitude: 1 }]`.
10. `node scripts/convert-cards/apply-hero-ability-markers.mjs --propose` exits 0
    and includes candidate rows for all 5 in-scope cards (including already-marked
    rows from prior WPs). Rows for `darkness`, `prince-of-power`, `dangerous-testing`
    show `suggested=[keyword:reveal-ko]`; rows for `light` and `captain-marvel`
    show `suggested=[keyword:reveal-min:1]` and `suggested=[keyword:reveal-min:3]`.
11. `node scripts/convert-cards/apply-hero-ability-markers.mjs` (apply mode) exits 0;
    `Updated` count = 5 on first run.
12. Second apply run produces zero diff to `data/cards/` (idempotence).
13. `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0
    after apply.
14. `grep "\[keyword:reveal-ko\]" data/cards/cvwr.json | wc -l` = 2
    (darkness + prince-of-power).
15. `grep "\[keyword:reveal-ko\]" data/cards/wwhk.json | wc -l` = 1
    (bruce-banner/dangerous-testing).
16. `grep "\[keyword:reveal-min:" data/cards/cvwr.json | wc -l` = 1
    (cloak-dagger/light, `[keyword:reveal-min:1]`).
17. `grep "\[keyword:reveal-min:" data/cards/wwhk.json | wc -l` = 1
    (rick-jones/captain-marvel, `[keyword:reveal-min:3]`).
18. `assertValidToken` in the script rejects `[keyword:reveal-ko:0]` (invalid form
    — no suffix for reveal-ko) and `[keyword:reveal-min]` (no suffix — magnitude
    required) with non-zero exit and a full-sentence error message.
19. Every new `_deferred` entry in `hero-ability-markers.json` has a non-empty
    `reason` field.
20. `docs/ai/DECISIONS.md` D-21701..D-21704 all Active with `Landed:` commit.

---

## Verification Steps

```bash
# Clean baseline
git diff --name-only packages/game-engine/ data/cards/
# Expected: empty

# Engine tests pre-change
pnpm --filter @legendary-arena/game-engine test
# Expected: all pass (note count for comparison post-change)

# Confirm new tokens not yet in data (pre-apply)
grep -r "keyword:reveal-ko\|keyword:reveal-min" data/cards/
# Expected: empty

# After engine changes — run tests
pnpm --filter @legendary-arena/game-engine test
# Expected: all pass; new test cases for reveal-ko and reveal-min pass

# Dry-run: confirm new candidate rows appear
node scripts/convert-cards/apply-hero-ability-markers.mjs --propose | grep "reveal-ko\|reveal-min"
# Expected: 5 rows (darkness, prince-of-power, dangerous-testing, light, captain-marvel)

# Apply markup
node scripts/convert-cards/apply-hero-ability-markers.mjs
# Expected: Processed: N entries / Updated: 5 lines / Skipped: N lines (already marked)

# Idempotence check
node scripts/convert-cards/apply-hero-ability-markers.mjs
git diff data/cards/
# Expected: no changes; Skipped count includes the 5 new entries

# Validate map ↔ data
node scripts/convert-cards/apply-hero-ability-markers.mjs --validate
# Expected: exits 0

# Count new tokens
grep "\[keyword:reveal-ko\]" data/cards/cvwr.json | wc -l   # Expected: 2
grep "\[keyword:reveal-ko\]" data/cards/wwhk.json | wc -l   # Expected: 1
grep "\[keyword:reveal-min:" data/cards/cvwr.json | wc -l   # Expected: 1
grep "\[keyword:reveal-min:" data/cards/wwhk.json | wc -l   # Expected: 1

# Full build
pnpm -r build
# Expected: exits 0
```

---

## Definition of Done

- [ ] All Acceptance Criteria above are met.
- [ ] `packages/game-engine/src/rules/heroKeywords.ts` updated with `'reveal-ko'` and `'reveal-min'`.
- [ ] `packages/game-engine/src/setup/heroAbility.setup.ts` `KEYWORD_PATTERN` extended for hyphens.
- [ ] `packages/game-engine/src/hero/heroEffects.execute.ts` has `reveal-ko` and `reveal-min` executor cases.
- [ ] New executor tests pass for all branches (cost-0, cost>0, cost<min, cost≥min, empty deck, undefined magnitude).
- [ ] `apply-hero-ability-markers.mjs` `VALID_TOKEN_PATTERN` updated; new detection + suggestion functions present.
- [ ] `hero-ability-markers.json` has 5 new entries + deferred block additions.
- [ ] `data/cards/cvwr.json` and `data/cards/wwhk.json` marked correctly.
- [ ] `docs/ai/DECISIONS.md` D-21701..D-21704 Active.
- [ ] `docs/ai/STATUS.md` updated.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row flipped to `[x]` with completion date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-249 flipped to Done.
- [ ] No files outside `## Files Expected to Change` were modified.
- [ ] EC-249 checklist satisfied line-by-line.

---

## Lint Gate Self-Review

**Date:** 2026-06-05 | **Verdict: PASS** (all applicable sections resolved)

| § | Title | Result | Notes |
|---|---|---|---|
| §1 | Work Packet Structure | PASS | All 10 required sections present and non-empty |
| §2 | Non-Negotiable Constraints | PASS | Engine: no .reduce(), zoneOps helpers required, HERO_KEYWORDS parity; Tooling: ESM/Node v22, no @legendary-arena imports, assertValidToken rejects invalid forms |
| §3 | Prerequisites | PASS | WP-216 listed; G.cardStats, G.heroDeck, KO-pile mutation requirements stated; baseline commit cited |
| §4 | Context References | PASS | 10 context items: heroKeywords.ts, heroAbility.setup.ts, heroEffects.execute.ts + tests, apply-hero-ability-markers.mjs, decisions, 00.6, ARCHITECTURE.md |
| §5 | Output Completeness | PASS | All 13 files listed under §Files Expected to Change with change type; no ambiguous patch language |
| §6 | Naming Consistency | PASS | `reveal-ko`, `reveal-min` locked; token forms in AC match Contract section exactly |
| §7 | Dependency Discipline | PASS | No new npm deps; no forbidden packages; engine uses existing zoneOps helpers |
| §8 | Architectural Boundaries | PASS | Engine changes in game-engine only; script changes in Shared Tooling layer; data changes in data/cards/ only; no cross-layer violations |
| §9 | Windows Compatibility | N/A | Node built-ins only; no shell-specific paths |
| §10 | Environment Variable Hygiene | N/A | No env vars touched |
| §11 | Authentication Clarity | N/A | No auth surface touched |
| §12 | Test Quality | PASS | 9 executor test cases specified (all branches); drift-detection test coverage noted |
| §13 | Commands and Verification | PASS | 11 explicit commands with expected output; no vague steps |
| §14 | Acceptance Criteria Quality | PASS | 20 items; all binary and observable |
| §15 | Definition of Done | PASS | STATUS.md, DECISIONS.md, WORK_INDEX.md, EC_INDEX.md, scope-boundary check all present |
| §16 | Code Style | PASS | 00.6 referenced in Context; // why: comments required for both new executor cases; full-sentence error messages for assertValidToken |
| §17 | Vision Alignment | PASS | §1 + §2 touched; no conflict; NG-1..7 and determinism not triggered; determinism preservation explicit |
| §18 | Prose-vs-Grep Discipline | N/A | No new API endpoint claims or version-specific assertions requiring grep validation |
| §19 | Bridge-vs-HEAD Staleness | PASS | Baseline commit `ac739d3` cited; KEYWORD_PATTERN current value quoted for verification |
| §20 | Funding Surface Gate | N/A | No monetization, payment, competitive, or persuasion surface touched |
| §21 | API Endpoints Catalog | N/A | No HTTP endpoints added, modified, or removed |
