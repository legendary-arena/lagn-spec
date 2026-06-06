# WP-218 — Hero Reveal Compound Executor + VP-Cost Corpus Extension (Engine + Data)

**Status:** Draft
**Primary Layer:** Game Engine + Card Data + Offline Tooling
**Dependencies:** WP-217 (reveal-ko, reveal-min executors + D-21701..D-21704 active)

---

## Session Context

> WP-217 shipped two new reveal executor variants (`reveal-ko` and `reveal-min`)
> covering 5 hero cards across cvwr and wwhk. Three deferred patterns from
> D-21703/D-21704 remain unimplemented:
>
> 1. **VP-cost KO variant:** `dkcy/punisher/boom-goes-the-dynamite` — "Reveal the
>    top card of your deck. If it costs 0[icon:vp], KO it." The `[icon:vp]` is a
>    display-only cost icon; semantics are identical to `reveal-ko` (cost === 0 →
>    KO). The executor already handles this. Only the detection function needs
>    extension. Lifts D-21703 item 2.
>
> 2. **Compound KO-or-draw:** `ssw2/silk/silk-stalking` — "[team:spider-friends]:
>    Reveal the top card of your deck. If it costs 0, KO it. If it costs 1 or 2,
>    draw it." Two mutually exclusive branches on the same ability line. Requires a
>    new `reveal-ko-or-draw` keyword and executor.
>
> 3. **Reveal-ko deck-removal bug from WP-217:** The `reveal-ko` executor currently
>    calls `koCard(G.ko, topCardId)` without removing `topCardId` from
>    `playerZones.deck`. A cost-0 card ends up in both `G.ko` and `playerZones.deck`
>    simultaneously — a zone integrity violation. EC-249 AC-23 ("deck.length decreases
>    by 1 after reveal-ko fires") was never actually met by the implementation.
>    WP-218 fixes this and corrects the accompanying test assertion.
>
> The `reveal-ko-or-draw` executor reuses the corrected `reveal-ko` sub-path
> (deck removal + ko) and the existing `reveal-min` sub-path (draw), making it a
> natural successor to the bug fix.

---

## Goal

After this packet:

- The `reveal-ko` executor correctly removes the KO'd card from the deck (zone
  integrity restored; AC-23 met).
- A new `reveal-ko-or-draw:N` executor handles compound "KO if cost = 0, draw if
  0 < cost ≤ N" ability lines.
- `isRevealKoCandidate()` detects the `[icon:vp]` zero-cost form.
- Two hero cards are marked: `ssw2/silk/silk-stalking` and
  `dkcy/punisher/boom-goes-the-dynamite`.
- D-21703 item 2 is lifted from deferred.

Remaining deferred patterns (optional-KO, class/team condition reveals, multi-branch
with "Otherwise", Shard bonus effects) are documented and unchanged.

---

## Assumes

- WP-217 shipped: `reveal-ko`, `reveal-min`, `KEYWORD_PATTERN` extended for hyphens,
  `VALID_TOKEN_PATTERN` extended, `hero-ability-markers.json` has 24 entries,
  `--validate` exits 0. Commit `159d606` on `origin/main`.
- `G.playerZones[playerID].deck` is the player's draw pile; `[0]` is the top card.
  The deck MUST NOT be mutated between the `deck[0]` read and condition evaluation.
- KO path: `moveCardFromZone(playerZones.deck, [], topCardId)` removes the card from
  the deck; `G.ko = koCard(G.ko, topCardId)` adds it to the KO pile. Both calls
  required; KO MUST NOT be called unless removal succeeds (D-21801).
  `[]` as the discard-to-nowhere destination is the established pattern from the
  existing `'ko'` case (lines 232–237, WP-217). A dedicated `removeFromZone` helper
  is a future-WP refactor if this pattern spreads to ≥ 3 call sites.
- Draw path: `moveCardFromZone(playerZones.deck, playerZones.hand, topCardId)` then
  assign both returned arrays. The drawn card is appended to hand (the helper's
  standard behaviour); `hand.length` increases by exactly 1.
- `KEYWORD_PATTERN` already allows hyphens: `/\[keyword:([a-zA-Z][a-zA-Z-]*)(?::(\d+))?\]/g`
  — `reveal-ko-or-draw` is parseable with no further regex change.
- `G.cardStats[topCardId].cost` is the authoritative recruit cost. `[icon:vp]` in
  ability text is a display-only annotation; it does NOT affect the numeric cost
  value. All reveal executors use `G.cardStats[topCardId].cost` exclusively — no
  alternative cost source is consulted (D-21803).
