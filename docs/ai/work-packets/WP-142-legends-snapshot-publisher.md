# WP-142 — Legends Snapshot Publisher

**Status:** Draft (skeleton — not yet linted, not yet added to WORK_INDEX.md)
**Primary Layer:** Server / Persistence
**Dependencies:** WP-[NNN — leaderboards baseline that produced `apps/server/src/leaderboards/`], WP-[NNN — R2 client wiring if a prior packet established it; otherwise this packet establishes it]

> **Skeleton notes (delete on promotion to Ready):**
> - WP number is provisional. Confirm free slot in WORK_INDEX.md before promoting.
> - Lint gate (`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`) must pass before this packet leaves Draft.
> - DECISIONS entries below are placeholders (D-PUB-1 … D-PUB-5). Renumber in DECISIONS.md sequence at promotion time.
> - Acceptance criteria, verification commands, and "Files Expected to Change" are partial. Tighten before execution.

---

## Session Context

The leaderboard logic in `apps/server/src/leaderboards/leaderboard.logic.ts`
already computes ranking data on demand for authenticated `/api/leaderboards`
requests; this packet wraps that logic in a scheduled publisher that writes
public, no-auth JSON snapshots to R2 so the public scoreboard
(`legends.legendary-arena.com`, WP-143) can read from CDN cache without
touching the prod Postgres.

---

## Goal

After this packet, the `apps/server` process publishes leaderboard JSON
snapshots to a public-read R2 prefix (`legends/v1/*`) on a fixed cadence.
The snapshots are deterministic projections of the existing leaderboard
data, contain no PII beyond the already-public player handle, and include a
manifest with `generatedAt` so consumers can detect staleness. The publisher
runs as a background timer inside the existing Render web service (no new
service), survives transient R2 errors without crashing the server, and
exposes a `/health/legends-publisher` endpoint reporting last-success timestamp.

---

## Assumes

- `apps/server/src/leaderboards/leaderboard.logic.ts` exports a pure (or
  pure-modulo-DB) function that returns ranking data given a query window.
  Confirm the exact signature before writing.
- `apps/server` already has a configured Postgres connection pool.
- An R2 bucket exists (or is provisioned in this packet) with:
  - A public-read binding for the `legends/v1/*` prefix
  - S3-compatible credentials available to `apps/server` via env vars
- `pnpm --filter @legendary-arena/server build` exits 0 against `main`.
- `pnpm --filter @legendary-arena/server test` exits 0 against `main`.

If any of the above is false, this packet is **BLOCKED** until verified.

---

## Context (Read First)

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — confirm the
  publisher belongs in `apps/server` (it wires DB → R2; it is not gameplay).
- `docs/ai/ARCHITECTURE.md §Persistence Boundaries` — `G` is never persisted;
  snapshots are derived records, not save-state. This applies here.
- `apps/server/src/leaderboards/leaderboard.logic.ts` — read fully before
  modifying. The publisher consumes its outputs; it must not change them.
- `apps/server/src/leaderboards/leaderboard.types.ts` — types the publisher's
  output schemas extend.
- `render.yaml` — the publisher's env vars (R2 credentials, cadence override)
  must be added here, with `sync: false` for secrets.
- `scripts/upload-themes-to-r2.mjs` — existing R2 upload pattern (rclone-based,
  for build-time uploads). The publisher uses S3-compatible API at runtime
  instead; this file is reference for bucket naming conventions only.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rules 6 (`// why:` comments), 11
  (full-sentence error messages), 13 (ESM only).
- `docs/ai/REFERENCE/api-endpoints.md` — per D-11804, the new
  `/health/legends-publisher` endpoint must be added here in the same commit.

---

## Non-Negotiable Constraints

**Engine-wide (always apply):**
- ESM only, Node v22+
- `node:` prefix on all Node.js built-in imports
- Test files use `.test.ts` extension
- Full-sentence error messages

**Packet-specific:**
- The publisher MUST NOT block the HTTP server's main event loop on R2
  failures. R2 timeouts must be bounded and recoverable.
- The publisher MUST NOT crash the server process on any failure mode. A
  failed snapshot is logged + reflected in `/health/legends-publisher`; the
  next interval retries.
- Snapshots MUST be idempotent: writing the same input twice produces
  byte-identical output (sort orders explicit, no `Date.now()` in payload
  bodies — only in the manifest).
- Snapshot payloads MUST contain only public player data. No email, no
  internal user IDs, no Hanko subject IDs. The handle field is the only
  player identifier.
- The publisher MUST acquire a DB read lock pattern that does not contend
  with hot match traffic. Prefer read-replica or `SET TRANSACTION READ ONLY`.
- Bucket prefix is locked: `legends/v1/`. Schema version bump → `legends/v2/`,
  never silent format change inside `v1/`.
