# EC-284 — Hero Reveal-* Collapse (Execution Checklist)

**Source:** docs/ai/work-packets/WP-253-hero-reveal-collapse.md
**Layer:** Game Engine / Contracts + Implementation (`packages/game-engine/src/{rules,hero,setup}/**`).
**No `data/cards/**` change** (the parser translates the 8 legacy `reveal-*` markers).
**Decision:** D-24024 (reserved).

Authoritative execution contract for WP-253. Compliance is binary. **Reworked 2026-06-15 after pre-flight (NOT READY) + copilot (BLOCK) — all findings folded into the Locked Values + Guardrails below.**

---

## Before Starting

- [ ] On `main`, clean, ff-synced. `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0 on the base; `pnpm sim:coverage --check` OK.
- [ ] Read `heroEffects.execute.ts` end-to-end; record each of the 8 reveal handler bodies verbatim AND the `executeSingleEffect` magnitude pre-gate (`MVP_KEYWORDS` membership at ~706; the `isValidMagnitude` requirement at ~714 with its `'ko'` / `NO_MAGNITUDE_KEYWORDS` / `'reveal-min'` exemptions; `NO_MAGNITUDE_KEYWORDS` at ~67 = `{rescue, reveal-ko, reveal-ko-or-draw, reveal-cost-attack, reveal-odd-draw}`).
- [ ] Record the sentinel replay `finalStateHash` — it MUST be unchanged at close.
- [ ] (Pre-flight RESOLVED — transcribe, do not re-investigate) The hero hook records the applied keyword on `keywords: HeroKeyword[]` **independently** of `effects` (`heroAbility.setup.ts` ~627-639); `executeHeroEffects` returns `void` and accumulates nothing; hero reveals never touch `notableEvents`; `EFFECT_KEYWORD_LABELS` is `Record<VillainEffectKeyword,…>` (villain-only). **⇒ NO reverse-map is needed.** Keyword identity stays on the frozen `hook.keywords`; the parser must keep writing the legacy `reveal-*` keyword there (translation affects only `effects`/`revealRules`).

---

## Locked Values

- **WP:** WP-253. **EC:** EC-284. **Decision:** D-24024 (reserved).
- **Predicate kinds (5, locked):** `always`, `cost-lte`, `cost-gte`, `cost-zero`, `cost-odd` (canonical `REVEAL_PREDICATE_KINDS`). `threshold?` applies to `cost-lte` / `cost-gte` only.
- **Action kinds (5, locked):** `draw` (deck-top → hand), `ko` (deck-top → ko), `attack-by-cost` (`turnEconomy.attack += cost`, no zone mutation, keep the `if (!G.turnEconomy) return` guard), `attack-fixed` (`turnEconomy.attack += amount`), `choose-discard-or-return` (park the existing `PendingHeroChoice {choiceType:'discard-or-return'}`) (canonical `REVEAL_ACTION_KINDS`). `amount?` applies to `attack-fixed` only.
- **`RevealRule` (locked):** `{ predicate: RevealPredicate; actions: RevealAction[]; continue?: boolean }`. Default (no `continue`) = stop after the first matching rule. `continue: true` = apply this rule's actions on match AND keep evaluating later rules.
- **Top-level `magnitude` is DROPPED for the collapsed `reveal` descriptor (locked — copilot MAJOR-3).** The threshold lives ONLY in `predicate.threshold`; a fixed attack grant lives ONLY in `action.amount`. The handler MUST NOT read `effect.magnitude`. The `heroAbility.setup.test.ts` reveal assertions that check `effect.magnitude` migrate to assert `revealRules` shape (the magnitude moved into the rule). This resolves the `magnitude`-semantic overload (threshold vs fixed-grant): `reveal-ko-attack`'s M is `attack-fixed.amount`, not a threshold.
- **Translation is a FUNCTION, not a static Record (locked — pre-flight PS-2 / copilot MAJOR-3 / confirmation RESIDUAL-1):** `revealRulesForLegacyKeyword(keyword, magnitude): RevealRule[]`. **TWO distinct magnitude tiers — the handlers do NOT share one `< 1` rule (confirmation RESIDUAL-1):**
  - **Valid-magnitude tier `{reveal, reveal-min}`** — these have **NO `< 1` self-guard**; today they reach the executor via the pre-gate's `isValidMagnitude` (which accepts `0`). Return `[]` ONLY for an **invalid** M (`isValidMagnitude(M)` false — undefined / non-finite / negative / non-integer). **M=0 is VALID:** `reveal` M=0 → `[{cost-lte 0 → [draw]}]` (draws a cost-0 card); `reveal-min` M=0 → `[{cost-gte 0 → [draw]}]` (draws EVERY card) — byte-identical to today. Add explicit M=0 equivalence tests for both (they must NOT no-op).
  - **Positive-magnitude tier `{reveal-ko-or-draw, reveal-attack-choose, reveal-ko-attack}`** — these DO have a `magnitude < 1 → return` whole-effect self-guard (`heroEffects.execute.ts` ~424 / ~516 / ~555). Return `[]` for **invalid OR `< 1`** M (e.g. `reveal-ko-or-draw` M=0 on a cost-0 card today does NOT KO → empty rules mandatory, since the `cost-zero` rule has no threshold to gate it).
  - **No-magnitude keywords `{reveal-ko, reveal-odd-draw, reveal-cost-attack}`** — magnitude ignored; always return the branch-list.
  For a magnitude that passes its tier, substitute M into the threshold/amount slot:
  - `reveal` (M) → `[{cost-lte M → [draw]}]`
  - `reveal-min` (M) → `[{cost-gte M → [draw]}]`
  - `reveal-odd-draw` → `[{cost-odd → [draw]}]`  (no magnitude)
  - `reveal-ko` → `[{cost-zero → [ko]}]`  (no magnitude)
  - `reveal-ko-or-draw` (M) → `[{cost-zero → [ko]}, {cost-lte M → [draw]}]`
  - `reveal-cost-attack` → `[{always → [attack-by-cost]}]`  (no magnitude)
  - `reveal-attack-choose` (M) → `[{cost-lte M → [attack-by-cost], continue:true}, {always → [choose-discard-or-return]}]`
  - `reveal-ko-attack` (M) → `[{cost-zero → [ko, attack-fixed amount:M]}]`
- **Magnitude pre-gate (locked — pre-flight PS-1 / copilot BLOCKER-1):** add `'reveal'` to the `executeSingleEffect` no-magnitude bypass (the `NO_MAGNITUDE_KEYWORDS` set or the gate-2 condition) so the collapsed `'reveal'` keyword NEVER hits the top-level magnitude requirement. ALL magnitude gating now lives in `revealRulesForLegacyKeyword` (empty rules for invalid M) + the per-rule predicate/action. The 7 legacy `reveal-*` keywords no longer reach the pre-gate (translated to `'reveal'`); leave `NO_MAGNITUDE_KEYWORDS`'s existing members as-is (harmless — those keywords no longer dispatch) or prune them with a `// why:` — specify which in execution, but `'reveal'` MUST be exempt.
- **Frozen, never extended:** the 8 `reveal-*` `HeroKeyword`s stay in the union + `HERO_KEYWORDS` as translation input ONLY; no `reveal-*` keyword is ever appended again. Non-reveal `HeroKeyword`s are untouched. `HERO_KEYWORDS` stays at its current 17 entries (the `heroAbility.setup.test.ts` 17-entry drift test needs NO edit).
- **`revealCount` (locked):** the handler loops over the top `revealCount` cards (default 1), re-reading `deck[0]` each iteration after the prior iteration's mutation. **Seed + test count=1 only.** Add exactly ONE count=2 unit test, and it **MUST use a deck-mutating action** (`draw` or `ko`) so the second iteration peeks a genuinely new top; non-deck-mutating actions (`attack-by-cost` / `attack-fixed`-no-KO / `choose-discard-or-return`) at count>1 would re-peek the same card and are explicitly **deferred/undefined this WP**. count=1 is byte-identical for all 8 (every current handler reads `deck[0]` once).
- **Handler-map (locked):** `HERO_EFFECT_HANDLERS` has ONE `reveal` entry after this WP; the 7 `reveal-*` entries + their handler functions are removed (logic folded into the parameterized `reveal` handler + per-action helpers holding the verbatim mutation bodies).
- **Drift-test re-spec (locked — pre-flight Q1):** the WP-251 bidirectional test currently asserts `Object.keys(HERO_EFFECT_HANDLERS)` == `MVP_KEYWORDS` with a hard `=== 15`. Split the two concerns:
  - **Handler completeness:** introduce an explicit `HANDLED_KEYWORDS` (the 8 keys: `draw, attack, recruit, ko, rescue, reveal, attack-per-count, optional-ko-reward`); assert `Object.keys(HERO_EFFECT_HANDLERS)` deep-equals it bidirectionally + `length === 8`.
  - **Executable-keyword coverage:** `MVP_KEYWORDS` = `HANDLED_KEYWORDS ∪ FROZEN_REVEAL_TRANSLATED` (the 7 `reveal-*` minus `reveal`); assert every member is either a handler key OR resolves through `revealRulesForLegacyKeyword` to a non-empty `reveal` descriptor for a valid magnitude. A keyword with neither a handler nor a translation entry FAILS. `// why:` D-24024. The hard count drops `15 → 8` for `HANDLED_KEYWORDS` — call it out (the `Select-String` check won't catch a stale count).
- **Commit message (execution):** `EC-284: hero reveal-* collapse — parameterized reveal branch-list (D-24024)`. (`EC-###:` prefix — code staged. The drafting commit that lands this WP+EC is a separate `SPEC:` commit.)

---

## Guardrails

- `data/cards/**` — **zero diff** (no re-marking; the parser translates the 8 legacy tokens).
- `HeroKeyword` / `HERO_KEYWORDS` — keep the 8 reveal entries frozen (17 total unchanged); do NOT append/reorder/delete.
- The branch-list (`revealRules`) is plain data on `HeroEffectDescriptor`; `HERO_EFFECT_HANDLERS` stays a module-level const — `G` stays JSON-serializable.
- No `.reduce()` in the handler, the rule loop, or the action helpers; explicit `for...of`.
- Unknown predicate/action kind → warn to `G.messages` + continue, never throw.
- **`reveal-attack-choose` (highest re-encoding risk — these are control-flow ordering, NOT expressible by the rule loop alone; hand-place them in the handler / `applyRevealChoose`):**
  - the `G.pendingHeroChoice !== undefined` reject-second guard fires **at the top, before any peek/attack/park** — a pending choice aborts the WHOLE effect (no attack either), not just the park.
  - the `G.turnEconomy`-guard fires **before** the park — if `turnEconomy` is undefined, the choice is NOT parked (the original D-22003 AC-9).
  - `continue:true` on the `cost-lte → attack-by-cost` rule so the `always → choose` rule still runs when cost ≤ M; the park happens regardless of the cost predicate.
- **`reveal-ko-or-draw` exclusivity:** cost-0 KOs and MUST NOT also draw — first-match-wins, NO `continue` on the `cost-zero` rule.
- **`reveal-ko-attack` atomicity (mechanism — confirmation RESIDUAL-2):** the mutating action helpers (`ko`, `draw`) return an `applied: boolean`; the rule's action loop **breaks** (skips the rule's remaining actions) when a mutating helper returns false. So `reveal-ko-attack`'s `[ko, attack-fixed]` grants the fixed attack ONLY after the `ko` move returned `found`; on `!found` `attack-fixed` is skipped (no partial mutation). Specify the helper return contract in the EC-executed code.
- **`notableEvents.{types,compose}.ts`, `EFFECT_KEYWORD_LABELS`, `apps/arena-client/**`, and the sentinel `*.replay.json` — zero diff.** The hook records the legacy reveal keyword on `hook.keywords` (no reverse-map), and the hash harness uses `EMPTY_REGISTRY` (hero hooks are `[]`), so these compile + hash unchanged. If `tsc` wants you to touch them, the keyword stopped being recorded on the hook — re-confine; never `as any`, never widen the allowlist.
- **Coverage-gate scope (corrected — both reviewers):** `pnpm sim:coverage --check` is a **backstop** (it buckets `noEffect` only when `effects.length === 0`; a reveal hook always has ≥1 effect, so the verdict is invariant to the `type`/`revealRules` change). It guards against accidentally emptying `effects`; it does NOT prove reveal behavior identity. **The per-keyword legacy-equivalence tests are the real identity proof** — do not lean on the gate for that.

