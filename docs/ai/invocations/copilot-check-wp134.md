# Copilot Check — WP-134 (Webhook → Entitlement Fulfillment Processor)

**Date:** 2026-05-07
**Pre-flight verdict under review:** **NOT READY** (2026-05-07; see PS-1..PS-3 + RS-1..RS-6 in `preflight-wp134.md`).

> The 01.7 doc says the copilot check is **mandatory** when 01.4 returns READY TO EXECUTE; it may also run as an **early sanity check against a draft EC/WP before pre-flight or after a NOT READY pre-flight verdict**. Pre-flight returned NOT READY here, so this copilot check operates in early-sanity mode (mirrors the WP-137 / `copilot-check-wp137.md` precedent). Findings are recorded so when PS-1..PS-3 resolve and pre-flight flips to READY, the 30-issue lens has already been audited and the next gate is fast.

**Inputs reviewed:**
- EC: `docs/ai/execution-checklists/EC-140-webhook-entitlement-fulfillment.checklist.md`
- WP: `docs/ai/work-packets/WP-134-webhook-entitlement-fulfillment.md` (post §IMPORTANT amendment)
- Pre-flight: `docs/ai/invocations/preflight-wp134.md` (in-session)

---

## Overall Judgment

**SUSPEND**

The pre-flight verdict is NOT READY. The 30-issue lens reveals three RISKs that compound the pre-flight blockers (Issue 4 — Contract Drift between Types/Tests/Runtime, Issue 21 — Type Widening at Boundaries, Issue 22 — Silent Failure vs Loud Failure timing) and one RISK each on Issues 5, 11, 14, 27, 30. The remaining 22 issues PASS. The architectural shape of the change is sound — server-layer fulfillment with structural NG-1 defense, two-axis cross-validation, write-ordering with crash-recovery via idempotency, always-200 webhook posture, and `EntitlementKey` closed-union enforcement are all correctly motivated. But the `recordStripeEvent` return-shape mismatch (PS-1) and the `payload: unknown` runtime-narrowing gap (PS-2) would cause architectural damage if execution proceeded as drafted: the webhook handler would either fail to compile against shipped code, or read `payload.data.object.*` on `unknown` and either crash at runtime or silently bypass cross-validation. **The pre-flight verdict remains suspended until PS-1..PS-3 resolve; the RS items below should fold into those resolutions.**

---

## Findings

### 1. Separation of Concerns & Boundaries

**1. Engine vs UI / App Boundary Drift — PASS.** WP forbids modification of `packages/game-engine/**`, `packages/registry/**`, `packages/preplan/**`, `packages/vue-sfc-loader/**`, `apps/arena-client/**`, `apps/replay-producer/**`, `apps/registry-viewer/**`. EC-140 §3 grep gates enforce. The fulfillment processor lives in `apps/server/src/billing/`; engine never imports billing. Layer Boundary (Authoritative) honored.

**9. UI Re-implements / Re-interprets Engine Logic — PASS.** N/A — fulfillment is server-side; client never adjudicates fulfillment. Per Vision §11 (Stateless Client Philosophy), client polls `GET /api/me/entitlements` (WP-132) to learn the result. WP §Vision Alignment confirms.

**16. Lifecycle Wiring Creep — PASS.** No engine `game.ts` / phase-hook / move wiring. The webhook handler modification is contained to `billing.routes.ts`; the recovery script is an out-of-process invocation. WP §Out of Scope explicitly excludes engine surfaces.

**29. Assumptions Leaking Across Layers — PASS.** The session row + `BillingConfig.priceAllowlist` are the **authoritative** sources for `accountId`, `priceId`, `entitlementKey`; event payload fields are **consistency checks only**. The asymmetry is locked in WP §Non-Negotiable Constraints + EC-140 §2 Locked Values + §3 Guardrails. No cross-layer assumption flows from event payload to entitlement INSERT.

### 2. Determinism & Reproducibility

**2. Non-Determinism Introduced by Convenience — PASS.** No `Math.random()`, no `Date.now()`-driven branching (only `processed_at = now()` / `completed_at = now()` audit timestamps which are server-clock by design), no locale dependency. Engine `ctx.random.*` not used (server layer). EC-140 §6 grep gate `process\.env\.` returns no output in `processStripeEvent.logic.ts`. Replay determinism unaffected (Vision §22 N/A).

