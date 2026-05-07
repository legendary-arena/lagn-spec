# Copilot Check — WP-137 (Hero Card-Instance Distinctness + Data-Driven cardCounts)

**Date:** 2026-05-06
**Pre-flight verdict under review:** **NOT READY** (2026-05-06; see PS-1..PS-4 + RS-1..RS-6 in `preflight-wp137.md`).

> The 01.7 doc says the copilot check is **mandatory** when 01.4 returns READY TO EXECUTE; it may also run as an **early sanity check against a draft EC/WP before pre-flight**. Pre-flight returned NOT READY here, so this copilot check operates in early-sanity mode. Findings are recorded so when PS-1..PS-4 are resolved and pre-flight flips, the 30-issue lens has already been audited and the next gate is fast.

**Inputs reviewed:**
- EC: `docs/ai/execution-checklists/EC-137-hero-card-instance-distinctness-and-data-driven-card-counts.checklist.md`
- WP: `docs/ai/work-packets/WP-137-hero-card-instance-distinctness-and-data-driven-card-counts.md`
- Pre-flight: `docs/ai/invocations/preflight-wp137.md` (in-session)

---

## Overall Judgment

**SUSPEND**

The pre-flight verdict is NOT READY. The 30-issue lens reveals two RISKs that compound the pre-flight blockers (Issue 4 — Contract Drift between Types/Tests/Runtime, Issue 22 — Silent Failure vs Loud Failure timing) and one RISK each on Issues 11, 14, 21, 23, 27, 28. The remaining 22 issues PASS. The architectural shape of the change is sound — engine fan-out, registry-schema additivity, single-shuffle determinism, and three-site duplication-or-helper are all correctly motivated. But the versioning subsystem mismatch (PS-1, PS-2) and the missing `replay.execute.test.ts` cascade (PS-3) would cause architectural damage if execution proceeded as drafted: the migration would either fail to compile, mutate the wrong artifact axis, or quietly fail to register. **The pre-flight verdict remains suspended until PS-1..PS-4 resolve; the RS items below should fold into those resolutions.**

---

## Findings

### 1. Separation of Concerns & Boundaries

1. **Engine vs UI / App Boundary Drift — PASS.** WP forbids modification of `apps/server/**`, `apps/arena-client/**`, `apps/registry-viewer/**`, `packages/preplan/**`. `buildHeroDeck.ts` already excludes `boardgame.io` and `@legendary-arena/registry` imports — preserved. EC §Guardrails restates the exclusion list. Layer Boundary Authoritative section honored.

9. **UI Re-implements / Re-interprets Engine Logic — PASS.** WP §Non-Negotiable Constraints explicitly forbids any runtime consumer (move handlers, projection builders, replay verifiers, UI) from synthesizing or stripping hero card-instance ext_ids. The canonical emitter is `buildHeroDeckCards`; consumers do straight lookups by full ext_id.

16. **Lifecycle Wiring Creep — PASS.** No new wiring into `game.ts`, phase hooks, or moves. The fan-out happens at setup time only; the WP-031 D-3102 setup-only wiring discipline applies and is honored.

29. **Assumptions Leaking Across Layers — PASS.** The name-vs-slug asymmetry is resolved at exactly one seam in each of three engine-internal sites (the `nameLookup` Map). Schema authoritatively documents the asymmetry per the verbatim sentence required by EC §Required `// why:` Comments. No assumption flows from registry to consumer beyond the documented contract.

### 2. Determinism & Reproducibility

2. **Non-Determinism Introduced by Convenience — PASS.** No `Math.random()`, no `Date.now()`, no locale dependency. The single `ctx.random.Shuffle` call in `shuffleHeroDeck` is unchanged. Verification Step 4 grep gates `Math\.random\s*\(`. WP §Vision Alignment confirms determinism is *strengthened* (RNG-dependent invariant violation removed).

