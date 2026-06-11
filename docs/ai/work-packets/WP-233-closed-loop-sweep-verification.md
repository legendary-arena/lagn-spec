# WP-233 — Closed-Loop Sweep Verification (Fix → Re-Sweep → Inspector Verify → Auto-Resolve / Re-Open)

**Status:** Draft
**Primary Layer:** Server (`apps/server/src/handoff/` — additive extension) + Build/CI tooling (`scripts/handoffs-verify.mjs`, root `package.json` script, additive step in `.github/workflows/inspection-nightly.yml`)
**Dependencies:** WP-231 (inspection module + `fetchLatestInspectionReport` + `validateSharedSecret` + `inspection-nightly.yml`) ✅, WP-232 (`legendary.finding_handoffs` + `HANDOFF_STATUSES` + transition table + `applyHandoffTransition` + `HANDOFF_SUBMIT_TOKEN`) ✅, WP-209 (nightly full sweep) ✅, WP-205 (route+logic+types module pattern, `{ data, error }` envelope, no-store + session-collapse carry-forwards) ✅, WP-118 (API catalog) ✅

---

## Session Context

WP-232 landed the handoff plumbing: each Inspector finding is an addressable
`legendary.finding_handoffs` row with a server-enforced 6-status lifecycle
(`open → claimed → fix-proposed | escalated → resolved | wont-fix`). A Builder
records a fix branch by transitioning a handoff to `fix-proposed`. But the loop
is **open**: nothing checks whether the fix actually resolved the anomaly. A
`fix-proposed` handoff sits in that state forever unless a human manually
transitions it. WP-232 deliberately reserved the `fix-proposed → claimed`
re-open edge "for WP-233 (failed verification)" and named this packet as the
closer.

This packet **closes the loop autonomously**. After a fix lands on `main`, the
next nightly's **full** sweep (WP-209) + Inspector triage (WP-231) produce a
fresh inspection report — that report **is** the re-sweep. A new autonomous
verification step then **diffs** each `fix-proposed` handoff's snapshotted
anomaly `(cellId, anomalyClass)` against that latest report and transitions it
through the **existing** WP-232 lifecycle:

- anomaly **gone** ⇒ `fix-proposed → resolved` (the fix is verified)
- anomaly **still present** ⇒ `fix-proposed → claimed` (regression — back to the Builder, the reserved re-open edge)

This is the pipeline's first **autonomous-action** surface (operator scope
decision, 2026-06-10): unlike WP-232's plumbing-only posture, WP-233 actively
transitions handoffs without a human. It is **not** an autonomous code-*writer* —
it writes no fix, opens no PR, edits no spec. The autonomy is the *verify-and-
transition loop* over already-filed findings; the Builder/Architect code/spec
writers remain deferred to their own separately-gated WPs.

