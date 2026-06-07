# WP-223 — Hero Reveal KO-Attack Compound Executor (Engine + Data)

**Status:** Draft
**Primary Layer:** Game Engine + Card Data + Offline Tooling
**Dependencies:** WP-222 (baseline: `HERO_KEYWORDS` = 14, engine tests = 1170, client tests = 497)

---

## Session Context

D-21903 (WP-219) deferred three reveal patterns requiring infrastructure not yet present.
WP-220 closed item 1 (`reveal-attack-choose` — player-choice executor + `G.pendingHeroChoice`).
WP-222 delivered the client UX for pending choices. D-21903 item 2 remains open:

> `ssw2/dr-punisher-soldier-supreme/youre-a-slow-learner`:
> `[hc:tech]: Reveal the top card of your deck. If it costs 0, KO it and you get +1[icon:attack].`
>
> Deferred in WP-219 as "KO + attack compound reveal — multi-branch."

The card is a **compound conditional**: when `deck[0].cost === 0`, **both** effects fire together —
KO the card AND grant a fixed +1 attack. When cost > 0, neither effect fires; the card returns
to the top of the deck implicitly (no zone mutation — standard Legendary "reveal and return" default).

**There is no player choice.** `G.pendingHeroChoice` is not involved. This is a
fully synchronous executor, structurally simpler than `reveal-attack-choose`.

Corpus sweep confirms one candidate across all 40 sets: the ssw2 card above.

This pattern is distinct from all existing reveal keywords:

| Keyword | Condition | Effects |
|---|---|---|
| `reveal-ko` | cost = 0 | KO card |
| `reveal-ko-or-draw:N` | cost = 0 OR cost ≤ N | KO (cost=0) or draw (cost≤N) |
| `reveal-attack-choose:N` | always | conditional attack grant + player choice (discard/return) |
| **`reveal-ko-attack:N`** (this WP) | cost = 0 | KO card AND grant +N fixed attack |

The magnitude N encodes the **fixed attack grant amount** (1 for the ssw2 card) —
not a cost ceiling and not the revealed card's cost.

---

## Goal

After this packet:

- `'reveal-ko-attack'` exists in `HeroKeyword` and `HERO_KEYWORDS`. Drift-detection test pins at **15**.
- The executor fires synchronously: if `deck[0].cost === 0`, moves the card to the KO pile
  via `moveCardFromZone` and grants `G.turnEconomy.attack += effect.magnitude`.
  If cost > 0, no zone mutation — card stays at `deck[0]`.
- `G.pendingHeroChoice` is NOT set or cleared by this executor.
- `apply-hero-ability-markers.mjs` gains `isRevealKoAttackCandidate` + `suggestRevealKoAttackToken`.
  The reveal anchor (`/Reveal the top card of your deck\./i`) is required before matching.
- `ssw2/dr-punisher-soldier-supreme/youre-a-slow-learner` is marked `[keyword:reveal-ko-attack:1]`.
- D-21903 item 2 is closed. Item 3 (villain odd-draw / Poison Scarlet Witch) remains deferred.

---

## Assumes

- WP-222 shipped: `HERO_KEYWORDS` = 14, engine tests = 1170, client tests = 497.
- `moveCardFromZone(deck, koPile, topCardId)` correctly handles the KO branch
  (same call as the `reveal-ko` and `reveal-ko-or-draw` executors — no new zone helper needed).
- `G.cardStats[topCardId].cost` is available at executor time (same guarantee as WP-219/220).
- `G.turnEconomy` may be `undefined`; the executor must guard before mutating it.
- Corpus sweep (already run): one candidate across all 40 sets. No additional data files modified
  unless the sweep run at execution time turns up a new candidate.
- `KEYWORD_PATTERN` already allows hyphens (WP-217); `reveal-ko-attack` is valid.
- `NO_MAGNITUDE_KEYWORDS` already exists (WP-219); `reveal-ko-attack` must NOT appear in it.

---

## Non-Negotiable Constraints

### Engine
- No `.reduce()` in zone operations or effect application.
- Zone mutations via `zoneOps.ts` helpers only.
- Executor is fully synchronous. `G.pendingHeroChoice` is NOT touched.
- Silent no-op conditions (no throw, no log): empty deck, missing `playerZones`, missing `cardStats`
  for the top card, `G.turnEconomy` undefined, invalid or absent magnitude.