8. **No Single Debugging Truth Artifact — PASS.** The unshuffled flat array from `buildHeroDeckCards` is fully deterministic from `(heroDeckIds, registry)`; replay-hash regression guard is the canary; `JSON.stringify(G)` invariant continues to hold. EC §Common Failure Smells maps each likely failure mode to a deterministic diagnostic.

23. **Lack of Deterministic Ordering Guarantees — PASS.** WP §Scope A explicitly locks the emit order: rarity-map iteration order × `cards[]` order × per-copy emit order. Switching a card between cardCounts and rarity-map fallback "must not change its relative position in the reservoir, only the number of copies". The 100-seed integration test pins post-shuffle behavior across all RNG seeds.

### 3. Immutability & Mutation Discipline

3. **Confusion Between Pure Functions and Immer Mutation — PASS.** `buildHeroDeck` and the two fan-out branches are setup-time helpers called from `buildInitialGameState` (which is invoked inside `Game.setup()` under Immer). Helpers return new values; setup assigns into G. No new mutation surface introduced.

17. **Hidden Mutation via Aliasing — PASS.** `shuffleHeroDeck` already returns `context.random.Shuffle([...cards])` (defensive copy at the call site, verified at `buildHeroDeck.ts:279`). Per-copy emission pushes new strings; no array reference shared between callers. The fan-out builds new entries in `stats[extId]` / `displayData[extId]` — no aliasing surface.

### 4. Type Safety & Contract Integrity

4. **Contract Drift Between Types, Tests, and Runtime — RISK.** This is the core pre-flight blocker.
   - `versioning.types.ts` is named in WP §E as the bump site for "the replay schema version constant", but the file is type-only (107 lines, no exported constants). The actual `CURRENT_DATA_VERSION` lives in `versioning.check.ts:37`; `CURRENT_ENGINE_VERSION_VALUE` at line 29.
   - The phrase "replay schema version" doesn't map to any single constant in the project — D-0801 locks three independent axes (Engine / Data / Content). The WP must name the axis.
   - The `migrationRegistry` literal (`Object.freeze({})` at `versioning.migrate.ts:28`) is `Readonly<Record<MigrationKey, MigrationFn>>`. It cannot be mutated; the WP-137 migration must replace this literal with a new frozen object containing the registered MigrationFn — the WP doesn't say so.

   **FIX:** PS-1 + PS-2 in pre-flight already cover this. Tighten WP §E to: (a) name the engine version bump (e.g., `1.0.0` → `1.1.0`); (b) name the data axis bump (`CURRENT_DATA_VERSION` 1 → 2); (c) enumerate the `MigrationFn(payload: unknown): unknown` body; (d) specify the payload shape (likely `ReplayInput`); (e) add `packages/game-engine/package.json` to the allowlist for the engine-version mirror. Add a drift test that asserts `CURRENT_ENGINE_VERSION_VALUE` matches `package.json:version`.

5. **Optional Field Ambiguity (`exactOptionalPropertyTypes`) — RISK.** The new `cardCounts: Record<string, number> | null | undefined` field on `HeroSchema` introduces a three-state optionality (present-with-value, present-null, absent). The WP §Scope A handles this explicitly via the "valid `cardCounts` entry" predicate. **However**, the per-card `card.name` is `optional()` per `HeroCardSchema:65`, and `nameLookup.get(undefined)` returns `undefined` and falls through silently — the WP/EC don't explicitly call this out (RS-2 in pre-flight).

   **FIX:** add a sentence to WP §Scope A and EC §Locked Values: *"When `card.name` is `undefined`, `nameLookup.get(card.name)` yields `undefined` and the card falls through to the rarity-map branch. This is correct by construction (the missing-card-name fallback case covers it) but is documented here so future maintainers do not change the predicate."*

6. **Undefined Merge Semantics (Replace vs Append) — PASS.** No merging. The cardCounts vs rarity-map fork is a strict precedence: cardCounts wins when valid; rarity-map fallback otherwise; both-fail throws. WP §Scope A locks the predicate. No emergent behavior.

