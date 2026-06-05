# WP-215 — Hero Rescue and Reveal-Draw Effects (Engine + Data)

**Status:** Draft
**Primary Layer:** Game Engine + Card Data
**Dependencies:** WP-021 (hero ability hook contracts), WP-022 (hero effects executor MVP), WP-023 (condition evaluation)

---

## Session Context

> WP-022 wired the hero effects executor with four MVP keywords: `draw`,
> `attack`, `recruit`, and `ko`. The remaining four keywords — `rescue`,
> `wound`, `reveal`, and `conditional` — were explicitly deferred.
>
> `rescue` and `reveal` are now blocking real card effects. Web-Shooters
> (Core Set Spider-Man Uncommon) has two ability lines: "Rescue a Bystander."
> and "Reveal the top card of your deck. If that card costs 2 or less, draw
> it." Neither fires today — not because the executor skips them, but because
> the setup parser never produces hooks with effects for those lines. The
> ability text contains no recognized markup, so `parseAbilityText()` returns
> empty `effects` arrays and `executeHeroEffects` exits early on every play.
>
> Two changes are needed: add markup to the card data so hooks are built with
> effects, and implement the effect cases in the executor. Both changes are
> engine-only plus one JSON edit — no schema changes, no new G fields, no new
> types.

---

## Goal

After this packet, playing Web-Shooters fires both card text effects:

1. **Rescue**: N bystanders move from `G.piles.bystanders` to the player's
   `G.playerZones[playerID].victory` zone. Empty supply is a silent no-op.

2. **Reveal-draw**: The top card of the player's deck is peeked; if its cost
   in `G.cardStats` is ≤ the encoded threshold, it moves to hand. Empty deck
   or missing stats entry are silent no-ops.

The `[keyword:X:N]` markup syntax is introduced — an optional `:N` magnitude
suffix on existing keyword markup that `parseAbilityText()` extracts and
stores on `HeroEffectDescriptor.magnitude`. Web-Shooters card data in
`data/cards/core.json` receives the appropriate markup on both ability lines.

`parseAbilityText()` also gains icon-adjacent magnitude extraction: the regex
patterns `/\+?(\d+)\s*\[icon:(attack|recruit)\]/g` and
`/(\d+)\s*\[icon:vp\]\s*or less/` are matched against each ability line. When
found, they auto-populate `HeroEffectDescriptor.magnitude` for `attack`,
`recruit`, and `reveal` descriptors — without requiring manual `[keyword:X:N]`
per-card markup on every hero card in the corpus. For Web-Shooters
specifically, the `2[icon:vp]` already in line 2 supplies the reveal cost
threshold, so `[keyword:reveal]` (no `:2` suffix) is sufficient markup.

---

## Assumes

- WP-022 shipped: `heroEffects.execute.ts` exists with `MVP_KEYWORDS`, `drawFromPlayerDeck`, `executeSingleEffect`. `rescue` and `reveal` are in the deferred set.
- WP-023 shipped: `heroConditions.evaluate.ts` exists. `evaluateAllConditions` is called before effect dispatch.
- `heroAbility.setup.ts` exists with `parseAbilityText()` and `KEYWORD_PATTERN`.
- `data/cards/core.json` is in-repo at `data/cards/core.json` and the Web-Shooters card entry exists with its two NL ability lines.
- `G.piles.bystanders` is a `CardExtId[]` (top-of-pile = index 0 convention).
- `G.cardStats` is keyed by `CardExtId` with `cost: number` on each entry. SHIELD starter cards (agent, trooper, officer, sidekick) are **not** in `G.cardStats` — their cost is unknown at runtime.

---

## Context (Read First)

