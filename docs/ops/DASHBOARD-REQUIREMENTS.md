# Dashboard Business Requirements

**Status:** Draft
**Owner:** Operations
**Dashboard URL:** `dashboard.legendary-arena.com`
**Scaffold WP:** WP-157 (Done 2026-05-16)
**Related:** `docs/01-VISION.md` (vision goals, monetization boundaries),
`docs/ops/LIVE_OPS_FRAMEWORK.md` (post-launch operating rhythm),
`docs/TOURNAMENT-FUNDING.md` (tournament funding model)

This document defines **what the dashboard must show, why, and in what
order** as Legendary Arena moves from development through launch into
live operations. It is a business requirements document, not a
technical spec — future WPs implement specific sections.

If a requirement here conflicts with `docs/01-VISION.md`, the Vision
document wins. Monetization boundaries (NG-1 through NG-8) and the
Financial Sustainability section of the Vision are non-negotiable
constraints on every metric, target, and action described below.

---

## 1. What the Dashboard Is

The dashboard is an **internal operational tool** for a small team
(1-3 people initially) running Legendary Arena as a live product. It
answers three questions every day:

1. **Is the system healthy?** (uptime, errors, latency, queue times)
2. **Are players having a good experience?** (engagement, retention,
   match quality, fairness)
3. **Is the business sustainable?** (revenue, subscriptions, costs)

It is not a public-facing analytics product. It is not a reporting
tool for investors. It is a cockpit for the people keeping the lights
on and making daily decisions about content, community, and
operations.

---

## 2. North Star Metric

The dashboard tracks a single headline metric that aligns engagement,
retention, and monetization into one number. This metric appears on
the Overview page as the first KPI card, always includes trend vs
previous period, and supports drilldown to player-level detail.

The North Star metric evolves with the product:

| Phase | North Star | Definition | Unlocked by |
|---|---|---|---|
| A (pre-auth) | **Weekly Active Matches** | Distinct matches completed in trailing 7 days | Phase A data (match records) |
| B (post-auth) | **Weekly Engaged Players (WEP)** | Distinct authenticated users who completed at least 1 match and returned on at least 2 distinct days in the trailing 7 days | Phase B data (user accounts + session tracking) |
| C (post-payments) | **Weekly Paying Competitive Players (WPCP)** | Distinct players active in trailing 7 days AND (active subscription OR tournament entry in period) AND at least 1 completed match | Phase C data (subscriptions + tournament entries) |

Each transition replaces the previous North Star on the Overview
headline. The replaced metric remains available as a secondary KPI.

The authoritative contract for each North Star definition (exact
query, edge cases, time-zone handling) is locked in the WP that
implements the corresponding phase. This document defines the intent;
the WP defines the SQL.

---

## 3. Phased Rollout (Metrics Follow Data)

Dashboard capabilities must track what data actually exists. Building
widgets for data that doesn't exist yet produces mock dashboards that
never get replaced. Each phase below unlocks when its data source
becomes real.

### Phase A — Engine & Infrastructure (available now)

Data source: server logs, boardgame.io match records, PostgreSQL.

| Metric | Definition | Page |
|---|---|---|
| Server uptime | Percentage of successful health-check responses over rolling 24h / 7d | System Health |
| API latency (P50, P95) | Response time distribution from server request logs | System Health |
| Server error rate | Count of 5xx responses / total responses over rolling 1h / 24h | System Health |
| Active connections | Current WebSocket connection count per server node | System Health |
| Matches started | Count of `Game.setup()` calls over selected date range | Gameplay |
| Matches completed | Count of matches reaching a terminal phase (hero_wins / villain_wins) over selected date range | Gameplay |
| Match completion rate | Completed / Started as a percentage | Gameplay |
| Average match duration | Mean wall-clock time from setup to terminal phase | Gameplay |
| Match outcome distribution | hero_wins vs villain_wins breakdown, filterable by scheme and mastermind | Gameplay |

These metrics require no new instrumentation beyond what the server
and boardgame.io already produce. They are the first widgets that
should go live with real data.

### Phase B — Player Activity (requires user accounts)

Data source: authentication system (Hanko or equivalent per Vision
§7a), session tracking, match-player join records.

Prerequisite: a shipped authentication system wired to match records.

