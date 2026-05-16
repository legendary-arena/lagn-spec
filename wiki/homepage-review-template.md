---
title: Homepage Review Template
type: Guide
tags:
  - layer-marketing
  - storybrand
  - homepage
related:
  - homepage-spec.md
  - homepage-appendix.md
  - homepage-marketing-scorecard.md
  - scoring.md
status: draft
source:
  - ../docs/01-VISION.md
  - ../docs/ai/work-packets/WP-149-public-leaderboard-marketing-page.md
last-reviewed: 2026-05-15
---

# Homepage Review Template

## Summary

The original comprehensive marketing review of
`www.legendary-arena.com`'s homepage. Evaluates the homepage against
three questions (What is the problem? What is the product? What are
the results?) using the StoryBrand SB7 framework and a game-specific
Player Needs Pyramid derived from Maslow's hierarchy. Contains the
full depth of SB7 rationale, current-state audit, draft copy blocks,
and detailed analysis in a single document.

The template's content was later split into two focused companions —
[Homepage Spec](homepage-spec.md) (build document) and
[Homepage Appendix](homepage-appendix.md) (strategy reference) — but
this document remains valuable as the unified, full-context view of
the homepage marketing strategy.

## Mechanics

The template evaluates the homepage against three questions, each
mapped to specific SB7 elements:

1. **What is the problem?** (Character, Problem, Guide empathy) —
   Names the villain (pay-to-win), states external, internal, and
   philosophical problem levels, provides an empathy statement.
   Includes the full 20-problem catalog under three themes (Fairness,
   Skill Measurement, Authenticity) with SB7 level mappings and source
   references.

2. **What is the product?** (Guide authority, Plan, Call to Action) —
   Category + benefit label, three locked pillars (Skill decides /
   Mastery is earned / The rules don't drift), process plan, agreement
   plan (The Fair Play Promise), CTA placement strategy.

3. **What are the results?** (Avoid Failure, Ends in Success, Identity
   Transformation) — Failure stakes, success vision across three
   resolutions, identity transformation from/to, required proof
   elements.

The template also contains:

- **Hero section specification** with grunt test requirements and
  current-state audit
- **Player Needs Pyramid** — five game-specific levels (Access, Trust,
  Community, Recognition, Mastery) with per-level analysis, homepage
  copy opportunities, and section mappings
- **L2→L4 dependency analysis** — why recognition systems require an
  enforced trust layer
- **Badge system architecture** — five categories (Skill, Progression,
  Recognition, Challenge, Legacy) with metadata model and design rules
- **Public Leaderboard (WP-149)** — three views, API contract,
  replay-verified rankings
- **Recommended homepage flow** — 18-row section sequence with SB7
  element and status mappings
- **9-section readiness checklist** with binary pass/fail items
- **10 critical fail conditions** with impact statements

### Relationship to Spec and Appendix

The template is the unified source document. The spec and appendix
split its content for different audiences:

| Content | Also In |
|---------|---------|
| Hero spec, copy blocks, checklist, flow table, fail conditions | [Homepage Spec](homepage-spec.md) |
| Player Needs Pyramid, 20-problem catalog, badge architecture, L2→L4 analysis | [Homepage Appendix](homepage-appendix.md) |

Content added in the spec/appendix that is not in this template:

- Core Positioning statement (spec)
- Final Homepage Output reference build (spec)
- Severity-tiered GO / NO-GO (spec)
- Content framework for newsletters, blogs, and emails (appendix)

## Interactions

- **[Homepage Spec](homepage-spec.md)** — The build document derived
  from this template. Contains the execution-focused content
  (hero, copy, checklist, final output) plus new additions
  (Core Positioning, severity tiers).
- **[Homepage Appendix](homepage-appendix.md)** — The strategy
  reference derived from this template. Contains the theoretical
  content (pyramid, problems, badges) plus the content framework.
- **[Homepage Marketing Scorecard](homepage-marketing-scorecard.md)** —
  The scorecard grades the homepage using the same three-question
  framework defined in this template.
- **[Scoring](scoring.md)** — PAR scoring underpins the recognition
  analysis and the 20-problem catalog entries on skill measurement.

## Edge Cases

- **Template vs. spec divergence.** The template and the spec/appendix
  may drift as the spec receives updates (e.g., the content framework
  and severity tiers exist only in the spec/appendix). The template is
  the original unified view; the spec is the current build target.
  When in doubt about what to implement, use the spec.
- **Copy blocks are drafts.** The template contains implementation-ready
  copy, but final copy is a marketing decision. The grades and
  checklist evaluate structural presence, not specific wording.

## References

- `C:\www\legendary-arena-com\docs\marketing\homepage-review-template.md`
  — the full template (authoritative)
- `C:\www\legendary-arena-com\docs\marketing\homepage-spec.md`
  — derived build document
- `C:\www\legendary-arena-com\docs\marketing\homepage-appendix.md`
  — derived strategy reference
- [01-VISION.md](../docs/01-VISION.md) — marketing site vision and
  decisions
- [WP-149](../docs/ai/work-packets/WP-149-public-leaderboard-marketing-page.md)
  — public leaderboard marketing page
- [PR #30](https://github.com/legendary-arena/legendary-arena-website/pull/30)
  — original template commit
- *Building a StoryBrand* by Donald Miller — SB7 framework source