10. **Stringly-Typed Outcomes and Results — PASS.** `cardCounts` is `Record<string, number>`, not a string-discriminated outcome. Existing `RuleEffect` / `RuleTrigger` discriminants are unchanged. Drift test asserts `RARITY_COPY_COUNT` keys equal `SUPPORTED_RARITY_LABELS` (continuing the WP-007A/009A/014A/021 pattern).

21. **Type Widening at Boundaries — RISK.** `cardCounts: z.record(z.string(), z.number().int().min(1)).nullable().optional()` allows any string key — including `card.slug` strings if a future contributor reverses the lookup direction. The "always wrong" guardrail in EC §Guardrails ("`cardCounts[card.slug]` is ALWAYS WRONG") relies on prose enforcement, not type-level enforcement. There is no `CardDisplayName` branded alias preventing `card.slug` from satisfying `Record<string, number>` keys.

   **FIX (scope-neutral, optional):** add a regex grep to the verification gate that catches `cardCounts\[card\.slug\]` and `cardCounts\[.*\.slug\]` patterns anywhere in modified files. The EC §After Completing already includes `cardCounts\[card\.slug\]` — extend to `cardCounts\[\w+\.slug\]` with a `--ignore-case` flag to catch alias variations (`heroCard.slug`, `c.slug`, etc.). Alternatively, accept that the prose ban is sufficient and rely on the unit tests to catch the bug. The lighter fix is preferred — the existing EC line covers the common case; the test for "missing-card-name fallback" exercises the correct lookup direction.

27. **Weak Canonical Naming Discipline — RISK.** Two name choices warrant lockdown:
   - `cardCounts` vs `cardCopyCounts` vs `copyCounts` — the upstream patch uses `cardCounts`. Confirmed by reading `data/cards/2099.json` — the field IS `cardCounts`. Locked.
   - `nameLookup` vs `nameToCount` vs `cardCountsByName` — internal variable, not a public surface. Less critical, but consistency across the three sites helps the grep gate.

   **FIX:** EC §Locked Values already requires byte-for-byte parity (or shared helper) — name the helper or local variable explicitly. Recommendation: lock to `nameToCount: Map<string, number>` or `cardCountByName: Map<string, number>` — pick one, lock it. (RS-4 in pre-flight covers the broader author-choice question.)

### 5. Persistence & Serialization

7. **Persisting Runtime State by Accident — PASS.** `G.cardStats` and `G.cardDisplayData` are runtime-only maps; per-copy fan-out doesn't change the persistence class. `MatchSnapshot` per ARCHITECTURE.md §Section 3 stores counts only. WP §Out of Scope explicitly excludes `MatchSnapshot` shape.

19. **Weak JSON-Serializability Guarantees — PASS.** Per-copy entries are plain `{ attack, recruit, cost, fightCost }` and `{ extId, name, imageUrl, cost }` records. No functions, Maps, Sets, classes added to G. The `nameLookup` Map is a per-hero local in setup code, never stored in G. EC §Common Failure Smells covers `JSON.stringify(G)` failure modes.

24. **Mixed Persistence Concerns — PASS.** Schema additivity (registry data) is cleanly separated from runtime fan-out (engine setup). Versioning bump touches a different surface (replay artifacts). All three categories distinct.

### 6. Testing & Invariant Enforcement

11. **Tests Validate Behavior, Not Invariants — RISK.** EC §After Completing locks `N ≥ 8` new tests but does not lock the suite-count delta. WP-031 precedent shows this can produce a 358/93 vs 358/94 mismatch mid-execution. The test list also includes a 100-seed integration test in `gameRules.checks.test.ts` — if the test creates a new `describe()` block, suite delta is +1 there too.

   **FIX:** RS-3 in pre-flight covers this. Lock to `+2` suite delta in EC §After Completing — recommended split: one new `describe()` block in `buildHeroDeck.test.ts` for the cardCounts tests, one in `gameRules.checks.test.ts` for the 100-seed regression. Final lock: engine post = `(679 + N) / 150 / 0`. All other test files use `test()` calls inside existing suites for delta 0 there.

