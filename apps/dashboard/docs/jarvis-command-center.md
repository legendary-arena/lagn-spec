# Jarvis Command Center — Findings & Implementation Plan

> **Status:** DRAFT for Jeff's review
> **Date:** 2026-06-16
> **Purpose:** Turn `dashboard.legendary-arena.com` into a "Jarvis Command
> Center" — a single morning surface that tells Jeff *the one thing to do
> today* and what the system found while he slept. This document records what
> already exists in the repo (so we don't rebuild it), what's genuinely
> missing, and a phased plan to close the gap.
>
> **Companion docs:** this builds directly on
> [`dashboard-operating-system.md`](dashboard-operating-system.md) (the
> decision-engine design whose Phase-0 "Priority Action" widget *is* the
> command-center spine) and [`code-checks-and-balances.md`](code-checks-and-balances.md)
> (the four-agent governance the self-healing loop runs inside).

---

## 1. Executive Summary

The "Jarvis" vision is a three-layer stack: an **Awareness Loop** (research),
a **Simulation Loop** (overnight QA), and a **Self-Healing Loop** (find →
queue → fix → verify). The key finding from auditing `WORK_INDEX.md`,
`DECISIONS.md`, and the codebase:

**Two of the three layers are already built and running on crons — and the
dashboard surfaces for them already ship.** The simulation engine, the anomaly
oracle, the nightly + weekly sweeps, the headless-Claude Inspector triage, the
handoff queue, closed-loop fix verification, *and* the live sweep/triage
dashboard surfaces all exist today. The pitch that framed these as a "one
weekend" build was describing infrastructure the project already paid for.

What's actually missing is the **AI briefing front door** (the lead element),
a **Priority Action** card that collapses everything into one decision, a
**trust repair** of the degraded legacy Overview widgets, and the **Awareness
Loop**, which is genuinely greenfield.

| Jarvis layer | Reality | Net-new work |
|---|---|---|
| **Awareness** (research / community monitoring → brief) | **Greenfield.** No code, no WPs, no decisions. Partly fenced by Vision NG-8. | Whole cluster; Vision decision first |
| **Simulation** (headless QA overnight) | **~Shipped.** Engine, AI policies, sweeps, anomaly oracle, LAGN, coverage gate. | None |
| **Self-Healing** (find → triage → queue → verify) | **Shipped — backend *and* dashboard.** Nightly Inspector + handoff state machine + closed-loop verify (WP-231/232/233); live surfaces on `/system` + `/pipeline` (WP-238/239); bearer auth cutover (WP-241). | Surface it on the *landing*; auto-fix stays human-gated *by design* |
| **The Command Center UI** | **Degraded landing.** Old SaaS Overview layout, four `404`s, stale governance KPIs. The good surfaces live on `/system` + `/pipeline`, not the front door. | Briefing panel + Priority Action + trust repair |

**Bottom line:** the command center is a small build — one briefing endpoint,
one Priority Action widget, plus retiring the dead legacy widgets — sitting on
top of a self-healing stack that is *fully shipped, including its dashboards*.
It is **not** a from-scratch project, and the WP-238/239 wiring is **already
done**.

---

## 2. The Jarvis Stack, Mapped to What Exists

### Layer 1 — Awareness Loop (Research) — **GREENFIELD**

The pitch: a research agent monitoring Discord, BoardGameGeek, Reddit, and
YouTube, feeding a weekly Player Intelligence Brief.

**Status:** nothing exists. No ingestion code, no schema, no WP in
`WORK_INDEX.md`, no entry in `DECISIONS.md`. The closest surfaces are
internal-only analytics (`analytics_events`, WP-205/206) and the drafted-but-
unregistered Site Rules Assistant (WP-237) — neither is community monitoring.

**⚠️ Vision boundary:** `docs/01-VISION.md` §7a / NG-8 forbids social-network
semantics **in the product** (followers, likes, influence scores). A
*Jeff-private* external market-intelligence loop is a different thing and is
probably fine, but the line needs a `DECISIONS.md` entry before any WP is
drafted, so a future reader doesn't mistake it for an NG-8 violation. **Do not
start Layer 1 without that decision.**

### Layer 2 — Simulation Loop (Overnight QA) — **~SHIPPED**

| Capability | Where | Status |
|---|---|---|
| Headless full-game simulation + AI policies (random T0, competent T2) | `packages/game-engine/src/simulation/` | WP-036 done 2026-04-21 |
| PAR percentile aggregation (scenario difficulty) | `packages/game-engine/src/simulation/par.*` | WP-049 done 2026-04-23 |
| Setup-matrix sweep runner | `packages/game-engine/src/simulation/sweep.runner.ts` | WP-194 done 2026-06-01 |
| Anomaly oracle (4-class taxonomy, multimodality / outlier flags) | `packages/game-engine/src/simulation/sweep.analyze.ts` | WP-195 done 2026-06-01 |
| Headless autoplay match driver (server-side bot loop) | `apps/server/src/autoplay/autoplay.mjs` | shipped |
| LAGN replay/interchange format (published NPM pkg + schema) | `packages/lagn-spec/` (`@legendary-arena/lagn` v1.0.0) | WP-244/245 done 2026-06-12 |
| Hero-effect coverage gate (`pnpm sim:coverage`, CI) | `scripts/hero-effect-coverage.mjs` | WP-250 done 2026-06-14 |

The simulation loop the pitch wanted to build over a weekend is operational.
**Minor gaps vs. pitch:** no `simulationToLagn()` export yet (the schema
exists; writing sim outcomes as LAGN Tier-3 is not a first-class API), and the
anomaly oracle flags *distribution shape* (bimodality, outliers, variance),
not yet rule-based "this scheme is never beatable / this hero always wins."
Both are small, deferrable follow-ups — not blockers for the command center.

### Layer 3 — Self-Healing Loop (Find → Fix → Verify) — **SHIPPED, INCLUDING DASHBOARDS**

The full nightly pipeline runs today:

```
sweep-nightly.yml (0 7 * * *)         sweep-weekly.yml (0 8 * * 0)
   4-cell smoke sweep                    full corpus, sharded over 10 weeks
        │                                       │
        └──────────────┬────────────────────────┘
                       ▼
        POST /api/sweep/runs  →  legendary.sweep_runs (table 018)
                       │
        inspection-nightly.yml (chained after sweep)
                       ▼
   headless Claude Inspector → classify P0/P1/P2 → legendary.inspection_reports (019)
                       ▼
   handoffs:sync   → legendary.finding_handoffs (020), state machine:
                     open → claimed → fix-proposed → resolved
                       ▼
   handoffs:verify → diff next sweep → auto-resolve (fixed) or re-claim (regressed)
```

| Stage | Where | WP |
|---|---|---|
| Sweep storage + submission | `apps/server/src/sweep/` | WP-209 done |
| Inspector triage (nightly headless Claude) | `apps/server/src/inspection/` | WP-231 shipped |
| Handoff state machine | `apps/server/src/handoff/` | WP-232 shipped |
| Closed-loop verification | `POST /api/handoffs/verify` | WP-233 shipped |
| Full-corpus weekly expansion | `.github/workflows/sweep-weekly.yml` | WP-234 shipped |
| **Sweep-health LIVE dashboard** (`/system` + `/pipeline`) | `apps/dashboard/src/services/sweepLiveFetchers.ts` | **WP-238 done 2026-06-11** |
| **Triage surface** (verdict + P0/P1/P2 + handoff lifecycle, Inspector lane) | `apps/dashboard/src/services/triageLiveFetchers.ts` | **WP-239 done 2026-06-11** |

So the self-healing loop is visible **on `/system` and `/pipeline` today** — it
just isn't on the front-door landing page yet, and it only renders live data
once the deploy is in live mode (see §3).

**The auto-Builder is deliberately *not* automated — and shouldn't be.** The
handoff carries a `branchRef` slot, but nothing auto-writes the fix; a
human/Claude session does. That is correct: `code-checks-and-balances.md` §8
forbids self-merge of HIGH-risk (engine) code without a fresh-eyes pass.
Full autonomy here would violate the governance doc that defines the vision.
**The realistic target is the one already shipped: Jarvis detects, triages,
queues, and verifies; Jeff approves and the fix gets authored.** Jeff is
already the approver, not the discoverer. The command center's job is to make
that approval surface fast and obvious — not to remove the human.

---

## 3. Current Dashboard Reality Check (Trust Layer)

A command center must be green-when-green and right-when-red. The live
`dashboard.legendary-arena.com/overview` today is neither — it opens with
four `404`s and a governance strip reporting numbers that are demonstrably
wrong (0 WPs done this week, when WP-250…255 all flipped done 06-13…06-16).
Root causes:

1. **The deploy is already in live mode; the legacy widgets just have no
   server.** The "Acquisition (14 days)" strip on the live page reads **LIVE**,
   which means `VITE_USE_MOCKS=false` + `VITE_API_BASE_URL` are already set on
   the CF Pages deploy (the WP-241 operator cutover happened). But the legacy
   axios widgets — the KPI cards, DAU chart, revenue chart in
   `apps/dashboard/src/services/endpoints.ts` — call `/api/dash/kpis`,
   `/metrics/dau`, `/metrics/revenue`, paths the code *itself* comments as
   "future server-target" placeholders that were never implemented. In live
   mode they `404`. **You cannot fix this by flipping the global mock flag** —
   that flag is shared, and flipping it back to mock would blank the *working*
   live analytics/sweep/triage fetchers. The legacy widgets need per-widget
   treatment: retire them, or build their endpoints, or pin them to mock
   locally regardless of global mode.
2. **Stale governance snapshot.** The Governance KPI strip reads a committed
   static file (`apps/dashboard/src/data/governance-snapshot.json`), so it
   lags reality until the snapshot is regenerated.

**Auth seam — fully resolved (WP-241 / D-24005, done 2026-06-12).** An earlier
assumption was that the LIVE flip was blocked on a cookie-vs-bearer mismatch
and a mock login. WP-241 closed that: the dashboard's mock login is replaced
with real Hanko auth (mirroring `apps/arena-client`), and the three LIVE
fetchers attach `Authorization: Bearer` via an injectable `readAuthToken()`
accessor (`apps/dashboard/src/services/authToken.ts`); cookies are dropped
(D-24003 supersedes D-20601), the server reads bearer only (D-11202). Per the
WP, after flipping `VITE_USE_MOCKS=false` + `VITE_API_BASE_URL=https://api.legendary-arena.com`
the session-gated reads return real data instead of 401s. The session-gated
endpoints (`GET /api/sweep/latest`, `/api/inspection/latest`,
`/api/handoffs/latest`) are `authenticated-session-required` per D-9905.

**Implication:** the trust repair is small and well-scoped — retire the dead
legacy widgets and refresh the governance snapshot. There is **no auth work
left** and **no WP-238/239 wiring left**. Putting an AI briefing on top of a
404-ing page is the only thing to avoid; fix the front door first.

---

## 4. The Command Center Design (Leads with the AI Prose Briefing)

Per Jeff's direction, the most prominent element is an **AI prose briefing** —
the "Jarvis voice" that reads the overnight state and tells him, in plain
English, what happened and what to do first.

### 4.1 The Briefing Panel (lead element)

**What it says** (example shape, not a mock):

> *Good morning. Overnight the nightly sweep ran clean — 4/4 cells reached a
> natural endgame, no new anomalies. The weekly full-corpus sweep is 60%
> through its 10-week rotation; this week's shard flagged 1 scheme stuck at
> the 200-turn cap (`core/...`), which the Inspector filed as P1 and is now
> open in the handoff queue. Governance: 6 WPs shipped this week, last done-flip
> today. **Your one thing today:** review the P1 handoff before it ages — it's
> the only item blocking a green board.*

**Where it's computed — server-side, not the browser.** Reuse the WP-231
headless-Claude pattern (it already runs nightly and already calls the
Messages API server-side). Add a small endpoint, e.g.
`GET /api/briefing/latest`, that summarizes the latest `inspection_report` +
sweep deltas + open `finding_handoffs` + governance KPIs into a short prose
brief, cached per build/day. **Do not** call the Anthropic API from the
dashboard browser with a key — the dashboard is a thin read client. The
briefing panel itself is then a thin live fetcher mirroring the existing
sweep/triage fetchers (bearer seam already in place).

**Inputs (all already exist, all already exposed via session-gated reads):**
`legendary.inspection_reports`, `legendary.sweep_runs`,
`legendary.finding_handoffs`, the governance snapshot.

**Determinism note:** the prose is LLM-nondeterministic (fine — it's a human-
read summary, consistent with D-23102's carve-out for Inspector findings). The
*numbers* it cites come from deterministic server state, so the briefing can
never invent a metric.

### 4.2 Supporting surfaces (below the briefing)

| Element | Source | Status |
|---|---|---|
| **Priority Action** ("the one thing to fix first") | `dashboard-operating-system.md` §Phase 0 design; fed by handoff/sweep findings | NEW widget (specced, unbuilt) |
| **Overnight QA health** (sweep pass/fail, P0/P1/P2 counts) | `GET /api/sweep/latest`, `GET /api/inspection/latest` | **Built (WP-238/239)** — currently on `/system` + `/pipeline`; surface on landing |
| **Handoff queue** (open findings, claim/verify state) | `GET /api/handoffs/latest` | **Built (WP-239)** — read-only; surface on landing |
| **Governance KPIs** (WPs shipped, days-since-flip, drafts) | governance snapshot (refresh) | repair |

The "surface on landing" work is a *reuse* of the existing widgets/composables
(`useSweepHealth`, the triage projection on `useAgentPipeline`), not a rebuild.

### 4.3 Where it lives

Make the command center the **landing route** — either reshape
`OverviewPage.vue` in place (the briefing replaces the dead KPI grid at the
top) or add a `/command` route set as the default redirect. A command center
that isn't the front door isn't a command center. Recommend reshaping
Overview, retiring the 404-ing legacy widgets (they duplicate the Players /
Monetization pages anyway).

---

## 5. Phased Implementation Plan

Each phase is independently shippable and leaves the dashboard better than it
found it.

**Phase 0 — Trust repair (do first).** Retire (or local-mock) the legacy
KPI/DAU/Revenue widgets so the live front door stops 404-ing, and regenerate /
wire the governance snapshot so the KPIs stop lying. No auth or backend work —
the modern fetchers are already live. Outcome: the live dashboard is honest.

**Phase 1 — Briefing endpoint + panel (the lead element).** Add the
server-side `GET /api/briefing/latest` (reusing the WP-231 nightly-Claude
pattern) and the dashboard panel that renders it at the top of the landing
route. Outcome: the Jarvis voice is live.

**Phase 2 — Surface the overnight QA on the landing.** Bring the *already-built*
sweep-health + triage widgets (WP-238/239, currently on `/system` + `/pipeline`)
onto the command landing as compact strips, so the briefing's claims are
backed by visible, drill-downable findings. Reuse, not rebuild. Outcome: the
front door shows what Jarvis found.

**Phase 3 — Priority Action widget.** Build the §Phase-0 Priority Action card
from `dashboard-operating-system.md`, fed by the live findings. Outcome: the
"one thing to fix first" is a structured, deep-linkable card, not just prose.

**Phase 4 (separate initiative) — Awareness Loop.** Only after a `DECISIONS.md`
entry settles the NG-8 boundary. Own WP cluster: ingest → aggregate → brief.

Phases 0–3 are dashboard-app work (lighter CI gates per
`code-checks-and-balances.md` §11). Each that touches a `WORK_INDEX.md`-tracked
surface should still go through a WP/EC. Phase 1's briefing endpoint touches
`apps/server` and so needs a server WP + the `api-endpoints.md` catalog update
(per D-11804).

---

## 6. What NOT to Build

- **A throwaway HTML "Jarvis" artifact.** The real Vue dashboard exists;
  duplicating it as a standalone artifact creates a parallel surface that
  drifts. Build *in* `apps/dashboard`.
- **A browser-side Anthropic API call.** Keys don't belong in the dashboard
  client. The briefing is computed server-side.
- **WP-238/239 again.** They're done. The remaining QA-surfacing work is reuse
  onto the landing route, not new fetchers.
- **An auto-merging Builder agent for engine fixes.** Violates
  `code-checks-and-balances.md` §8 (no self-merge of HIGH-risk code). Keep the
  human approval gate; optimize it, don't remove it.
- **An in-product social graph for "Awareness."** NG-8. Keep external market
  intel separate from player-facing identity.

---

## 7. Open Questions / Decisions Needed

1. **Landing route:** reshape `OverviewPage.vue` in place, or add a dedicated
   `/command` route as the default redirect? (Recommend: reshape in place.)
2. **Briefing model + cadence:** which model (Sonnet, mirroring WP-231's
   triage), and is the brief generated nightly (cached) or on-demand per page
   load? (Recommend: nightly, cached, with a manual "regenerate" affordance.)
3. **Legacy widget disposition:** retire the 404-ing KPI/DAU/Revenue widgets,
   or implement their `/api/dash/*` endpoints? (Recommend: retire — Players /
   Monetization already own those metrics.)
4. **Awareness Loop:** is it in scope at all, and on which side of the NG-8
   line? Needs a `DECISIONS.md` entry before drafting.
5. **Deploy verification:** confirm the CF Pages env is set
   (`VITE_USE_MOCKS=false`, `VITE_API_BASE_URL`, `VITE_HANKO_TENANT_BASE_URL`)
   and operator Hanko sign-in yields a token — the live "Acquisition" strip
   suggests it already is, but verify before relying on live sweep/triage on
   the landing.

---

## 8. Reference Index

**Work Packets:** WP-036, WP-049 (sim engine) · WP-194, WP-195 (sweep + oracle)
· WP-209 (sweep storage) · WP-231/232/233 (triage / handoff / verify) · WP-234
(weekly corpus) · WP-235 (sweep trend) · **WP-238 (sweep LIVE flip, done) ·
WP-239 (triage surfaces, done) · WP-241 (bearer auth cutover, done)** ·
WP-244/245 (LAGN) · WP-250 (coverage gate).

**Decisions:** D-0701/0702 (AI for testing/balance; balance changes require
simulation) · D-9905 (auth tiers) · D-11202 / D-24003 / D-24005 (bearer-only
auth seam) · D-11804 (api-endpoints catalog obligation) · D-20704 (nightly 2×2
smoke locked) · D-23102 (Inspector findings LLM-nondeterministic) · NG-8 / §7a
in `docs/01-VISION.md` (no in-product social).

**Key paths:** `packages/game-engine/src/simulation/` · `packages/lagn-spec/` ·
`apps/server/src/{sweep,inspection,handoff,autoplay}/` ·
`.github/workflows/{sweep-nightly,sweep-weekly,inspection-nightly}.yml` ·
`apps/dashboard/src/services/{endpoints,api,authToken,sweepLiveFetchers,triageLiveFetchers}.ts`
· `apps/dashboard/src/pages/dashboard/OverviewPage.vue` ·
`apps/dashboard/src/data/governance-snapshot.json`.
