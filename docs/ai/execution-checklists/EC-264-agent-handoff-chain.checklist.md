# EC-264 — Agent Handoff Chain (Execution Checklist)

**Source:** docs/ai/work-packets/WP-232-agent-handoff-chain.md
**Layer:** Server (`apps/server/src/handoff/` new) + Migration (`data/migrations/020_*`) + CI tooling (`scripts/handoffs-sync.mjs`, additive step in `.github/workflows/inspection-nightly.yml`)

> Use locked values from WP-232 verbatim. EC-264 is the operational order +
> gates + failure smells; if EC-264 and WP-232 conflict, WP-232 wins.

---

## Before Starting
- [ ] **WP-231 landed.** Inspection module exists:
  `grep -n "fetchLatestInspectionReport" apps/server/src/inspection/inspection.logic.ts` returns ≥ 1.
- [ ] **Inspection types exported:** `inspection.types.ts` exports `InspectionSeverity`,
  `InspectionRoute`, `InspectionFinding` (the handoff module imports these — one source of truth).
- [ ] **Shared-secret helper present:** `apps/server/src/auth/validateSharedSecret.ts` exports
  `validateSharedSecret(headerValue, envToken)`.
- [ ] **Auth/no-store carry-forward present:** `analytics.routes.ts` shows the `Cache-Control`
  no-store first-statement + `SessionValidationErrorCode` collapse.
- [ ] **Next migration is 020:** `data/migrations/019_create_inspection_reports.sql` exists.
- [ ] Read WP-232 §Goal, §Locked Type Contracts, §Non-Negotiable Constraints, §Acceptance Criteria, §Scope (In/Out).
- [ ] `pnpm --filter @legendary-arena/server test` + `pnpm -r build` exit 0 (anchor baseline).

## Locked Values (verbatim from WP-232 — do not re-derive)
- **finding_handoffs columns (14, exact order):** `handoff_id` (PK text), `report_id`, `sweep_run_id`,
  `finding_index` (CHECK ≥ 0), `severity` (CHECK P0|P1|P2), `route` (CHECK Builder|Architect),
  `anomaly_class`, `cell_id` (nullable), `description`, `status` (DEFAULT 'open', CHECK in the 6-status set),
  `branch_ref` (nullable), `amendment_request` (nullable), `created_at` (DEFAULT NOW()), `updated_at` (DEFAULT NOW()).
  Indexes: `finding_handoffs_created_at_desc_idx (created_at DESC)` + `finding_handoffs_report_id_idx (report_id)`.
- **`HandoffStatus` (closed, 6):** `'open' | 'claimed' | 'fix-proposed' | 'escalated' | 'resolved' | 'wont-fix'`;
  canonical array `HANDOFF_STATUSES` in that order + bidirectional drift test.
- **Locked transition table (server-enforced):** `open→claimed`; `claimed→fix-proposed|escalated|wont-fix`;
  `fix-proposed→resolved|claimed`; `escalated→claimed|resolved|wont-fix`; `resolved`/`wont-fix` terminal.
  Any pair off-table → 409. `fix-proposed` requires non-empty `branchRef`; `escalated` requires non-empty
  `amendmentRequest` (both 400 if missing).
- **Transition Evaluation Order (locked, full table in WP §Locked Type Contracts):** auth 401 → body parse/size 413/400
  → shape 400 → conditional-required 400 → load row (404) → legality vs table (409) → guarded atomic UPDATE (200).
  Steps 1–4 (validation) MUST complete before any DB read/write.
- **Atomic transition (locked):** mutation is a single guarded
  `UPDATE legendary.finding_handoffs SET ... WHERE handoff_id = $1 AND status = $expectedStatus RETURNING *`.
  0 rows ⇒ re-read once ⇒ absent = 404, different-status = 409 (no lost update; two transitions from the same
  start cannot both succeed). NO `FOR UPDATE` / advisory lock / `BEGIN..COMMIT`.
- **Field persistence (locked):** `branch_ref` written ONLY on `→ fix-proposed`; `amendment_request` ONLY on
  `→ escalated`; both PRESERVED (never nulled) on all other transitions (auditability).