**8. No Single Debugging Truth Artifact — PASS.** Forensic queries via `legendary.stripe_events.{processed_at, process_error}` + `legendary.stripe_checkout_sessions.intent_status` + recovery-script stdout summary are the on-call artifacts. WP §Debuggability & Diagnostics enumerates. Operator runbook for persistent validation failures documented (manual `UPDATE stripe_events SET processed_at = now()` once cause is understood + DECISIONS.md entry).

**23. Lack of Deterministic Ordering Guarantees — PASS.** Recovery script `ORDER BY received_at ASC LIMIT 100` is explicit. Within `processStripeEvent`, the three writes execute in locked order (entitlement INSERT → session UPDATE → event UPDATE LAST). Phase 1 guards execute before Phase 2 cross-validation before Phase 3 writes. EC-140 §2 + §3 + WP §Non-Negotiable Constraints lock all ordering.

### 3. Immutability & Mutation Discipline

**3. Confusion Between Pure Functions and Immer Mutation — PASS.** N/A — server layer; no Immer involvement. `processStripeEvent` is a pure function in the sense that it returns a `FulfillmentResult` value (no thrown exceptions, no mutation of inputs). Internal DB writes are framework-authorized via the long-lived `pg.Pool`.

**17. Hidden Mutation via Aliasing — PASS.** No projection / view-model surface; the `FulfillmentResult` is a fresh object literal. The `BillingConfig.priceAllowlist` is `Object.freeze`-wrapped and typed `ReadonlyMap<string, EntitlementKey>` (per WP-133 / EC-136 close); WP-134 only reads via `.has()` / `.get()`. No aliasing surface introduced.

### 4. Type Safety & Contract Integrity

**4. Contract Drift Between Types, Tests, and Runtime — RISK.** Two contract drifts:
- **PS-1 (`recordStripeEvent` return shape):** WP-134 §C claims `RETURNING *` semantics that the shipped WP-133 implementation does not have. The function returns `BillingResult<{ inserted: boolean }>` — just a boolean, not the row. The WP claim is **factually false** against shipped code at `apps/server/src/billing/billing.logic.ts:218–258`.
- **PS-2 (`payload: unknown` field access):** WP-134 §A reads `payload.data.object.id`, `.client_reference_id`, `.metadata.entitlementKey`, `.payment_status` — but `StripeEventRecord.payload` is typed `unknown` per WP-133 lock at `billing.types.ts:208`. Accessing fields on `unknown` doesn't compile.

**FIX:** PS-1 + PS-2 in pre-flight already cover both. Tighten WP §A Phase 1 to add Phase 0a (structural type guard `isCheckoutSessionCompletedPayload`) and §C Branch 1 to specify the post-INSERT re-fetch. Lock both in D-13403 (cross-validation + FK-resolution + return-shape resolution). EC-140 §2 + §3 + §6 mirror.

**5. Optional Field Ambiguity (`exactOptionalPropertyTypes`) — RISK.** `FulfillmentSuccess.entitlementKey: EntitlementKey | null` and `.sessionId: string | null` are present-required-with-null-or-value (not optional). Fine. But the **`reason: string | null`** field on the webhook response shape (`{ received: true; duplicate: boolean; processed: boolean; reason: string | null }`) crosses the always-required-but-nullable boundary. Under `exactOptionalPropertyTypes: true`, a ternary that returns `null` on one branch and a string on another must be assigned (not inline) — see WP-029 precedent (`preserveHandCards` conditional assignment).

**FIX:** EC-140 §5 add a `// why:` requirement at the response-shape construction site in `billing.routes.ts`: cite `exactOptionalPropertyTypes` strictness; use conditional assignment (build base object without `reason`, then assign in `if` blocks for each branch) rather than inline ternary. Ref WP-029 / D-2902 precedent. Test fixture must verify `reason: null` paired only with `processed: false` skip-branch (existing locked invariant).

**6. Undefined Merge Semantics (Replace vs Append) — PASS.** No merging. The `priceAllowlist.get(price_id)` → single-value lookup; the `INSERT ... ON CONFLICT DO NOTHING` is a strict precedence (first row wins). No emergent merge behavior.

**10. Stringly-Typed Outcomes and Results — PASS.** `FulfillmentSuccessReason` (5 closed-set values) and `FulfillmentErrorCode` (6 closed-set values) are discriminated unions; the response `reason` field is the union of both (typed as `string` at the wire because JSON has no union, but consumer-side TS can re-narrow). EC-140 §6 reviewer-confirmation gate locks the invariant that `processed: true` ↔ `reason: <FulfillmentSuccessReason>`; `processed: false` ↔ `reason: <FulfillmentErrorCode> | null`.