- Magnitude is required: `[keyword:reveal-ko-attack]` (no magnitude) and `[keyword:reveal-ko-attack:0]`
  (zero threshold) are invalid — `assertValidToken` must reject both.
- `HERO_KEYWORDS` canonical array and `HeroKeyword` union must stay in parity.
  Drift-detection test asserts count = 15 after this packet.
- `// why:` comment required on any `ctx.events.setPhase()` or `ctx.events.endTurn()` call
  (none expected in this WP; listed for completeness).

### Tooling (offline, `scripts/convert-cards/`)
- ESM-only, Node v22+. No `@legendary-arena/*` imports.
- Reveal anchor required in all detection functions: `/Reveal the top card of your deck\./i`.
- KO-attack compound detection: `/If it costs 0, KO it and you get \+(\d+)\[icon:attack\]/i`
  (capture group gives magnitude).
- Run `--propose` before editing `hero-ability-markers.json`. Never skip.
- Route `isRevealKoAttackCandidate` AFTER `isRevealKoOrDrawCandidate` (the more specific
  ko-or-draw pattern must have first-match priority).

### Data
- Surgical token appends to `data/cards/*.json` — no structural changes.

---

## Locked Contract Values

| Value | Form |
|---|---|
| Keyword string | `'reveal-ko-attack'` (exact) |
| Token form | `[keyword:reveal-ko-attack:N]` — magnitude required, bare form invalid |
| Magnitude semantics | Fixed attack grant amount; not a cost ceiling, not the card's cost |
| Trigger condition | `deck[0].cost === 0` (strict equality) |
| Effects when condition met | (1) `moveCardFromZone(deck, koPile, topCardId)` then (2) `G.turnEconomy.attack += effect.magnitude` |
| Effect when condition NOT met | No mutation; card remains at `deck[0]` |
| Pending choice | `G.pendingHeroChoice` — NOT touched |
| In-scope card | `ssw2/dr-punisher-soldier-supreme/youre-a-slow-learner` → `[keyword:reveal-ko-attack:1]` |
| `HERO_KEYWORDS` count after | 15 |
| Engine test baseline | 1170 (WP-222) |
| Engine test floor after | ≥ 1175 |

---

## Scope (In)

- `'reveal-ko-attack'` added to `HeroKeyword` union and `HERO_KEYWORDS` array (`heroKeywords.ts`)
- New executor case in `heroEffects.execute.ts` under `'reveal-ko-attack'`
- Drift-detection test update: `HERO_KEYWORDS.length === 15`
- ≥ 5 new executor tests in `heroEffects.execute.test.ts` (or `heroAbility.setup.test.ts`)
- `isRevealKoAttackCandidate` + `suggestRevealKoAttackToken` in `apply-hero-ability-markers.mjs`
- `inputs/hero-ability-markers.json` updated with new detection entry
- `data/cards/ssw2.json` — `youre-a-slow-learner` marked `[keyword:reveal-ko-attack:1]`
- Any additional corpus candidates if the `--propose` sweep finds them

## Out of Scope

- D-21903 item 3 (villain odd-draw / Poison Scarlet Witch) — villain pipeline, separate WP
- Client changes — no new UI state, no `pendingHeroChoice`, no component changes
- `G.pendingHeroChoice` infrastructure — WP-220 owns it; not touched here
- `reveal-ko-attack` without a player-choice variant — the fixed-compound model covers the ssw2 card exactly; if a future card adds "...and choose to discard or put it back" that is a new keyword

---

## Implementation Steps

1. Add `'reveal-ko-attack'` to `HeroKeyword` union in `heroKeywords.ts` and `HERO_KEYWORDS` array.
   Confirm it is NOT in `NO_MAGNITUDE_KEYWORDS`.
2. Add the executor case in `heroEffects.execute.ts`:
   ```
   case 'reveal-ko-attack': {
     // Peek deck top; silent no-op if deck empty, cardStats missing, or turnEconomy missing.
     // If deck[0].cost === 0:
     //   moveCardFromZone(playerZones.deck, playerZones.koPile, topCardId)
     //   G.turnEconomy.attack += effect.magnitude
     // else: no mutation (card stays at deck[0])
   }
   ```