- **URLs:** `POST /api/handoffs/sync`, `POST /api/handoffs/transition` (`handoffId` in BODY, not path),
  `GET /api/handoffs/latest` (all literal). **Token:** `X-Handoff-Token` ↔ `HANDOFF_SUBMIT_TOKEN`.
- **`handoffId` form:** `<reportId>#<findingIndex>` (`#` never appears in a reportId).
- **Contracts:** `HandoffRecord` (13 fields); `HandoffTransitionPayload = { handoffId, toStatus, branchRef?, amendmentRequest? }`;
  `HandoffSyncSummary = { reportId, findingCount, created, unchanged }`; `HandoffLatestEnvelope` =
  `{ data: { reportId, handoffs[], counts{open,claimed,fixProposed,escalated,resolved,wontFix} } }`.
- **Status domains:** POST sync `{200,401,413,500}`; POST transition `{200,400,401,404,409,413,500}`; GET latest `{200,401,500}`.
- **Caps:** POST body 64 KB; `branchRef` ≤ 200; `amendmentRequest` ≤ 2000; `handoffId` ≤ 320. GET returns ≤ 500 rows.
- **"Latest report" (deterministic total order):** `ORDER BY created_at DESC, report_id DESC LIMIT 1` — greatest
  `created_at`, tie-broken by lexicographically greatest `report_id`. GET returns that report's rows
  `ORDER BY finding_index ASC, handoff_id ASC` with a query-level `LIMIT 500` (enforced even if the upstream cap changes).
- **Sync model:** reads the report via `fetchLatestInspectionReport(database)` ONLY — NO direct SQL against
  `legendary.inspection_reports` from this module (one source of truth). Inserts via
  `INSERT ... ON CONFLICT (handoff_id) DO NOTHING` — idempotent, status-preserving, NO 409 (deliberate contrast with the
  inspection POST). `created + unchanged === findingCount`; empty report → all-zero summary, `reportId: null`.
  **Single-latest-report window (declared):** only the latest report is synced; intermediate reports between two syncs
  are NOT guaranteed to be materialized — by design.
- **Transaction scope:** each transition is the single guarded UPDATE (no long-running txn); sync may batch inserts but MUST NOT wrap them in a long-running locking transaction.
- **Script exit codes —** `handoffs-sync.mjs`: 0 ok (200) / 1 missing env / 2 request-fail (non-2xx). Full-sentence stderr on non-zero.
- **Workflow:** ONE additive trailing step in `inspection-nightly.yml` running `pnpm handoffs:sync`, `if: success()`,
  reading `HANDOFF_SUBMIT_TOKEN` + `API_BASE_URL`. Fetch/triage/submit steps byte-unchanged.

## Guardrails
- **Plumbing only — the server STORES references, never ACTS.** `branchRef` / `amendmentRequest` are stored strings;
  no git branch is created, no PR opened, no WP spec edited. The autonomous Builder/Architect execution is a deferred,
  separately-gated WP (D-23202 scope lock).
- **anomalyClass is opaque (no engine union).** `handoff.types.ts` MUST NOT import `SweepAnomalyClass`.
  Severity/route/finding types ARE imported from `../inspection/inspection.types.js` (no redefinition).
- **Server is sole authority for `status` + `updated_at`.** Status changes only via a transition the locked table permits;
  illegal transition → 409 (status unchanged), unknown handoffId → 404. `created_at`/`updated_at` are DB-set, never client-supplied.
- **Validation-before-read + atomic transition + field persistence** — see Locked Values; the load-bearing one: the guarded `UPDATE ... AND status = $expected` (0 rows → re-read → 404/409) is what prevents lost updates under concurrent transitions.
- **Sync reads via `fetchLatestInspectionReport` ONLY** — no direct `inspection_reports` query in `handoff.logic.ts` (one source of truth) — and is idempotent + non-destructive (`ON CONFLICT (handoff_id) DO NOTHING`; re-sync preserves a `claimed` row).
- **Snapshot vs authority split:** the handoff snapshots finding content for addressable reads; the `inspection_reports`
  row stays authoritative for finding content; the handoff is authoritative only for lifecycle status + the two references.