---

## Required `// why:` Comments

- At `REVEAL_PREDICATE_KINDS` / `REVEAL_ACTION_KINDS`: canonical drift arrays (D-24024) — adding a kind needs array + union + DECISIONS.
- At `revealRulesForLegacyKeyword` + the two magnitude tiers: the migration seam keeping the 8 legacy card markers working unchanged; cite that `{reveal, reveal-min}` no-op only on INVALID M (M=0 is valid — builds `cost-lte 0` / `cost-gte 0`) while `{reveal-ko-or-draw, reveal-attack-choose, reveal-ko-attack}` no-op on invalid-OR-`<1` (reproducing their `magnitude < 1` self-guards) — D-24024 / confirmation RESIDUAL-1.
- At the `'reveal'` magnitude-pre-gate exemption: cite that all reveal magnitude gating moved into the translation + rules (D-24024 / pre-flight PS-1).
- At the `reveal` handler rule loop: first-match-wins-unless-`continue`; why `continue` exists (the `reveal-attack-choose` attack-then-always-park).
- At the `revealCount` loop: count=1 today, re-read-after-mutation, non-mutating-action-at-count>1 deferred.
- At `applyRevealChoose`: the preserved abort-before-attack reject-second + turnEconomy-guard-before-park ordering (D-22001/D-22003 carried forward).
- At the re-spec'd drift test (`HANDLED_KEYWORDS` / `MVP_KEYWORDS` split): why the frozen reveal keywords are handled-via-`reveal` (D-24024).
- At the parser dual-grammar site: legacy + parameterized both emit `revealRules` (D-24024 seam).