| Metric | Definition | Page |
|---|---|---|
| Daily Active Users (DAU) | Distinct authenticated users who started at least one session in a calendar day | Overview, Players |
| Weekly Active Users (WAU) | Distinct authenticated users active in the trailing 7 days | Overview, Players |
| DAU/WAU ratio (stickiness) | DAU / WAU as a percentage; higher means players return more frequently | Overview |
| New signups | Count of new account creations per day / week | Players |
| D1 retention | Percentage of new signups who return on the calendar day after signup | Players |
| D7 retention | Percentage of new signups who return within 7 calendar days of signup | Players |
| Matches per active player | Mean matches started per DAU over selected date range | Players |
| Player status distribution | Count of players by status (active / inactive / at-risk), where at-risk = no session in trailing 7 days after having been active | Players |

### Phase C — Monetization (requires payment system)

Data source: payment processor webhooks (Stripe or equivalent),
subscription management system.

Prerequisite: a shipped payment integration. All metrics below must
respect the monetization boundaries in Vision §NG-1 through §NG-8.

| Metric | Definition | Page |
|---|---|---|
| Active subscriptions | Count of Legendary Supporter subscriptions in good standing | Overview, Monetization |
| New subscriptions | Count of new subscriptions created per day / week | Monetization |
| Subscription cancellations | Count of cancellations per day / week | Monetization |
| Net subscription change | New minus Cancellations per period | Monetization |
| Subscription churn rate | Cancellations in period / Active subscriptions at period start, expressed as percentage | Monetization |
| Revenue (today / 7d / 30d) | Gross revenue from all streams (subscriptions, cosmetics, tournament hosting fees), split by source | Overview, Monetization |
| Revenue per stream | Breakdown: subscriptions, one-time cosmetic purchases, organized-play licensing, community support tiers | Monetization |
| Conversion rate | Subscribers / DAU as a percentage | Monetization |
| ARPDAU | Average Revenue Per Daily Active User | Monetization |

**Excluded by Vision:** any metric that measures pay-to-win behavior,
loot-box engagement, energy-system friction, or ad revenue. These
categories do not exist and will never exist (NG-1 through NG-7).

### Phase D — Competitive & Scoring (requires PAR system)

Data source: replay-verified scoring pipeline per Vision §20-26,
`docs/12-SCORING-REFERENCE.md`.

Prerequisite: PAR scoring system shipped and producing scored replays.

| Metric | Definition | Page |
|---|---|---|
| Scored replays (daily) | Count of match replays that received a PAR-relative final score | Gameplay |
| Score distribution | Histogram of Final Scores (under-PAR / at-PAR / over-PAR) across all scored replays in date range | Gameplay |
| Leaderboard submissions | Count of player-submitted competitive entries per day / week | Players |
| Scenario coverage | Count of distinct ScenarioKeys (Scheme + Mastermind + Villains) that have at least one scored replay | Gameplay |
| Win-rate by archetype | Hero-deck win rate vs expected range, to detect balance issues | Gameplay |
| Meta diversity index | Inverse Herfindahl index of hero-deck pick rates; higher = more diverse meta | Gameplay |

---

## 4. Page Purposes

The dashboard scaffold (WP-157) created six content pages. Each page
has a defined purpose that constrains what belongs on it.

### Overview

The "what do I need to know right now" page. Every role sees it.
Shows the 4-6 most important KPIs as headline cards, a trend chart
(DAU or revenue depending on phase), and the alerts panel. This page
should take under 30 seconds to read.

### Players

Who is playing, how often, and where they drop off. Player table with
search, sort, and filter. Retention cohort charts when Phase B data
exists. Segment views (new / active / at-risk / churned) when data
supports it.

### Monetization

Revenue health, subscription lifecycle, and conversion. Only
meaningful once Phase C data exists. Until then, this page should
show a clear "No payment system connected" state rather than mock
data.

### Gameplay

Match health, balance, fairness, and competitive scoring. Phase A
metrics (match counts, durations, outcomes) are available immediately.
Phase D metrics (PAR scoring, meta diversity) arrive later.

### System Health

Infrastructure monitoring. Server nodes, latency, error rates,
connection counts. This page is useful from day one — it consumes
server-native telemetry.

### Debug

Developer-facing diagnostics: API URLs, WebSocket state, mock mode,
build info, feature flags. Not a business page. No KPIs.

---

## 5. Widget Behavior Contract

Every data widget on the dashboard follows the same behavioral
contract established in WP-157:

1. **Four render states:** loading, error, empty, data
2. **Freshness badge:** source label (LIVE / CACHED / MOCK) plus
   relative timestamp ("30s ago", "5m ago")
3. **Polling:** 30-second default interval, pauses when browser tab
   is hidden, resumes on visibility
4. **Click-through:** KPI cards navigate to the relevant detail page
   or DataTable drilldown
5. **Date range:** URL-synced `?range=7d|14d|30d|90d`, default 7d