- Valid magnitude: integer ≥ 1. `isValidMagnitude` already guards `undefined`; this
  WP extends the contract to treat magnitude ≤ 0 as invalid (same outcome: skip).

---

## Context (Read First)

1. `packages/game-engine/src/hero/heroEffects.execute.ts` — `reveal-ko` case (the
   bug is here: missing `moveCardFromZone` deck removal); `reveal-min` case (correct
   pattern for draw path); existing `'ko'` case (canonical `moveCardFromZone` +
   `koCard` coupling pattern)
2. `packages/game-engine/src/hero/heroEffects.execute.test.ts` — test 20 (asserts
   wrong behavior for reveal-ko; must be corrected); tests 21–23 (no-op paths)
3. `packages/game-engine/src/rules/heroKeywords.ts` — `HeroKeyword` union,
   `HERO_KEYWORDS` array, drift-detection note
4. `packages/game-engine/src/rules/heroAbility.setup.test.ts` — drift-detection
   test (currently expects exactly 10 keywords; will need 11 after new keyword)
5. `scripts/convert-cards/apply-hero-ability-markers.mjs` — `VALID_TOKEN_PATTERN`
   (must be extended), `isRevealKoCandidate` (must be extended for `[icon:vp]`
   form), `collectProposeRowsForSet` (route reveal-ko-or-draw candidates)
6. `scripts/convert-cards/inputs/hero-ability-markers.json` — curated map (2 new
   entries; 2 deferred block removals for lifted items)
7. `docs/ai/DECISIONS.md` — D-21703 (item 2 lifted by D-21803), D-21704 (compound
   pattern — ssw2/silk lifted by D-21802)
8. `docs/ai/REFERENCE/00.6-code-style.md` — human-style code constraints
9. `docs/ai/ARCHITECTURE.md` — Layer Boundary; Shared Tooling vs Game Engine

---

## Scope (In)

### Engine — Bug Fix

1. **Fix `reveal-ko` executor** in `heroEffects.execute.ts`:
   Change the cost-0 branch from:
   ```typescript
   G.ko = koCard(G.ko, topCardId);
   ```
   To:
   ```typescript
   const moveResult = moveCardFromZone(playerZones.deck, [], topCardId);
   if (moveResult.found) {
     playerZones.deck = moveResult.from;
     G.ko = koCard(G.ko, topCardId);
   }
   ```
   If `moveResult.found` is false: no mutation occurs — neither deck nor KO pile are
   touched. This matches the `'ko'` case pattern (lines 232–237 in the WP-217
   committed file) and restores zone integrity. `// why:` comment unchanged.

2. **Fix test 20** in `heroEffects.execute.test.ts`:
   The current assertion `assert.deepEqual(gameState.playerZones['0'].deck, ['starter-agent'])`
   must become `assert.deepEqual(gameState.playerZones['0'].deck, [])` — deck must be
   empty after the card is KO'd. Add the AC-23 invariant assertions:
   ```typescript
   assert.equal(gameState.playerZones['0'].deck.length, 0,
     'deck should shrink by 1 after reveal-ko fires on a cost-0 card (AC-23).');
   assert.equal(gameState.ko.length, 1,
     'KO pile should grow by 1 after reveal-ko fires on a cost-0 card (AC-23).');
   ```

### Engine — New Keyword and Executor

3. **Add `'reveal-ko-or-draw'` to `HeroKeyword`** union and `HERO_KEYWORDS` canonical
   array in `heroKeywords.ts`. Add with a `// why: D-21802` citation. Update the
   drift-detection test to expect 11 keywords.

4. **Add `'reveal-ko-or-draw'` to `MVP_KEYWORDS`** set in `heroEffects.execute.ts`.

5. **Add `'reveal-ko-or-draw'` executor branch** in `executeSingleEffect()`, after
   the `reveal-ko` case:

   ```
   // why: reveal-ko-or-draw peeks deck top; KOs the card (removing it from deck)
   // when cost = 0; draws it when 0 < cost <= magnitude; no-op otherwise (D-21802)
   case 'reveal-ko-or-draw': {
     // Magnitude gate: must be integer ≥ 1; undefined or ≤ 0 → skip
     if (!isValidMagnitude(effect.magnitude) || effect.magnitude < 1) break;
     playerZones guard (break if undefined)
     if (playerZones.deck.length === 0) break;
     topCardId = playerZones.deck[0]; (break if falsy)
     cardStats = G.cardStats[topCardId]; (break if undefined)

     // KO branch MUST be evaluated before draw branch.
     // cost === 0 MUST NOT reach the draw branch.
     if (cardStats.cost === 0) {
       // Remove from deck first; only call koCard if removal succeeded.
       const moveResult = moveCardFromZone(playerZones.deck, [], topCardId);
       if (moveResult.found) {
         playerZones.deck = moveResult.from;
         G.ko = koCard(G.ko, topCardId);
       }
     } else if (cardStats.cost <= (effect.magnitude as number)) {
       // Draw: remove from deck, append to hand.
       const moveResult = moveCardFromZone(playerZones.deck, playerZones.hand, topCardId);
       if (moveResult.found) {
         playerZones.deck = moveResult.from;
         playerZones.hand = moveResult.to;
       }
     }
     // cost > magnitude: no-op
     break;
   }
   ```

   Branch ordering guarantee: the `if (cost === 0)` guard is evaluated first; the
   `else if` draw branch is structurally unreachable when cost === 0.

