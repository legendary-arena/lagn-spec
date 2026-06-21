# Design: Scaling Hero/Villain Effect Authoring

**Status:** Analysis + proposal. Subordinate to `docs/ai/ARCHITECTURE.md` and
`.claude/rules/*.md`. This document is descriptive and advisory; it does not
amend any contract. The governed work it proposes is tracked separately (see
§7 — none of the WPs below exist in `WORK_INDEX.md` yet).

**Author:** Session 2026-06-14 (analysis of the per-card effect grind).

---

## 1. Problem statement

Implementing card effects is projected at ~6 months across 40 sets at the
current pace. The owner's read is that the work is too slow and that
infrastructure which should have addressed it (a generalized effect system; a
scenario harness that plays cards through a game to surface bugs) is built but
not being used.

This document diagnoses *why* the pace is slow, inventories the relevant
already-built infrastructure, and proposes a three-lever change that shifts the
unit of work from **one Work Packet per mechanic** to **one Work Packet per
set's worth of data** plus an automated coverage gate.

---

## 2. Diagnosis — the bottleneck is not per-card code

The architecture is already ~70% data-driven, and that part is healthy:

- Hero abilities are parsed from card-text markup (`[keyword:draw:3]`,
  `[icon:attack]`, `[team:x-men]`, `[hc:x]`, `[timing:onReveal]`) into pure-JSON
  `HeroEffectDescriptor`s at **setup time** by `parseAbilityText` /
  `buildHeroAbilityHooks`
  (`packages/game-engine/src/setup/heroAbility.setup.ts:563`), stored in
  `G.heroAbilityHooks`.
- `apps/server` contains **zero** effect logic — pure wiring, as the
  architecture demands.
- `apps/arena-client` has a **generic** interactive-choice prompt
  (`packages/arena-client/src/components/play/PendingHeroChoicePrompt.vue`).
  A new *non-interactive* effect needs **no client change at all**.

Consequence: adding a card that reuses an existing mechanic is ~1 line of JSON.
**WP-225 already proved this — it marked 98 cards in a single packet.** Batch
authoring works today.

The slowness comes from two specific, fixable choices:

### 2a. Every new *mechanic* is its own WP + EC + DECISIONS cycle

The keyword history is recorded inline in
`packages/game-engine/src/hero/heroEffects.execute.ts:30-38`: WP-215, WP-217,
WP-218, WP-219, WP-220, WP-223, WP-247 — each adding **one** keyword with its
own D-entry (D-21802, D-21901, D-21902, D-22003, D-22301, D-24016). WP-247 and
the draft WP-248 each mark **exactly one card**. The governance ceremony per
mechanic dwarfs the ~30 lines of handler code it ships.

### 2b. The keyword vocabulary fragments instead of parameterizing — by explicit policy

This is the load-bearing finding, and it is written down as a decision.
`packages/game-engine/src/rules/villainAbility.types.ts:83-87`:

> `koHeroEachPlayerMag2` was added at position 7 by WP-202 … magnitude-N
> each-player-KO uses **closed-union-per-magnitude keywords** appended at
> position N (`koHeroEachPlayerMag2`, `koHeroEachPlayerMag3` if ever needed);
> parameterized markers (`[effect:koHeroEachPlayer:N]`) [were set aside].

So `koHeroEachPlayer` and `koHeroEachPlayerMag2` are **two keywords for the same
effect at two magnitudes** (D-20201). The same split produced
`gainWoundEachPlayer` / `gainWoundCurrentPlayer`. On the hero side there are
**eight** near-identical "reveal the top card, then do X" variants — `reveal`,
`reveal-ko`, `reveal-min`, `reveal-ko-or-draw`, `reveal-cost-attack`,
`reveal-odd-draw`, `reveal-attack-choose`, `reveal-ko-attack`
(`heroKeywords.ts:26-68`) — each a separate union member, switch case, and WP.

That combinatorial expansion (effect × target × magnitude × condition, each cell
a new keyword) is what turns 40 sets into 6 months.

