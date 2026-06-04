# WP-209 — `sweep_runs` Server (Storage + Submission Endpoint + Operator Query Endpoint + Nightly GitHub Actions Invocation)

**Status:** Ready
**Primary Layer:** Server (`apps/server/src/sweep/`) + Migration (`data/migrations/`) + Build tooling (`scripts/sweep-submit.mjs`, `.github/workflows/sweep-nightly.yml`, root `package.json` scripts)
**Dependencies:** WP-194 (sweep runner) ✅, WP-195 (sweep analyzer) ✅, WP-115 (Postgres bootstrap) ✅, WP-133 (route pattern) ✅, WP-205 (auth split + envelope pattern) ✅, WP-118 (API catalog) ✅

---

## Session Context

WP-194 + WP-195 shipped the sweep runner + manifest anomaly oracle, but the output stays gitignored on disk under `sweep-output/<run-id>/manifest.jsonl` per D-19403 — meaning the QA tool has been invoked zero times on the canonical worktree (no operator surface, no aggregation, no trend, no "did we run it?" signal). This WP lands the **paired-server half** of the sweep dashboard: a Postgres table for durable summaries, two HTTP endpoints (POST for CI submission + GET for operator dashboard reads), a GitHub Actions nightly workflow that runs the sweep, submits the summary to the new endpoint, and deletes the local artifact. The paired client half (WP-210) consumes the GET endpoint behind a `SweepHealthWidget` on `/system`.

---

## Goal

After this session, the server exposes `POST /api/sweep/runs` (CI-only via shared-secret header) and `GET /api/sweep/latest` (operator dashboard via `authenticated-session-required` per D-9905), both backed by a new `legendary.sweep_runs` table that stores one row per sweep run with summary columns plus the raw classified manifest blob. A nightly GitHub Actions workflow (`sweep-nightly.yml`) runs `pnpm sweep:nightly`, classifies the manifest via WP-195's `sweep.analyze`, posts the summary to the new endpoint, and `rm -rf`'s the local `sweep-output/<run-id>/` artifact. The classified manifest is the canonical durable record; the local JSONL artifact remains gitignored and ephemeral per D-19403.

---

## Assumes

- WP-194 complete. Specifically:
  - `packages/game-engine/src/simulation/sweep.runner.ts` exports `sweepSetupMatrix` and `CELL_SEED_SEPARATOR`
  - `scripts/sweep-setup-matrix.mjs` exists and accepts `--run-seed`, `--out-dir`, and is invocable via `node scripts/sweep-setup-matrix.mjs`
  - Manifest at `sweep-output/<run-id>/manifest.jsonl` has the 7-key JSONL shape per D-19403 + WP-194 §E
- WP-195 complete. Specifically:
  - `packages/game-engine/src/simulation/sweep.analyze.ts` exports `classifyManifestRecords`, `SWEEP_ANOMALY_CLASSES` (4-class closed taxonomy: `'endgame-reached' | 'not-endgame' | 'escaped-villain-cap' | 'fatal'` per D-19502, verified against the engine source at sweep.analyze.ts:85), and the `ManifestSummary` + `ManifestClassification` interfaces
- WP-115 complete. Postgres connection pool available via the existing bootstrap pattern
- WP-133 + WP-205 complete. `apps/server/src/billing/` and `apps/server/src/analytics/` patterns established for route+logic+types module shape
- WP-118 complete. `docs/ai/REFERENCE/api-endpoints.md` exists and is structured per D-11804 replace-whole-row semantics
- `docs/ai/DECISIONS.md` exists
- `docs/ai/ARCHITECTURE.md` exists

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirms server may import `@legendary-arena/game-engine` setup-tooling surface; sweep submission script invokes the engine sweep + analyzer at build-time, the route handlers do not.
- `apps/server/src/analytics/analytics.routes.ts` — read entirely. Models the route+logic+types+test split this WP mirrors. Note the `Cache-Control: no-store` first-statement lock (D-11504 carry-forward) and the `SessionValidationErrorCode` collapse to `'unauthorized'` (D-10403) — both apply verbatim to the GET endpoint here.
- `apps/server/src/analytics/analytics.types.ts` — read entirely. Models the union + canonical-array + envelope-interface pattern.
- `data/migrations/017_create_analytics_events.sql` — read entirely. Models the schema closure (CHECK constraints, BTREE indexes) the new `018_create_sweep_runs.sql` mirrors at smaller scale.
- `packages/game-engine/src/simulation/sweep.analyze.ts` lines 70-250 — read the `SweepAnomalyClass` union, `SWEEP_ANOMALY_CLASSES` canonical array, and `ManifestSummary` / `ManifestClassification` interfaces. The server's `SweepRunPayload` types alias these so the contract stays single-sourced at the engine.
- `docs/ai/DECISIONS.md` D-19401, D-19402, D-19403, D-19501, D-19502 — the anchor decisions WP-194 + WP-195 locked. Do not re-derive them.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rules 4 / 6 / 9 / 11 / 13 / 14 apply.
- `docs/ai/REFERENCE/00.1-master-coordination-prompt.md` — non-negotiable structural constraints.
- `docs/ai/REFERENCE/api-endpoints.md §Wired → Server-Registered Routes` — the catalog rows this WP appends to (per D-11804 replace-whole-row merge semantics).
- `.github/workflows/` — read one existing workflow file to mirror its `actions/checkout@v4 + actions/setup-node@v4 + pnpm/action-setup@v4` bootstrap.