6. **Tests** for `reveal-ko-or-draw` in `heroEffects.execute.test.ts` (7 new cases):
   - cost-0 top card → KO'd, removed from deck; `deck.length` decreases by 1; `ko.length` increases by 1
   - cost-0 top card, magnitude 2 → KO'd, NOT drawn (KO branch takes precedence)
   - cost-1 top card, magnitude 2 → drawn; `deck.length` decreases by 1; `hand.length` increases by 1
   - cost-2 top card, magnitude 2 → drawn (boundary: equal to magnitude)
   - cost-3 top card, magnitude 2 → no-op; deck unchanged; hand unchanged
   - empty deck → no-op
   - cardStats missing → no-op
   - magnitude undefined → no-op (magnitude gate)

   Note: items 1 and 2 above can be a single test (assert deck shrinks AND card is
   in ko AND card is NOT in hand), but all three assertions must be present.

### Tooling — `apply-hero-ability-markers.mjs`

7. **Extend `VALID_TOKEN_PATTERN`** to accept `[keyword:reveal-ko-or-draw:N]`:

   ```
   /^\[keyword:rescue:\d+\]$
    |^\[keyword:reveal\]$
    |^\[keyword:reveal:\d+\]$
    |^\[keyword:reveal-ko\]$
    |^\[keyword:reveal-min:\d+\]$
    |^\[keyword:reveal-ko-or-draw:\d+\]$/
   ```

8. **Extend `isRevealKoCandidate(line)`** to also match the `[icon:vp]` zero-cost form.
   Replace the current exact-phrase check for the zero-cost form with a regex:
   ```javascript
   const ZERO_COST_KO_RE = /costs\s+0(?:\[icon:vp\])?,\s*KO it/i;
   if (!ZERO_COST_KO_RE.test(line)) return false;
   ```
   This tolerates whitespace variation and case drift. All existing guards (`or more`,
   `draw it.`, `Villain Deck`, `[keyword:reveal`) remain as `line.includes()` checks
   (they are exclusion guards, not fragile positive matchers).

9. **Add `isRevealKoOrDrawCandidate(line)`** detection function.
   A line qualifies IFF ALL of the following are true:
   - `/costs\s+0,\s*KO it/i` matches (has a KO-if-zero branch)
   - `/costs\s+\d+\s+or\s+\d+,\s*draw it/i` matches (has a range-draw branch)
   - Does NOT contain `'Villain Deck'` or `'Master Strike'`
   - Does NOT contain `'Otherwise'`
   - Does NOT contain `'[keyword:reveal'` (already marked)

   The positive requirement for BOTH a KO phrase AND a range-draw phrase makes this
   function structurally mutually exclusive with `isRevealKoCandidate` (which requires
   the KO phrase but NOT the draw phrase). Ordering in `collectProposeRowsForSet`
   is still compound-first as a defense-in-depth measure, but the functions do not
   overlap by construction.

10. **Add `suggestRevealKoOrDrawToken(line)`**:
    ```javascript
    const RANGE_DRAW_RE = /costs\s+(\d+)\s+or\s+(\d+),\s*draw it/i;
    const match = RANGE_DRAW_RE.exec(line);
    if (!match) return null; // regex failure → no suggestion emitted
    const maxCost = Math.max(Number(match[1]), Number(match[2]));
    return `[keyword:reveal-ko-or-draw:${maxCost}]`;
    ```
    For silk: "If it costs 1 or 2, draw it." → maxCost = 2 → `[keyword:reveal-ko-or-draw:2]`.
    Returns `null` on regex failure — callers must check for null before emitting a row.

11. **Update `collectProposeRowsForSet()`**: call `isRevealKoOrDrawCandidate` BEFORE
    `isRevealKoCandidate` (compound detection first, though functions are already
    mutually exclusive by construction — this ordering is defense-in-depth).

### Data — `hero-ability-markers.json` and `data/cards/*.json`