> **Resolved by D-24029 (2026-06-16):** this finding is addressed by moving to
> **composable primitives** — the closed union now enumerates *primitives*, not
> *mechanics*, so the combinatorial expansion collapses into data composition.
> See `docs/ai/DESIGN-EFFECT-MODEL-DECISION.md`.

### 2c. The executor is a hardcoded switch, not the registry the codebase already has

`executeHeroEffects` (`heroEffects.execute.ts:161`) dispatches keywords through
a `switch`. Adding an effect requires editing the closed `HeroKeyword` union,
its canonical array, the `MVP_KEYWORDS` set, and the switch — four edits across
two locked-ish files plus a drift-detection test and a DECISIONS entry.

---

## 3. Already-built infrastructure that should have absorbed this

Three pieces are **done and on `main`** and are the exact pattern the hero/villain
grind needs — they simply were not applied to it.

| WP | What it is | Status | Why it matters here |
|---|---|---|---|
| **WP-009A / WP-009B** | The ImplementationMap pipeline for schemes & masterminds: data-only `HookDefinition` + tagged-union `RuleEffect` + `executeRuleHooks()` / `applyRuleEffects()`, handlers held in a map **outside** `G`. | Done | This is the *open* dispatch pattern. The hero path does not use it — it uses a switch. We already built the registry and then didn't route heroes through it. |
| **WP-182** | Scheme Twist Resolver Framework: parameterized resolvers dispatched by a **config entry**, so a new scheme is a data row, not code. | Done | Direct proof-of-concept for what heroes need. Ships 5 reusable resolvers; the pattern was never carried to the other ~186 schemes or to heroes. |
| **WP-033** | Content Authoring Toolkit: author-facing JSON schemas + a pre-engine validation gate. | Done | Built specifically so content can be bulk-authored and validated outside the engine. Not being leveraged for corpus-wide markup sweeps. |

---

## 4. The scenario system — built, but dark

The "run hero cards through a game to surface bugs" capability the owner asked
for is ~80% implemented. It *feels* unused because there is no front door.

| WP | Capability | Status |
|---|---|---|
| **WP-036** | `runSimulation()` plays full games with an AI policy through the real turn pipeline (`packages/game-engine/src/simulation/simulation.runner.ts`). | Done; exercised in tests. |
| **WP-049** | Competent-heuristic policy + PAR aggregation. | Done. |
| **WP-158** | Regression-fixture harness: record a game → replay → assert state hash + log. The actual bug-catcher. CLI recorder at `scripts/record-game-fixture.mjs`. | **Draft; exactly one sentinel fixture.** |
| **WP-163/164/165** | Autoplay "Watch Bot Play" spectator controls. | Server wired; client partial. |

Why it does not catch card-effect bugs today:

1. **No entry point.** There is no `pnpm sim:coverage` / report script; the
   simulation only runs buried inside PAR generation.
2. **No coverage forcing.** The AI policy plays *reasonable* moves, so it never
   guarantees that every hero card in a set is actually played. A card whose
   effect silently no-ops can sit untouched across thousands of games.
3. **No assertion harness.** Nothing fails the build on an effect that emits a
   warning, produces `<unknown>` display data, or no-ops.

---

## 5. The proposal — three levers

### Lever 1 — Parameterize the effect descriptor (highest leverage)

Reopen D-20201 (and the villain-side incremental-expansion clause D-18901).
Collapse the fragmented vocabulary into a small set of **primitives** —
`ko-hero`, `gain-wound`, `draw`, `gain-attack`, `gain-recruit`, `rescue`,
`reveal-then-<effect>` — each carrying parameters:

```
{ type: 'ko-hero', target: 'each' | 'current', magnitude: N, condition?: ... }
```

`koHeroEachPlayerMag2` becomes `ko-hero { target: each, magnitude: 2 }` — data,
not a new union member. Determinism, exhaustiveness, and drift-detection are
preserved by validating **parameter ranges** instead of enumerating every
combination. This kills the combinatorial explosion at the source.