---

## Scope (In)

- Migration `data/migrations/018_create_sweep_runs.sql` creating `legendary.sweep_runs` with the closed 6-column schema locked in §Non-Negotiable Constraints
- New `apps/server/src/sweep/` module: `sweep.types.ts` (payload + row interfaces aliasing the engine's `SweepAnomalyClass`) + `sweep.logic.ts` (pure insert + fetch-latest + fetch-recent functions) + `sweep.routes.ts` (POST + GET handlers + `registerSweepRoutes` export)
- Test files `sweep.logic.test.ts` + `sweep.routes.test.ts` (≥ 18 net-new node:test cases total: ≥ 6 logic + ≥ 12 routes — bumped from 16 to cover the token-length pre-check, duplicate-no-overwrite, ordering, and query-param-ignore ACs)
- Bootstrap wiring in `apps/server/src/server.mjs` — invoke `registerSweepRoutes(router, { pool, sweepSubmitToken })` next to the existing `registerAnalyticsRoutes(...)` call
- API catalog update at `docs/ai/REFERENCE/api-endpoints.md` — 2 new rows under `## Wired → Server-Registered Routes` per D-11804 replace-whole-row semantics
- New `scripts/sweep-submit.mjs` — wrapper that invokes `scripts/sweep-setup-matrix.mjs`, classifies the resulting manifest via `sweep.analyze`, POSTs the summary to `${API_BASE_URL}/api/sweep/runs` with the shared-secret header, and `rm -rf`'s the local `sweep-output/<run-id>/` directory on success
- New `pnpm sweep:nightly` root script — `"node scripts/sweep-submit.mjs"`
- New `.github/workflows/sweep-nightly.yml` — cron `0 7 * * *` (07:00 UTC = midnight Pacific), checkout + pnpm setup + `pnpm install --frozen-lockfile` + `pnpm sweep:nightly` with `SWEEP_SUBMIT_TOKEN` + `API_BASE_URL` from GitHub Actions secrets
- Render env var declaration: `SWEEP_SUBMIT_TOKEN` added to `render.yaml` `envVars` block as `sync: false` (operator sets the secret in the Render dashboard; loud-fail at server startup if unset in production per the existing `ANALYTICS_USER_ID_SALT` precedent)
- Reserve D-20701 (sweep_runs storage shape lock) + D-20702 (sweep submission auth posture)

## Out of Scope

- The widget itself (`apps/dashboard/src/widgets/SweepHealthWidget.vue`) and the composable + page wire — that's WP-210, this WP's paired-client follow-up
- Per-cell fixture promotion — explicitly deferred per D-19403 ("An opt-in `--write-fixtures` flag could land in a follow-up WP if operators surface a real use case")
- Anomaly-class taxonomy changes — `SWEEP_ANOMALY_CLASSES` is contract-locked by WP-195 D-19502; this WP passes it through unchanged
- Sweep cadence other than nightly — hourly / per-merge / per-PR cadences deferred; nightly is the v1 lock
- A `/debug` page or any new dashboard route — WP-210 lands the widget on the existing `/system` page
- Sweep submission from anywhere other than GitHub Actions — Render scheduled jobs, local developer submissions, and on-demand submission from the dashboard are all out of scope for v1
- Multi-row pagination on the GET endpoint — v1 returns the latest run + last 30 runs in one response; richer paging is a future hardening WP
- Anomaly trending math (regression detection, alert thresholds, etc.) — v1 surfaces the raw counts; analysis stays operator-eyeball for now
- Retention / pruning of historical `sweep_runs` rows — v1 keeps every row indefinitely; a future WP introduces TTL or row-count cap if the disk-usage trend warrants. JSONB `manifest_blob` is the dominant size contributor (~2 MB nightly worst-case); ~700 rows/year worst case, ~1.5 GB/year worst case, well inside Render Postgres free-tier headroom for v1
- A `GET /api/sweep/runs/:runId` blob-retrieval endpoint — operator forensic re-analyze stays manual via `psql` for v1; promoted if the dashboard surfaces a click-through use case

---

## Files Expected to Change

- `data/migrations/018_create_sweep_runs.sql` — new (table + 1 BTREE index)
- `apps/server/src/sweep/sweep.types.ts` — new (payload + row interfaces aliasing engine `SweepAnomalyClass`)
- `apps/server/src/sweep/sweep.logic.ts` — new (3 pure async functions: `insertSweepRun`, `fetchLatestSweepRun`, `fetchRecentSweepRuns`)
- `apps/server/src/sweep/sweep.logic.test.ts` — new (≥ 6 tests)
- `apps/server/src/sweep/sweep.routes.ts` — new (POST + GET handlers + `registerSweepRoutes` export)
- `apps/server/src/sweep/sweep.routes.test.ts` — new (≥ 12 tests)
- `apps/server/src/server.mjs` — modified (one-line `registerSweepRoutes` call + one-line `SWEEP_SUBMIT_TOKEN` env-var loud-fail-on-production guard mirroring the existing `ANALYTICS_USER_ID_SALT` pattern)
- `scripts/sweep-submit.mjs` — new (sweep + classify + POST + cleanup wrapper)
- `package.json` — modified (add `"sweep:nightly": "node scripts/sweep-submit.mjs"` to root `scripts`)
- `.github/workflows/sweep-nightly.yml` — new (cron workflow)
- `render.yaml` — modified (add `SWEEP_SUBMIT_TOKEN` `sync: false` env-var declaration)
- `docs/ai/REFERENCE/api-endpoints.md` — modified (2 new catalog rows per D-11804)
- `docs/ai/DECISIONS.md` — modified (D-20701 + D-20702 reserved)
- `docs/ai/STATUS.md` — modified (Done entry)
- `docs/ai/work-packets/WORK_INDEX.md` — modified (status Ready → Done)
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (status Ready → Done)

16 files total (10 new + 2 modified source + 4 governance). This exceeds the §1 ~8 file guidance; bundling is justified because the migration + types + logic + routes + bootstrap + script + workflow form a single coherent server-side surface that has no value in partial landing — splitting would force an artificial 209a/209b that doesn't reflect testable contract boundaries.

---

## Locked Type Contracts

These three shapes are the byte-identical contract between `scripts/sweep-submit.mjs`, the route handlers, and WP-210's `SweepHealthWidget`. Drift here breaks all three. Author them once in `apps/server/src/sweep/sweep.types.ts` re-exporting from `@legendary-arena/game-engine` where applicable; consume verbatim everywhere else.

### POST `/api/sweep/runs` — Request Body

```ts
interface SweepRunPayload {
  runId: string                                    // non-empty string ≤ 128 chars
  startedAt: string                                // ISO-8601, parseable by `new Date(value)`
  cellCount: number                                // integer, 0 ≤ n ≤ 10000
  anomalyCounts: Record<SweepAnomalyClass, number> // keys ⊆ SWEEP_ANOMALY_CLASSES (per WP-195 D-19502)
  manifestBlob?: unknown                           // optional; raw ManifestClassification JSON; must be JSON-serializable if present
}
```

Validator failure-mode table (evaluated in this order; first failure short-circuits — no DB I/O until all pass):

| Check | Failure status | Notes |
|---|---|---|
| `X-Sweep-Token` header present and length-equal to env token | 401 | length-equality is a pre-check before `timingSafeEqual` — see §Packet-specific |
| `X-Sweep-Token` constant-time byte-equal to `process.env.SWEEP_SUBMIT_TOKEN` | 401 | `{ data: [], error: 'unauthorized' }` |
| Body parseable as JSON and ≤ 5 MB | 413 / 400 | size-cap before parse where possible |
| `runId` non-empty string, ≤ 128 chars | 400 | |
| `startedAt` parseable ISO-8601 | 400 | `Number.isNaN(new Date(value).getTime())` rejects |
| `cellCount` integer in `[0, 10000]` | 413 | defense-in-depth before INSERT (matches column CHECK constraint) |
| `anomalyCounts` keys a subset of `SWEEP_ANOMALY_CLASSES` | 400 | drift-detection test asserts behavior matches engine canonical array byte-identical |
| `runId` not already present in `legendary.sweep_runs` (PK) | 409 | `{ data: [], error: 'conflict' }`; existing row UNCHANGED — no UPSERT, no partial overwrite |

### GET `/api/sweep/latest` — Response Row Shape

```ts
interface SweepRunSummary {
  runId: string
  submittedAt: string  // ISO-8601 (UTC)
  startedAt: string    // ISO-8601 (UTC)
  cellCount: number
  anomalyCounts: Record<SweepAnomalyClass, number>
}
```

`SweepRunSummary` deliberately EXCLUDES `manifestBlob`. The blob is forensic-only and never shipped on the operator dashboard read path; a future `GET /api/sweep/runs/:runId` may expose it, deferred from v1.

### GET `/api/sweep/latest` — Response Envelope

```ts
{
  data: {
    latest: SweepRunSummary | null,             // greatest submitted_at; null only if table empty (pre-first-run)
    recentRuns: readonly SweepRunSummary[]      // ordered submitted_at DESC, length ≤ 30
  }
}
```

`data` is an OBJECT (not the WP-205 `data: readonly T[]` array shape) because the endpoint serves two semantically distinct payloads in one response — see §Non-Negotiable Constraints for the intentional deviation justification.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — sweep PRNG flows through the engine's `runSeed` per D-19402 (the server side touches no randomness)
- Never throw inside boardgame.io move functions — N/A (no moves touched)
- Never persist `G`, `ctx`, or any runtime state — N/A
- `G` must be JSON-serializable at all times — N/A
- ESM only, Node v22+ — all changes use `import`/`export`, never `require()`; `scripts/sweep-submit.mjs` uses Node v22 `node --env-file=.env` not Linux-only sourcing
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, `node:crypto`, `node:fs/promises`)
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`
- Full file contents required for every new or modified file — no diffs, no snippets

**Packet-specific:**
- `SweepAnomalyClass` is **imported** from `@legendary-arena/game-engine` (setup-tooling surface — server is permitted to consume engine types per the existing analytics + billing precedents). The server does NOT redefine the union; drift between server and engine is impossible by import.
- `SWEEP_ANOMALY_CLASSES` 4-class taxonomy (per D-19502) is the closed set the JSONB `anomaly_counts` column accepts; the route validator MUST reject submissions whose `anomalyCounts` object keys are not a subset of `SWEEP_ANOMALY_CLASSES`. The migration's CHECK constraint cannot enforce JSONB key sets in pure SQL; enforcement is at the route validator layer with a drift-detection test that asserts validator behavior matches the engine's canonical array byte-identical.
- POST handler is `guest` per D-9905 with **shared-secret header** auth: `X-Sweep-Token` MUST equal `process.env.SWEEP_SUBMIT_TOKEN` byte-for-byte using `node:crypto.timingSafeEqual` (NOT `===`); mismatch returns 401 with `{ data: [], error: 'unauthorized' }` body shape and exits before any DB I/O
- Token comparison MUST first compare `Buffer.byteLength(headerToken)` against `Buffer.byteLength(envToken)`; on length mismatch return 401 immediately WITHOUT invoking `timingSafeEqual`. Node's `timingSafeEqual` throws `RangeError` on unequal-length buffers — the pre-check preserves both the constant-time guarantee on equal-length inputs and the clean 401 path on the trivial reject case
- POST is idempotent by `run_id` PRIMARY KEY: duplicate submissions return 409 with `{ data: [], error: 'conflict' }` and MUST NOT overwrite, merge, or partially update the existing row. No `INSERT ... ON CONFLICT DO UPDATE`. No `INSERT ... ON CONFLICT DO NOTHING` (the duplicate must be observable to the caller as 409, not silently swallowed)
- GET endpoint MUST NOT accept or interpret query parameters in v1 — no `?limit=`, no `?since=`, no `?runId=`. Unknown query strings are ignored, not rejected. Pagination and filtering are explicitly future-WP scope
- All SQL `INSERT` statements in `sweep.logic.ts` MUST list columns explicitly: `INSERT INTO legendary.sweep_runs (run_id, started_at, cell_count, anomaly_counts, manifest_blob) VALUES ($1, $2, $3, $4, $5)`. Positional inserts (`INSERT INTO ... VALUES (...)` without column list) are forbidden as defense against future column-order migration drift. `submitted_at` is omitted from the column list — column DEFAULT `now()` populates it server-side
- GET handler is `authenticated-session-required` per D-9905 with `SessionValidationErrorCode` collapse to `'unauthorized'` per D-10403 carry-forward
- Response envelope on GET: `{ data: { latest: SweepRunSummary, recentRuns: readonly SweepRunSummary[] } }` — `data` is an OBJECT not a readonly array because the endpoint serves two semantically distinct payloads (latest + recent) in one response; this is an intentional deviation from the WP-205 `{ data: readonly T[] }` envelope, justified inline at the §Response Envelope section
- Response envelope on POST: `{ data: { runId: string, accepted: true } }` on success, `{ data: [], error: string }` on failure (mirrors WP-205 envelope shape verbatim)
- `Cache-Control: no-store` first-statement lock (D-11504 carry-forward) — every handler body sets this header as the literal first statement
- POST body size cap: 5 MB (raw `ManifestClassification` blobs can be large; cell counts at full Scheme × Mastermind cross-product land around 200-500 cells with 4 KB per classified record = ~2 MB; 5 MB ceiling with 1 MB safety margin)
- Cell-count cap on submission: 10000 cells (defense-in-depth against malformed payloads); reject with 413 status if exceeded
- `started_at` field on POST body MUST be parseable as an ISO-8601 timestamp; reject with 400 otherwise
- `run_id` field on POST body MUST be a non-empty string ≤ 128 chars; reject with 400 otherwise; uniqueness enforced by `run_id text PRIMARY KEY` (duplicate run_id returns 409 Conflict)
- `manifest_blob` is the raw `ManifestClassification` JSON (the analyzer's full classification including `ParsedManifestRecord[]` per-cell parse results) — operator-only retention for forensic re-analyze; nullable in v1 (POST may omit it for small payloads, present for nightly runs)
- Status-code domains locked per handler: POST `{201, 400, 401, 409, 413, 500}`; GET `{200, 401, 500}`
- API catalog update obligation (D-11804) — 2 new rows under `## Wired → Server-Registered Routes` per replace-whole-row merge semantics; each row cites D-20701 + D-20702 + relevant carry-forward D-entries
- GitHub Actions secrets required: `SWEEP_SUBMIT_TOKEN` (matches server env var) + `API_BASE_URL` (production endpoint URL). Both declared as required at workflow top; missing → workflow fails fast before the sweep runs