12. **Add 2 new entries** to `hero-ability-markers.json`:

    ```json
    "dkcy": [
      ...(existing entries)...,
      { "heroSlug": "punisher", "cardSlug": "boom-goes-the-dynamite",
        "abilityIndex": 0, "markupToken": "[keyword:reveal-ko]" }
    ],
    "ssw2": [
      { "heroSlug": "silk", "cardSlug": "silk-stalking",
        "abilityIndex": 0, "markupToken": "[keyword:reveal-ko-or-draw:2]" }
    ]
    ```

    Remove dkcy/punisher and ssw2/silk from `_deferred` block (now lifted).
    Run `--propose` BEFORE editing the map to confirm slugs and indices.

13. **Apply markup** with `node scripts/convert-cards/apply-hero-ability-markers.mjs`.
    `Updated` count must be 2 on first run. Second run must produce zero diff
    (idempotence). `--validate` must exit 0.

---

## Out of Scope

- Optional-KO forms: "You may KO it." (mgtg/drax, vill/electro, vnom/carnage) —
  require player-choice UI; deferred.
- Class/team/icon condition reveals: "If it's a [team:x-men] Hero, draw it." etc. —
  require runtime lookup of the revealed card's class/team/icon properties; deferred.
- `anni/brainstorm` "Otherwise, discard it or put it back." — two-branch reveal-min;
  deferred.
- `cosm/captain-mar-vell` "gain a [rule:Shard]" — Shard mechanic not yet implemented;
  deferred.
- `vill/sabretooth` "If it's a [team:brotherhood] Ally..." — class/team condition
  reveal with optional KO; deferred.
- Fight:-timed reveal-KO patterns — `onFight` timing not wired; deferred.
- Dedicated `removeFromZone` helper to replace `moveCardFromZone(zone, [], cardId)`
  pattern — valid future refactor once ≥ 3 call sites use the pattern; deferred.
- Any engine changes beyond `heroKeywords.ts` and `heroEffects.execute.ts`.
- Any registry, server, or client changes.
- `wound` and `conditional` keywords — still deferred.

---

## Files Expected to Change

**Engine (modified):**
1. `packages/game-engine/src/rules/heroKeywords.ts` — add `'reveal-ko-or-draw'` to union + array
2. `packages/game-engine/src/hero/heroEffects.execute.ts` — fix `reveal-ko` deck removal; add `'reveal-ko-or-draw'` to `MVP_KEYWORDS` + executor case

**Engine tests (modified):**
3. `packages/game-engine/src/hero/heroEffects.execute.test.ts` — fix test 20 (reveal-ko deck-shrink assertion); add 7 new cases for `reveal-ko-or-draw`
4. `packages/game-engine/src/rules/heroAbility.setup.test.ts` — drift-detection test updated from 10 → 11

**Tooling (modified):**
5. `scripts/convert-cards/apply-hero-ability-markers.mjs` — extend `VALID_TOKEN_PATTERN`; extend `isRevealKoCandidate` for icon form (regex); add `isRevealKoOrDrawCandidate`, `suggestRevealKoOrDrawToken`; update `collectProposeRowsForSet` ordering

**Data (modified):**
6. `scripts/convert-cards/inputs/hero-ability-markers.json` — 2 new entries; 2 deferred block removals
7. `data/cards/ssw2.json` — markup on silk/silk-stalking abilityIndex=0
8. `data/cards/dkcy.json` — markup on punisher/boom-goes-the-dynamite abilityIndex=0

**Governance:**
9. `docs/ai/DECISIONS.md` — D-21801..D-21803
10. `docs/ai/STATUS.md` — WP-218 executed
11. `docs/ai/work-packets/WORK_INDEX.md` — WP-218 `[ ]` → `[x]`
12. `docs/ai/execution-checklists/EC_INDEX.md` — EC-250 Draft → Done

---

## Contract

### Bug Fix (D-21801)

`reveal-ko` deck-removal contract (corrected from WP-217):

| Outcome | Deck | KO pile |
|---|---|---|
| cost = 0, `moveResult.found = true` | shrinks by 1 | grows by 1 |
| cost = 0, `moveResult.found = false` | unchanged | unchanged (koCard NOT called) |
| cost ≠ 0 | unchanged | unchanged |
| deck empty / stats missing | unchanged | unchanged |

The two operations are fully coupled: `koCard` MUST NOT be called unless
`moveResult.found === true`. If removal fails for any reason, the executor exits
immediately with no mutation.

### Deck Top Consistency Invariant

The revealed card is `playerZones.deck[0]` at the point of evaluation. No
intermediate mutation may reorder the deck before the condition branch completes.
The `topCardId` read and all condition checks use the same snapshot value.