---

## Files to Produce

- `packages/game-engine/src/rules/revealRule.ts` — **new** — `RevealPredicate`/`RevealAction`/`RevealRule` + `REVEAL_PREDICATE_KINDS`/`REVEAL_ACTION_KINDS` + `REVEAL_KEYWORDS_REQUIRING_MAGNITUDE` + `revealRulesForLegacyKeyword(keyword, magnitude)`.
- `packages/game-engine/src/rules/heroAbility.types.ts` — **modified** — `revealCount?`/`revealRules?` on `HeroEffectDescriptor` (additive optional; top-level `magnitude` no longer used by reveal).
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — one parameterized `reveal` handler + per-action helpers; remove the 7 `reveal-*` handler functions + their entries; add `'reveal'` to the magnitude-pre-gate bypass; re-spec the drift authority (`HANDLED_KEYWORDS` / `MVP_KEYWORDS`).
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — dual (legacy + parameterized) reveal token grammar → `revealRules` via `revealRulesForLegacyKeyword`; keep writing the legacy keyword onto `hook.keywords`.
- `packages/game-engine/src/rules/revealRule.test.ts` — **new** — predicate/action drift + translation parity (incl. the invalid-M → empty-rules cases) + the "parser still records the legacy keyword on `hook.keywords`" assertion (NOT a reverse-map round-trip — none exists).
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — **Amendment-A fixture migration** (see below) + per-keyword legacy-equivalence (the 8) + the count=2 deck-mutating-action loop test + dual-grammar.
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** (NOTE: `rules/`, not `setup/`) — reveal token parse → branch-list; migrate the `effect.magnitude` reveal assertions to `revealRules` shape; the 17-entry `HERO_KEYWORDS` drift test stays untouched.
- (Plus any other `*.test.ts` with a hand-built reveal `HeroEffectDescriptor` fixture — enumerate at execution via `git grep -l "type: 'reveal" -- '*.test.ts'`.)
- (NO notableEvents / arena-client / replay-hash files — keyword-typed narrative stays byte-identical.)
- Governance: `STATUS.md`, `DECISIONS.md` (D-24024), `WORK_INDEX.md` (WP-253 ✅), `EC_INDEX.md` (EC-284 Done), `05-ROADMAP-MINDMAP.md`.

