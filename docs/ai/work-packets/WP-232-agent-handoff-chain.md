# WP-232 — Agent Handoff Chain (Finding-Lifecycle Store + Builder/Architect Handoff Contracts — Plumbing Only)

**Status:** Draft
**Primary Layer:** Server (`apps/server/src/handoff/`) + Migration (`data/migrations/`) + Build/CI tooling (`scripts/handoffs-sync.mjs`, root `package.json` script, additive step in `.github/workflows/inspection-nightly.yml`)
**Dependencies:** WP-209 (sweep server storage) ✅, WP-210 (sweep composable) ✅, WP-230 (Pipeline page sweep integration) ✅, WP-231 (inspection module + `validateSharedSecret` helper + `inspection-nightly.yml`) ✅, WP-115 (Postgres bootstrap) ✅, WP-205 (route+logic+types module pattern, `{ data, error }` envelope, no-store + session-collapse carry-forwards) ✅, WP-118 (API catalog) ✅

---

## Session Context

WP-231 landed the Inspector half of the agent pipeline: a nightly headless-Claude triage reads each sweep run, applies the `agent-inspector` P0/P1/P2 rubric, and files an `InspectionReport` into `legendary.inspection_reports`. Each report's `findings[]` already carries a per-finding `route: 'Builder' | 'Architect'` (the issue-attribution dimension) and a `severity`. But the findings live inside a single JSONB array — they are **not individually addressable** and carry **no lifecycle state**. There is no way to say "finding #3 of last night's report has been claimed by a Builder" or "finding #5 was escalated to the Architect." Nothing tracks a finding from filed → acted-on → closed.

This packet lands the **handoff plumbing** between the Inspector and the downstream Builder / Architect roles (WP-231 → 232 → 233): a `legendary.finding_handoffs` store that makes each Inspector finding an addressable, claimable work-item with a deterministic lifecycle, plus the handoff JSON contracts and the three endpoints that let a Builder claim / record / escalate a finding and let the operator dashboard read the chain state.

This WP is **plumbing only** by explicit scope decision (operator, 2026-06-10). It builds the contracts, the lifecycle store, and the API. It does **NOT** run an autonomous Builder agent that modifies engine code or opens PRs, and it does **NOT** auto-amend WP specs. Those are the first unattended *code-writing* and *governance-writing* surfaces in the pipeline, and they get their own separately-gated follow-up WP — the same separation-of-duties discipline the checks-and-balances system (`apps/dashboard/docs/code-checks-and-balances.md`) exists to enforce. Here, `branchRef` and `amendmentRequest` are **references the server stores**, never actions the server performs.

Baseline: `origin/main @ 2ef1f30` (WP-231 / EC-263 landed, 2026-06-09).

---

## Goal

After this session, `legendary.finding_handoffs` exists and the server exposes three new endpoints. `POST /api/handoffs/sync` (shared-secret `X-Handoff-Token`) reads the latest inspection report **via the exported `fetchLatestInspectionReport(database)` only** (no direct SQL against `inspection_reports` from this module) and idempotently inserts one `open` handoff row per finding — re-syncing the same report is a normal no-op (existing rows keep their lifecycle status), never an error. `POST /api/handoffs/transition` (shared-secret) applies a server-validated, **concurrency-safe** lifecycle transition to one handoff (e.g. a Builder claims it, records a fix branch reference, escalates a spec gap to the Architect, or closes it) — two transitions racing from the same starting state cannot both succeed. `GET /api/handoffs/latest` (session-gated) returns the current report's handoffs plus per-status counts for the future dashboard "status of each finding through the chain" view, under a deterministic total ordering. An additive step in the existing `inspection-nightly.yml` calls the sync endpoint after each nightly triage so the queue stays fresh. No engine code is modified by any agent; the handoff store persists lifecycle state transitions, it does not act on them.

---

## Assumes

- WP-231 complete. Specifically:
  - `legendary.inspection_reports` exists (migration `data/migrations/019_create_inspection_reports.sql`); the next migration number is `020`.
  - `apps/server/src/inspection/inspection.logic.ts` exports `fetchLatestInspectionReport(database)` returning `InspectionReportSummary | null` (its `findings` field is `readonly InspectionFinding[]`).
  - `apps/server/src/inspection/inspection.types.ts` exports `InspectionSeverity` (`'P0' | 'P1' | 'P2'`), `InspectionRoute` (`'Builder' | 'Architect'`), `INSPECTION_SEVERITIES`, `INSPECTION_ROUTES`, and `InspectionFinding` (`{ severity, anomalyClass, cellId, description, route }`, all `readonly`).
  - `apps/server/src/auth/validateSharedSecret.ts` exports `validateSharedSecret(headerValue, envToken)` (a `Buffer.byteLength` length pre-check then `node:crypto.timingSafeEqual`; returns `false` for missing / undefined / empty / length-mismatched input, never throws).
  - `apps/server/src/server.mjs` loads a shared-secret via a `load*SubmitToken()` startup function (production loud-fail when unset; fixed test fallback + one-shot warn in non-production) and threads it through a `register*Routes(server.router, pool, { requireAuthenticatedSession, verifier, accountResolver, ...Token })` call. `requireAuthenticatedSession`, `verifier`, and `productionAccountResolver` are in scope at the registration site.
  - `.github/workflows/inspection-nightly.yml` exists (workflow name `Inspection Nightly`, `on: workflow_run` after `Sweep Nightly` + `workflow_dispatch`), reads `API_BASE_URL` from Actions secrets, and ends with the inspection submit step.
  - `render.yaml` declares `INSPECTION_SUBMIT_TOKEN` `sync: false`; `.env.example` documents it.