- Snapshot retention: at least the latest of each board, plus the previous
  N days under `legends/v1/archive/<YYYY-MM-DD>/`. N defined in D-PUB-3.

**Session protocol:**
- If the leaderboard logic's exported signature is unclear, stop and ask.
  Do not invent a new query function; reuse what exists.

**Locked contract values:**
- Bucket prefix: `legends/v1/`
- Manifest path: `legends/v1/manifest.json`
- Manifest fields: `{ generatedAt: string (ISO 8601), schemaVersion: 1, boards: string[] }`

---

## Debuggability & Diagnostics

- Each publish run logs a single structured line: run id, board name, row
  count, byte count, R2 PUT latency, success/failure.
- The `/health/legends-publisher` endpoint returns
  `{ lastSuccessAt: string | null, lastErrorAt: string | null, lastErrorMessage: string | null, intervalMs: number }`.
- Publish runs are reproducible: given the same DB state and clock, the
  output JSON is byte-identical (modulo the manifest's `generatedAt`).
- A failed publish leaves the previous snapshot intact in R2. Never partial-write.

---

## Scope (In)

### A) Snapshot logic (pure, testable without R2)
- **`apps/server/src/legends/legends.types.ts`** — new:
  - `LegendsSnapshot` shape (board name, generatedAt, rows: ranked entries)
  - `LegendsManifest` shape
  - One named type per board (overall / weekly / by-scheme / recent-achievements / now-playing)
- **`apps/server/src/legends/legends.logic.ts`** — new:
  - `buildOverallSnapshot(rawLeaderboard): LegendsSnapshot` and siblings
  - Pure functions; no I/O. Take in the existing leaderboard.logic outputs
    and project them to the public schema (handle + score + rank + minimal
    context fields).

### B) Publisher (I/O layer)
- **`apps/server/src/legends/legends.publisher.ts`** — new:
  - `publishAllBoards(): Promise<PublishResult>` — calls each builder, writes
    each result + the manifest to R2, returns per-board outcomes.
  - Uses an S3-compatible R2 client (whichever is the project's standard;
    confirm before importing — do not add a new dependency speculatively).

### C) Scheduler (timer wrapper)
- **`apps/server/src/legends/legends.scheduler.ts`** — new:
  - `startLegendsPublisher({ intervalMs }): { stop(): void }`
  - Wires `setInterval` over `publishAllBoards`, swallowing errors into the
    health endpoint state.
  - Started from `apps/server/src/index.mjs` only when env var
    `LEGENDS_PUBLISHER_ENABLED=true` is set (so test/dev runs don't write to prod R2).

### D) Health endpoint
- **`apps/server/src/legends/legends.routes.ts`** — new:
  - `GET /health/legends-publisher` — returns publisher state, no auth.

### E) Configuration
- **`render.yaml`** — modified:
  - Add `R2_LEGENDS_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
    `R2_ACCOUNT_ID` (`sync: false`)
  - Add `LEGENDS_PUBLISHER_ENABLED` (default `"false"` in non-prod)
  - Add `LEGENDS_PUBLISHER_INTERVAL_MS` (default per D-PUB-1)

### F) API catalog update (per D-11804)
- **`docs/ai/REFERENCE/api-endpoints.md`** — modified:
  - Add `/health/legends-publisher` row, replacing the whole row in one edit.

### G) Tests
- `legends.logic.test.ts` — pure projection tests, no R2 mocked at this layer.
- `legends.publisher.test.ts` — uses a stub R2 client; verifies error paths
  do not throw and do not partial-write the manifest if a board fails.
- `legends.scheduler.test.ts` — verifies start/stop semantics + that error
  state is captured for the health endpoint.

---

## Out of Scope

- The public scoreboard SPA itself — that is WP-143.
- Any new gameplay logic, scoring formula change, or leaderboard ranking
  algorithm change. The publisher is a projection; the algorithm is locked.
- Anti-cheat or score validation. If a score is in the leaderboard table, it
  is published. Score-correction lives upstream.
- Running the publisher on a separate worker dyno. Decision is to run inline
  in the existing Render service (D-PUB-2).
- "While I'm here" refactors to `apps/server/src/leaderboards/`.

---

## Files Expected to Change

- `apps/server/src/legends/legends.types.ts` — **new**
- `apps/server/src/legends/legends.logic.ts` — **new**
- `apps/server/src/legends/legends.publisher.ts` — **new**
- `apps/server/src/legends/legends.scheduler.ts` — **new**
- `apps/server/src/legends/legends.routes.ts` — **new**
- `apps/server/src/legends/legends.logic.test.ts` — **new**
- `apps/server/src/legends/legends.publisher.test.ts` — **new**
- `apps/server/src/legends/legends.scheduler.test.ts` — **new**
- `apps/server/src/index.mjs` — **modified** — wire scheduler start + routes
- `render.yaml` — **modified** — env vars
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — add health endpoint row
- `docs/ai/DECISIONS.md` — **modified** — add D-PUB-1..D-PUB-5
- `docs/ops/domains.json` — **modified** — flip `legends.` `state` to `live` once deployed (this happens post-merge, not in the WP body)

No other files may be modified.

---

## Acceptance Criteria

### Snapshot logic
- [ ] `legends.logic.ts` exports one builder per board listed in `legends.types.ts`
- [ ] Each builder is pure (no I/O), takes typed input, returns typed output
- [ ] Snapshot row count matches the input ranking length for every board
- [ ] No `Date.now()` in any builder body (only the publisher stamps the manifest)

### Publisher
- [ ] `publishAllBoards` writes each board to `legends/v1/<board>.json`
- [ ] Manifest is written **last**; if any board fails, manifest is not updated
- [ ] R2 errors do not throw out of `publishAllBoards`; they are returned in `PublishResult`
- [ ] Two consecutive publishes against the same DB state produce byte-identical board files

### Scheduler & health
- [ ] Scheduler honors `LEGENDS_PUBLISHER_ENABLED=false` by not starting
- [ ] `/health/legends-publisher` returns `lastSuccessAt: null` before any successful run
- [ ] `/health/legends-publisher` requires no auth

### Tests
- [ ] `pnpm --filter @legendary-arena/server test` exits 0
- [ ] No test imports a real R2 SDK; all R2 interactions are stubbed
- [ ] Test files do not import from `boardgame.io`

### Scope enforcement
- [ ] No files outside `## Files Expected to Change` were modified
      (`git diff --name-only`)

---

## Verification Steps

```pwsh
# Step 1 — build
pnpm --filter @legendary-arena/server build
# Expected: exits 0

# Step 2 — tests
pnpm --filter @legendary-arena/server test
# Expected: TAP green, all suites pass

# Step 3 — confirm publisher does not import boardgame.io
Select-String -Path "apps\server\src\legends\*.ts" -Pattern "boardgame\.io"
# Expected: no output

# Step 4 — confirm no Math.random in publisher
Select-String -Path "apps\server\src\legends\*.ts" -Pattern "Math\.random"
# Expected: no output

# Step 5 — confirm bucket prefix is locked
Select-String -Path "apps\server\src\legends\*.ts" -Pattern "legends/v1/"
# Expected: at least one occurrence; no occurrence of `legends/v2/` or other variants

# Step 6 — confirm health endpoint registered
Select-String -Path "apps\server\src\legends\legends.routes.ts" -Pattern "/health/legends-publisher"
# Expected: one occurrence

# Step 7 — only files in scope changed
git diff --name-only
# Expected: matches "Files Expected to Change" exactly
```

---

## Decisions to Record (DECISIONS.md)

- **D-PUB-1** — Default publish cadence: `LEGENDS_PUBLISHER_INTERVAL_MS = 300_000` (5 min). Trade-off: shorter interval → fresher scoreboard but more DB load; 5 min is well under the cache-TTL threshold for casual viewers and well over the publish-time budget.
- **D-PUB-2** — Publisher runs **inline** in the existing Render web service, not as a separate worker. Trade-off: simpler ops, shared health/restart lifecycle; cost is that publish cadence shares CPU with HTTP handlers (mitigated by 5-min cadence and small payloads).
- **D-PUB-3** — Snapshot retention: latest + 30 days of daily archives at `legends/v1/archive/<YYYY-MM-DD>/`. Older archives are deleted by a separate housekeeping run (or R2 lifecycle rule, decision deferred).
- **D-PUB-4** — Manifest is the **transactional commit point**. Boards are written first, manifest last; consumers reading a stale manifest see a consistent prior snapshot, never a half-written one.
- **D-PUB-5** — Public payload contains only `handle`, `score`, `rank`, and per-board minimal context (e.g., `schemeId` for by-scheme boards). Email, Hanko subject ID, and internal user ID are never written.

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] `pnpm --filter @legendary-arena/server build` exits 0
- [ ] `pnpm --filter @legendary-arena/server test` exits 0
- [ ] Publisher manually verified against staging R2 (one successful `publishAllBoards` run, snapshot files visible in bucket, manifest `generatedAt` updated)
- [ ] `/health/legends-publisher` reachable from staging without auth
- [ ] `docs/ai/STATUS.md` updated — what `apps/server` can now do that it could not before
- [ ] `docs/ai/DECISIONS.md` updated — D-PUB-1..D-PUB-5 (renumbered to next free D- slots)
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated — `/health/legends-publisher` row added
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-142 (or assigned slot) checked off with today's date