**21. Type Widening at Boundaries — RISK.** Three widening risks:
- **`payload: unknown`** at the `StripeEventRecord` boundary requires the Phase 0a guard (PS-2) to narrow. After the guard, internal field access uses the narrowed shape — correct discipline. Currently undocumented in WP / EC; lock in PS-2 resolution.
- **`reason: string | null`** in the webhook response widens both closed unions to `string`. This is intentional at the wire boundary (JSON), but consumers should re-narrow. EC-140 §2 Locked Values restates both unions verbatim — log consumers can write exhaustive matchers.
- **`source_ref text`** column on `legendary.entitlements` accepts any string. WP-134 writes `source_ref = <stripe_session_id>` (a `cs_*` string from `payload.data.object.id`). The post-PS-2 narrowing guard enforces `id: string`, but no LENGTH cap. RS-6 covers a similar concern for `process_error`; extend the same soft-cap discipline to `source_ref` (e.g., 200 chars — Stripe session IDs are <100 chars in practice).

**FIX:** EC-140 §3 Guardrails add: "After the Phase 0a structural type guard, internal field access MUST use the narrowed shape — no further `as any` / `as string` casts in `processStripeEvent.logic.ts`." Add §6 grep gate: `Select-String -Path "apps\server\src\billing\processStripeEvent.logic.ts" -Pattern "as any|as unknown|as string"` returns no output. (Light guard — not blocking, but cheap to lock.)

**27. Weak Canonical Naming Discipline — RISK.** Two name choices warrant lockdown:
- **`processStripeEvent` vs `processStripeEventRecord` vs `fulfillStripeCheckoutSession`** — the chosen name is `processStripeEvent` (verb-first, generic over event type). It correctly does NOT pre-commit to "fulfill" semantics (the function may return `'unhandled_event_type'` or `'unpaid_session'` no-ops). Locked in WP §Goal + EC-140 §2 Locked Values. ✓
- **`FulfillmentResult` vs `ProcessStripeEventResult`** — the chosen name is `FulfillmentResult` (domain-first, parallel to `EntitlementsResult` in WP-132). The trade-off: a no-op `'unhandled_event_type'` outcome is not really a "fulfillment success" but the type is named for its primary success path. Acceptable per code-style Rule 14 (semantic naming stability).

**FIX (light):** EC-140 §2 already locks these names verbatim. No action needed beyond reviewer-confirmation that the executor doesn't rename mid-implementation.

### 5. Persistence & Serialization

**7. Persisting Runtime State by Accident — PASS.** No engine `G` involvement. The three tables touched (`legendary.entitlements`, `legendary.stripe_checkout_sessions`, `legendary.stripe_events`) are server-layer-owned per ARCHITECTURE.md Persistence Boundary. WP §Out of Scope excludes any engine state.

**19. Weak JSON-Serializability Guarantees — PASS.** All values stored are JSON-safe primitives (strings, numbers, timestamps, JSONB blobs). The `payload jsonb` column carries the full Stripe envelope as JSON (already serialized by `recordStripeEvent` per WP-133). No functions, Maps, Sets, classes written to DB.

**24. Mixed Persistence Concerns — PASS.** Runtime state (`G`) untouched; configuration (`BillingConfig`) is loaded once at startup; persistence (DB tables) is server-layer. All three persistence classes per ARCHITECTURE.md remain distinct.

### 6. Testing & Invariant Enforcement

**11. Tests Validate Behavior, Not Invariants — RISK.** EC-140 §6 locks 13 branches across 4 domains (Guards 3 / Validation 1+3 / Write-path 2 / Failure-path 4) but does not lock the suite-count delta. WP-031 precedent shows this can produce a `pass + N tests / suites N+S` mismatch mid-execution.

**FIX:** Pre-flight RS-3 covers part of this; EC-140 §Test Expectations should explicitly lock the suite delta. Recommended split (per pre-flight Test Expectations section): one new `describe()` block in `processStripeEvent.logic.test.ts` (the 13 branches), plus one extension `describe('webhook handler — WP-134 fulfillment')` block in `billing.routes.test.ts` for the new self-heal/skip/fault tests. Lock to `Su = +2`. Final lock: server post = `pass 168 + 16 / fail 0 / skipped 59 + 7 / (suites 31, tests 250)`.

