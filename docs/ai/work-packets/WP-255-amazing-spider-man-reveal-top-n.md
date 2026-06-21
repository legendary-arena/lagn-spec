# WP-255 — "The Amazing Spider-Man" Reveal-Top-N (First Visible Win; Cashes In the WP-253 Reveal Factory)

**Status:** Ready
**Primary Layer:** Game Engine / Implementation + Card Data
**Dependencies:** WP-253 (reveal branch-list + parameterized grammar + `revealCount` loop), WP-251 (`HERO_EFFECT_HANDLERS`), WP-222 (the `discard-or-return` choice UI — not used here but the reveal family it serves), WP-215 (VP-cost reveal precedent)
**User-Visible Surface:** play.legendary-arena.com

> First WP authored under D-24026. This is the deliberate "cash in the factory"
> win after WP-250..253 shipped invisible infrastructure: it uses the WP-253
> parameterized reveal vocabulary + implements the one piece WP-253 deferred
> (multi-peek that advances past non-drawn cards) so the game's marquee hero card
> finally does something a player can see.

---

## Session Context

WP-253 collapsed the 8 `reveal-*` hero keywords into ONE parameterized `reveal`
handler consuming a `RevealRule {predicate, actions[], continue?}` branch-list, and
implemented a `revealCount` loop seeded/tested at count=1 — explicitly **deferring**
the count>1 case where a non-deck-mutating peek would re-read the same `deck[0]`.
This packet implements that deferred multi-peek (advance past cards left on the
deck) and marks one flagship card with it. It **rewrites WP-253's reveal peek-loop
body** (not a purely additive change); count=1 byte-identity is preserved by
construction, verified by leaving the WP-253 reveal tests untouched.

---

## Goal

After this packet, the hero reveal handler supports **revealing the top N distinct
cards** of a player's deck (not just one), drawing the ones a rule matches and
leaving the rest in place — and Spider-Man's signature core card **"The Amazing
Spider-Man"** is marked to use it. Concretely: `heroEffects.execute.ts`'s reveal
peek loop advances a peek offset past any card a rule leaves on the deck; the setup
parser gains a `revealCount` marker; and `data/cards/core.json` marks the card so it
parses to `{ type: 'reveal', revealCount: 3, revealRules: [{ cost-lte 2 → draw }] }`.

---

## User-Visible Impact

A **player** on play.legendary-arena.com who plays **"The Amazing Spider-Man"** now
sees the top **three** cards of their deck revealed, with every revealed card
costing **2 or less drawn into their hand** and the rest left on top — instead of
the card doing **nothing** (it is dark today: it parses to `effects: []`). This is
the first hero card to visibly light up using the WP-253 reveal vocabulary plus the
multi-peek it enabled. The win is a concrete, recognizable in-match moment, not an
internal refactor.

---

## Assumes

- WP-253 complete. Specifically:
  - `packages/game-engine/src/rules/revealRule.ts` exports `RevealRule`,
    `REVEAL_PREDICATE_KINDS`, `REVEAL_ACTION_KINDS`, `revealRulesForLegacyKeyword`
  - `packages/game-engine/src/hero/heroEffects.execute.ts` has the single
    `heroEffectReveal` handler with a `revealCount` peek loop (count=1 today)
  - `packages/game-engine/src/setup/heroAbility.setup.ts` has `REVEAL_RULE_PATTERN`
    and emits `{ type: 'reveal', revealCount, revealRules }` descriptors
  - `HeroEffectDescriptor` carries optional `revealCount?` / `revealRules?`
