# EC-241 — `sweep_runs` Server (Storage + Submission Endpoint + Operator Query Endpoint + Nightly GitHub Actions Invocation) (Execution Checklist)

**Source:** docs/ai/work-packets/WP-209-sweep-runs-server-storage-and-submission.md
**Layer:** Server (`apps/server/src/sweep/`) + Migration + Build tooling

## Before Starting
- [ ] WP-194 + WP-195 landed on `main`; `packages/game-engine/src/simulation/sweep.{runner,analyze}.ts` export the expected surface
- [ ] `apps/server/src/analytics/` module reachable as the pattern to mirror
- [ ] `data/migrations/017_create_analytics_events.sql` reachable as the migration shape to mirror
- [ ] `apps/server/src/server.mjs` carries `ANALYTICS_USER_ID_SALT` loud-fail-on-production guard (the precedent to mirror)
- [ ] `pnpm --filter @legendary-arena/server test` currently exits 0 (baseline before adding ≥ 16 new tests)
- [ ] Working tree clean except for this WP

## Locked Values (do not re-derive)
- Schema columns (exact order): `run_id`, `submitted_at`, `started_at`, `cell_count`, `anomaly_counts`, `manifest_blob`
- Schema types:
  ```sql
  run_id        text PRIMARY KEY,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz NOT NULL,
  cell_count    int NOT NULL CHECK (cell_count >= 0 AND cell_count <= 10000),
  anomaly_counts jsonb NOT NULL,
  manifest_blob jsonb NULL
  ```
- Index: `CREATE INDEX sweep_runs_submitted_at_desc_idx ON legendary.sweep_runs (submitted_at DESC)`
- POST URL: `/api/sweep/runs`
- GET URL: `/api/sweep/latest`
- Shared-secret header: `X-Sweep-Token` (no Bearer prefix; no Authorization reuse)
- Token comparison: `node:crypto.timingSafeEqual` (NOT `===`)
- GitHub Actions cron: `0 7 * * *` (07:00 UTC)
- Recent-runs response cap: 30
- POST body size cap: 5 MB; cell-count cap: 10000
- POST status closed-set: `{201, 400, 401, 409, 413, 500}`
- GET status closed-set: `{200, 401, 500}`
- POST response envelope on success: `{ data: { runId: string, accepted: true } }`
- GET response envelope: `{ data: { latest: SweepRunSummary, recentRuns: readonly SweepRunSummary[] } }` (intentional `data: object` deviation from WP-205's `data: readonly T[]`; serves two semantically distinct payloads in one response)
- `SweepAnomalyClass` 4-class taxonomy (per WP-195 D-19502): `'fatal' | 'not-endgame' | 'escaped-villain-cap' | 'normal'`
- Render env var: `SWEEP_SUBMIT_TOKEN` `sync: false`
- `pnpm sweep:nightly` literal script name
- D-20701 + D-20702 reservations

## Guardrails
- `SweepAnomalyClass` + `SWEEP_ANOMALY_CLASSES` imported from `@legendary-arena/game-engine` — NEVER redefined in `sweep.types.ts`; drift test asserts equality
- `Cache-Control: no-store` is the literal first statement of every handler body (POST happy + 4 POST error paths + GET handler) — D-11504 carry-forward
- POST token check uses `timingSafeEqual` and runs BEFORE any DB I/O — fail-fast on auth
- GET handler uses `SessionValidationErrorCode` collapse to `'unauthorized'` per D-10403 carry-forward — no enumeration of session-failure subtypes
- Migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) per existing migration convention
- Server bootstrap guard: in production (`NODE_ENV === 'production'`), missing/empty `SWEEP_SUBMIT_TOKEN` loud-fails at startup (mirrors `ANALYTICS_USER_ID_SALT` pattern); in test/dev, fixed token + one-shot warning
- `scripts/sweep-submit.mjs` is ESM, uses `node:` prefix on built-ins, uses `node --env-file=.env` not Linux-only sourcing
- API catalog update lands in the SAME commit as the route code per D-11804 replace-whole-row merge semantics — never a follow-up commit
- Tests use `node:test` + `node:assert`; locked `should_<behavior>_when_<condition>` naming