### `[icon:vp]` Semantics (D-21803)

`[icon:vp]` in ability text is a display-only annotation. It does NOT affect the
numeric cost value used in executor logic. All reveal executors use
`G.cardStats[topCardId].cost` exclusively — no alternative cost source is consulted.
A card with `"If it costs 0[icon:vp], KO it."` is treated identically to one with
`"If it costs 0, KO it."` at the executor level.

### New Keyword `reveal-ko-or-draw` (D-21802)

| Token | Executor | Semantics |
|---|---|---|
| `[keyword:reveal-ko-or-draw:N]` | `reveal-ko-or-draw` | cost = 0 → KO + remove from deck; 0 < cost ≤ N → draw (append to hand); cost > N → no-op |

**Branch ordering guarantee:** The KO branch (`cost === 0`) is evaluated first via
an `if` guard. The draw branch (`cost ≤ N`) is in an `else if` — structurally
unreachable when cost === 0. A cost-0 top card MUST NEVER be drawn; it goes to KO.

**Valid magnitude:** integer ≥ 1. Magnitude that is `undefined`, `null`, or ≤ 0 →
executor skips immediately (same outcome as for `reveal-min`).

**Mutation guarantees:**
- KO branch: `deck.length` decreases by 1; `G.ko.length` increases by 1
- Draw branch: `deck.length` decreases by 1; `hand.length` increases by exactly 1 (appended)
- Both branches: `moveResult.found` must be true before any zone assignment

### Detection Function Mutual Exclusivity

`isRevealKoOrDrawCandidate` and `isRevealKoCandidate` are mutually exclusive by
construction:
- `isRevealKoOrDrawCandidate` requires a positive match on `/costs\s+\d+\s+or\s+\d+,\s*draw it/i`
- `isRevealKoCandidate` excludes any line containing `'draw it.'`

A line cannot satisfy both. Compound-first ordering in `collectProposeRowsForSet`
is defense-in-depth, not the primary exclusivity mechanism.

---

## Decisions to Reserve

- **D-21801** — Reveal-KO Deck-Removal Fix: zone-integrity correction for the
  reveal-ko executor; `moveCardFromZone(deck, [], topCardId)` required before
  `koCard`; `koCard` MUST NOT be called unless `moveResult.found === true`. Follows
  the existing `'ko'` case pattern. Corrects WP-217 implementation gap.
- **D-21802** — New HeroKeyword `reveal-ko-or-draw`: compound executor for "KO if
  cost = 0, draw if 0 < cost ≤ N" ability lines. KO branch evaluated first; draw
  branch structurally unreachable at cost = 0. Magnitude = max draw threshold
  (integer ≥ 1). Both KO and draw branches remove card from deck via
  `moveCardFromZone`. One in-scope card: ssw2/silk.
- **D-21803** — VP-Cost Zero Form Detection Lift: extends `isRevealKoCandidate` to
  detect `costs 0[icon:vp], KO it` form via regex `/costs\s+0(?:\[icon:vp\])?,\s*KO it/i`.
  `[icon:vp]` is display-only; executor uses `G.cardStats[topCardId].cost`
  exclusively. Lifts D-21703 item 2 deferral. One in-scope card: dkcy/punisher.

---

## Acceptance Criteria

1. `pnpm --filter @legendary-arena/game-engine test` exits 0 with no new failures.
2. `pnpm -r build` exits 0.
3. `HERO_KEYWORDS` canonical array and `HeroKeyword` union both contain
   `'reveal-ko-or-draw'`; drift-detection test passes (11 keywords).
4. After `reveal-ko` fires on a cost-0 card: `deck.length` decreases by 1;
   `G.ko.length` increases by 1 (zone integrity — AC-23 met).
5. After `reveal-ko` does NOT fire (cost > 0): `deck.length` unchanged; `G.ko`
   unchanged.
6. `reveal-ko-or-draw:2` on cost-0 top card → KO'd + removed from deck; `deck.length`
   decreases by 1; `ko.length` increases by 1.
7. `reveal-ko-or-draw:2` on cost-0 top card → card is NOT in hand (KO takes
   precedence over draw; `hand.length` unchanged).
8. `reveal-ko-or-draw:2` on cost-1 top card → drawn; `deck.length` decreases by 1;
   `hand.length` increases by 1.
9. `reveal-ko-or-draw:2` on cost-2 top card → drawn (boundary: equal to magnitude).
10. `reveal-ko-or-draw:2` on cost-3 top card → no-op; deck unchanged; hand unchanged;
    ko unchanged.