**Session protocol:**
- If `SWEEP_ANOMALY_CLASSES` on the engine side has shifted from the documented 4-class taxonomy (`'endgame-reached' | 'not-endgame' | 'escaped-villain-cap' | 'fatal'` — verified at sweep.analyze.ts:85 on 2026-06-04): STOP and report (drift signal; downstream consumers may not be aware)
- If the existing `scripts/sweep-setup-matrix.mjs` CLI flags have changed from `--run-seed` + `--out-dir`: read the script and adapt `scripts/sweep-submit.mjs` to the actual surface; do not invent flags
- If the existing `apps/server/src/analytics/` module has been refactored since this WP was drafted: read the new shape and mirror it for sweep; do not duplicate stale patterns
- If `render.yaml` does not contain `ANALYTICS_USER_ID_SALT` as the existing sync-false precedent: STOP and ask — the sync-false pattern may have shifted

**Locked contract values:**
- Schema columns (exact order in CREATE TABLE): `run_id`, `submitted_at`, `started_at`, `cell_count`, `anomaly_counts`, `manifest_blob` — 6 columns, no more
- Schema types: `run_id text PRIMARY KEY`, `submitted_at timestamptz NOT NULL DEFAULT now()`, `started_at timestamptz NOT NULL`, `cell_count int NOT NULL CHECK (cell_count >= 0 AND cell_count <= 10000)`, `anomaly_counts jsonb NOT NULL`, `manifest_blob jsonb NULL`
- BTREE index: `CREATE INDEX sweep_runs_submitted_at_desc_idx ON legendary.sweep_runs (submitted_at DESC)`
- POST URL: `/api/sweep/runs` (literal; no version suffix)
- GET URL: `/api/sweep/latest` (literal)
- Shared-secret header name: `X-Sweep-Token` (literal; no `Bearer ` prefix; no `Authorization:` reuse)
- GitHub Actions cron: `0 7 * * *` (literal; 07:00 UTC — midnight Pacific Standard Time, 5pm previous-day for ops sanity checks the next business morning)
- Recent-runs response cap: 30 (matches WP-204 sparkline convention)
- `pnpm sweep:nightly` literal script name
- Workflow filename: `.github/workflows/sweep-nightly.yml`
- Render env var: `SWEEP_SUBMIT_TOKEN` `sync: false`
- "Latest" ordering dimension: the row with the greatest `submitted_at` timestamp (NOT `started_at`). Back-fills and out-of-order submissions sort by submission wall-clock, not sweep wall-clock — this matches the operator question "what's the most recent thing the dashboard knows about?"
- `recentRuns` SQL ordering: `ORDER BY submitted_at DESC LIMIT 30` (literal); the BTREE index `sweep_runs_submitted_at_desc_idx` exists precisely to serve this query path
- `runId` format (submission side): `<shortSha>-<isoTimestampUtc>` where `shortSha = git rev-parse --short HEAD` (7 chars) and `isoTimestampUtc = new Date().toISOString().replace(/[-:.]/g, '').replace(/\.\d+Z$/, 'Z')` (compact basic form, e.g., `20260604T070000Z`). Example: `a1b2c3d4-20260604T070000Z`. Format chosen so re-running the same commit (manual operator forensic re-run; nightly retries after partial failure) produces distinct `runId`s and avoids 409s on legitimate retry
- D-20701: storage shape lock (the 6 columns + index + closed CHECK constraints)
- D-20702: auth posture (POST shared-secret + GET authenticated-session-required)