## Required `// why:` Comments
- `apps/server/src/sweep/sweep.routes.ts` at the `timingSafeEqual` call site: `// why (D-20702): constant-time comparison prevents timing-side-channel inference of the shared secret; === would leak via early-exit on first-byte mismatch.`
- `apps/server/src/sweep/sweep.routes.ts` at the `Cache-Control: no-store` first-statement: `// why (D-11504): first-statement lock ensures error paths cannot ship cacheable responses; downstream operator dashboard reads are explicitly non-cacheable.`
- `apps/server/src/sweep/sweep.routes.ts` at the GET envelope construction: `// why (WP-209): data: { latest, recentRuns } object envelope (NOT data: readonly T[]) because the endpoint serves two semantically distinct payloads — one latest summary + up to 30 recent summaries — in a single response.`
- `apps/server/src/server.mjs` at the `SWEEP_SUBMIT_TOKEN` loud-fail guard: `// why (D-20702): production startup fails fast if the shared secret is unset, preventing a deployed server from silently accepting all POST submissions (or no submissions at all if the GitHub Actions secret is also unset).`
- `scripts/sweep-submit.mjs` at the `rm -rf` cleanup: `// why (D-19403): sweep-output/ is gitignored and the durable record now lives in legendary.sweep_runs; the local artifact is forensic-only and pruned on successful submit to keep disk usage bounded across nightly runs.`

## Files to Produce
- `data/migrations/018_create_sweep_runs.sql` — **new** — table + 1 BTREE index
- `apps/server/src/sweep/sweep.types.ts` — **new** — payload + row interfaces aliasing engine types
- `apps/server/src/sweep/sweep.logic.ts` — **new** — 3 async functions: `insertSweepRun`, `fetchLatestSweepRun`, `fetchRecentSweepRuns`
- `apps/server/src/sweep/sweep.logic.test.ts` — **new** — ≥ 6 tests
- `apps/server/src/sweep/sweep.routes.ts` — **new** — POST + GET handlers + `registerSweepRoutes` export
- `apps/server/src/sweep/sweep.routes.test.ts` — **new** — ≥ 10 tests
- `apps/server/src/server.mjs` — **modified** — `registerSweepRoutes` call + `SWEEP_SUBMIT_TOKEN` loud-fail guard
- `scripts/sweep-submit.mjs` — **new** — sweep + classify + POST + cleanup wrapper
- `package.json` — **modified** — add `"sweep:nightly"` root script
- `.github/workflows/sweep-nightly.yml` — **new** — cron workflow
- `render.yaml` — **modified** — add `SWEEP_SUBMIT_TOKEN` `sync: false` declaration
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — 2 new rows per D-11804
- `docs/ai/DECISIONS.md` — **modified** — D-20701 + D-20702 reserved (verbatim block in EC §DECISIONS.md Verbatim Block below)
- `docs/ai/STATUS.md` — **modified** — Done entry
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — Ready → Done
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — Ready → Done

## After Completing
- [ ] `pnpm --filter @legendary-arena/server test` exits 0; net-new test count ≥ 16
- [ ] `pnpm -r build` exits 0
- [ ] `grep -nE "type SweepAnomalyClass|const SWEEP_ANOMALY_CLASSES" apps/server/src/sweep/sweep.types.ts` returns 0 matches (engine import is sole source)
- [ ] `grep -nE "timingSafeEqual" apps/server/src/sweep/sweep.routes.ts` returns ≥ 1
- [ ] `grep -nE "Cache-Control.*no-store" apps/server/src/sweep/sweep.routes.ts | wc -l` returns ≥ 4
- [ ] `grep -E "cron:.*0 7" .github/workflows/sweep-nightly.yml` matches `    - cron: '0 7 * * *'`
- [ ] `grep -E '"sweep:nightly"' package.json` matches `"sweep:nightly": "node scripts/sweep-submit.mjs"`
- [ ] `grep -E "SWEEP_SUBMIT_TOKEN" render.yaml` returns 1 line with `sync: false`
- [ ] `grep -nE "POST.*/api/sweep/runs|GET.*/api/sweep/latest" docs/ai/REFERENCE/api-endpoints.md` returns 2 matches
- [ ] D-20701 + D-20702 active in DECISIONS.md byte-identical to verbatim block below
- [ ] WORK_INDEX + EC_INDEX rows flipped to Done
- [ ] Commit prefix: `EC-241:`

