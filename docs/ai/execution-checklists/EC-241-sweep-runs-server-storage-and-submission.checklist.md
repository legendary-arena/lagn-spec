# EC-241 — `sweep_runs` Server (Storage + Submission Endpoint + Operator Query Endpoint + Nightly GitHub Actions Invocation) (Execution Checklist)

**Source:** docs/ai/work-packets/WP-209-sweep-runs-server-storage-and-submission.md
**Layer:** Server (`apps/server/src/sweep/`) + Migration + Build tooling

## Before Starting
- [ ] WP-194 + WP-195 landed on `main`; `packages/game-engine/src/simulation/sweep.{runner,analyze}.ts` export the expected surface
- [ ] `apps/server/src/analytics/` module reachable as the pattern to mirror
- [ ] `data/migrations/017_create_analytics_events.sql` reachable as the migration shape to mirror
- [ ] `apps/server/src/server.mjs` carries `ANALYTICS_USER_ID_SALT` loud-fail-on-production guard (the precedent to mirror)
- [ ] `pnpm --filter @legendary-arena/server test` currently exits 0 (baseline before adding ≥ 18 new tests)
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
- Token comparison: `node:crypto.timingSafeEqual` (NOT `===`), preceded by `Buffer.byteLength` equality pre-check
- GitHub Actions cron: `0 7 * * *` (07:00 UTC)
- Recent-runs response cap: 30
- POST body size cap: 5 MB; cell-count cap: 10000
- POST status closed-set: `{201, 400, 401, 409, 413, 500}`
- GET status closed-set: `{200, 401, 500}`
- POST response envelope on success: `{ data: { runId: string, accepted: true } }`
- POST response envelope on conflict: `{ data: [], error: 'conflict' }` (status 409, existing row UNCHANGED)
- GET response envelope: `{ data: { latest: SweepRunSummary | null, recentRuns: readonly SweepRunSummary[] } }` (intentional `data: object` deviation from WP-205's `data: readonly T[]`; serves two semantically distinct payloads in one response)
- "Latest" ordering dimension: greatest `submitted_at` (NOT `started_at`)
- `recentRuns` SQL ordering: `ORDER BY submitted_at DESC LIMIT 30` (literal)
- GET query params: NONE accepted in v1; unknown query strings ignored, response shape unchanged
- `SweepAnomalyClass` 4-class taxonomy (per WP-195 D-19502, verified against engine source at sweep.analyze.ts:85 on 2026-06-04): `'endgame-reached' | 'not-endgame' | 'escaped-villain-cap' | 'fatal'`
- Engine analyzer entry point: `classifyManifestRecords(records, malformedLines)` — NOT `classifyManifest` (verified at sweep.analyze.ts:761)
- Render env var: `SWEEP_SUBMIT_TOKEN` `sync: false`
- `pnpm sweep:nightly` literal script name
- `runId` format (submission side): `<shortSha>-<isoTimestampUtc>` (e.g., `a1b2c3d4-20260604T070000Z`); short SHA from `git rev-parse --short HEAD`; timestamp compact-basic UTC ISO-8601
- Submission script exit-code map: `0` success; `2` config/git error; `3` sweep/analyze error; `4` network/POST error
- **Sweep CLI surface (`scripts/sweep-setup-matrix.mjs`, verified against the script source at lines 13-19 on 2026-06-04):** 6 required flags + 1 optional. NOT `--run-seed` + `--out-dir` (those were drafting-error placeholders; the actual surface is the 6-flag set below):
  - `--run-id <id>` (matches `/^[A-Za-z0-9._-]+$/`)
  - `--seed <seed-string>` (run-level seed; literal `nightly` per fixture)
  - `--setup <path>` (canonical EC-220 envelope JSON)
  - `--scheme-ids <path>` (JSON array of non-empty unique strings)
  - `--mastermind-ids <path>` (JSON array of non-empty unique strings)
  - `--policy random|heuristic` (no fallback; literal `random` per fixture)
  - optional `--max-cells <N>` (default 10000; OMITTED in v1 — 4-cell smoke is far under the default)
- **Sweep fixture paths (repo-relative, literal — locked per D-20704):**
  - `data/sweep-fixtures/setup.json`
  - `data/sweep-fixtures/scheme-ids.json`
  - `data/sweep-fixtures/mastermind-ids.json`
- **Sweep fixture content (locked per D-20704):**
  - `setup.json`: `{ "schemaVersion": "1.0", "playerCount": 1, "heroSelectionMode": "GROUP_STANDARD", "composition": { "schemeId": "core/midtown-bank-robbery", "mastermindId": "core/dr-doom", "villainGroupIds": ["core/skrulls"], "henchmanGroupIds": ["core/sentinel"], "heroDeckIds": ["core/spider-man", "core/hulk", "core/wolverine", "core/black-widow"], "bystandersCount": 1, "woundsCount": 30, "officersCount": 5, "sidekicksCount": 12 } }`
  - `scheme-ids.json`: `["core/legacy-virus-the", "core/midtown-bank-robbery"]`
  - `mastermind-ids.json`: `["core/dr-doom", "core/magneto"]`
- **Sweep axis cardinality (v1 lock per D-20704):** 2 schemes × 2 masterminds = exactly 4 cells per nightly run
- **`scripts/sweep-submit.mjs` invocation (literal — passed to `node scripts/sweep-setup-matrix.mjs`):**
  ```
  --run-id <runId> --seed nightly --setup data/sweep-fixtures/setup.json --scheme-ids data/sweep-fixtures/scheme-ids.json --mastermind-ids data/sweep-fixtures/mastermind-ids.json --policy random
  ```
- **Workflow build step:** workflow MUST run `pnpm -r build` between `pnpm install` and `pnpm sweep:nightly` to produce `packages/game-engine/dist/simulation/sweep.runner.js` (required per `scripts/sweep-setup-matrix.mjs:33` runtime import resolution)
- **Workflow triggers:** `schedule: - cron: '0 7 * * *'` AND `workflow_dispatch:` (operator on-demand testing without 24h wait)
- D-20701 + D-20702 + D-20704 reservations

### Locked Type Contracts (single-source — re-export from engine where applicable)

```ts
// SweepRunPayload — POST /api/sweep/runs request body
interface SweepRunPayload {
  runId: string                                    // non-empty, ≤ 128 chars
  startedAt: string                                // ISO-8601, parseable by `new Date(value)`
  cellCount: number                                // integer, 0 ≤ n ≤ 10000
  anomalyCounts: Record<SweepAnomalyClass, number> // keys ⊆ SWEEP_ANOMALY_CLASSES (imported from engine)
  manifestBlob?: unknown                           // optional; raw ManifestClassification JSON
}

// SweepRunSummary — GET /api/sweep/latest response row (EXCLUDES manifestBlob — forensic-only, never on dashboard read path)
interface SweepRunSummary {
  runId: string
  submittedAt: string  // ISO-8601 UTC
  startedAt: string    // ISO-8601 UTC
  cellCount: number
  anomalyCounts: Record<SweepAnomalyClass, number>
}
```

## Guardrails
- `SweepAnomalyClass` + `SWEEP_ANOMALY_CLASSES` imported from `@legendary-arena/game-engine` — NEVER redefined in `sweep.types.ts`; drift test asserts equality
- `Cache-Control: no-store` is the literal first statement of every handler body (POST happy + 4 POST error paths + GET handler) — D-11504 carry-forward
- POST token check uses `timingSafeEqual` and runs BEFORE any DB I/O — fail-fast on auth
- POST token check ALSO compares `Buffer.byteLength(headerToken)` and `Buffer.byteLength(envToken)` BEFORE invoking `timingSafeEqual` — unequal-length buffers throw `RangeError` in Node; pre-check returns 401 cleanly and keeps the constant-time path on equal-length inputs
- POST is idempotent by `run_id` PRIMARY KEY: duplicate returns 409, existing row UNCHANGED. No `ON CONFLICT DO UPDATE`; no `ON CONFLICT DO NOTHING` (the duplicate must be observable to the caller as 409)
- All SQL `INSERT` statements in `sweep.logic.ts` list columns explicitly: `INSERT INTO legendary.sweep_runs (run_id, started_at, cell_count, anomaly_counts, manifest_blob) VALUES ($1, $2, $3, $4, $5)`. Positional inserts are forbidden as defense against column-order migration drift. `submitted_at` is omitted (column DEFAULT `now()`)
- GET handler uses `SessionValidationErrorCode` collapse to `'unauthorized'` per D-10403 carry-forward — no enumeration of session-failure subtypes
- GET handler IGNORES query parameters in v1 — does NOT branch, filter, or paginate on `?limit`, `?since`, `?runId`, or anything else; response shape is identical regardless of query string
- `recentRuns` SQL uses `ORDER BY submitted_at DESC LIMIT 30` (literal); the BTREE index `sweep_runs_submitted_at_desc_idx` exists to serve this query path
- `latest` SQL is the row with the greatest `submitted_at` (NOT `started_at`); when the table is non-empty, `latest` MUST equal `recentRuns[0]`
- Migration is idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) per existing migration convention
- Server bootstrap guard: in production (`NODE_ENV === 'production'`), missing/empty `SWEEP_SUBMIT_TOKEN` loud-fails at startup (mirrors `ANALYTICS_USER_ID_SALT` pattern); in test/dev, fixed token + one-shot warning
- `scripts/sweep-submit.mjs` is ESM, uses `node:` prefix on built-ins, uses `node --env-file=.env` not Linux-only sourcing
- `scripts/sweep-submit.mjs` `runId` builder: `<shortSha>-<isoTimestampUtc>` where `shortSha = (await execFile('git', ['rev-parse', '--short', 'HEAD'])).stdout.trim()` and `isoTimestampUtc = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')`
- `scripts/sweep-submit.mjs` PRESERVES `sweep-output/<runId>/` on every non-zero exit path; cleanup runs ONLY on exit 0 after a confirmed `{ data: { runId, accepted: true } }` POST response
- API catalog update lands in the SAME commit as the route code per D-11804 replace-whole-row merge semantics — never a follow-up commit
- Tests use `node:test` + `node:assert`; locked `should_<behavior>_when_<condition>` naming