### 7. Scope & Execution Governance

**12. Scope Creep During "Small" Packets — PASS.** EC-140 §1 enumerates exactly 9 production/reference files + 1 governance ledger. WP §Files Expected to Change matches. EC-140 §6 final gate runs `git diff --name-only` and verifies the file list. The "anything not explicitly allowed is forbidden" rule is preserved. PS-1 path (b) would expand scope to `billing.logic.ts` + `billing.logic.test.ts` (4 → 6 production files); pre-flight rejects (b) in favor of (a).

**13. Unclassified Directories and Ownership Ambiguity — PASS.** All target files live in already-classified directories: `apps/server/src/billing/` (server, EC-136 close), `scripts/` (infra, FP-01/02 close), `docs/ai/REFERENCE/` (docs/governance). No new directories.

**30. Missing Pre-Session Governance Fixes — RISK (the pre-flight blocker).** PS-1, PS-2, PS-3 are all governance-class fixes that must land before execution: WP §C wording (PS-1), WP §A Phase 0a addition (PS-2), WP §D recovery-script posture (PS-3). The pre-flight has captured them; the copilot check confirms they all qualify as scope-neutral wording / design-specification clarifications, not scope expansions.

**FIX:** resolve PS-1..PS-3 in WP-134 + EC-140 before running the session prompt. After resolution, the copilot check can be re-run and is expected to flip to CONFIRM.

### 8. Extensibility & Future-Proofing

**14. No Extension Seams for Future Growth — RISK (mild).** The closed unions (`FulfillmentSuccessReason`, `FulfillmentErrorCode`) are seams — adding a new outcome type adds a member; compile-time exhaustiveness catches missed cases. The recovery script's `LIMIT 100` is a tunable; future scaling WP can promote to `FOR UPDATE SKIP LOCKED` per WP D-DEC-5 future-scaling note. **However**, the WP locks "no refunds, no subscriptions, no admin grants, no dead-letter queue" out of scope per §Out of Scope. The seams for those future paths exist (the `source` closed union is `'stripe' | 'admin_grant' | 'comp'`; the `revoked_at` column is the refund seam) but are inactive at WP-134 close.

**FIX (governance, scope-neutral):** add a §Operator Playbook line to WP-134 §Debuggability & Diagnostics: "When a future WP adds refunds (writing `revoked_at` on entitlement rows), the partial unique index `entitlements_active_unique ON (player_id, entitlement_key) WHERE revoked_at IS NULL` allows re-grant of a previously-revoked key as a new row without colliding with the historical row." This makes the seam explicit without introducing new code.

**28. No Upgrade or Deprecation Story — PASS.** No new migration; consumes WP-132 + WP-133 schema unchanged. No backward-compatibility concern (the response shape extends additively per D-13402; existing `{ received: boolean; duplicate: boolean }` consumers continue to work — the new fields are additive, not breaking).

### 9. Documentation & Intent Clarity

**15. Missing "Why" for Invariants and Boundaries — PASS.** EC-140 §5 enumerates 8 required `// why:` sites with citation requirements (ON CONFLICT, leave-NULL-on-failure, last-write-step (c), accountId→player_id resolution, duplicate-delivery branch, always-200 fault, LIMIT 100, exit 0 on per-row errors). PS-2 resolution adds a 9th site (Phase 0a structural type guard). PS-4 / RS-6 add a 10th (`process_error` operator-internal column). Density is appropriate — ~10 `// why:` sites for ~3 new files.

**20. Ambiguous Authority Chain — PASS.** WP §Context (Read First) lists ARCHITECTURE.md, .claude/rules/architecture.md, WP-132, WP-133, REFERENCE/api-endpoints.md, REFERENCE/00.6-code-style.md, 01-VISION.md, DECISIONS.md. The override hierarchy is preserved. EC-140 cites WP as design authority + EC as execution authority per `01.1`.

**26. Implicit Content Semantics — PASS.** The `FulfillmentResult` shape, the closed unions, the cross-validation 4-check sequence, the write-ordering rule, the `processed_at` lifecycle, the always-200 posture, and the SAFE-KNOBS posture lock are all written down explicitly in WP §Non-Negotiable Constraints + EC-140 §2 + §3 + §4. EC-140 copies the locked values verbatim. No reliance on names alone.

### 10. Error Handling & Failure Semantics

