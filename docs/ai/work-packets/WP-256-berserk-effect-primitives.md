# WP-256 — Berserk via Composable Effect Primitives (D-24029 First Proof Case; Bootstraps the Primitive Infrastructure)

**Status:** Draft — pending review.
**Primary Layer:** Game Engine / Contracts + Implementation (`packages/game-engine/src/{rules,hero,setup}/**`) + the Lever-3 coverage/ledger instruments (`scripts/**`, `docs/ai/coverage/**`).
**Dependencies:** D-24029 ✅ (ratified 2026-06-16, `f295f6ae`; the effect-descriptor-model decision this WP is the first proof case of), WP-251 ✅ (the `HERO_EFFECT_HANDLERS` ImplementationMap pattern this mirrors for the primitive registry), WP-253 ✅ (the `reveal` collapse — closed drift-array + dual-grammar parser precedent), WP-250 ✅ (the hero coverage gate this regenerates), the hero mechanic ledger (PR #349, the `ledger:heroes:check` gate this regenerates).

---

## Session Context

D-24029 ratified the shift from **closed mechanic keywords** to **composable primitives**: the engine interprets a small, closed, drift-tested registry of *primitives*, and card mechanics become *data* that composes them. The Levers (WP-250/251/252/253) parameterized *within* the closed keyword vocabulary; D-24029 takes the next step — *opening* the vocabulary so most new mechanics ship as data.

This packet is the **first proof case**: **Berserk**. Today `[keyword:Berserk]` (29 hero ability lines across `wpnx` + `xmen`) parses to nothing — it is one of the 122 unsupported mechanics the coverage probe enumerated (`DESIGN-EFFECT-AUTHORING-SCALE.md` §8). Implementing it the *old* way would mean adding a `'berserk'` `HeroKeyword` + canonical-array entry + handler + drift update + DECISIONS entry — the exact per-mechanic ceremony D-24029 exists to end.

Instead, Berserk is authored as a **composition of primitives**. The cost D-24029 named explicitly: **this first WP bootstraps the primitive infrastructure** — the homogeneous effect-descriptor AST, the interpreter (with the transient `bind`/`ref` execution context), and the first action/value primitives — so it is a *larger* first step than a narrow keyword would have been. The payoff (every cousin becomes data, forever) lands after it.

Berserk's rule (`data/metadata/keywords-full.json`): *"Discard the top card of your deck. You get +Attack equal to the discarded card's printed Attack."*

---

## The Composition (target descriptor)

A homogeneous AST — every node carries a `type`; the composition is an explicit `sequence`, never a raw array (D-24029 §Descriptor shape):

```ts
{
  type: 'sequence',
  steps: [
    { type: 'move-card',
      from: { owner: 'current-player', zone: 'deck', position: 'top' },
      to:   { owner: 'current-player', zone: 'discard' },
      bind: 'discardedCard' },
    { type: 'gain-resource',
      resource: 'attack',
      amount: { type: 'card-printed-stat', card: { ref: 'discardedCard' }, stat: 'attack' } }
  ]
}
```

The engine gains reusable primitives — `sequence`, `move-card`, `gain-resource`, the `card-printed-stat` value expression, and `bind`/`ref`. **Berserk itself is data.** The mechanically-identical cousin — discard the top card, gain **Recruit** equal to its printed Recruit — is then `resource: 'recruit'` + `stat: 'recruit'`: data, **no engine change** (this WP proves it with a test, §Acceptance Criteria D).

The underlying values already exist in `G` deterministically: `G.cardStats[id]` carries the printed `attack`/`recruit` resolved at setup (the `reveal` handler already reads it), so `card-printed-stat` is replay-safe.

---

## The Bootstrap — what closes is PRIMITIVES, not mechanics (D-24029 §7)

The closed union does not disappear — it **changes level**. This WP introduces a closed, drift-tested **primitive registry** (small, slow-growing) and leaves the closed `HeroKeyword` union **untouched** (no `berserk` member). The open **mechanic space** is a data registry mapping a card marker to a composition.

| Surface | Posture | This WP |
|---|---|---|
| Primitive node types (`sequence`/`move-card`/`gain-resource`) | **Closed**, versioned, drift-tested | 3 seeded |
| Value-expression types (`card-printed-stat`) | **Closed**, drift-tested | 1 seeded |
| Parameter unions (resource/zone/position/owner) | **Closed**, drift-tested | scoped to Berserk + its Recruit cousin |
| Composition markers (`berserk` → AST) | **Open**, data-authored, coverage-ledgered | 1 seeded (`berserk`) |
| `HeroKeyword` union | **Frozen** — unchanged (17 entries) | **no `berserk` member** |

> **Decide-in-Step-3 verdict (D-24029):** the descriptor keys off a **new primitive-type registry**, NOT the `HeroKeyword` union. `heroKeywords.ts` and its 17-entry drift test are untouched; the new registries carry their own drift tests (mirroring `revealRule.ts`'s `REVEAL_PREDICATE_KINDS`/`REVEAL_ACTION_KINDS`).

---

## Load-Bearing Invariant — the execution context (D-24029 §9)

> The execution context holding `bind`/`ref` values is created **per top-level effect evaluation**, is **lexically scoped to its enclosing `sequence`**, and is **NEVER written to `G`** — bound values are transient interpreter state, re-derived identically on replay, not game state.

A binding persisted into `G` would break the persistence boundary (`G` is runtime-only) and risk double-application on replay. The interpreter creates a local `Map` per top-level node, threads it down the recursion, and never assigns it onto `G`/`ctx`. This keeps `bind`/`ref` inside the determinism + `G`-is-runtime-only invariants. **This is the highest-risk invariant in the WP — it is repeated in the EC Guardrails.**

---

## Non-Negotiable Constraints

**Engine-wide:** `ctx.random.*` only (Berserk needs no randomness — see the empty-deck rule below); never throw in effect execution (unknown node/value type, missing `ref`, missing `cardStats` → warn to `G.messages` + continue); `G` JSON-serializable (the AST is plain data; the interpreter's ImplementationMaps + composition registry are module-level consts outside `G`; the `bind`/`ref` context is a local, never in `G`); ESM, Node v22+, `.test.ts`, no `.reduce()`, full file contents; no `boardgame.io`/registry import in the interpreter (it uses `zoneOps` + economy helpers only, like `heroEffects.execute.ts`).

**Packet-specific:**
- **`HeroKeyword` is frozen.** No `berserk` member; `HERO_KEYWORDS` stays at 17; its drift test needs **no edit**. Berserk attaches to a **new** optional `primitiveEffects?` field on `HeroAbilityHook`, never to `hook.keywords`.
- **Primitives are reusable + drift-protected.** Each closed union introduced gets a canonical readonly array + a drift test asserting array/union parity (code-style §Drift Detection); the node-type + value-expression registries are additionally asserted bidirectionally against their ImplementationMap keys (the WP-251 `HANDLED_KEYWORDS` pattern).
- **No mechanic-shaped macro.** A primitive named `discard-top-gain-from-stat` would FAIL D-24029 §6 — it recreates the closed-keyword problem one level up. The primitives are the orthogonal pieces (`move-card` + a top-of-deck endpoint + `bind` + `gain-resource` + a `card-printed-stat` value expression).
- **`data/cards/**` byte-unchanged.** The 29 `[keyword:Berserk]` markers already exist in the corpus; the parser learns to translate them. Zero re-marking (mirrors WP-252/253).
- **Empty-deck = deterministic no-op (no reshuffle).** `move-card` from an empty source zone moves nothing (mirrors the `reveal` handler's D-21502 empty-deck posture); the unbound `ref` then resolves to a `+0` gain. A reshuffle-on-empty would need `ctx.random` and an interaction model the bootstrap deliberately does not take on.
- **Missing `cardStats` = `+0` (deterministic).** `card-printed-stat` of a card with no `G.cardStats` entry (a S.H.I.E.L.D. starter, D-21502) returns 0 — the same accepted MVP limitation the `reveal` handler's skip-and-advance accepts; never throws.
- **No new per-card code.** Berserk and its cousin are AST data interpreted by the closed primitives; the only Berserk-specific artifact is the one seeded composition-marker row.

---

## Scope (In)

### A) New contract — `rules/effectPrimitive.types.ts` (the new contract file)
The homogeneous AST node union + value-expression union + the closed parameter unions, each with a canonical readonly array:
- `EffectNode` = `SequenceNode | MoveCardNode | GainResourceNode`; canonical `EFFECT_NODE_TYPES = ['sequence','move-card','gain-resource']`.
- `ValueExpression` = `CardPrintedStatExpression`; canonical `VALUE_EXPRESSION_TYPES = ['card-printed-stat']`.
- Parameter unions + arrays: `EFFECT_RESOURCE_KINDS = ['attack','recruit']`, `EFFECT_ZONE_KINDS = ['deck','discard']`, `EFFECT_CARD_POSITIONS = ['top']`, `EFFECT_OWNER_KINDS = ['current-player']`.
- `ZoneEndpoint { owner; zone; position? }`, `CardReference { ref: string }`, and the `EffectExecutionContext` type (the transient `bind` store — a `Map<string, CardExtId>`, documented as never-persisted).

### B) Interpreter — `hero/effectPrimitive.interpret.ts`
- `EFFECT_NODE_HANDLERS: Record<EffectNodeType, …>` + `VALUE_EXPRESSION_EVALUATORS: Record<ValueExpressionType, …>` — ImplementationMaps mirroring `HERO_EFFECT_HANDLERS`, held outside `G`.
- `interpretHeroPrimitiveEffect(G, ctx, playerID, node)` — the entry point: creates a **fresh** `EffectExecutionContext` per call and dispatches the top-level node.
- `sequence` iterates `steps`, threading the SAME context; `move-card` resolves `from`/`to` endpoints, moves the top card via `moveCardFromZone`, and stores the moved id under `bind` when present; `gain-resource` evaluates `amount` and adds to `G.turnEconomy` via `addResources` (guarded: undefined `turnEconomy` → warn + skip); `card-printed-stat` resolves `card.ref` from the context and reads `G.cardStats[id][stat]` (missing ref / missing entry → 0).
- Unknown node/value type → warn to `G.messages` + skip, never throw.

### C) Open mechanic space — `rules/heroCompositions.ts`
- `HERO_COMPOSITION_MARKERS: Record<string, EffectNode>` — the data registry seeded with exactly one entry: `berserk` → the §The Composition AST.
- `HERO_COMPOSITION_MARKER_NAMES: readonly string[]` — the canonical key array (imported by the coverage probe + ledger so they recognize composition markers without duplicating the vocabulary).

### D) Hook seam — `rules/heroAbility.types.ts`
- Add `primitiveEffects?: EffectNode[]` to `HeroAbilityHook` (additive optional; imports `EffectNode` from the new contract). Each element is a top-level effect with its own fresh context.

### E) Parser — `setup/heroAbility.setup.ts`
- A composition-marker step: when a `[keyword:X]` token's normalized name is a key in `HERO_COMPOSITION_MARKERS`, attach a copy of that composition to the hook's `primitiveEffects` (do NOT push to `hook.keywords` — `berserk` is not a `HeroKeyword`). Thread `primitiveEffects` into `buildHeroAbilityHooks`'s hook assembly.

### F) Executor seam — `hero/heroEffects.execute.ts`
- In `executeHeroEffects`, inside the existing conditions-passed block (so primitive effects are gated by the same hook conditions as legacy effects), iterate `hook.primitiveEffects` and call `interpretHeroPrimitiveEffect` per node.

### G) Lever-3 instruments — `scripts/hero-effect-coverage.mjs` + `scripts/hero-mechanic-ledger.mjs`
- Coverage probe: `classifyHook` counts a hook with non-empty `primitiveEffects` as `EXECUTABLE`; `KNOWN_MARKUP_KEYWORDS` becomes `HERO_KEYWORDS ∪ HERO_COMPOSITION_MARKER_NAMES` so a supported composition marker (`berserk`) leaves `unsupportedMechanics`.
- Ledger: `statusForMechanic` returns `executable` for a composition marker; the handler column for composition mechanics points at the interpreter + composition registry (not `heroEffects.execute.ts#<keyword>`).

### H) Regenerated artifacts
- `scripts/coverage/mechanic-provenance.json` — add `berserk` → `{ wp: "WP-256", decision: "D-24031" }`.
- `scripts/coverage/hero-effect-coverage.baseline.json` — regenerated (`wpnx`/`xmen` hero `noEffect` drops; `berserk` removed from `unsupportedMechanics`).
- `docs/ai/coverage/hero-mechanic-ledger.{json,csv}` — regenerated (`berserk` rows flip `unsupported → executable`).

### I) Tests
- New `rules/effectPrimitive.test.ts` — drift (all closed arrays match their unions; the two registries match their ImplementationMap keys bidirectionally) + interpreter behavior (Berserk end-to-end: top card → discard + `+Attack` = its printed attack; the **Recruit-cousin AST** → `+Recruit`, proving the cousin is data; empty-deck no-op; missing-`cardStats` → +0; unknown node/value → warn-not-throw; **the context is never written to `G`**).
- Modified `rules/heroAbility.setup.test.ts` — a `[keyword:Berserk]` ability → `hook.primitiveEffects` carries the Berserk composition, `hook.keywords` does NOT contain `berserk`, `HERO_KEYWORDS` still 17.
- Modified `hero/heroEffects.execute.test.ts` — `executeHeroEffects` integration: a hook with `primitiveEffects` mutates `G` (Berserk fires); a hook whose conditions fail does NOT.

---

## Out of Scope
- **The `[team:x-force]` conditional Berserk variant and the "+Recruit too" compound** — deferred to a follow-up WP (per the drafting brief). The base unconditional `[keyword:Berserk]` line is the proof case.
- **The `[keyword:Berserks]` plural marker** ("Berserk once for each Savagery stacked here") — a distinct count-scaled mechanic, stays `unsupported`.
- **Villain-side Berserk** (`wpnx` villain/henchman Berserk lines) — the hero composition seam does not touch the villain corpus or its (future) ledger.
- **No general AST-from-markup parser** and **no second composition card** — the cousin's representability is proven by a unit test, not by speculatively marking a card. Growing the registry beyond `berserk` is future, data-only work (D-24029 premature-abstraction counter-pressure).
- **No new primitive beyond the five Berserk needs.** A future mechanic that needs `draw-card`/`ko-card`/a selector/`conditional`/`for-each` earns its own primitive + ceremony then, not now.
- No `boardgame.io`/registry import in the interpreter; no `notableEvents`/`apps/arena-client/**` change (the AST is engine-internal, not projected to `UIState`); no change to the `HeroKeyword` union, `MVP_KEYWORDS`, or `HANDLED_KEYWORDS`.

---

## Files Expected to Change
- `packages/game-engine/src/rules/effectPrimitive.types.ts` — **new (contract)** — AST + value-expression unions, closed parameter arrays, `ZoneEndpoint`/`CardReference`/`EffectExecutionContext`.
- `packages/game-engine/src/hero/effectPrimitive.interpret.ts` — **new** — the interpreter, ImplementationMaps, per-top-level context, entry point.
- `packages/game-engine/src/rules/heroCompositions.ts` — **new (data)** — `HERO_COMPOSITION_MARKERS` (seeded `berserk`) + `HERO_COMPOSITION_MARKER_NAMES`.
- `packages/game-engine/src/rules/heroAbility.types.ts` — **modified** — `primitiveEffects?: EffectNode[]` on `HeroAbilityHook`.
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — composition-marker parse step → `primitiveEffects`; threaded into `buildHeroAbilityHooks`.
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — iterate `hook.primitiveEffects` through the interpreter inside the conditions-passed block.
- `packages/game-engine/src/rules/effectPrimitive.test.ts` — **new** — drift + interpreter behavior + cousin proof + context-not-in-`G`.
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** (NOTE: `rules/`, not `setup/`) — Berserk marker → `primitiveEffects`; `hook.keywords` excludes `berserk`; 17-entry `HERO_KEYWORDS` drift untouched.
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — `executeHeroEffects` primitive-path integration (conditions gate it).
- `scripts/hero-effect-coverage.mjs` — **modified** — `primitiveEffects` → EXECUTABLE; known-markup ∪ composition names.
- `scripts/hero-mechanic-ledger.mjs` — **modified** — composition marker → executable status + interpreter handler column.
- `scripts/coverage/mechanic-provenance.json` — **modified (data)** — `berserk` provenance row.
- `scripts/coverage/hero-effect-coverage.baseline.json` — **regenerated**.
- `docs/ai/coverage/hero-mechanic-ledger.json` + `.csv` — **regenerated**.

Governance at close: `docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (**D-24030** + **D-24031**), `docs/ai/work-packets/WORK_INDEX.md` (WP-256 ✅), `docs/ai/execution-checklists/EC_INDEX.md` (EC-287 Done), `docs/05-ROADMAP-MINDMAP.md` (WP-256 node).

No other files may be modified. `data/cards/**` MUST be unchanged. **No barrel (`packages/game-engine/src/index.ts`) change** — the scripts import the new symbols from their `dist/` module paths directly, and nothing in `apps/**` imports `EffectNode`.

---

## Acceptance Criteria

### A) Closed primitive registry (drift-protected)
- [ ] `EFFECT_NODE_TYPES` (3) + `VALUE_EXPRESSION_TYPES` (1) + `EFFECT_RESOURCE_KINDS` (2) + `EFFECT_ZONE_KINDS` (2) + `EFFECT_CARD_POSITIONS` (1) + `EFFECT_OWNER_KINDS` (1) each match their unions exactly (drift tests).
- [ ] `EFFECT_NODE_HANDLERS` keys deep-equal `EFFECT_NODE_TYPES`; `VALUE_EXPRESSION_EVALUATORS` keys deep-equal `VALUE_EXPRESSION_TYPES` (bidirectional, the WP-251 pattern).
- [ ] `HeroKeyword`/`HERO_KEYWORDS` unchanged (17); `MVP_KEYWORDS`/`HANDLED_KEYWORDS` unchanged.

### B) Berserk executes deterministically as data
- [ ] A hook bearing the `berserk` composition: playing the card discards the deck-top card and grants `+Attack` equal to its printed `attack` (read from `G.cardStats`). Empty deck → no move, `+0`. Missing `cardStats` entry → `+0`. Same setup + moves replays identically.
- [ ] `[keyword:Berserk]` parses to `hook.primitiveEffects` (the seeded composition); `hook.keywords` does NOT contain `berserk`; **no arbitrary per-card code** — only the AST interpreted by the closed primitives.
- [ ] The execution context (`bind`/`ref`) is never written to `G` (asserted: `G` after interpretation contains no binding field; `JSON.stringify(G)` carries no `discardedCard` key).

### C) Reusable + provenanced primitives
- [ ] The interpreter + primitives are exercised by a non-Berserk AST in tests (reusability), live in the drift-protected `effectPrimitive.types.ts`/`effectPrimitive.interpret.ts`, and carry their DECISIONS entries (**D-24030** primitive registry; **D-24031** composition seam).

### D) The cousin is data
- [ ] A mechanically-adjacent variant — discard the top card, gain **Recruit** equal to its printed Recruit (`resource: 'recruit'`, `stat: 'recruit'`) — is representable as a pure-data AST and the interpreter grants `+Recruit`, with **no new engine keyword, primitive, handler, or `HeroKeyword`** added. Proven by a test feeding the cousin AST to `interpretHeroPrimitiveEffect`.

### E) Coverage + ledger regenerated, gates green
- [ ] `pnpm sim:coverage --check` OK — `berserk` no longer in `unsupportedMechanics`; no set's `noEffect` rises (`wpnx`/`xmen` hero `noEffect` falls); baseline regenerated intentionally.
- [ ] `pnpm ledger:heroes:check` OK — `berserk` rows show `status: executable` with the interpreter handler + the `WP-256`/`D-24031` provenance; ledger files regenerated.

### F) Determinism / replay surface
- [ ] `data/cards/**` byte-unchanged (`git diff` empty).
- [ ] Sentinel/replay `finalStateHash` unchanged — the replay harness uses `EMPTY_REGISTRY` (hero hooks `[]`), so Berserk never fires in a fixture; if a fixture DID exercise a Berserk card it would re-baseline, but none does (verify per 01.5).
- [ ] `git diff --name-only` shows only Files Expected to Change + governance; no `index.ts`/`notableEvents`/`apps/arena-client/**`.

---

## Verification Steps

```pwsh
pnpm -r build                                         # exits 0 (scripts import dist)
pnpm --filter @legendary-arena/game-engine test       # all pass, 0 fail
pnpm sim:coverage --update-baseline                   # regenerate (berserk leaves unsupported; wpnx/xmen noEffect drops)
pnpm sim:coverage --check                             # OK — no set's noEffect rises
pnpm ledger:heroes                                    # regenerate the ledger
pnpm ledger:heroes:check                              # OK — berserk rows executable
git diff --name-only -- data/cards/                   # empty
git diff --name-only -- packages/game-engine/src/index.ts apps/arena-client/ packages/game-engine/src/events/   # empty
Select-String -Path "docs\ai\coverage\hero-mechanic-ledger.csv" -Pattern "berserk,.*,executable"   # rows present
```

---

## Lint Gate Self-Review (`00.3`)

All 21 sections resolved (PASS or justified N/A):
- **§1–§6 (structure, constraints, prerequisites, context, output, naming):** PASS — canonical names match `00.2`; field/array names spelled out (no abbreviations); the file count (~11 code/script + 3 regenerated data) reflects the front-loaded bootstrap D-24029 §9 ratified, not multi-concern scope. Single layer (game-engine + its instruments).
- **§7 deps:** PASS — no new npm deps.
- **§8 architecture:** PASS — Game Engine layer; the AST is plain data, the ImplementationMaps + composition registry are module-level consts outside `G` (JSON-serializable); the `bind`/`ref` context is a local `Map`, never persisted; no DB/network/registry/`boardgame.io` import in the interpreter; `ctx.random.*` only (unused — Berserk is deterministic without RNG).
- **§9 Windows / §10 env / §11 auth:** N/A.
- **§12 test quality:** PASS — `node:test`, no `boardgame.io`; drift + interpreter behavior + cousin-as-data + context-not-in-`G` + parser + executor-integration.
- **§13 commands / §14 acceptance / §15 DoD:** PASS — exact `pnpm` commands; binary criteria; DoD includes STATUS/DECISIONS/WORK_INDEX/EC_INDEX/mindmap + baseline + ledger regen.
- **§16 code style:** PASS — named handlers/helpers, full English words, `// why:` on the context-lifetime invariant, the empty-deck/missing-stats no-ops, the drift arrays, the composition-marker seam; no `.reduce()`.
- **§17 Vision:** Triggered (touches determinism / the effect-execution surface). **Determinism preserved:** the `bind`/`ref` context is transient and never in `G` (the load-bearing invariant), `card-printed-stat` reads setup-resolved `G.cardStats`, empty-deck/missing-stats are deterministic no-ops, and the replay harness is `EMPTY_REGISTRY`-protected → sentinel `finalStateHash` byte-unchanged. No scoring/identity/leaderboard surface touched. Directly advances Vision Secondary Goal 10 (expansions ship as data). No Vision conflict.
- **§18 prose-vs-grep:** PASS — the `Select-String` checks target generated artifacts, not this WP.
- **§19 bridge-vs-HEAD / §20 funding / §21 API catalog:** N/A (no HTTP endpoint or `apps/server` library surface changes).

## Pre-Flight & Copilot Verdicts

- **Pre-flight (`01.4`): READY TO EXECUTE (2026-06-16, baseline `f295f6ae`).** Dependencies are on `main` (D-24029 ratified; WP-251 `HERO_EFFECT_HANDLERS`, WP-253 `revealRule.ts` drift/dual-grammar precedent, WP-250 coverage gate, the PR #349 ledger — all Done). Contract fidelity verified against source, not just the WP text: `moveCardFromZone(from, to, cardId) → {from, to, found}` (`zoneOps.ts`), `addResources(turnEconomy, attack, recruit)` (`economy.logic.ts`), `G.cardStats[id].attack/recruit` (the `reveal` handler reads exactly this), the parser's `[keyword:X]` loop + `isValidHeroKeyword` (`heroAbility.setup.ts`), `classifyHook`/`KNOWN_MARKUP_KEYWORDS` (`hero-effect-coverage.mjs`), `statusForMechanic`/handler column (`hero-mechanic-ledger.mjs`), the provenance-map shape, the 17-entry `HERO_KEYWORDS` drift test (untouched), and `EMPTY_REGISTRY` replay fixtures (Berserk never fires in a fixture → `finalStateHash` unchanged). Scope is locked to a closed allowlist (single layer; `data/cards`/barrel/`notableEvents`/arena-client out). Risks resolved + locked in EC-287: empty-deck no-op, missing-`cardStats` → 0, the context-never-in-`G` invariant, the cousin-as-data test, and (post-copilot) the legacy-then-primitive effect order. **Empirical Scaffold (01.4 §Validation-Tightening): N/A** — this WP is *additive recognition* (a previously-ignored marker becomes executable), not validation-tightening (no previously-accepted input is newly-rejected), so no pre-existing valid-path fixture can break on the change; execution still runs the full suite + regenerates the baseline (EC After-Completing). Architectural boundary confidence is high (interpreter imports only `zoneOps`/`addResources`; ImplementationMaps + registry live outside `G`); the composition-registry row is the clean extension seam for every cousin.
- **Copilot (`01.7`): PASS (2026-06-16) — 2 RISKs resolved in-place + 1 hardening, no BLOCK.** Walked all 30 modes; the determinism (§2), persistence (§5 — the context-not-in-`G` invariant), boundary (§1 — no UI/registry leak), and extensibility (§8 — the registry seam, with D-24029 §10 premature-abstraction counter-pressure explicitly addressed) modes are explicitly prevented. **RISK-1 (Mode 4/22 — coverage regen masking):** `sim:coverage --check` against a *regenerated* baseline is trivially green; FIX folded into EC After-Completing — execution MUST inspect the baseline `git diff` and confirm ONLY `wpnx`/`xmen` `noEffect` falls + `berserk` leaves `unsupportedMechanics`, no other set moves. **RISK-2 (Mode 6 — undefined merge/order):** a line carrying both a legacy effect and the composition had unspecified execution order; FIX — EC locks `primitiveEffects` to run AFTER legacy `effects`, in array order, inside the conditions gate (`// why:` required). **Hardening (Mode 17 — aliasing):** the parser attaches a deep copy of the registry AST (never the shared const), folded into the EC parser-seam lock + a Failure Smell. All scope-neutral; no architectural rework.

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `pnpm -r build` + `pnpm --filter @legendary-arena/game-engine test` exit 0; `pnpm sim:coverage --check` OK; `pnpm ledger:heroes:check` OK
- [ ] `data/cards/**` byte-unchanged; no barrel/`notableEvents`/`apps/arena-client` change
- [ ] `HERO_KEYWORDS` unchanged (17); the new closed registries drift-protected
- [ ] No files outside `## Files Expected to Change` modified
- [ ] `docs/ai/STATUS.md` updated — Berserk live as the first composable-primitive mechanic; cousins are data-only
- [ ] `docs/ai/DECISIONS.md` updated — **D-24030** (effect primitive registry + interpreter + transient execution-context invariant) and **D-24031** (hero composition-marker seam; the open mechanic space)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-256 checked off
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-287 marked Done
- [ ] `docs/05-ROADMAP-MINDMAP.md` WP-256 node added; `node scripts/roadmap-counts.mjs --check` passes