11. `reveal-ko-or-draw` with undefined magnitude → no-op.
12. `reveal-ko-or-draw` with magnitude = 0 → no-op (≤ 0 treated as invalid).
13. `reveal-ko-or-draw` with empty deck → no-op.
14. `reveal-ko-or-draw` with missing cardStats → no-op.
15. When `moveCardFromZone` returns `found = false`: no mutation on deck, hand, or ko
    in either the KO or draw branch.
16. `node scripts/convert-cards/apply-hero-ability-markers.mjs --propose | grep "reveal-ko-or-draw\|reveal-ko"` includes exactly 2 new rows for silk and punisher.
17. `node scripts/convert-cards/apply-hero-ability-markers.mjs` reports `Updated: 2`
    on first run.
18. Second apply run: `git diff data/cards/` empty (idempotence).
19. `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0.
20. `grep "\[keyword:reveal-ko-or-draw:" data/cards/ssw2.json | wc -l` = 1.
21. `grep "\[keyword:reveal-ko\]" data/cards/dkcy.json | wc -l` = 1.
22. `assertValidToken` rejects `[keyword:reveal-ko-or-draw]` (no suffix) with
    non-zero exit and a full-sentence error message.
23. No files outside `## Files Expected to Change` were modified.
24. `DECISIONS.md` D-21801..D-21803 Active.

---

## Verification Steps

```bash
# Baseline
pnpm --filter @legendary-arena/game-engine test
# Expected: 1125 pass (record count for comparison)

git diff --name-only data/cards/ packages/game-engine/
# Expected: empty

# Confirm silk/punisher not yet marked
grep "reveal-ko-or-draw\|boom-goes-the-dynamite.*reveal\|silk-stalking.*reveal" data/cards/ssw2.json data/cards/dkcy.json
# Expected: empty

# After engine fix + new keyword:
pnpm --filter @legendary-arena/game-engine test
# Expected: exits 0; test count ≥ 1133 (1125 + 1 corrected + 7 new reveal-ko-or-draw)

# After tooling changes:
node scripts/convert-cards/apply-hero-ability-markers.mjs --propose | grep "reveal-ko-or-draw\|dkcy.*reveal-ko\|ssw2.*reveal-ko"
# Expected: 2 rows — silk (reveal-ko-or-draw:2) and punisher (reveal-ko)

# Apply
node scripts/convert-cards/apply-hero-ability-markers.mjs
# Expected: Updated: 2

# Idempotence
node scripts/convert-cards/apply-hero-ability-markers.mjs
git diff data/cards/
# Expected: no output

# Validate
node scripts/convert-cards/apply-hero-ability-markers.mjs --validate
# Expected: exits 0

# Token counts
grep "\[keyword:reveal-ko-or-draw:" data/cards/ssw2.json | wc -l  # Expected: 1
grep "\[keyword:reveal-ko\]" data/cards/dkcy.json | wc -l          # Expected: 1

# Build
pnpm -r build
# Expected: exits 0
```

---

## Definition of Done

- [ ] All Acceptance Criteria above are met.
- [ ] `reveal-ko` executor: `moveCardFromZone` + `koCard` coupling enforced (no
      mutation on `!moveResult.found`); test 20 asserts empty deck after KO fires.
- [ ] `'reveal-ko-or-draw'` in `HeroKeyword` union + `HERO_KEYWORDS` array.
- [ ] `reveal-ko-or-draw` executor case in `heroEffects.execute.ts` with `// why: D-21802`.
- [ ] KO branch (`cost === 0`) structurally precedes draw branch (`else if`).
- [ ] Magnitude gate: integer ≥ 1; magnitude ≤ 0 treated same as undefined (skip).
- [ ] Drift-detection test updated to 11 keywords.
- [ ] 7 new test cases covering all branches including magnitude-0 no-op and
      KO-takes-precedence-over-draw.
- [ ] `VALID_TOKEN_PATTERN` accepts `[keyword:reveal-ko-or-draw:N]`.
- [ ] `isRevealKoCandidate` uses regex for zero-cost form detection (covers plain +
      `[icon:vp]` variants).
- [ ] `isRevealKoOrDrawCandidate` + `suggestRevealKoOrDrawToken` added; suggestion
      returns `null` on regex failure.
- [ ] `isRevealKoOrDrawCandidate` and `isRevealKoCandidate` are mutually exclusive
      by construction (not ordering alone).
- [ ] `collectProposeRowsForSet` evaluates compound before plain KO candidate.
- [ ] `hero-ability-markers.json` has 2 new entries; 2 deferred block entries removed.
- [ ] `data/cards/ssw2.json` and `data/cards/dkcy.json` marked.
- [ ] `docs/ai/DECISIONS.md` D-21801..D-21803 Active.
- [ ] `docs/ai/STATUS.md`, `WORK_INDEX.md`, `EC_INDEX.md` updated.
- [ ] No files outside §Files Expected to Change were modified.

