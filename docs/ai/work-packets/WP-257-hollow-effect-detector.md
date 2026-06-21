# WP-257 — Hollow Effect Detector (Engine Runtime Invariant; D-24033 + D-24034; Foundation for the Hollow-Effect Reporting Loop)

**Status:** Draft — pending review. Pre-flight READY (gates below).
**Primary Layer:** Game Engine (`packages/game-engine/src/{diagnostics,hero,villain,setup,rules}/**`). Single layer; no UI/registry/server surface.
**User-Visible Surface:** `none — infrastructure` — the detector emits a `G.messages` line (which already projects to `UIState.log`) and a runtime-only `G.diagnostics.hollowEffects` channel; the operator-facing surfaces (`/debug`, `/coverage`, the architect lane) are WP-258/259/260. STATUS.md at close states "No user-observable feature — infrastructure only; a hollow-effect log line may appear for a card that already did nothing."
**Dependencies:** `DESIGN-HOLLOW-EFFECT-DETECTION.md` (the design spine this implements — §2 invariant, §3 boundary, §4 seams, §5 channel, §8 AC). WP-251 ✅ (the `HANDLED_KEYWORDS`/`MVP_KEYWORDS` membership checks the hero detection reads, + the ImplementationMap drift pattern reused for the closed reason array). WP-200 ✅ (the `executeVillainAbilities` applied-keyword return + the ambush fire site this reads alongside). The hero mechanic ledger (PR #349) + coverage probe (WP-250) — the static counterparts this complements at runtime (NOT modified here).

---

## Session Context

When a card declares an ability but the runtime reaches no executable handler, the engine silently produces nothing — the same product-risk class as the Web-Shooters rescue no-op, but worse: a genuinely unimplemented mechanic (an ambush with no handler) is invisible. `executeHeroEffects` returns `void` and `coreMoves.impl.ts` discards it; `villainEffects.execute.ts` documents that out-of-vocabulary effects "safe-skip silently and are NOT included in the return array." Existing detection is **static** (the mechanic ledger / coverage gate at CI); nothing answers "which missing handler was actually encountered during play."

This packet adds the **runtime invariant** (`DESIGN-HOLLOW-EFFECT-DETECTION.md §2`): a declared ability whose executable handler is absent or unreachable is *hollow* and must be surfaced deterministically. It is the **foundation** — WP-258 (`/debug`), WP-259 (`/coverage` overlay), WP-260 (architect-lane intake) each consume the one signal this WP emits. The engine **only emits**; it never reports to a dashboard, writes a WP, or knows the downstream tooling exists (layer boundary).

**Detection sites write directly (pre-flight-locked).** The two effect executors — `executeHeroEffects` and `executeVillainAbilities` — already mutate `G` and already iterate the card's declared descriptors, silently skipping out-of-vocabulary ones. That skip site **is** the hollow site. So each executor records its own hollow events into `G.diagnostics` inline (exactly how `heroEffectRescue` and the WP-256 interpreter already write `G.messages`). This was chosen over a return-based design at pre-flight: changing `executeVillainAbilities`'s `VillainEffectKeyword[]` return would break `fightVillain.ts:127` (which captures `appliedFightEffects`) — a caller outside this WP's surface — for no benefit. Writing directly keeps **every existing caller and signature unchanged** (`coreMoves.impl.ts`, `fightVillain.ts`, `villainDeck.reveal.ts` are NOT touched).

**Split-vs-single (§Context rationale, per 01.0a Step 3):** this WP is ~14 files (≈ WP-256's footprint), single layer, 2 decisions — kept as one packet because the hero and villain paths **share** the `EffectExecutionOutcome` contract (§A), the `recordHollowEffect` writer + `G.diagnostics` channel (§A/§E), and the boundary decision (D-24033); splitting would duplicate the contract. **Pre-flight recommendation flagged for the operator:** the villain path (§C + its hook-type + test files, ~4 files) is the clean extraction into a fast-follow WP if a smaller first packet is preferred. Default here is one packet; the operator may split at review.

---

## The Keystone (D-24033)

> **This is NOT a state-diff detector. It is a handler-reachability detector.**

The most likely implementation drift is comparing pre/post `G` and flagging correct empty-supply or failed-condition behavior. The detector asks exactly one question: *did a declared mechanic reach an executable handler?* A reachable handler that intentionally no-ops (empty bystander supply, empty deck, a failed `[hc:]`/`[team:]` condition, an explicitly-deferred mechanic) is **not** hollow. Only an absent/unreachable handler (`parse-unrecognized`, `no-handler`, `unsupported-keyword`) is.

---

## Non-Negotiable Constraints

**Engine-wide:** `G` JSON-serializable (the channel holds plain `{string,number}` records only — no functions/Maps/Sets/Dates); `G.diagnostics` is **runtime-only**, never persisted, never snapshotted as a save-game, **never read as gameplay input** (no move, rule, or `endIf` may consume it); never throw in detection or effect execution (warn-and-continue; a missing/non-array `G.messages` must not throw); `ctx.random.*` only (the detector uses no randomness); deterministic (a pure declared-vs-reachable classification — no I/O, clock, async); ESM, Node v22+, `.test.ts`, no `.reduce()`, full file contents; the detector imports no `boardgame.io`/registry/server.

**Packet-specific:**
- **Reachability, not state-diff.** Classify on handler presence/reachability (the §A reason), never by diffing `G`. A test asserts an empty-supply rescue and a failed-condition hook produce **no** hollow record.
- **Executors write directly; no return/caller change.** `executeHeroEffects` stays `void`; `executeVillainAbilities` keeps its `VillainEffectKeyword[]` applied return byte-for-byte. Each records hollow events into `G.diagnostics` via the shared `recordHollowEffect`. `coreMoves.impl.ts`, `fightVillain.ts`, `villainDeck.reveal.ts` are NOT modified.
- **The closed reason union is drift-protected.** `EFFECT_EXECUTION_REASONS` is a canonical readonly array matched to its union by a drift test (code-style §Drift Detection), mirroring `REVEAL_ACTION_KINDS`.
- **Explicit deferred allowlist.** "Deferred = not hollow" holds ONLY for mechanics on an explicit allowlist constant (`DEFERRED_BY_DESIGN_MECHANICS`). `wound`/`conditional` have no handler today (absent from `HANDLED_KEYWORDS`); without the allowlist they would classify `no-handler` → hollow. The allowlist's contents are locked in D-24033.
- **`parse-unrecognized` requires marker-awareness.** Hooks carry parsed descriptors only, so an unresolved marker leaves an empty hook indistinguishable from flavor text. The parser MUST surface "saw a marker token, resolved it to nothing" onto an additive `unresolvedMarkers?: string[]` on the hook (BOTH `HeroAbilityHook` and the villain hook type) so flavor text does NOT flag and an unresolved marker DOES. This is part of D-24034.
- **Per-hook detection (hero).** A hollow record is emitted per fully-hollow hook (an ability line): a hook flags only when NONE of its declared effects reached a handler AND ≥1 resolved to a hollow reason. A hook with ≥1 reachable outcome does not flag (mixed-hook rule).
- **Bounded channel.** `G.diagnostics.hollowEffects` carries `HOLLOW_EFFECTS_CAP` + a `hollowEffectsDropped` count (mirroring the arena-client diagnostics ring buffer). Reset empty at `buildInitialGameState`, never mid-match. `recordHollowEffect` enforces the cap.
- **Message ≠ contract.** Each record appends one full-sentence `G.messages` line for operator visibility; the `HollowEffectRecord` is the machine-readable contract. Tests assert on the record, not the wording.

---

## Scope (In)

### A) New contract + writer — `diagnostics/hollowEffect.types.ts` + `diagnostics/hollowEffect.record.ts`
- **types** (`hollowEffect.types.ts`, the new contract file): `EffectExecutionReason` union + canonical `EFFECT_EXECUTION_REASONS = ['applied','handler-noop','condition-failed','deferred','no-handler','unsupported-keyword','parse-unrecognized']` (drift-tested) + `isHollowReason(reason)` (flags exactly `parse-unrecognized`/`no-handler`/`unsupported-keyword`); `EffectExecutionOutcome { declared; mechanic; timing; executed; reason }` (the internal per-effect classification both executors build); `HollowEffectRecord { cardId; cardType: 'hero'|'villain'|'henchman'; timing; mechanic; reason; turn }`; `GameDiagnostics { hollowEffects: HollowEffectRecord[]; hollowEffectsDropped: number }`; `HOLLOW_EFFECTS_CAP`; `DEFERRED_BY_DESIGN_MECHANICS: ReadonlySet<string>` (D-24033).
- **writer** (`hollowEffect.record.ts`): `recordHollowEffect(G, record)` — lazy-inits `G.diagnostics` (mirrors `pendingOptionalKoRewards`), pushes under the cap else increments `hollowEffectsDropped`, and appends the full-sentence `G.messages` line (guarded: non-array `G.messages` is a no-op, never a throw).

### B) Hero detection — `hero/heroEffects.execute.ts` (write-directly; stays `void`)
- `executeHeroEffects` builds an `EffectExecutionOutcome` per declared effect as it dispatches (`applied` when a handler mutated; `no-handler`/`unsupported-keyword` when `executeSingleEffect` skips a non-`MVP_KEYWORDS`/non-`HANDLED_KEYWORDS` keyword; `condition-failed` when the conditions gate blocks the hook; `deferred` for a `DEFERRED_BY_DESIGN_MECHANICS` mechanic; `parse-unrecognized` from the hook's `unresolvedMarkers`). After a hook resolves, if it is fully hollow (per-hook rule) it calls `recordHollowEffect`. `coreMoves.impl.ts` is NOT changed (the play-site call is a statement that already ignores the return).

### C) Villain / henchman detection — `villain/villainEffects.execute.ts` (write-directly; return unchanged)
- `executeVillainAbilities` already iterates the card's declared villain descriptors and skips out-of-vocabulary ones. At that skip site it classifies the descriptor (`no-handler`/`unsupported-keyword`/`parse-unrecognized` vs `applied`/`handler-noop`) and calls `recordHollowEffect` (cardType resolved from `G.villainDeckCardTypes`: `villain`|`henchman`). The `VillainEffectKeyword[]` applied return is **unchanged**; `villainDeck.reveal.ts` + `fightVillain.ts` are NOT touched.

### D) Parser unresolved-marker surfacing — `setup/heroAbility.setup.ts` + `setup/villainAbility.setup.ts` + the two hook-type files
- When a `[keyword:X]`/`[effect:X]` token resolves to no keyword/descriptor/composition and no recognized modifier, record the raw token on an additive `unresolvedMarkers?: string[]` on the hook.
- Add `unresolvedMarkers?: string[]` to `HeroAbilityHook` (`rules/heroAbility.types.ts`) and to the villain hook type (`rules/villainAbility.types.ts`).

### E) The `G` channel — `types.ts` + `setup/buildInitialGameState.ts`
- Add `diagnostics?: GameDiagnostics` (additive optional) to `LegendaryGameState`; initialize it empty at setup. NOT projected to `UIState` here (WP-258).

### F) Tests
- `diagnostics/hollowEffect.test.ts` — **new** — drift (`EFFECT_EXECUTION_REASONS` matches its union) + `isHollowReason` map + `recordHollowEffect` cap/dropped/lazy-init + non-array `G.messages` no-throw.
- Modified `hero/heroEffects.execute.test.ts` — unknown keyword → hollow record; unsupported keyword → hollow; **empty-supply rescue → NO record**; **failed condition → NO record**; deferred-allowlist mechanic → NO record; a hook with ≥1 reachable handler + 1 unhandled → NO record (mixed-hook).
- Modified `setup/heroAbility.setup.test.ts` — an unresolved marker → `unresolvedMarkers`; a flavor-text line → empty `unresolvedMarkers` (no flag).
- Modified `villain/villainEffects.execute.test.ts` — unknown ambush descriptor → hollow; recognized ambush handler that no-ops → NO record; **the `VillainEffectKeyword[]` applied return is byte-unchanged** (existing assertions pass untouched).

---

## Out of Scope
- **`/debug`, `/coverage`, the architect lane** — WP-258/259/260. This WP emits the signal only; no `apps/**`, no ledger write, no agent-pipeline awareness.
- **`UIState` projection of the channel** — WP-258. Only `G.messages` (which already projects to `UIState.log`) carries hollow info from this WP.
- **Any caller / return-contract change** — `executeHeroEffects` signature, `executeVillainAbilities` return, `coreMoves.impl.ts`, `fightVillain.ts`, `villainDeck.reveal.ts`, `notableEvents` are all untouched (the write-directly design avoids them).
- **Implementing any missing mechanic** — the detector makes gaps loud, it does not fill them.
- **Using the channel as gameplay input** — forbidden; no move/rule/`endIf` may read it.
- **New mechanic keywords / primitives / handlers** — `HeroKeyword`/`HERO_KEYWORDS`, `MVP_KEYWORDS`, `HANDLED_KEYWORDS`, the villain keyword union, and the WP-256 primitive registry are all unchanged.
- **Severity tiers / dedup beyond the cap** — a single flat capped list this WP; richer grouping is WP-258/259 presentation.

---

## Files Expected to Change
- `packages/game-engine/src/diagnostics/hollowEffect.types.ts` — **new (contract)** — reasons + `isHollowReason` + outcome + record + channel + cap + deferred allowlist.
- `packages/game-engine/src/diagnostics/hollowEffect.record.ts` — **new** — `recordHollowEffect` (lazy-init + cap + `G.messages` line).
- `packages/game-engine/src/hero/heroEffects.execute.ts` — **modified** — per-hook hollow detection + `recordHollowEffect` (stays `void`).
- `packages/game-engine/src/villain/villainEffects.execute.ts` — **modified** — per-descriptor hollow detection at the skip site (return unchanged).
- `packages/game-engine/src/rules/heroAbility.types.ts` — **modified** — `unresolvedMarkers?: string[]` on `HeroAbilityHook`.
- `packages/game-engine/src/rules/villainAbility.types.ts` — **modified** — `unresolvedMarkers?: string[]` on the villain hook type.
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — surface unresolved markers.
- `packages/game-engine/src/setup/villainAbility.setup.ts` — **modified** — surface unresolved markers.
- `packages/game-engine/src/types.ts` — **modified** — `diagnostics?: GameDiagnostics` on `LegendaryGameState`.
- `packages/game-engine/src/setup/buildInitialGameState.ts` — **modified** — initialize `G.diagnostics` empty at setup.
- `packages/game-engine/src/diagnostics/hollowEffect.test.ts` — **new** — drift + predicate + writer cap.
- `packages/game-engine/src/hero/heroEffects.execute.test.ts` — **modified** — hero hollow + false-positive guards.
- `packages/game-engine/src/setup/heroAbility.setup.test.ts` — **modified** — unresolved-marker vs flavor-text.
- `packages/game-engine/src/villain/villainEffects.execute.test.ts` — **modified** — villain hollow + recognized-no-op guard + applied-return-unchanged.

Governance at close: `docs/ai/STATUS.md`, `docs/ai/DECISIONS.md` (**D-24033** + **D-24034**), `docs/ai/work-packets/WORK_INDEX.md` (WP-257 ✅), `docs/ai/execution-checklists/EC_INDEX.md` (EC-288 Done), `docs/05-ROADMAP-MINDMAP.md` (WP-257 node).

No other files may be modified. **No barrel (`packages/game-engine/src/index.ts`) change** (the channel is engine-internal this WP; WP-258 exports the types when the client needs them). `data/cards/**` byte-unchanged.

---

## Acceptance Criteria

### A) Reachability classification, not state-diff (D-24033)
- [ ] A hero card with a declared effect whose keyword is unknown/unsupported records exactly one `HollowEffectRecord` (`reason ∈ {no-handler, unsupported-keyword}`).
- [ ] An empty-bystander-supply `rescue`, a failed `[hc:]`/`[team:]` condition, and an empty-deck reveal each record **NO** hollow record (reachable handler, intentional no-op).
- [ ] A mechanic on `DEFERRED_BY_DESIGN_MECHANICS` records **NO** hollow record.
- [ ] A hook with ≥1 reachable handler outcome records **NO** hollow record even if another declared effect is unhandled (mixed-hook, per-hook rule).

### B) Villain / henchman parity (return unchanged)
- [ ] An ambush descriptor with no executable handler records a `HollowEffectRecord` (`cardType ∈ {villain, henchman}`).
- [ ] A recognized ambush handler that no-ops records **NO** record.
- [ ] `executeVillainAbilities`'s `VillainEffectKeyword[]` applied return is byte-unchanged (the existing villain tests + `fightVillain.ts`/`villainDeck.reveal.ts` callers are untouched).

### C) `parse-unrecognized` vs flavor text
- [ ] An ability line carrying an unresolved marker surfaces it on `hook.unresolvedMarkers` and (at runtime) records `parse-unrecognized`.
- [ ] A pure flavor-text line surfaces an empty/absent `unresolvedMarkers` and records **NO** hollow event.

### D) Channel hygiene
- [ ] `EFFECT_EXECUTION_REASONS` matches its union exactly (drift test); `isHollowReason` flags exactly the three hollow reasons.
- [ ] Records are JSON-serializable; `recordHollowEffect` caps at `HOLLOW_EFFECTS_CAP` with `hollowEffectsDropped` incremented on overflow; reset empty at setup; non-array `G.messages` does not throw.
- [ ] No move, rule, or `endIf` reads `G.diagnostics` (grep-verified); the engine runs identically with the channel absent.

### E) Determinism / replay surface
- [ ] Same setup + seed + moves → identical `G.diagnostics.hollowEffects` (deterministic).
- [ ] Sentinel/replay `finalStateHash` unchanged — the replay harness uses `EMPTY_REGISTRY` (no hooks → no effects → no hollow records), so the channel stays empty in fixtures.
- [ ] `git diff --name-only` shows only Files Expected to Change + governance; `data/cards/**` empty; no `coreMoves.impl.ts`/`fightVillain.ts`/`villainDeck.reveal.ts`/`index.ts`/`apps/**` diff.

---

## Verification Steps

```pwsh
pnpm -r build                                          # exits 0 (engine build IS the typecheck)
pnpm --filter @legendary-arena/game-engine test        # all pass, 0 fail
git diff --name-only -- data/cards/                     # empty
git diff --name-only -- packages/game-engine/src/moves/coreMoves.impl.ts packages/game-engine/src/moves/fightVillain.ts packages/game-engine/src/villainDeck/villainDeck.reveal.ts packages/game-engine/src/index.ts apps/   # empty (write-directly = no caller churn)
# channel is never gameplay input — only the detector writes it:
Select-String -Path "packages\game-engine\src\**\*.ts" -Pattern "G\.diagnostics" | Where-Object { $_.Path -notmatch "diagnostics\\|heroEffects\.execute|villainEffects\.execute|buildInitialGameState|types\.ts" }   # empty
```

---

## Lint Gate Self-Review (`00.3`)

All 21 sections resolved (PASS or justified N/A):
- **§1–§6 (structure, constraints, prerequisites, context, output, naming):** PASS — sections in 00.1 order; canonical names match `00.2`; field/array names spelled out; single layer (game-engine); ~14 files (≈ WP-256), with the split rationale + the villain-fast-follow option in §Session Context.
- **§7 deps:** PASS — no new npm deps.
- **§8 architecture:** PASS — Game Engine layer; the channel is plain JSON in `G`, runtime-only, never persisted, never gameplay input; the detector imports no `boardgame.io`/registry/server; `ctx.random.*` only (unused — detection is deterministic). Engine emits the signal; the dashboard/agent-pipeline consumers are out of scope (no upward/sideways import). Detection writes at the executors' existing G-mutating skip sites (the `heroEffectRescue`/interpreter `G.messages`-write precedent).
- **§9 Windows / §10 env / §11 auth:** N/A.
- **§12 test quality:** PASS — `node:test`, no `boardgame.io`; drift + reachability classification + the false-positive guards (empty-supply/failed-condition/deferred) + unresolved-marker-vs-flavor + channel hygiene (cap/no-throw) + determinism + villain-applied-return-unchanged.
- **§13 commands / §14 acceptance / §15 DoD:** PASS — exact `pnpm` commands; binary criteria; DoD includes STATUS/DECISIONS/WORK_INDEX/EC_INDEX/mindmap.
- **§16 code style:** PASS — named helpers (`recordHollowEffect`, `isHollowReason`), full English words, `// why:` on the reachability-not-state-diff invariant, the deferred allowlist, the cap, the `unresolvedMarkers` seam, the never-gameplay-input rule; no `.reduce()`; types-vs-logic split (`hollowEffect.types.ts` vs `.record.ts`).
- **§17 Vision:** Triggered (touches determinism + the effect-execution surface). **Determinism preserved:** detection is a pure declared-vs-reachable classification; the channel is runtime-only, never persisted, never gameplay input; the replay harness is `EMPTY_REGISTRY`-protected → sentinel `finalStateHash` byte-unchanged. No scoring/identity/leaderboard/monetization surface. Advances product quality (hollow abilities become loud). No Vision conflict.
- **§18 prose-vs-grep:** PASS — the `G.diagnostics` grep gate (AC-D / Verification) targets the channel symbol; this WP's prose paraphrases it ("the channel"/"the detector") where a literal would inflate the count.
- **§19 bridge-vs-HEAD / §20 funding / §21 API catalog:** N/A (no HTTP endpoint or `apps/server` library surface; no funding/identity surface).

## Pre-Flight & Copilot Verdicts

- **Pre-flight (`01.4`): READY TO EXECUTE (2026-06-16, baseline `d6387ec7`).** **Dependencies:** WP-251 ✅ + WP-200 ✅ on `main`; the design spine (`DESIGN-HOLLOW-EFFECT-DETECTION.md`) lands in the same SPEC PR as this WP+EC. **Contract fidelity verified against source, not text:** `executeHeroEffects` returns `void` and every one of its ~90 callers (incl. `coreMoves.impl.ts:155`, `extIdReconciliation.e2e.test.ts:389`) is statement-form and ignores the return — so the hero detection adds no signature change; `executeVillainAbilities` returns `VillainEffectKeyword[]` and IS captured by `fightVillain.ts:127` (`appliedFightEffects`) + `villainDeck.reveal.ts:263` (`appliedAmbushEffects`), so the **return is held byte-unchanged** and the villain detection writes at the existing in-executor skip site (the redesign that resolved the original return-based draft's `fightVillain.ts` allowlist gap); `recordHollowEffect` mirrors the `pendingOptionalKoRewards` lazy-init + the `heroEffectRescue` `G.messages`-write precedent; `G.messages → UIState.log` (uiState.build) is the already-projected log surface. **Scope locked** to a closed allowlist (single layer; `coreMoves.impl.ts`/`fightVillain.ts`/`villainDeck.reveal.ts`/barrel/`apps/**`/`data/cards` all OUT, grep-gated in Verification). **Empirical Scaffold (`01.4 §Validation-Tightening`): N/A** — additive observation, not validation-tightening: no previously-accepted input is newly-rejected, no gameplay path changes outcome, and the one captured return (`executeVillainAbilities`) is held byte-unchanged so no existing valid-path fixture can break; execution still runs the full engine suite. **Risks resolved + locked:** (1) caller churn from a return change → eliminated by write-directly (HIGH→none); (2) the false-positive boundary → the reachability-not-state-diff keystone + the explicit deferred allowlist + dedicated empty-supply/failed-condition tests (D-24033); (3) `parse-unrecognized` indistinguishable from flavor text → the parser `unresolvedMarkers` surfacing (D-24034); (4) the hero hook-type + villain hook-type files for `unresolvedMarkers` are now in the allowlist (the original draft omitted them — pre-flight catch). Architectural-boundary confidence high (engine emits, never consumes downstream; `recordHollowEffect` is the single extension seam WP-258/259/260 read).
- **Copilot (`01.7`): PASS / CONFIRM (2026-06-16) — 2 RISKs resolved in the redesign, no SUSPEND.** Walked the 30-issue lens. **Cat-1 (Separation/Boundaries):** the engine emits a serializable signal and imports nothing downstream — the dashboard/architect-lane consumers are WP-258/259/260; the executors write at their own G-mutating sites (no new cross-module reach). **Cat-2 (Determinism):** pure classification, no clock/RNG/async; `EMPTY_REGISTRY` replay → `finalStateHash` unchanged. **Cat-5 (Persistence/Serialization):** `G.diagnostics` is plain JSON, runtime-only, never persisted, **never gameplay input** (the load-bearing rule, grep-gated). **Cat-3 (Immutability):** detection writes only inside the executors (already framework-authorized G-mutators), via `recordHollowEffect`. **Cat-4 (Type Safety):** the `VillainEffectKeyword[]` return is held byte-unchanged (resolves the original draft's would-be caller break). **RISK-1 (Cat-7 Scope — the original return-based draft):** changing `executeVillainAbilities`'s return touched `fightVillain.ts` (outside the allowlist) → FIX folded in: write-directly, return unchanged, callers untouched. **RISK-2 (Cat-4/6 — the original draft omitted the hook-type files for `unresolvedMarkers`):** FIX — `rules/heroAbility.types.ts` + `rules/villainAbility.types.ts` added to the allowlist. **Cat-8 (Extensibility):** `recordHollowEffect` + the closed drift-tested reason array are the clean seams; no mechanic-shaped macro. All FIXes are scope-corrections applied in this draft; no architectural rework remains → CONFIRM.

> **Drafting status (per 01.0a):** Steps 4–5 complete (WP + EC-288 written; pre-flight READY; copilot CONFIRM; lint 21/21). Step 6 (session prompt) + Step 7 (SPEC commit/PR/merge/branch-cleanup) follow. Phase 1 DoD is met when the SPEC PR merges and the draft branch is cleaned up.

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `pnpm -r build` + `pnpm --filter @legendary-arena/game-engine test` exit 0
- [ ] `data/cards/**` byte-unchanged; no `coreMoves.impl.ts`/`fightVillain.ts`/`villainDeck.reveal.ts`/barrel/`apps/**` change
- [ ] `G.diagnostics` is runtime-only, capped, and read by no move/rule/endIf (grep-clean)
- [ ] `HeroKeyword`/`HERO_KEYWORDS`/`MVP_KEYWORDS`/`HANDLED_KEYWORDS` + the villain keyword union unchanged; new reason array drift-protected
- [ ] `executeVillainAbilities`'s `VillainEffectKeyword[]` return byte-unchanged
- [ ] No files outside `## Files Expected to Change` modified
- [ ] `docs/ai/STATUS.md` updated — "No user-observable feature — infrastructure only" (foundation for WP-258/259/260)
- [ ] `docs/ai/DECISIONS.md` updated — **D-24033** (hollow-vs-legitimate boundary + reason taxonomy + deferred allowlist) and **D-24034** (`HollowEffectRecord` shape + `G.diagnostics` channel + cap/reset + parser `unresolvedMarkers` surfacing)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-257 checked off
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-288 marked Done
- [ ] `docs/05-ROADMAP-MINDMAP.md` WP-257 node added; `node scripts/roadmap-counts.mjs --check` passes