## Required `// why:` Comments
- `apps/server/src/sweep/sweep.routes.ts` at the `timingSafeEqual` call site: `// why (D-20702): constant-time comparison prevents timing-side-channel inference of the shared secret; === would leak via early-exit on first-byte mismatch.`
- `apps/server/src/sweep/sweep.routes.ts` at the `Buffer.byteLength` pre-check: `// why (D-20702): length-equality precheck is required because node:crypto.timingSafeEqual throws RangeError on unequal-length buffers; pre-check preserves both the 401 path and the constant-time guarantee on equal-length inputs.`
- `apps/server/src/sweep/sweep.routes.ts` at the `Cache-Control: no-store` first-statement: `// why (D-11504): first-statement lock ensures error paths cannot ship cacheable responses; downstream operator dashboard reads are explicitly non-cacheable.`
- `apps/server/src/sweep/sweep.routes.ts` at the GET envelope construction: `// why (WP-209): data: { latest, recentRuns } object envelope (NOT data: readonly T[]) because the endpoint serves two semantically distinct payloads — one latest summary + up to 30 recent summaries — in a single response.`
- `apps/server/src/sweep/sweep.routes.ts` at the 409 conflict branch: `// why (D-20701): duplicate run_id returns 409 with the existing row unchanged — no UPSERT semantics; idempotent retry from GitHub Actions must be observable to the caller, not silently swallowed.`
- `apps/server/src/sweep/sweep.logic.ts` at each INSERT statement: `// why (D-20701): explicit column list defends against future migration column-order drift; positional inserts are forbidden by the WP constraint.`
- `apps/server/src/sweep/sweep.logic.ts` at the `ORDER BY submitted_at DESC` clause: `// why (D-20701): "latest" is defined as greatest submitted_at, NOT started_at — back-fills and out-of-order submissions sort by submission wall-clock so the dashboard answers "what's the most recent thing we know about?".`
- `apps/server/src/server.mjs` at the `SWEEP_SUBMIT_TOKEN` loud-fail guard: `// why (D-20702): production startup fails fast if the shared secret is unset, preventing a deployed server from silently accepting all POST submissions (or no submissions at all if the GitHub Actions secret is also unset).`
- `scripts/sweep-submit.mjs` at the `runId` builder: `// why (WP-209): shortSha+timestamp format avoids 409 on legitimate retry of the same commit (manual operator re-run, nightly partial-failure retry); a bare sha would collide.`
- `scripts/sweep-submit.mjs` at the `rm -rf` cleanup: `// why (D-19403): sweep-output/ is gitignored and the durable record now lives in legendary.sweep_runs; the local artifact is forensic-only and pruned on successful submit to keep disk usage bounded across nightly runs. Cleanup runs ONLY on exit 0 — every non-zero path preserves the artifact for post-mortem.`

