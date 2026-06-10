# WP-231 — Scheduled Inspector Triage (LLM Agent → `inspection_reports` Storage + Nightly CI Invocation)

**Status:** Draft
**Primary Layer:** Server (`apps/server/src/inspection/`) + Migration (`data/migrations/`) + Build/CI tooling (`scripts/inspection-fetch.mjs`, `scripts/inspection-submit.mjs`, `scripts/inspection-triage-prompt.md`, `.github/workflows/inspection-nightly.yml`, root `package.json` scripts)
**Dependencies:** WP-209 (sweep server storage + endpoints) ✅, WP-210 (sweep composable) ✅, WP-230 (Pipeline page sweep integration) ✅, WP-115 (Postgres bootstrap) ✅, WP-133 + WP-205 (route+logic+types module pattern) ✅, WP-118 (API catalog) ✅

---

## Session Context

WP-209 landed the nightly sweep: `legendary.sweep_runs` storage, `POST /api/sweep/runs` (shared-secret CI submission), `GET /api/sweep/latest` (operator dashboard, session-gated), and the `sweep-nightly.yml` GitHub Actions cron (07:00 UTC, 2×2 smoke per D-20704). The classified `manifest_blob` is stored but deliberately kept off the dashboard read path (forensic-only; `GET /api/sweep/runs/:runId` blob retrieval was explicitly deferred per WP-209 §Out of Scope). WP-230 wired the sweep counts into the Pipeline page's agent lanes, but the "triage" is generic — the page shows anomaly counts, not a severity-classified, routed set of findings.

This packet lands the **first step of the agent triage pipeline** (WP-231 → 232 → 233): a scheduled LLM Inspector that reads each nightly sweep, applies the Inspector severity rubric (`apps/dashboard/docs/code-checks-and-balances.md` + the `agent-inspector` skill), and files a structured `InspectionReport` (P0/P1/P2 findings, each routed to Builder or Architect, plus a deterministic PASS/FAIL verdict) into durable storage. This is the **server + CI half** only; the paired dashboard surface that renders triage status per finding is deferred to a follow-up WP (mirrors WP-209 → WP-210).

Baseline: `origin/main @ cbc4ddb` (2026-06-09).

---

## Goal

After this session, a new `inspection-nightly.yml` GitHub Actions workflow runs after each nightly sweep completes. It fetches the latest sweep run **including its forensic `manifestBlob`** via a new shared-secret `GET /api/sweep/runs/latest` endpoint, runs a headless Claude Inspector triage step (the `agent-inspector` rubric applied to the sweep anomalies) that emits a structured `inspection-report.json`, validates that report (shape + the deterministic verdict rule), and `POST`s it to a new `POST /api/inspection/reports` endpoint backed by a new `legendary.inspection_reports` table. A session-gated `GET /api/inspection/latest` endpoint exposes the latest report for the future dashboard surface. The sweep run is triaged once per nightly cron; the Inspector's findings become a durable, queryable record instead of an operator eyeballing raw counts.

---

## Assumes

- WP-209 complete. Specifically:
  - `legendary.sweep_runs` exists with columns `run_id`, `submitted_at`, `started_at`, `cell_count`, `anomaly_counts` (jsonb), `manifest_blob` (jsonb, nullable) per D-20701
  - `apps/server/src/sweep/sweep.logic.ts` exports `fetchLatestSweepRun` / `fetchRecentSweepRuns`; `sweep.routes.ts` exports `registerSweepRoutes(router, { pool, sweepSubmitToken })` and is invoked once from `apps/server/src/server.mjs`
  - `apps/server/src/sweep/sweep.types.ts` re-exports `SweepAnomalyClass` + `SWEEP_ANOMALY_CLASSES` (4-class closed taxonomy `'endgame-reached' | 'not-endgame' | 'escaped-villain-cap' | 'fatal'` per D-19502) from `@legendary-arena/game-engine`
  - `X-Sweep-Token` shared-secret auth + `node:crypto.timingSafeEqual` length-pre-check pattern is established (D-20702); `SWEEP_SUBMIT_TOKEN` is a Render `sync: false` env var
  - `.github/workflows/sweep-nightly.yml` exists with workflow name `Sweep Nightly`, cron `0 7 * * *`, `workflow_dispatch`, and reads `SWEEP_SUBMIT_TOKEN` + `API_BASE_URL` from Actions secrets
