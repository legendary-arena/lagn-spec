# WP-253 — Hero Reveal-* Collapse (Parameterized Reveal Descriptor; Lever 1 for Heroes)

**Status:** Draft — pending review.
**Primary Layer:** Game Engine / Contracts + Implementation
**Dependencies:** WP-251 ✅ (the `HERO_EFFECT_HANDLERS` ImplementationMap this dispatches through), WP-252 ✅ (the villain parameterization pattern — frozen legacy-translation table + reverse-map this mirrors), WP-217/218/219/220/223 ✅ (the eight `reveal-*` keywords being collapsed), WP-009B ✅, WP-250 ✅ (the hero coverage gate — **this WP is gate-guarded**, unlike WP-252)

---

## Session Context

WP-251 routed the hero effect switch through `HERO_EFFECT_HANDLERS` (Lever 2). WP-252 parameterized the villain *vocabulary* (Lever 1 for villains) — 10 keywords → 5 primitives + a descriptor, with a frozen legacy-translation table + a reverse-map keeping the narrative surface byte-identical. This packet is **Lever 1 for heroes**: it collapses the fragmented `reveal-*` keyword family into a single parameterized `reveal` descriptor, so a new reveal variant becomes a data marker rather than a new keyword + handler + drift-test + WP. Each `reveal-*` keyword today costs a full WP+EC+DECISIONS cycle for 1–5 cards (the exact pattern `docs/ai/DESIGN-EFFECT-AUTHORING-SCALE.md` identifies as the ~6-month bottleneck).

---

## The Fragmented Family (8 keywords, today)