## Files to Produce
- `data/migrations/018_create_sweep_runs.sql` — **new** — table + 1 BTREE index
- `apps/server/src/sweep/sweep.types.ts` — **new** — payload + row interfaces aliasing engine types
- `apps/server/src/sweep/sweep.logic.ts` — **new** — 3 async functions: `insertSweepRun`, `fetchLatestSweepRun`, `fetchRecentSweepRuns`
- `apps/server/src/sweep/sweep.logic.test.ts` — **new** — ≥ 6 tests
- `apps/server/src/sweep/sweep.routes.ts` — **new** — POST + GET handlers + `registerSweepRoutes` export
- `apps/server/src/sweep/sweep.routes.test.ts` — **new** — ≥ 10 tests
- `apps/server/src/server.mjs` — **modified** — `registerSweepRoutes` call + `SWEEP_SUBMIT_TOKEN` loud-fail guard
- `scripts/sweep-submit.mjs` — **new** — sweep + classify + POST + cleanup wrapper
- `data/sweep-fixtures/setup.json` — **new** — canonical EC-220 envelope (locked content per Locked Values)
- `data/sweep-fixtures/scheme-ids.json` — **new** — `["core/legacy-virus-the", "core/midtown-bank-robbery"]`
- `data/sweep-fixtures/mastermind-ids.json` — **new** — `["core/dr-doom", "core/magneto"]`
- `package.json` — **modified** — add `"sweep:nightly"` root script
- `.github/workflows/sweep-nightly.yml` — **new** — cron + workflow_dispatch workflow
- `render.yaml` — **modified** — add `SWEEP_SUBMIT_TOKEN` `sync: false` declaration
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — 2 new rows per D-11804
- `docs/ai/DECISIONS.md` — **modified** — D-20701 + D-20702 + D-20704 reserved (verbatim block in EC §DECISIONS.md Verbatim Block below)
- `docs/ai/STATUS.md` — **modified** — Done entry
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — Ready → Done
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — Ready → Done