---

## Submission Script Failure Modes

`scripts/sweep-submit.mjs` MUST exit non-zero (silent partial success is forbidden) on ANY of the following:

1. `SWEEP_SUBMIT_TOKEN` or `API_BASE_URL` env vars are missing or empty at script entry — exit 2 (config error), no sweep invoked
2. `git rev-parse --short HEAD` fails or returns empty — exit 2 (no git context, `runId` not derivable)
3. Sweep runner invocation (`node scripts/sweep-setup-matrix.mjs --run-seed=... --out-dir=...`) exits non-zero — exit 3, local artifact PRESERVED for forensic
4. Manifest read fails (file missing, unreadable, malformed JSONL) — exit 3, local artifact PRESERVED
5. `classifyManifestRecords` from `@legendary-arena/game-engine` throws or returns a non-`ManifestClassification` shape — exit 3, local artifact PRESERVED
6. POST to `${API_BASE_URL}/api/sweep/runs` returns non-2xx OR network error — exit 4, local artifact PRESERVED
7. POST response body does not contain the exact shape `{ data: { runId: <string>, accepted: true } }` — exit 4, local artifact PRESERVED

On exit 0, the script MUST have (a) successfully POSTed and (b) `rm -rf`'d `sweep-output/<runId>/`. Cleanup MUST NOT run on any non-zero exit path — the local artifact is preserved precisely so the operator can re-run `classifyManifestRecords` against the persisted JSONL when investigating a failed nightly.