1. `packages/game-engine/src/hero/heroEffects.execute.ts` — `MVP_KEYWORDS`, `executeSingleEffect`, `drawFromPlayerDeck`
2. `packages/game-engine/src/setup/heroAbility.setup.ts` — `KEYWORD_PATTERN`, `parseAbilityText()`, effect-descriptor builder (lines 231–236)
3. `packages/game-engine/src/rules/heroAbility.types.ts` — `HeroEffectDescriptor` (`type`, `magnitude?`)
4. `packages/game-engine/src/economy/economy.types.ts` — `CardStatEntry` (`cost: number`)
5. `packages/game-engine/src/state/zones.types.ts` — `GlobalPiles.bystanders`
6. `data/cards/core.json` Web-Shooters entry (search slug `web-shooters` under `heroes`)
7. `docs/ai/ARCHITECTURE.md` — Layer Boundary (Authoritative): Game Engine layer rules; import rules for `packages/game-engine`
8. `docs/ai/DECISIONS.md` — scan for D-215xx entries (D-21501..D-21505 are reserved by this WP; confirm none yet active)
9. `docs/ai/REFERENCE/00.6-code-style.md` — human-style code guide; enforced on all files produced by this WP

---

## Scope (In)

- Extend `KEYWORD_PATTERN` in `heroAbility.setup.ts` to optionally capture `:N` magnitude suffix.
- Set `magnitude` on `HeroEffectDescriptor` when a valid magnitude is captured.
- Add `rescue` and `reveal` to `MVP_KEYWORDS` in `heroEffects.execute.ts` and implement both `case` branches.
- Update the `MVP_KEYWORDS` comment to remove `rescue` and `reveal` from the deferred list.
- Add `[keyword:rescue:1]` markup to Web-Shooters ability line 1 in `data/cards/core.json`.
- Add `[keyword:reveal]` markup (no `:2` suffix) to Web-Shooters ability line 2 in `data/cards/core.json` — the `2[icon:vp]` already in the line supplies the threshold via icon-magnitude extraction.
- Add icon-adjacent magnitude extraction to `parseAbilityText()`: pattern `/\+?(\d+)\s*\[icon:(attack|recruit)\]/g` sets `magnitude` on `attack`/`recruit` effect descriptors from existing markup, eliminating per-card `[keyword:attack:N]` manual additions.
- Add VP-cost-threshold extraction to `parseAbilityText()`: pattern `/(\d+)\s*\[icon:vp\]\s*or less/` (non-global, first match) extracts the cost threshold and sets `magnitude` on the `reveal` effect descriptor in the same ability line.
- Tests: update the "unsupported keyword skipped" test that currently uses `rescue` to use `wound` instead; add ≥ 8 net-new tests covering rescue (success, empty pile) and reveal (draw, no-draw, empty deck, missing stats) and markup magnitude extraction; add ≥ 2 new tests for icon-adjacent magnitude extraction (attack/recruit icon patterns).

---

## Out of Scope

- `wound` and `conditional` keywords remain deferred — no implementation in this packet.
- Other hero cards with `rescue` or `reveal` ability text (other sets) — card data markup is Web-Shooters Core Set only in v1.
- Adding SHIELD starter cards to `G.cardStats` — reveal will no-op on those cards per D-21502; that gap is a separate future WP.
- Changes to `HeroEffectDescriptor`, `HeroCondition`, `HeroAbilityHook` type shapes — additive markup only.
- Any arena-client or UIState changes — effects fire silently; the client observes the resulting zone state changes.
- `heroConditions.evaluate.ts` or the conditions evaluation path — no changes.

---

## Files Expected to Change

1. `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — extend `KEYWORD_PATTERN` + magnitude extraction in `parseAbilityText()` (both `[keyword:X:N]` markup and icon-adjacent magnitude patterns)
2. `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — add `rescue` and `reveal` to `MVP_KEYWORDS`; implement both cases in `executeSingleEffect`
3. `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — update rescue-as-unsupported test; add ≥ 8 new tests
4. `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — add ≥ 3 tests for `[keyword:X:N]` magnitude extraction
5. `data/cards/core.json` — **modified** — add markup to both Web-Shooters ability lines

Governance (not counted in engine file allowlist):
6. `docs/ai/work-packets/WP-215-hero-rescue-and-reveal-draw-effects.md` — **modified**
7. `docs/ai/execution-checklists/EC-247-hero-rescue-and-reveal-draw-effects.checklist.md` — **modified**
8. `docs/ai/DECISIONS.md` — **modified** — D-21501..D-21505
9. `docs/ai/work-packets/WORK_INDEX.md` — **modified**