### Lever 2 — Route heroes/villains through the WP-009B ImplementationMap

Convert the hero/villain `switch` to the registry pattern already running for
schemes. A new primitive becomes a **map entry + a unit test**, not a union edit
+ switch case + WP. Type-safety and replay determinism are retained — that is how
the scheme path already works.

### Lever 3 — Turn the scenario system into a coverage gate

Promote WP-158 from draft and add:

- a **coverage-forcing driver** that guarantees every hero card in a set is
  exercised (statically via the parser, and/or in-game via a card-seeking
  policy), asserting **no warnings, no `<unknown>`, no no-op effects**;
- a **`pnpm sim:coverage --set <abbr>`** entry point and a printed report;
- this run wired into CI so a regression fails the build.

This converts "implement card, hope it works" into "implement card, run sim, see
the bug" — the thing originally requested.

**Net effect:** the unit of work shifts from *one WP per mechanic* to *one WP to
author a whole set's markup* + the simulation telling you what is still broken.

> **Update — D-24029 (2026-06-16):** the three Levers are **step 1 of 2**. They
> *parameterized within* the closed keyword vocabulary (e.g. the 8 `reveal-*`
> keywords → one `reveal`, D-24024); D-24029 takes the next step — *opening* it
> to **composable primitives**, where the closed union enumerates primitives (not
> mechanics) and most new mechanics ship as data. See
> `docs/ai/DESIGN-EFFECT-MODEL-DECISION.md`.

---

## 6. Open decisions to reopen (DECISIONS.md)

- **D-20201** — closed-union-per-magnitude policy (villain each-player-KO).
  Lever 1 supersedes it with parameterized markers `[effect:ko-hero:each:N]`.
- **D-18901** — villain incremental-expansion-per-keyword clause.
- **D-24029** (ratified 2026-06-16) authorizes the open dispatch surface: the
  effect descriptor model moves to **composable primitives** — the closed union
  reframes from *mechanics* to a closed, drift-tested *primitive registry*,
  preserving determinism via the primitive contracts + the `bind`/`ref`
  context-lifetime invariant (transient, never persisted to `G`). See
  `docs/ai/DESIGN-EFFECT-MODEL-DECISION.md`.

---

## 7. Sequencing (and governance checkpoints)

1. **Document findings** — this file.
2. **Prototype (read-only, against `main`)** — a corpus coverage probe that runs
   the real parser over all 40 sets and buckets every hero ability line as
   EXECUTABLE / PARSED-NOT-EXECUTED / NO-EFFECT. Touches **no** contract files,
   so it needs no WP ceremony. Its output is the empirical inventory that scopes
   the refactor. (See §8 for results.)
3. **Commit to refactor** — draft governed WPs (Lever 1 descriptor + Lever 2
   ImplementationMap; the WP-033 markup sweep; the Lever 3 coverage gate). These
   change locked `.types.ts` contracts → they require DECISIONS entries, the
   Prompt Lint Gate, and review-gate sign-off **before** execution.

---

## 8. Prototype results

Probe: `scripts/hero-effect-coverage.mjs` — read-only, drives the **real** engine
parser (`buildHeroAbilityHooks`) over every hero card in all 40 in-repo sets
(`data/cards/*.json`) and buckets every parsed ability line. Deterministic; no
engine edits. Run after `pnpm -r build` via `node scripts/hero-effect-coverage.mjs`.

### Headline (whole corpus, 2026-06-14 / `main`)

| Metric | Value |
|---|---|
| Heroes with ≥1 parsed ability line | 309 |
| Total parsed ability-line hooks | 5,739 |
| **EXECUTABLE** (effect runs today) | **2,516 (43.8%)** |
| PARSED_NOT_EXECUTED (deferred keyword) | 5 (0.1%) |
| **NO_EFFECT** (printed text, parser yields nothing) | **3,218 (56.1%)** |
| Fully-dark heroes (have text, 0 executable effects) | 24 |