- **Shared-secret via the single `validateSharedSecret` helper** — no inline constant-time compare / `node:crypto` import in a route file.
- **Explicit INSERT/UPDATE column lists** (no positional). `created_at` omitted on INSERT (DEFAULT NOW()); `updated_at = NOW()` on UPDATE.
- **No `.reduce()` in `handoff.logic.ts`;** `isAllowedTransition` is an explicit lookup, no dynamic key access on an untrusted key.
- **`Cache-Control: no-store` first statement** in every handler body (D-11504).
- **GET ignores query params** (no reject) in v1.
- **Optional-field discipline (`exactOptionalPropertyTypes`).** `HandoffTransitionPayload.branchRef?` / `.amendmentRequest?` are wire-optional: validate by reading them defensively (presence + non-empty), and in tests OMIT the key for the "absent" case rather than setting it to `undefined`. The stored `HandoffRecord` uses `string | null` (not optional) — `mapRowToHandoff` returns `null`, never `undefined`. No `any` on exported functions/types.
- **No new npm deps; no `apps/dashboard/**` edits; no `apps/server/src/inspection/**` edits** (only imports from it).
- **Full file contents** for every modified file — diffs/snippets forbidden.

## Required `// why:` Comments
- `handoff.logic.ts` (sync) — paraphrase: the idempotent conflict-skip insert preserves each row's lifecycle status so a
  nightly re-sync of the same report is a normal no-op, the deliberate opposite of the inspection POST's duplicate-is-an-error posture (D-23203).
- `handoff.logic.ts` (snapshot) — the severity/route/description columns are a point-in-time snapshot for addressable reads;
  the inspection report remains authoritative for finding content; the handoff is authoritative only for lifecycle status (D-23201).
- `handoff.types.ts` — `anomalyClass` is a plain string (not the engine union) to keep the handoff surface free of an engine import
  (D-23103 opacity carry-forward); severity/route are imported from inspection so there is one source of truth.
- `handoff.routes.ts` (transition) — `branchRef`/`amendmentRequest` are stored references the server records, never actions it
  performs; the autonomous code/spec writer is a deferred separately-gated surface (D-23202 plumbing-only lock).
- `handoff.logic.ts` (transition UPDATE) — the status-equality predicate on the UPDATE is the optimistic-concurrency guard:
  it makes a parallel transition's write a 0-row no-op (then a re-read disambiguates 404 vs 409) instead of a lost update (D-23202).
- `handoff.logic.ts` (sync) — paraphrase, do NOT echo the policed `FROM legendary.inspection_reports` literal: explain that the
  report is obtained through the inspection library accessor (the exported `fetchLatestInspectionReport`), never a direct query
  against that table, so there is one source of truth (D-23203). (Verification step 14 counts that literal at 0 in this file.)
- `server.mjs` — the handoff submit token is loaded once at startup (production loud-fail when unset; test fallback + one-shot warn),
  mirroring the inspection token posture; per-request `process.env` reads are forbidden.

## Files to Produce
- `data/migrations/020_create_finding_handoffs.sql` — new (table + 2 indexes; forward-only; `IF NOT EXISTS`).
- `apps/server/src/handoff/handoff.types.ts` — new (`HandoffStatus` + `HANDOFF_STATUSES`; 4 interfaces; inspection-type imports).
- `apps/server/src/handoff/handoff.logic.ts` — new (`deriveHandoffId`, `isAllowedTransition`, `countHandoffsByStatus`,
  `syncHandoffsFromLatestReport`, `applyHandoffTransition`, `fetchLatestHandoffs`, `mapRowToHandoff`, 2 error classes).
- `apps/server/src/handoff/handoff.logic.test.ts` — new (≥ 10, incl. concurrency-guard 0-rows path, tie-break latest-report, field-persistence-on-transition-away).
- `apps/server/src/handoff/handoff.routes.ts` — new (3 handlers + `registerHandoffRoutes`).
- `apps/server/src/handoff/handoff.routes.test.ts` — new (≥ 12).
- `apps/server/src/server.mjs` — modified (`loadHandoffSubmitToken()` + `registerHandoffRoutes(...)`).
- `scripts/handoffs-sync.mjs` — new (POST sync; exports `isHandoffSyncEnvComplete`).
- `apps/server/scripts/handoffs-sync.test.ts` — new (≥ 4; env guard, exit-code mapping, response-shape). Under `apps/server/scripts/` so the server suite globs it (WP-231 `inspection-submit.test.ts` precedent); imports `../../../scripts/handoffs-sync.mjs`.
- `package.json` — modified (1 root script `handoffs:sync`).
- `.github/workflows/inspection-nightly.yml` — modified (1 additive trailing `handoffs:sync` step).
- `render.yaml` — modified (`HANDOFF_SUBMIT_TOKEN` `sync: false`).
- `.env.example` — modified.
- `docs/ai/REFERENCE/api-endpoints.md` — modified (3 rows, D-11804).
- `docs/ai/DECISIONS.md` — modified (D-23201..D-23203 Active).
- `docs/ai/STATUS.md` — modified.
- `docs/ai/work-packets/WORK_INDEX.md` — modified (WP-232 `[x]`).
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (EC-264 → Done).