---

## Non-Negotiable Constraints

### Engine-Wide
- **Full file contents required** for every modified file — no diffs, snippets, or "show only the changed section."
- **ESM only, Node v22+** — no CommonJS, no `require()`, no `node-fetch`, no Jest/Vitest.
- **Human-style code** per `docs/ai/REFERENCE/00.6-code-style.md` — readable, explicit, junior-maintainable. Full JSDoc on every new function.
- No `Math.random()`, no `Date.now()`, no I/O inside moves or effects.
- No `.reduce()` in zone operations or effect application.
- Moves never throw; `executeSingleEffect` continues silently on unsupported/invalid cases.
- All zone mutations assign new arrays (Immer draft pattern) — never in-place push/splice on `G` fields.
- No `boardgame.io` import in `heroEffects.execute.ts` (already holds).
- Every `// why:` comment location specified below must be present verbatim.

### Packet-Specific

**`rescue` effect (D-21501):**
- `rescue` is exempt from the `isValidMagnitude` pre-check (same treatment as `ko`). The rescue `case` handles `undefined` internally via `effect.magnitude ?? 1`.
- Magnitude is read from `effect.magnitude`; if `undefined`, default to `1`.
- Empty `G.piles.bystanders` is a silent no-op — no error, no message.
- Rescue `min(magnitude, G.piles.bystanders.length)` bystanders — loop exits early when pile is exhausted; never throws on under-supply.
- Bystanders move to `G.playerZones[playerID].victory` (not hand, not discard).
- Top-of-pile convention: `G.piles.bystanders[0]` is the top card (same as `attachBystanderToVillain`).

**`reveal` conditional-draw effect (D-21502):**
- No reshuffle occurs before reveal — if `deck.length === 0`, effect is a no-op.
- `G.cardStats[topCardId]` undefined → no-op (safe skip, not a draw).
- Cost check: `cardStats.cost <= effect.magnitude`; if true, move `deck[0]` to hand via `moveCardFromZone`.
- If cost > threshold: card stays on deck (`deck[0]` is unchanged).
- `effect.magnitude` must pass `isValidMagnitude` for the reveal effect to execute; if not valid, skip.

**Markup magnitude syntax (D-21503):**
- New `KEYWORD_MAGNITUDE_PATTERN`: matches `[keyword:X:N]` where N is one or more digits.
- Existing `[keyword:X]` without `:N` remains valid and produces `magnitude: undefined` on the descriptor.
- Non-integer or negative N is rejected; only valid integer strings (`/^\d+$/`) set magnitude.
- Magnitude extraction runs **after** keyword validation — only recognized keywords get magnitude set.
- `KEYWORD_PATTERN` is replaced (not supplemented) with the extended pattern; it remains a `const`.

**Card data (D-21504):**
- Only Web-Shooters (`slug: "web-shooters"`) in Core Set (`data/cards/core.json`) receives markup in v1.
- Ability line 1 becomes: `"Rescue a Bystander. [keyword:rescue:1]"`
- Ability line 2 becomes: `"Reveal the top card of your deck. If that card costs 2[icon:vp] or less, draw it. [keyword:reveal]"` — no `:2` suffix; threshold is extracted from `2[icon:vp]` by the VP-cost-threshold pattern.
- All other fields on the Web-Shooters card entry are byte-identical to before.
- No other card entries in any JSON file are touched.

**Icon-magnitude extraction (D-21505):**
- Pattern for attack/recruit: `/\+?(\d+)\s*\[icon:(attack|recruit)\]/g` — exact form, do not alter.
- Pattern for reveal cost threshold: `/(\d+)\s*\[icon:vp\]\s*or less/` — non-global, first match only.
- Icon-adjacent magnitude populates the same `magnitudes` map as `[keyword:X:N]` extraction; explicit `[keyword:X:N]` markup takes precedence over icon-derived magnitude for the same keyword.
- VP-cost pattern matches ONLY when `or less` follows the VP icon — do not extract bare `N[icon:vp]` (victory-points context uses the same icon with different semantics).
- If no `[icon:vp] or less` pattern is found in a `reveal` line, the descriptor gets `magnitude: undefined` and the reveal no-ops per D-21502.