Baseline: `origin/main @ f999aca` (WP-232 / EC-264 landed 2026-06-10; architecture-inventory refresh #262 merged).

---

## Goal

After this session the server exposes one new endpoint, `POST /api/handoffs/verify`
(shared-secret `X-Handoff-Token`, reusing the WP-232 handoff token), and an
additive trailing step in `inspection-nightly.yml` calls it after each nightly
`handoffs:sync`. The endpoint reads the latest inspection report **via the
exported `fetchLatestInspectionReport(database)` only**, loads every handoff
currently in `fix-proposed`, and — for each whose origin `reportId` differs from
the latest report's (i.e. a genuine re-sweep has run since the fix) — diffs its
`(cellId, anomalyClass)` against the latest report's findings. A handoff whose
anomaly is **absent** transitions `fix-proposed → resolved`; one whose anomaly
is **present** transitions `fix-proposed → claimed` (regression). Both
transitions go through the **existing** `applyHandoffTransition` guarded UPDATE —
server-authoritative, concurrency-safe, no new lifecycle state. `fix-proposed`
handoffs from the latest report itself (no re-sweep yet) are left untouched
(`skipped`). The operator dashboard reads the resulting lifecycle through the
unchanged `GET /api/handoffs/latest`; the loop found → triaged → fixed →
verified is now closed without a human in it.

---

## Assumes

- WP-232 complete. Specifically:
  - `legendary.finding_handoffs` exists (migration `data/migrations/020_create_finding_handoffs.sql`); `branch_ref` / `status` / `report_id` / `cell_id` / `anomaly_class` columns are present. No new migration is needed.
  - `apps/server/src/handoff/handoff.logic.ts` exports `applyHandoffTransition(database, handoffId, payload)` (the guarded `UPDATE ... AND status = $expectedStatus`, 0-rows ⇒ re-read ⇒ 404/409), `mapRowToHandoff(row)`, `HandoffNotFoundError`, `HandoffTransitionError`, and `DatabaseClient`.
  - `apps/server/src/handoff/handoff.types.ts` exports `HandoffStatus`, `HANDOFF_STATUSES`, and `HandoffRecord` (carrying `reportId`, `cellId: string | null`, `anomalyClass: string`, `status`). The locked transition table includes `fix-proposed → resolved` and `fix-proposed → claimed`.
  - `apps/server/src/handoff/handoff.routes.ts` exports `registerHandoffRoutes(router, pool, { requireAuthenticatedSession, verifier, accountResolver, handoffSubmitToken })`; the two POST handlers authenticate via `validateSharedSecret(headerValue, handoffSubmitToken)`.
  - `render.yaml` declares `HANDOFF_SUBMIT_TOKEN` `sync: false`; `.env.example` documents it. The verify endpoint reuses this token (no new secret).
- WP-231 complete. `apps/server/src/inspection/inspection.logic.ts` exports `fetchLatestInspectionReport(database)` returning a report whose `findings` is `readonly InspectionFinding[]` (`{ severity, anomalyClass, cellId, description, route }`) and whose identity carries `reportId`.
- WP-209 complete. The nightly `Sweep Nightly` → `Inspection Nightly` chain runs the full sweep + triage each night; a fix merged to `main` is re-swept by the next nightly (post-merge timing, per operator decision 2026-06-10).
- WP-205 / WP-118 complete (the `{ data, error }` envelope, `Cache-Control: no-store` first-statement lock D-11504, and the api-endpoints catalog with D-11804 replace-whole-row semantics + the closed Status/Auth sets).
- `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0.

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

- `apps/server/src/handoff/handoff.logic.ts` + `handoff.types.ts` + `handoff.routes.ts` — read entirely. WP-233 EXTENDS this module additively (reuses `applyHandoffTransition`, `HANDOFF_STATUSES`, the transition table, `validateSharedSecret`). No existing function, type, endpoint, or transition is modified.
- `apps/server/src/inspection/inspection.logic.ts` + `inspection.types.ts` — the verify reads the latest report via `fetchLatestInspectionReport` and compares against `InspectionFinding.cellId` / `.anomalyClass`. No inspection file is modified.
- `apps/server/src/sweep/sweep.routes.ts` + `analytics.routes.ts` — the shared-secret POST handler shape, the `{ data: [], error }` failure envelope, and the `Cache-Control: no-store` first-statement lock the verify handler mirrors.
- `.github/workflows/inspection-nightly.yml` — the workflow WP-233 **additively** extends with one trailing `handoffs:verify` step after `handoffs:sync` (existing steps byte-unchanged).
- `apps/dashboard/docs/code-checks-and-balances.md` §6 (Inspector verdict) + §8 (Merge Gate) — the role semantics: the Inspector confirms resolution; a failed verification cycles back to the Builder. WP-233 performs the Inspector's *verification* autonomously; it performs no Builder/Architect *writing*.
- `docs/ai/DECISIONS.md` D-23101..D-23103 (inspection posture + shared-secret centralization + anomalyClass opacity), D-23201..D-23203 (handoff storage + lifecycle + idempotent-sync/auth), D-9905 (auth closed set), D-10403 (session collapse), D-11504 (no-store), D-11804 (catalog) — carry forward; do not re-derive.
- `docs/ai/REFERENCE/00.6-code-style.md` (Rules 4 / 6 / 8 / 9 / 11 / 14) + `00.1-master-coordination-prompt.md` + `api-endpoints.md §Wired → Server-Registered Routes`.

---

## Scope (In)

### A) Server module extension (`apps/server/src/handoff/`)

- `handoff.types.ts` — **additive**: add the `HandoffVerifySummary` interface (the `POST /api/handoffs/verify` response). No existing interface, union, or array is modified (the additive contract extension is authorized by D-23301 + this WP's architecture review per code-style §Contract Files).
- `handoff.logic.ts` — **additive**: add the pure helper `isAnomalyResolved(handoff, report)` (true iff NO finding in `report.findings` has both the same `cellId` and the same `anomalyClass` as the handoff) and the async `verifyFixProposedHandoffs(database)` (reads the latest report via `fetchLatestInspectionReport` only — no direct `inspection_reports` SQL; loads `status = 'fix-proposed'` rows; for each whose `reportId !== latest.reportId`, transitions via the EXISTING `applyHandoffTransition` to `resolved` (resolved) or `claimed` (regressed); leaves same-report rows untouched as `skipped`; returns a `HandoffVerifySummary`). No `.reduce()`.
- `handoff.logic.test.ts` — **additive**: ≥ 8 new `node:test` cases (anomaly gone ⇒ resolved; anomaly present ⇒ claimed, **including ≥ 2 findings matching the same `(cellId, anomalyClass)` ⇒ still one `regressed`, multiplicity not weighted**; same-report handoff ⇒ skipped, status preserved; empty `inspection_reports` ⇒ null-report summary, no transitions; `isAnomalyResolved` truth table incl. run-level `cellId: null` match and a `string` cellId NOT matching `null` (strict `===`, no coercion); reads via `fetchLatestInspectionReport` — a fake whose report drives it, no `inspection_reports` SELECT; a `resolved`/`claimed`/`open` handoff is never touched (only `fix-proposed` processed); concurrency — a `fix-proposed` row advanced by a racing transition makes `applyHandoffTransition` throw, the verify loop catches it, excludes it from every counter, and processes the remaining handoffs to completion — no lost update, no double-act, no 500).
- `handoff.routes.ts` — **additive**: add the `POST /api/handoffs/verify` (shared-secret) handler and wire it into the existing `registerHandoffRoutes(...)`. `registerHandoffRoutes`'s signature is unchanged (reuses `handoffSubmitToken`).
- `handoff.routes.test.ts` — **additive**: ≥ 5 new `node:test` cases (verify auth pre-check 401 before any DB I/O; verify 200 + summary shape; verify `Cache-Control: no-store` first statement; verify body ignored / oversize 413; verify happy path drives `resolved` + `claimed` counts).

### B) CI tooling (autonomous verify step)

- `scripts/handoffs-verify.mjs` — **new**: `POST`s to `${API_BASE_URL}/api/handoffs/verify` with the `X-Handoff-Token` header; exit-code discipline mirroring `scripts/handoffs-sync.mjs` (0 ok / 1 missing env / 2 request-fail). Exports the pure helper trio (mirroring sync's `isHandoffSyncEnvComplete` / `classifySyncStatus` / `isValidHandoffSyncSummaryShape`): `isHandoffVerifyEnvComplete(env)` (env guard), `classifyVerifyStatus(status)` (`status === 200 ? 0 : 2`), and `isValidHandoffVerifySummaryShape(value)` (success-log gate only — a shape miss still exits 0). `main()` runs only at the process entry point.
- `apps/server/scripts/handoffs-verify.test.ts` — **new**: ≥ 4 `node:test` cases for the script's pure helpers (env-completeness guard, the documented exit-code mapping, response-shape acceptance). Placed under `apps/server/scripts/` so the server suite globs it (WP-231/WP-232 precedent); imports the script from `../../../scripts/handoffs-verify.mjs`.
- `package.json` — **modified**: add `"handoffs:verify": "node scripts/handoffs-verify.mjs"` to root `scripts`.
- `.github/workflows/inspection-nightly.yml` — **modified**: add ONE trailing step after the `handoffs:sync` step running `pnpm handoffs:verify` (`if: success()`, reading `HANDOFF_SUBMIT_TOKEN` + `API_BASE_URL`). Existing steps are byte-unchanged.

### C) Catalog + decisions

- `docs/ai/REFERENCE/api-endpoints.md` — **modified**: 1 new row (`POST /api/handoffs/verify`) per D-11804 replace-whole-row semantics.
- Reserve D-23301 (closed-loop verification posture: full-report `(cellId, anomalyClass)` diff vs `fix-proposed` handoffs, newer-report-only guard, reuse of the WP-232 lifecycle with NO new state, server-authoritative transitions) and D-23302 (autonomous nightly verify step: post-merge timing — the re-sweep is the next nightly full sweep — additive `handoffs:verify` step after `handoffs:sync`, idempotent).

---

## Out of Scope

- **An autonomous Builder agent that writes fixes / opens PRs** — still deferred (WP-232 Out of Scope, unchanged). WP-233 verifies fixes a human (or a future autonomous Builder) pushed; it writes no code and creates no branch/PR.
- **An autonomous Architect agent that auto-amends specs** — still deferred. WP-233 touches no `escalated` handoff; it processes only `fix-proposed`.
- **A new lifecycle state (e.g. `verified`)** — explicitly NOT added (operator decision Q4, 2026-06-10). Verification reuses the WP-232 6-status lifecycle: resolved ⇒ `resolved`, regression ⇒ `claimed`. The `HANDOFF_STATUSES` union + transition table are byte-unchanged.
- **A targeted / subset re-sweep runner** — explicitly NOT built (operator decision Q3, 2026-06-10). The re-sweep is the next nightly **full** sweep; verification is a diff against its inspection report. No change to the sweep runner, the sweep matrix, or `sweep-nightly.yml`.
- **A pre-merge / branch-scoped verification gate** — explicitly NOT built (operator decision Q2, 2026-06-10). Verification is post-merge (next-nightly) only; no PR-CI coupling.
- **Modifying any WP-232 contract beyond the additive `HandoffVerifySummary` interface + the additive verify endpoint** — `HANDOFF_STATUSES`, the transition table, `HandoffRecord`, the migration, and the three existing endpoints are byte-unchanged.
- **Modifying any `apps/server/src/inspection/**` file or the `inspection_reports` schema** — WP-231's surface is locked; WP-233 only *reads* the latest report via `fetchLatestInspectionReport`.
- **The dashboard surface** — `GET /api/handoffs/latest` already exposes the lifecycle; no `apps/dashboard/**` file is touched. (The handoff-chain dashboard remains the WP-232 paired follow-up.)
- **Cross-report anomaly dedup / fuzzy matching** — verification matches on exact `(cellId, anomalyClass)` equality. Description text (LLM-nondeterministic) is never compared.
- Refactors, cleanups, or "while I'm here" improvements.

---

## Files Expected to Change

- `apps/server/src/handoff/handoff.types.ts` — modified (additive: `HandoffVerifySummary`)
- `apps/server/src/handoff/handoff.logic.ts` — modified (additive: `isAnomalyResolved`, `verifyFixProposedHandoffs`)
- `apps/server/src/handoff/handoff.logic.test.ts` — modified (additive: ≥ 8 verify tests)
- `apps/server/src/handoff/handoff.routes.ts` — modified (additive: `POST /api/handoffs/verify` handler + wiring)
- `apps/server/src/handoff/handoff.routes.test.ts` — modified (additive: ≥ 5 verify route tests)
- `scripts/handoffs-verify.mjs` — new (POST verify; exports `isHandoffVerifyEnvComplete`)
- `apps/server/scripts/handoffs-verify.test.ts` — new (≥ 4 cases; placed so the server suite globs it)
- `package.json` — modified (1 new root script)
- `.github/workflows/inspection-nightly.yml` — modified (1 additive trailing `handoffs:verify` step; existing steps byte-unchanged)
- `docs/ai/REFERENCE/api-endpoints.md` — modified (1 new catalog row per D-11804)
- `docs/ai/DECISIONS.md` — modified (D-23301 + D-23302 reserved → Active at execution close)
- `docs/ai/STATUS.md` — modified (Done entry)
- `docs/ai/work-packets/WORK_INDEX.md` — modified (WP-233 row → Done)
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (EC-265 → Done)

14 files total (2 new + 5 modified source + 7 governance). No migration, no new token, no `render.yaml` / `.env.example` change. The bundle is a single coherent server+CI surface extending the WP-232 handoff module; partial landing has no value.

---

## Locked Type Contracts

`HandoffStatus`, `HANDOFF_STATUSES`, `HandoffRecord`, and the transition table are **imported / reused** from WP-232 — never redefined or extended. The only new contract is the verify response.

### `HandoffVerifySummary` — `POST /api/handoffs/verify` response

```ts
interface HandoffVerifySummary {
  reportId: string | null   // the latest (re-sweep) inspection report, or null when inspection_reports is empty
  verified: number          // fix-proposed handoffs whose anomaly is GONE in the latest report → transitioned to 'resolved'
  regressed: number         // fix-proposed handoffs whose anomaly PERSISTS → transitioned to 'claimed' (re-open)
  skipped: number           // fix-proposed handoffs whose origin reportId === the latest reportId (no re-sweep yet) → left 'fix-proposed'
}

{ data: HandoffVerifySummary }
```

**Accounting contract (locked):** `verified + regressed + skipped <= ` the count of `fix-proposed` handoffs read at the start of the verify. The three counters tally only successful transitions (`verified`, `regressed`) and intentional no-ops (`skipped`). The delta between that sum and the initial count is exactly the set of handoffs a concurrent transition advanced out of `fix-proposed` between this run's load and its guarded UPDATE — each makes `applyHandoffTransition` **throw** (its legality re-check or its 0-rows re-read; see the concurrency rule in §Verification rule below), the verify loop catches and excludes it, and it appears in **no** counter. No `ignored` / `concurrent` field is added (additive-discipline — the excluded delta is intentionally not surfaced). Never a lost update, never a double-act, never a miscount.

### Verification rule (locked)

For a `fix-proposed` handoff `H` and the latest inspection report `R`:

1. If `R` is null (empty `inspection_reports`) → no-op; summary all-zero, `reportId: null`.
2. If `H.reportId === R.reportId` → **skip** (the latest report IS `H`'s origin report; no re-sweep has run since the fix). Leave `H` as `fix-proposed`.
3. Else compute `isAnomalyResolved(H, R)` = NO finding `f` in `R.findings` satisfies `f.cellId === H.cellId && f.anomalyClass === H.anomalyClass` (a run-level finding has `cellId: null`; `null === null` matches a run-level anomaly).
   - resolved (true) → `applyHandoffTransition(database, H.handoffId, { toStatus: 'resolved' })`.
   - not resolved (false) → `applyHandoffTransition(database, H.handoffId, { toStatus: 'claimed' })`.
4. **Concurrency (locked).** `applyHandoffTransition` is reused verbatim and it **throws** on a concurrent advance — it does NOT return a 0-row sentinel. If between this run's `fix-proposed` load and a per-handoff transition another writer moved the row, `applyHandoffTransition` throws `HandoffTransitionError` (its legality re-check rejects, e.g. `claimed → resolved`, OR its guarded UPDATE matches 0 rows and the re-read finds a moved status) or `HandoffNotFoundError` (the row was deleted mid-run). The verify loop **catches both, does NOT retry, counts the handoff in NO bucket, and continues** with the remaining handoffs. A caught concurrent miss must never abort the run or surface as a 500 — the catch is mandatory (the primitive throws), not optional.

**Three invariants the diff obeys (locked):**

- **Match multiplicity is irrelevant.** `isAnomalyResolved` is existential, not a count: **≥ 1** finding matching `(cellId, anomalyClass)` ⇒ anomaly PRESENT ⇒ `regressed`; **exactly 0** matches ⇒ anomaly GONE ⇒ `verified`. The number of matches is never used as a weight, score, or tiebreak — a future engineer must not add match-counting logic.
- **Null `cellId` is a strict-equality sentinel.** A run-level finding/handoff carries `cellId: null`. Matching is `===` only: `null === null` is a valid match; a `string` cellId never matches `null`. **No coercion, `String()`, `?? ''`, `"null"`-stringification, or fallback normalization** is permitted on either side. (`mapRowToHandoff` already yields `cellId: string | null`; `InspectionFinding.cellId` is `string | null` — both sides arrive pre-normalized, compared raw.)
- **Order-independent.** The `fix-proposed` handoffs are processed in an undefined order, and that order MUST NOT affect the outcome. Each handoff is diffed independently against the SAME immutable latest report `R`; no handoff's result depends on another's.

### `POST /api/handoffs/verify` — Evaluation Order (Locked)

| # | Step | Outcome |
|---|---|---|
| 1 | `X-Handoff-Token` present, length-equal, then constant-time byte-equal (`validateSharedSecret`) | 401 on failure (no DB) |
| 2 | Body parseable as JSON and `<= 64 KB` (body is ignored; always verifies the latest report) | 413 on oversize (no DB) |
| 3 | `verifyFixProposedHandoffs(database)` — read latest report, load `fix-proposed` rows, diff + transition per the rule above | 200 with `{ data: HandoffVerifySummary }` |

**Idempotent at the endpoint:** repeated calls against the same latest report produce no additional transitions. The first run transitions the eligible `fix-proposed` rows out of `fix-proposed`; a second run finds none eligible (they are now `resolved` / `claimed`) → all-zero summary. A run against an unchanged report (no new sweep) only ever `skips`.

---

## Non-Negotiable Constraints

**Engine-wide (always apply):**
- ESM only, Node v22+; `node:` prefix on built-ins; `.test.ts` only; full file contents for every new/modified file; human-style code per 00.6.
- Never use `Math.random()`; the server touches no randomness. N/A: boardgame.io moves, `G`/`ctx`, persistence of game state.

**Packet-specific:**
- `POST /api/handoffs/verify` is `guest` per D-9905 with **shared-secret** auth: `X-Handoff-Token` MUST equal `process.env.HANDOFF_SUBMIT_TOKEN` via the existing `validateSharedSecret` helper (reused — the verify handler does NOT re-implement the constant-time check and does NOT import `node:crypto`). Mismatch → 401 `{ data: [], error: 'unauthorized' }` before any DB I/O.
- **Reuse the WP-232 lifecycle — add NO state and NO transition.** Verification transitions go through the existing `applyHandoffTransition` (`fix-proposed → resolved`, `fix-proposed → claimed`), which are already in the locked transition table. `handoff.types.ts`'s `HandoffStatus` / `HANDOFF_STATUSES` / transition table are byte-unchanged. The only `handoff.types.ts` edit is the additive `HandoffVerifySummary` interface.
- **Server is the sole authority for `status`.** The diff is computed server-side; transitions use the guarded `UPDATE ... AND status = 'fix-proposed' RETURNING *` (via `applyHandoffTransition`) — concurrency-safe (a row a parallel transition advanced is not double-acted; the 0-rows re-read disambiguates, never a lost update).
- **Concurrent-miss catch is mandatory.** `applyHandoffTransition` **throws** on a concurrent advance (`HandoffTransitionError` from its legality re-check or its 0-rows re-read; `HandoffNotFoundError` if the row was deleted) — it does not return a sentinel. The verify loop wraps each per-handoff transition in `try`/`catch`: a caught `HandoffTransitionError` / `HandoffNotFoundError` is **not retried, counted in no bucket, and the loop continues** (a `// why:` comment is required on the catch per 00.6 — swallowed errors must justify the swallow). An unhandled throw would abort the run mid-sweep and surface as a 500 with the remaining `fix-proposed` handoffs unprocessed; that is forbidden.
- **Newer-report-only verification.** A `fix-proposed` handoff is verified ONLY when the latest report's `reportId` differs from the handoff's origin `reportId` (a genuine re-sweep). Same-report handoffs are `skipped`, never falsely regressed. (This is the load-bearing correctness guard — without it, the first verify after a fix is recorded would re-flag the still-pre-fix report as a regression.)
- **Reads the report via the inspection library only.** `verifyFixProposedHandoffs` obtains the report through `fetchLatestInspectionReport(database)`; it issues NO direct SQL against `legendary.inspection_reports` (one source of truth — carry forward WP-232's D-23203 discipline). It MAY issue a direct `SELECT ... WHERE status = 'fix-proposed'` against `legendary.finding_handoffs` (its own module's table).
- **Idempotent + safe under repeat / no-new-sweep.** Running verify twice against the same latest report: the first run transitions the eligible `fix-proposed` handoffs out of `fix-proposed`; the second finds none eligible (they are now `resolved`/`claimed`) → all-zero summary. Verify against an unchanged report (no new sweep) only ever `skips` (no false transitions).
- **Description text is never compared.** The diff matches on `(cellId, anomalyClass)` only — `anomalyClass` is an opaque string (D-23103 / D-20703 carry-forward; no engine union import). LLM-nondeterministic finding `description` is never asserted or matched.
- `isAnomalyResolved` and the per-handoff loop MUST use explicit `for...of` / lookup — no `.reduce()`, no dynamic property access on an untrusted key.
- `Cache-Control: no-store` first-statement lock (D-11504 carry-forward) — the verify handler body sets the header as its literal first statement.
- `POST` body size cap 64 KB; reject 413. Body is ignored (the endpoint always verifies the latest report).
- Status-code domain locked: `POST /api/handoffs/verify` `{200, 401, 413, 500}`.
- **No new npm dependency** in any `package.json`. The script uses Node built-ins (`fetch`) only; no agent runs in this WP.
- `scripts/handoffs-verify.mjs` MUST exit non-zero on any failure with a full-sentence stderr message.
- API catalog update obligation (D-11804) — 1 new row under `## Wired → Server-Registered Routes`, replace-whole-row semantics, citing the authorizing decisions.
- **Additive-only on WP-232's files.** No existing `handoff.*` function, type, union, array, endpoint, transition, or test is modified — only new symbols/cases are appended. Verified by the existing handoff test suite staying green plus the new cases.

**Session protocol:**
- If `apps/server/src/handoff/` has been refactored since this WP was drafted (the `applyHandoffTransition` signature, the `HandoffRecord` shape, `HANDOFF_STATUSES`, or the transition table changed): read the new shape and reuse it; do not duplicate a stale pattern, and do not re-add a `verified` state.
- If `fetchLatestInspectionReport` no longer returns a report carrying `reportId` + `findings[]` with `cellId`/`anomalyClass`: STOP and reconcile.
- If `validateSharedSecret` or the `HANDOFF_SUBMIT_TOKEN` posture changed: STOP and ask.
- Never invent endpoint shapes, field names, or lifecycle states not locked here.

**Locked contract values:**
- POST verify URL: `/api/handoffs/verify` (literal; body ignored).
- Shared-secret header: `X-Handoff-Token` (reused; no new token, no `render.yaml`/`.env.example` change).
- Verification match key: `(cellId, anomalyClass)` exact `===` equality; run-level `cellId: null` matches `null` (no coercion / `String()` / `"null"`); ≥ 1 match ⇒ `regressed`, 0 matches ⇒ `verified` (multiplicity never weighted); processing order undefined and outcome-irrelevant.
- Concurrency: `applyHandoffTransition` throws on a concurrent advance (`HandoffTransitionError` / `HandoffNotFoundError`); the verify loop catches, does not retry, counts in no bucket, continues. Accounting: `verified + regressed + skipped <= ` initial `fix-proposed` count (the delta is the caught concurrent misses).
- Newer-report guard: verify a `fix-proposed` handoff only when `handoff.reportId !== latestReport.reportId`; else `skipped`.
- Transition mapping (reused from WP-232's table): resolved ⇒ `fix-proposed → resolved`; regression ⇒ `fix-proposed → claimed`.
- Workflow step: an additive trailing step in `inspection-nightly.yml` running `pnpm handoffs:verify`, `if: success()`, after `handoffs:sync`, reading `HANDOFF_SUBMIT_TOKEN` + `API_BASE_URL`.
- D-23301: closed-loop verification posture (full-report `(cellId, anomalyClass)` diff, newer-report-only guard, reuse WP-232 lifecycle with no new state, server-authoritative transitions).
- D-23302: autonomous nightly verify step (post-merge / next-nightly timing; additive `handoffs:verify` step; idempotent).

---

## Script Exit Codes

`scripts/handoffs-verify.mjs` — the workflow keys success/failure on its exit code.

| Code | Meaning |
|---|---|
| 0 | Success — `POST /api/handoffs/verify` returned HTTP 200 |
| 1 | Missing/empty env vars (`HANDOFF_SUBMIT_TOKEN`, `API_BASE_URL`) — no request made |
| 2 | Request failure — a network error OR any non-200 response from `POST /api/handoffs/verify` |

**Success is keyed on HTTP 200, not on the body** (mirrors `scripts/handoffs-sync.mjs` verbatim — locked by that precedent, not re-derived). The endpoint's success status domain is `{200}` (others are `{401, 413, 500}`), so the classifier is `status === 200 ? 0 : 2` (not a `2xx` range — a `201`/`204` would be exit 2, as in sync). A 200 with an **unparseable or unexpected** body still exits **0**: `isHandoffVerifyEnvComplete`'s sibling shape check (`isValidHandoffVerifySummaryShape`) gates only the success **log line** for operator visibility — a parse/shape miss logs `<unreadable>` and still exits 0, exactly as `handoffs-sync.mjs` does (its `// why:` documents that a 200 with an unreadable body is still a successful run). Do NOT promote a body-shape mismatch to exit 2 — that would diverge from the sync precedent and fail CI on a valid 200.

---

## Acceptance Criteria

1. `POST /api/handoffs/verify` rejects a missing/short `X-Handoff-Token` with 401 before any DB I/O via the shared `validateSharedSecret` helper (token shorter than the env token → 401, no `RangeError`, no DB call).
2. `POST /api/handoffs/verify` over a `fix-proposed` handoff whose anomaly is ABSENT from the latest (newer-`reportId`) report transitions it `fix-proposed → resolved` and counts it under `verified`.
3. `POST /api/handoffs/verify` over a `fix-proposed` handoff whose anomaly is PRESENT in the latest (newer-`reportId`) report transitions it `fix-proposed → claimed` and counts it under `regressed`.
4. A `fix-proposed` handoff whose `reportId` EQUALS the latest report's `reportId` is left `fix-proposed` and counted under `skipped` — no transition (the newer-report-only guard).
5. `verifyFixProposedHandoffs` over an empty `inspection_reports` returns `{ data: { reportId: null, verified: 0, regressed: 0, skipped: 0 } }` and issues no transition.
6. Only `fix-proposed` handoffs are processed: a handoff in `open` / `claimed` / `escalated` / `resolved` / `wont-fix` is never read into the verify loop and never transitioned — verified by a logic test seeding mixed statuses.
7. `isAnomalyResolved(handoff, report)` returns the correct truth value, including the run-level case (`cellId: null` matching a run-level finding's `null`) — verified by a truth-table test.
8. `verifyFixProposedHandoffs` reads the report via `fetchLatestInspectionReport` only — verified by grep (`FROM legendary.inspection_reports` returns 0 in `handoff.logic.ts`) and by a fake whose `fetchLatestInspectionReport` drives the run with no inspection SELECT issued.
9. Transitions go through the existing `applyHandoffTransition` (guarded UPDATE); a `fix-proposed` row advanced by a racing transition between load and write makes `applyHandoffTransition` **throw** (`HandoffTransitionError` / `HandoffNotFoundError`), and the verify loop **catches it, does not retry, excludes it from every counter, and processes the remaining handoffs to completion** — verified by a concurrency logic test (a fake whose guarded UPDATE returns 0 rows for one handoff: the run completes, the racing row is in no bucket, and no other handoff is dropped; no lost update, no double-act, no 500).
10. `handoff.types.ts` adds ONLY `HandoffVerifySummary`; `HandoffStatus`, `HANDOFF_STATUSES`, the transition table, and `HandoffRecord` are byte-unchanged — verified by grep (no `verified` member added to `HANDOFF_STATUSES`; the union still has exactly 6 members).
11. `verifyFixProposedHandoffs` and `isAnomalyResolved` contain no `.reduce()` — verified by grep (0 `.reduce(` net-new in `handoff.logic.ts`).
12. The verify handler body sets `Cache-Control: no-store` as its literal first statement; the shared-secret check is NOT re-implemented in the handler (grep: 0 `timingSafeEqual` net-new in `handoff.routes.ts`; the handler calls `validateSharedSecret`).
13. `docs/ai/REFERENCE/api-endpoints.md` carries 1 new row (`POST /api/handoffs/verify`, Auth `guest` shared-secret, Status `{200, 401, 413, 500}`) citing D-23301/D-23302/D-9905/D-11504/D-11804, per replace-whole-row semantics.
14. `scripts/handoffs-verify.mjs` POSTs to `${API_BASE_URL}/api/handoffs/verify` with `X-Handoff-Token`, exits 0 on HTTP 200, 1 on missing env (no request), 2 on a network error or any non-200 response; a 200 with an unparseable/unexpected body still exits 0 (shape validation is log-only, mirroring `handoffs-sync.mjs`) — verified by `apps/server/scripts/handoffs-verify.test.ts` (≥ 4 cases against the exported helpers, incl. the `status === 200 ? 0 : 2` mapping and a 200/bad-body → 0 case).
15. `.github/workflows/inspection-nightly.yml` gains exactly one additive trailing step running `pnpm handoffs:verify` (`if: success()`, after `handoffs:sync`, reading `HANDOFF_SUBMIT_TOKEN` + `API_BASE_URL`); the pre-existing fetch / triage / submit / sync steps are byte-unchanged.
16. No new npm dependency in any `package.json` diff; no `apps/dashboard/**`, `apps/server/src/inspection/**`, `data/migrations/**`, `render.yaml`, or `.env.example` file is modified; the WP-232 migration + the three existing handoff endpoints are untouched (verified by `git diff --name-only`).
17. `pnpm --filter @legendary-arena/server test` exits 0 with ≥ 17 net-new cases (≥ 8 logic + ≥ 5 routes + ≥ 4 verify-script) and ALL pre-existing handoff cases still green; `pnpm -r build` exits 0.

---

## Verification Steps

```pwsh
# 1. Server tests pass (>= 17 net-new; pre-existing handoff cases green)
pnpm --filter @legendary-arena/server test 2>&1 | Select-Object -Last 3

# 2. Build passes
pnpm -r build

# 3. No new lifecycle state — HANDOFF_STATUSES unchanged (6 members, no 'verified')
Select-String -Path "apps\server\src\handoff\handoff.types.ts" -Pattern "verified"
# Expected: no output

# 4. Report read via the inspection library only (no direct inspection SQL)
(Select-String -Path "apps\server\src\handoff\handoff.logic.ts" -Pattern "FROM legendary.inspection_reports").Count
# Expected: 0
Select-String -Path "apps\server\src\handoff\handoff.logic.ts" -Pattern "fetchLatestInspectionReport"
# Expected: >= 1

# 5. Transitions reuse applyHandoffTransition (no new guarded UPDATE re-implemented in verify)
Select-String -Path "apps\server\src\handoff\handoff.logic.ts" -Pattern "applyHandoffTransition"
# Expected: >= 1 (verifyFixProposedHandoffs calls it)

# 6. Shared-secret reused, not re-implemented, in the verify handler
(Select-String -Path "apps\server\src\handoff\handoff.routes.ts" -Pattern "timingSafeEqual").Count
# Expected: 0
Select-String -Path "apps\server\src\handoff\handoff.routes.ts" -Pattern "validateSharedSecret"
# Expected: >= 1

# 7. Cache-Control first-statement gate present for the verify handler
(Select-String -Path "apps\server\src\handoff\handoff.routes.ts" -Pattern "Cache-Control.*no-store").Count
# Expected: >= 4 (the three WP-232 handlers + verify)

# 8. No .reduce() in the logic module
(Select-String -Path "apps\server\src\handoff\handoff.logic.ts" -Pattern "\.reduce\(").Count
# Expected: 0

# 9. Catalog row present
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "/api/handoffs/verify"
# Expected: 1 line

# 10. Nightly workflow gains the verify step; earlier steps unchanged
Select-String -Path ".github\workflows\inspection-nightly.yml" -Pattern "handoffs:verify"
# Expected: 1 line

# 11. No out-of-scope files touched
git diff --name-only apps/dashboard/ apps/server/src/inspection/ data/migrations/ render.yaml .env.example
# Expected: no output

# 12. No new npm deps
git diff package.json apps/server/package.json
# Expected: only the 1 new root script
```

---

## Definition of Done

- [ ] All 17 Acceptance Criteria pass
- [ ] All 12 Verification Steps produce the expected output
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0 (pre-existing handoff cases still green)
- [ ] No files outside `## Files Expected to Change` were modified (`git diff --name-only`)
- [ ] No `apps/dashboard/**`, `apps/server/src/inspection/**`, `data/migrations/**`, `render.yaml`, or `.env.example` modified
- [ ] WP-232's `HANDOFF_STATUSES` union, transition table, migration, and 3 existing endpoints byte-unchanged
- [ ] `docs/ai/REFERENCE/api-endpoints.md` carries the 1 new row per D-11804
- [ ] `docs/ai/STATUS.md` updated — the loop is closed: fixes are auto-verified post-merge, regressions auto-cycle back to the Builder
- [ ] `docs/ai/DECISIONS.md` updated — D-23301 (verification posture) + D-23302 (autonomous nightly verify step) flipped Reserved → Active
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-233 checked off with today's date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-265 flipped Draft → Done

---

## Vision Alignment

**Vision clauses touched:** §20-26 (scoring/PAR/simulation — the sweep is QA simulation; the Inspector triages it; this WP verifies the fix closed the anomaly), §22 (determinism/replay).

**Conflict assertion:** `No conflict: this WP preserves all touched clauses.` Closed-loop verification is an internal operator/CI-only QA *meta* surface over already-filed findings. It changes no game logic, no RNG sourcing, no scoring math, no replay storage/verification, and adds no lifecycle state.

**Non-Goal proximity check:** none of NG-1..7 crossed — no user-facing, paid, persuasive, competitive, or monetization surface. The endpoint is operator/CI-only (shared-secret).

**Determinism preservation:** the engine + sweep determinism is unchanged and replay-faithful (§22). The verification is a server-enforced deterministic diff (`(cellId, anomalyClass)` equality) driving the WP-232 deterministic state machine; the finding TEXT it sits over is LLM-nondeterministic (D-23102, inherited — never compared). This surface is meta-workflow, not gameplay/scoring/replay.

---

## Funding Surface Gate

**N/A — server/CI infrastructure only; no global navigation, Registry Viewer, profile/account, or tournament funding affordances; no user-visible copy. The endpoint is operator/CI-only.** None of the §20.1 trigger surfaces are present.

---

## API Catalog Update

**APPLIES.** §21.1 triggered: one new HTTP endpoint on `apps/server`. Per D-11804 replace-whole-row semantics, the catalog update lands in the same commit as the route code. Row:

- `POST /api/handoffs/verify` — Auth: `guest` (shared-secret `X-Handoff-Token`); Status closed-set `{200, 401, 413, 500}`; Authorizing WP: `WP-233`; Cites: D-23301, D-23302, D-9905, D-11504, D-11804

---

## Lint Gate Self-Review

Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`, all 21 sections reviewed 2026-06-10
(re-affirmed 2026-06-10 after the audit-tightening edits per the 01.0a Step 5 re-run
rule — pre-flight `READY TO EXECUTE` + copilot `PASS/CONFIRM` recorded the same day;
scratchpads at `docs/ai/invocations/preflight-wp233-*.md` + `copilot-wp233-*.md`):

| § | Verdict | Note |
|---|---|---|
| 1 | PASS | All required sections present; Out of Scope lists ≥ 8 explicit exclusions (autonomous Builder/Architect, new state, subset runner, pre-merge gate, contract/inspection/dashboard untouched, dedup) |
| 2 | PASS | Engine-wide + packet-specific + session protocol + locked values; full-file output; 00.6 referenced. Locked invariants made explicit: accounting (`sum <= initial`), concurrent-miss catch (the primitive throws), match-multiplicity (existential, unweighted), null-`cellId` strict-equality sentinel (no coercion), order-independence, and idempotency at the endpoint |
| 3 | PASS | WP-231/232/209/205/118 deps listed with the required exports/shapes (`applyHandoffTransition`, `fetchLatestInspectionReport`, `validateSharedSecret`, `HANDOFF_STATUSES`, transition table, token) |
| 4 | PASS | handoff/inspection/sweep/analytics modules, code-checks-and-balances §6/§8, D-entries, 00.6, api-endpoints all cited specifically |
| 5 | PASS | 14 files listed with new/modified disposition + descriptions; additive-only on WP-232's files stated; bundle justification given |
| 6 | PASS | One new field name (`HandoffVerifySummary`) internally consistent camelCase; severity/route/finding/status names reused (no rename); no 00.2 §8.1 setup-payload fields touched |
| 7 | PASS | No new npm deps; no agent; `pg` / `node:test` / built-in `fetch` only |
| 8 | PASS | Server-layer only; no engine/registry/preplan import; PostgreSQL for QA-workflow data; no `G`/`ctx`; no boardgame.io move/phase logic |
| 9 | PASS | PowerShell verification commands; the `.mjs` script uses `node --env-file`/built-in fetch; CI YAML on ubuntu |
| 10 | PASS | Reuses `HANDOFF_SUBMIT_TOKEN` + `API_BASE_URL` (documented; no new secret, no `render.yaml`/`.env.example` change); no real secrets in the WP |
| 11 | PASS | No new player identity model; endpoint auth commits to the established closed set (D-9905) — shared-secret for the CI POST. `## Out of Scope` serves as the limitations note |
| 12 | PASS | Tests use `node:test`/`node:assert`, no boardgame.io, recording-fake `pool`; the snapshotted LLM finding text is never asserted/matched — only `(cellId, anomalyClass)` shape + lifecycle |
| 13 | PASS | 12 exact `pnpm`/`git`/PowerShell verification commands with expected output |
| 14 | PASS | 17 binary, observable acceptance criteria aligned to deliverables (incl. newer-report guard / skip / concurrency / source-of-truth / additive-only checks) |
| 15 | PASS | DoD includes STATUS / DECISIONS / WORK_INDEX / EC_INDEX + scope-boundary + WP-232-unchanged + inspection/dashboard/migration-untouched checks |
| 16 | PASS | No premature abstraction — `applyHandoffTransition` / `validateSharedSecret` / `fetchLatestInspectionReport` reused (not re-created); `isAnomalyResolved` is this WP's single-purpose helper; explicit control flow (no reduce); full-word names; `// why:` on the newer-report guard, the reuse-not-new-state choice, and the no-store header; named imports |
| 17 | PASS | `## Vision Alignment` present with clause numbers + no-conflict + determinism-preservation line (deterministic diff over a deterministic state machine; LLM text inherited-nondeterministic, never compared) |
| 18 | PASS | Verification greps target literal tokens (`fetchLatestInspectionReport`, `applyHandoffTransition`, `validateSharedSecret`, `Cache-Control`, `handoffs:verify`); prose cites D-entries rather than enumerating forbidden tokens under a grep path |
| 19 | N/A | No repo-state-summarizing artifact authored in this WP draft |
| 20 | N/A | Server/CI infrastructure only; no funding surfaces (justified above) |
| 21 | PASS | `## API Catalog Update` present; 1 new row with closed-set Status/Auth, canonical field names, authorizing-WP + D-citations, replace-whole-row semantics |

---

## Future Work Packets (Scoped From This Foundation)

- **Dashboard closed-loop view** (extends the WP-232 dashboard follow-up): the Pipeline page renders the full found → triaged → fixed → verified lifecycle, including auto-resolved and regressed (re-opened) transitions, from `GET /api/handoffs/latest`.
- **Autonomous Builder execution** (still deferred): a Builder CI workflow that claims `open` Builder-routed handoffs, attempts engine fixes on a branch, records the branch (`→ fix-proposed`), and opens a draft PR — at which point WP-233's verify autonomously confirms or regresses it post-merge, completing the unattended loop.
- **Targeted re-sweep optimization** (deferred per Q3): if full-corpus sweep cost (WP-234) makes the full re-sweep + diff expensive, a targeted re-sweep of only the previously-failing cells could replace the full-report diff — a performance optimization over the same verification contract.