**Total: 18 files** (8 new + 6 modified source + 4 governance).

## After Completing
- [ ] `pnpm --filter @legendary-arena/server test` exits 0; ≥ 26 net-new cases (≥ 10 logic + ≥ 12 routes + ≥ 4 sync-script); no prior test regresses.
- [ ] `pnpm --filter @legendary-arena/server typecheck` exits 0 (server type-checks via its build; run explicitly if a standalone script exists).
- [ ] `pnpm -r build` exits 0.
- [ ] anomalyClass opacity: `grep -n "SweepAnomalyClass" apps/server/src/handoff/handoff.types.ts` returns 0; ≥ 1 import from `../inspection/inspection.types`.
- [ ] Centralized secret check: `grep -n "timingSafeEqual" apps/server/src/handoff/handoff.routes.ts` returns 0; the route imports `validateSharedSecret`.
- [ ] Idempotent sync: `grep -n "ON CONFLICT (handoff_id) DO NOTHING" apps/server/src/handoff/handoff.logic.ts` ≥ 1; a test re-syncs and asserts a `claimed` row stays `claimed` + `unchanged` count.
- [ ] Source of truth: `grep -n "FROM legendary.inspection_reports" apps/server/src/handoff/handoff.logic.ts` = 0; `grep -n "fetchLatestInspectionReport" apps/server/src/handoff/handoff.logic.ts` ≥ 1.
- [ ] Atomic transition: `grep -n "AND status = " apps/server/src/handoff/handoff.logic.ts` ≥ 1 (guarded UPDATE); a test drives the 0-rows path and asserts 404 (gone) / 409 (status moved), no lost update.
- [ ] Deterministic latest report: `grep -n "created_at DESC, report_id DESC" apps/server/src/handoff/handoff.logic.ts` ≥ 1; a test seeds two equal-`created_at` reports and asserts the lexicographically greatest `report_id` wins.
- [ ] Validation-before-read: tests assert the recording fake's `query()` is never called on the 401 / 413 / 400 transition paths.
- [ ] GET ordering: handoffs returned `ORDER BY finding_index ASC, handoff_id ASC` with `LIMIT 500`; `counts` sums to `handoffs.length`.
- [ ] Field persistence: a `fix-proposed → claimed` transition test asserts the stored `branch_ref` is preserved (not nulled).
- [ ] Explicit column lists: `grep -n "INSERT INTO legendary.finding_handoffs (handoff_id" apps/server/src/handoff/handoff.logic.ts` ≥ 1; positional `INSERT INTO legendary.finding_handoffs VALUES` = 0.
- [ ] No reduce: `grep -n "\.reduce(" apps/server/src/handoff/handoff.logic.ts` = 0.
- [ ] Transition gates: tests assert 400 (out-of-set toStatus / missing branchRef / missing amendmentRequest), 404 (unknown id), 409 (off-table transition, status unchanged), 200 (happy path, updatedAt advances).
- [ ] no-store gate: `Cache-Control.*no-store` across `handoff.routes.ts` ≥ 3.
- [ ] Catalog: 3 rows for the new endpoints in `api-endpoints.md`, Status/Auth in their closed sets.
- [ ] No dashboard / inspection edits: `git diff --name-only apps/dashboard/ apps/server/src/inspection/` empty. No new npm deps in `package.json` diffs.
- [ ] Workflow: exactly one additive `handoffs:sync` step; fetch/triage/submit steps byte-unchanged.
- [ ] Scope: `git diff --name-only` lists only the 18 `## Files to Produce` paths.
- [ ] `STATUS.md`, `DECISIONS.md` (D-23201..03 Active), `WORK_INDEX.md` (WP-232 `[x]`), `EC_INDEX.md` (EC-264 Done) updated.