These behaviors are already implemented in the composables layer
(`useFetch`, `useDataFreshness`, `useDateRange`). Future widgets
inherit them.

---

## 6. KPI Targets, Thresholds, and Ownership

Once real data is available for a KPI, that KPI must define:

- **Target value:** an explicit numeric goal for the period
- **Red/Yellow/Green thresholds:** boundaries that classify the
  current value relative to target
- **Owner role:** the role responsible for monitoring and responding
  to deviations

Targets are not defined in this document because they depend on
business conditions that don't exist yet (player base size, revenue
goals, infrastructure capacity). When the first real data flows, the
operator sets initial targets and adjusts them as baselines emerge.

### UI requirements

- KPI widgets visually encode RYG status (color badge + text label).
- The Overview page surfaces all RED KPIs prominently — they appear
  first or are visually distinguished from green/yellow KPIs.
- No KPI may display a fabricated target. Targets are shown only
  when derived from an observed baseline. Until targets are
  configured, the widget shows value + trend without a threshold
  overlay.

### KPI ownership

| KPI category | Owner role |
|---|---|
| System health (uptime, latency, errors) | operator |
| Player metrics (DAU, retention, engagement) | operator |
| Monetization (revenue, subscriptions, churn) | finance |
| Competitive / balance (win rates, meta diversity) | operator |
| Gameplay (match completion, queue times) | operator |

Ownership determines:
- Who is responsible for investigating when a KPI turns red
- Who receives alert routing (when implemented)
- Who approves threshold changes

### Drilldown requirement

All KPIs must support a drilldown view when the underlying data
exists. Clicking a KPI card navigates to the relevant detail page
or opens a DataTable showing the records behind the number. KPIs
that cannot be drilled into are incomplete.

---

## 7. Alerts and Required Actions

Alerts are not passive notifications. Every alert of severity
`warning` or higher must map to at least one recommended action.
The dashboard must never present a red or critical condition without
providing a path to resolution.

### Alert structure

Every alert includes:

- **Severity:** info / warning / error / critical (matches existing
  `AlertItem` type)
- **Message:** describes the condition
- **Associated KPI:** which metric triggered this alert (if
  applicable)
- **Recommended action:** at least one concrete next step for
  `warning`, `error`, and `critical` alerts
- **Playbook link (optional):** for non-trivial conditions, a link
  to an ewiki playbook at
  `ewiki.legendary-arena.com/playbooks/<topic>.md`

`info`-level alerts are informational and do not require an action
mapping.

### Alert sources by phase

- **Phase A:** server errors, high latency, match failures, deploy
  issues
- **Phase B:** retention drops, onboarding drop-off spikes, unusual
  DAU movements
- **Phase C:** subscription cancellation spikes, payment processor
  errors, revenue anomalies
- **Phase D:** balance anomalies (hero/deck win rates outside expected
  range), meta stagnation

### Example alert-to-action mappings

| Alert condition | Severity | Recommended action |
|---|---|---|
| Server error rate > 1% (1h) | critical | Check server logs; trigger incident response per `INCIDENT_RESPONSE.md` |
| Match completion rate < 80% (24h) | warning | Investigate queue times and match duration distribution |
| D1 retention < 20% (7d) | warning | Review onboarding flow; check for drop-off at tutorial steps |
| Subscription churn > 5% (30d) | error | Promote subscriber benefits; publish engagement content; review cancellation reasons |
| Low DAU relative to WAU (stickiness < 30%) | warning | Increase content output and community engagement |
| Hero-deck win rate > 65% (7d) | warning | Investigate balance; may indicate meta stagnation |

These mappings are configured alongside the alert definitions, not
hardcoded in individual widget components. The mapping data structure
is defined in the WP that implements the alert system.

### Visual treatment

Critical alerts are visually unmissable — top of the alerts panel,
distinct background color, and persistent until acknowledged.

---

## 8. Role-Based Access

The dashboard supports four roles (per WP-157 implementation):

| Role | Pages accessible |
|---|---|
| admin | All pages including Debug |
| operator | Overview, Players, Gameplay, Debug |
| finance | Overview, Monetization |
| support | Overview, Players |

Role assignments are managed through the auth store. The router
already enforces these gates.

---

## 9. Data Architecture Principle

**Metrics are computed server-side, never in the browser.**

The dashboard client fetches pre-computed aggregates from API
endpoints. It does not query raw tables, run SQL, or compute rollups.
This keeps the client lightweight, avoids exposing data-layer details,
and ensures that two people looking at the same dashboard see the same
numbers.