- WP-205 complete. `apps/server/src/analytics/` models the `{ data, error }` envelope, the `Cache-Control: no-store` first-statement lock (D-11504), and the `SessionValidationErrorCode` collapse to `'unauthorized'` (D-10403) for session-gated GETs.
- WP-118 complete. `docs/ai/REFERENCE/api-endpoints.md` exists with D-11804 replace-whole-row semantics, the Status closed set `{ Wired | Shipped-but-unwired | Library-only | Pending }`, and the Auth closed set `{ guest | handle-required | authenticated-session-required }` (D-9905).
- `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0.

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — the server wires and stores; it does not decide gameplay. The handoff store is server-layer QA/config data (a lifecycle record over Inspector findings), not engine state.
- `.claude/rules/architecture.md` §Layer Boundary + §Server Layer — `apps/server/**` is the `server` category (02-CODE-CATEGORIES.md); the new `apps/server/src/handoff/` directory inherits it (no engine/registry/preplan import; `pg` for storage; no `G`/`ctx`).
- `apps/server/src/inspection/inspection.logic.ts` + `inspection.types.ts` — read entirely. This WP imports `fetchLatestInspectionReport` and the `InspectionSeverity` / `InspectionRoute` / `InspectionFinding` types from here (one source of truth — the handoff module does not redefine severity/route). The handoff module mirrors this module's shape (types + logic + routes + tests).
- `apps/server/src/sweep/sweep.routes.ts` — the `register*Routes(router, pool, deps)` signature, the shared-secret POST handler shape, and the `{ data: [], error }` failure envelope the handoff routes mirror.
- `apps/server/src/analytics/analytics.routes.ts` — the `Cache-Control: no-store` first-statement lock (D-11504) and the `SessionValidationErrorCode` collapse (D-10403) the session-gated `GET /api/handoffs/latest` reuses verbatim.
- `apps/server/src/auth/validateSharedSecret.ts` — the single shared-secret validator the two handoff POST handlers call (no inline `timingSafeEqual` in a route file — WP-231 / D-23103 centralization).
- `data/migrations/019_create_inspection_reports.sql` — models the schema closure (explicit columns, CHECK constraints, BTREE index, `IF NOT EXISTS` idempotency, forward-only) the new `020_create_finding_handoffs.sql` mirrors.
- `apps/server/src/server.mjs` — the `loadInspectionSubmitToken()` + `registerInspectionRoutes(...)` block this WP mirrors for `loadHandoffSubmitToken()` + `registerHandoffRoutes(...)`.
- `.github/workflows/inspection-nightly.yml` — the workflow this WP **additively** extends with one trailing `handoffs:sync` step (existing steps byte-unchanged).
- `apps/dashboard/docs/code-checks-and-balances.md` §5 (Builder) + §6 (Inspector verdict rule) + §8 (Merge Gate: Builder commits to a feature branch, never main; no self-merge of MEDIUM/HIGH) — the role semantics the handoff lifecycle encodes. The Builder "attempts fixes on a branch" and "escalates spec gaps to the Architect"; this WP records those handoffs, it does not perform them.
- `docs/ai/DECISIONS.md` D-23101..D-23103 (inspection storage + LLM-triage posture + shared-secret centralization + anomalyClass opacity), D-9905 (auth closed set), D-10403 (session error collapse), D-11504 (no-store), D-11804 (catalog) — anchor decisions this WP carries forward. Do not re-derive them.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rules 4 / 6 / 9 / 11 / 13 / 14 apply.
- `docs/ai/REFERENCE/00.1-master-coordination-prompt.md` — non-negotiable structural constraints.
- `docs/ai/REFERENCE/api-endpoints.md §Wired → Server-Registered Routes` — the catalog rows this WP appends to (3 new endpoints).
- `docs/ai/REFERENCE/02-CODE-CATEGORIES.md §server` — confirms `apps/server/src/handoff/` is the `server` category (the QA/meta-surface trio already named there: analytics / sweep / inspection; handoff is the next sibling).

---

## Scope (In)

### A) Storage

- Migration `data/migrations/020_create_finding_handoffs.sql` creating `legendary.finding_handoffs` with the closed 14-column schema locked in §Locked Contract Values + 2 BTREE indexes. Forward-only, every `CREATE` uses `IF NOT EXISTS`.

### B) Server module (`apps/server/src/handoff/`)

- `handoff.types.ts` — `HandoffStatus` named union (`'open' | 'claimed' | 'fix-proposed' | 'escalated' | 'resolved' | 'wont-fix'`) + the matching canonical readonly array `HANDOFF_STATUSES` + a bidirectional drift test (mirrors `INSPECTION_SEVERITIES`). Imports `InspectionSeverity`, `InspectionRoute`, `InspectionFinding` from `../inspection/inspection.types.js` (no redefinition). Interfaces: `HandoffRecord` (row + wire shape), `HandoffTransitionPayload` (`POST /api/handoffs/transition` body), `HandoffSyncSummary` (`POST /api/handoffs/sync` response), `HandoffLatestEnvelope` (`GET /api/handoffs/latest` response).
- `handoff.logic.ts` — `DatabaseClient = Pool` re-export; pure helpers `deriveHandoffId(reportId, findingIndex)` (`` `${reportId}#${findingIndex}` ``), `isAllowedTransition(fromStatus, toStatus)` (explicit lookup against the locked transition table — no `.reduce()`), `countHandoffsByStatus(handoffs)` (pure, for the GET counts); async DB functions `syncHandoffsFromLatestReport(database)` (reads the report via `fetchLatestInspectionReport` only — no direct `inspection_reports` SQL), `applyHandoffTransition(database, handoffId, payload)` (validate → load → legality-check → **guarded atomic UPDATE** `WHERE handoff_id = $1 AND status = $expectedStatus`; 0 rows ⇒ re-read to disambiguate 404 vs 409), `fetchLatestHandoffs(database)`; a `mapRowToHandoff(row)` mapper; and a `HandoffNotFoundError` + `HandoffTransitionError` the route layer maps to 404 / 409.
- `handoff.logic.test.ts` — ≥ 10 `node:test` cases (status drift gate; sync creates one `open` row per finding; sync is idempotent — re-sync leaves a `claimed` row `claimed` and reports `unchanged`; sync over an empty `inspection_reports` returns the null-report summary; sync reads via `fetchLatestInspectionReport` — a fake whose `fetchLatestInspectionReport` returns a report drives the inserts, no `inspection_reports` SELECT issued; `isAllowedTransition` truth table; `applyHandoffTransition` legal transition updates status + `updated_at` + the relevant reference column; illegal transition throws `HandoffTransitionError`; unknown handoffId throws `HandoffNotFoundError`; **concurrency — the guarded UPDATE affects 0 rows when the row's status moved between load and write, and the re-read maps to 409 (status changed) / 404 (row gone) rather than a lost update**; **tie-break — two reports with identical `created_at` resolve to the lexicographically greatest `report_id`**; `fetchLatestHandoffs` returns only the latest report's rows ordered by `(finding_index ASC, handoff_id ASC)`; transitioning away from `fix-proposed` preserves the stored `branch_ref`).
- `handoff.routes.ts` — `POST /api/handoffs/sync` (shared-secret) + `POST /api/handoffs/transition` (shared-secret) + `GET /api/handoffs/latest` (session-gated) handlers + `registerHandoffRoutes(router, pool, { requireAuthenticatedSession, verifier, accountResolver, handoffSubmitToken })` export.
- `handoff.routes.test.ts` — ≥ 12 `node:test` cases (sync auth pre-check 401; sync 200 + summary; transition auth pre-check 401; transition 400 on out-of-set `toStatus`; transition 400 on `fix-proposed` missing `branchRef`; transition 400 on `escalated` missing `amendmentRequest`; transition 404 on unknown handoffId; transition 409 on illegal transition; transition 200 happy path; GET no-store first statement; GET session 401 collapse; GET 200 shape + counts).

### C) CI tooling (queue refresh)

- `scripts/handoffs-sync.mjs` — new: `POST`s to `${API_BASE_URL}/api/handoffs/sync` with the `X-Handoff-Token` header; exit-code discipline mirroring `scripts/inspection-submit.mjs`. Exports a pure `isHandoffSyncEnvComplete(env)` guard for the test.
- `apps/server/scripts/handoffs-sync.test.ts` — new: ≥ 4 `node:test` cases for the script's pure helpers (env-completeness guard, the documented exit-code mapping, response-shape acceptance). Lives under `apps/server/scripts/` (not root `scripts/`) so the server package test runner globs it — the same placement WP-231 landed for `inspection-submit.test.ts`; it imports the script under test from the root `../../../scripts/handoffs-sync.mjs`.
- `package.json` — **modified**: add `"handoffs:sync": "node scripts/handoffs-sync.mjs"` to root `scripts`.
- `.github/workflows/inspection-nightly.yml` — **modified**: add ONE trailing step after the inspection submit step that runs `pnpm handoffs:sync` (reads `HANDOFF_SUBMIT_TOKEN` + `API_BASE_URL` from Actions secrets). Existing steps are byte-unchanged; the step is `if: success()` so a failed triage does not sync a stale queue.

### D) Server bootstrap

- `apps/server/src/server.mjs` — **modified**: one `loadHandoffSubmitToken()` startup function (mirroring `loadInspectionSubmitToken()` — production loud-fail when `HANDOFF_SUBMIT_TOKEN` is unset; fixed test fallback + one-shot warn otherwise) and one `registerHandoffRoutes(server.router, pool, { ... })` call next to `registerInspectionRoutes(...)`.

### E) Config + catalog

- `render.yaml` — **modified**: add `HANDOFF_SUBMIT_TOKEN` `sync: false` env-var declaration (mirroring `INSPECTION_SUBMIT_TOKEN`).
- `.env.example` — **modified**: document `HANDOFF_SUBMIT_TOKEN` (server + Actions secret).
- `docs/ai/REFERENCE/api-endpoints.md` — **modified**: 3 new rows (`POST /api/handoffs/sync`, `POST /api/handoffs/transition`, `GET /api/handoffs/latest`) per D-11804 replace-whole-row semantics.
- Reserve D-23201 (finding_handoffs storage shape + handoff contract lock + denormalization-snapshot posture), D-23202 (handoff lifecycle state machine + plumbing-only scope lock), D-23203 (idempotent sync materialization + handoff auth posture).

---

## Out of Scope

- **An autonomous Builder agent that modifies engine code or opens PRs** — explicitly deferred by the operator scope decision (2026-06-10). This WP records handoff lifecycle state; it runs no code-writing agent. The unattended code-writer is the first such surface in the pipeline and gets its own separately-gated follow-up WP. `branchRef` is a reference string the server stores, never a branch the server creates.
- **An autonomous Architect agent that auto-amends WP specs** — same deferral. `amendmentRequest` is an escalation payload the server stores for a human/Architect session to act on; nothing in this WP edits a WP spec.
- **The dashboard surface that renders the handoff chain** — the paired follow-up (mirrors WP-209 → WP-210, WP-231 → its dashboard follow-up). This WP stops at `GET /api/handoffs/latest`; no `apps/dashboard/**` file is touched.
- **Closed-loop re-sweep verification** (a fix resolving the anomaly, the Inspector confirming, a `verified` lifecycle state) — that is WP-233. This WP's lifecycle ends at `resolved` / `wont-fix`; it reserves the `fix-proposed → claimed` re-open edge for WP-233 but adds no `verified` state.
- **Modifying the `inspection_reports` schema, the `InspectionReport` contract, or any inspection route** — WP-231's surface is locked. This WP only *reads* the latest report (via the exported `fetchLatestInspectionReport`) and imports its types; it changes no inspection file.
- **Per-finding deduplication across reports** — each `(reportId, findingIndex)` is a distinct handoff; a recurring anomaly across nightly reports yields distinct handoff rows. Cross-report dedup is a future concern, not v1.
- **Pagination / filtering on `GET /api/handoffs/latest`** — v1 returns the latest report's handoffs (≤ 500) + counts in one response; query params are ignored, not rejected.
- **Retention / pruning of historical `finding_handoffs` rows** — v1 keeps every row; a TTL/cap is a future WP if disk-usage trend warrants.
- Refactors, cleanups, or "while I'm here" improvements.

---

## Files Expected to Change

- `data/migrations/020_create_finding_handoffs.sql` — new (table + 2 BTREE indexes)
- `apps/server/src/handoff/handoff.types.ts` — new (`HandoffStatus` union + `HANDOFF_STATUSES` array; `HandoffRecord` / `HandoffTransitionPayload` / `HandoffSyncSummary` / `HandoffLatestEnvelope` interfaces; imports severity/route/finding types from inspection)
- `apps/server/src/handoff/handoff.logic.ts` — new (`deriveHandoffId`, `isAllowedTransition`, `countHandoffsByStatus`, `syncHandoffsFromLatestReport`, `applyHandoffTransition`, `fetchLatestHandoffs`, `mapRowToHandoff`, 2 error classes)
- `apps/server/src/handoff/handoff.logic.test.ts` — new (≥ 10 tests, incl. concurrency-guard + tie-break + field-persistence determinism cases)
- `apps/server/src/handoff/handoff.routes.ts` — new (3 handlers + `registerHandoffRoutes` export)
- `apps/server/src/handoff/handoff.routes.test.ts` — new (≥ 12 tests)
- `apps/server/src/server.mjs` — modified (`loadHandoffSubmitToken()` + `registerHandoffRoutes(...)`)
- `scripts/handoffs-sync.mjs` — new (POST sync; exports `isHandoffSyncEnvComplete`)
- `apps/server/scripts/handoffs-sync.test.ts` — new (≥ 4 cases: env guard, exit-code mapping, response-shape acceptance; placed under `apps/server/scripts/` so the server suite globs it — WP-231 `inspection-submit.test.ts` precedent)
- `package.json` — modified (1 new root script)
- `.github/workflows/inspection-nightly.yml` — modified (1 additive trailing `handoffs:sync` step; existing steps byte-unchanged)
- `render.yaml` — modified (`HANDOFF_SUBMIT_TOKEN` `sync: false`)
- `.env.example` — modified (document the new server var)
- `docs/ai/REFERENCE/api-endpoints.md` — modified (3 new catalog rows per D-11804)
- `docs/ai/DECISIONS.md` — modified (D-23201 + D-23202 + D-23203 reserved → Active at execution close)
- `docs/ai/STATUS.md` — modified (Done entry)
- `docs/ai/work-packets/WORK_INDEX.md` — modified (WP-232 row → Done)
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (EC-264 → Done)

18 files total (8 new + 6 modified source + 4 governance). This exceeds the §5 ~8-file guidance; the bundle is justified for the same reason as WP-209 / WP-231 (its precedents): the migration + types + logic + routes + bootstrap + the sync script + the workflow step + the catalog form a single coherent server+CI surface with no value in partial landing. The dashboard half and the autonomous Builder/Architect execution are already split out (deferred follow-ups).

---

## Locked Type Contracts

These shapes are the byte-identical contract between `scripts/handoffs-sync.mjs`, the route handlers, and the future dashboard consumer. Author them once in `apps/server/src/handoff/handoff.types.ts`; consume verbatim everywhere else. `InspectionSeverity`, `InspectionRoute`, and `InspectionFinding` are **imported** from `apps/server/src/inspection/inspection.types.ts` — never redefined here.

### Lifecycle status (closed union + canonical array)

```ts
type HandoffStatus =
  | 'open'           // materialized from a finding; not yet picked up
  | 'claimed'        // a Builder session has taken ownership
  | 'fix-proposed'   // a fix branch / PR reference was recorded (server stores the ref; it does not create the branch)
  | 'escalated'      // a spec gap was escalated to the Architect (amendmentRequest recorded)
  | 'resolved'       // closed as handled (terminal)
  | 'wont-fix'       // closed as not-a-bug / deferred (terminal)

const HANDOFF_STATUSES: readonly HandoffStatus[] =
  ['open', 'claimed', 'fix-proposed', 'escalated', 'resolved', 'wont-fix'] as const
```

### Locked transition table (server-enforced)

```
open          -> claimed
claimed       -> fix-proposed | escalated | wont-fix
fix-proposed  -> resolved | claimed        // claimed = re-open hook reserved for WP-233 (failed verification)
escalated     -> claimed | resolved | wont-fix
resolved      -> (terminal — no outgoing)
wont-fix      -> (terminal — no outgoing)
```

Any (from, to) pair not in this table is rejected at the route layer with 409. `fix-proposed` requires a non-empty `branchRef`; `escalated` requires a non-empty `amendmentRequest` (both 400 if missing).

### `HandoffRecord` — row + wire shape

```ts
interface HandoffRecord {
  handoffId: string             // `${reportId}#${findingIndex}` (deterministic PRIMARY KEY)
  reportId: string              // the inspection report this finding came from
  sweepRunId: string            // the sweep run the report triaged
  findingIndex: number          // 0-based index into the report's findings[]
  severity: InspectionSeverity  // snapshot of the finding's severity (report stays authoritative for content)
  route: InspectionRoute        // 'Builder' | 'Architect' (the Inspector's attribution)
  anomalyClass: string          // opaque string (no engine union import — D-23103 carry-forward)
  cellId: string | null         // sweep cell id, or null for a run-level finding
  description: string           // snapshot of the finding text (LLM-nondeterministic; never asserted by content)
  status: HandoffStatus         // server-authoritative lifecycle state
  branchRef: string | null      // Builder-recorded fix branch / PR reference; null until 'fix-proposed'
  amendmentRequest: string | null // Architect escalation payload; null until 'escalated'
  createdAt: string             // ISO-8601 (UTC)
  updatedAt: string             // ISO-8601 (UTC)
}
```

### `POST /api/handoffs/sync` — Request + Response

Request body is empty (`{}`); any body is ignored. The endpoint always syncs the **latest** inspection report.

```ts
interface HandoffSyncSummary {
  reportId: string | null   // the synced report, or null when inspection_reports is empty
  findingCount: number      // findings in the latest report (0 when none)
  created: number           // newly inserted 'open' rows this sync
  unchanged: number         // rows that already existed (status preserved) = findingCount - created
}

{ data: HandoffSyncSummary }
```

### `POST /api/handoffs/transition` — Request + Response

```ts
interface HandoffTransitionPayload {
  handoffId: string                  // non-empty, <= 320 chars
  toStatus: HandoffStatus            // must be a HANDOFF_STATUSES member
  branchRef?: string | null          // REQUIRED (non-empty, <= 200 chars) when toStatus === 'fix-proposed'
  amendmentRequest?: string | null   // REQUIRED (non-empty, <= 2000 chars) when toStatus === 'escalated'
}

{ data: { handoff: HandoffRecord } }
```

**Transition Evaluation Order (Locked).** Steps 1–4 are payload validation and MUST complete BEFORE any database read or write — if a 401 / 413 / 400 condition holds, the handler returns it WITHOUT touching the database (validation-before-read). Steps 5–7 are the database interaction:

| # | Step | Outcome |
|---|---|---|
| 1 | `X-Handoff-Token` present, length-equal, then constant-time byte-equal (`validateSharedSecret`) | 401 on failure (no DB) |
| 2 | Body parseable as JSON and `<= 64 KB` | 413 / 400 on failure (no DB) |
| 3 | `handoffId` non-empty string `<= 320` chars; `toStatus` ∈ `HANDOFF_STATUSES` | 400 on failure (no DB) |
| 4 | `toStatus === 'fix-proposed'` ⇒ `branchRef` non-empty `<= 200` chars; `toStatus === 'escalated'` ⇒ `amendmentRequest` non-empty `<= 2000` chars | 400 on failure (no DB) |
| 5 | Load the row by `handoffId` (the `expectedStatus` read) | 404 if absent |
| 6 | `(row.status, toStatus)` ∈ the locked transition table | 409 if off-table (row unchanged) |
| 7 | **Guarded atomic UPDATE** `... WHERE handoff_id = $1 AND status = $expectedStatus RETURNING *` | 200 with the updated row if 1 row affected |

**Concurrency (locked).** Step 7's `AND status = $expectedStatus` predicate is the optimistic-concurrency guard: if a parallel transition advanced the row between step 5 and step 7, the UPDATE affects **0 rows** (no lost update). On 0 rows the handler re-reads the row once: absent ⇒ 404; present with a different status ⇒ 409. Two transitions racing from the same starting state therefore cannot both succeed — exactly one wins, the other gets 409.

### `GET /api/handoffs/latest` — Response Envelope (session-gated)

```ts
interface HandoffLatestEnvelope {
  data: {
    reportId: string | null               // the latest report present in finding_handoffs, or null when empty
    handoffs: readonly HandoffRecord[]     // that report's rows, ordered by (finding_index ASC, handoff_id ASC); always <= 500
    counts: {                              // per-status counts over `handoffs`
      open: number, claimed: number, fixProposed: number,
      escalated: number, resolved: number, wontFix: number
    }
  }
}
```

**"Latest report" resolution (locked, deterministic).** The report is the `report_id` of the row with the greatest `created_at`, **tie-broken by the lexicographically greatest `report_id`** (`ORDER BY created_at DESC, report_id DESC LIMIT 1`) — a deterministic total ordering even under identical timestamps or batch inserts. The handoffs query then selects that report's rows `ORDER BY finding_index ASC, handoff_id ASC` with a query-level `LIMIT 500` (enforced even if the upstream findings cap changes). `counts` is computed over the returned rows and sums to `handoffs.length`.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — the server touches no randomness; the handoff store is deterministic lifecycle state.
- Never throw inside boardgame.io move functions — N/A (no moves touched).
- Never persist `G`, `ctx`, or any runtime game state — N/A (the handoff store records QA findings, not game state).
- `G` must be JSON-serializable — N/A.
- ESM only, Node v22+ — all changes use `import`/`export`, never `require()`; the `.mjs` script uses built-in `fetch` and `node --env-file`, never Linux-only sourcing.
- `node:` prefix on all Node built-in imports (`node:test`, `node:assert`, `node:crypto` is not needed here — the shared-secret check is the existing helper).
- Test files use `.test.ts` — never `.test.mjs`.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.
- Full file contents for every new or modified file — no diffs, no snippets.

**Packet-specific:**
- `POST /api/handoffs/sync` and `POST /api/handoffs/transition` are `guest` per D-9905 with **shared-secret header** auth: `X-Handoff-Token` MUST equal `process.env.HANDOFF_SUBMIT_TOKEN` via the existing `validateSharedSecret(headerValue, envToken)` helper. No route file re-implements the constant-time check or imports `node:crypto` directly (WP-231 / D-23103 centralization). Mismatch → 401 `{ data: [], error: 'unauthorized' }` before any DB I/O.
- `GET /api/handoffs/latest` is `authenticated-session-required` per D-9905 with `SessionValidationErrorCode` collapse to `'unauthorized'` per D-10403 carry-forward.
- **The server is the sole authority for `status`, `createdAt`, and `updatedAt`.** `status` only changes via a transition that the locked table permits; `created_at` / `updated_at` are column DEFAULT `NOW()` / set to `NOW()` on UPDATE — never client-supplied. A client cannot set an arbitrary status; an illegal transition is a 409, not a silent overwrite.
- **Validation-before-read.** All payload validation (auth, body parse/size, shape, conditional-required fields — Evaluation Order steps 1–4) MUST complete before any database read or write. The database MUST NOT be queried when a 401 / 413 / 400 condition holds. (Determinism + cost discipline: a malformed or unauthenticated request never reaches Postgres.)
- **Row-level transition atomicity (no lost updates).** The mutation in `applyHandoffTransition` MUST be a single guarded `UPDATE legendary.finding_handoffs SET ... WHERE handoff_id = $1 AND status = $expectedStatus RETURNING *`, where `$expectedStatus` is the status read in Evaluation Order step 5 and validated legal in step 6. If the UPDATE affects 0 rows, the handler re-reads the row once and maps the result deterministically (absent ⇒ 404; present-with-different-status ⇒ 409). No `SELECT ... FOR UPDATE`, advisory lock, or multi-statement `BEGIN/COMMIT` transaction is used — the `AND status =` predicate is the concurrency control. Two transitions racing from the same starting state therefore cannot both succeed.
- **Field persistence (write-on-enter, never cleared).** The guarded UPDATE writes `branch_ref` ONLY when `toStatus === 'fix-proposed'` and writes `amendment_request` ONLY when `toStatus === 'escalated'`. On every other transition those two columns are left UNCHANGED (preserved) — they are never nulled when transitioning away from their originating state, so the fix-branch reference and the escalation payload remain for auditability across the rest of the lifecycle.
- **Sync is idempotent, non-destructive, and reads via the inspection library only.** `syncHandoffsFromLatestReport` obtains the report through the exported `fetchLatestInspectionReport(database)` — this module issues NO direct SQL against `legendary.inspection_reports` (one source of truth; no duplicate query logic to drift). It inserts via `INSERT ... ON CONFLICT (handoff_id) DO NOTHING` — re-syncing a report that already has rows is a normal no-op that PRESERVES each row's current `status` (a `claimed` row stays `claimed`). This is a deliberate, documented contrast with the inspection POST's no-UPSERT-409 posture: re-sync is an expected nightly operation, not a duplicate-submission error.
- **Single-latest-report sync window (declared).** Sync operates on the single latest inspection report only. If multiple reports are filed between two sync executions, intermediate reports are NOT guaranteed to be materialized — by design (the queue tracks the current report's findings). This is not a bug; a superseded report's findings simply never get handoff rows.
- **Transaction scope.** Each transition is the single guarded `UPDATE` above (no long-running transaction). Sync MAY issue its per-finding inserts as independent statements (or one multi-row `INSERT ... ON CONFLICT DO NOTHING`) but MUST NOT wrap them in a long-running locking transaction.
- **The handoff is a lifecycle record, not a competing source of truth for finding content.** `severity` / `route` / `anomalyClass` / `cellId` / `description` are SNAPSHOTTED from the finding at sync time for cheap addressable reads; the `inspection_reports` row remains authoritative for what the Inspector found. The handoff row is authoritative ONLY for lifecycle `status` + the `branchRef` / `amendmentRequest` references. Document this split in the module header.
- `anomalyClass` is an **opaque string** on the handoff surface — `handoff.types.ts` MUST NOT import `SweepAnomalyClass` from the engine (carry forward D-23103 / D-20703 opacity). The severity/route unions ARE imported from `inspection.types.ts` (one source of truth), but the engine anomaly union is not.
- **`branchRef` and `amendmentRequest` are stored references, never executed actions.** The server records the strings; it does not create a git branch, open a PR, or edit a WP spec. The module header states this plumbing-only posture explicitly (the autonomous Builder/Architect execution is a deferred, separately-gated WP).
- `handoff.logic.ts` `INSERT` / `UPDATE` statements MUST list columns explicitly (no positional inserts), mirroring D-20701's defense against column-order drift. `created_at` is omitted on INSERT (column DEFAULT `NOW()`); `updated_at = NOW()` is set explicitly on every transition UPDATE.
- `isAllowedTransition` MUST be an explicit lookup (`for...of` over the locked transition list, or an object map of `from → readonly to[]`) — no `.reduce()`, no dynamic property access on an untrusted key.
- `Cache-Control: no-store` first-statement lock (D-11504 carry-forward) — every handler body sets the header as its literal first statement.
- `POST` body size cap 64 KB; reject 413. `findings`-derived handoff rows are bounded by the inspection findings cap (500, WP-231) — `GET /api/handoffs/latest` returns `<= 500` rows.
- `GET /api/handoffs/latest` MUST NOT accept or interpret query parameters in v1 — unknown query strings are ignored, not rejected.
- Status-code domains locked: `POST /api/handoffs/sync` `{200, 401, 413, 500}`; `POST /api/handoffs/transition` `{200, 400, 401, 404, 409, 413, 500}`; `GET /api/handoffs/latest` `{200, 401, 500}`.
- **No new npm dependency** in any `package.json`. The sync script uses Node built-ins (`fetch`, `parseArgs` not required) only; no agent runs in this WP.
- `scripts/handoffs-sync.mjs` MUST exit non-zero on any failure with a full-sentence stderr message.
- API catalog update obligation (D-11804) — 3 new rows under `## Wired → Server-Registered Routes`, replace-whole-row semantics; each row cites the authorizing decisions.

**Session protocol:**
- If `apps/server/src/inspection/` has been refactored since this WP was drafted (the `fetchLatestInspectionReport` signature, the `InspectionFinding` shape, or the exported severity/route unions changed): read the new shape and mirror it; do not duplicate a stale pattern.
- If `apps/server/src/analytics/` no longer exhibits the `Cache-Control` no-store / session-collapse pattern this WP carries forward: STOP and report (the carry-forward decisions may have shifted).
- If `apps/server/src/auth/validateSharedSecret.ts` no longer exports `validateSharedSecret(headerValue, envToken)`: STOP and reconcile (the centralization decision D-23103 may have changed).
- If `render.yaml` no longer carries `INSPECTION_SUBMIT_TOKEN` as the `sync: false` precedent: STOP and ask.
- Never invent endpoint shapes, field names, lifecycle states, or token names not locked here. Adding a `HandoffStatus` member requires updating BOTH the union and `HANDOFF_STATUSES` (drift gate).

**Locked contract values:**
- Schema columns (exact order in CREATE TABLE) — 14 columns, no more: `handoff_id`, `report_id`, `sweep_run_id`, `finding_index`, `severity`, `route`, `anomaly_class`, `cell_id`, `description`, `status`, `branch_ref`, `amendment_request`, `created_at`, `updated_at`.
- Schema types: `handoff_id TEXT PRIMARY KEY`, `report_id TEXT NOT NULL`, `sweep_run_id TEXT NOT NULL`, `finding_index INT NOT NULL CHECK (finding_index >= 0)`, `severity TEXT NOT NULL CHECK (severity IN ('P0','P1','P2'))`, `route TEXT NOT NULL CHECK (route IN ('Builder','Architect'))`, `anomaly_class TEXT NOT NULL`, `cell_id TEXT`, `description TEXT NOT NULL`, `status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','claimed','fix-proposed','escalated','resolved','wont-fix'))`, `branch_ref TEXT`, `amendment_request TEXT`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- BTREE indexes: `finding_handoffs_created_at_desc_idx ON legendary.finding_handoffs (created_at DESC)` and `finding_handoffs_report_id_idx ON legendary.finding_handoffs (report_id)`.
- `handoffId` form: `<reportId>#<findingIndex>` (the `#` separator never appears in a `reportId`, which is `<sweepRunId>-<generatedAtIsoCompact>`).
- POST sync URL: `/api/handoffs/sync` (literal). POST transition URL: `/api/handoffs/transition` (literal — `handoffId` travels in the body, not the path). GET URL: `/api/handoffs/latest` (literal).
- Handoff shared-secret header: `X-Handoff-Token` (literal; no `Bearer` / `Authorization` reuse).
- Render env var: `HANDOFF_SUBMIT_TOKEN` `sync: false`.
- "Latest report" dimension (deterministic total order): the `report_id` resolved by `ORDER BY created_at DESC, report_id DESC LIMIT 1` — greatest `created_at`, tie-broken by lexicographically greatest `report_id` (no nondeterminism under identical timestamps / batch inserts). `GET /api/handoffs/latest` returns that report's rows `ORDER BY finding_index ASC, handoff_id ASC` with a query-level `LIMIT 500` (enforced even if the upstream findings cap changes).
- Transition mutation (locked): a single guarded `UPDATE ... WHERE handoff_id = $1 AND status = $expectedStatus RETURNING *`; 0 rows affected ⇒ re-read once ⇒ absent = 404, different-status = 409. Validation (auth/parse/shape/conditional-required) precedes any DB access.
- Field persistence (locked): `branch_ref` is written only on the `→ fix-proposed` transition; `amendment_request` only on the `→ escalated` transition; both are PRESERVED (never cleared) on all other transitions.
- Body caps: POST transition 64 KB; `branchRef` <= 200 chars; `amendmentRequest` <= 2000 chars; `handoffId` <= 320 chars.
- Workflow step: an additive trailing step in `inspection-nightly.yml` running `pnpm handoffs:sync`, `if: success()`, reading `HANDOFF_SUBMIT_TOKEN` + `API_BASE_URL`.
- D-23201: finding_handoffs storage shape + handoff contract lock + denormalization-snapshot posture.
- D-23202: handoff lifecycle state machine (closed `HANDOFF_STATUSES` + locked transition table, server-enforced) + plumbing-only scope lock (no autonomous code/spec writer).
- D-23203: idempotent sync materialization (`ON CONFLICT DO NOTHING`, status-preserving) + handoff auth posture (`X-Handoff-Token` via `validateSharedSecret`; session-gated GET).

---

## Script Exit Codes

`scripts/handoffs-sync.mjs` is a deterministic interface; the workflow keys success/failure on its exit code.

| Code | Meaning |
|---|---|
| 0 | Success — `POST /api/handoffs/sync` returned 200 |
| 1 | Missing/empty env vars (`HANDOFF_SUBMIT_TOKEN`, `API_BASE_URL`) — no request made |
| 2 | Request failure — network error OR non-2xx from `POST /api/handoffs/sync` |

---

## Acceptance Criteria

1. Migration `020_create_finding_handoffs.sql` applies cleanly against a fresh schema and creates exactly 1 table + 2 indexes in `legendary`; every `CREATE` uses `IF NOT EXISTS` (re-running succeeds).
2. `handoff.types.ts` defines `HandoffStatus` with the matching `HANDOFF_STATUSES` canonical array; a drift test asserts the array deep-equals the union members (forward + backward).
3. `handoff.types.ts` imports `InspectionSeverity`, `InspectionRoute`, and `InspectionFinding` from `../inspection/inspection.types.js` and does NOT redefine them, and does NOT import `SweepAnomalyClass` from the engine (`anomalyClass` is plain `string`) — verified by grep (0 `SweepAnomalyClass` matches; ≥ 1 import from `inspection.types`).
4. `registerHandoffRoutes(router, pool, { requireAuthenticatedSession, verifier, accountResolver, handoffSubmitToken })` is exported and invoked from `apps/server/src/server.mjs` exactly once.
5. `POST /api/handoffs/sync` rejects a missing/short `X-Handoff-Token` with 401 before any DB I/O via the shared `validateSharedSecret` helper — verified: a token strictly shorter than the env token returns 401, no `RangeError`, no DB call.
6. `POST /api/handoffs/sync` inserts one `open` handoff per finding of the latest inspection report — obtained via `fetchLatestInspectionReport(database)` (no direct `inspection_reports` SQL in this module) — and returns `{ data: { reportId, findingCount, created, unchanged } }` with `created + unchanged === findingCount`.
7. `POST /api/handoffs/sync` is idempotent: a second sync of the same report inserts 0 rows, preserves a row already advanced to `claimed`, and reports it under `unchanged` (verified by INSERT ... ON CONFLICT (handoff_id) DO NOTHING — no UPSERT, no 409, no status clobber).
8. `POST /api/handoffs/sync` over an empty `inspection_reports` returns `{ data: { reportId: null, findingCount: 0, created: 0, unchanged: 0 } }` (no rows written).
9. `POST /api/handoffs/transition` rejects an out-of-set `toStatus`, a `fix-proposed` with no `branchRef`, and an `escalated` with no `amendmentRequest`, each with 400, before any DB write.
10. `POST /api/handoffs/transition` returns 404 for an unknown `handoffId` and 409 for a transition not in the locked table (e.g. `open → resolved`), leaving the row's `status` unchanged on the 409.
11. `POST /api/handoffs/transition` happy path (`open → claimed`, then `claimed → fix-proposed` with a `branchRef`) updates `status`, sets `branch_ref`, advances `updated_at`, and returns the updated `HandoffRecord`; `updatedAt > createdAt` after the second transition. A subsequent `fix-proposed → claimed` transition PRESERVES the stored `branch_ref` (write-on-enter, never cleared).
11a. `applyHandoffTransition` is concurrency-safe: the mutation is a single guarded `UPDATE ... WHERE handoff_id = $1 AND status = $expectedStatus`; when the row's status changed between the load and the write the UPDATE affects 0 rows and the re-read maps to 409 (status changed) / 404 (row gone) — never a lost update. Verified by a logic test that simulates the 0-rows path.
12. All `INSERT` / `UPDATE` statements in `handoff.logic.ts` list columns explicitly — verified by grep (explicit column list present; positional `INSERT INTO legendary.finding_handoffs VALUES` absent).
13. `isAllowedTransition` is implemented without `.reduce()` and without dynamic property access on an untrusted key — verified by grep (0 `.reduce(` in `handoff.logic.ts`) and by the truth-table test.
14. `GET /api/handoffs/latest` returns 401 for unauthenticated requests via `SessionValidationErrorCode` collapse to `'unauthorized'`, and returns `{ data: { reportId, handoffs, counts } }` with `handoffs` ordered by `(finding_index ASC, handoff_id ASC)`, a query-level `LIMIT 500`, and `counts` summing to `handoffs.length` when authenticated.
14a. "Latest report" resolution is deterministic: with two reports sharing an identical `created_at`, `fetchLatestHandoffs` returns the rows of the lexicographically greatest `report_id` (`ORDER BY created_at DESC, report_id DESC LIMIT 1`) — verified by a logic test seeding the tie.
14b. Transition validation precedes any DB access: a 401 (bad token), a 413 (oversize body), and a 400 (out-of-set `toStatus`) each return WITHOUT issuing any query — verified by asserting the recording fake's `query()` was never called on those paths.
15. Every handoff handler body sets `Cache-Control: no-store` as its literal first statement (grep gate ≥ 3 matches across `handoff.routes.ts` for the three handlers).
16. The shared-secret check is NOT re-implemented in `handoff.routes.ts`: grep for the constant-time-compare symbol in `handoff.routes.ts` returns 0; the file imports and calls `validateSharedSecret`.
17. `docs/ai/REFERENCE/api-endpoints.md` carries 3 new rows with `Status` ∈ the closed set and `Auth` ∈ `{guest, authenticated-session-required}`, each citing its authorizing decisions, per D-11804 replace-whole-row semantics.
18. `scripts/handoffs-sync.mjs` POSTs to `${API_BASE_URL}/api/handoffs/sync` with `X-Handoff-Token`, exits 0 on 200, 1 on missing env vars (no request), and 2 on non-2xx — verified by `apps/server/scripts/handoffs-sync.test.ts` (≥ 4 cases against the exported helpers; located so the server suite globs it).
19. `.github/workflows/inspection-nightly.yml` gains exactly one additive trailing step running `pnpm handoffs:sync` (`if: success()`, reading `HANDOFF_SUBMIT_TOKEN` + `API_BASE_URL`); the pre-existing fetch / triage / submit steps are byte-unchanged.
20. `package.json` root scripts contain `"handoffs:sync"`; `render.yaml` declares `HANDOFF_SUBMIT_TOKEN` `sync: false`; `apps/server/src/server.mjs` loud-fails in production if it is unset; `.env.example` documents it.
21. No new npm dependency appears in any `package.json` diff; no `apps/dashboard/**` file is modified; no `apps/server/src/inspection/**` file is modified (verified by `git diff --name-only`).
22. `handoff.logic.ts` issues no direct SQL against `legendary.inspection_reports` (the report is read only via `fetchLatestInspectionReport`) — verified by grep (`FROM legendary.inspection_reports` returns 0 in `handoff.logic.ts`).
23. `pnpm --filter @legendary-arena/server test` exits 0 with ≥ 26 net-new handoff + sync-script cases (≥ 10 logic + ≥ 12 routes + ≥ 4 sync-script); `pnpm -r build` exits 0.

---

## Verification Steps

```pwsh
# 1. Migration applies
pnpm --filter @legendary-arena/server migrate
# Expected: exit 0; "Applied: 020_create_finding_handoffs.sql"

# 2. Server tests pass (>= 26 net-new)
pnpm --filter @legendary-arena/server test 2>&1 | Select-Object -Last 3
# Expected: all green; handoff.logic + handoff.routes + handoffs-sync cases present

# 3. Build passes
pnpm -r build
# Expected: exit 0

# 4. anomalyClass opacity (no engine union import on the handoff surface)
Select-String -Path "apps\server\src\handoff\handoff.types.ts" -Pattern "SweepAnomalyClass"
# Expected: no output

# 5. Severity/route imported from inspection (one source of truth)
Select-String -Path "apps\server\src\handoff\handoff.types.ts" -Pattern "from '\.\./inspection/inspection.types"
# Expected: >= 1 match

# 6. Shared-secret check is NOT re-implemented in the route file
(Select-String -Path "apps\server\src\handoff\handoff.routes.ts" -Pattern "timingSafeEqual").Count
# Expected: 0 (route calls validateSharedSecret)
Select-String -Path "apps\server\src\handoff\handoff.routes.ts" -Pattern "validateSharedSecret"
# Expected: >= 1 match

# 7. Explicit INSERT column list (no positional inserts) + idempotent sync
Select-String -Path "apps\server\src\handoff\handoff.logic.ts" -Pattern "INSERT INTO legendary.finding_handoffs \(handoff_id"
# Expected: >= 1 match
Select-String -Path "apps\server\src\handoff\handoff.logic.ts" -Pattern "INSERT INTO legendary.finding_handoffs VALUES"
# Expected: no output
Select-String -Path "apps\server\src\handoff\handoff.logic.ts" -Pattern "ON CONFLICT \(handoff_id\) DO NOTHING"
# Expected: >= 1 match

# 8. No .reduce() in the logic module
(Select-String -Path "apps\server\src\handoff\handoff.logic.ts" -Pattern "\.reduce\(").Count
# Expected: 0

# 9. Cache-Control first-statement gate across the three handlers
(Select-String -Path "apps\server\src\handoff\handoff.routes.ts" -Pattern "Cache-Control.*no-store").Count
# Expected: >= 3

# 10. Catalog rows present
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "/api/handoffs/sync|/api/handoffs/transition|/api/handoffs/latest"
# Expected: 3 lines

# 11. Nightly workflow gains the sync step, fetch/triage/submit unchanged
Select-String -Path ".github\workflows\inspection-nightly.yml" -Pattern "handoffs:sync"
# Expected: 1 line

# 12. No dashboard or inspection files touched
git diff --name-only apps/dashboard/ apps/server/src/inspection/
# Expected: no output

# 13. No new npm deps
git diff package.json apps/server/package.json
# Expected: only the 1 new root script; no dependencies/devDependencies additions

# 14. Sync reads via the inspection library only (no direct inspection_reports SQL)
(Select-String -Path "apps\server\src\handoff\handoff.logic.ts" -Pattern "FROM legendary.inspection_reports").Count
# Expected: 0
Select-String -Path "apps\server\src\handoff\handoff.logic.ts" -Pattern "fetchLatestInspectionReport"
# Expected: >= 1 match

# 15. Guarded atomic transition + deterministic latest-report tie-break
Select-String -Path "apps\server\src\handoff\handoff.logic.ts" -Pattern "AND status = "
# Expected: >= 1 match (the optimistic-concurrency guard in the UPDATE)
Select-String -Path "apps\server\src\handoff\handoff.logic.ts" -Pattern "created_at DESC, report_id DESC"
# Expected: >= 1 match (deterministic latest-report total order)
```

---

## Definition of Done

- [ ] All 26 Acceptance Criteria pass (1–23 + 11a / 14a / 14b)
- [ ] All 15 Verification Steps produce the expected output
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0
- [ ] No files outside `## Files Expected to Change` were modified (`git diff --name-only`)
- [ ] No `apps/dashboard/**` file modified (deferred to the paired follow-up WP)
- [ ] No `apps/server/src/inspection/**` file modified (WP-231 surface is locked; this WP only imports from it)
- [ ] `docs/ai/REFERENCE/api-endpoints.md` carries the 3 new rows per D-11804
- [ ] `docs/ai/STATUS.md` updated — the Inspector's findings are now addressable, claimable work-items with a server-enforced lifecycle; the queue auto-refreshes after each nightly triage
- [ ] `docs/ai/DECISIONS.md` updated — D-23201 (storage + contract + snapshot posture), D-23202 (lifecycle state machine + plumbing-only lock), D-23203 (idempotent sync + auth) flipped Reserved → Active
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-232 checked off with today's date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-264 flipped Draft → Done

---

## Vision Alignment

**Vision clauses touched:** §20-26 (scoring/PAR/simulation — the sweep is QA simulation, the Inspector triages it, and this WP tracks the handoff of those triage findings), §22 (determinism/replay).

**Conflict assertion:** `No conflict: this WP preserves all touched clauses.` The handoff store is an internal operator/CI-only QA *meta* surface that records the lifecycle of Inspector findings. It changes no game logic, no RNG sourcing, no scoring math, no replay storage or verification. The sweep simulation and the engine's determinism guarantees are untouched.

**Non-Goal proximity check:** none of NG-1..7 are crossed — no user-facing surface, no paid/persuasive/competitive surface, no monetization. The endpoints are operator/CI-only (shared-secret + authenticated-session).

**Determinism preservation:** the engine + sweep determinism is unchanged and replay-faithful (Vision §22). The handoff lifecycle is server-side workflow state over already-filed findings; the finding TEXT it snapshots is LLM-nondeterministic (D-23102, inherited — never asserted by content), but the determinism-bearing dimension here, the `status` transitions, is a server-enforced deterministic state machine. This surface is meta-workflow, not gameplay/scoring/replay, so §22's determinism covenant is not engaged.

---

## Funding Surface Gate

**N/A — docs/server/CI infrastructure only; no global navigation, Registry Viewer, profile/account, or tournament funding affordances; no user-visible copy referencing donations or support; the endpoints are operator/CI-only.** None of the §20.1 trigger surfaces (WP-097 §A/§B/§C, tournament funding channels, user-visible funding copy) are present.

---

## API Catalog Update

**APPLIES.** §21.1 triggered: three new HTTP endpoints on `apps/server`. Per D-11804 replace-whole-row semantics, the catalog update lands in the same commit as the route code. Rows:

- `POST /api/handoffs/sync` — Auth: `guest` (shared-secret `X-Handoff-Token`); Status closed-set `{200, 401, 413, 500}`; Authorizing WP: `WP-232`; Cites: D-23203, D-23201, D-9905, D-11504, D-11804
- `POST /api/handoffs/transition` — Auth: `guest` (shared-secret `X-Handoff-Token`); Status closed-set `{200, 400, 401, 404, 409, 413, 500}`; Authorizing WP: `WP-232`; Cites: D-23202, D-23201, D-9905, D-11504, D-11804
- `GET /api/handoffs/latest` — Auth: `authenticated-session-required` (D-9905 + D-10403 collapse); Status closed-set `{200, 401, 500}`; Authorizing WP: `WP-232`; Cites: D-23201, D-9905, D-10403, D-11504, D-11804

---

## Lint Gate Self-Review

Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`, all 21 sections reviewed 2026-06-10:

| § | Verdict | Note |
|---|---|---|
| 1 | PASS | All required sections present; Out of Scope lists ≥ 2 explicit exclusions (autonomous Builder, Architect auto-amend, dashboard, WP-233, inspection-schema) |
| 2 | PASS | Engine-wide + packet-specific + session protocol + locked values; full-file output required; 00.6 referenced |
| 3 | PASS | WP-209/210/230/231/115/205/118 deps listed with required exports/shapes (`fetchLatestInspectionReport`, `validateSharedSecret`, inspection types, server token+register pattern) |
| 4 | PASS | ARCHITECTURE §Layer Boundary, inspection/sweep/analytics modules, validateSharedSecret, migration 019, code-checks-and-balances §5/§6/§8, 02-CODE-CATEGORIES §server, D-entries, 00.6, api-endpoints all cited specifically |
| 5 | PASS | 18 files listed with new/modified disposition + one-line descriptions; bundle justification given (WP-209/WP-231 precedent) |
| 6 | PASS | New field names are internally consistent camelCase; severity/route/finding names imported from inspection (no rename); no 00.2 §8.1 setup-payload fields touched |
| 7 | PASS | No new npm deps; no agent in this WP; `pg` / `node:test` / built-in `fetch` only; forbidden packages not used |
| 8 | PASS | Server-layer only; no engine/registry/preplan import; PostgreSQL for QA-workflow data not live game state; no `G`/`ctx`; no boardgame.io move/phase logic |
| 9 | PASS | PowerShell verification commands; the `.mjs` script uses `node --env-file`/built-in fetch; CI YAML runs on ubuntu (documented), not operator scripts |
| 10 | PASS | `HANDOFF_SUBMIT_TOKEN` (server/Render + Actions), `API_BASE_URL` documented with where-set; `.env.example` updated; no real secrets in the WP |
| 11 | PASS | No new player identity model; endpoint auth commits to the established closed set (D-9905): shared-secret for the CI POSTs, authenticated-session for the operator GET (D-10403 collapse). `## Out of Scope` + the plumbing-only posture serve as the limitations note |
| 12 | PASS | Tests use `node:test`/`node:assert`, no boardgame.io, no live network/DB (recording fake `pool` like the inspection logic test); the snapshotted LLM finding text is never asserted by content — only shape + lifecycle |
| 13 | PASS | 15 exact `pnpm`/`git`/PowerShell verification commands with expected output |
| 14 | PASS | 26 binary, observable, specific acceptance criteria aligned to deliverables (incl. concurrency / tie-break / validation-before-read / source-of-truth determinism checks) |
| 15 | PASS | DoD includes STATUS / DECISIONS / WORK_INDEX / EC_INDEX + scope-boundary check + dashboard-untouched + inspection-untouched checks |
| 16 | PASS | No premature abstraction — `validateSharedSecret` reused (not re-created); `isAllowedTransition` / `countHandoffsByStatus` are this module's own single-purpose helpers; explicit control flow (no reduce, no dynamic key access); full-word names; small functions; `// why:` on the snapshot-vs-authority split, the idempotent-sync contrast, and the no-store header; named imports |
| 17 | PASS | `## Vision Alignment` present with clause numbers + no-conflict + determinism-preservation line (lifecycle is a server-enforced deterministic state machine; LLM finding text is inherited-nondeterministic, never asserted) |
| 18 | PASS | Verification greps target literal tokens (`ON CONFLICT (handoff_id) DO NOTHING`, `INSERT INTO ...`, `Cache-Control`, `validateSharedSecret`); WP prose cites D-entries rather than enumerating forbidden-token lists under a grep path |
| 19 | N/A | No repo-state-summarizing artifact (bridge/STATUS-snapshot) authored in this WP draft |
| 20 | N/A | Server/CI infrastructure only; no funding surfaces or user-visible funding copy (justified above) |
| 21 | PASS | `## API Catalog Update` present; 3 new rows with closed-set Status/Auth, canonical field names, authorizing-WP + D-citations, replace-whole-row semantics |

---

## Future Work Packets (Scoped From This Foundation)

- **Dashboard handoff-chain surface** (paired follow-up, mirrors WP-210 / the WP-231 dashboard follow-up): the Pipeline page consumes `GET /api/handoffs/latest` and renders each finding's lifecycle status (open → claimed → fix-proposed/escalated → resolved) across the Builder / Architect lanes.
- **Autonomous Builder execution** (the gated escalation deferred from this WP): a Builder CI workflow that claims `open` Builder-routed handoffs, attempts engine fixes on a branch, records the branch via `POST /api/handoffs/transition` (`→ fix-proposed`), and opens a **draft PR** (never auto-merges; existing CI gates + a fresh-eyes Inspector pass are the merge gate, per code-checks-and-balances §8).
- **Autonomous Architect execution** (further gated): an Architect session that consumes `escalated` handoffs' `amendmentRequest` payloads and amends the relevant WP spec, then transitions the handoff back to `claimed` for the Builder.
- **WP-233 — Closed-loop sweep verification:** a targeted re-sweep of the previously-failing cells; the Inspector verifies resolution; the `fix-proposed → claimed` re-open edge (reserved here) cycles a failed verification back to the Builder; the lifecycle gains a `verified` terminal state.