### Amendment-A fixture migration (locked — copilot BLOCKER-2)

Pre-existing executor + setup tests hand-build reveal descriptors with the legacy `type` and no `revealRules` (e.g. `{ type: 'reveal-ko' }`, `{ type: 'reveal-attack-choose', magnitude: 4 }`, `{ type: 'reveal-ko-attack', magnitude: 1 }`). Once those keys have no handler, dispatch is a silent skip and the assertions fail. **These fixtures MUST be migrated** to `{ type: 'reveal', revealCount: 1, revealRules: revealRulesForLegacyKeyword('<legacy>', M) }`. This is the WP-252 Amendment-A class: a **fixture-INPUT shape migration, NOT a behavior/expectation change** — the assertion OUTPUTS (zone contents, `turnEconomy`, `pendingHeroChoice`) MUST stay byte-identical. See the corrected Failure Smell below.

---

## After Completing

- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0.
- [ ] `pnpm --filter @legendary-arena/game-engine test` — all pass / 0 fail; every pre-existing reveal assertion OUTPUT unchanged (only fixture input shape migrated); per-keyword legacy-equivalence passes for all 8.
- [ ] `pnpm sim:coverage --check` OK (backstop — per-set `noEffect` unchanged).
- [ ] `Select-String -Path packages\game-engine\src\hero\heroEffects.execute.ts -Pattern "heroEffectRevealKo\b|heroEffectRevealMin|heroEffectRevealOddDraw|heroEffectRevealCostAttack|heroEffectRevealKoOrDraw|heroEffectRevealKoAttack|heroEffectRevealAttackChoose"` → no output.
- [ ] `REVEAL_PREDICATE_KINDS` = 5; `REVEAL_ACTION_KINDS` = 5; `revealRulesForLegacyKeyword` covers all 8 (incl. invalid-M → `[]`); `HANDLED_KEYWORDS` = 8 (drift count `15 → 8`); `HERO_KEYWORDS` reveal entries unchanged (8 of 17).
- [ ] `'reveal'` is exempt from the `executeSingleEffect` magnitude pre-gate (no-magnitude reveals — `reveal-ko`/`reveal-odd-draw`/`reveal-cost-attack` — still fire).
- [ ] Tests: each legacy `[keyword:reveal-*...]` and its parameterized form parse to the same descriptor; `reveal-ko-or-draw` cost-0 KOs-not-draws (and M=0 whole no-op — positive tier); **`reveal` M=0 draws a cost-0 card AND `reveal-min` M=0 draws every card (valid tier — must NOT no-op)**; `reveal-attack-choose` parks + abort-before-attack-on-pending + turnEconomy-guard-before-park; `reveal-ko-attack` atomic; count=2 loop advances on a deck-mutating action.
- [ ] `git diff --name-only -- data/cards/` → empty.
- [ ] `git diff --name-only -- packages/game-engine/src/events/ apps/arena-client/ packages/game-engine/src/test/fixtures/` → empty; sentinel `finalStateHash` unchanged.
- [ ] `git diff --name-only` → only Files to Produce + governance.
- [ ] `node scripts/roadmap-counts.mjs --check` passes (WP-253 node present).