When a metric requires aggregation (e.g., D7 retention), the server
pre-computes it on a schedule and serves the result. The dashboard
polls for the latest value.

---

## 10. Relationship to ewiki

The dashboard and ewiki serve different purposes:

| | Dashboard | ewiki |
|---|---|---|
| **Purpose** | Real-time operational decisions | Knowledge, definitions, procedures |
| **Update frequency** | Every 30 seconds (polling) | When authored (static) |
| **Interactivity** | Filters, drilldowns, date ranges | Read-only pages |
| **Audience** | Operators running the product daily | Anyone who needs reference material |

The two systems connect in one direction: dashboard KPIs may link to
ewiki pages for context. For example, if a metric turns red, a "View
Playbook" link can point to an ewiki page that documents the
recommended response. The ewiki never queries the dashboard.

Playbook pages (if/when created) live at:
`ewiki.legendary-arena.com/playbooks/<topic>.md`

They are authored as wiki markdown in `wiki/playbooks/` and deployed
through the existing Hugo pipeline.

---

## 11. Daily Execution Checklist

The Overview page includes a **Daily Execution Panel** — a checklist
of recurring operational tasks that the operator completes each day.
This is not automated; the operator manually marks items complete.
State resets at midnight (local time) or on explicit reset.

### Why it belongs on the dashboard

The operator already checks the dashboard daily for metrics. Putting
the execution checklist in the same tool eliminates context-switching
between a metrics view and a separate project management tool.
The checklist is small (under 15 items), stable (categories change
rarely), and directly tied to the metrics on the same page — e.g.,
"YouTube video posted" affects acquisition, "Discord response SLA"
affects community health.

### Checklist categories and items

Items are configurable. The initial set reflects the operating rhythm
described in `docs/01-VISION.md §Financial Sustainability` and the
content/community channels the product depends on at launch:

**Content (Acquisition)**

| Item | Cadence | Notes |
|---|---|---|
| YouTube video published | Daily | Long-form or short |
| YouTube Short posted | Daily | Clip from recent match or strategy tip |
| Facebook post published | Daily | Cross-post or original |
| Newsletter drafted / scheduled | Weekly | Brevo pipeline; weekly cadence |

**Community (Retention)**

| Item | Cadence | Notes |
|---|---|---|
| Discord median response time < 4h | Daily | Measured by operator judgment, not API |
| Unanswered Discord threads < 5 | Daily | Manual check |
| Top active players acknowledged | Daily | Personal message, shout-out, or reaction |

**Growth Operations**

| Item | Cadence | Notes |
|---|---|---|
| Tournament announced or promoted | When scheduled | Not daily; appears only when a tournament is upcoming |
| Strategy/deck content posted | 2-3x/week | Blog, YouTube, or Discord |

### Data model

Checklist state is stored in the browser's `localStorage` per
authenticated user. It is not persisted to the server. If the
operator clears browser data, the checklist resets. This is
acceptable for a 1-3 person team. If the team grows, a server-side
persistence layer can be added in a future WP.

```ts
interface DailyChecklistItem {
  id: string;
  label: string;
  category: 'content' | 'community' | 'growth';
  cadence: 'daily' | 'weekly' | 'as-scheduled';
  completed: boolean;
  completedAt: number | null;
}
```

The checklist configuration (which items exist, their labels and
categories) is defined in a static array in the source code, not
fetched from an API. Adding or removing items requires a code change
and redeploy.

### Completion indicator on Overview

The Overview page shows a summary badge:
`"Daily: 5/8 complete"` with a progress ring or bar. Clicking it
expands or navigates to the full checklist panel.

---

## 12. UI Design Guidelines

This section defines the visual and interaction patterns for the
dashboard. It is prescriptive enough to maintain consistency across
WPs, but leaves detailed component styling to PrimeVue's Aura theme
preset (D-15701).

### Layout

- **Navigation:** left sidebar, collapsible to icon-only on narrow
  viewports. Page links with icons and labels. Active page
  highlighted.
- **Content area:** single-column below 1200px, multi-column grid
  above 1200px. Overview uses a 4-column KPI card row at the top.
- **Header bar:** app name ("Legendary Arena Dashboard"), current
  user name + role badge, date range selector, logout button.

### Color and theme

- PrimeVue Aura theme preset (dark mode preferred for ops tools;
  light mode as optional toggle).