## Common Failure Smells
- `SweepAnomalyClass` imported into the handoff surface → opacity violation (D-23103 class).
- Severity/route redefined locally instead of imported from `inspection.types.ts` → dual source of truth (drift surface).
- Sync using a no-conflict INSERT (throws/409 on re-run) or an UPSERT that clobbers `status` back to `open` → breaks idempotency (D-23203); re-sync must DO NOTHING and preserve status.
- Server performing an action on `branchRef`/`amendmentRequest` (creating a branch, opening a PR, editing a spec) → scope violation (D-23202 plumbing-only lock); the server only stores the strings.
- An illegal transition returning 200 (or a 400 instead of 409) → the locked transition table is the gate; off-table is 409 with status unchanged.
- A blind `UPDATE ... WHERE handoff_id = $1` (no `AND status = $expected`) → lost-update race; two concurrent transitions could both "succeed". Use the guarded UPDATE + 0-rows re-read.
- A direct `SELECT ... FROM legendary.inspection_reports` in `handoff.logic.ts` → source-of-truth violation (D-23203); read via `fetchLatestInspectionReport` only.
- Nulling `branch_ref`/`amendment_request` when transitioning away (e.g. `fix-proposed → claimed`) → field-persistence violation; write-on-enter, preserve thereafter.
- A `SELECT`/`UPDATE` issued before payload validation finishes → validation-before-read violation; auth/parse/shape/required must gate first.
- Latest-report query `ORDER BY created_at DESC LIMIT 1` WITHOUT the `report_id DESC` tie-break → nondeterministic GET under equal timestamps.
- `FOR UPDATE` / advisory lock / `BEGIN..COMMIT` around the transition → over-locking; the `AND status =` predicate is the concurrency control.
- `handoffId` in the URL path instead of the body → wrong contract (`POST /api/handoffs/transition` takes the id in the JSON body).
- Inline `timingSafeEqual` / `===` token compare in `handoff.routes.ts` → must call `validateSharedSecret`.
- A test asserting specific finding `description` text → couples the suite to inherited LLM-nondeterministic content; assert shape + lifecycle only.
- `.reduce()` in `isAllowedTransition` or the counts helper → use explicit `for...of` / object-map lookup.
- Any `apps/dashboard/**` or `apps/server/src/inspection/**` edit → out of scope (dashboard deferred; inspection surface locked).

---

## DECISIONS.md Entries (D-23201..D-23203)

> Status flips from `Reserved (proposed)` at draft time to `Active` at
> landing (execution close); no other field changes.

### D-23201 — Finding Handoffs: Storage Shape + Contract Lock + Denormalization-Snapshot Posture

**Decision:**
`legendary.finding_handoffs` makes each Inspector finding an addressable,
claimable work-item: 14 columns (`handoff_id` PK of form
`<reportId>#<findingIndex>`, `report_id`, `sweep_run_id`, `finding_index`,
`severity`, `route`, `anomaly_class`, `cell_id`, `description`, `status`,
`branch_ref`, `amendment_request`, `created_at`, `updated_at`) + two BTREE
indexes (`created_at DESC`, `report_id`). The wire contract is `HandoffRecord`
(row + GET), `HandoffTransitionPayload` (POST transition), `HandoffSyncSummary`
(POST sync), `HandoffLatestEnvelope` (GET). `HandoffStatus` / `InspectionRoute`
membership: the severity + route unions are IMPORTED from
`apps/server/src/inspection/inspection.types.ts` (one source of truth — the
handoff module does not redefine them); `anomalyClass` is an opaque string (no
engine `SweepAnomalyClass` import — D-23103 carry-forward). The
severity/route/anomalyClass/cellId/description columns are a point-in-time
SNAPSHOT of the finding for cheap addressable reads; the `inspection_reports`
row remains authoritative for finding content, and the handoff row is
authoritative ONLY for lifecycle `status` + the `branch_ref` / `amendment_request`
references. The two reference columns follow a write-on-enter rule:
`branch_ref` is written only on the `→ fix-proposed` transition and
`amendment_request` only on `→ escalated`; both are PRESERVED (never nulled) on
every other transition for auditability. `GET /api/handoffs/latest` resolves the
"latest report" deterministically via `ORDER BY created_at DESC, report_id DESC
LIMIT 1` (greatest `created_at`, tie-broken by lexicographically greatest
`report_id` — a total order even under equal timestamps) and returns that
report's rows `ORDER BY finding_index ASC, handoff_id ASC` with a query-level
`LIMIT 500` + per-status counts.