### 7. Scope & Execution Governance

12. **Scope Creep During "Small" Packets — PASS-with-caveat.** WP §Files Expected to Change is explicit. Verification Step 8 runs `git diff --name-only`. **Caveat:** PS-3 (`replay.execute.test.ts`) and the potential `replay-producer/samples/` sibling files (RS-5) extend the allowlist. After PS-3 lands, `## Files Expected to Change` should grow by exactly 1 file (the test file); RS-5 may grow it by 0–2. The "anything not explicitly allowed is forbidden" rule is preserved as long as the allowlist is updated, not silently expanded.

13. **Unclassified Directories and Ownership Ambiguity — PASS.** All target files live in already-classified directories: `setup/`, `economy/`, `versioning/`, `invariants/`, `replay/` (D-2706), `registry/src/`, `replay-producer/samples/`. No new directories.

30. **Missing Pre-Session Governance Fixes — RISK (the pre-flight blocker).** PS-1, PS-2, PS-3, PS-4 are all governance fixes that must land before execution. The pre-flight has captured them; the copilot check confirms they all qualify as scope-neutral wording / allowlist clarifications, not scope expansions.

   **FIX:** resolve PS-1..PS-4 in WP-137 + EC-137 + WORK_INDEX.md before running the session prompt. After resolution, the copilot check can be re-run and is expected to flip to CONFIRM.

### 8. Extensibility & Future-Proofing

14. **No Extension Seams for Future Growth — RISK (mild).** The `RARITY_COPY_COUNT` map remains the seam for sets without patch data; `cardCounts` is the data-driven path for sets with patch data. Both are extension seams. **However**, the WP also says: "If a set is later added that has neither `cardCounts` data nor a mapped rarity label, that is a content-drift bug to surface via the loud-fail throw and address in its own WP." This is correct policy, but the seam between "loud-fail" and "extension" is a one-way door — once a set fails loud, the operator's next move is unclear (extend rarity map? add cardCounts patch? both?).

   **FIX (governance, scope-neutral):** add a §Operator Playbook line to the WP under §Debuggability & Diagnostics: "When the loud-fail throw fires for a new set (`Both copy-count sources failed`), the operator's resolution path is (a) preferred — patch the upstream cardCounts data and re-run `apply-card-counts.mjs`; (b) fallback — extend `RARITY_COPY_COUNT` in a dedicated follow-up WP citing the rule source. Do not edit `RARITY_COPY_COUNT` inside this WP." This makes the seam explicit without introducing new code.

28. **No Upgrade or Deprecation Story — RISK.** The migration story is described in §E but is incomplete (PS-1, PS-2). The WP also says "legacy replays are documented as expected to fail re-verification because the shuffle order shifts" — but the migration framework's purpose is to guarantee semantic equivalence. The stated migration is best-effort schema compatibility only, not semantic equivalence — this is a meaningful concession.

   **FIX:** PS-1 + PS-2 cover the structural fix. **In addition**, add a verbatim sentence to the EC §Required `// why:` Comments for `versioning.migrate.ts`: *"This migration is best-effort schema compatibility only — it prevents `#`-absent crashes in legacy ext_ids. It does NOT guarantee semantic equivalence: pre-WP-137 replays are expected to fail re-verification because shuffle order shifts under the new copy-index convention."* The EC already has this text (line 44); confirm it is preserved verbatim during execution.

### 9. Documentation & Intent Clarity

15. **Missing "Why" for Invariants and Boundaries — PASS.** EC §Required `// why:` Comments enumerates six required `// why:` sites with citation requirements. WP §Scope A and §Non-Negotiable Constraints both cite D-13701, D-13501, D-13702, D-13703, D-10014 explicitly. The schema modification carries the verbatim name-vs-slug sentence.