- WP-205 complete. `apps/server/src/analytics/` models the `{ data, error }` envelope, `Cache-Control: no-store` first-statement lock (D-11504), and `SessionValidationErrorCode` collapse to `'unauthorized'` (D-10403) for session-gated GETs
- WP-118 complete. `docs/ai/REFERENCE/api-endpoints.md` exists with D-11804 replace-whole-row semantics, the Status closed set `{ Wired | Shipped-but-unwired | Library-only | Pending }`, and the Auth closed set `{ guest | handle-required | authenticated-session-required }` (D-9905)
- The `agent-inspector` skill's rubric — P0/P1/P2 severity tags, the deterministic verdict rule, Builder-vs-Architect issue attribution — is available as a **design reference** at `.claude/skills/agent-inspector/SKILL.md`. The WP's `scripts/inspection-triage-prompt.md` (committed by this WP) encodes that rubric **self-contained**, so CI execution does NOT depend on the skill file being present in the runner checkout. (The four `agent-*` skill dirs are currently untracked on the working tree; committing them is a separate INFRA concern, not a WP-231 runtime dependency.)
- Headless Claude is available in GitHub Actions via the official `anthropics/claude-code-action` with an `ANTHROPIC_API_KEY` Actions secret (no new npm dependency is added to any `package.json`)
- `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — the server may consume the engine setup-tooling surface; route handlers touch no engine runtime. The inspection module mirrors the sweep/analytics module shape and stays inside the server layer.
- `.claude/rules/architecture.md` §Layer Boundary + §Server Layer — the server wires and stores; it does not decide gameplay. The triage agent is CI tooling, not engine code.
- `apps/server/src/sweep/sweep.routes.ts` + `sweep.logic.ts` + `sweep.types.ts` — read entirely. This WP mirrors the module for `inspection/` and **additively** extends `sweep/` with the new `GET /api/sweep/runs/latest` read endpoint (realizes the WP-209-deferred blob endpoint for the CI consumer).
- `apps/server/src/analytics/analytics.routes.ts` — the `Cache-Control: no-store` first-statement lock (D-11504) and `SessionValidationErrorCode` collapse (D-10403) the session-gated GET reuses verbatim.
- `data/migrations/018_create_sweep_runs.sql` — models the schema closure (CHECK constraints, BTREE index) the new `019_create_inspection_reports.sql` mirrors.
- `.claude/skills/agent-inspector/SKILL.md` — the severity taxonomy (P0/P1/P2), the deterministic verdict rule (any open P0 or P1 → FAIL; only P2 → PASS), and issue attribution (spec/ambiguity → Architect; code-vs-clear-spec → Builder). The triage prompt encodes this rubric for sweep anomalies.
- `packages/game-engine/src/simulation/sweep.analyze.ts` lines 70-250 — the `SweepAnomalyClass` union + `SWEEP_ANOMALY_CLASSES` canonical array; the triage prompt references these class names so findings map to a known anomaly class.
- `docs/ai/DECISIONS.md` D-20701, D-20702, D-20704 (sweep server), D-9905 (auth closed set), D-10403 (session error collapse), D-11504 (no-store), D-11804 (catalog) — anchor decisions this WP carries forward. Do not re-derive them.
- `docs/ai/REFERENCE/00.6-code-style.md` — Rules 4 / 6 / 9 / 11 / 13 / 14 apply.
- `docs/ai/REFERENCE/00.1-master-coordination-prompt.md` — non-negotiable structural constraints.
- `docs/ai/REFERENCE/api-endpoints.md §Wired → Server-Registered Routes` — the catalog rows this WP appends to (3 new endpoints).
- `.github/workflows/sweep-nightly.yml` — the bootstrap + secrets pattern the new `inspection-nightly.yml` mirrors, plus the `workflow_run` chaining target (`workflows: ["Sweep Nightly"]`).

---

## Scope (In)

### A) Storage

- Migration `data/migrations/019_create_inspection_reports.sql` creating `legendary.inspection_reports` with the closed 8-column schema locked in §Locked Contract Values + 1 BTREE index.

### B) Server module (`apps/server/src/inspection/`)

- `inspection.types.ts` — `InspectionFinding`, `InspectionReportPayload` (POST body), `InspectionReportSummary` (GET row), `InspectionLatestEnvelope` interfaces. `InspectionSeverity = 'P0' | 'P1' | 'P2'` and `InspectionRoute = 'Builder' | 'Architect'` as named union types with matching canonical readonly arrays (`INSPECTION_SEVERITIES`, `INSPECTION_ROUTES`) + a bidirectional drift test.
- `inspection.logic.ts` — 3 pure async functions: `insertInspectionReport`, `fetchLatestInspectionReport`, `fetchRecentInspectionReports`. Plus a pure `deriveVerdict(findings)` helper encoding the deterministic verdict rule, used by both the route validator and (imported by) the submit script.
- `inspection.logic.test.ts` — ≥ 6 node:test cases (insert round-trip, latest ordering, verdict derivation truth table, severity/route drift gates).
- `inspection.routes.ts` — `POST /api/inspection/reports` (shared-secret) + `GET /api/inspection/latest` (session-gated) handlers + `registerInspectionRoutes(router, { pool, inspectionSubmitToken })` export.
- `inspection.routes.test.ts` — ≥ 12 node:test cases (auth pre-check, client-verdict-ignored/recomputed, client-counts-ignored/recomputed, severity/route validation, idempotent report_id, no-store gate, session 401 collapse, query-param ignore).
- `apps/server/src/auth/validateSharedSecret.ts` (+ `validateSharedSecret.test.ts`) — the single shared-secret validator (`Buffer.byteLength` length pre-check + `node:crypto.timingSafeEqual`), consumed by the inspection POST, the new sweep-read, and the refactored existing sweep POST. Eliminates the per-route duplication so there is one bug surface as the agent pipeline (Builder/Architect, WP-232) expands.

### C) Sweep module extension (CI read path)

- `apps/server/src/sweep/sweep.logic.ts` — **modified**: add `fetchLatestSweepRunWithBlob(pool)` returning the latest row including `manifest_blob`.
- `apps/server/src/sweep/sweep.routes.ts` — **modified**: add `GET /api/sweep/runs/latest` (shared-secret `X-Sweep-Token`, returns the full latest run + blob for the CI triage consumer). Additive; the existing POST + `GET /api/sweep/latest` handlers are byte-unchanged.
- `apps/server/src/sweep/sweep.routes.test.ts` — **modified**: ≥ 3 net-new cases for the read endpoint (auth pre-check, blob present, empty-table null).

### D) Server bootstrap

- `apps/server/src/server.mjs` — **modified**: one `registerInspectionRoutes(...)` call next to `registerSweepRoutes(...)`; one `INSPECTION_SUBMIT_TOKEN` loud-fail-on-production env guard mirroring the existing `SWEEP_SUBMIT_TOKEN` / `ANALYTICS_USER_ID_SALT` precedent.

### E) CI tooling

- `scripts/inspection-fetch.mjs` — new: fetches `GET /api/sweep/runs/latest` with the `X-Sweep-Token` header, writes `inspection-work/sweep-input.json`; exit-code discipline mirroring `sweep-submit.mjs`.
- `scripts/inspection-triage-prompt.md` — new: the triage prompt the headless agent runs (reads `sweep-input.json`, applies the `agent-inspector` rubric to the anomalies, writes `inspection-work/inspection-report.json` in the locked `InspectionReportPayload` shape).
- `scripts/inspection-submit.mjs` — new: reads the agent-produced `inspection-report.json`, validates its shape + the deterministic verdict rule (`deriveVerdict` agreement), `POST`s it to `${API_BASE_URL}/api/inspection/reports` with the `X-Inspection-Token` header, and `rm -rf`s `inspection-work/` ONLY on POST success.
- `scripts/inspection-submit.test.ts` — new: ≥ 5 node:test cases for the script's pure validation/verdict-agreement helpers + the documented exit-code mapping.
- `package.json` — **modified**: add `"inspection:fetch": "node scripts/inspection-fetch.mjs"` and `"inspection:submit": "node scripts/inspection-submit.mjs"` to root `scripts`.
- `.github/workflows/inspection-nightly.yml` — new: `on: workflow_run` (after `Sweep Nightly` completes successfully) + `workflow_dispatch`; steps fetch → triage (headless Claude) → submit; reads `ANTHROPIC_API_KEY`, `INSPECTION_SUBMIT_TOKEN`, `SWEEP_SUBMIT_TOKEN`, `API_BASE_URL` from Actions secrets.

### F) Config + catalog

- `render.yaml` — **modified**: add `INSPECTION_SUBMIT_TOKEN` `sync: false` env-var declaration.
- `.env.example` — **modified**: document `INSPECTION_SUBMIT_TOKEN` (server) + a note that `ANTHROPIC_API_KEY` is CI-only.
- `docs/ai/REFERENCE/api-endpoints.md` — **modified**: 3 new rows (`POST /api/inspection/reports`, `GET /api/inspection/latest`, `GET /api/sweep/runs/latest`) per D-11804 replace-whole-row semantics.
- Reserve D-23101 (inspection_reports storage + report contract shape lock), D-23102 (LLM triage posture: nondeterministic findings + deterministic server-enforced verdict + cost carve-out), D-23103 (CI sweep-blob read endpoint — realizes WP-209's deferred blob endpoint under shared-secret auth).

---

## Out of Scope

- **The dashboard surface that renders triage status per finding** — that is the paired follow-up WP (mirrors WP-209 → WP-210). This WP stops at the `GET /api/inspection/latest` endpoint; no `apps/dashboard/**` file is touched.
- **The agent handoff chain (Inspector → Builder → Architect)** — that is WP-232. This WP only files the Inspector's report; nothing reads it to attempt fixes.
- **Closed-loop re-sweep verification** — that is WP-233.
- **Changing the sweep cadence, axis cardinality, or the `sweep_runs` schema** — the 2×2 smoke (D-20704) and the 6-column sweep table (D-20701) are unchanged; this WP only adds a read endpoint over the existing table.
- **Anomaly-class taxonomy changes** — `SWEEP_ANOMALY_CLASSES` (D-19502) is consumed unchanged; the triage prompt references the class names, it does not redefine them.
- **Deterministic-classifier triage** — the operator selected an LLM agent; a code-only severity classifier is explicitly not this WP (it may become a fallback in a later WP if API cost or quality warrants).
- **Retention / pruning of historical `inspection_reports` rows** — v1 keeps every row; a TTL/cap is a future WP if disk-usage trend warrants.
- **Pagination / filtering on `GET /api/inspection/latest`** — v1 returns the latest report + last 30 summaries in one response; query params are ignored, not rejected.
- **Per-finding deep-linking to a sweep cell's full replay** — the report references a `cellId` string only; replay retrieval is out of scope.
- Refactors, cleanups, or "while I'm here" improvements.

---

## Files Expected to Change

- `data/migrations/019_create_inspection_reports.sql` — new (table + 1 BTREE index)
- `apps/server/src/inspection/inspection.types.ts` — new (payload + row + envelope interfaces; severity/route unions + canonical arrays)
- `apps/server/src/inspection/inspection.logic.ts` — new (3 async DB functions + `deriveVerdict`)
- `apps/server/src/inspection/inspection.logic.test.ts` — new (≥ 6 tests)
- `apps/server/src/inspection/inspection.routes.ts` — new (POST + GET handlers + `registerInspectionRoutes` export)
- `apps/server/src/inspection/inspection.routes.test.ts` — new (≥ 12 tests)
- `apps/server/src/auth/validateSharedSecret.ts` — new (the single `validateSharedSecret(headerValue, envToken)` helper: `Buffer.byteLength` length pre-check + `node:crypto.timingSafeEqual`)
- `apps/server/src/auth/validateSharedSecret.test.ts` — new (≥ 4 tests: equal-byte match, length-mismatch short-circuit, empty/undefined header, wrong token)
- `apps/server/src/sweep/sweep.logic.ts` — modified (add `fetchLatestSweepRunWithBlob`)
- `apps/server/src/sweep/sweep.routes.ts` — modified (add `GET /api/sweep/runs/latest`; refactor the existing POST's inline token check to call `validateSharedSecret` — behavior-preserving)
- `apps/server/src/sweep/sweep.routes.test.ts` — modified (≥ 3 net-new read-endpoint tests; existing POST tests stay green through the helper refactor)
- `apps/server/src/server.mjs` — modified (register inspection routes + `INSPECTION_SUBMIT_TOKEN` guard)
- `scripts/inspection-fetch.mjs` — new (fetch latest sweep run + blob → input file; exports `isTriageableSweepInput` guard)
- `scripts/inspection-triage-prompt.md` — new (the headless-agent triage prompt; demands strict JSON)
- `scripts/inspection-submit.mjs` — new (validate agent report → POST → cleanup; bare `JSON.parse`)
- `scripts/inspection-submit.test.ts` — new (≥ 6 cases covering both scripts' pure helpers: report shape, verdict agreement, strict-JSON rejection, `isTriageableSweepInput`, exit-code mapping)
- `package.json` — modified (2 new root scripts)
- `.github/workflows/inspection-nightly.yml` — new (workflow_run + workflow_dispatch)
- `render.yaml` — modified (`INSPECTION_SUBMIT_TOKEN` `sync: false`)
- `.env.example` — modified (document the new server var + CI note)
- `docs/ai/REFERENCE/api-endpoints.md` — modified (3 new catalog rows per D-11804)
- `docs/ai/DECISIONS.md` — modified (D-23101 + D-23102 + D-23103 reserved → Active at execution close)
- `docs/ai/STATUS.md` — modified (Done entry)
- `docs/ai/work-packets/WORK_INDEX.md` — modified (WP-231 row → Done)
- `docs/ai/execution-checklists/EC_INDEX.md` — modified (EC-263 → Done)

25 files total (13 new + 7 modified source + 5 governance). This exceeds the §5 ~8-file guidance; the bundle is justified for the same reason as WP-209 (its precedent): the migration + types + logic + routes + bootstrap + the shared auth helper + the additive sweep-read + the CI scripts + workflow form a single coherent server+CI surface with no value in partial landing. The dashboard half is already split out (deferred to a follow-up WP).

---

## Locked Type Contracts

These shapes are the byte-identical contract between `scripts/inspection-submit.mjs`, the route handlers, and the future dashboard consumer. Author them once in `apps/server/src/inspection/inspection.types.ts`; consume verbatim everywhere else.

### `POST /api/inspection/reports` — Request Body

```ts
interface InspectionFinding {
  severity: InspectionSeverity        // 'P0' | 'P1' | 'P2'
  anomalyClass: string                // a SWEEP_ANOMALY_CLASSES member name, OR 'meta' for run-level findings (kept as opaque string — the server does not import the engine union)
  cellId: string | null               // sweep cell id (scheme×mastermind), or null for run-level findings
  description: string                  // full-sentence finding (≤ 1000 chars)
  route: InspectionRoute              // 'Builder' | 'Architect'
}

interface InspectionReportPayload {
  reportId: string                    // non-empty, ≤ 160 chars; form `<sweepRunId>-<generatedAtIsoCompact>`
  sweepRunId: string                  // non-empty, ≤ 128 chars; the triaged sweep run
  generatedAt: string                 // ISO-8601, parseable by `new Date(value)`
  verdict: 'PASS' | 'FAIL'            // agent's self-applied verdict; the SERVER IGNORES it and recomputes (D-23101). The submit script checks agreement as a fail-fast gate (exit 3); the server never trusts or compares it.
  findings: InspectionFinding[]       // 0..500 findings; each validated against the shape below
}
```

**Derived fields are server-authoritative (D-23101).** `verdict` and the stored
`p0_count` / `p1_count` / `p2_count` are ALWAYS recomputed from `findings` at
insert time. Any client-supplied derived values (the `verdict` field, or
`*_count` fields if a caller includes them) are IGNORED — not trusted, not
compared, not stored. The server does NOT return 400 on a verdict/count
disagreement; it silently recomputes and stores the authoritative values. The
only verdict *comparison* in the system is the submit script's fail-fast gate
(§Script Exit Codes, exit 3), which catches a self-inconsistent agent before
it POSTs — it is not server input validation.

Validator failure-mode table (evaluated in this order; first failure short-circuits — no DB I/O until all pass):

| Check | Failure status |
|---|---|
| `X-Inspection-Token` present and length-equal to env token | 401 |
| `X-Inspection-Token` constant-time byte-equal to `process.env.INSPECTION_SUBMIT_TOKEN` (`timingSafeEqual`) | 401 |
| Body parseable as JSON and ≤ 5 MB | 413 / 400 |
| `reportId` non-empty string ≤ 160 chars | 400 |
| `sweepRunId` non-empty string ≤ 128 chars | 400 |
| `generatedAt` parseable ISO-8601 | 400 |
| `findings` array, length ≤ 500; each finding's `severity` ∈ `INSPECTION_SEVERITIES`, `route` ∈ `INSPECTION_ROUTES`, `description` non-empty ≤ 1000 chars, `cellId` string-or-null | 400 |
| `reportId` not already present (PK) | 409 |

> No `verdict`/count rows appear in this table by design: derived fields are
> never validated against the client — the server recomputes them and ignores
> whatever the client sent (D-23101). A `verdict` that disagrees with the
> findings is not a 400; it is silently corrected to the recomputed value.

### `GET /api/inspection/latest` — Response Envelope

```ts
interface InspectionReportSummary {
  reportId: string
  sweepRunId: string
  submittedAt: string     // ISO-8601 (UTC)
  generatedAt: string     // ISO-8601 (UTC)
  verdict: 'PASS' | 'FAIL'
  counts: { p0: number, p1: number, p2: number }
  findings: readonly InspectionFinding[]
}

{
  data: {
    latest: InspectionReportSummary | null,   // greatest submitted_at; null only pre-first-run
    recentReports: readonly InspectionReportSummary[]   // submitted_at DESC, length ≤ 30
  }
}
```

### `GET /api/sweep/runs/latest` — Response Envelope (CI read; shared-secret)

```ts
{
  data: {
    run: {
      runId: string,
      submittedAt: string,
      startedAt: string,
      cellCount: number,
      anomalyCounts: Record<string, number>,
      manifestBlob: unknown | null     // the forensic ManifestClassification JSON the triage agent reasons over
    } | null                            // null only if sweep_runs is empty
  }
}
```

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — the server touches no randomness; the engine sweep PRNG is upstream and unchanged
- Never throw inside boardgame.io move functions — N/A (no moves touched)
- Never persist `G`, `ctx`, or any runtime state — N/A
- `G` must be JSON-serializable — N/A
- ESM only, Node v22+ — all changes use `import`/`export`, never `require()`; `.mjs` scripts use built-in `fetch` and `node --env-file=.env`, never Linux-only sourcing
- `node:` prefix on all Node built-in imports (`node:test`, `node:assert`, `node:crypto`, `node:fs/promises`)
- Test files use `.test.ts` — never `.test.mjs`
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`
- Full file contents for every new or modified file — no diffs, no snippets

**Packet-specific:**
- `POST /api/inspection/reports` is `guest` per D-9905 with **shared-secret header** auth: `X-Inspection-Token` MUST equal `process.env.INSPECTION_SUBMIT_TOKEN` byte-for-byte using `node:crypto.timingSafeEqual`, with a `Buffer.byteLength` length pre-check before `timingSafeEqual` (Node throws `RangeError` on unequal-length buffers — same pattern as WP-209's `X-Sweep-Token`). Mismatch → 401 `{ data: [], error: 'unauthorized' }` before any DB I/O.
- `GET /api/inspection/latest` is `authenticated-session-required` per D-9905 with `SessionValidationErrorCode` collapse to `'unauthorized'` per D-10403 carry-forward.
- `GET /api/sweep/runs/latest` is `guest` per D-9905 with the **same `X-Sweep-Token` shared-secret** auth as `POST /api/sweep/runs` (the CI triage consumer reuses the sweep token family — no third secret). Returns the latest run + `manifestBlob`; this realizes WP-209's explicitly-deferred blob endpoint, scoped to the CI consumer.
- **The server is the SOLE authority for ALL derived fields (D-23101).** On insert the server MUST recompute `verdict` via `deriveVerdict(findings)` (`FAIL` iff any finding is `P0` or `P1`, else `PASS` — the `agent-inspector` rule) AND recompute `p0_count` / `p1_count` / `p2_count` from `findings`. Any client-supplied derived values (a `verdict` field, or `*_count` fields) are IGNORED: not trusted, not compared, not stored. The server does NOT return 400 on a verdict/count disagreement — it silently recomputes and stores the authoritative values. This permanently eliminates the dual-source-of-truth risk: dashboard analytics never depend on a CI-script-computed value. (The fail-fast verdict-agreement check lives one layer up in the submit script — §Script Exit Codes — so a self-inconsistent agent fails the nightly before POSTing; the server's ignore-and-recompute is the durable defense.)
- **Shared-secret validation MUST go through one helper.** Implement `validateSharedSecret(headerValue, envToken)` (the `Buffer.byteLength` length pre-check, then `node:crypto.timingSafeEqual`) once in `apps/server/src/auth/validateSharedSecret.ts`; the existing sweep `POST`, the new `GET /api/sweep/runs/latest`, and the new inspection `POST` all call it. No route file re-implements the check inline — this is the third call site, so the abstraction is warranted per 00.6 "duplicate first, abstract on the third copy." Refactoring the existing sweep `POST` to the helper MUST preserve its behavior byte-for-byte (WP-209's sweep route tests stay green); this is the one and only behavioral change permitted to the existing sweep handlers.
- **The triage prompt MUST demand STRICT JSON.** `scripts/inspection-triage-prompt.md` MUST instruct the agent to emit JSON only — no prose, no markdown fences, no commentary — parseable by `JSON.parse` without preprocessing. `scripts/inspection-submit.mjs` MUST parse the agent file with a bare `JSON.parse` (no fence-stripping, no regex extraction); a non-JSON or fenced output fails fast (exit 2). Brittle parse-recovery hacks are forbidden — the contract is enforced at the boundary, not patched around.
- **The forensic blob is required triage input.** `GET /api/sweep/runs/latest` returns `manifestBlob: null` when the column is null (the schema permits it). `scripts/inspection-fetch.mjs` MUST treat a null `run` OR a null `run.manifestBlob` as a hard failure (exit 3) — the LLM triage path needs the blob; triaging counts alone is the deterministic-classifier path explicitly out of scope here.
- **The triage findings are LLM-generated and NOT deterministic / NOT replay-faithful** (D-23102). This is an intentional carve-out from the engine's determinism-first posture, scoped to this internal QA *meta* surface: the report reasons *about* sweep outputs, it changes no game logic, RNG, replay, or scoring. Re-running the triage on the same sweep MAY produce different finding text/counts; only the verdict rule is deterministic. Tests validate report *shape* and verdict *consistency*, never finding *content*.
- Anomaly class names are treated as **opaque strings** on the server inspection surface — `inspection.types.ts` MUST NOT import `SweepAnomalyClass` from the engine (`anomalyClass` is plain `string`). The triage prompt references the class names; the server stores whatever string the agent emits.
- `inspection.logic.ts` `INSERT` MUST list columns explicitly (no positional inserts), mirroring D-20701's defense against column-order drift. `submitted_at` is omitted (column DEFAULT `now()`).
- `Cache-Control: no-store` first-statement lock (D-11504 carry-forward) — every handler body sets the header as its literal first statement.
- POST body size cap 5 MB; `findings` length cap 500 (reject 413 / 400 respectively). (why: the 500 cap bounds unbounded LLM output and protects the Postgres row size + dashboard rendering performance; a triage emitting > 500 distinct findings signals a runaway agent, not a real result.)
- `GET` endpoints MUST NOT accept or interpret query parameters in v1 — unknown query strings are ignored, not rejected.
- Status-code domains locked: `POST /api/inspection/reports` `{201, 400, 401, 409, 413, 500}`; `GET /api/inspection/latest` `{200, 401, 500}`; `GET /api/sweep/runs/latest` `{200, 401, 500}`.
- **No new npm dependency** in any `package.json`. The headless agent runs via the official `anthropics/claude-code-action` GitHub Action (CI-provided); the scripts use Node built-ins only.
- `scripts/inspection-submit.mjs` MUST exit non-zero on any failure and MUST `rm -rf inspection-work/` ONLY on confirmed POST success (preserve the work dir on every failure path for forensic re-run — same discipline as `sweep-submit.mjs`).
- API catalog update obligation (D-11804) — 3 new rows under `## Wired → Server-Registered Routes`, replace-whole-row semantics; each row cites the authorizing decisions.

**Session protocol:**
- If `apps/server/src/sweep/` has been refactored since this WP was drafted: read the new shape and mirror it; do not duplicate a stale pattern.
- If `apps/server/src/analytics/` no longer exhibits the `Cache-Control` / session-collapse pattern this WP carries forward: STOP and report (the carry-forward decisions may have shifted).
- If the `agent-inspector` skill's severity taxonomy or verdict rule has changed from P0/P1/P2 + "any P0/P1 → FAIL": STOP and reconcile the triage prompt + `deriveVerdict` against the new rule.
- If `render.yaml` no longer carries `SWEEP_SUBMIT_TOKEN` as the `sync: false` precedent: STOP and ask.
- Never invent endpoint shapes, field names, or token names not locked here.

**Locked contract values:**
- Schema columns (exact order in CREATE TABLE) — 9 columns, no more: `report_id`, `sweep_run_id`, `submitted_at`, `generated_at`, `verdict`, `p0_count`, `p1_count`, `p2_count`, `findings`. The three count columns are stored denormalized for cheap dashboard reads; they are derived from `findings` at insert time and a test asserts they equal the per-severity counts.
- Schema types: `report_id text PRIMARY KEY`, `sweep_run_id text NOT NULL`, `submitted_at timestamptz NOT NULL DEFAULT now()`, `generated_at timestamptz NOT NULL`, `verdict text NOT NULL CHECK (verdict IN ('PASS','FAIL'))`, `p0_count int NOT NULL CHECK (p0_count >= 0)`, `p1_count int NOT NULL CHECK (p1_count >= 0)`, `p2_count int NOT NULL CHECK (p2_count >= 0)`, `findings jsonb NOT NULL`
- BTREE index: `CREATE INDEX inspection_reports_submitted_at_desc_idx ON legendary.inspection_reports (submitted_at DESC)`
- POST URL: `/api/inspection/reports` (literal)
- GET URL: `/api/inspection/latest` (literal)
- Sweep CI-read URL: `/api/sweep/runs/latest` (literal)
- Inspection shared-secret header: `X-Inspection-Token` (literal; no `Bearer`/`Authorization` reuse)
- Recent-reports response cap: 30
- `reportId` format: `<sweepRunId>-<generatedAtIsoCompact>`. The `sweepRunId` already embeds the sweep's own timestamp (per WP-209: `<shortSha>-<sweepIsoCompact>`), so the full `reportId` legitimately carries two time components — the sweep's and the triage's. Example: `a1b2c3d4-20260610T071500Z-20260610T071530Z` = sweepRunId `a1b2c3d4-20260610T071500Z` + generatedAt `20260610T071530Z`. A re-triage of the same sweep run gets a new `generatedAt` → a new `reportId` → a distinct row (no 409)
- Workflow filename: `.github/workflows/inspection-nightly.yml`; workflow name `Inspection Nightly`
- Workflow trigger: `on: { workflow_run: { workflows: ["Sweep Nightly"], types: [completed] }, workflow_dispatch: {} }`; the `workflow_run` job guards `if: ${{ github.event.workflow_run.conclusion == 'success' || github.event_name == 'workflow_dispatch' }}`
- Triage model: `claude-sonnet-4-6` (cost-appropriate for structured triage; Opus reserved for a later WP if triage depth proves insufficient — documented rationale, not an arbitrary cap)
- Render env var: `INSPECTION_SUBMIT_TOKEN` `sync: false`
- "Latest" ordering dimension: greatest `submitted_at` (NOT `generated_at`); `recentReports` SQL `ORDER BY submitted_at DESC LIMIT 30`
- D-23101: inspection_reports storage + report contract shape lock
- D-23102: LLM triage posture (nondeterministic findings, server-enforced deterministic verdict, per-run API cost carve-out)
- D-23103: CI sweep-blob read endpoint (`GET /api/sweep/runs/latest`, shared-secret, realizes WP-209's deferred blob endpoint)

---

## Script Exit Codes

Both scripts are deterministic interfaces, not loose helpers. They MUST exit
with exactly these codes; the workflow keys its success/failure on them.

**`scripts/inspection-fetch.mjs`:**

| Code | Meaning |
|---|---|
| 0 | Success — wrote `inspection-work/sweep-input.json` with a non-null `run` AND non-null `run.manifestBlob` |
| 1 | Missing/empty env vars (`SWEEP_SUBMIT_TOKEN`, `API_BASE_URL`) — no request made |
| 2 | Request failure — network error OR non-2xx from `GET /api/sweep/runs/latest` |
| 3 | No triageable sweep input — `run` is null OR `run.manifestBlob` is null (forensic blob required) |

**`scripts/inspection-submit.mjs`:**

| Code | Meaning |
|---|---|
| 0 | Success — POST returned 201 |
| 1 | Missing/empty env vars (`INSPECTION_SUBMIT_TOKEN`, `API_BASE_URL`) |
| 2 | Invalid agent output — bare `JSON.parse` threw, OR the parsed object fails the `InspectionReportPayload` shape check |
| 3 | Verdict mismatch — `deriveVerdict(findings) !== report.verdict` (the agent is internally inconsistent; fail before POST) |
| 4 | POST non-2xx — **including 409** (a duplicate `reportId`; see §CI Failure Semantics) |

On any non-zero exit, `inspection-work/` is preserved (never `rm -rf`'d); cleanup
runs ONLY after a confirmed 201.

---

## CI Failure Semantics

- The workflow MUST NOT auto-retry within the same run — a retry could double-submit. A failed step fails the workflow (non-zero) and stops.
- On any failure, `inspection-work/` is preserved in the runner workspace and uploaded as a build artifact via `actions/upload-artifact@v4` (`if: failure()`), so the operator can inspect the sweep input + agent output of a failed nightly without re-running the agent.
- **Re-triage is allowed across runs.** A later nightly MAY triage the same `sweepRunId` (e.g., if the sweep did not advance, or a prior triage failed). Because `reportId` embeds `generatedAt`, each triage yields a distinct `reportId` → a distinct row (201), never a 409. `inspection_reports` therefore MAY hold more than one report per `sweepRunId`; `GET /api/inspection/latest` returns the most recent by `submitted_at`.
- **Idempotency / 409 handling.** A 409 means the exact `reportId` already exists — i.e., the identical report was already submitted (a same-run retry or a bug), not a fresh triage. The CI MUST treat 409 as a hard failure (exit 4 → workflow fails), NOT as success. Silent 409-swallowing is forbidden — a duplicate submission is a signal, not a no-op.

---

## Acceptance Criteria

1. Migration `019_create_inspection_reports.sql` applies cleanly against a fresh schema and creates exactly 1 table + 1 index in `legendary`.
2. `apps/server/src/inspection/inspection.types.ts` defines `InspectionSeverity` + `InspectionRoute` unions with matching `INSPECTION_SEVERITIES` / `INSPECTION_ROUTES` canonical arrays; a drift test asserts each array deep-equals its union members.
3. `apps/server/src/inspection/inspection.types.ts` does NOT import `SweepAnomalyClass` from the engine — `anomalyClass` is plain `string` (verified by `grep -E "SweepAnomalyClass" apps/server/src/inspection/inspection.types.ts` returning 0 matches).
4. `registerInspectionRoutes(router, { pool, inspectionSubmitToken })` is exported and invoked from `apps/server/src/server.mjs` exactly once.
5. `POST /api/inspection/reports` rejects a missing/short `X-Inspection-Token` with 401 before any DB I/O via the shared `validateSharedSecret` helper (length pre-check + `timingSafeEqual`) — verified: a token strictly shorter than the env token returns 401, no `RangeError`, no DB call.
6. `POST /api/inspection/reports` IGNORES a client-supplied `verdict` and stores the server-recomputed one — verified by submitting `verdict: 'PASS'` alongside a `P0` finding and asserting the row IS inserted with stored `verdict = 'FAIL'` (no 400).
7. `POST /api/inspection/reports` rejects a finding with `severity` outside `INSPECTION_SEVERITIES` or `route` outside `INSPECTION_ROUTES` with 400.
8. `POST /api/inspection/reports` rejects a duplicate `reportId` with 409 and leaves the pre-existing row byte-identical (no overwrite).
9. `p0_count`/`p1_count`/`p2_count` stored equal the per-severity counts of `findings` — verified by inserting a mixed-severity report and asserting the stored counts.
10. All `INSERT` statements in `inspection.logic.ts` list columns explicitly — verified by grep (explicit column list present; positional `INSERT INTO legendary.inspection_reports VALUES` absent).
11. `GET /api/inspection/latest` returns 401 for unauthenticated requests via `SessionValidationErrorCode` collapse to `'unauthorized'`.
12. `GET /api/inspection/latest` response matches `{ data: { latest, recentReports } }` with `recentReports.length <= 30`, ordered `submitted_at DESC`, and `latest === recentReports[0]` when non-empty.
13. `GET /api/sweep/runs/latest` requires `X-Sweep-Token` (401 on missing/mismatch), returns the latest run including `manifestBlob`, and returns `{ data: { run: null } }` on an empty table.
14. Every inspection + sweep-read handler body sets `Cache-Control: no-store` as its literal first statement (grep gate ≥ 6 matches across the two route files for the new handlers).
15. `docs/ai/REFERENCE/api-endpoints.md` carries 3 new rows with `Status` ∈ the closed set and `Auth` ∈ `{guest, authenticated-session-required}`, each citing its authorizing decisions, per D-11804 replace-whole-row semantics.
16. `scripts/inspection-fetch.mjs` fetches `GET /api/sweep/runs/latest` with `X-Sweep-Token`, writes `inspection-work/sweep-input.json`, and exits non-zero (preserving no partial output) on missing env vars or non-2xx.
17. `scripts/inspection-submit.mjs` validates the agent report's shape + verdict agreement, POSTs to `/api/inspection/reports` with `X-Inspection-Token`, `rm -rf`s `inspection-work/` ONLY on POST success, and maps failures to documented non-zero exit codes — verified by `scripts/inspection-submit.test.ts` (≥ 5 cases).
18. `scripts/inspection-triage-prompt.md` is self-contained (encodes the P0/P1/P2 rubric inline — no runtime dependency on the skill file) and instructs the agent to read `inspection-work/sweep-input.json`, apply the rubric (mapping `fatal` → P0, and the other anomaly classes per the rubric), route each finding to Builder or Architect, emit STRICT JSON only, and write `inspection-work/inspection-report.json` in the locked `InspectionReportPayload` shape.
19. `.github/workflows/inspection-nightly.yml` triggers on `workflow_run` after `Sweep Nightly` (success-guarded) + `workflow_dispatch`, runs fetch → headless-Claude triage (`anthropics/claude-code-action`, model `claude-sonnet-4-6`) → submit, sources `ANTHROPIC_API_KEY` + `INSPECTION_SUBMIT_TOKEN` + `SWEEP_SUBMIT_TOKEN` + `API_BASE_URL` from Actions secrets, uploads `inspection-work/` via `actions/upload-artifact@v4` with `if: failure()`, and does NOT auto-retry within a run.
20. `package.json` root scripts contain `"inspection:fetch"` and `"inspection:submit"`; `render.yaml` declares `INSPECTION_SUBMIT_TOKEN` `sync: false`; `apps/server/src/server.mjs` loud-fails in production if it is unset; `.env.example` documents it.
21. No new npm dependency appears in any `package.json` diff; no `apps/dashboard/**` file is modified (verified by `git diff --name-only`).
22. `pnpm --filter @legendary-arena/server test` exits 0 with ≥ 25 net-new inspection + sweep-read + helper cases; `pnpm -r build` exits 0.
23. `POST /api/inspection/reports` IGNORES client-supplied `p0_count`/`p1_count`/`p2_count` and stores server-recomputed counts — verified by submitting deliberately wrong counts and asserting the stored counts equal the per-severity counts of `findings`.
24. `scripts/inspection-submit.mjs` parses the agent report with a bare `JSON.parse` (no markdown/prose preprocessing) — verified by `scripts/inspection-submit.test.ts` feeding a markdown-fenced JSON blob and asserting exit 2.
25. `scripts/inspection-fetch.mjs` exits 3 when the sweep read returns `run: null` OR `run.manifestBlob === null` — verified by a test stubbing both cases against the script's exported `isTriageableSweepInput` guard.
26. The shared-secret check is implemented once: `grep -n "timingSafeEqual"` in `apps/server/src/sweep/sweep.routes.ts` + `apps/server/src/inspection/inspection.routes.ts` returns 0 (it lives only in `apps/server/src/auth/validateSharedSecret.ts`), and all three shared-secret handlers import `validateSharedSecret`.

---

## Verification Steps

```pwsh
# 1. Migration applies
pnpm --filter @legendary-arena/server migrate
# Expected: exit 0; "Applied: 019_create_inspection_reports.sql"

# 2. Server tests pass (>= 21 net-new)
pnpm --filter @legendary-arena/server test 2>&1 | Select-Object -Last 3
# Expected: all green; inspection.logic + inspection.routes + sweep read-endpoint + inspection-submit cases present

# 3. Build passes
pnpm -r build
# Expected: exit 0

# 4. anomalyClass opacity (no engine union import on the inspection surface)
Select-String -Path "apps\server\src\inspection\inspection.types.ts" -Pattern "SweepAnomalyClass"
# Expected: no output

# 5. Shared-secret check is centralized — timingSafeEqual lives ONLY in the helper
Select-String -Path "apps\server\src\auth\validateSharedSecret.ts" -Pattern "timingSafeEqual"
# Expected: >= 1 match
(Select-String -Path "apps\server\src\inspection\inspection.routes.ts","apps\server\src\sweep\sweep.routes.ts" -Pattern "timingSafeEqual").Count
# Expected: 0 (route files call validateSharedSecret, never timingSafeEqual directly)

# 6. Explicit INSERT column list (no positional inserts)
Select-String -Path "apps\server\src\inspection\inspection.logic.ts" -Pattern "INSERT INTO legendary.inspection_reports \(report_id"
# Expected: >= 1 match
Select-String -Path "apps\server\src\inspection\inspection.logic.ts" -Pattern "INSERT INTO legendary.inspection_reports VALUES"
# Expected: no output

# 7. Cache-Control first-statement gate across new handlers
(Select-String -Path "apps\server\src\inspection\inspection.routes.ts","apps\server\src\sweep\sweep.routes.ts" -Pattern "Cache-Control.*no-store").Count
# Expected: >= 6

# 8. Catalog rows present
Select-String -Path "docs\ai\REFERENCE\api-endpoints.md" -Pattern "/api/inspection/reports|/api/inspection/latest|/api/sweep/runs/latest"
# Expected: 3 lines

# 9. Workflow chains after the sweep
Select-String -Path ".github\workflows\inspection-nightly.yml" -Pattern 'workflows: \["Sweep Nightly"\]'
# Expected: 1 line

# 10. No dashboard files touched
git diff --name-only apps/dashboard/
# Expected: no output

# 11. No new npm deps
git diff package.json apps/server/package.json
# Expected: only the 2 new root scripts; no dependencies/devDependencies additions
```

---

## Definition of Done

- [ ] All 26 Acceptance Criteria pass
- [ ] All 11 Verification Steps produce the expected output
- [ ] `pnpm -r build` exits 0; `pnpm --filter @legendary-arena/server test` exits 0
- [ ] No files outside `## Files Expected to Change` were modified (`git diff --name-only`)
- [ ] No `apps/dashboard/**` file modified (deferred to the paired follow-up WP)
- [ ] `docs/ai/REFERENCE/api-endpoints.md` carries the 3 new rows per D-11804
- [ ] `docs/ai/STATUS.md` updated — Inspector nightly triage now files structured P0/P1/P2 reports into `inspection_reports`; the verdict is server-enforced deterministic
- [ ] `docs/ai/DECISIONS.md` updated — D-23101 (storage + report contract), D-23102 (LLM triage posture + determinism carve-out + cost), D-23103 (CI sweep-blob read) flipped Reserved → Active
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-231 checked off with today's date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-263 flipped Draft → Done

---

## Vision Alignment

**Vision clauses touched:** §20-26 (scoring/PAR/simulation — the sweep is QA simulation this WP triages), §22 (determinism/replay), §3/§8 (determinism/RNG sourcing).

**Conflict assertion:** `No conflict: this WP preserves all touched clauses.` The triage is an internal operator-only QA *meta* surface that reasons *about* sweep outputs; it changes no game logic, no RNG sourcing, no scoring math, no replay storage or verification. The sweep simulation and the engine's determinism guarantees are untouched.

**Non-Goal proximity check:** none of NG-1..7 are crossed — no user-facing surface, no paid/persuasive/competitive surface, no monetization. The endpoints are operator/CI-only (shared-secret + authenticated-session).

**Determinism preservation:** the engine + sweep determinism is unchanged and replay-faithful (Vision §22). The triage *findings* are LLM-generated and intentionally **nondeterministic** (D-23102) — but this surface is meta-analysis, not gameplay/scoring/replay, so §22's determinism covenant is not engaged. The one determinism-bearing output, the PASS/FAIL **verdict**, is recomputed and enforced deterministically server-side (`deriveVerdict`), so the durable verdict is reproducible from the stored findings even though the findings themselves are not.

---

## Funding Surface Gate

**N/A — docs/server/CI infrastructure only; no global navigation, Registry Viewer, profile/account, or tournament funding affordances; no user-visible copy referencing donations or support; the endpoints are operator/CI-only.** None of the §20.1 trigger surfaces (WP-097 §A/§B/§C, tournament funding channels, user-visible funding copy) are present.

---

## API Catalog Update

**APPLIES.** §21.1 triggered: three new HTTP endpoints on `apps/server`. Per D-11804 replace-whole-row semantics, the catalog update lands in the same commit as the route code. Rows:

- `POST /api/inspection/reports` — Auth: `guest` (shared-secret `X-Inspection-Token`); Status closed-set `{201, 400, 401, 409, 413, 500}`; Authorizing WP: `WP-231`; Cites: D-23101, D-23102, D-9905, D-11504, D-11804
- `GET /api/inspection/latest` — Auth: `authenticated-session-required` (D-9905 + D-10403 collapse); Status closed-set `{200, 401, 500}`; Authorizing WP: `WP-231`; Cites: D-23101, D-9905, D-10403, D-11504, D-11804
- `GET /api/sweep/runs/latest` — Auth: `guest` (shared-secret `X-Sweep-Token`); Status closed-set `{200, 401, 500}`; Authorizing WP: `WP-231`; Cites: D-23103, D-20702, D-9905, D-11504, D-11804

---

## Lint Gate Self-Review

Per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`, all 21 sections reviewed 2026-06-09:

| § | Verdict | Note |
|---|---|---|
| 1 | PASS | All required sections present; Out of Scope lists ≥ 2 explicit exclusions |
| 2 | PASS | Engine-wide + packet-specific + session protocol + locked values; full-file output required; 00.6 referenced |
| 3 | PASS | WP-209/210/230/115/133/205/118 deps listed with required exports; agent-inspector skill + headless-Claude availability called out |
| 4 | PASS | ARCHITECTURE §Layer Boundary, sweep/analytics modules, migration 018, agent-inspector skill, sweep.analyze, D-entries, 00.6, api-endpoints all cited specifically |
| 5 | PASS | 25 files listed with new/modified disposition + one-line descriptions; bundle justification given (WP-209 precedent) |
| 6 | PASS | New contract field names are internally consistent camelCase; no 00.2 §8.1 setup-payload fields are touched (no match-setup surface) |
| 7 | PASS | No new npm deps (headless agent via GitHub Action); forbidden packages not used; `pg`/`node:test`/built-in `fetch` only |
| 8 | PASS | Server-layer only + CI tooling; no engine runtime import; PostgreSQL for config/QA data not live game state; no `G`/`ctx` persisted |
| 9 | PASS | PowerShell verification commands; `.mjs` scripts use `node --env-file`/built-in fetch; CI YAML runs on ubuntu (documented), not operator scripts |
| 10 | PASS | `INSPECTION_SUBMIT_TOKEN` (server/Render + Actions), `SWEEP_SUBMIT_TOKEN` (reused), `ANTHROPIC_API_KEY` (CI-only), `API_BASE_URL` documented with where-set; `.env.example` updated; no real secrets in the WP |
| 11 | PASS | No new player identity model; endpoint auth commits to the established closed set (D-9905): shared-secret for CI POST/read, authenticated-session for the operator GET (D-10403 collapse). `## Out of Scope` + the determinism carve-out serve as the limitations note |
| 12 | PASS | Tests use `node:test`/`node:assert`, no boardgame.io, no network/DB in unit tests; the nondeterministic LLM output is explicitly validated by shape + verdict consistency, never content |
| 13 | PASS | 11 exact `pnpm`/`git`/PowerShell verification commands with expected output |
| 14 | PASS | 22 binary, observable, specific acceptance criteria aligned to deliverables |
| 15 | PASS | DoD includes STATUS / DECISIONS / WORK_INDEX / EC_INDEX + scope-boundary check + dashboard-untouched check |
| 16 | PASS | No premature abstraction — `deriveVerdict` (validator + script + tests) and `validateSharedSecret` (sweep POST + sweep-read + inspection POST) each reach 00.6's 3-site threshold; explicit control flow; full-word names; small functions; `// why:` on the nondeterminism + the strict-JSON boundary + the token pre-check; named imports |
| 17 | PASS | `## Vision Alignment` present with clause numbers + no-conflict + determinism-preservation line (the LLM-nondeterminism carve-out is explicit) |
| 18 | PASS | Verification greps target literal tokens (`timingSafeEqual`, `INSERT...`, `Cache-Control`); WP prose cites D-entries rather than enumerating forbidden-token lists in any file under a grep path |
| 19 | N/A | No repo-state-summarizing artifact (bridge/STATUS-snapshot) authored in this WP draft |
| 20 | N/A | Server/CI infrastructure only; no funding surfaces or user-visible funding copy (justified above) |
| 21 | PASS | `## API Catalog Update` present; 3 new rows with closed-set Status/Auth, canonical field names, authorizing-WP + D-citations, replace-whole-row semantics |

---

## Future Work Packets (Scoped From This Foundation)

- **Dashboard triage surface** (paired follow-up, mirrors WP-210): the Pipeline page Inspector lane consumes `GET /api/inspection/latest` and renders P0/P1/P2 findings + verdict per finding, replacing the generic sweep-count items from WP-230.
- **WP-232 — Agent handoff chain (Inspector → Builder → Architect):** a Builder session reads the filed report, picks up P0/P1 findings routed to Builder, attempts fixes on a branch; spec-gap findings routed to Architect.
- **WP-233 — Closed-loop sweep verification:** a targeted re-sweep of the previously-failing cells; the Inspector verifies resolution; the dashboard shows found → triaged → fixed → verified.
- **Deterministic-classifier fallback / cost control:** if nightly API cost or triage variance warrants, a code-only severity classifier could pre-filter or replace the LLM pass for the structured-count cases, reserving the LLM for forensic-blob narrative.
