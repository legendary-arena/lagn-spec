# Legendary Arena — Build Vision & Roadmap

> **Status:** DRAFT for Jeff's review
> **Date:** 2026-06-16
> **Authority:** This is an **execution document**. It is **subordinate to**
> [`docs/01-VISION.md`](../../../docs/01-VISION.md) (the authoritative product
> vision) and synthesizes the operating model from the five companion docs in
> this folder. If anything here conflicts with `01-VISION.md`, the canonical
> vision wins. This doc never redefines the vision — it operationalizes it.
> **It is the source of truth for the dashboard's Vision & Roadmap page and the
> schedule-watch agent.**

---

## 0. Why This Document Exists (Read This First)

The hardest problem on this project is not vision, architecture, or code. It is
**finishing**. Work reaches ~80% — playable, demo-able, *almost* — and then a new
idea pulls focus and the last 20% never lands. `dashboard.legendary-arena.com` is
the live proof: real backend, real widgets, then abandoned at 404s and stale
numbers.

This document is the antidote. It does three things, on purpose:

1. **States the vision** in one place, so the target never drifts.
2. **Lists the concrete tasks** that turn the vision into a shipped, solvent
   reality — each with a **target date**, a **status**, and a **definition of
   done** so "finished" is a fact, not a feeling.
3. **Feeds an accountability loop** — a dashboard page that always shows the
   gap, and a nightly agent that pings when a task ages past its date.

The point is not more planning. The point is that the unfinished 20% becomes
**impossible to forget**. Every task here is either Done, or it has a date and a
clock running against it.

---

## 1. The Vision, Synthesized

The full, non-negotiable vision lives in `01-VISION.md`. The through-line, pulled
together with the operating model from this folder:

**Legendary Arena exists to make money so the people building it can keep
building it** (`01-VISION.md` §Business Survival). Everything else — rules
authenticity, content fidelity, fair scoring, multiplayer reliability — is in
service of one question: *will real customers pay for this?* The covenant:

> *The definitive, faithful, digital home for the greatest cooperative
> deck-building experience ever created — engineered to last, funded in a way
> that protects the vision forever, and designed to send real money back to
> Upper Deck and Marvel.*

Three load-bearing truths govern execution:

- **No sales = no business** (§Business Survival). Revenue is survival, not an
  afterthought. The product must be worth buying *and* there must be a way to buy.
- **No margin, no mission** (§Financial Sustainability). Self-sustaining from
  launch; subscriptions / cosmetics / licensing are the open commercial space;
  royalties to Upper Deck + Marvel come off every dollar; never pay-to-win
  (NG-1…NG-8 are the bright lines).
- **Skill is the product's soul** (§20–26). PAR-based, replay-verified,
  deterministic scoring — measure *how well* the game was played, never how long
  or what was purchased.

The **operating model** that turns that into daily action (from
[`dashboard-operating-system.md`](dashboard-operating-system.md)): revenue is a
causal chain — **Audience → Revenue Engine → Retention** — diagnosed
upstream-first, with one **Priority Action** ("the single highest-leverage thing
to fix right now") above everything. The **governance model** (from
[`code-checks-and-balances.md`](code-checks-and-balances.md) and
[`sales-marketing-checks-and-balances.md`](sales-marketing-checks-and-balances.md)):
eight separated agents — Architect, Builder, Inspector, Evaluator (code) and
Strategist, Creator, Analyst, Auditor (business) — with Jeff as Orchestrator. The
**scoreboard** (from [`business-scorecard-metrics.md`](business-scorecard-metrics.md)):
one rolled-up health number. The **budget** (from
[`resource-allocation-roadmap.md`](resource-allocation-roadmap.md)): $200/month of
Claude, every session worth ≥ $10 of forward progress.

---

## 2. The Reality Gap (Where We Actually Are, 2026-06-16)

Honest current state per workstream. This is what the roadmap closes.