- `pnpm --filter @legendary-arena/game-engine build` exits 0
- `pnpm --filter @legendary-arena/game-engine test` exits 0 (1359 baseline)
- `pnpm sim:coverage --check` OK
- `data/cards/core.json` has hero `spider-man`, card `the-amazing-spider-man`, with
  the single dark ability line "Reveal the top three cards of your deck. Put any
  that cost 2[icon:vp] or less into your hand. Put the rest back in any order."

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §The Rule Execution Pipeline` — the data-only-in-`G`,
  functions-outside-`G`, never-throw, no-`.reduce()` posture the reveal handler obeys.
- `packages/game-engine/src/hero/heroEffects.execute.ts` — read the `heroEffectReveal`
  handler + its peek loop + `applyRevealRules` / `applyRevealRuleActions` /
  `applyRevealAction` + the per-action helpers entirely. The peek-offset change lives
  in the loop; the helpers are untouched. The count=1 path must stay byte-identical.
- `packages/game-engine/src/setup/heroAbility.setup.ts` — read `REVEAL_RULE_PATTERN`,
  the Step 2f parameterized-reveal extraction, and the effect-building loop's reveal
  branch. The `revealCount` marker plugs in here.
- `packages/game-engine/src/rules/revealRule.ts` — the predicate/action contracts +
  `revealRulesForLegacyKeyword`; no change expected, read for the `RevealRule` shape.
- `docs/ai/DECISIONS.md` D-24024 — the WP-253 reveal-collapse decision (the count>1
  deferral is recorded there); D-24026 — the User-Visible Surface / live-verification gate.
- `data/cards/core.json` — the `the-amazing-spider-man` entry; confirm the exact
  ability string before marking it (field names per `00.2`).

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only
- Never throw inside boardgame.io move functions / effect execution — warn to `G.messages` + continue
- Never persist `G`, `ctx`, or any runtime state; `G` stays JSON-serializable
- ESM only, Node v22+; `node:` prefix on built-ins; `.test.ts` only
- No `.reduce()` in the reveal loop or helpers — explicit `for`/`for...of`
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- **The count=1 reveal path is BYTE-IDENTICAL.** All 8 legacy reveal keywords + the
  WP-253 count=2 deck-mutating test must pass unchanged. The peek-offset only changes
  behavior at count>1 when a rule leaves a card on the deck.
- The peek loop reads `deck[peekOffset]`, re-reading the live deck each iteration
  (a draw/ko shifts the array so the next card slides into the same index → offset
  does NOT advance; a non-mutating iteration leaves the card → offset advances by 1).
- `revealCount` is a positive integer ≥ 1; absent marker ⇒ default 1 (unchanged).
- **`HeroEffectDescriptor` is additive-only** — `revealCount?` already exists (WP-253);
  do NOT change its shape or the `RevealRule` contracts.
- Do not touch `revealRule.ts`'s predicate/action unions or drift arrays — no new kinds.

**Session protocol:**
- If the `revealCount` marker grammar in the EC is unclear, stop and ask — never invent.

---

## Debuggability & Diagnostics

- Reveal-top-N is fully reproducible given identical deck order + the card play.
- Externally observable: the revealed-and-drawn cards land in `hand`; the rest stay on
  `deck` in their existing relative order — both inspectable post-execution.
- `JSON.stringify(G)` must succeed after the effect (the descriptor is plain data).

---

## Scope (In)

### A) Engine — reveal peek-advance loop (`hero/heroEffects.execute.ts`)
- This **rewrites the existing `heroEffectReveal` peek-loop body** (the `deck[0]` /
  `peekIndex` loop from WP-253); it is not a purely additive change. Byte-identity at
  count=1 is preserved **by construction** (see below), not by leaving code untouched.
- Replace the hardcoded `deck[0]` peek with a `deck[peekOffset]` peek (`let peekOffset = 0`).
  **DUAL BOUND (pre-flight PS-2):** the loop iterates **at most `revealCount` times**
  (`peekIndex < revealCount` outer bound) AND stops early when
  `peekOffset >= playerZones.deck.length` (deck-end inner stop) — an offset-only loop
  would reveal the whole deck. Each iteration:
  - stop the whole reveal when `peekOffset >= playerZones.deck.length` (empty-deck / offset-overrun)
  - **skip-and-advance (copilot #22):** if `topCardId` is missing OR `cardStats === undefined`
    (a S.H.I.E.L.D. starter has no `G.cardStats` entry), `peekOffset++` and `continue` —
    do NOT `return`/abort the rest of the reveal. (Byte-identical at count=1: one iteration
    ⇒ the skip is the same no-op as the WP-253 `return`. At count>1 it prevents a starter
    in the top N from silently killing the reveal of the cards beneath it.)
  - capture the deck length before applying the rules
  - after `applyRevealRules`, if the deck length is **unchanged** (the card stayed),
    `peekOffset++`; if it **shrank** (draw/ko removed the peeked card), leave `peekOffset`
    (the next card slid into the same index)
- Add a `// why:` comment: count=1 is byte-identical (one iteration at offset 0; the
  skip-and-advance and the offset stop both reduce to the WP-253 no-op `return`); the
  offset advance + skip is the WP-253-deferred multi-peek (D-24024 → this WP's D-24027).
- The hoisted reject-second (choose) + turnEconomy (attack) guards stay as-is.

### B) Parser — `revealCount` marker (`setup/heroAbility.setup.ts`)
- Add a dedicated `REVEAL_COUNT_PATTERN` (a 2-segment token, mirroring
  `COUNT_SCALED_PATTERN`): `[keyword:reveal-count:<n>]`, `n` a positive integer.
  Exact regex + the legacy/parameterized disambiguation are a **Locked Value in EC-286**.
- When present on a line that also emits a `reveal` descriptor (parameterized rules
  and/or a legacy reveal keyword), set `revealCount = n` on that descriptor; absent ⇒ 1.
- Add a `// why:` comment: the count is descriptor-level (how many cards to peek), not
  rule-level; mirrors the dedicated-token precedent for 3-segment markers.

### C) Card data — mark the flagship card (`data/cards/core.json`)
- Append to `spider-man` / `the-amazing-spider-man`'s ability line the markers
  `[keyword:reveal:cost-lte-2:draw][keyword:reveal-count:3]` so it parses to
  `{ type: 'reveal', revealCount: 3, revealRules: [{ predicate: { kind: 'cost-lte', threshold: 2 }, actions: [{ kind: 'draw' }] }] }`.
- No other card touched.

### D) Tests
- `heroEffects.execute.test.ts` — REQUIRED named assertions (copilot #11/#26):
  - **mixed-cost reveal-top-3** over `['cost-1','cost-5','cost-2','cost-9']` threshold 2
    ⇒ `hand` has `cost-1` + `cost-2` and **`deck === ['cost-5','cost-9']` in EXACT order**
    (assert the array, not membership — the peek advanced past the non-drawn cards)
  - **SHIELD-starter skip** — reveal-top-3 over a deck whose window holds a card with NO
    `cardStats` entry draws the eligible cards around it and **leaves the unstatted card
    in place** (does NOT abort the reveal)
  - **short-deck** — reveal-top-3 over a 1–2 card deck stops cleanly (no throw)
  - **byte-identity:** the WP-253 count=2 deck-mutating loop test + the 8 per-keyword
    reveal tests pass UNCHANGED (do not edit them)
- `heroAbility.setup.test.ts`: `[keyword:reveal-count:3]` sets `revealCount: 3` on the
  reveal descriptor; the `the-amazing-spider-man`-shaped line parses to the expected
  `revealCount: 3` + `cost-lte 2 → draw` descriptor.

---

## Out of Scope
- **"Put the rest back in any order"** — the non-drawn revealed cards stay in place
  (existing relative order). The player-reorder is a separate choice mechanic — DEFERRED.
- **Cost-0 S.H.I.E.L.D. starters in the reveal window are revealed-but-NOT-drawn**
  (accepted MVP limitation, copilot #22): the engine has no `cardStats` for starters
  (D-21502), so it cannot evaluate their cost; they are skipped-and-left, not drawn,
  even though their printed cost is ≤ 2. Drawing starters via reveal needs a
  starter-cost source — DEFERRED. The reveal does NOT abort on them.
- **Sweeping the rest of the "reveal top N, draw cost ≤ X" family** across other sets —
  a follow-on **data-only** corpus sweep once the engine + parser support lands here
  (separate WP; this packet ships the infrastructure + the one marquee card).
- No new `RevealPredicate` / `RevealAction` kinds; no villain/scheme reveal change.
- No change to `revealRule.ts` contracts, `resolveHeroChoice`, or the choice UI.

---

## Files Expected to Change

- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — peek-advance loop
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — reveal-top-N tests
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — `revealCount` marker
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — parser test
- `data/cards/core.json` — **modified** — mark `the-amazing-spider-man`

No other files may be modified. Governance at close: `STATUS.md`, `DECISIONS.md`
(D-24027), `WORK_INDEX.md`, `EC_INDEX.md`, `docs/05-ROADMAP-MINDMAP.md`.

---

## Acceptance Criteria

### A) Engine
- [ ] `heroEffectReveal` peeks `deck[peekOffset]`; offset advances on a non-mutating
      iteration, stays on a deck-shrinking one; stops at `peekOffset >= deck.length`
- [ ] count=1 path byte-identical — the 8 reveal-keyword tests + WP-253 count=2 test pass unchanged

### B) Parser
- [ ] `[keyword:reveal-count:3]` sets `revealCount: 3` on the emitted reveal descriptor; absent ⇒ 1
- [ ] The marked Spider-Man line parses to `revealCount: 3` + `[{ cost-lte 2 → draw }]`

### C) Card data + behavior
- [ ] `the-amazing-spider-man` is marked; reveal-top-3 draws cost ≤ 2, leaves the rest
- [ ] `data/cards/core.json` diff is ONLY the one ability line

### Tests / Scope
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (≥ 1359 + new tests)
- [ ] `pnpm sim:coverage --check` OK (Spider-Man's hook moves from `noEffect`/`PARSED_NOT_EXECUTED` to EXECUTABLE — a coverage IMPROVEMENT, not a regression)
- [ ] No files outside `## Files Expected to Change` modified (`git diff --name-only`)

---

## Verification Steps

```pwsh
# Step 1 — build
pnpm --filter @legendary-arena/game-engine build
# Expected: exits 0

# Step 2 — tests
pnpm --filter @legendary-arena/game-engine test
# Expected: all pass, 0 fail; reveal-top-N + parser tests green

# Step 3 — coverage (improvement, not regression)
pnpm sim:coverage --check
# Expected: OK

# Step 4 — card-data diff is exactly one line
git diff --name-only -- data/cards/
# Expected: data/cards/core.json only

# Step 5 — scope
git diff --name-only
# Expected: only the 5 Files Expected to Change + governance
```

---

## User-Visible Verification (D-24026 — REQUIRED; surface = play.legendary-arena.com)

After merge + deploy (Render server rebuilds the engine; the R2 upload publishes the
marked card data), confirm **live**: in a real or autoplay match on
play.legendary-arena.com, play **"The Amazing Spider-Man"** and observe the top three
cards revealed with every cost-≤2 card drawn to hand and the rest left on deck.
Capture evidence (screenshot or observed-behavior note, or a deploy-confirmed SHA
serving the marked `core.json`). **Green tests + a merged PR do NOT satisfy this.**

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] **User-visible verification (surface = play.legendary-arena.com):** "The Amazing
      Spider-Man" is confirmed firing **live** on play.legendary-arena.com (reveal 3,
      draw the ≤2-cost cards), with observable evidence captured — NOT satisfied by
      green tests + merge alone (D-24026)
- [ ] All acceptance criteria pass
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] `pnpm sim:coverage --check` OK
- [ ] count=1 reveal behavior byte-identical (the 8 keyword tests + WP-253 count=2 test unchanged)
- [ ] No files outside `## Files Expected to Change` modified (`git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated — Spider-Man's signature card now lights up; reveal-top-N supported
- [ ] `docs/ai/DECISIONS.md` updated — **D-24027** (reveal peek-advance multi-peek + `revealCount` marker; the WP-253 deferred piece, lands the first visible-win card)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-255 checked off with today's date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-286 marked Done
- [ ] `docs/05-ROADMAP-MINDMAP.md` WP-255 node + `node scripts/roadmap-counts.mjs --check` passes

---

## Lint Gate Self-Review (`00.3`) — draft self-check

- **§1–§6 (structure, constraints, prerequisites, context, output, naming):** PASS —
  canonical field names per 00.2; 5 code files; all sections present.
- **§7 deps:** PASS — no new npm deps.
- **§8 architecture:** PASS — Game Engine + Card Data; `revealRules`/`revealCount` are
  plain data; `HERO_EFFECT_HANDLERS` outside `G`; `ctx.random.*` only; no DB/network.
- **§9–§11:** N/A.
- **§12 test quality:** PASS — `node:test`, no `boardgame.io`; reveal-top-N + parser + byte-identity tests.
- **§13–§15 (commands / acceptance / DoD):** PASS — exact `pnpm` commands; binary criteria;
  DoD includes STATUS/DECISIONS/WORK_INDEX/EC_INDEX/mindmap.
- **§15.1 user-visible verification (D-24026):** PASS — `User-Visible Surface`
  declared (`play.legendary-arena.com`); `## User-Visible Impact` present; DoD carries
  a live-on-surface verification item — this WP is the dogfood for the new gate.
- **§16 code style:** PASS — named loop var (`peekOffset`), no abbreviations, `// why:`
  on the offset-advance + the descriptor-level count; no `.reduce()`.
- **§17 Vision:** Triggered (card content semantics — Vision §1/§2/§10). Deterministic
  (no new randomness); the marked card is data, replay-safe. No scoring/identity surface. No conflict.
- **§18 prose-vs-grep / §19 bridge / §20 funding / §21 API catalog:** N/A.

**Next drafting gates:** pre-flight (`01.4`) + copilot (`01.7`) before execution — flag
the heroEffects.execute.ts byte-identity risk and the exact `revealCount` marker grammar
for those reviewers.