Each peeks `deck[0]` (the player's deck top) and acts on a cost-predicate. `magnitude` is semantically overloaded (a cost threshold in most, a fixed attack grant in `reveal-ko-attack`):

| keyword | predicate | action(s) | deck mutation | magnitude |
|---|---|---|---|---|
| `reveal` | cost ≤ M | draw | → hand | cost ceiling |
| `reveal-min` | cost ≥ M | draw | → hand | cost floor |
| `reveal-odd-draw` | cost odd | draw | → hand | (none) |
| `reveal-ko` | cost == 0 | KO | → ko | (none) |
| `reveal-ko-or-draw` | cost==0 → KO **else** cost ≤ M → draw | KO **or** draw (first-match) | → ko / hand | draw ceiling |
| `reveal-cost-attack` | always | attack += cost | stays | (none) |
| `reveal-attack-choose` | cost ≤ M → attack += cost; **then always** park a discard-or-return choice | attack-by-cost **+** interactive choice | stays (until resolve) | cost ceiling |
| `reveal-ko-attack` | cost == 0 → KO **+** attack += M (fixed) | KO **+** fixed-attack (atomic) | → ko | fixed attack grant |

Source of truth: `heroEffects.execute.ts` handlers `heroEffectReveal`, `heroEffectRevealKo`, `heroEffectRevealMin`, `heroEffectRevealKoOrDraw`, `heroEffectRevealCostAttack`, `heroEffectRevealOddDraw`, `heroEffectRevealAttackChoose`, `heroEffectRevealKoAttack`.

---

## Goal

After this session, all eight `reveal-*` keywords are dispatched through a **single `reveal` `HERO_EFFECT_HANDLERS` entry** consuming a parameterized **ordered branch-list** on `HeroEffectDescriptor`. The setup parser **translates** the eight legacy `[keyword:reveal-*...]` tokens through a frozen table into the branch-list descriptor AND accepts a new parameterized token grammar. **Card data is unchanged this packet** (legacy markers still parse, now translated). A new reveal variant (a new predicate or action combination) then needs **zero engine code** — a data marker only. The applied-effects / narrative surface stays keyword-typed (the legacy keyword stays on `hook.keywords`; **no reverse-map needed** — see below), so `notableEvents`, the message log, and the arena-client projection are **byte-identical** — the parameterization is internal to dispatch. **The WP-250 `sim:coverage` gate is a backstop here, not an identity proof** — it buckets `noEffect` only when `effects.length === 0`, and a reveal hook always has ≥1 effect, so the gate is invariant to the `type`/`revealRules` change (it guards against accidentally emptying `effects`). **The per-keyword legacy-equivalence tests are the real identity proof.**

---

## The Parameterization

Add to `HeroEffectDescriptor` (the existing descriptor already carries `magnitude`, `countSource`, `rewardType` — additive, optional fields only):

```ts
// only meaningful when type === 'reveal'
revealCount?: number;          // cards peeked from deck top; default 1 (every current card = 1)
revealRules?: RevealRule[];    // ordered; evaluated top-to-bottom

interface RevealRule {
  predicate: RevealPredicate;
  actions: RevealAction[];     // applied in order when predicate matches
  continue?: boolean;          // when true, keep evaluating later rules even after this one matches (default false = stop after first match)
}
interface RevealPredicate {
  kind: 'always' | 'cost-lte' | 'cost-gte' | 'cost-zero' | 'cost-odd';
  threshold?: number;          // for cost-lte / cost-gte
}
interface RevealAction {
  kind: 'draw' | 'ko' | 'attack-by-cost' | 'attack-fixed' | 'choose-discard-or-return';
  amount?: number;             // for attack-fixed
}
```

`RevealPredicate.kind` + `RevealAction.kind` are **closed canonical unions** with `REVEAL_PREDICATE_KINDS` / `REVEAL_ACTION_KINDS` drift arrays (code-style §Drift Detection). The branch-list models all three control-flow shapes:

- **single rule** (5 keywords): one `{predicate, actions:[one]}`.
- **first-match-wins** (`reveal-ko-or-draw`): two rules, neither `continue` → `cost-zero`→`[ko]` stops; else `cost-lte`→`[draw]`. A cost-0 card KOs and never reaches the draw rule (the current handler's KO-before-draw lock).
- **evaluate-all + multi-action** (`reveal-attack-choose`: rule 1 `cost-lte`→`[attack-by-cost]` with `continue:true`, rule 2 `always`→`[choose-discard-or-return]`; `reveal-ko-attack`: one rule `cost-zero`→`[ko, attack-fixed(M)]` — actions applied atomically, attack only after the KO move succeeds).

### Frozen legacy translation table

`LEGACY_REVEAL_KEYWORD_TO_RULES: Record<<the 8 reveal keywords>, { revealCount: 1, revealRules: RevealRule[] }>` (the migration seam; card data keeps working unchanged). Exactly:

- `reveal` (mag M) → `[{cost-lte M → [draw]}]`
- `reveal-min` (M) → `[{cost-gte M → [draw]}]`
- `reveal-odd-draw` → `[{cost-odd → [draw]}]`
- `reveal-ko` → `[{cost-zero → [ko]}]`
- `reveal-ko-or-draw` (M) → `[{cost-zero → [ko]}, {cost-lte M → [draw]}]`
- `reveal-cost-attack` → `[{always → [attack-by-cost]}]`
- `reveal-attack-choose` (M) → `[{cost-lte M → [attack-by-cost], continue:true}, {always → [choose-discard-or-return]}]`
- `reveal-ko-attack` (M) → `[{cost-zero → [ko, attack-fixed amount:M]}]`

### Behavior identity — NO reverse-map needed (RESOLVED at pre-flight)

Unlike WP-252's villain hook (whose `effects` was retyped and fed an applied-effects accumulator → it needed `descriptorToLegacyKeyword`), the hero side needs **no reverse-map**: the hook carries `keywords: HeroKeyword[]` written **independently** of `effects` at parse time (`heroAbility.setup.ts`), `executeHeroEffects` returns `void` and accumulates nothing, hero reveals never touch `notableEvents`, and `EFFECT_KEYWORD_LABELS` is `Record<VillainEffectKeyword,…>` (villain-only). So as long as the parser keeps writing the legacy `reveal-*` keyword onto `hook.keywords` (translation affects only `effects`/`revealRules`), `notableEvents`, the replay state-hash, and the arena-client projection are **byte-identical** with zero extra machinery.

---

## Non-Negotiable Constraints

**Engine-wide:** `ctx.random.*` only; never throw in effect execution (unknown predicate/action → warn to `G.messages` + continue); `G` JSON-serializable (the branch-list is plain data; `HERO_EFFECT_HANDLERS` stays a module-level const outside `G`); ESM, Node v22+, `.test.ts`, no `.reduce()`, full file contents.

**Packet-specific:**
- **Behavior-identical via translation.** Each legacy keyword's translated branch-list reproduces its current handler output **exactly**, including: the cost-predicate boundaries (`reveal-ko-or-draw`'s KO-before-draw and cost-0-never-draws; `reveal-odd-draw`'s cost-0-is-even no-op; `reveal-min`'s `>=`); the deck-mutation targets (draw→hand, ko→ko, attack→stays); `reveal-cost-attack`'s no-magnitude-gate; `reveal-ko-attack`'s atomic KO-then-fixed-attack (attack only on `moveResult.found`); and **`reveal-attack-choose`'s interactive park** — the `G.pendingHeroChoice` reject-second guard, the `G.turnEconomy`-guard-before-park ordering (AC-9 in the original D-22003 packet), and `choiceType: 'discard-or-return'`.
- **Card data unchanged** (`data/cards/**` zero diff) — the parser translates legacy tokens; no re-marking.
- **Legacy reveal keywords frozen, not extended.** The 8 `reveal-*` `HeroKeyword`s stay in the union + `HERO_KEYWORDS` as the parser's translation input; **no new `reveal-*` keyword is ever appended again** — new variants are branch-list params. (The other `HeroKeyword`s — `draw`/`attack`/`recruit`/`ko`/`rescue`/`reveal`/`attack-per-count`/`optional-ko-reward`/`conditional` — are untouched.)
- **The interactive `choose` action keeps `G.pendingHeroChoice` semantics + the `resolveHeroChoice` move untouched** — `choose-discard-or-return` parks exactly the existing `PendingHeroChoice`; no new pending-choice subsystem.
- **`HERO_EFFECT_HANDLERS` has ONE `reveal` entry** after this WP; the 7 `reveal-*` handler entries + functions are removed (their logic folded into the parameterized `reveal` handler + the per-predicate / per-action helpers). The drift test (`Object.keys(HERO_EFFECT_HANDLERS)` == `MVP_KEYWORDS`) updates: the 7 `reveal-*` keys leave the map but their keywords STAY in `HERO_KEYWORDS` (frozen translation input) — so `MVP_KEYWORDS` and the handler-map keys diverge from the keyword union for the reveal family. Resolve by keying `MVP_KEYWORDS` membership on "has a handler OR is a frozen-translated keyword" (specify precisely in the EC).

---

## Scope (In)

### A) Contracts — `heroAbility.types.ts` + a new `rules/revealRule.ts`
- Add `RevealPredicate`, `RevealAction`, `RevealRule` + closed `REVEAL_PREDICATE_KINDS` / `REVEAL_ACTION_KINDS` drift arrays.
- Add `revealCount?` + `revealRules?` to `HeroEffectDescriptor` (additive optional).
- Export the frozen `LEGACY_REVEAL_KEYWORD_TO_RULES` translation table.

### B) Executor — `heroEffects.execute.ts`
- Replace the 8 reveal handlers with ONE `heroEffectReveal` that peeks `deck[0]` (× `revealCount`, =1 today) and evaluates `revealRules` (first-match-wins unless `continue`), applying each matched rule's `actions` in order via small per-action helpers (`applyRevealDraw` / `applyRevealKo` / `applyRevealAttackByCost` / `applyRevealAttackFixed` / `applyRevealChoose`). Per-action helpers hold the **verbatim** zone-mutation bodies from the current handlers.
- `HERO_EFFECT_HANDLERS`: one `reveal` entry; the 7 `reveal-*` entries removed.

### C) Parser — `heroAbility.setup.ts`
- Translate each legacy `[keyword:reveal-*...]` token (validate ∈ the 8) through `LEGACY_REVEAL_KEYWORD_TO_RULES` into a `reveal` descriptor with `revealRules`; AND accept a parameterized reveal token grammar (specify in the EC). The keyword recorded on the hook stays the legacy keyword (narrative identity).

### D) Coverage gate — verify only
- `pnpm sim:coverage --check` must stay green (per-set `noEffect` unchanged) — the hero gate proves corpus-level identity. No gate code change.

### E) Tests
- `revealRule` drift (predicate/action kinds); `LEGACY_REVEAL_KEYWORD_TO_RULES` parity (all 8 mapped, kinds canonical); **legacy-equivalence** per keyword (each translated branch-list yields the pre-refactor output, incl. the ko-or-draw exclusivity, the attack-choose attack-then-park ordering + reject-second, the ko-attack atomicity); dual-grammar equivalence (a legacy token and its parameterized form yield the same descriptor).

---

## Out of Scope
- No card-data re-marking (`data/cards/**` zero diff).
- No new reveal mechanic, predicate, or action beyond the 5/5 needed to cover the 8 (a 6th predicate/action is a future data-driven add — that's the point).
- No villain change (WP-252 already shipped that side).
- No change to `resolveHeroChoice` or the `PendingHeroChoice` shape.
- No change to `notableEvents`, the replay `finalStateHash`, or `apps/arena-client/**` — the keyword-typed narrative surface stays byte-identical (mirror the WP-252 reverse-map discipline; if `tsc` wants one of these touched, the descriptor leaked → re-confine).

---

## Files Expected to Change
- `packages/game-engine/src/rules/heroAbility.types.ts` — **modified** — `revealCount?`/`revealRules?` on `HeroEffectDescriptor`.
- `packages/game-engine/src/rules/revealRule.ts` — **new** — `RevealPredicate`/`RevealAction`/`RevealRule` + drift arrays + `LEGACY_REVEAL_KEYWORD_TO_RULES`.
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — one parameterized `reveal` handler + per-action helpers; 7 reveal entries removed from `HERO_EFFECT_HANDLERS`.
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — dual (legacy + parameterized) reveal token grammar → branch-list.
- `packages/game-engine/src/rules/revealRule.test.ts` — **new** — drift + translation-parity + reverse-map.
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — per-keyword legacy-equivalence (the 8) + dual-grammar.
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** (NOTE: `rules/`, not `setup/`) — reveal token parse → branch-list; the existing `effect.magnitude` reveal assertions migrate to `revealRules` shape (top-level `magnitude` is dropped for the collapsed `reveal`); the 17-entry `HERO_KEYWORDS` drift test stays untouched.
- **Amendment-A fixture migration (locked):** the executor + setup test reveal fixtures hand-build legacy `{type:'reveal-ko'…}` descriptors; once those keys lose handlers, dispatch silently skips and assertions fail. They MUST be migrated to `{type:'reveal', revealRules: revealRulesForLegacyKeyword('<legacy>', M)}` — an input-shape migration, NOT a behavior change (assertion OUTPUTS stay byte-identical). Enumerate at execution via `git grep -l "type: 'reveal" -- '*.test.ts'`. See EC-284 §Amendment-A.

Governance at close: `STATUS.md`, `DECISIONS.md` (D-24024 + the reveal-collapse rationale; cite it retires the per-reveal-keyword cadence the way D-24023 retired D-20201/D-18901), `WORK_INDEX.md`, `EC_INDEX.md` (EC-284), `docs/05-ROADMAP-MINDMAP.md`.

No other files may be modified. (`data/cards/**` MUST be unchanged.)

---

## Acceptance Criteria

### A) Contracts
- [ ] `REVEAL_PREDICATE_KINDS` (5) + `REVEAL_ACTION_KINDS` (5) drift arrays match their unions; `HeroEffectDescriptor` gains `revealCount?`/`revealRules?` (additive).
- [ ] `LEGACY_REVEAL_KEYWORD_TO_RULES` maps all 8 reveal keywords to the branch-lists in §The Parameterization.

### B) Executor + behavior identity
- [ ] `HERO_EFFECT_HANDLERS` has exactly ONE reveal entry (`reveal`); the 7 `reveal-*` entries are gone.
- [ ] Every pre-existing reveal assertion in `heroEffects.execute.test.ts` passes (behavior identity); per-keyword legacy-equivalence passes for all 8 — explicitly: `reveal-ko-or-draw` cost-0 KOs and never draws; `reveal-odd-draw` cost-0 no-op; `reveal-attack-choose` grants attack iff cost ≤ M, ALWAYS parks the discard-or-return choice, rejects a second park, and the `turnEconomy`-guard-before-park ordering holds; `reveal-ko-attack` KOs + grants fixed M atomically on cost-0 only.
- [ ] `pnpm sim:coverage --check` OK (per-set `noEffect` unchanged).

### C) Parser
- [ ] Each legacy `[keyword:reveal-*...]` token parses to its `LEGACY_REVEAL_KEYWORD_TO_RULES` branch-list; a parameterized reveal token and its legacy equivalent parse to the same descriptor (test).
- [ ] `data/cards/**` byte-unchanged (`git diff` empty).

### Behavior-identity surface
- [ ] The hook still records the legacy `reveal-*` keyword (narrative identity); `git diff --name-only` shows no change to `events/notableEvents.*`, any `apps/arena-client/**`, or the sentinel `*.replay.json`.

### Scope
- [ ] `git diff --name-only -- data/cards/` empty.
- [ ] No files outside `## Files Expected to Change` modified.

---

## Verification Steps

```pwsh
pnpm --filter @legendary-arena/game-engine build      # exits 0
pnpm --filter @legendary-arena/game-engine test       # all pass, 0 fail
pnpm sim:coverage --check                             # OK — per-set noEffect unchanged (the hero gate guards this WP)
Select-String -Path "packages\game-engine\src\hero\heroEffects.execute.ts" -Pattern "heroEffectRevealKo\b|heroEffectRevealMin|heroEffectRevealOddDraw|heroEffectRevealCostAttack|heroEffectRevealKoOrDraw|heroEffectRevealKoAttack|heroEffectRevealAttackChoose"   # no output (folded into one reveal handler)
git diff --name-only -- data/cards/                   # empty
git diff --name-only -- packages/game-engine/src/events/ apps/arena-client/ packages/game-engine/src/test/fixtures/   # empty
```

---

## Open Design Questions — ALL RESOLVED at pre-flight / copilot (2026-06-15)

> Resolutions locked in EC-284 §Locked Values + the Verdicts above. **Q1:** drift re-spec = `HANDLED_KEYWORDS` (8) for handler completeness ∪ the frozen-reveal set for `MVP_KEYWORDS` coverage; hard count `15 → 8`. **Q2:** **no reverse-map needed** — the hero hook records `keywords` independently of `effects`; the legacy reveal keyword stays on `hook.keywords`. **Q3:** a dedicated `REVEAL_RULE_PATTERN` regex, one rule per token (mirrors `COUNT_SCALED_PATTERN`), `attack-fixed-<n>` for amounts, `+`-joined actions, trailing `:continue`. **Q4:** implement the `revealCount` loop; seed/test count=1; the count=2 test MUST use a deck-mutating action (non-mutating actions at count>1 are deferred). The four entries below are the original framing, retained for traceability.

1. **`MVP_KEYWORDS` / handler-key drift after removing 7 reveal handlers.** The frozen `reveal-*` keywords stay in `HERO_KEYWORDS` (translation input) but lose their `HERO_EFFECT_HANDLERS` entries. The WP-251 bidirectional drift test (`Object.keys(HERO_EFFECT_HANDLERS)` == `MVP_KEYWORDS`) must be re-specified so the frozen-translated reveal keywords are recognized as handled-via-`reveal` (not flagged as missing). Lock the exact rule in the EC.
2. **Reverse-map necessity (heroes vs villains).** Confirm whether the hero applied-effects/narrative surface already records `keywords` independently (no reverse-map needed) or needs a `descriptor → legacy keyword` map like `descriptorToLegacyKeyword`. WP-252's villain hook needed it because `effects` was retyped; the hero hook keeps `keywords: HeroKeyword[]` separate from `effects: HeroEffectDescriptor[]` — verify the reveal keyword is still on `keywords`.
3. **Parameterized reveal token grammar.** Define the exact `[keyword:reveal:<predicate>:<action>...]` (or JSON-ish) marker grammar for the forward-compat parameterized form — must round-trip with the legacy tokens. (No card uses it this WP.)
4. **`revealCount > 1` — RESOLVED (operator, 2026-06-15): implement the multi-peek loop now (forward-compat), seed + test ONLY `revealCount: 1`.** Every current card peeks one card, so all 8 legacy translations carry `revealCount: 1`. The handler loops over the top `revealCount` cards in deck order, applying `revealRules` to each (so a card mutated/drawn shifts the next peek — specify the re-read-vs-snapshot semantics precisely in the EC; the count=1 path is unaffected and stays byte-identical). No card data uses count>1 this WP; a future multi-peek reveal is then data-only. **Guardrail:** the legacy-equivalence tests run at count=1; add ONE count=2 unit test of the loop mechanics only (no card-data marker).

---

## Lint Gate Self-Review (`00.3`)

All 21 sections resolved (PASS or justified N/A):
- **§1–§6 (structure, constraints, prerequisites, context, output, naming):** PASS — canonical names match `00.2`; ≤8 code files (2 new + 4 modified engine + 2 test, plus enumerated Amendment-A fixtures).
- **§7 deps:** PASS — no new npm deps.
- **§8 architecture:** PASS — Game Engine layer; `revealRules` is plain data, `HERO_EFFECT_HANDLERS` lives outside `G` (JSON-serializable); `ctx.random.*` only; no DB/network.
- **§9 Windows / §10 env / §11 auth:** N/A.
- **§12 test quality:** PASS — `node:test`, no `boardgame.io`; per-keyword legacy-equivalence + drift + dual-grammar + count=2-loop tests.
- **§13 commands / §14 acceptance / §15 DoD:** PASS — exact `pnpm` commands; binary criteria; DoD includes STATUS/DECISIONS/WORK_INDEX/EC_INDEX/mindmap.
- **§16 code style:** PASS — named handlers/helpers, no abbreviations, `// why:` on the translation seam + magnitude-gate exemption + the `continue`/`choose` ordering; no `.reduce()`.
- **§17 Vision:** Triggered (touches the replay-hash surface). **Determinism preserved:** the legacy reveal keyword stays recorded on `hook.keywords` (NO reverse-map needed — the hero narrative is independent of `effect.type`), and the replay harness uses `EMPTY_REGISTRY` (hero hooks `[]`), so the sentinel `finalStateHash` is byte-unchanged. No scoring/identity/leaderboard surface touched. No Vision conflict.
- **§18 prose-vs-grep:** PASS — the `Select-String` greps target source files, not this WP.
- **§19 bridge-vs-HEAD / §20 funding / §21 API catalog:** N/A.

## Pre-Flight & Copilot Verdicts

- **Pre-flight (`01.4`): NOT READY (as first drafted)** → reworked. Findings (all folded into EC-284 §Locked Values): **PS-1** the `executeSingleEffect` per-keyword magnitude pre-gate would skip the no-magnitude reveals once all dispatch as `'reveal'` (fix: exempt `'reveal'`, move gating into the translation + rules); **PS-2** the static translation dropped the handlers' invalid-magnitude whole-effect self-guards (fix: `revealRulesForLegacyKeyword(keyword, M)` returns `[]` for invalid M on the magnitude-requiring keywords); **PS-3** wrong test path (`rules/`, not `setup/heroAbility.setup.test.ts`) + the drift count must drop `15 → 8`. Resolved Q1 (drift re-spec = `HANDLED_KEYWORDS` 8 ∪ frozen-reveal set), **Q2 (NO reverse-map needed — definitive)**, Q3 (parameterized grammar regex), Q4 (count=2 must use a deck-mutating action).
- **Copilot (`01.7`): BLOCK (as first drafted)** → same root findings. Confirmed the byte-identity / hash story holds (empty-registry-protected; the hero narrative is independent of `effect.type`; no reverse-map). **BLOCKER-1** = PS-1 (magnitude pre-gate). **BLOCKER-2** = the first draft's Failure-Smell forbade the fixture-INPUT migration the collapse REQUIRES (fix: reclassify as Amendment-A — input `type`/`revealRules` shape migrates, assertion OUTPUTS stay identical). **MAJOR-3** = drop top-level `magnitude` (threshold→`predicate.threshold`, grant→`action.amount`); migrate the setup-test magnitude assertions. Flagged the coverage-gate claim as overstated (backstop, not identity proof).
- **Confirmation re-run after rework (2026-06-15): 9/10 findings RESOLVED + 2 residuals caught & fixed → PASS.** **RESIDUAL-1** — the PS-2 fix over-corrected: `reveal`/`reveal-min` have NO `< 1` guard (today M=0 is valid — `reveal` draws cost-0, `reveal-min` draws every card), so they must NOT no-op at M=0. Fixed by splitting the translation into a **valid-magnitude tier** `{reveal, reveal-min}` (no-op only on INVALID M; M=0 builds `cost-lte 0` / `cost-gte 0`) vs a **positive-magnitude tier** `{reveal-ko-or-draw, reveal-attack-choose, reveal-ko-attack}` (no-op on invalid-OR-`<1`), with explicit M=0 equivalence tests. **RESIDUAL-2** — the `reveal-ko-attack` action-list atomicity needs an explicit signal: fixed by the mutating-helper-returns-`applied` + break-on-false contract. Both locked in EC-284. Architecture sound throughout; no redesign, no card-data risk → **execution-ready.**

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0; `pnpm sim:coverage --check` OK
- [ ] `data/cards/**` byte-unchanged
- [ ] One `reveal` handler in `HERO_EFFECT_HANDLERS`; the 7 `reveal-*` handlers gone (`Select-String`)
- [ ] No files outside `## Files Expected to Change` modified
- [ ] `docs/ai/STATUS.md` updated — hero reveal family parameterized; new reveal variants are data-only
- [ ] `docs/ai/DECISIONS.md` updated — **D-24024** (parameterized reveal branch-list + `LEGACY_REVEAL_KEYWORD_TO_RULES`; retires the per-reveal-keyword cadence)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-253 checked off
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-284 marked Done
- [ ] `docs/05-ROADMAP-MINDMAP.md` WP-253 node added; `node scripts/roadmap-counts.mjs --check` passes