---

## Acceptance Criteria

1. Migration `018_create_sweep_runs.sql` applies cleanly against a fresh schema (verified by `pnpm --filter @legendary-arena/server migrate` in test mode) and creates exactly 1 table + 1 index in the `legendary` schema
2. `apps/server/src/sweep/sweep.types.ts` imports `SweepAnomalyClass` and `SWEEP_ANOMALY_CLASSES` from `@legendary-arena/game-engine` (no redefinition) — verified by `grep -E "type SweepAnomalyClass|const SWEEP_ANOMALY_CLASSES" apps/server/src/sweep/sweep.types.ts` returning zero matches
3. `apps/server/src/sweep/sweep.routes.ts` exports `registerSweepRoutes(router, { pool, sweepSubmitToken })` and is invoked from `apps/server/src/server.mjs` exactly once
4. POST `/api/sweep/runs` rejects requests missing the `X-Sweep-Token` header with status 401 and body `{ data: [], error: 'unauthorized' }` — verified by integration test asserting both before any DB I/O occurs
5. POST `/api/sweep/runs` rejects token mismatch using `node:crypto.timingSafeEqual` (NOT `===`) — verified by grep gate `grep -nE "timingSafeEqual" apps/server/src/sweep/sweep.routes.ts` returning ≥ 1 match
6. POST `/api/sweep/runs` checks token-length-equality BEFORE invoking `timingSafeEqual` — verified by a unit test that submits a token strictly shorter than the env token and asserts 401 returned, no `RangeError` thrown, no DB call observed
7. POST `/api/sweep/runs` rejects body with `cell_count > 10000` returning status 413 before INSERT
8. POST `/api/sweep/runs` rejects duplicate `run_id` returning status 409 (constraint violation surfaced as Conflict) AND the pre-existing row is byte-identical to its pre-submission state — verified by integration test that SELECTs the row before and after the duplicate POST and asserts `submitted_at`, `started_at`, `cell_count`, `anomaly_counts`, and `manifest_blob` are unchanged
9. POST `/api/sweep/runs` validates `anomalyCounts` object keys are a subset of `SWEEP_ANOMALY_CLASSES`; rejects unknown keys with 400 — drift-detection test asserts validator behavior matches engine canonical array byte-identical
10. All `INSERT` statements in `apps/server/src/sweep/sweep.logic.ts` list columns explicitly — verified by grep gate `grep -nE "INSERT INTO legendary.sweep_runs \(run_id, started_at, cell_count, anomaly_counts, manifest_blob\)" apps/server/src/sweep/sweep.logic.ts` returning ≥ 1 match AND `grep -nE "INSERT INTO legendary.sweep_runs VALUES" apps/server/src/sweep/sweep.logic.ts` returning 0 matches
11. GET `/api/sweep/latest` returns 401 for unauthenticated requests via `SessionValidationErrorCode` collapse to `'unauthorized'` (D-10403)
12. GET `/api/sweep/latest` response shape exactly matches `{ data: { latest: SweepRunSummary | null, recentRuns: readonly SweepRunSummary[] } }` with `recentRuns.length <= 30`
13. GET `/api/sweep/latest` `recentRuns` is ordered `submitted_at DESC` AND `latest` equals `recentRuns[0]` when the table is non-empty — verified by integration test that inserts 3 rows with explicit `submitted_at` values out-of-order and asserts the response ordering matches `submitted_at DESC` (NOT `started_at` order)
14. GET `/api/sweep/latest` ignores unknown query parameters and does NOT alter response shape — verified by test submitting `?limit=5&since=2026-01-01` and asserting full 30-row response identical to the no-query-param baseline
15. Every handler body sets `Cache-Control: no-store` as the literal first statement — grep gate `grep -nE "Cache-Control.*no-store" apps/server/src/sweep/sweep.routes.ts | wc -l` returns ≥ 4 (POST happy + POST 4 error paths)
16. `docs/ai/REFERENCE/api-endpoints.md` carries 2 new rows for `POST /api/sweep/runs` (auth: `guest`, status closed-set `{201, 400, 401, 409, 413, 500}`) and `GET /api/sweep/latest` (auth: `authenticated-session-required`, status closed-set `{200, 401, 500}`) per replace-whole-row merge semantics
17. `scripts/sweep-submit.mjs` (a) invokes the existing `scripts/sweep-setup-matrix.mjs` with a deterministic `runId` of form `<shortSha>-<isoTimestampUtc>` derived from `git rev-parse --short HEAD` + UTC now, (b) classifies the resulting manifest via `sweep.analyze`'s `classifyManifestRecords`, (c) POSTs the summary to `${API_BASE_URL}/api/sweep/runs` with the `X-Sweep-Token` header, (d) `rm -rf`'s `sweep-output/<runId>/` ONLY on POST success, (e) exits 0 on success and non-zero with the §Submission Script Failure Modes exit-code mapping `{2: config/git, 3: sweep/analyze, 4: network/POST}` on any failure step
18. `scripts/sweep-submit.mjs` preserves `sweep-output/<runId>/` on every non-zero exit path — verified by a unit test that stubs each of the 7 documented failure modes and asserts the directory is still present post-exit
19. `package.json` root scripts contain `"sweep:nightly": "node scripts/sweep-submit.mjs"`
20. `.github/workflows/sweep-nightly.yml` cron is exactly `0 7 * * *`; declares `SWEEP_SUBMIT_TOKEN` + `API_BASE_URL` as required env vars sourced from GitHub Actions secrets
21. `render.yaml` declares `SWEEP_SUBMIT_TOKEN` as `sync: false`; `apps/server/src/server.mjs` loud-fails at startup in production if unset (mirrors `ANALYTICS_USER_ID_SALT` pattern)