**18. Outcome Evaluation Timing Ambiguity — PASS.** The fulfillment outcome is evaluated synchronously inside `processStripeEvent` (per D-13401 — synchronous-on-webhook posture). The recovery script's per-row outcome is identical to the inline outcome (same function call). No before-vs-after timing question.

**22. Silent Failure vs Loud Failure Decisions Made Late — PASS.** The locked policy is explicit:
- Failures return `Result.fail` (typed); never throw.
- The webhook handler returns 200 on signature-verified events regardless of fulfillment outcome (D-13404).
- Failures leave `processed_at = NULL` (recoverable) and write `process_error` (operator-visible signal).
- Validation-class failures loop in cron — the operator-visibility signal is intentional noise. Trade-off documented in WP §Non-Negotiable Constraints.
- Engine-rule "moves never throw; only `Game.setup()` may throw" — N/A here (no engine context). The server-layer adapted rule is "fulfillment helpers never throw; HTTP handlers translate via Result-to-status mapping." `processStripeEvent` follows this.

The Failure Classes taxonomy (WP §Non-Negotiable Constraints — Transient vs Deterministic Validation) formalizes the policy. Loud per-row stderr logs + recovery-script stdout summary are the operator-visibility surface.

### 11. Single Responsibility & Logic Clarity

**25. Overloaded Function Responsibilities — PASS.** `processStripeEvent` is split into 3 phases with explicit boundaries:
- Phase 1 (early-return guards) — no DB writes; type-narrowing + idempotency check + payment_status filter. PS-2 adds Phase 0a (structural shape guard).
- Phase 2 (cross-validation) — single SELECT + 4-check fan-out; no DB writes; returns `Result.fail` on mismatch.
- Phase 3 (transactional fulfillment write) — three DB writes in locked order; idempotency via INSERT ON CONFLICT + UPDATE WHERE-guard.

Each phase has a single responsibility. The webhook handler has two clear branches (newly-inserted vs duplicate) and a fault path. The recovery script has a single responsibility (scan + per-row dispatch + summary). No overloaded handler.

---

## Mandatory Governance Follow-ups

- **`docs/ai/DECISIONS.md` entries:** D-13401 (synchronous-on-webhook), D-13402 (response shape extension), **D-13403 (two-axis cross-validation + FK resolution + return-shape re-fetch + intent_status='open' guard)** — bundled per pre-flight RS-4 + PS-1 + #ENT-FK / #CONFLICT-TARGET corrections, D-13404 (always-200 posture), D-13405 (recovery script scheduling + env-var posture per PS-3 + pool teardown per RS-1).
- **`docs/ai/REFERENCE/02-CODE-CATEGORIES.md`:** no update required (`apps/server/src/billing/` and `scripts/` already classified).
- **`.claude/rules/*.md`:** no update required (server-layer-only WP — `.claude/rules/server.md` and `.claude/rules/persistence.md` already cover the relevant invariants).
- **`docs/ai/work-packets/WORK_INDEX.md`:** WP-134 row exists in Phase 7 (verified locally; do not duplicate). The check-off (date + commit hash) lands at session close per EC-140 §8.
- **`docs/ai/execution-checklists/EC_INDEX.md`:** EC-140 row exists at line 188 (Draft); flips to Done at session close.

---

## Pre-Flight Verdict Disposition (Initial Pass — 2026-05-07)

- [ ] CONFIRM — Pre-flight READY TO EXECUTE verdict stands. Session prompt generation authorized.
- [ ] HOLD — Apply listed FIXes in-place, re-run copilot check. No pre-flight re-run required (scope unchanged).
- [x] **SUSPEND** — Pre-flight verdict suspended. Blockers must be resolved; if scope changes, re-run pre-flight before re-running copilot check.

**Rationale for SUSPEND (not HOLD):** PS-1 + PS-2 are not pure wording fixes — they specify previously-unspecified runtime behavior (post-INSERT re-fetch helper; Phase 0a structural type guard). PS-3 specifies a previously-unspecified lifecycle posture (recovery script env-var handling). Each adds a small but non-trivial scope item to the WP body and EC. The combined scope expansion is bounded (one re-fetch helper invocation in `billing.routes.ts`; one type guard in `processStripeEvent.logic.ts`; one env-var check + `try/finally` envelope in the recovery script) and does not cross any layer boundary or contract surface — but it changes the WP's design-time spec, which is more than a wording fix.