**Locked comment locations:**
- In `heroEffects.execute.ts` `MVP_KEYWORDS` comment: remove `rescue` and `reveal` from the deferred list; updated comment explains `wound` and `conditional` remain deferred.
- In the `rescue` case: `// why: top-of-pile convention — pile[0] is the first available bystander (D-21501)`
- In the `reveal` case (no-reshuffle path): `// why: reveal does not trigger deck reshuffle; empty deck is a silent no-op (D-21502)`
- In the `reveal` case (missing stats path): `// why: G.cardStats has no entry for SHIELD starter cards; missing entry is a safe no-op (D-21502)`
- In `heroAbility.setup.ts` extended `KEYWORD_PATTERN` declaration: `// why: optional :N suffix carries magnitude for rescue/reveal effects (D-21503)`
- In `heroAbility.setup.ts` icon-magnitude pattern declarations: `// why: extract magnitude from icon-adjacent integers — avoids per-card manual markup (D-21505)`

---

## Vision Alignment

**Vision clauses touched:** §1 (Card Accuracy — card data edit adds markup tokens to ability text), §2 (Faithful Ruleset — rescue and reveal are printed card effects that must fire correctly).

**Conflict assertion:** No conflict: this WP preserves all touched clauses. The markup additions make card effects fire as printed — they increase rule fidelity, not reduce it. No card text is changed; only structured markup tokens are appended.

**Non-Goal proximity:** N/A — WP touches no monetization, competitive, identity, payment, cosmetics, persuasion, scarcity, leaderboard, or accessibility surface.

**Determinism preservation:** All zone mutations use existing helpers (`moveCardFromZone`). Cost lookup reads `G.cardStats` (setup-time resolved). No `Math.random()`, no `Date.now()`, no I/O. Replay-faithful: given identical setup and moves, Web-Shooters' effects produce identical zone transitions. No RNG introduced.

---

## Acceptance Criteria

1. `pnpm --filter @legendary-arena/game-engine test` exits 0 with no new failures.
2. `pnpm -r build` exits 0.
3. Playing Web-Shooters in a state with `piles.bystanders: ['b-1', 'b-2']` moves `'b-1'` to `playerZones['0'].victory` and leaves `piles.bystanders: ['b-2']`.
4. Playing Web-Shooters in a state with `piles.bystanders: []` leaves `playerZones['0'].victory` unchanged.
5. Playing a card with `{ type: 'reveal', magnitude: 2 }` and `deck: ['hero-x']` where `cardStats['hero-x'].cost === 2` draws `'hero-x'` to hand.
6. Playing a card with `{ type: 'reveal', magnitude: 2 }` and `deck: ['hero-x']` where `cardStats['hero-x'].cost === 3` leaves `deck[0]` unchanged.
7. Playing a card with `{ type: 'reveal', magnitude: 2 }` and `deck: []` leaves all zones unchanged.
8. Playing a card with `{ type: 'reveal', magnitude: 2 }` and `deck: ['starter-agent']` where `cardStats` has no entry for `'starter-agent'` leaves deck unchanged.
9. `buildHeroAbilityHooks` with ability text `'[keyword:rescue:1]'` produces a hook with `effects: [{ type: 'rescue', magnitude: 1 }]`.
10. `buildHeroAbilityHooks` with ability text `'[keyword:rescue]'` (no magnitude suffix) produces `effects: [{ type: 'rescue' }]` with `magnitude` absent.
11. `buildHeroAbilityHooks` with ability text `'Reveal the top card of your deck. If that card costs 2[icon:vp] or less, draw it. [keyword:reveal]'` produces `effects: [{ type: 'reveal', magnitude: 2 }]` — VP-cost threshold extracted from the icon, no `:2` suffix required.
12. `buildHeroAbilityHooks` with ability text `'You get +2[icon:attack].'` produces `effects: [{ type: 'attack', magnitude: 2 }]`; with `'You get +3[icon:recruit].'` produces `effects: [{ type: 'recruit', magnitude: 3 }]` — icon-adjacent magnitude extraction verified for both keywords.