---

## Verification Steps

```bash
# 1. Migration applies
pnpm --filter @legendary-arena/server migrate
# Expected: exit 0; "Applied: 018_create_sweep_runs.sql"

# 2. Server tests pass
pnpm --filter @legendary-arena/server test 2>&1 | tail -3
# Expected: tests for sweep.logic.test.ts + sweep.routes.test.ts all green; ≥ 18 net-new (≥ 6 logic + ≥ 12 routes)

# 3. Build passes
pnpm -r build
# Expected: exit 0

# 4. API catalog rows present
grep -nE "POST.*/api/sweep/runs|GET.*/api/sweep/latest" docs/ai/REFERENCE/api-endpoints.md
# Expected: 2 lines, one per endpoint

# 5. Engine import single-source confirmed
grep -nE "from '@legendary-arena/game-engine'" apps/server/src/sweep/sweep.types.ts
# Expected: 1 line importing SweepAnomalyClass + SWEEP_ANOMALY_CLASSES

# 6. timingSafeEqual used (NOT === comparison)
grep -nE "timingSafeEqual" apps/server/src/sweep/sweep.routes.ts
# Expected: ≥ 1 match

# 7. Cache-Control first-statement gate
grep -nE "Cache-Control.*no-store" apps/server/src/sweep/sweep.routes.ts | wc -l
# Expected: ≥ 4

# 8. Workflow cron locked
grep -E "cron:.*0 7" .github/workflows/sweep-nightly.yml
# Expected: "    - cron: '0 7 * * *'"

# 9. pnpm script wired
grep -E '"sweep:nightly"' package.json
# Expected: "sweep:nightly": "node scripts/sweep-submit.mjs"

# 10. Render env var declared
grep -E "SWEEP_SUBMIT_TOKEN" render.yaml
# Expected: 1 line with sync: false

# 11. Explicit INSERT column list (no positional inserts)
grep -nE "INSERT INTO legendary\.sweep_runs \(run_id, started_at, cell_count, anomaly_counts, manifest_blob\)" apps/server/src/sweep/sweep.logic.ts
# Expected: ≥ 1 line

grep -nE "INSERT INTO legendary\.sweep_runs VALUES" apps/server/src/sweep/sweep.logic.ts
# Expected: 0 matches (positional inserts forbidden)

# 12. recentRuns ordering locked in SQL
grep -nE "ORDER BY submitted_at DESC LIMIT 30" apps/server/src/sweep/sweep.logic.ts
# Expected: ≥ 1 line

# 13. runId format builder present in submission script
grep -nE "rev-parse --short HEAD" scripts/sweep-submit.mjs
# Expected: ≥ 1 line
```