20. **Ambiguous Authority Chain — PASS.** WP §Context (Read First) lists ARCHITECTURE.md, DECISIONS.md, the three locked decision IDs, and `.claude/rules/architecture.md / game-engine.md / registry.md`. The override hierarchy is preserved.

26. **Implicit Content Semantics — PASS.** The `cardCounts` shape, the name-vs-slug asymmetry, the `#<copyIndex>` grammar, and the "valid cardCounts entry" predicate are all written down explicitly. EC §Locked Values copies them verbatim. No reliance on names alone.

### 10. Error Handling & Failure Semantics

18. **Outcome Evaluation Timing Ambiguity — PASS.** All evaluation happens at setup time (`Game.setup()` → `buildInitialGameState` → `buildHeroDeck` / `buildCardStats` / `buildCardDisplayData`). No runtime evaluation; no before-vs-after-game-end timing question.

22. **Silent Failure vs Loud Failure Decisions Made Late — RISK.** The WP locks four distinct failure modes:
   - `cardCounts` missing/null: silent — fall through to rarity-map.
   - `cardCounts` orphan key (key not in `cards[].name`): silent — ignore.
   - `cardCounts` value invalid (non-integer, ≤ 0, etc.): silent — fall through to rarity-map.
   - Both `cardCounts` and rarity-map fail: loud — throw inside `Game.setup()`.

   The locked policy is consistent with `.claude/rules/game-engine.md §Throwing Convention` (only `Game.setup()` may throw) and the WP-014A/016/017/018 fail-closed pattern. **However**, the EC §After Completing grep for `cardCounts\[card\.slug\]` enforces the name-keyed lookup direction — if a future contributor switches direction, the silent-fall-through behavior would mask the bug everywhere except the both-fail throw, and the throw would only fire for cards not covered by the rarity map.

   **FIX:** EC §After Completing already covers `cardCounts\[card\.slug\]`. Recommend extending the grep to `cardCounts\[.+\.slug\]` (regex matching any `<varname>.slug` access) to catch alias variations. Also recommend adding **one** test for "lookup via slug instead of name returns no matches" — this is a regression-test for the most likely future bug. Both fixes are scope-neutral additions to existing test/grep gates.

### 11. Single Responsibility & Logic Clarity

25. **Overloaded Function Responsibilities — PASS.** Each modified function retains a single responsibility: `buildHeroDeckCards` emits the reservoir; `buildCardStats` hero branch fans out stats; `buildCardDisplayData` hero branch fans out display data. The shared resolution helper (RS-4) — when locked — has a single narrow job (resolve copy count for one card via cardCounts → rarity-map fallback). The `nameLookup: Map<string, number>` is built once at the top of each hero loop, scoped narrowly.

---

## Mandatory Governance Follow-ups

- **DECISIONS.md entries:** D-13701 (cardCounts authority + schema additive), D-13702 (`#N` suffix grammar), D-13703 (deferred placeholder closure). All three to land in numeric order at execution time. Already specified in WP/EC.
- **02-CODE-CATEGORIES.md update:** None required. All target directories pre-classified.
- **`.claude/rules/*.md` update:** None required. Existing rules cover the change.
- **WORK_INDEX.md update:** PS-4 — add WP-137 row in Phase 7 **before** execution. EC_INDEX.md already has EC-137 row at line 187 (status: Draft).
- **Test baseline lock:** RS-3 — lock `(679 + N) / 150 / 0` with `N ≥ 8` and suite delta `+2` in EC §After Completing.

---

## Pre-Flight Verdict Disposition

- [ ] CONFIRM — Pre-flight READY TO EXECUTE verdict stands. (Not applicable — pre-flight is NOT READY.)
- [ ] HOLD — Apply listed FIXes in-place, re-run copilot check.
- [x] **SUSPEND** — Pre-flight verdict suspended. Blockers (PS-1, PS-2, PS-3, PS-4) must be resolved; if scope changes (PS-2 expands the file allowlist for `package.json`; PS-3 expands for `replay.execute.test.ts`; PS-4 is governance only), re-run pre-flight before re-running copilot check.