---

## Pre-Flight Report

**Target WP:** WP-218
**EC:** EC-250
**Pre-Flight Date:** 2026-06-05
**Class:** Behavior / State Mutation (mutates `G.ko`, `playerZones.deck`, `playerZones.hand`)

### Vision Sanity Check

- **Vision clauses touched:** §22 Deterministic Eval (executor uses `G.cardStats[topCardId].cost` — deterministic lookup, no randomness introduced)
- **Conflict assertion:** No conflict: this WP preserves all touched clauses.
- **Non-Goal proximity:** N/A — WP touches no monetization or competitive surface.
- **Determinism preservation:** Confirmed. All cost comparisons read `G.cardStats[topCardId].cost` (setup-time resolved integer). No `Math.random`, `Date.now`, or `ctx.random.*` introduced. No new randomness.
- **`## Vision Alignment` block:** N/A — `00.3 §17.1` triggers do not apply (no monetization, leaderboard, or identity surface).

### Dependency & Sequencing Check

| WP | Status | Notes |
|---|---|---|
| WP-217 | ✅ Done 2026-06-05 | commit `159d606`; `reveal-ko`, `reveal-min`, `KEYWORD_PATTERN`, `VALID_TOKEN_PATTERN` all landed |

### Dependency Contract Verification

- [x] `koCard(G.ko, topCardId)` — exported from `board/ko.logic.ts`; WP-217 used it at this call site ✅
- [x] `moveCardFromZone(from, to, cardId)` — pure helper in `zoneOps.ts`; returns `{from, to, found}` ✅
- [x] `G.cardStats[topCardId].cost` — `CardStatEntry.cost: number`; accessed in `reveal-ko` and `reveal-min` (WP-217) ✅
- [x] `HERO_KEYWORDS` array + `HeroKeyword` union — exists in `heroKeywords.ts`; WP-217 extended both ✅
- [x] `isValidMagnitude` — used in `reveal-min` case (WP-215); function exists and is in scope ✅
- [x] `MVP_KEYWORDS` Set — in `heroEffects.execute.ts`; WP-217 extended it ✅
- [x] `apply-hero-ability-markers.mjs` — `isRevealKoCandidate`, `isRevealMinCandidate` exist (WP-217); extension points established ✅
- [x] Card data files `data/cards/ssw2.json`, `data/cards/dkcy.json` — exist on disk ✅

### Structural Readiness

All 8 source files in §Files Expected to Change exist on disk. No new directories created.
The `[]`-as-discard-destination pattern is established by the existing `'ko'` case — no new pattern introduced.
`VALID_TOKEN_PATTERN` structure is established by WP-216 + WP-217; extension is additive-only.

### Mutation Boundary Confirmation

- Zones mutated: `playerZones.deck` (removed), `G.ko` (added) — KO branch; `playerZones.deck` (removed), `playerZones.hand` (added) — draw branch
- Mutation only when `moveResult.found === true`
- No mutations to `G.piles`, `G.villainDeck`, `G.counters`, `G.hookRegistry`, or any other player's zones
- `G.cardStats` is read-only (setup-time populated, never written by executors)
- No new `G` fields introduced

### Scope Lock

12 files + EC + this report. Git allowlist is closed. Any file not in §Files Expected to Change is forbidden. `git diff --name-only` checked after completion.

### Test Expectations

| Suite | Before | Expected After | Delta |
|---|---|---|---|
| `game-engine` | 1125 | ≥ 1133 | +8 (1 corrected assertion in test 20; 7 new `reveal-ko-or-draw` cases; 1 magnitude-0 case = 8 total new cases) |

Drift-detection test: expects exactly **11** keywords (was 10).

### Risk Review

- Detection regex `/costs\s+0(?:\[icon:vp\])?,\s*KO it/i` — low risk; tested against known corpus. Only punisher has the `[icon:vp]` form.
- `suggestRevealKoOrDrawToken` null-return path — documented; `collectProposeRowsForSet` must guard. Risk is low: `--propose` output is human-reviewed before entries are added to the curated map.
- Zone integrity fix (D-21801) — high value; risk of test-count regression from corrected test 20 is by design.
- `isRevealKoOrDrawCandidate` + `isRevealKoCandidate` mutual exclusivity — structural (not ordering-based). Verified in §Contract.

### Verdict

**READY TO EXECUTE**

All dependencies met. Scope locked. Contract verified. Test delta quantified. No blocking risks.

