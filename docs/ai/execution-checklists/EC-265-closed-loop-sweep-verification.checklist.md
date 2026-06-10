# EC-265 — Closed-Loop Sweep Verification (Execution Checklist)

**Source:** docs/ai/work-packets/WP-233-closed-loop-sweep-verification.md
**Layer:** Server (`apps/server/src/handoff/` — additive extension) + CI tooling (`scripts/handoffs-verify.mjs`, additive step in `.github/workflows/inspection-nightly.yml`)

> Use locked values from WP-233 verbatim. EC-265 is the operational order +
> gates + failure smells; if EC-265 and WP-233 conflict, WP-233 wins.

---

## Before Starting
- [ ] **WP-232 landed.** `grep -n "applyHandoffTransition" apps/server/src/handoff/handoff.logic.ts` ≥ 1; `legendary.finding_handoffs` migration `020` present.
- [ ] **Transition table includes the verify edges:** `fix-proposed → resolved` and `fix-proposed → claimed` are in WP-232's locked table (reused verbatim — NO new state added).
- [ ] **Inspection accessor present:** `grep -n "fetchLatestInspectionReport" apps/server/src/inspection/inspection.logic.ts` ≥ 1; the report carries `reportId` + `findings[]` with `cellId` / `anomalyClass`.
- [ ] **Shared-secret + token present:** `validateSharedSecret` exported; `HANDOFF_SUBMIT_TOKEN` declared in `render.yaml` (reused — no new token).
- [ ] Read WP-233 §Goal, §Locked Type Contracts, §Non-Negotiable Constraints, §Acceptance Criteria, §Scope (In/Out).
- [ ] `pnpm --filter @legendary-arena/server test` + `pnpm -r build` exit 0 (anchor baseline); note the pre-existing handoff case count.