The fixes for PS-1, PS-2, PS-3 each modify the WP allowlist by adding 1–2 files (`package.json`, `replay.execute.test.ts`, plus `versioning.check.ts` correction overlapping with the existing `versioning.types.ts` listing). That is a **scope change** — re-run pre-flight (specifically the Dependency Contract Verification, Structural Readiness, Scope Lock, Test Expectations, and Maintainability sections) before generating the session prompt. The Vision Sanity Check, Code Category Boundary Check, Mutation Boundary, and Established Patterns sections do not change.

PS-4 (WORK_INDEX row) is governance-only and does not require re-running pre-flight. Apply RS-1 through RS-6 inline as scope-neutral wording fixes.

---

## Summary

The substantive engineering of WP-137 is correct: per-copy distinctness is necessary, the three-site fan-out is the right shape, the registry-schema additive is appropriate, the precedent reuse (WP-014B/018/021/111/113) is sound, and Vision §3/§22 are strengthened. The architectural risk is low.

The execution risk is concentrated in the versioning subsystem (PS-1, PS-2) and a likely-needed cascade allowance (PS-3). These are spec-fidelity fixes, not redesigns. Once they land — together with the WORK_INDEX row (PS-4) and the six RS clarifications — the WP should pass both pre-flight and copilot check on the next pass and be safe to execute under EC mode.

---

## Re-Run — 2026-05-06 (Same Session, Post-Resolution)

**Re-run trigger:** Pre-flight Resolution Pass landed in the same session — PS-1, PS-2, PS-3, PS-4 all resolved in-place; RS-1..RS-6 all addressed via WP/EC text edits. Pre-flight verdict flipped to READY TO EXECUTE per `preflight-wp137.md §Final Verdict`.

Per `01.7 §Workflow Position`: a SUSPEND disposition flips when blockers are resolved. PS-2 and PS-3 changed scope (added `package.json`, `versioning.test.ts`, `replay.execute.test.ts` to the allowlist; substituted `versioning.check.ts` for `versioning.types.ts`); pre-flight was re-run via the abbreviated readiness sections in the same artifact. The 30-issue lens is re-checked below for any finding whose verdict changes after the resolutions.

### Findings Re-Checked

