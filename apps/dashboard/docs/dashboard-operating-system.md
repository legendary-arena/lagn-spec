# Dashboard Operating System — Draft v4

> **Status:** DRAFT for Jeff's review
> **Date:** 2026-06-04
> **Purpose:** Define the daily operating system for legendary-arena.com.
> The dashboard is a decision engine, not a data display. Every widget
> maps to a habit, every habit maps to the causal chain that produces
> revenue.

---

## System Goal

The dashboard is not just for daily execution — it is for improving the
system itself. Every repeated failure signals a system design problem,
not an operator problem. Detect → Prioritize → Act → Learn.

---

## The Operating Question

Every morning Jeff opens the dashboard. The question is:
**"What single thing do I fix first today?"**

Not "what are the numbers." The numbers are the scoreboard. The question
is: what's the highest-leverage action right now, and which part of the
system is it in?

---

## The System: Three Phases of Revenue

Revenue is produced by a causal chain. Each phase depends on the one
before it:

```
Audience → Revenue Engine → Retention & Control
```

| Phase | Question | Failure mode |
|---|---|---|
| **Audience** | Are people showing up? | Empty stadium — no one to sell to |
| **Revenue Engine** | Are we converting attention into money? | Offense stalls — traffic but no revenue |
| **Retention & Control** | Are we keeping what we earned? | Leaky bucket — revenue in, revenue out |

### The Dependency Chain (Non-Negotiable)

- No audience → no one to convert
- No conversion → no revenue
- No retention → no compounding

### Failure Propagation Model

Failures cascade downstream. Diagnosing the wrong phase wastes the fix:

- **Audience failure** → Offense starves → Defense becomes irrelevant
- **Offense failure** → Revenue drops → Defense appears healthy but is
  misleading (nothing to retain)
- **Defense failure** → Revenue leaks → Offense appears ineffective
  (acquiring but losing)

**Rule: Always diagnose upstream before fixing downstream.**

The dashboard reads top-to-bottom in causal order. The morning workflow
follows this order. Every widget belongs to exactly one phase.

---

### Funnel Ownership Mapping

The 6-stage sales funnel spans all three phases. Each stage belongs to
exactly one:

| Phase | Funnel stages |
|---|---|
| **Audience** | Capture → Confirm → Activate |
| **Revenue Engine** | Engage → Convert |
| **Retention & Control** | Retain |

This determines which phase owns the metric, which phase owns the fix,
and where the widget lives.

---

### Definition: Content

Content = anything a player can engage with that creates a monetization
opportunity. Card sets, game mechanics, modes, events.

Non-content (infra, governance, tooling) does not count toward revenue
velocity. Both matter; only content drives the Revenue Engine directly.

### Definition: Activation

Activation = a new player who completed a meaningful first engagement,
not just a signup or email open.

Specifically: **a new player who completed their first match.** Signups
that bounce before match 1 are acquisition waste — the funnel looks
healthy while the product fails to convert attention into engagement.

The Activate stage in the funnel measures this. The dedicated
first-session health metric (Habit 3A) tracks how deep new players get.

---

## Phase 0: Priority Action (Above Everything)

Before looking at any phase, the dashboard answers one question:

> **"What's the single highest-leverage issue right now?"**

### Priority Action Widget (NEW — build first)

**Purpose:** Collapse all signals into one decision.