---

## Common Failure Smells

- A pre-existing reveal test's **assertion OUTPUT** (zone/economy/pending result) needs changing → behavior changed; the translation must be output-identical. **Migrating a fixture's INPUT shape** (`type:'reveal-ko'` → `type:'reveal'` + `revealRules`) is REQUIRED and is NOT a behavior change (Amendment-A) — do not "revert" it.
- A no-magnitude reveal (`reveal-ko` / `reveal-odd-draw` / `reveal-cost-attack`) stops firing → `'reveal'` wasn't exempted from the magnitude pre-gate (PS-1).
- `reveal-ko-or-draw` with M=0 KOs a cost-0 card (today it no-ops) → `revealRulesForLegacyKeyword` didn't return `[]` for the positive-tier `< 1` case (PS-2).
- `reveal` or `reveal-min` STOPS drawing at M=0 → they were wrongly swept into the positive-magnitude tier; they are valid-tier (no-op only on INVALID M; M=0 builds `cost-lte 0` / `cost-gte 0` and draws) (confirmation RESIDUAL-1).
- `data/cards/**` in the diff → re-marking crept in; this WP translates. Revert.
- `reveal-ko-or-draw` draws a cost-0 card → exclusivity broke (a stray `continue` on the cost-zero rule).
- `reveal-attack-choose` parked when a choice was already pending, or granted attack then aborted, or parked with `turnEconomy` undefined → the abort-before-attack / guard-before-park ordering was lost.
- `reveal-ko-attack` granted attack without KO → the two-action atomicity broke (attack must follow `found`).
- `notableEvents.*` / arena-client / sentinel `*.replay.json` in the diff → the reveal keyword stopped being recorded on `hook.keywords`; restore it (no reverse-map needed — it's the parser writing `keywords`).
- The drift test fails → the `HANDLED_KEYWORDS` (8) / `MVP_KEYWORDS` (∪ frozen-reveal) split wasn't applied, or the `15 → 8` count wasn't updated.
- A `reveal-*` keyword was deleted from `HERO_KEYWORDS` → it must stay frozen as translation input.
- A setup test asserting `effect.magnitude` on a reveal still references the dropped top-level field → migrate it to assert `revealRules` shape.