3. Update the drift-detection test to assert `HERO_KEYWORDS.length === 15`.
4. Write executor tests (≥ 5):
   - KOs card and grants attack when cost = 0
   - No zone mutation when cost > 0 (card stays at deck[0])
   - Silent no-op: empty deck
   - Silent no-op: missing `cardStats` for top card
   - Silent no-op: `G.turnEconomy` undefined
5. Add `isRevealKoAttackCandidate` + `suggestRevealKoAttackToken` to `apply-hero-ability-markers.mjs`.
   Route after `isRevealKoOrDrawCandidate`.
6. Run `--propose` on ssw2 to validate detection picks up `youre-a-slow-learner`. Fix detection if needed.
7. Run `--propose` across all sets. Mark any additional candidates found.
8. Apply `[keyword:reveal-ko-attack:1]` token to `ssw2.json` for `youre-a-slow-learner`.
9. Update `inputs/hero-ability-markers.json`.

---

## Decisions to Record

### D-22301 — `reveal-ko-attack` HeroKeyword + Executor Contract (WP-223)

**Decision:** A new `reveal-ko-attack` HeroKeyword and executor are added (`HERO_KEYWORDS` 14 → 15).
The executor peeks `playerZones.deck[0]`; if `cost === 0` (strict equality), it (1) moves the
card to the KO pile via `moveCardFromZone` and (2) grants `G.turnEconomy.attack += effect.magnitude`.
If cost > 0, no zone mutation — card stays at `deck[0]`. Magnitude encodes the fixed attack grant
amount (`assertValidToken` rejects bare and zero-magnitude forms). `G.pendingHeroChoice` is NOT
set or cleared. Closes D-21903 item 2. In-scope card: `ssw2/dr-punisher-soldier-supreme/youre-a-slow-learner`,
magnitude 1.

**Rationale:** The "KO it and you get +N attack" compound is a synchronous two-effect executor
with a cost=0 condition. It does not require player-choice routing (`reveal-attack-choose`
infrastructure) because the outcome is deterministic: both effects fire, or neither fires — no
decision is delegated to the player. Magnitude encodes the fixed attack grant (not the revealed
card's cost, unlike `reveal-cost-attack`) because the printed text says "+1[icon:attack]" literally.

**Packet:** WP-223 / EC-255.
**Drafted:** 2026-06-07. **Landed:** (pending execution).
**Status:** Drafted

---

## Definition of Done

- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0, count ≥ **1175**
- [ ] `HERO_KEYWORDS` drift-detection test asserts count = **15**
- [ ] `apply-hero-ability-markers.mjs --propose` exits 0, no unexpected warnings
- [ ] `ssw2/dr-punisher-soldier-supreme/youre-a-slow-learner` carries `[keyword:reveal-ko-attack:1]`
      in `data/cards/ssw2.json`
- [ ] `pnpm -r build` exits 0
- [ ] D-22301 Active in DECISIONS.md with Landed date
- [ ] WORK_INDEX.md WP-223 → `[x]` Done with date + test count
- [ ] EC_INDEX.md EC-255 → Done
- [ ] STATUS.md updated with WP-223 entry

---

## Commit Topology

**Commit 1 — Engine + Tooling + Data:**
`EC-255: reveal-ko-attack executor + ssw2 corpus markup`
Files: `packages/game-engine/src/rules/heroKeywords.ts`,
`packages/game-engine/src/hero/heroEffects.execute.ts`,
`packages/game-engine/src/hero/heroEffects.execute.test.ts`,
`packages/game-engine/src/rules/heroAbility.setup.test.ts` (drift pin update),
`scripts/convert-cards/apply-hero-ability-markers.mjs`,
`scripts/convert-cards/inputs/hero-ability-markers.json`,
`data/cards/ssw2.json`
(+ any additional `data/cards/*.json` if the `--propose` sweep finds further candidates)

**Commit 2 — Governance:**
`SPEC: governance close for WP-223 / EC-255`
Files: `docs/ai/DECISIONS.md`, `docs/ai/STATUS.md`,
`docs/ai/work-packets/WORK_INDEX.md`, `docs/ai/execution-checklists/EC_INDEX.md`