---

## Verification Steps

```bash
# Engine tests pass
pnpm --filter @legendary-arena/game-engine test

# Full build clean
pnpm -r build

# Rescue markup present in card data
grep -A3 '"slug": "web-shooters"' data/cards/core.json | grep keyword:rescue

# Reveal markup present in card data
grep -A3 '"slug": "web-shooters"' data/cards/core.json | grep keyword:reveal

# MVP_KEYWORDS comment updated (wound/conditional remain deferred, rescue/reveal removed from deferred list)
grep -A3 "MVP_KEYWORDS" packages/game-engine/src/hero/heroEffects.execute.ts

# Icon-magnitude patterns present in setup
grep "icon:attack\|icon:vp" packages/game-engine/src/setup/heroAbility.setup.ts
```

---

## Definition of Done

- [ ] All Acceptance Criteria above are met.
- [ ] `docs/ai/DECISIONS.md` updated with D-21501..D-21505.
- [ ] `docs/ai/STATUS.md` updated.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` row flipped to `[x]` with completion date.
- [ ] No console errors or skipped tests introduced.
- [ ] No files outside `## Files Expected to Change` were modified.
- [ ] EC-247 checklist satisfied line-by-line.

---

## Lint Gate Self-Review

**Date:** 2026-06-05 | **Verdict: PASS** (all 21 sections resolved)

| § | Title | Result | Notes |
|---|---|---|---|
| §1 | Work Packet Structure | PASS | All 10 required sections present and non-empty |
| §2 | Non-Negotiable Constraints | PASS | Engine-wide block includes full-file-contents rule, ESM/Node v22, 00.6 reference |
| §3 | Prerequisites | PASS | WP-021/022/023 listed with required exports |
| §4 | Context References | PASS | 00.6, ARCHITECTURE.md, DECISIONS.md added |
| §5 | Output Completeness | PASS | All 5 engine files marked `— modified`; no ambiguous patch language |
| §6 | Naming Consistency | PASS | `CardExtId`, `G.piles.bystanders`, `G.playerZones[playerID].victory`, `G.cardStats` all match 00.2 / code conventions |
| §7 | Dependency Discipline | PASS | No new npm deps; no forbidden packages |
| §8 | Architectural Boundaries | PASS | Engine-only; no boardgame.io in pure helpers; no DB/server/frontend cross |
| §9 | Windows Compatibility | N/A | No shell scripts; verification steps use grep (project-wide convention, not a new script) |
| §10 | Environment Variable Hygiene | N/A | No env vars touched |
| §11 | Authentication Clarity | N/A | No auth surface touched |
| §12 | Test Quality | PASS | `node:test` required; no boardgame.io imports in tests; no network/DB; tests use existing `makeTestState()` helper pattern |
| §13 | Commands and Verification | PASS | All commands use `pnpm`; exact, no vague steps |
| §14 | Acceptance Criteria Quality | PASS | 12 items (AC 1–12); all binary and observable |
| §15 | Definition of Done | PASS | STATUS.md, DECISIONS.md, WORK_INDEX.md, scope-boundary check all present |
| §16 | Code Style | PASS | 00.6 referenced in Non-Negotiable; no `.reduce()`, Immer pattern, `// why:` comments required |
| §17 | Vision Alignment | PASS | `## Vision Alignment` block present; §1 + §2 touched; no conflict; N/A for NG-1..7 and determinism |
| §18 | (not applicable) | N/A | |
| §19 | (not applicable) | N/A | |
| §20 | Funding Surface Gate | N/A | No monetization, payment, competitive, or persuasion surface touched |
| §21 | API Endpoints Catalog | N/A | No HTTP endpoints added, modified, or removed |