After PS-1, PS-2, PS-3 land in WP-134 + EC-140 (and RS-1..RS-6 fold into the same edits), an abbreviated pre-flight re-run (Dependency Contract Verification + Structural Readiness + Runtime Readiness) is sufficient. The 30-issue lens has already been applied; re-running the copilot check after PS resolution should flip to **CONFIRM**.

---

## Re-Run (Resolution Pass — 2026-05-07, Same Session)

All three PS items + all six RS items + all four flagged copilot issues (5 / 11 / 14 / 21) resolved in WP-134 + EC-140. Pre-flight `preflight-wp134.md` has flipped to **READY TO EXECUTE** in its Resolution Pass section. Re-running the 30-issue lens against the post-resolution artifacts:

### Resolved Findings (RISK → PASS)

- **Issue 4 (Contract Drift) → PASS.** PS-1 + PS-2 resolved. WP §C now specifies the shared `loadStripeEventRecordByEventId` helper (no false `RETURNING *` claim). WP §A Phase 0a specifies the `isCheckoutSessionCompletedPayload` structural type guard. Both narrowing strategies are explicit; both have dedicated test coverage. EC-140 §2 Locked Values + §3 Guardrails + §5 `// why:` + §6 grep gates all mirror.
- **Issue 5 (`exactOptionalPropertyTypes`) → PASS.** EC-140 §3 Guardrails locks "`reason: null` paired with `processed: true` is impossible" via conditional-assignment discipline (WP-029 / D-2902 precedent). §5 adds the `// why:` requirement at the response-shape construction site. §6 adds reviewer-confirmation gate.
- **Issue 11 (Tests vs Invariants) → PASS.** EC-140 §2 Locked Values pins suite delta `+2` and final server target `pass 168+16 / fail 0 / skipped 59+7 / suites 31 / tests 250`. §6 has the explicit count assertion gate. Test branch coverage updated from 13 → 19 branches (Guards 8 / Validation 1+5 / Write-path 2 / Failure-path 4) reflecting Phase 0a (5 new) + intent_status (1 new).
- **Issue 14 (No Extension Seams) → PASS.** WP §Operator Playbook (Forward Compatibility) section added — documents Phase 0a guard handling, `intent_status` non-`'open'` race handling, future-refunds re-grant flow via partial unique index, future-event-handler loud-fail discipline. The seams remain intact; the Operator Playbook makes the future-WP escalation paths explicit without introducing new code.
- **Issue 21 (Type Widening at Boundaries) → PASS.** EC-140 §3 Guardrails locks "no type-cast escapes after Phase 0a guard" rule. §6 grep gate enforces zero `as any` / `as unknown` / `as string` matches in `processStripeEvent.logic.ts`. The Phase 0a guard narrows once; subsequent field access uses the narrowed type.
- **Issue 27 (Weak Canonical Naming) → PASS.** Names already locked verbatim in EC-140 §2; reviewer-confirmation suffices. No further action needed.
- **Issue 30 (Missing Pre-Session Governance Fixes) → PASS.** PS-1, PS-2, PS-3 all resolved at WP + EC level. RS-1..RS-6 folded into the same edits. The pre-flight Resolution Pass documents every change.

### Updated Overall Judgment

**CONFIRM**

Of the 8 RISK findings in the initial pass, all 8 have flipped to PASS via the WP + EC resolution edits. The remaining 22 PASS findings are unchanged. Pre-flight has flipped from NOT READY to READY TO EXECUTE without scope expansion. **The 30-issue lens now returns 30 PASS / 0 RISK / 0 BLOCK.** Session prompt generation is authorized.

## Pre-Flight Verdict Disposition (Resolution Pass — 2026-05-07)

- [x] **CONFIRM** — Pre-flight READY TO EXECUTE verdict stands. Session prompt generation authorized.
- [ ] HOLD — Apply listed FIXes in-place, re-run copilot check. No pre-flight re-run required (scope unchanged).
- [ ] SUSPEND — Pre-flight verdict suspended. Blockers must be resolved; if scope changes, re-run pre-flight before re-running copilot check.

**Authorized next step:** generate the session prompt for WP-134 (step 2 per `01.4 §Workflow Position`) — `docs/ai/invocations/session-wp134-webhook-entitlement-fulfillment.md`. Execution (step 3) runs in a new Claude Code session under EC mode. The session prompt MUST conform exactly to the scope, constraints, and decisions locked by the pre-flight resolution pass + this copilot check resolution pass — no new scope may be introduced.