| Workstream | Vision says | Reality today | Gap |
|---|---|---|---|
| **Product & Content** | A faithful, complete Marvel Legendary that gets better every release | Engine is deep and tested; **~44% of hero ability lines are executable, ~56% are NO_EFFECT** (coverage gate, WP-250). Authoring vocabulary is now fully parameterized (Levers 1–3 done). | The game isn't *content-complete* — many printed abilities don't yet do anything. This is the long grind. |
| **Revenue Engine** | "No sales = no business"; subscriptions, cosmetics, licensing | **No payment path exists.** Monetization dashboards are mock. There is no way for a customer to give us money. | The single biggest vision-vs-reality gap. The cockpit watches revenue that can't yet be earned. |
| **Audience** | A full stadium feeding the funnel | No analytics platform wired; Daily Execution cadence at **0/9**; no email capture/sequence; www marketing site shipped. | The funnel has almost no top. |
| **Operator Command Center** | A decision engine that tells Jeff the one thing to fix | Dashboard is half-live: modern sweep/triage/analytics fetchers work; **legacy KPI/DAU/Revenue widgets 404**; governance KPIs stale; no briefing, no Priority Action, no Vision page. | The tool meant to prevent the 80% problem is itself stuck at 80%. |

**The uncomfortable priority signal:** the dashboard is the *visible* symptom, but
the *highest-leverage* gap is **Revenue Engine** — per the vision's own logic, a
beautiful cockpit watching a business with no way to take payment is polishing the
instruments of a plane with no engine. The accountability loop below is built so
this ranking can't be quietly ignored.

---

## 3. The Roadmap — Tasks That Convert Vision to Reality

Each task has: a **target date** (proposed — adjust freely; a wrong-but-present
date beats a blank one, per `dashboard-operating-system.md`), a **status**
(`Done` / `In progress` / `Next` / `Not started` / `Blocked`), and a **Done =**
definition. Near-term focus; the long horizon points to
`resource-allocation-roadmap.md` phases.

### WS1 — Operator Command Center (the system that watches the others)

| Task | Agent | Target | Status | Done = |
|---|---|---|---|---|
| Trust repair: retire the 404-ing KPI/DAU/Revenue widgets + refresh governance snapshot | Builder | 2026-06-23 | Next | Live Overview shows zero `404`s; governance KPIs reflect real WORK_INDEX state |
| **Vision & Roadmap page** (this initiative) | Builder | 2026-06-20 | In progress | This roadmap renders in the dashboard with live per-task status + an on-schedule banner |
| AI briefing endpoint + panel (Jarvis lead element) | Architect→Builder | 2026-06-30 | Not started | `GET /api/briefing/latest` summarizes overnight state; panel renders it at the top of the landing |
| Schedule-watch agent (this initiative, increment C) | Builder | 2026-07-07 | Not started | A nightly cron flags overdue/due-soon tasks and notifies Jeff |
| Priority Action widget (`dashboard-operating-system.md` §Phase 0) | Builder | 2026-07-14 | Not started | One card surfaces the single highest-leverage issue, deep-linked |
| The 10 operating-system widgets (Sales Funnel, Conversion Health, …) | Builder | per `resource-allocation-roadmap.md` | Not started | Each ships per its spec in `dashboard-operating-system.md` §Build Sequence |

### WS2 — Product & Content (the game is the product)

| Task | Agent | Target | Status | Done = |
|---|---|---|---|---|
| Hero-effect authoring: raise executable coverage 44% → 60% | Builder | 2026-07-31 | In progress | `pnpm sim:coverage` baseline shows ≥ 60% executable, no regressions |
| Villain-effect authoring against the new primitives (Levers done) | Builder | 2026-08-15 | Next | Villain ability coverage rises against the WP-252 primitives |
| Close known live gameplay bugs (e.g., villain KO-a-hero choice, WP-242/243) | Architect→Builder | 2026-07-15 | Next | Drafted WPs executed + live-verified on `play.legendary-arena.com` |
| Gameplay theme content expansion | Creator | ongoing | In progress | New comic-accurate themes added as data (no engine change) |

### WS3 — Revenue Engine (highest-leverage gap: "no sales = no business")

| Task | Agent | Target | Status | Done = |
|---|---|---|---|---|
| Payment model + processor decision (subscription-first per §Financial Sustainability) | Strategist→Architect | 2026-07-15 | Not started | A `DECISIONS.md` entry fixes the model, processor, and royalty-accounting approach |
| Email/account capture path (precondition for any sale) | Builder | 2026-07-22 | Not started | A visitor can create an account and be billable |
| First Legendary Supporter subscription tier live (cosmetic/convenience only, NG-1 safe) | Builder | 2026-09-30 | Blocked (on decision) | A real customer can subscribe and pay; royalty share is tracked |
| Royalty accounting (Upper Deck / Marvel share off every dollar) | Auditor | 2026-09-30 | Not started | Every revenue dollar computes + records its royalty portion |