---

## Definition of Done

- [ ] All 21 Acceptance Criteria pass
- [ ] All 13 Verification Steps produce the expected output
- [ ] `docs/ai/STATUS.md` updated with what changed (Done entry naming WP-209 + the 2 new endpoints + the migration + the GitHub Actions workflow)
- [ ] `docs/ai/DECISIONS.md` updated with D-20701 (sweep_runs storage shape lock) + D-20702 (sweep submission auth posture)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` packet status flipped Ready → Done
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` checklist status flipped Ready → Done
- [ ] `docs/ai/REFERENCE/api-endpoints.md` carries the 2 new catalog rows per D-11804 replace-whole-row merge semantics
- [ ] No files outside `## Files Expected to Change` were modified — verified by `git status`
- [ ] Commit message uses `EC-241:` prefix per the commit hygiene gate

---

## Vision Alignment

**N/A.** This WP lands a server-side storage + scheduled QA invocation surface and an operator-only dashboard data feed. It touches no §17.1 trigger surface: no scoring, no replays, no player identity, no multiplayer sync, no determinism guarantees the engine doesn't already enforce, no card data, no monetization, no live ops UX, no accessibility surface, no Registry Viewer public surface. The dashboard widget that consumes the GET endpoint (WP-210) is operator-only behind CF Access + `authenticated-session-required`, never user-visible. The change is internal QA infrastructure per §17.3 ("It does not require vision citations for purely structural WPs (e.g., test harness wiring, build infrastructure)").

---

## Funding Surface Gate

**N/A.** This WP touches no §20.1 trigger surface — no global navigation, no Registry Viewer funding affordances, no profile/account funding attribution, no tournament-funding-channel integration, no user-visible funding copy. Internal QA infrastructure with operator-only data feed; no UI surface.

---

## API Catalog Update

**APPLIES.** §21.1 triggered: two new HTTP endpoints added to `apps/server`. Per D-11804 replace-whole-row merge semantics, the catalog update lands in the same commit as the route code. Rows:

- `POST /api/sweep/runs` — Auth: `guest` (shared-secret header per D-20702); Status closed-set: `{201, 400, 401, 409, 413, 500}`; Authorizing WP: `WP-209`; Cites: D-20701, D-20702, D-11504, D-11804
- `GET /api/sweep/latest` — Auth: `authenticated-session-required` (per D-9905 + D-10403 collapse); Status closed-set: `{200, 401, 500}`; Authorizing WP: `WP-209`; Cites: D-20701, D-20702, D-9905, D-10403, D-11504, D-11804
