# Legendary Arena — Business Scorecard & Metrics System

**Project:** legendary-arena.com / barefootbetters.com
**Last Updated:** June 8, 2026

---

## Overview

This document defines a scoring system that evaluates every responsibility area in the business — both the code side and the business side — and rolls them up into a single **Overall Business Health Score**. Think of it as a quarterly report card for the entire operation.

The system is designed so that Jeff (the Orchestrator) can look at one number and know if the business is healthy, and then drill into individual scores to find exactly where to focus.

---

## Table of Contents

1. [How the Scoring Works](#how-the-scoring-works)
2. [Code Side Scorecards](#code-side-scorecards)
3. [Business Side Scorecards](#business-side-scorecards)
4. [The Rollup: Overall Business Health Score](#the-rollup)
5. [Scoring Frequency](#scoring-frequency)
6. [Dashboard View](#dashboard-view)
7. [Action Triggers](#action-triggers)
8. [Sample Completed Scorecard](#sample-completed-scorecard)

---

## 1. How the Scoring Works

### The Scale

Every metric is scored **1 through 5**:

| Score | Meaning | Color | Action |
|-------|---------|-------|--------|
| **5** | Excellent — performing above target | 🟢 Green | Maintain. Don't fix what isn't broken. |
| **4** | Good — meeting targets with minor gaps | 🟢 Green | Monitor. Address gaps when convenient. |
| **3** | Adequate — functional but underperforming | 🟡 Yellow | Improve. Schedule fixes within 30 days. |
| **2** | Weak — significantly below target | 🟠 Orange | Prioritize. Fix within 14 days. |
| **1** | Critical — failing or nonexistent | 🔴 Red | Stop and fix immediately. This is blocking the business. |

### How Individual Scores Become an Overall Score

Each of the eight responsibility areas (four code, four business) receives a **Department Score** — the average of its individual metrics, rounded to one decimal.

The eight Department Scores are then weighted and combined into one **Overall Business Health Score** on a 100-point scale.

```
Individual Metrics (scored 1–5)
        ↓ average
Department Score (1.0 – 5.0)
        ↓ weighted combination
Overall Business Health Score (0 – 100)
```

### Weighting

Not all departments are equally important at every stage. Early-stage businesses weight product and sales higher. Mature businesses weight operations and retention higher. Here are two weight profiles:

**Early Stage (Current — building and launching):**

| Department | Weight | Why |
|-----------|--------|-----|
| Architect (Code) | 10% | Specs matter but product is still forming |
| Builder (Code) | 15% | The product must work — this is the foundation |
| Inspector (Code) | 10% | Quality control prevents costly rework |
| Evaluator (Code) | 5% | Acquisition readiness is a future concern |
| Strategist (Business) | 15% | Targeting the right customer is everything early on |
| Creator (Business) | 15% | Content and campaigns drive first sales |
| Analyst (Business) | 15% | Must know what's working before scaling spend |
| Auditor (Business) | 15% | Business fundamentals must be sound from day one |

**Growth Stage (Future — scaling what works):**

| Department | Weight | Why |
|-----------|--------|-----|
| Architect (Code) | 8% | Architecture is established |
| Builder (Code) | 10% | Feature velocity matters less than stability |
| Inspector (Code) | 12% | Quality at scale is critical |
| Evaluator (Code) | 10% | Acquisition readiness becomes relevant |
| Strategist (Business) | 10% | Strategy is proven, refinement not reinvention |
| Creator (Business) | 12% | Content machine must keep running |
| Analyst (Business) | 18% | Data-driven optimization is the growth engine |
| Auditor (Business) | 20% | Operational maturity determines survival at scale |

### The Formula

```
Overall Score = Σ (Department Score × Weight) × 20

Example:
  Builder score: 4.2 × 0.15 = 0.63
  Strategist score: 3.8 × 0.15 = 0.57
  ... (all 8 departments)
  Sum of weighted scores: 3.75
  Overall Score: 3.75 × 20 = 75 out of 100
```

The ×20 converts the 1–5 scale to a 0–100 scale for easier interpretation.

---

## 2. Code Side Scorecards

### Department 1: The Architect (Documentation & Planning)

| # | Metric | How to Measure | Score Guide |
|---|--------|----------------|-------------|
| A1 | Spec coverage | % of features that had a written spec BEFORE coding began | 5 = 100%, 4 = 80%+, 3 = 60%+, 2 = 40%+, 1 = under 40% |
| A2 | Spec clarity | % of specs where the Builder had zero clarifying questions | 5 = 90%+, 4 = 75%+, 3 = 60%+, 2 = 40%+, 1 = under 40% |
| A3 | Edge case identification | Average number of edge cases documented per spec | 5 = 5+, 4 = 3–4, 3 = 2, 2 = 1, 1 = none |
| A4 | Acceptance criteria quality | % of specs with numbered, testable acceptance criteria | 5 = 100%, 4 = 80%+, 3 = 60%+, 2 = 40%+, 1 = under 40% |
| A5 | Documentation currency | Are architecture docs, API docs, and README up to date? | 5 = fully current, 4 = minor gaps, 3 = some sections stale, 2 = mostly outdated, 1 = no docs exist |

**Department Score = average of A1–A5**

---

### Department 2: The Builder (Writing Code)

| # | Metric | How to Measure | Score Guide |
|---|--------|----------------|-------------|
| B1 | Spec adherence | % of features delivered that match the spec exactly (no scope creep, no missing items) | 5 = 95%+, 4 = 85%+, 3 = 70%+, 2 = 50%+, 1 = under 50% |
| B2 | Test coverage | % of acceptance criteria with a corresponding automated test | 5 = 90%+, 4 = 70%+, 3 = 50%+, 2 = 30%+, 1 = under 30% |
| B3 | Code comments | % of non-trivial functions with a "why" comment | 5 = 90%+, 4 = 70%+, 3 = 50%+, 2 = 30%+, 1 = under 30% |
| B4 | Build success rate | % of commits that pass all automated checks (ESLint, tests) on first try | 5 = 95%+, 4 = 85%+, 3 = 70%+, 2 = 50%+, 1 = under 50% |
| B5 | Commit quality | % of commits with descriptive messages (not "fix" or "update") | 5 = 95%+, 4 = 80%+, 3 = 60%+, 2 = 40%+, 1 = under 40% |

**Department Score = average of B1–B5**

---

### Department 3: The Inspector (Review & Maintenance)

| # | Metric | How to Measure | Score Guide |
|---|--------|----------------|-------------|
| C1 | Review coverage | % of features that received an independent review before merging | 5 = 100%, 4 = 85%+, 3 = 70%+, 2 = 50%+, 1 = under 50% |
| C2 | Bug escape rate | Number of bugs found in production that should have been caught in review (per quarter) | 5 = 0, 4 = 1–2, 3 = 3–5, 2 = 6–10, 1 = 10+ |
| C3 | Security review | % of features with documented security review (input validation, auth, XSS) | 5 = 100%, 4 = 80%+, 3 = 60%+, 2 = 40%+, 1 = under 40% |
| C4 | Review turnaround | Average time from code complete to review complete | 5 = same day, 4 = next day, 3 = 2–3 days, 2 = 4–7 days, 1 = 7+ days |
| C5 | Dependency health | % of npm packages with no known vulnerabilities (npm audit) | 5 = 0 vulns, 4 = low only, 3 = moderate, 2 = high, 1 = critical unpatched |

**Department Score = average of C1–C5**

---

### Department 4: The Evaluator (Acquisition Readiness)

| # | Metric | How to Measure | Score Guide |
|---|--------|----------------|-------------|
| D1 | Documentation completeness | Of the 8 required docs (architecture, tech stack, repo map, API docs, DB schema, deployment guide, env vars, service inventory), how many exist and are current? | 5 = 8/8, 4 = 6–7, 3 = 4–5, 2 = 2–3, 1 = 0–1 |
| D2 | Onboarding speed | Time for a fresh developer (or fresh Claude session) to make a first contribution using only docs | 5 = under 4 hours, 4 = under 1 day, 3 = 1–3 days, 2 = 3–7 days, 1 = 7+ days |
| D3 | Technical debt transparency | Is TECH_DEBT.md maintained and current? | 5 = current, prioritized, and reviewed quarterly, 4 = current but not prioritized, 3 = exists but stale, 2 = mostly empty, 1 = doesn't exist |
| D4 | Code consistency | ESLint/Prettier pass rate across the entire codebase (not just new code) | 5 = 0 warnings, 4 = under 10, 3 = 10–25, 2 = 25–50, 1 = 50+ |
| D5 | Operational readiness | Monitoring, backups, and domain/account transferability in place? | 5 = all three solid, 4 = two of three, 3 = one of three, 2 = partial, 1 = none |

**Department Score = average of D1–D5**

---

## 3. Business Side Scorecards

### Department 5: The Strategist (Planning & Positioning)

| # | Metric | How to Measure | Score Guide |
|---|--------|----------------|-------------|
| E1 | Campaign brief coverage | % of marketing spend that had a written campaign brief BEFORE money was spent | 5 = 100%, 4 = 80%+, 3 = 60%+, 2 = 40%+, 1 = under 40% |
| E2 | ICP definition | Is the ideal customer profile documented with demographics, psychographics, and channels? | 5 = detailed and validated with data, 4 = detailed, 3 = basic, 2 = vague, 1 = not defined |
| E3 | Message clarity | % of campaigns leading with transformation (benefit) vs. features | 5 = all transformation-led, 4 = mostly, 3 = mixed, 2 = mostly features, 1 = all features |
| E4 | KPI definition | % of campaigns with specific, measurable KPIs set before launch | 5 = 100%, 4 = 80%+, 3 = 60%+, 2 = 40%+, 1 = under 40% |
| E5 | Channel strategy | Is there a documented rationale for why each marketing channel was chosen? | 5 = all channels justified with data, 4 = mostly justified, 3 = some reasoning, 2 = ad hoc, 1 = no strategy |

**Department Score = average of E1–E5**

---

### Department 6: The Creator (Content & Campaigns)

| # | Metric | How to Measure | Score Guide |
|---|--------|----------------|-------------|
| F1 | Brief adherence | % of content pieces that match their campaign brief's audience, message, and channel | 5 = 100%, 4 = 85%+, 3 = 70%+, 2 = 50%+, 1 = under 50% |
| F2 | CTA presence | % of content pieces with a clear, specific call to action | 5 = 100%, 4 = 90%+, 3 = 75%+, 2 = 50%+, 1 = under 50% |
| F3 | Content velocity | Number of content pieces published per month (posts, videos, emails) | 5 = 12+, 4 = 8–11, 3 = 4–7, 2 = 1–3, 1 = 0 |
| F4 | A/B testing | % of campaigns with at least two variants being tested | 5 = 80%+, 4 = 60%+, 3 = 40%+, 2 = 20%+, 1 = under 20% |
| F5 | Brand consistency | Is voice, tone, and visual identity consistent across all content? (Self-audit or peer review) | 5 = fully consistent, 4 = minor variations, 3 = noticeable inconsistencies, 2 = significantly inconsistent, 1 = no brand guidelines exist |

**Department Score = average of F1–F5**

---

### Department 7: The Analyst (Metrics & Accountability)

| # | Metric | How to Measure | Score Guide |
|---|--------|----------------|-------------|
| G1 | Tracking coverage | % of campaigns with proper analytics and UTM tracking confirmed before launch | 5 = 100%, 4 = 85%+, 3 = 70%+, 2 = 50%+, 1 = under 50% |
| G2 | Reporting cadence | Are weekly/monthly reports being generated on schedule? | 5 = never missed, 4 = rarely missed, 3 = sometimes missed, 2 = often missed, 1 = no regular reports |
| G3 | Funnel visibility | Can you see conversion rates at every funnel stage on the dashboard? | 5 = all 5 stages visible and current, 4 = 4 stages, 3 = 3 stages, 2 = 1–2 stages, 1 = no funnel tracking |
| G4 | Leak detection | Number of funnel leaks identified and reported with actionable recommendations (per quarter) | 5 = 3+ with recommendations acted on, 4 = 2–3, 3 = 1, 2 = leaks found but no recommendations, 1 = no analysis done |
| G5 | KPI accuracy | % of campaign reports that compare actual results to the original KPIs from the brief (not cherry-picked metrics) | 5 = 100%, 4 = 80%+, 3 = 60%+, 2 = 40%+, 1 = under 40% |

**Department Score = average of G1–G5**

---

### Department 8: The Auditor (Business Health & Scalability)

| # | Metric | How to Measure | Score Guide |
|---|--------|----------------|-------------|
| H1 | Revenue trend | Month-over-month revenue growth (trailing 3 months) | 5 = 10%+ growth, 4 = 5–10%, 3 = flat (0–5%), 2 = slight decline, 1 = significant decline |
| H2 | Unit economics | Customer LTV ÷ Customer CAC ratio | 5 = 5x+, 4 = 3–5x, 3 = 2–3x, 2 = 1–2x, 1 = under 1x (losing money per customer) |
| H3 | Operational independence | Could the business run 30 days without Jeff? Score each area: fulfillment, support, website, finances | 5 = all 4 independent, 4 = 3 of 4, 3 = 2 of 4, 2 = 1 of 4, 1 = none |
| H4 | Financial controls | Separate business account, monthly P&L, tax reserves, expense tracking | 5 = all 4 in place, 4 = 3 of 4, 3 = 2 of 4, 2 = 1 of 4, 1 = none |
| H5 | Process documentation | % of repeatable business processes (ordering, shipping, customer support, content publishing) that are documented step-by-step | 5 = 90%+, 4 = 70%+, 3 = 50%+, 2 = 30%+, 1 = under 30% |

**Department Score = average of H1–H5**

---

## 4. The Rollup: Overall Business Health Score

### The Master Scorecard

| # | Department | Score (1–5) | Weight (Early Stage) | Weighted Score |
|---|-----------|-------------|---------------------|----------------|
| 1 | Architect (Code) | ___ | × 10% | = ___ |
| 2 | Builder (Code) | ___ | × 15% | = ___ |
| 3 | Inspector (Code) | ___ | × 10% | = ___ |
| 4 | Evaluator (Code) | ___ | × 5% | = ___ |
| 5 | Strategist (Business) | ___ | × 15% | = ___ |
| 6 | Creator (Business) | ___ | × 15% | = ___ |
| 7 | Analyst (Business) | ___ | × 15% | = ___ |
| 8 | Auditor (Business) | ___ | × 15% | = ___ |
| | | | **Sum:** | = ___ |
| | | | **× 20 =** | **Overall Score: ___ / 100** |

### Interpreting the Overall Score

| Score Range | Grade | Meaning |
|-------------|-------|---------|
| **90–100** | A | Exceptional. The business is well-oiled, documented, and scalable. Ready to sell or scale aggressively. |
| **80–89** | B | Strong. Minor gaps exist but the foundation is solid. Focus on polishing weak areas. |
| **70–79** | C+ | Good with notable gaps. Two or three departments need focused improvement. Schedule fixes. |
| **60–69** | C | Adequate but fragile. The business works but depends too heavily on Jeff and has undocumented processes. |
| **50–59** | D | Struggling. Multiple departments underperforming. Stop adding new things and fix the foundation. |
| **Below 50** | F | Critical. The business has serious structural problems. Immediate intervention needed. |

### Trend Tracking

The overall score alone is useful, but the **trend** is more important. Track the score quarterly:

| Quarter | Overall Score | Trend | Key Change |
|---------|--------------|-------|------------|
| Q3 2026 | ___ | — | Baseline |
| Q4 2026 | ___ | ↑ ↓ → | |
| Q1 2027 | ___ | ↑ ↓ → | |
| Q2 2027 | ___ | ↑ ↓ → | |

A rising trend (even from a low starting point) means the system is working. A flat or declining trend means something is being ignored.

---

## 5. Scoring Frequency

| What | When | Who Scores It |
|------|------|---------------|
| Individual department metrics | Monthly | Each agent (or Claude session acting as that agent) |
| Department scores | Monthly | Calculated automatically (average of metrics) |
| Overall Business Health Score | Quarterly | The Orchestrator (Jeff), using the master scorecard |
| Trend analysis | Quarterly | The Auditor compares to previous quarters |
| Weight adjustment | Annually | The Orchestrator re-evaluates which departments deserve more weight based on business stage |

---

## 6. Dashboard View

The Legendary Arena dashboard should display the scorecard as a visual panel.

### Recommended Layout

```
┌─────────────────────────────────────────────────────────────┐
│           LEGENDARY ARENA — BUSINESS HEALTH                 │
│                                                             │
│                    Overall: 72/100 [C+]                      │
│                    Trend: ↑ (was 65 last quarter)            │
│                                                             │
├──────────────────────────┬──────────────────────────────────┤
│      CODE HEALTH         │       BUSINESS HEALTH            │
│                          │                                  │
│  Architect:  ██████░ 3.8 │  Strategist: ███████░ 4.2       │
│  Builder:    ███████░ 4.2│  Creator:    █████░░░ 3.4       │
│  Inspector:  ████░░░ 2.8 │  Analyst:    ██████░░ 3.6       │
│  Evaluator:  ███░░░░ 2.2 │  Auditor:    █████░░░ 3.0       │
│                          │                                  │
│  Code Avg:   3.25        │  Business Avg:  3.55             │
├──────────────────────────┴──────────────────────────────────┤
│  🔴 ALERTS                                                  │
│  • Evaluator at 2.2 — documentation gaps need attention     │
│  • Inspector at 2.8 — review coverage below target          │
│  • Creator at 3.4 — content velocity needs to increase      │
├─────────────────────────────────────────────────────────────┤
│  📈 WINS                                                    │
│  • Strategist up from 3.5 → 4.2 (campaign briefs working)  │
│  • Builder steady at 4.2 (code quality holding)             │
└─────────────────────────────────────────────────────────────┘
```

### Color Rules for the Dashboard
- Score 4.0+ → green bar
- Score 3.0–3.9 → yellow bar
- Score 2.0–2.9 → orange bar
- Score below 2.0 → red bar (with alert)

---

## 7. Action Triggers

The scorecard isn't just for looking at — specific scores trigger specific actions.

### Automatic Escalation Rules

| Condition | Action |
|-----------|--------|
| Any department drops to **1.x** | **Stop everything.** Fix this department before doing anything else. A 1.x means a critical function isn't happening. |
| Any department drops to **2.x** | **Priority fix.** Schedule improvement within 14 days. Orchestrator reviews root cause. |
| Any department drops **more than 0.5 points** in one quarter | **Investigate.** Something changed. Find out what and reverse it. |
| Overall score drops below **60** | **Stabilization mode.** No new features, no new campaigns. Fix the foundation. |
| Overall score rises above **80** | **Growth mode.** The foundation is solid. Consider scaling spend, adding products, or hiring. |
| Overall score holds above **85** for 2+ quarters | **Acquisition ready.** The business is healthy enough to attract a serious buyer. |
| Two or more departments at **2.x or below** simultaneously | **Systemic problem.** The issue isn't one department — something structural is wrong. Orchestrator does a full review. |

### Quarterly Review Agenda (The Orchestrator's Meeting)

Every quarter, Jeff sits down (with Claude as the Auditor) and runs through:

1. Score each department's individual metrics
2. Calculate department scores and overall score
3. Compare to last quarter's scores — identify trends
4. Identify the lowest-scoring department — this gets priority attention next quarter
5. Identify the highest-scoring department — what's working here that can be replicated?
6. Set 2–3 specific improvement goals for next quarter
7. Adjust weights if the business has shifted stages (early → growth)
8. Document everything in a quarterly review file: `/docs/reviews/Q3-2026-review.md`

---

## 8. Sample Completed Scorecard

Here's what a filled-in scorecard might look like for a business in its first quarter of operation:

### Department Scores

**Architect (Code): 3.4**
| Metric | Score | Notes |
|--------|-------|-------|
| A1 Spec coverage | 3 | About 60% of features had specs |
| A2 Spec clarity | 3 | Builder had questions on several specs |
| A3 Edge cases | 4 | Good edge case coverage when specs exist |
| A4 Acceptance criteria | 3 | Some specs had criteria, not all |
| A5 Documentation currency | 4 | README and API docs mostly current |

**Builder (Code): 4.0**
| Metric | Score | Notes |
|--------|-------|-------|
| B1 Spec adherence | 4 | Minor scope creep on two features |
| B2 Test coverage | 3 | Tests exist for core features only |
| B3 Code comments | 4 | Most complex functions documented |
| B4 Build success rate | 5 | ESLint passing consistently |
| B5 Commit quality | 4 | Descriptive messages most of the time |

**Inspector (Code): 2.6**
| Metric | Score | Notes |
|--------|-------|-------|
| C1 Review coverage | 2 | Only about half of features reviewed independently |
| C2 Bug escape rate | 3 | A few bugs made it to production |
| C3 Security review | 2 | No formal security review process yet |
| C4 Review turnaround | 3 | Reviews happen but sometimes delayed |
| C5 Dependency health | 3 | Some moderate npm audit warnings |

**Evaluator (Code): 2.0**
| Metric | Score | Notes |
|--------|-------|-------|
| D1 Documentation completeness | 2 | Only 3 of 8 required docs exist |
| D2 Onboarding speed | 2 | Fresh dev would need 3+ days |
| D3 Tech debt transparency | 1 | TECH_DEBT.md doesn't exist yet |
| D4 Code consistency | 3 | ESLint is configured but not enforced everywhere |
| D5 Operational readiness | 2 | No monitoring, no backup strategy documented |

**Strategist (Business): 3.0**
| Metric | Score | Notes |
|--------|-------|-------|
| E1 Campaign brief coverage | 2 | Most marketing was ad hoc so far |
| E2 ICP definition | 4 | Card-game ICP (Legendary players) defined in plan doc |
| E3 Message clarity | 3 | Mix of transformation and feature messaging |
| E4 KPI definition | 3 | Some campaigns had KPIs, not all |
| E5 Channel strategy | 3 | Channels chosen but rationale not documented |

**Creator (Business): 2.8**
| Metric | Score | Notes |
|--------|-------|-------|
| F1 Brief adherence | 2 | Hard to adhere to briefs that don't exist yet |
| F2 CTA presence | 3 | Some content has CTAs, some doesn't |
| F3 Content velocity | 3 | 4–5 pieces per month |
| F4 A/B testing | 2 | No A/B tests running yet |
| F5 Brand consistency | 4 | Barefoot Betters brand is fairly consistent |

**Analyst (Business): 2.4**
| Metric | Score | Notes |
|--------|-------|-------|
| G1 Tracking coverage | 2 | Google Analytics installed but UTMs inconsistent |
| G2 Reporting cadence | 2 | No regular reporting schedule |
| G3 Funnel visibility | 3 | Can see traffic and sales but not middle-funnel stages |
| G4 Leak detection | 2 | No formal funnel analysis done yet |
| G5 KPI accuracy | 3 | When reports happen, they reference original goals |

**Auditor (Business): 2.6**
| Metric | Score | Notes |
|--------|-------|-------|
| H1 Revenue trend | 3 | Revenue exists but early and small |
| H2 Unit economics | 2 | CAC and LTV not yet calculated |
| H3 Operational independence | 2 | Business depends entirely on Jeff |
| H4 Financial controls | 3 | Separate business account exists, no monthly P&L |
| H5 Process documentation | 3 | Some processes documented via Claude conversations |

### Master Rollup

| # | Department | Score | Weight | Weighted |
|---|-----------|-------|--------|----------|
| 1 | Architect | 3.4 | × 10% | 0.34 |
| 2 | Builder | 4.0 | × 15% | 0.60 |
| 3 | Inspector | 2.6 | × 10% | 0.26 |
| 4 | Evaluator | 2.0 | × 5% | 0.10 |
| 5 | Strategist | 3.0 | × 15% | 0.45 |
| 6 | Creator | 2.8 | × 15% | 0.42 |
| 7 | Analyst | 2.4 | × 15% | 0.36 |
| 8 | Auditor | 2.6 | × 15% | 0.39 |
| | | | **Sum:** | **2.92** |
| | | | **× 20 =** | **58.4 / 100** |

### Interpretation

**Score: 58.4 — Grade: D**

This is a realistic first-quarter score for a solo developer building a new business. The code is the strongest area (Builder at 4.0). The biggest gaps are on the business measurement side (Analyst at 2.4) and acquisition readiness (Evaluator at 2.0).

**Top 3 priorities for next quarter:**
1. **Evaluator: Create TECH_DEBT.md and 3 of the missing documentation files.** This is the lowest score and the easiest to improve quickly.
2. **Analyst: Set up a reporting cadence and UTM tracking on all links.** Can't improve what you can't measure.
3. **Inspector: Establish the three-session review process for all new features.** Prevents bugs from reaching production.

**Target for next quarter: 65+ (C grade).** Achievable by improving the three lowest departments by 1 point each.