## Common Failure Smells
- Engine type duplicated in `sweep.types.ts` → drift risk; import from `@legendary-arena/game-engine` instead
- `===` used for token check → timing-side-channel exposure; switch to `timingSafeEqual`
- `Cache-Control` missing on any handler path → first-statement lock broken; refactor handler to put it before any other statement
- API catalog updated in a separate commit → D-11804 violation; squash into the same commit
- POST handler accepts unknown anomaly classes → drift test fails; validator must reject keys outside `SWEEP_ANOMALY_CLASSES`
- `data: readonly T[]` envelope used on GET → contract drift; the locked shape is `data: { latest, recentRuns }`
- Migration runs but doesn't include the BTREE index → query performance regression; verify with `\d legendary.sweep_runs` in psql
- GitHub Actions cron differs from `0 7 * * *` → operator wake-time invariant broken; align to the literal
- `SWEEP_SUBMIT_TOKEN` declared with `sync: true` in render.yaml → secret bleeds across services; must be `sync: false`

## DECISIONS.md Verbatim Block (PS-1 transcription convention)

### D-20701 — `sweep_runs` Storage Shape Lock

**D-20701 — `sweep_runs` storage shape lock.** `legendary.sweep_runs` is the durable record for sweep classification summaries (WP-194 runner + WP-195 analyzer outputs). Closed 6-column schema: `run_id text PRIMARY KEY`, `submitted_at timestamptz NOT NULL DEFAULT now()`, `started_at timestamptz NOT NULL`, `cell_count int NOT NULL CHECK (cell_count >= 0 AND cell_count <= 10000)`, `anomaly_counts jsonb NOT NULL` (shape: `Record<SweepAnomalyClass, number>` per WP-195 D-19502), `manifest_blob jsonb NULL` (raw `ManifestClassification` for forensic re-analyze; nullable). One BTREE index on `submitted_at DESC` for the latest-runs query path. `run_id` PRIMARY KEY enforces idempotent submission (duplicate POST returns 409 Conflict). Cell-count CHECK constraint is defense-in-depth against malformed payloads; route validator rejects with 413 BEFORE the INSERT. `anomaly_counts` JSONB key validation lives at the route validator layer (CHECK constraint cannot enforce JSONB key sets in pure SQL); drift test asserts validator behavior matches `SWEEP_ANOMALY_CLASSES` canonical array byte-identical. Local `sweep-output/<run-id>/` directory remains the ephemeral working artifact per D-19403; the durable record is this table. Future schema migrations are additive — column removal or type change requires a successor D-NNNN entry.

### D-20702 — Sweep Submission Auth Posture

**D-20702 — Sweep submission auth posture.** `POST /api/sweep/runs` is `guest` per D-9905 with **shared-secret header** auth: `X-Sweep-Token` MUST equal `process.env.SWEEP_SUBMIT_TOKEN` byte-for-byte via `node:crypto.timingSafeEqual` (`===` is forbidden due to timing-side-channel exposure). Mismatch returns 401 `{ data: [], error: 'unauthorized' }` BEFORE any DB I/O. Token is sourced from Render env (`sync: false`, operator-set in dashboard) on the server; GitHub Actions secret `SWEEP_SUBMIT_TOKEN` on the submitter side. Production server loud-fails at startup if the env var is unset (mirrors `ANALYTICS_USER_ID_SALT` D-20502 carry-forward). `GET /api/sweep/latest` is `authenticated-session-required` per D-9905 with `SessionValidationErrorCode` collapse to `'unauthorized'` per D-10403 carry-forward. Response envelope on GET: `{ data: { latest: SweepRunSummary, recentRuns: readonly SweepRunSummary[] } }` — `data` is an OBJECT (not the WP-205 `data: readonly T[]` array shape) because the endpoint serves two semantically distinct payloads in one response. Both endpoints set `Cache-Control: no-store` as the literal first statement per D-11504 carry-forward. POST cell-count cap 10000; body size cap 5 MB; raw `manifest_blob` accepted but optional (nightly runs include it for forensic; smaller submissions may omit).