## Locked Values (verbatim from WP-233 — do not re-derive)
- **Only new contract:** `HandoffVerifySummary = { reportId: string|null, verified: number, regressed: number, skipped: number }`; response `{ data: HandoffVerifySummary }`. Added additively to `handoff.types.ts` (no existing type/union/array touched).
- **Verification rule (per `fix-proposed` handoff `H`, latest report `R`):** (1) `R` null ⇒ no-op, all-zero, `reportId: null`. (2) `H.reportId === R.reportId` ⇒ **skip** (no re-sweep yet; leave `fix-proposed`). (3) else `isAnomalyResolved(H, R)` = NO finding `f` in `R.findings` with `f.cellId === H.cellId && f.anomalyClass === H.anomalyClass` (run-level `cellId: null` matches `null`): resolved ⇒ `applyHandoffTransition(... 'resolved')`; not resolved ⇒ `applyHandoffTransition(... 'claimed')`.
- **Newer-report-only guard (load-bearing):** verify `H` ONLY when `H.reportId !== R.reportId`. Without it the first verify after a fix re-flags the still-pre-fix report as a regression.
- **Reuse the lifecycle — NO new state, NO new transition.** Transitions go through the EXISTING `applyHandoffTransition` (`fix-proposed → resolved` / `fix-proposed → claimed`, already in WP-232's table). `HANDOFF_STATUSES` stays 6 members; the transition table is byte-unchanged.
- **URL:** `POST /api/handoffs/verify` (literal; body ignored). **Token:** `X-Handoff-Token` ↔ `HANDOFF_SUBMIT_TOKEN` (reused — no new secret, no `render.yaml`/`.env.example` change).
- **Evaluation order:** auth 401 → body parse/size 413 → `verifyFixProposedHandoffs(database)` 200. Validation precedes any DB I/O.
- **Status domain:** `POST /api/handoffs/verify` `{200, 401, 413, 500}`.
- **Read model:** `verifyFixProposedHandoffs` obtains the report via `fetchLatestInspectionReport(database)` ONLY (NO direct `inspection_reports` SQL); it MAY `SELECT ... WHERE status = 'fix-proposed'` against its own `finding_handoffs`.
- **Idempotent:** re-running against the same latest report transitions the eligible `fix-proposed` rows the first time, then finds none (all-zero); a run against an unchanged report only `skips`.
- **Script exit codes —** `handoffs-verify.mjs`: 0 ok (200) / 1 missing env / 2 request-fail (non-2xx). Full-sentence stderr on non-zero.
- **Workflow:** ONE additive trailing step in `inspection-nightly.yml` running `pnpm handoffs:verify`, `if: success()`, AFTER `handoffs:sync`, reading `HANDOFF_SUBMIT_TOKEN` + `API_BASE_URL`. All earlier steps byte-unchanged.

## Guardrails
- **Additive-only on WP-232's files.** No existing `handoff.*` function, type, union, array, endpoint, transition, or test is modified — only new symbols/cases appended. The whole pre-existing handoff suite stays green.
- **No new lifecycle state.** Do NOT add `verified` (or any member) to `HandoffStatus` / `HANDOFF_STATUSES`. Verification reuses `resolved` (success) and `claimed` (regression). (Operator Q4 lock — D-23301.)
- **Newer-report-only guard is mandatory** — skip a `fix-proposed` handoff whose `reportId` equals the latest report's. This is the correctness condition, not an optimization.
- **Server is sole authority for `status`.** Transitions go through `applyHandoffTransition`'s guarded `UPDATE ... AND status = 'fix-proposed'`; a row a parallel transition advanced is a 0-row no-op (never a lost update / double-act).
- **Read the report via `fetchLatestInspectionReport` ONLY** — no direct `inspection_reports` query in `handoff.logic.ts` (one source of truth, D-23203 carry-forward).
- **Description is never compared.** Match on `(cellId, anomalyClass)` only; `anomalyClass` opaque (no engine union import — D-23103). LLM-nondeterministic `description` is never asserted/matched.
- **Shared-secret via the single `validateSharedSecret` helper** — no inline `timingSafeEqual` / `node:crypto` in the verify handler.
- **`Cache-Control: no-store` first statement** in the verify handler body (D-11504).
- **No `.reduce()`** in the new logic; `isAnomalyResolved` + the per-handoff loop are explicit `for...of`.
- **Body ignored / 64 KB cap → 413.** The endpoint always verifies the latest report; no body fields are read.
- **No new npm deps; no `apps/dashboard/**`, `apps/server/src/inspection/**`, `data/migrations/**`, `render.yaml`, `.env.example` edits.** Full file contents for every modified file — diffs/snippets forbidden.

## Required `// why:` Comments
- `handoff.logic.ts` (verify, newer-report guard) — a `fix-proposed` handoff is verified only against a report NEWER than its origin (`reportId` differs); the same-report case is skipped because no re-sweep has run since the fix, so treating the still-pre-fix report as evidence would falsely regress it (D-23301).
- `handoff.logic.ts` (verify, reuse-not-new-state) — verification reuses the existing lifecycle: anomaly gone ⇒ `resolved`, anomaly present ⇒ `claimed` (re-open); no `verified` state is added (operator decision; D-23301). Transitions go through `applyHandoffTransition` so the guarded UPDATE's concurrency safety is inherited.
- `handoff.logic.ts` (verify, source of truth) — paraphrase, do NOT echo the policed `FROM legendary.inspection_reports` literal: the report is obtained through the inspection library accessor (`fetchLatestInspectionReport`), never a direct query against that table (D-23203). (Verification step 4 counts that literal at 0 in this file.)
- `handoff.routes.ts` (verify) — the autonomy here is the verify-and-transition loop, NOT a code-writer: the server confirms/regresses fixes a human or future autonomous Builder pushed; it writes no fix and opens no PR (D-23302).

## Files to Produce
- `apps/server/src/handoff/handoff.types.ts` — modified (additive: `HandoffVerifySummary`).
- `apps/server/src/handoff/handoff.logic.ts` — modified (additive: `isAnomalyResolved`, `verifyFixProposedHandoffs`).
- `apps/server/src/handoff/handoff.logic.test.ts` — modified (additive: ≥ 8 verify cases incl. resolved / regressed / skipped / empty / truth-table / accessor-only / non-fix-proposed-ignored / concurrency).
- `apps/server/src/handoff/handoff.routes.ts` — modified (additive: `POST /api/handoffs/verify` + wiring; `registerHandoffRoutes` signature unchanged).
- `apps/server/src/handoff/handoff.routes.test.ts` — modified (additive: ≥ 5 verify route cases).
- `scripts/handoffs-verify.mjs` — new (POST verify; exports `isHandoffVerifyEnvComplete`).
- `apps/server/scripts/handoffs-verify.test.ts` — new (≥ 4; env guard, exit-code mapping, response-shape). Under `apps/server/scripts/` so the server suite globs it (WP-231/232 precedent); imports `../../../scripts/handoffs-verify.mjs`.
- `package.json` — modified (1 root script `handoffs:verify`).
- `.github/workflows/inspection-nightly.yml` — modified (1 additive trailing `handoffs:verify` step).
- `docs/ai/REFERENCE/api-endpoints.md` — modified (1 row, D-11804).
- `docs/ai/DECISIONS.md` — modified (D-23301 + D-23302 Active).
- `docs/ai/STATUS.md` — modified.
- `docs/ai/work-packets/WORK_INDEX.md` — modified (WP-233 `[x]`).
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (EC-265 → Done).

**Total: 14 files** (2 new + 5 modified source + 7 governance).

## After Completing
- [ ] `pnpm --filter @legendary-arena/server test` exits 0; ≥ 17 net-new cases (≥ 8 logic + ≥ 5 routes + ≥ 4 verify-script); NO pre-existing handoff case regresses.
- [ ] `pnpm -r build` exits 0.
- [ ] No new state: `grep -n "verified" apps/server/src/handoff/handoff.types.ts` = 0; `HANDOFF_STATUSES` still 6 members (drift test green).
- [ ] Reuse transition: `grep -n "applyHandoffTransition" apps/server/src/handoff/handoff.logic.ts` ≥ 1 (verify calls it).
- [ ] Source of truth: `grep -n "FROM legendary.inspection_reports" apps/server/src/handoff/handoff.logic.ts` = 0; `grep -n "fetchLatestInspectionReport" apps/server/src/handoff/handoff.logic.ts` ≥ 1.
- [ ] Newer-report guard + skip: a logic test asserts a `fix-proposed` handoff with `reportId === latest.reportId` is `skipped` (status preserved), and one with a differing `reportId` is verified/regressed.
- [ ] Only `fix-proposed` processed: a test seeds mixed statuses and asserts `open`/`claimed`/`escalated`/`resolved`/`wont-fix` are untouched.
- [ ] Concurrency: a test drives the guarded-UPDATE 0-rows path (row advanced mid-run) and asserts no double-act / lost update.
- [ ] Centralized secret check: `grep -n "timingSafeEqual" apps/server/src/handoff/handoff.routes.ts` = 0; the verify handler calls `validateSharedSecret`.
- [ ] no-store gate: `Cache-Control.*no-store` across `handoff.routes.ts` ≥ 4 (3 WP-232 handlers + verify).
- [ ] No reduce: net-new `\.reduce(` in `handoff.logic.ts` = 0.
- [ ] Catalog: 1 row for `POST /api/handoffs/verify` in `api-endpoints.md`, Status `{200,401,413,500}` + Auth `guest`.
- [ ] Workflow: exactly one additive `handoffs:verify` step after `handoffs:sync`; earlier steps byte-unchanged.
- [ ] Scope: `git diff --name-only` lists only the 14 `## Files to Produce` paths; `git diff --name-only apps/dashboard/ apps/server/src/inspection/ data/migrations/ render.yaml .env.example` empty; no new npm deps.
- [ ] `STATUS.md`, `DECISIONS.md` (D-23301..02 Active), `WORK_INDEX.md` (WP-233 `[x]`), `EC_INDEX.md` (EC-265 Done) updated.

## Common Failure Smells
- Adding a `verified` state to `HANDOFF_STATUSES` → operator Q4 lock violation; reuse `resolved` / `claimed`.
- Omitting the newer-report guard (verifying against `handoff.reportId === latest.reportId`) → false regressions on the first verify after a fix is recorded.
- A direct `SELECT ... FROM legendary.inspection_reports` in `handoff.logic.ts` → source-of-truth violation (D-23203); read via `fetchLatestInspectionReport`.
- Re-implementing a guarded UPDATE inside verify instead of calling `applyHandoffTransition` → duplicates the concurrency logic (drift surface); reuse the primitive.
- Processing handoffs in states other than `fix-proposed` → only `fix-proposed` is eligible for verification.
- Matching/asserting finding `description` text → couples to inherited LLM-nondeterministic content; match `(cellId, anomalyClass)` only.
- Inline `timingSafeEqual` / `===` token compare in the verify handler → must call `validateSharedSecret`.
- A new token / `render.yaml` / `.env.example` change → the verify endpoint reuses `HANDOFF_SUBMIT_TOKEN`.
- `.reduce()` in `isAnomalyResolved` or the verify loop → use explicit `for...of`.
- Editing `HandoffRecord` / the transition table / the migration / the three existing endpoints → additive-only; those are WP-232-locked.
- Any `apps/dashboard/**` / `apps/server/src/inspection/**` / `data/migrations/**` edit → out of scope.

---

## DECISIONS.md Entries (D-23301..D-23302)

> Status flips from `Reserved (proposed)` at draft time to `Active` at
> landing (execution close); no other field changes.

### D-23301 — Closed-Loop Verification Posture: Full-Report Diff, Newer-Report Guard, Lifecycle Reuse

**Decision:**
`POST /api/handoffs/verify` closes the sweep loop. It reads the latest
inspection report via the exported `fetchLatestInspectionReport(database)` ONLY
(no direct `inspection_reports` SQL) and, for each handoff in `fix-proposed`
whose origin `reportId` differs from the latest report's `reportId` — a genuine
re-sweep has run since the fix — diffs the handoff's snapshotted
`(cellId, anomalyClass)` against the latest report's findings: anomaly ABSENT ⇒
transition `fix-proposed → resolved` (verified); anomaly PRESENT ⇒ transition
`fix-proposed → claimed` (regression — back to the Builder, the re-open edge
WP-232 reserved). Matching is exact `(cellId, anomalyClass)` equality (a
run-level finding has `cellId: null`; `null === null` matches a run-level
anomaly); the LLM-nondeterministic finding `description` is never compared
(D-23102 carry-forward), and `anomalyClass` stays an opaque string (D-23103
carry-forward). The **newer-report-only guard** (`handoff.reportId !==
latest.reportId`) is the load-bearing correctness condition: a `fix-proposed`
handoff whose origin report IS the latest (no re-sweep yet) is `skipped`, never
falsely regressed. The verification reuses the WP-232 6-status lifecycle and
transition table VERBATIM — no new state (e.g. `verified`) and no new transition
are added (operator decision, 2026-06-10) — and transitions go through the
existing `applyHandoffTransition` guarded UPDATE, so the diff is server-
authoritative and concurrency-safe (a row a parallel transition advanced is a
0-row no-op, never a lost update or a double-act). The mechanism is a full-report
diff against the next nightly full sweep, not a targeted subset re-sweep
(operator decision, 2026-06-10); a targeted re-sweep is a deferred performance
optimization over this same contract.

**Packet:** WP-233 (EC-265).
**Drafted:** 2026-06-10 (reserved). **Landed:** TBD (execution close).
**Status:** Reserved (proposed)

### D-23302 — Autonomous Nightly Verify Step (Post-Merge Timing, Idempotent)

**Decision:**
WP-233 is the agent pipeline's first autonomous-ACTION surface (operator
decision, 2026-06-10): unlike WP-232's plumbing-only posture, the verify step
actively transitions handoffs without a human. It is NOT an autonomous
code-writer — it writes no fix, opens no PR, and edits no spec; the autonomy is
the verify-and-transition loop over already-filed findings, and the unattended
Builder (code-writer) / Architect (spec-writer) remain deferred to their own
separately-gated WPs. Timing is post-merge / next-nightly (operator decision,
2026-06-10): a fix merged to `main` is re-swept by the next nightly full sweep +
Inspector triage, and an additive trailing `pnpm handoffs:verify` step in
`inspection-nightly.yml` (after `handoffs:sync`, `if: success()`, reading
`HANDOFF_SUBMIT_TOKEN` + `API_BASE_URL`) calls `POST /api/handoffs/verify`. The
endpoint reuses the WP-232 `X-Handoff-Token` shared secret — no new token, no
`render.yaml` / `.env.example` change. The step is idempotent: a second run
against the same latest report finds no eligible `fix-proposed` handoffs (the
first run transitioned them out) and a run against an unchanged report only
`skips`; `scripts/handoffs-verify.mjs` exits 0 (200) / 1 (missing env) / 2
(request failure).

**Packet:** WP-233 (EC-265).
**Drafted:** 2026-06-10 (reserved). **Landed:** TBD (execution close).
**Status:** Reserved (proposed)