**Packet:** WP-232 (EC-264).
**Drafted:** 2026-06-10 (reserved). **Landed:** TBD (execution close).
**Status:** Reserved (proposed)

### D-23202 — Handoff Lifecycle State Machine + Plumbing-Only Scope Lock

**Decision:**
The handoff lifecycle is a closed 6-status set (`open`, `claimed`,
`fix-proposed`, `escalated`, `resolved`, `wont-fix`) with a server-enforced
transition table: `open→claimed`; `claimed→fix-proposed|escalated|wont-fix`;
`fix-proposed→resolved|claimed`; `escalated→claimed|resolved|wont-fix`;
`resolved` / `wont-fix` terminal. The transition handler evaluates in a locked
order — auth (401) → body parse/size (413/400) → shape (400) →
conditional-required fields (400) → load row (404 if absent) → legality vs the
table (409) → apply — with all validation completing BEFORE any database access
(validation-before-read). The mutation is a single guarded
`UPDATE ... WHERE handoff_id = $1 AND status = $expectedStatus RETURNING *`: if it
affects 0 rows (a parallel transition moved the row), the handler re-reads once
and maps absent → 404 / different-status → 409, so two transitions racing from
the same start cannot both succeed (no lost update; no `FOR UPDATE` / advisory
lock / multi-step transaction). **Plumbing-only scope lock (operator decision
2026-06-10):** WP-232 RECORDS handoff state; it runs no autonomous agent.
`branchRef` and `amendmentRequest` are references the server stores, never
actions it performs — the server creates no git branch, opens no PR, and edits
no WP spec. The unattended Builder (code-writer) and Architect (spec-writer) are
the first such surfaces in the pipeline and get their own separately-gated
follow-up WP, per the checks-and-balances separation-of-duties discipline.

**Packet:** WP-232 (EC-264).
**Drafted:** 2026-06-10 (reserved). **Landed:** TBD (execution close).
**Status:** Reserved (proposed)

### D-23203 — Idempotent Sync Materialization + Handoff Auth Posture

**Decision:**
`POST /api/handoffs/sync` reads the latest inspection report via the exported
`fetchLatestInspectionReport(database)` ONLY (this module issues no direct SQL
against `legendary.inspection_reports` — one source of truth, no duplicate query
to drift) and inserts one `open` handoff row per finding via
`INSERT ... ON CONFLICT (handoff_id) DO NOTHING` — idempotent and
status-preserving: re-syncing a report that already has rows is a normal no-op
(a `claimed` row stays `claimed`), NOT a duplicate-submission error. This is a
deliberate, documented contrast with the inspection POST's no-UPSERT-409
posture, because re-sync is an expected nightly operation. Sync operates on the
single latest report only: if multiple reports are filed between two syncs,
intermediate reports are not guaranteed to be materialized (by design). The response is
`HandoffSyncSummary { reportId, findingCount, created, unchanged }` with
`created + unchanged === findingCount` (empty `inspection_reports` →
`reportId: null` + all-zero counts). Both POSTs are `guest` with a new
shared-secret `X-Handoff-Token` ↔ `HANDOFF_SUBMIT_TOKEN`, validated via the
existing `validateSharedSecret` helper (no new helper, no third inline check).
`GET /api/handoffs/latest` is `authenticated-session-required` (D-9905 +
D-10403 collapse) for the operator dashboard + manually-invoked Builder/Architect
sessions. The existing `inspection-nightly.yml` gains one additive trailing
`pnpm handoffs:sync` step (`if: success()`) so the queue refreshes after each
nightly triage.

**Packet:** WP-232 (EC-264).
**Drafted:** 2026-06-10 (reserved). **Landed:** TBD (execution close).
**Status:** Reserved (proposed)