**Over half of all printed hero ability lines silently do nothing in a real
game.** Vanilla/no-text cards are excluded (they never produce a hook), so
NO_EFFECT is strictly "the card says it does something and the engine ignores it."

### What the 43.8% that works actually is

Executable-effect histogram: `attack` 1,542 · `recruit` 707 · `draw` 378 ·
`rescue` 47 · `reveal` 41 · `reveal-ko` 14 · `reveal-ko-attack` 5 ·
`reveal-min` 5 · `attack-per-count` 3 · `reveal-odd-draw` 3 ·
`reveal-ko-or-draw` 3 · `reveal-cost-attack` 1 · `reveal-attack-choose` 1.

The working coverage is **almost entirely the three primitives that came nearly
for free** (attack/recruit/draw ≈ 2,627 of the effect instances). The bespoke
keywords that each consumed a full WP + EC + DECISIONS cycle apply to a handful
of cards: `reveal-cost-attack` (WP-219 / D-21901) → **1 card**;
`reveal-attack-choose` (WP-220 / D-22003) → **1 card**; `attack-per-count`
(WP-247 / D-24016) → **3 cards**. This is the per-mechanic-WP inefficiency,
quantified: whole packets spent to light up 1–5 cards.

### The 56% gap splits into two populations

1. **Markup debt (cheap, batchable).** Lines whose effect is *already in the
   executable vocabulary* but which lack a marker — e.g. Melinda May's
   "`[team:shield][team:shield][team:shield]`: Draw a card." parses to nothing
   because the NL "Draw a card" was never marked `[keyword:draw:1]` with a
   team-count condition. These are closed by the WP-033/WP-225 markup-sweep model
   (WP-225 already marked 98 cards in one packet).
2. **Missing mechanics.** The probe enumerated **122 distinct `[keyword:X]`
   tokens with zero engine support** — whole subsystems: `undercover` (45),
   `size-changing` (45), `berserk` (43), `wall-crawl` (29), `investigate` (28),
   `focus` (25), `dodge` (24), `teleport` (21), `transform` (21), `empowered`
   (19), `smash` (19), `danger-sense` (18), `soaring-flight` (17), `clone` (16),
   `hyperspeed` (14), `x-gene` (13), `outwit` (13), `phasing` (12), `artifact`
   (12), … At **one WP per mechanic, ~122 mechanics ≈ ~122 packets** — that is
   the 6-month projection in one number. (122 is an upper bound on executors to
   build: some are passive/cosmetic, and many collapse onto shared parameterized
   primitives — which is exactly the triage Lever 1 + this tool enable.)

### Per-set, near-term (core)

`core`: 229 hooks, **148 executable (64.6%)**, 76 NO_EFFECT (33%). A third of the
set the owner is actively working still no-ops. The highest-debt sets are later
expansions (`wwhk` 215, `xmen` 213, `cvwr` 163 NO_EFFECT lines) dominated by the
missing-mechanics population.

### Verdict

The prototype validates all three levers: the gap is real and large (56%), the
per-mechanic-WP model is quantifiably wasteful (full packets for 1-card
keywords), and a single read-only instrument already produces the scoping
inventory a coverage gate (Lever 3) would enforce. **Recommended next step:
proceed to the governed refactor WPs (§7 step 3), scoped by this inventory.**

### Known limitations (honest scope)

- Counts distinct-content ability lines (hooks deduped by content); a fair proxy
  for "things to implement," not a card count.
- Hero cards only — villain/mastermind/scheme effects share the pattern but are a
  separate, smaller corpus.
- `EXECUTED_KEYWORDS` / `KNOWN_MARKUP_KEYWORDS` in the probe mirror the engine
  consts by hand; if the engine vocabulary drifts, update the probe. Productionizing
  (Lever 3) should import the canonical arrays instead of duplicating them.
- A per-line text→bucket join (to label each NO_EFFECT line as markup-debt vs
  missing-mechanic automatically) needs the parser to expose `parseAbilityText`
  or thread source text through the builder — a small engine change that belongs
  in the Lever 3 WP, not this read-only probe.