- Semantic colors for status: green (#22c55e), yellow (#eab308),
  red (#ef4444). Used consistently for RYG thresholds, alert
  severity badges, and checklist completion.
- No custom color palette beyond PrimeVue's design tokens. Custom
  hex codes are a maintenance liability.

### Typography

- PrimeVue's default font stack (system fonts). No custom web fonts.
- KPI values: large (2rem+), bold, high contrast.
- Labels and captions: muted, smaller. Never compete with values.

### Charts (ECharts via vue-echarts)

- Line charts for time-series (DAU, revenue, match counts).
- Bar charts for categorical breakdowns (revenue by source, outcome
  distribution).
- No pie charts — they are hard to read and compare. Use horizontal
  bar charts instead.
- All charts include: axis labels, tooltips on hover, responsive
  sizing. No 3D effects, no animations beyond fade-in.
- Chart color palette: PrimeVue's theme colors, consistent across
  all charts. Same data category = same color everywhere.

### Widget cards

- Consistent card structure: header (metric name + freshness badge),
  body (value or chart), footer (trend indicator or action link).
- White/surface background with subtle border or shadow. No gradient
  backgrounds.
- Loading state: PrimeVue Skeleton component, matching the card's
  content shape.
- Error state: red-tinted card border + error message + retry button.
- Empty state: centered icon + "No data available" text.

### DataTables (PrimeVue DataTable)

- Alternating row stripes for readability.
- Sticky header on scroll.
- Column widths: auto-sized with min-width constraints. Status
  columns fixed-width.
- Filter row always visible (not hidden behind a toggle).
- Pagination at bottom, 20 rows per page default.

### Responsive behavior

- **Desktop (1200px+):** full sidebar + multi-column grid.
- **Tablet (768-1199px):** collapsed sidebar (icon-only) +
  single-column stacked layout.
- **Mobile (<768px):** not required. The dashboard is an ops tool
  used at a desk. If accessed on mobile, it should be usable but
  does not need a mobile-optimized layout.

### Accessibility

- All interactive elements keyboard-navigable (PrimeVue handles most
  of this).
- Color is never the sole indicator of status — always paired with
  text label or icon.
- Chart data available in DataTable form as an alternative view
  (for screen readers and data export).
- Minimum contrast ratio 4.5:1 for text (WCAG AA).

---

## 13. Constraints

### Performance

The dashboard must render usable content (KPI cards + navigation)
within 2 seconds on a desktop browser over a reasonable connection.
Charts may load asynchronously after the initial paint.

### Mock data sunset

Mock data must never persist once a real data source is available
for a given metric. When a Phase (A/B/C/D) ships its backend
endpoints, the corresponding mock fallbacks are removed in the
same WP or a dedicated follow-up. A widget showing `MOCK` in
production after its real data source exists is a bug.

### Detailed marketing planning

Content calendars, long-term scheduling, editorial workflows, and
campaign management belong in external tools (Notion, Linear,
Trello, or equivalent). The dashboard surfaces **daily execution
status** (§11) but does not replace planning tools.

---

## 14. What This Document Does Not Cover

- **Technical implementation:** API endpoint design, database schema,
  polling architecture — these belong in future WPs
- **Business strategy:** pricing decisions, growth targets, market
  positioning — these are leadership decisions documented elsewhere

---

## 15. Implementation Sequence

Future WPs that extend the dashboard should follow this order:

1. **Wire Phase A metrics to real server data** — replace mock
   endpoints with actual server telemetry and match record queries.
   This is useful immediately and has no external dependencies.

2. **Add Phase B metrics when auth ships** — once user accounts exist,
   wire DAU/WAU/retention. Don't build these widgets until the data
   source is real.

3. **Add Phase C metrics when payments ship** — once Stripe (or
   equivalent) is integrated, wire revenue and subscription metrics.

4. **Add Phase D metrics when PAR scoring ships** — once the scoring
   pipeline produces scored replays, wire competitive and balance
   metrics.

5. **Add targets and thresholds** — once baselines emerge from real
   data, configure RYG thresholds per KPI.

6. **Add ewiki playbook links** — once playbook pages exist in the
   wiki, wire "View Playbook" links from red KPIs.

Each step is a candidate for its own WP. Do not combine phases — each
depends on a different data source becoming available.

---

## 16. Success Criteria for the Dashboard

The dashboard is successful when:

- The operator checks it daily as part of their routine
- It surfaces problems before users report them
- It answers "what should I do today?" without requiring a second tool
- It never shows stale mock data where real data should be
- It loads in under 2 seconds on a reasonable connection
- It works on desktop and tablet browsers (mobile is not required)

The dashboard fails when:

- It becomes a TV that nobody checks
- It shows metrics that nobody acts on
- It drifts from real data into permanent mock mode
- It tries to replace project management, marketing planning, or
  business strategy tools