---

## Copilot Check

**Date:** 2026-06-05
**Pre-flight verdict under review:** READY TO EXECUTE (2026-06-05)
**WP class:** Behavior / State Mutation — copilot check is mandatory.

### Overall Judgment

**PASS**

Pre-flight READY verdict stands. WP-218 is tightly scoped (8 source files + 4 governance), with strong structural exclusivity for detection functions and an explicit zone-integrity fix. All 30 issues scanned. One minor RISK surfaced (issue 22) and addressed in-place — no scope change required.

### Findings (non-PASS items only)

**22. [RISK] Silent failure vs loud failure** — `suggestRevealKoOrDrawToken` returns `null` on regex failure; the WP documents "callers must check for null" but the exact guard location is implicit.
FIX: EC-250 §Guardrails explicitly lists "caller must guard before emitting row." `collectProposeRowsForSet` call site must check `!== null` before pushing the suggestion into the proposal output. This is scope-neutral (no new file, no contract change). Added to Common Failure Smells in EC-250.

All other 29 issues: PASS.

Notable strong points:
- Issue 3 (Immer mutation vs pure helpers): `moveCardFromZone` returns new arrays; move mutates `G` via Immer — pattern correct.
- Issue 4 (contract drift): HERO_KEYWORDS array + HeroKeyword union updated atomically; drift-detection test asserts count.
- Issue 11 (tests validate invariants): deck-shrink + ko-grow + hand-grow + `moveResult.found=false` all covered by ACs.
- Issue 23 (deterministic ordering): KO-before-draw branch order locked in both pseudocode and contract prose.

### Mandatory Governance Follow-ups

- DECISIONS.md: D-21801, D-21802, D-21803 — drafted in this session (2026-06-05); land at execution.

### Pre-Flight Verdict Disposition

- [x] CONFIRM — Pre-flight READY TO EXECUTE verdict stands. Session prompt generation authorized.

---

## Lint Gate Self-Review

**Date:** 2026-06-05 | **Verdict: PASS** (all applicable sections resolved)

| § | Title | Result | Notes |
|---|---|---|---|
| §1 | Work Packet Structure | PASS | All 10 required sections present and non-empty |
| §2 | Non-Negotiable Constraints | PASS | No .reduce(); zoneOps helpers for deck removal; HERO_KEYWORDS parity; ESM/Node v22; no @legendary-arena imports in tooling |
| §3 | Prerequisites | PASS | WP-217 listed; D-21701..D-21704 cited; baseline commit cited; zone integrity correction grounded; `[]` pattern traced to existing `'ko'` case |
| §4 | Context References | PASS | 9 context items; `'ko'` case added as canonical coupling-pattern reference |
| §5 | Output Completeness | PASS | 12 files under §Files Expected to Change with change type |
| §6 | Naming Consistency | PASS | `reveal-ko-or-draw`, `isRevealKoOrDrawCandidate`, `suggestRevealKoOrDrawToken` consistent throughout |
| §7 | Dependency Discipline | PASS | No new npm deps; existing zoneOps helpers only |
| §8 | Architectural Boundaries | PASS | Engine changes in game-engine only; tooling in Shared Tooling; data in data/cards/ only |
| §9 | Windows Compatibility | N/A | Node built-ins only |
| §10 | Environment Variable Hygiene | N/A | No env vars touched |
| §11 | Authentication Clarity | N/A | No auth surface touched |
| §12 | Test Quality | PASS | 8 test changes (1 corrected + 7 new); branches include cost-0-not-drawn (AC-7), magnitude-0 (AC-12), moveResult.found=false (AC-15) |
| §13 | Commands and Verification | PASS | 10 explicit commands with expected output; test count delta updated to ≥ 1133 |
| §14 | Acceptance Criteria Quality | PASS | 24 items; all binary and observable; gaps from original review resolved |
| §15 | Definition of Done | PASS | All governance files listed; mutual exclusivity and magnitude-0 added |
| §16 | Code Style | PASS | `// why: D-21802` comment on new executor; full-sentence assertValidToken error; regex constants named `ZERO_COST_KO_RE`, `RANGE_DRAW_RE` |
| §17 | Vision Alignment | PASS | No conflict; determinism preserved |
| §18 | Prose-vs-Grep Discipline | N/A | No API endpoint claims |
| §19 | Bridge-vs-HEAD Staleness | PASS | Baseline commit `159d606` cited; HERO_KEYWORDS count of 10 quoted for verification |
| §20 | Funding Surface Gate | N/A | No monetization surface touched |
| §21 | API Endpoints Catalog | N/A | No HTTP endpoints changed |