**Displays exactly one item:**
- Root issue (what's broken)
- Phase it belongs to (Audience / Offense / Defense)
- Suggested action category
- Deep link to the relevant detail widget

### Priority Selection Rules

Candidates are ranked by cascade order, not by severity alone. A
moderate audience problem outranks a moderate offense problem because
audience failures starve offense.

**Triage order (deterministic):**

1. **System critical** (Defense: System) — outage, error spike, broken
   matches. Surfaces first because a broken system invalidates all
   other signals.
2. **Audience failure** — funnel drop-off, marketing cadence miss,
   email engagement collapse, activation quality drop. Surfaces second
   because no audience = no usable conversion signal.
3. **Offense failure** — conversion rate drop, content pipeline stalled,
   revenue regression. Surfaces third.
4. **Retention failure** — churn spike, player health decline, payment
   failure spike. Surfaces last (but still surfaces).

**Tiebreaker within a tier:** Prefer the issue with the larger
deviation from baseline. If no baselines exist yet, prefer the issue
from the upstream-most funnel stage.

**Scoring formula:** Deferred to Phase 3 (when real data and patterns
exist). The triage order above is sufficient for cold-start and
mock-data operation.

### Multiple Failures Rule

If 3+ critical issues exist simultaneously:

1. Resolve system stability first (Defense: System)
2. Resolve audience breakage second
3. Resolve conversion issues third

**Rationale:** Broken system invalidates all signals. No audience makes
conversion signals meaningless. This order is non-negotiable regardless
of severity scores.

---

### Cold-Start Mode (No Data)

The dashboard launches with no analytics platform and mock data. The
Priority Action Widget must still be useful.

**When metrics are not yet instrumented:**

- Priority Action falls back to:
  1. Marketing cadence violations (SLA-based — no baseline needed)
  2. Content pipeline inactivity (days since last content ship)
  3. Manual operator override (optional — operator pins an issue)
- All threshold-based widgets display status: **no-data**
  ("No baseline yet — collecting first 7–14 periods")
- Widgets with SLA-based cadences (marketing, content shipping) are
  active from day 1 — they don't need baseline data, just a deadline

**Transition to live:** When a widget's data source is wired, it
enters a 7–14 period baseline collection window. After baseline is
established, threshold enforcement activates and the widget feeds into
Priority Action scoring.

---

### Instrumentation Health Indicator

The dashboard must make its own blindness visible.

**Widget:** Instrumentation Status (Overview page, compact)
- X of Y metrics live (threshold enforcement active)
- Z metrics in baseline collection
- N metrics in no-data (not yet instrumented)

**Purpose:** If 8 of 12 metrics are no-data, the operator is flying
mostly blind. Making the gap visible creates pressure to close it.
Without this indicator, no-data quietly becomes the permanent state for
half the system.

**Status:**
- Pass: > 80% of metrics live
- Warning: 50–80% live
- Critical: < 50% live

---

### Action Closure Loop

Identifying an issue is half the system. Confirming the fix worked is
the other half.

**Every Priority Action must complete this cycle:**

1. **Detected** — issue surfaces in Priority Action
2. **Acted** — operator applies fix
3. **Re-measured** — metric checked in the next cycle (next day or next
   send, depending on cadence)
4. **Marked:**
   - **Resolved** — metric returns to within threshold
   - **Partial** — improved but still outside threshold (stays in
     Priority Action at reduced priority)
   - **Failed** — no improvement after 2 cycles → escalate from tweak
     to strategy change

### Escalation Playbook (When "Failed" After 2 Cycles)

A failed fix means the approach is wrong, not just the execution. The
operator needs a direction to move, not just the word "escalate."

| Phase | Escalation paths |
|---|---|
| **Audience** | Change the offer angle (different hook / value prop). Switch channel (if social is dead, try email or paid). Rework the landing/signup flow (friction audit). |
| **Revenue Engine** | Reprice (too high = no conversion, too low = no margin). Rebundle (change what's included in the offer). Change content type (if card sets aren't moving, try modes or events). |
| **Retention** | Proactive at-risk outreach (email players who haven't played in 7 days). Fix the first-session experience (activation quality problem masquerading as retention). Investigate involuntary churn (payment failures, not player choice). |

**Phase 1 (now):** Closure is manual (operator marks resolution).
**Phase 2:** Automated when thresholds are wired to real data.

---

## Phase 1: Audience — Fill the Stadium

These habits create the opportunity. Without audience, nothing
downstream matters.

### Habit 1: Check the funnel (Audience stages) — where are leads leaking?

**Cadence:** Daily (morning)
**The habit:** Look at the Audience stages of the funnel — Capture →
Confirm → Activate. Find the worst drop-off. That's the
highest-leverage audience fix today.

**Widget:** Sales Funnel Widget
- 6-stage funnel with counts and stage-to-stage drop-off rates
- Each stage labeled by phase ownership (Audience / Offense / Defense)
- Worst stage highlighted
- Deep link to relevant tool (Brevo, analytics)

**Threshold targets:**

| Metric | Baseline | Window | Trigger |
|---|---|---|---|
| Any stage drop-off | > 40% absolute | Per period | Warning |
| Stage drop-off delta | > +10pp vs 4-period rolling avg | 4 periods | Critical |

**Exists today?** No. AcquisitionFunnelStripWidget covers Visitors →
Signups → Activations but stops before Engage/Convert. The Monetization
page has zero cause-side context.

---

### Habit 2: Send / schedule outbound — are you talking to people?

**Cadence:** Daily
**The habit:** If nobody hears about the product today, the funnel
starves tomorrow. Each outbound channel has a cadence. Hit the cadence
or the stadium empties.

**Widget:** Marketing Cadence Widget
- Each item tracks: last completed, next due, SLA window
- Status: green (within SLA), yellow (due within 24h), red (overdue)
- Missed cadence for 3 consecutive periods → escalates to Priority
  Action

| Channel | Target cadence | SLA window |
|---|---|---|
| Newsletter | Weekly | 8 days from last send |
| Social post | Daily | 36 hours from last post |
| YouTube video | Weekly | 9 days from last publish |
| Blog post | Weekly | 9 days from last publish |
| Ad campaign review | Weekly (when active) | 8 days from last review |

**Active from day 1** — cadence is SLA-based, no baseline needed.

**Exists today?** No.

---

### Habit 3: Check email engagement — is the pipeline converting?

**Cadence:** After each send (detail) / weekly (trends)
**The habit:** Open rate, CTR, conversion from the most recent send.
Engagement trending down means the content or offer needs to change
before the next send.

**Widget:** Email Engagement Widget
- Last send: open rate, CTR, CTOR, unsubscribe rate
- Trend sparkline (last 4–8 sends)
- Status per metric: pass / warning / critical / no-data

**Threshold targets:**

| Metric | Baseline | Window | Trigger |
|---|---|---|---|
| Open rate | < 25% absolute | Per send | Warning |
| Open rate | < 20% absolute | Per send | Critical |
| CTR | < 2% absolute | Per send | Warning |
| Unsubscribe rate | > 1% absolute | Per send | Warning |
| Any metric delta | Regressing vs 5-send rolling avg | 5 sends | Warning |

**Exists today?** No. WP-021 in the marketing repo defines the metrics
contract but no dashboard surface exists.

---

### Habit 3A: Check new player activation quality — are signups becoming players?

**Cadence:** Daily
**The habit:** Signups can look healthy while nearly everyone bounces
before their first completed match. A healthy top-of-funnel with poor
activation quality means the acquisition machine is generating
expensive waste. This habit catches the gap between "they signed up"
and "they actually played."

**Widget:** Activation Quality Widget (new, or embedded in funnel detail)
- % of new signups who completed first match (within 7 days of signup)
- % of new signups who reached match 3 (early retention signal)
- Trend sparkline (rolling 7-day cohorts)

**Threshold targets:**

| Metric | Baseline | Window | Trigger |
|---|---|---|---|
| First-match completion rate | < 40% of new signups | 7-day cohort | Warning |
| First-match completion rate | < 25% of new signups | 7-day cohort | Critical |
| Match-3 rate | < 20% of new signups | 7-day cohort | Warning |

**Why this matters:** If first-match rate is 15%, then 85% of
acquisition spend is waste. Fixing activation at this stage has higher
ROI than increasing top-of-funnel volume.

**Exists today?** No. The ActivationFunnelWidget on the Players page
tracks steps (signup → email confirm → first login → first match) but
doesn't surface the rate as a health metric with thresholds.

---

### Habit 4: Review traffic sources — where are visitors coming from?

**Cadence:** Daily
**The habit:** Which channels are driving traffic? If a channel is dead,
stop spending. If a channel is hot, double down.

**Widget:** Traffic Sources Widget
- Visitors by channel: Direct, Search, Referral, Paid
- Trend vs previous period
- Cost per acquisition (when paid is active)

**Threshold targets (activate when paid campaigns are live):**

| Metric | Baseline | Window | Trigger |
|---|---|---|---|
| Channel growth | > +20% vs prior period | 7 days sustained | Invest signal |
| Conversion | Below 4-period rolling avg | 2 consecutive periods | Investigate |
| Paid CPA | Above target CPA | Immediate | Pause signal |

**Exists today?** Yes — TrafficSourcesWidget on Players page,
AcquisitionFunnelStripWidget (channel pills) on Overview. Needs
cross-link or summary on Monetization.

---

### Habit 4A: Check SEO / organic content health — is the audience pipeline growing?

**Cadence:** Weekly
**The habit:** For a business that relies on content marketing (blog,
YouTube, site SEO), organic search health is a leading indicator of
audience 3–6 months out. If rankings are dropping or organic traffic is
declining, the stadium is emptying in slow motion — and by the time it
shows up in daily visitor counts, the damage is already compounding.

This is different from "how many visitors today" (Habit 4). Traffic
Sources shows the current state. SEO health shows whether the pipeline
that feeds future traffic is healthy or decaying.

**Widget:** SEO Health Widget (Monetization page, weekly cadence)
- Organic search traffic trend (vs prior period)
- Top landing pages by organic visits
- Keyword ranking movement (up/down/stable for tracked terms)
- Blog + YouTube content index rate (are new posts being found?)

**Threshold targets:**

| Metric | Baseline | Window | Trigger |
|---|---|---|---|
| Organic traffic | Declining vs 4-week rolling avg | Weekly | Warning |
| Organic traffic | Declining 4+ consecutive weeks | Monthly | Critical |
| Top keyword rankings | > 3 position drop for tracked terms | Weekly | Warning |

**Data source:** Cloudflare Web Analytics or Plausible (when wired) for
traffic. Google Search Console for rankings and index coverage. Both are
free and don't require a paid analytics platform.

**Exists today?** No. No analytics platform is wired yet. This widget
starts in no-data mode and activates when site analytics connect.

---

## Phase 2: Revenue Engine — Play Offense

These habits convert audience into money. A full stadium with no
scoring is a loss.

### Habit 5: Ship content — new product on the shelf

**Cadence:** Daily
**The habit:** Content is the product. Card sets, playable features,
game modes. If nothing new ships, there's nothing new to sell. Check
the pipeline: what's in progress, what's next, what's blocked.

**Widget:** Content Pipeline Widget
- Current content WP in progress + status
- Next 3 content WPs in queue
- **Days since last content ship** (only CONTENT-type WPs count)
- Blocked items

**Requires:** WP type classification in WORK_INDEX.md:

| WP type | Counts toward ship cadence? |
|---|---|
| CONTENT (card sets, game features, modes, events) | Yes |
| MARKETING | No |
| SYSTEM (engine, infra) | No |
| GOVERNANCE | No |

**Threshold targets:**

| Metric | Baseline | Window | Trigger |
|---|---|---|---|
| Days since content ship | > 14 days | Rolling | Warning |
| Days since content ship | > 28 days | Rolling | Critical |
| Content WP blocked | > 3 days | Per WP | Warning |

**Ship cadence target:** ≥ 1 content release per 14 days (default).
Recalibrate after 8 weeks of actual throughput data. A wrong starting
value that fires alerts is strictly better than a blank that disables
the entire threshold chain.

**Exists today?** Partial — GovernanceKpiStrip shows WPs done this week
and days since last done-flip, but doesn't distinguish content from
infra.

---

### Habit 6: Check free-to-paid conversion — is attention becoming money?

**Cadence:** Daily
**The habit:** Total revenue tells you the score. Conversion rate tells
you if the offense is working. If you have 10,000 active players and
$5K revenue vs 5,000 active players and $5K revenue, those are
fundamentally different businesses — one is converting well with a
small audience, the other is converting poorly with a large one.

A revenue drop could be an audience problem (fewer people in the
funnel) or a conversion problem (same people, fewer paying). Without
tracking conversion rate explicitly, you can't tell which — and you'll
waste the fix on the wrong phase.

**Widget:** Conversion Health Widget (NEW)
- Free-to-paid conversion rate (paying players / total active players)
- Revenue per paying player (ARPPU)
- Trend vs trailing 7-day average
- Net revenue after royalties and costs

**Threshold targets:**

| Metric | Baseline | Window | Trigger |
|---|---|---|---|
| Free-to-paid conversion rate | Declining vs 14-day rolling avg | Daily | Warning |
| Free-to-paid conversion rate | < 50% of 30-day rolling avg | Daily | Critical |
| ARPPU | Declining 7 consecutive days | 7 days | Warning |
| Daily revenue | > −15% vs 7-day trailing avg | Daily | Warning |
| Daily revenue | > −30% vs 7-day trailing avg | Daily | Critical |

**Diagnostic rule:** When revenue drops, check conversion rate first.
- Conversion rate stable + revenue down → audience problem (upstream)
- Conversion rate down + audience stable → pricing/offer/friction
  problem (this phase)
- Both down → start upstream (audience)

**Exists today?** Partially — RevenueTodayWidget on Overview,
RevenueChartWidget + NetRevenueChartWidget on Monetization show total
revenue. Missing: explicit free-to-paid conversion rate, ARPPU, and the
diagnostic split between audience problem vs conversion problem.

---

## Phase 3: Retention & Control — Play Defense

These habits protect what offense creates. Three distinct failure modes,
three distinct responses.

### A) Player Defense — are paying players staying?

#### Habit 7: Monitor player health

**Cadence:** Daily
**The habit:** Are players playing? Are matches completing? Is the
experience stable? Losing a paying player costs more than acquiring a
new one.

**Widget:** Player Health Strip (unified)
- Active players (trend)
- Matches running
- Match completion rate (completed / started)
- Churn signals

**Status:** Pass / Warning / Critical / No-data

**Threshold targets:**

| Metric | Baseline | Window | Trigger |
|---|---|---|---|
| Match completion rate | < 90% absolute | Daily | Warning |
| Match completion rate | < 80% absolute | Daily | Critical |
| Active players delta | < 0 for 3 consecutive days | 3 days | Warning |
| Active players delta | < 0 for 7 consecutive days | 7 days | Critical |

**Exists today?** Partially — ActivePlayersWidget, MatchesRunningWidget
exist as separate cards. Missing: match completion rate (requires
server-side tracking), unified health summary with single status color.

---

#### Habit 7A: Listen to players — why are they leaving?

**Cadence:** Weekly
**The habit:** Quantitative metrics tell you *what* is happening (churn
up, completion rate down). They don't tell you *why*. If players are
leaving because of a specific game mechanic, a UX frustration, or a
billing confusion, no dashboard number will surface that. The
qualitative layer is the diagnostic underneath the numbers.

This is the habit that prevents "we fixed the wrong thing for 3 weeks
because the metric looked like a retention problem but it was actually
a broken card interaction."

**Widget:** Voice of the Player Widget (Players page or Monetization)
- Support ticket count (trend, categorized by type)
- Recent player complaints / feedback themes (top 3)
- App Store / review site rating trend (when applicable)
- Link to support inbox / feedback channel

**Threshold targets:**

| Metric | Baseline | Window | Trigger |
|---|---|---|---|
| Support ticket volume | > +50% vs 4-week rolling avg | Weekly | Warning |
| Negative review spike | > 3 negative reviews in 7 days | Weekly | Warning |
| Recurring complaint theme | Same issue cited 3+ times in 7 days | Weekly | Critical |

**Why weekly, not daily:** Individual complaints are noisy. Patterns
emerge over a week. The operator scans for themes, not individual
tickets. Exception: if a specific issue is cited by multiple players
on the same day (e.g., "match won't load"), that's a system issue that
surfaces through the System Health widget, not here.

**Exists today?** No. No support ticket system or feedback aggregation
is wired to the dashboard.

---

### B) System Defense — is the platform stable?

#### Habit 8: Check system health

**Cadence:** Daily (glance) / immediate (on alert)
**The habit:** Server uptime, error rates, performance. A broken system
is the fastest way to lose players and revenue. Most days this is a
"green, move on" check — but when it's red, everything else stops.

**Widget:** System Health Strip
- Server uptime %
- Error rate
- Response time (p50/p95)

**Threshold targets:**

| Metric | Baseline | Window | Trigger |
|---|---|---|---|
| Uptime | < 99.5% | 24h rolling | Warning |
| Uptime | < 99% | 24h rolling | Critical |
| Error rate | > +50% vs 7-day rolling avg | Daily | Warning |
| Error rate | > +100% vs 7-day rolling avg | Daily | Critical |

**Exists today?** Yes — ServerStatusWidget, ErrorRateMonitorWidget,
OpsAtAGlanceStripWidget. Covered. May benefit from unified status
color on Overview.

---

### C) Financial Defense — is the margin safe?

#### Habit 9: Review costs and payment health (weekly)

**Cadence:** Weekly (costs don't change fast enough for daily)
**The habit:** Cloud bills, R2 storage, Brevo costs, marketing spend.
Revenue minus costs = margin. No margin, no mission.

**Widget:** Cost Watchdog Widget
- Monthly burn rate (cloud + tools + marketing spend)
- Operating margin (revenue − costs)
- Status color reflects margin health, not just spend level

**Threshold targets:**

| Metric | Baseline | Window | Trigger |
|---|---|---|---|
| Cost spike | > +15% vs 4-week rolling avg | Weekly | Warning |
| Operating margin | Negative | Monthly | Critical |
| Operating margin | Declining 3 consecutive weeks | Weekly | Warning |

**Exists today?** Partially — InfraCostWatchdogWidget exists. Needs
marketing spend included and margin calculation.

---

#### Habit 10: Monitor payment failures — is revenue leaking at the register?

**Cadence:** Weekly (daily when volume warrants)
**The habit:** In any game with repeat purchases or subscriptions,
10–25% of churned revenue is typically involuntary — expired cards,
insufficient funds, billing errors. This is almost entirely recoverable
with dunning (retry logic + update-payment-method prompts). Not
tracking it means permanently leaving recoverable revenue on the floor.

**Widget:** Payment Health Widget (NEW)
- Failed payment rate (failed transactions / total attempted)
- Recovery rate (retried successfully / total failed)
- Revenue at risk (failed × average transaction value)
- Involuntary churn rate (failed + unrecovered / total subscribers)

**Threshold targets:**

| Metric | Baseline | Window | Trigger |
|---|---|---|---|
| Failed payment rate | > 5% of attempted | Weekly | Warning |
| Failed payment rate | > 10% of attempted | Weekly | Critical |
| Recovery rate | < 50% of failures recovered | Weekly | Warning |
| Revenue at risk | > $X/week (Jeff to define) | Weekly | Critical |

**Diagnostic rule:** When churn increases, check payment failure rate
first. If involuntary churn is a significant portion, the fix is
dunning/retry infrastructure — not product changes.

**Exists today?** PaidActionErrorsWidget exists on the Monetization
page but tracks generic paid-action errors, not payment failure rate,
recovery rate, or involuntary churn specifically.

---

### Not Daily: Strategic Defense (IP / Moat)

Licensing compliance, brand protection, unique mechanics. Quarterly
review items, not daily habits. Acknowledged; not on the daily surface.

---

## Morning Execution Flow

The dashboard encodes this sequence. The operator reads top-to-bottom
in causal order. Every step takes 30 seconds unless something is red.

```
Daily:
1. Priority Action         → "What's the single thing to fix first?"
2. Sales Funnel            → "Where are leads leaking?" (Audience)
3. Marketing Cadence       → "Am I talking to people?" (Audience)
4. Activation Quality      → "Are signups becoming players?" (Audience)
5. Conversion Rate         → "Is attention becoming money?" (Offense)
6. Player Health           → "Are players stable?" (Defense)
7. Revenue                 → "Is the scoreboard moving?" (Confirm)
8. Execute the fix         → Work on whatever Priority Action surfaced

Weekly (add to one morning per week):
W1. SEO Health             → "Is the organic pipeline growing or decaying?"
W2. Voice of the Player    → "Why are players leaving?" (qualitative)
W3. Cost Watchdog          → "Is the margin safe?"
```

**Guardrail:** Do not check revenue before checking funnel, activation,
and system health. Revenue is a lagging indicator. Reacting to revenue
without diagnosing the upstream cause leads to emotional,
scoreboard-driven decisions. The morning flow enforces upstream-first
diagnosis.

Total morning check: < 5 minutes.
Then execute on the one thing that matters most.

---

## Widget Status Model

Every widget that surfaces a metric must report one of four statuses:

| Status | Meaning | Operator action |
|---|---|---|
| **Pass** | Within threshold | Move on |
| **Warning** | Outside threshold, not critical | Monitor; fix if capacity allows |
| **Critical** | Significantly outside threshold | Fix now — feeds Priority Action |
| **No-data** | Metric not yet instrumented | Collect baseline; cannot alert |

No neutral/unknown states. No manufactured urgency — if everything is
pass, the dashboard is green and the morning check took 2 minutes.

---

## Enforcement Rules

1. Every widget belongs to exactly one phase (Audience / Offense /
   Defense).
2. Every metric-bearing widget defines thresholds in the structured
   format: metric, baseline, window, trigger.
3. Every critical status must map to a concrete action category. Red
   without a "what to do" is noise.
4. Scoreboard widgets (revenue total) confirm — they do not drive
   Priority Action directly. Revenue regression triggers upstream
   diagnosis via conversion rate, not a revenue fix.
5. If nothing is critical, nothing is critical. The dashboard does not
   manufacture urgency.
6. SLA-based widgets (marketing cadence, content pipeline) are active
   from day 1 — no baseline collection needed. Threshold-based widgets
   require a baseline window before enforcement activates.
7. Upstream-first diagnosis: never propose a downstream fix without
   checking the upstream phase first.
8. Conversion rate is checked before revenue total. A revenue drop
   without a conversion rate drop is an audience problem, not a
   pricing problem.

---

## Dashboard Layout (Organized by Phase)

### Overview page (morning glance — < 5 min)

| Order | Widget | Phase | Status |
|---|---|---|---|
| 1 | Priority Action Widget | Phase 0 | **NEW — build first** |
| 2 | Instrumentation Health | Phase 0 | **NEW** |
| 3 | Vision card | — | Done |
| 4 | Sales Funnel strip (compact) | Audience | **NEW** |
| 5 | Marketing Cadence strip (compact) | Audience | **NEW** |
| 6 | Activation Quality strip | Audience | **NEW** |
| 7 | Acquisition strip (channel pills) | Audience | Exists |
| 8 | Conversion Rate card | Offense | **NEW** |
| 9 | Player Health strip (unified) | Defense | **Enhance** |
| 10 | Revenue today | Offense | Exists |
| 11 | Governance KPIs | — | Exists |
| 12 | Daily Execution checklist | — | Exists |

### Monetization page (cause + effect detail)

| Order | Widget | Phase | Status |
|---|---|---|---|
| 1 | Sales Funnel (full detail, 6 stages) | All 3 | **NEW** |
| 2 | Marketing Cadence (full checklist) | Audience | **NEW** |
| 3 | Email Engagement (last send + trends) | Audience | **NEW** |
| 4 | Activation Quality (detail) | Audience | **NEW** |
| 5 | SEO Health (weekly) | Audience | **NEW** |
| 6 | Traffic Sources summary | Audience | Link to Players |
| 7 | Conversion Health (rate + ARPPU) | Offense | **NEW** |
| 8 | Revenue charts | Offense | Exists |
| 9 | Net revenue + paid action errors | Offense | Exists |
| 10 | Payment Health (failures + recovery) | Defense | **NEW** |
| 11 | Cost Watchdog (with margin) | Defense | Enhance |
| 12 | Revenue table | Offense | Exists |

### Players page (enhanced)

- Traffic Sources → Activation Funnel → Retention Cohorts (all exist)
- **Voice of the Player** (NEW — weekly qualitative feedback)

---

## Build Sequence

Priority order based on leverage:

| Priority | Widget | Why first |
|---|---|---|
| 1 | Priority Action Widget | Without it = observability. With it = decision engine. |
| 2 | Sales Funnel Widget | Makes the cause chain visible. Biggest gap today. |
| 3 | Marketing Cadence Widget | Enforces daily outbound discipline. Active from day 1. |
| 4 | Conversion Health Widget | Core monetization metric. Isolates audience vs pricing problems. |
| 5 | Activation Quality Widget | Catches acquisition waste before it compounds. |
| 6 | Email Engagement Widget | Closes the loop on email pipeline (WP-018/020/021). |
| 7 | Payment Health Widget | Recoverable revenue sitting on the floor. |
| 8 | Content Pipeline Widget | Distinguishes content velocity from WP velocity. |
| 9 | Instrumentation Health | Makes blindness visible; creates pressure to wire data. |
| 10 | Voice of the Player Widget | Qualitative diagnostic layer — surfaces the "why" behind churn. |
| 11 | SEO Health Widget | Leading indicator of audience pipeline 3–6 months out. |
| 12 | Player Health unification | Individual widgets exist; unify into one status. |
| 13 | Cost Watchdog enhancement | Add marketing spend + margin calculation. |

---

## What Exists vs What's Needed

| Widget | Status | Phase |
|---|---|---|
| Priority Action | **NEW** | Phase 0 |
| Instrumentation Health | **NEW** | Phase 0 |
| Sales Funnel | **NEW** | Audience + Offense + Defense |
| Marketing Cadence | **NEW** | Audience |
| Email Engagement | **NEW** | Audience |
| Activation Quality | **NEW** | Audience |
| Conversion Health | **NEW** | Offense |
| Content Pipeline | **NEW** | Offense |
| Payment Health | **NEW** | Defense — Financial |
| Voice of the Player | **NEW** | Defense — Player |
| SEO Health | **NEW** | Audience |
| Player Health (unified) | **Enhance** | Defense — Player |
| Cost Watchdog (with margin) | **Enhance** | Defense — Financial |
| Traffic Sources | Exists | Audience |
| Acquisition Funnel Strip | Exists | Audience |
| Revenue Today | Exists | Offense |
| Revenue Charts | Exists | Offense |
| Net Revenue Chart | Exists | Offense |
| Paid Action Errors | Exists | Offense |
| Active Players | Exists | Defense — Player |
| Matches Running | Exists | Defense — Player |
| Server Status | Exists | Defense — System |
| Error Rate Monitor | Exists | Defense — System |
| Ops At A Glance Strip | Exists | Defense — System |
| Infra Cost Watchdog | Exists | Defense — Financial |

**Net new: 10 widgets**
**Enhance: 2 widgets**
**Already covered: 12 widgets**

---

## Open Questions

1. **Analytics platform:** No site analytics exist. All threshold-based
   widgets start in no-data mode. When does Cloudflare Web Analytics or
   Plausible get wired up? This is the gate for threshold enforcement.
2. **Brevo API:** Brevo has native analytics. Should the dashboard pull
   from Brevo's API for email metrics, or start with manual entry?
3. **Marketing checklist persistence:** Local storage (single device,
   ships fast) or server-side (cross-device, more work)?
4. **Content WP tagging:** Adding a `type` field (CONTENT / SYSTEM /
   MARKETING / GOVERNANCE) to WORK_INDEX.md entries. Required for the
   Content Pipeline widget.
5. **Match completion tracking:** Does the server track matches started
   vs completed today? If not, that's an engine/server change before
   the Player Health widget can show completion rate.
6. **First-session tracking:** Does the server track per-player match
   count (specifically match 1 and match 3 milestones)? Required for
   the Activation Quality widget.
7. **Payment infrastructure:** What's the payment model (subscription,
   one-time purchase, microtransactions)? The Payment Health widget
   shape depends on whether dunning/retry applies.
8. **Revenue at risk threshold:** What dollar amount per week triggers
   a critical alert on payment failures? Jeff to define.
9. **Action closure persistence:** Where does the closure loop state
   live? Local storage for Phase 1, server for Phase 2?

---

## Phasing

### Phase 1: Structure (Now)

Build the widgets with mock data. The value is the layout, the morning
workflow, the habit enforcement, and the SLA-based cadence tracking
(marketing, content). Ship cadence defaults to 14 days with
recalibration after 8 weeks of actual throughput. These work without
real data.

### Phase 2: Instrumentation (When Data Sources Wire Up)

Per-widget activation. When a data source connects:
1. Collect 7–14 period baseline
2. Activate threshold enforcement
3. Wire into Priority Action scoring
4. Remove mock/no-data badge
5. Instrumentation Health indicator updates automatically

### Phase 3: Automation

**Entry criteria (all must be met):**
- Instrumentation Health shows ≥ 80% of metrics live
- ≥ 12 weeks of data across all three phases
- Action Closure Loop has been exercised manually for ≥ 8 weeks
  (operator has pattern experience before automating)

Without entry criteria, Phase 3 never starts. These thresholds are
a forcing function — they make the transition concrete instead of
"someday when we feel ready."

**Capabilities unlocked:**
- Numeric scoring formula for Priority Action (replaces triage order)
- Automated action closure (re-measure without operator marking)
- Trend-based alerting (not just threshold, but direction)
- Cross-phase correlation ("revenue dropped because audience dropped
  because newsletter wasn't sent")
- Payment dunning automation (retry failed payments automatically)
- SEO trend alerts (organic pipeline decay detected before traffic drops)