## After Completing
- [ ] `pnpm --filter @legendary-arena/server test` exits 0; net-new test count ≥ 18
- [ ] `pnpm -r build` exits 0
- [ ] `grep -nE "type SweepAnomalyClass|const SWEEP_ANOMALY_CLASSES" apps/server/src/sweep/sweep.types.ts` returns 0 matches (engine import is sole source)
- [ ] `grep -nE "timingSafeEqual" apps/server/src/sweep/sweep.routes.ts` returns ≥ 1
- [ ] `grep -nE "Buffer.byteLength" apps/server/src/sweep/sweep.routes.ts` returns ≥ 1 (token-length precheck)
- [ ] `grep -nE "Cache-Control.*no-store" apps/server/src/sweep/sweep.routes.ts | wc -l` returns ≥ 4
- [ ] `grep -nE "INSERT INTO legendary\.sweep_runs \(run_id, started_at, cell_count, anomaly_counts, manifest_blob\)" apps/server/src/sweep/sweep.logic.ts` returns ≥ 1
- [ ] `grep -nE "INSERT INTO legendary\.sweep_runs VALUES" apps/server/src/sweep/sweep.logic.ts` returns 0 (no positional inserts)
- [ ] `grep -nE "ORDER BY submitted_at DESC LIMIT 30" apps/server/src/sweep/sweep.logic.ts` returns ≥ 1
- [ ] `grep -nE "ON CONFLICT" apps/server/src/sweep/sweep.logic.ts` returns 0 (no UPSERT, no DO NOTHING — duplicate must surface as 409)
- [ ] `grep -E "cron:.*0 7" .github/workflows/sweep-nightly.yml` matches `    - cron: '0 7 * * *'`
- [ ] `grep -E '"sweep:nightly"' package.json` matches `"sweep:nightly": "node scripts/sweep-submit.mjs"`
- [ ] `grep -E "SWEEP_SUBMIT_TOKEN" render.yaml` returns 1 line with `sync: false`
- [ ] `grep -nE "POST.*/api/sweep/runs|GET.*/api/sweep/latest" docs/ai/REFERENCE/api-endpoints.md` returns 2 matches
- [ ] `grep -nE "rev-parse --short HEAD" scripts/sweep-submit.mjs` returns ≥ 1 (runId builder)
- [ ] `grep -nE "workflow_dispatch:" .github/workflows/sweep-nightly.yml` returns ≥ 1 (on-demand trigger present)
- [ ] `grep -nE "pnpm -r build" .github/workflows/sweep-nightly.yml` returns ≥ 1 (engine dist required for the sweep CLI's runtime import)
- [ ] `grep -nE "--policy random" scripts/sweep-submit.mjs` returns ≥ 1
- [ ] `grep -nE "data/sweep-fixtures/setup.json|data/sweep-fixtures/scheme-ids.json|data/sweep-fixtures/mastermind-ids.json" scripts/sweep-submit.mjs | wc -l` returns 3 (all three fixture paths referenced from the submission script)
- [ ] Fixture content verification: `node -e "const a=require('./data/sweep-fixtures/scheme-ids.json'); console.assert(JSON.stringify(a)==='[\"core/legacy-virus-the\",\"core/midtown-bank-robbery\"]')"` exits 0
- [ ] Fixture content verification: `node -e "const a=require('./data/sweep-fixtures/mastermind-ids.json'); console.assert(JSON.stringify(a)==='[\"core/dr-doom\",\"core/magneto\"]')"` exits 0
- [ ] Fixture content verification: `node -e "const s=require('./data/sweep-fixtures/setup.json'); console.assert(s.schemaVersion==='1.0' && s.playerCount===1 && s.composition.villainGroupIds[0]==='core/skrulls')"` exits 0
- [ ] Smoke invocation (executor verifies during execution): `pnpm -r build && pnpm sweep:nightly` against a local server produces exactly 4 cells in `sweep-output/<runId>/manifest.jsonl` and a 201 response with `{ data: { runId, accepted: true } }`
- [ ] D-20701 + D-20702 + D-20704 active in DECISIONS.md byte-identical to verbatim block below
- [ ] WORK_INDEX + EC_INDEX rows flipped to Done
- [ ] Commit prefix: `EC-241:`

## Common Failure Smells
- Engine type duplicated in `sweep.types.ts` → drift risk; import from `@legendary-arena/game-engine` instead
- `===` used for token check → timing-side-channel exposure; switch to `timingSafeEqual`
- `timingSafeEqual` called WITHOUT a length-equality precheck → `RangeError` thrown on short/long token submissions, 500 leaks instead of 401; add `Buffer.byteLength(a) === Buffer.byteLength(b)` short-circuit
- `Cache-Control` missing on any handler path → first-statement lock broken; refactor handler to put it before any other statement
- API catalog updated in a separate commit → D-11804 violation; squash into the same commit
- POST handler accepts unknown anomaly classes → drift test fails; validator must reject keys outside `SWEEP_ANOMALY_CLASSES`
- `INSERT INTO ... VALUES (...)` without column list → positional-insert violation; future column-order migration silently corrupts data; specify columns explicitly
- `INSERT INTO ... ON CONFLICT DO UPDATE` or `DO NOTHING` → idempotency contract violation; duplicate must surface as 409 with existing row UNCHANGED
- `ORDER BY started_at` on the `/latest` SQL → wrong ordering dimension; ordering MUST be `submitted_at DESC` so back-fills and out-of-order submissions sort by submission wall-clock
- GET handler branches on query parameters → contract creep; v1 ignores all query strings, response shape invariant
- `data: readonly T[]` envelope used on GET → contract drift; the locked shape is `data: { latest: SweepRunSummary | null, recentRuns }`
- `runId` built as bare `git rev-parse --short HEAD` (no timestamp suffix) → legitimate same-commit re-runs collide on PK and 409, even though the operator intent is a fresh submission
- `scripts/sweep-submit.mjs` `rm -rf`'s `sweep-output/<runId>/` on a failure path → forensic artifact destroyed; cleanup must run ONLY after a confirmed `{ accepted: true }` response
- `scripts/sweep-submit.mjs` exits 0 after a non-2xx POST or after a sweep-runner failure → silent partial success; exit must be non-zero with the documented `{2, 3, 4}` code mapping
- Migration runs but doesn't include the BTREE index → query performance regression; verify with `\d legendary.sweep_runs` in psql
- GitHub Actions cron differs from `0 7 * * *` → operator wake-time invariant broken; align to the literal
- `SWEEP_SUBMIT_TOKEN` declared with `sync: true` in render.yaml → secret bleeds across services; must be `sync: false`

## DECISIONS.md Verbatim Block (PS-1 transcription convention)

### D-20701 — `sweep_runs` Storage Shape Lock

**D-20701 — `sweep_runs` storage shape lock.** `legendary.sweep_runs` is the durable record for sweep classification summaries (WP-194 runner + WP-195 analyzer outputs). Closed 6-column schema: `run_id text PRIMARY KEY`, `submitted_at timestamptz NOT NULL DEFAULT now()`, `started_at timestamptz NOT NULL`, `cell_count int NOT NULL CHECK (cell_count >= 0 AND cell_count <= 10000)`, `anomaly_counts jsonb NOT NULL` (shape: `Record<SweepAnomalyClass, number>` per WP-195 D-19502), `manifest_blob jsonb NULL` (raw `ManifestClassification` for forensic re-analyze; nullable). One BTREE index on `submitted_at DESC` for the latest-runs query path. `run_id` PRIMARY KEY enforces idempotent submission: duplicate POST returns 409 Conflict and the existing row is BYTE-IDENTICAL pre/post — no `ON CONFLICT DO UPDATE` (no UPSERT), no `ON CONFLICT DO NOTHING` (duplicate must be observable to the caller). All `INSERT` statements MUST list columns explicitly (`(run_id, started_at, cell_count, anomaly_counts, manifest_blob)`); positional inserts forbidden as defense against future column-order migration drift. `submitted_at` omitted from INSERT column lists — column DEFAULT `now()` populates server-side. "Latest" ordering dimension is greatest `submitted_at` (NOT `started_at`); `recentRuns` SQL is `ORDER BY submitted_at DESC LIMIT 30` (literal). Cell-count CHECK constraint is defense-in-depth against malformed payloads; route validator rejects with 413 BEFORE the INSERT. `anomaly_counts` JSONB key validation lives at the route validator layer (CHECK constraint cannot enforce JSONB key sets in pure SQL); drift test asserts validator behavior matches `SWEEP_ANOMALY_CLASSES` canonical array byte-identical. Local `sweep-output/<run-id>/` directory remains the ephemeral working artifact per D-19403; the durable record is this table. Retention is unlimited in v1 (~1.5 GB/year worst-case is inside free-tier headroom); a successor D-NNNN may introduce TTL if the trend warrants. Future schema migrations are additive — column removal or type change requires a successor D-NNNN entry.

### D-20702 — Sweep Submission Auth Posture

**D-20702 — Sweep submission auth posture.** `POST /api/sweep/runs` is `guest` per D-9905 with **shared-secret header** auth: `X-Sweep-Token` MUST equal `process.env.SWEEP_SUBMIT_TOKEN` byte-for-byte via `node:crypto.timingSafeEqual` (`===` is forbidden due to timing-side-channel exposure). Length-equality precheck via `Buffer.byteLength` is REQUIRED before invoking `timingSafeEqual` — Node's `timingSafeEqual` throws `RangeError` on unequal-length buffers; the pre-check preserves both the 401 path and the constant-time guarantee on equal-length inputs. Mismatch returns 401 `{ data: [], error: 'unauthorized' }` BEFORE any DB I/O. Token is sourced from Render env (`sync: false`, operator-set in dashboard) on the server; GitHub Actions secret `SWEEP_SUBMIT_TOKEN` on the submitter side. Production server loud-fails at startup if the env var is unset (mirrors `ANALYTICS_USER_ID_SALT` D-20502 carry-forward). `GET /api/sweep/latest` is `authenticated-session-required` per D-9905 with `SessionValidationErrorCode` collapse to `'unauthorized'` per D-10403 carry-forward. Response envelope on GET: `{ data: { latest: SweepRunSummary | null, recentRuns: readonly SweepRunSummary[] } }` — `data` is an OBJECT (not the WP-205 `data: readonly T[]` array shape) because the endpoint serves two semantically distinct payloads in one response. `SweepRunSummary` excludes `manifestBlob` (forensic-only, never on dashboard read path). GET MUST NOT accept query parameters in v1 (no `?limit`, `?since`, `?runId`); unknown query strings ignored, response shape invariant. Both endpoints set `Cache-Control: no-store` as the literal first statement per D-11504 carry-forward. POST cell-count cap 10000; body size cap 5 MB; raw `manifest_blob` accepted but optional (nightly runs include it for forensic; smaller submissions may omit). Submission script (`scripts/sweep-submit.mjs`) exit-code mapping is `{0: success, 2: config/git error, 3: sweep/analyze error, 4: network/POST error}`; cleanup of `sweep-output/<runId>/` runs ONLY on exit 0 — every non-zero path preserves the local artifact for forensic. `runId` submission format: `<shortSha>-<isoTimestampUtc>` so legitimate same-commit re-runs produce distinct PKs.

### D-20704 — Sweep Nightly Axis Cardinality Lock (v1 = 2×2 Smoke)

**D-20704 — Sweep nightly axis cardinality lock (v1 = 2×2 smoke).** The nightly sweep runs exactly 4 cells per run — the cross-product of 2 schemes × 2 masterminds. Axis content is committed at the repo-relative paths `data/sweep-fixtures/setup.json` (canonical EC-220 envelope), `data/sweep-fixtures/scheme-ids.json` (literal `["core/legacy-virus-the", "core/midtown-bank-robbery"]`), and `data/sweep-fixtures/mastermind-ids.json` (literal `["core/dr-doom", "core/magneto"]`). Policy is locked to `random` (deterministic per-cell seeds via WP-194 D-19402's `${runSeed}::cell:${schemeId}:${mastermindId}` convention); seed is the literal string `nightly`. The 4-cell smoke catches "engine fundamentally broken" in < 60s of wall-clock per run on GitHub Actions free-tier `ubuntu-latest` runners — the QA-loop intent ("did anything fundamentally break since yesterday?") is regression detection, not exhaustive matrix coverage. Richer axes (full ~32×32 corpus, per-scheme team filters, cohort masterminds, heuristic-vs-random policy comparison) are explicitly deferred to a future hardening WP; daily cadence at 1024 cells would cost ~hours/night and overshoot the v1 intent. Cardinality changes require a successor D-NNNN entry. Fixture paths are passed verbatim to `scripts/sweep-setup-matrix.mjs` as `--setup` / `--scheme-ids` / `--mastermind-ids`; the GitHub Actions workflow runs `pnpm -r build` BEFORE `pnpm sweep:nightly` to produce `packages/game-engine/dist/simulation/sweep.runner.js` (required per `scripts/sweep-setup-matrix.mjs:33` runtime import).
