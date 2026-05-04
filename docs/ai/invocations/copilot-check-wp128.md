# Copilot Check — WP-128 (UIState Projection Extensions for Board Layout)

**Date:** 2026-05-03 (initial 2026-05-03; re-run 2026-05-03 post-PS-1..PS-4)
**Pre-flight verdict under review:** READY TO EXECUTE — unconditional after PS-1..PS-4 resolution (`docs/ai/invocations/preflight-wp128.md` §Resolution Log, 2026-05-03)
**Inputs reviewed:**
- EC: `docs/ai/execution-checklists/EC-131-uistate-projection-extensions-for-board-layout.checklist.md` (post-resolution)
- WP: `docs/ai/work-packets/WP-128-uistate-projection-extensions-for-board-layout.md` (post-resolution)
- Pre-flight: `docs/ai/invocations/preflight-wp128.md` (post-Resolution Log)

---

## Overall Judgment

**CONFIRM** (Re-run 2026-05-03, post-PS-1..PS-4 resolution).

**Initial pass (2026-05-03, pre-resolution):** RISK — five RISK findings (#22, #26, #27, #29, #30) under the SUSPEND disposition driven by pre-flight's BLOCKING discovery that 8 of 17 projection fields lacked a `G` source. No independent BLOCK from the 30-issue lens — the cumulative risk was subsumed by pre-flight's verdict.

**Re-run (2026-05-03, post-resolution):** PS-1..PS-4 landed as scope-neutral / scope-narrowing amendments to WP-128 + EC-131. PS-1 (`G.piles.ko` → `G.ko`) and PS-2 (`victoryVp` → `victoryVP` + canonical source) are mechanical corrections. PS-3 (Option A safe-skip lock — D-12806 commitment, 8 sites, `// SAFE-SKIP-WP128` markers, drift-test pinning) converts the silent-gap blocker into auditable, machine-greppable safe-skips mirroring the WP-023 / WP-025 / WP-026 / WP-030 precedent. PS-4 (D-DEC-5 Interpretation B lock — `mastermind.attachedBystanders` projects `[]` until a future WP) closes the cross-layer semantic mismatch surfaced under finding #29. All five originally-RISK findings now resolve to PASS. The 30-issue scan returns **30 PASS / 0 RISK / 0 BLOCK**. Pre-flight's READY TO EXECUTE verdict is now unconditional. **Session prompt generation authorized** per `01.4 §Authorized Next Step`.

Findings detail below preserves the original RISK framing for audit purposes; the five resolved items are individually marked **RESOLVED** with the resolution citation.

---

## Findings

Grouped by the 11 categories in `01.7-copilot-check.md`. Twenty-five PASS findings are consolidated where they require no narrative; five RESOLVED findings are detailed with their FIX citation. `BLOCK` reserved for the overall verdict — none assigned.

### Category 1: Separation of Concerns & Boundaries

**1. Engine vs UI / App Boundary Drift** — PASS. WP-128 §Non-Negotiable + EC-131 §3 forbid `boardgame.io` / registry runtime / server / network / filesystem imports in `uiState.{types,build,filter}.ts`. EC §5 verification gates grep-enforce. Mirrors WP-028 / WP-029 / WP-067 / WP-111 viewer-of-engine precedent.

**9. UI Re-implements or Re-interprets Engine Logic** — PASS. WP-128 ships projection contract only; composition counters explicitly deferred to WP-129 (D-DEC-2 + WP-129 D-12906 cascade). UI consumes `UIState` only; no rederivation expected. The `victoryVP` projection delegates to `computeFinalScores(G).players[i].totalVP` — no parallel scoring path.

**16. Lifecycle Wiring Creep** — PASS. WP §Out of Scope forbids `game.ts` / move / phase hook touch. EC-131 §3 reinforces. Per `01.5-runtime-wiring-allowance.md` triggers, **NOT INVOKED for new G fields / setup shape change / move map / phase hook** — see §3 of session prompt. The 01.5 conditional cascade allowance covers replay-hash literal updates only (EC-131 §2 binary procedure).

**29. Assumptions Leaking Across Layers** — **RESOLVED.** Initial pass flagged R-4 (`mastermind.attachedBystanders` semantic mismatch — wireframe assumed "bystanders attached to the mastermind" but engine `G.attachedBystanders` is keyed by city villain). **FIX applied (PS-4):** D-DEC-5 expanded to record both shape AND data semantics; **Interpretation B locked** — projection is `[]` (Option A safe-skip, marker `// SAFE-SKIP-WP128`) until a future WP adds `G.mastermind.attachedBystanders` for Master Strike captures. Explicit "do NOT flatten `G.attachedBystanders`" guardrail appears at three levels (Non-Negotiable, D-DEC-5, EC §2). Citation: `docs/ai/invocations/preflight-wp128.md §Resolution Log` PS-4.

### Category 2: Determinism & Reproducibility

**2. Non-Determinism Introduced by Convenience** — PASS. EC §3 explicitly forbids `Math.random()` / `Date.now()` / network / filesystem. EC §5 verification gate greps for these. WP-128 §Non-Negotiable repeats prohibition. Projection is pure derivation from `G`.

**8. No Single Debugging Truth Artifact** — PASS. Replay determinism preserved (UIState is downstream of `computeStateHash`; safe-skip values are constants). 01.5 cascade procedure binary in EC §2: capture pre-hash → capture post-hash → conditional update only on divergence; D-12807 records resolution at session close.

**23. Lack of Deterministic Ordering Guarantees** — PASS. New array fields (`victoryCards`, `inPlayCards`, `koPile.cards`) inherit deterministic ordering from underlying `G.playerZones[id].{victory, inPlay, ...}` and `G.ko`. `for...of` over `Object.values(playerZones)` matches existing `buildUIState` pattern. Safe-skip arrays are `[]` (deterministic).

### Category 3: Immutability & Mutation Discipline

**3. Confusion Between Pure Functions and Immer Mutation** — PASS. Projection is pure (no mutation). WP §Non-Negotiable and EC §3 cite WP-028 D-2801 purity contract. No Immer drafts in projection / filter files.

**17. Hidden Mutation via Aliasing** — PASS. EC §3 lists three forbidden aliasing anti-patterns plus the correct shape (per-entry shallow copy via `{ ...entry }`). WP-111 D-11105 cited as precedent. EC §5 includes an aliasing test gate (mutate returned `victoryCards` entry → next `buildUIState` call returns un-corrupted shape).

### Category 4: Type Safety & Contract Integrity

**4. Contract Drift Between Types, Tests, and Runtime** — PASS. Drift test extended (EC §5 line 102 greps for all 11 new field names; ≥11 matches required, and additionally pins safe-skip values via separate assertions per EC §5).

**5. Optional Field Ambiguity (`exactOptionalPropertyTypes`)** — PASS. EC §4 requires `discardTopCard?: T | null` `// why:` comment explaining the optional-AND-nullable combo (`?` encodes redaction, `null` encodes empty discard). Filter rules use D-2902 conditional-assignment pattern (no `undefined` literal assignment).

**6. Undefined Merge Semantics (Replace vs Append)** — PASS. Audience filter rules explicit: redact = omit (D-2902 `exactOptionalPropertyTypes` conditional-assignment); not "replace with undefined". Safe-skip required fields use typed-stable defaults (`[]` / `0`) — never `undefined`.

**10. Stringly-Typed Outcomes and Results** — PASS. No new outcome strings introduced. Existing `UIAudience` closed set explicitly locked. Safe-skip marker `SAFE-SKIP-WP128` is a single locked literal in EC §4 / §5.

**21. Type Widening at Boundaries** — PASS. `extId: string` matches `CardExtId = string` alias. No `any` / `unknown` widening. `UIDisplayEntry` shape (`{ extId: string; display: UICardDisplay }`) defined once and reused — EC §2.

**27. Weak Canonical Naming Discipline** — **RESOLVED.** Initial pass flagged `victoryVp` (lowercase Vp) as drift from `PlayerScoreBreakdown.totalVP` engine convention (`scoring/scoring.types.ts:53`; `00.6` Rule 14). **FIX applied (PS-2):** rename to `victoryVP` (uppercase VP) throughout WP-128 and EC-131; source path explicit as `computeFinalScores(G).players[i].totalVP`. Citation: `docs/ai/invocations/preflight-wp128.md §Resolution Log` PS-2. Common Failure Smell entry added to EC §Failure Smells warning against the lowercase form.

### Category 5: Persistence & Serialization

**7. Persisting Runtime State by Accident** — PASS. Projection types are JSON-serializable; not persisted; Acceptance Criteria includes JSON-roundtrip test. No new G fields added (Option A safe-skips use existing `G` paths or constants — no persistence surface introduced).

**19. Weak JSON-Serializability Guarantees** — PASS. All new fields are primitives + arrays of `{ extId: string; display: UICardDisplay }` records. Safe-skip values (`[]`, `0`) are JSON-stable. EC §5 includes JSON-roundtrip test.

**24. Mixed Persistence Concerns** — PASS. Snapshot rules untouched; UIState extension is runtime-only. KO-pile path corrected to `G.ko` (top-level, not `G.piles.ko`) per PS-1.

### Category 6: Testing & Invariant Enforcement

**11. Tests Validate Behavior, Not Invariants** — PASS. Acceptance includes invariant tests: drift-pinning, JSON roundtrip, aliasing mutation-then-rebuild, audience-filter matrix, and (post-PS-3) safe-skip value pinning. Test count locked at 12-20 in EC §0 / §5.

### Category 7: Scope & Execution Governance

**12. Scope Creep During "Small" Packets** — PASS. EC §1 file allowlist (10 or 11 files at session close) holds. Option A safe-skip closes the previous scope-creep pressure (executor would otherwise have been tempted to "just add the G field while I'm here"). EC §3 Guardrails now explicitly carves out the 8-site safe-skip allowlist while keeping the STOP gate for any other missing-G-source field — cleanly bounded.

**13. Unclassified Directories and Ownership Ambiguity** — PASS. No new directories. `packages/game-engine/src/ui/` already classified per D-2801.

**30. Missing Pre-Session Governance Fixes** — **RESOLVED.** Initial pass flagged PS-1..PS-4 unresolved. **FIX applied:** all four PS items resolved per `docs/ai/invocations/preflight-wp128.md §Resolution Log`. Citation: WP-128 §Files Expected to Change DECISIONS.md mapping (D-12801..D-12807); EC-131 §0 / §2 / §3 / §4 / §5 / §Common Failure Smells updates.

### Category 8: Extensibility & Future-Proofing

**14. No Extension Seams for Future Growth** — PASS. Named projection types (`UIDecksState`, `UISharedPilesState`, `UIKoPileState`) provide clean extension points. Safe-skip pattern itself is the extension seam: when a future WP adds `G.<path>`, only the projection assignment changes from constant to derivation; the field name, shape, and consumer contract stay identical.

**28. No Upgrade or Deprecation Story** — PASS. All extensions are additive; no deprecations. `01.6` post-mortem MANDATORY captures contract additions. Safe-skip decommission path explicit: future WP removes the `// SAFE-SKIP-WP128` marker and replaces the constant with the derivation; CI grep enforces marker count drops as sites are resolved.

### Category 9: Documentation & Intent Clarity

**15. Missing "Why" for Invariants and Boundaries** — PASS. EC §4 enumerates 9 required `// why:` sites (post-PS-3, includes safe-skip 3-clause requirement). WP-128 §Scope A specifies the optional-vs-nullable comment for `discardTopCard?`. Each safe-skip site requires (a) PS-3 cite, (b) gap description, (c) future-WP placeholder.

**20. Ambiguous Authority Chain** — PASS. Authority hierarchy explicit in WP-128 (cites ARCHITECTURE.md, WP-028/029/089/111 precedents, D-12806 Option A safe-skip lock).

**26. Implicit Content Semantics** — **RESOLVED.** Initial pass flagged R-4 (`mastermind.attachedBystanders` interpretation — field name carried one semantic, engine source carried another). **FIX applied (PS-4):** D-DEC-5 explicitly records Interpretation B as the locked semantic ("bystanders captured by the **mastermind itself** — Master Strike effects"), with Interpretation A (flatten city-villain captures) explicitly rejected and reasons given. Three-site guardrail (Non-Negotiable bullet, D-DEC-5, EC §2) prevents future drift. Citation: `docs/ai/invocations/preflight-wp128.md §Resolution Log` PS-4.

### Category 10: Error Handling & Failure Semantics

**18. Outcome Evaluation Timing Ambiguity** — PASS. Projection is synchronous and called per `playerView` invocation; no lifecycle ambiguity.

**22. Silent Failure vs Loud Failure Decisions Made Late** — **RESOLVED.** Initial pass flagged that without R-1 resolution, the executor would discover the 8 missing G sources at runtime and STOP — fail-loud at the wrong time. **FIX applied (PS-3):** Option A safe-skip locked under D-12806; converts silent gaps into auditable safe-skips with `// SAFE-SKIP-WP128` markers (CI-greppable, count ≥ 8 enforced) + 3-clause `// why:` comments + DECISIONS.md commitment + drift-test value pinning. Citation: WP-128 §Scope B "Safe-Skip Resolutions" subsection; EC-131 §2 / §4 / §5 / §Common Failure Smells.

### Category 11: Single Responsibility & Logic Clarity

**25. Overloaded Function Responsibilities** — PASS. `buildUIState` retains its single responsibility (project G → UIState). Each new projection step is a distinct block in the existing `--- N. Project X ---` pattern. Safe-skip projections are inline constants (no helper functions, no overload pressure).

---

## Mandatory Governance Follow-ups

- **DECISIONS.md entries (locked at execution):**
  - D-12801..D-12805 — D-DEC-1..D-DEC-5 lock-ins (per WP-128 §Decision Points)
  - D-12806 — Option A safe-skip resolution (locked at pre-flight 2026-05-03 PS-3)
  - D-12807 — 01.5 cascade resolution (recorded at session close per EC-131 §2 binary procedure)
- **WORK_INDEX.md update:** Add a Pending placeholder row for the future "G extensions for board layout" WP that resolves WP-128's safe-skips. Tracked as task 3 of the post-pre-flight resolution sequence (now landing in this session per user authorization).
- **02-CODE-CATEGORIES.md update:** Not required (no new directory).
- **`.claude/rules/*.md` update:** Not required (no new enforcement pattern; the safe-skip pattern is established precedent per WP-023 / WP-025 / WP-026 / WP-030).

---

## Pre-Flight Verdict Disposition

- [x] **CONFIRM** — Pre-flight READY TO EXECUTE verdict stands unconditionally after PS-1..PS-4 resolution. Session prompt generation authorized.

The five RISK findings from the initial pass (#22, #26, #27, #29, #30) have all transitioned to PASS as expected in the pre-flight Resolution Log §Disposition Update. No new risks surfaced during the re-run.

Per `01.7 §Workflow Position` step 2 sequencing rule: with `CONFIRM` issued, the next workflow step is generation of `docs/ai/invocations/session-wp128-uistate-projection-extensions.md` (this session's task 2).

---

## Final Note

This copilot check was first run under 01.7's "early sanity check" allowance (before pre-flight returned READY); the re-run after PS-1..PS-4 follows 01.7's standard workflow position (step 1b after step 1's READY verdict). Both runs are preserved in this artifact for audit traceability.