### WS4 — Audience (fill the stadium)

| Task | Agent | Target | Status | Done = |
|---|---|---|---|---|
| Wire a real analytics platform (Plausible / CF Web Analytics) — the gate for every threshold widget | Analyst | 2026-06-30 | Not started | Dashboard threshold widgets exit no-data mode; real traffic visible |
| Email capture + welcome sequence (Brevo) | Creator | 2026-07-15 | Not started | New visitors enter an email list and receive a 5-email welcome series |
| Sustain the Daily Execution cadence (YouTube/social/Discord) for 2 weeks | Creator | 2026-07-01 | Not started | Daily Execution panel holds ≥ 7/9 for 14 consecutive days |
| SEO / content engine | Creator | ongoing | In progress | www Pagefind shipped; blog/YouTube cadence producing indexed content |

> **Maintenance note:** when WS1's Vision page ships, this task list becomes
> structured data (`apps/dashboard/src/data/buildRoadmap.ts`) as the single
> runtime source of truth; this table is the human-readable mirror. Keep them in
> sync until the page can edit the data directly.

---

## 4. How "On Schedule" Is Computed (the spec for the page + agent)

The page and the agent share one deterministic rule, so they can never disagree.

For each task with a target date `T` and "now" `N`:

| Condition | Task state |
|---|---|
| status = `Done` | **done** (green) |
| not done, `N ≤ T − 3 days` | **on-track** (green) |
| not done, `T − 3 days < N ≤ T` | **due-soon** (amber) |
| not done, `N > T` | **overdue** (red) |
| status = `Blocked` | **blocked** (grey — excluded from the on-track count, listed separately) |

**Workstream status** = worst non-blocked task state in that workstream.
**Overall build status** = worst workstream status. One glance answers "am I on
schedule?": green = nothing slipping, amber = something due this week, red =
something has slipped.

The agent escalates specifically the **overdue** and **due-soon** tasks — i.e.,
the unfinished tail. That is the 80%→100% mechanism: the system's loudest signal
is reserved for work that's aging past its date.

---

## 5. The Accountability Loop (the two agents)

| Layer | What it is | Cadence | Job |
|---|---|---|---|
| **Passive — the Vision & Roadmap page** | A dashboard page rendering §1 (vision) + §3 (tasks) + §4 (status) | Always on | Every dashboard visit shows the gap and the one slipping task |
| **Active — the schedule-watch agent** | A nightly cron reading the roadmap data, computing §4, notifying on `overdue` / `due-soon` | Nightly | Pings Jeff when a task ages — finishing pressure that doesn't depend on him remembering |

The active agent **reuses what already runs**: the project already has nightly
GitHub Actions crons (`sweep-nightly`, `inspection-nightly`) and a weekly
`roadmap-counts` cron that opens a PR on drift. The schedule-watch agent is the
same pattern pointed at this roadmap's dates — not a new system. Notification
channel (GitHub issue / email via Brevo / push) is the one open decision for that
increment.

---

## 6. Build Increments (how this initiative ships without its own 80% problem)

- **A — Vision + Roadmap (this doc).** Done when this file is committed. ✅
- **B — The dashboard Vision & Roadmap page.** The roadmap as structured data +
  a page rendering vision + live task status + the on-schedule banner + tests.
- **C — The schedule-watch agent.** A nightly cron computing §4 and notifying on
  slippage (channel decision first).

Each increment is finished — committed, tested, verified — before the next
starts. That discipline is the whole point: this document about not stopping at
80% will not, itself, stop at 80%.

---

## 7. Pointers

- **Authoritative vision:** `docs/01-VISION.md` (this doc is subordinate).
- **Operating model:** [`dashboard-operating-system.md`](dashboard-operating-system.md)
  (Priority Action, the revenue causal chain).
- **Governance:** [`code-checks-and-balances.md`](code-checks-and-balances.md),
  [`sales-marketing-checks-and-balances.md`](sales-marketing-checks-and-balances.md).
- **Scoreboard:** [`business-scorecard-metrics.md`](business-scorecard-metrics.md).
- **Budget & milestones:** [`resource-allocation-roadmap.md`](resource-allocation-roadmap.md).
- **Overnight QA / self-healing:** [`jarvis-command-center.md`](jarvis-command-center.md).