| # | Issue | Initial | Post-Resolution | Notes |
|---|---|---|---|---|
| 4 | Contract Drift Between Types/Tests/Runtime | RISK | **PASS** | PS-1 + PS-2 resolved. WP §E now names `versioning.check.ts` for the constants and `package.json` for the lockstep mirror. The migration registration is fully specified: `migrateHeroExtIdsForCopyIndex` (named export, never throws, recurses into `ReplayInput.moves[].args`) registered at key `'1.0.0->1.1.0'`. EC §Locked Values pins both axes, both bumps, and the migration key. |
| 5 | Optional Field Ambiguity (`exactOptionalPropertyTypes`) | RISK | **PASS** | RS-2 resolved. WP §Scope A explicitly documents that `card.name === undefined` falls through to the rarity-map branch via `nameLookup.get(undefined) === undefined`. |
| 11 | Tests Validate Behavior, Not Invariants | RISK | **PASS** | RS-3 resolved. EC §After Completing locks final test count `(679 + N) / 150 / 0`, suite delta `+2`. Per WP-031 precedent: bare `test()` calls in existing suites for delta 0; new `describe()` blocks for delta +1. |
| 14 | No Extension Seams for Future Growth | RISK | **PASS** | The dual-seam (cardCounts authoritative + rarity-map fallback) is preserved. Operator-playbook addition was a recommended FIX in initial pass; not strictly required to flip from RISK to PASS — the seam itself is intact. The known-data-anomaly subsection (RS-1) records the resolution path for future divergence. |
| 21 | Type Widening at Boundaries | RISK | **PASS-with-improvement** | RS-4 resolution adopted the recommended grep-gate strengthening. EC §After Completing now greps `cardCounts\[\w+\.slug\]` (not just `cardCounts\[card\.slug\]`) — catches alias variations. The shared-helper lock (RS-4) further reduces type-widening risk: the resolution helper has a narrow signature `(card: { name?: string; rarityLabel: string }, nameLookup: Map<string, number>) => number | null` that prevents accidental drift. |
| 22 | Silent Failure vs Loud Failure Decisions Made Late | RISK | **PASS** | The four-mode failure policy (silent fall-through for missing/orphan/invalid cardCounts; loud throw only when both sources fail) is unchanged but now reinforced by the shared helper's explicit `null` return contract for both-fail (caller in `buildHeroDeckCards` throws; the two fan-out callers silent-fall-through since their throw surface is reserved). The grep-gate strengthening (Issue 21) catches the most likely future regression. |
| 23 | Lack of Deterministic Ordering Guarantees | PASS | **PASS** | Unchanged. |
| 27 | Weak Canonical Naming Discipline | RISK | **PASS** | RS-4 lock includes named exports `resolveHeroCardCopyCount` and `buildCardCountsNameLookup`. The `cardCounts` field name is locked at the registry-schema layer matching the upstream patch verbatim. |
| 28 | No Upgrade or Deprecation Story | RISK | **PASS** | PS-2 resolution + EC §Required `// why:` Comments lock the verbatim "best-effort schema compatibility only" sentence on `migrateHeroExtIdsForCopyIndex`. The migration's contract is now explicit: prevents `#`-absent crashes, does NOT guarantee semantic equivalence, pre-WP-137 replays expected to fail re-verification. |
| 30 | Missing Pre-Session Governance Fixes | RISK | **PASS** | PS-1, PS-2, PS-3, PS-4 all resolved. RS-1 escalated via spawned follow-up task (chip emitted 2026-05-06). |

The remaining 22 issues were PASS in the initial pass and remain PASS.

### Mandatory Governance Follow-ups (Updated)

- **DECISIONS.md entries:** D-13701, D-13702, D-13703 still to land at execution time. Unchanged.
- **02-CODE-CATEGORIES.md update:** None required. Unchanged.
- **`.claude/rules/*.md` update:** None required. Unchanged.
- **WORK_INDEX.md update:** **DONE** — WP-137 row inserted; deferred placeholder updated to acknowledge supersession (final back-reference at execution time per WP §Definition of Done).
- **Test baseline lock:** **DONE** — `(679 + N) / 150 / 0`, `N ≥ 8`, suite delta `+2` locked in EC §After Completing + EC §Locked Values.
- **Spawned follow-up task:** captain-america cardCounts pipeline drift investigation (RS-1). Task chip emitted via `mcp__ccd_session__spawn_task` 2026-05-06.

### Pre-Flight Verdict Disposition (Updated)

- [x] **CONFIRM** — Pre-flight READY TO EXECUTE verdict (Resolution Pass, 2026-05-06) stands. Session prompt generation **authorized**.
- [ ] HOLD — Not applicable.
- [ ] SUSPEND — Not applicable.

### Final Re-Run Summary

All 30 issues PASS after resolution. Architectural shape unchanged: per-copy distinctness fix, three-site fan-out, registry additivity, single-shuffle determinism, layer boundaries. Spec-fidelity gaps closed: versioning subsystem correctly addressed, replay-test cascade allowed, WORK_INDEX governance row inserted. The known data anomaly (captain-america cardCounts drift) is documented as intentional bake-in with a spawned follow-up for the data-layer correction; it does not affect WP-137's bug-fix surface.

**Step 2 (session prompt generation) is authorized.** Execution under EC mode in a new Claude Code session may proceed.
