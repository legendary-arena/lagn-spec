---
title: Homepage Marketing Scorecard
type: Guide
tags:
  - layer-marketing
  - storybrand
  - homepage
  - scoring
  - governance
related:
  - homepage-spec.md
  - homepage-appendix.md
  - homepage-review-template.md
  - scoring.md
  - hugo-web-system.md
  - brevo-email-pipeline.md
status: draft
source:
  - ../docs/01-VISION.md
  - ../docs/ai/work-packets/WP-149-public-leaderboard-marketing-page.md
last-reviewed: 2026-05-15
---

# Homepage Marketing Scorecard

## Summary

A graded readiness assessment of `www.legendary-arena.com`'s homepage
against the StoryBrand SB7 framework (Donald Miller) and a
game-specific Player Needs Pyramid derived from Maslow's hierarchy.
The build spec (draft copy, checklist, final homepage output) lives at
`C:\www\legendary-arena-com\docs\marketing\homepage-spec.md`. The
strategy appendix (Player Needs Pyramid, 20-problem catalog, badge
architecture) lives at
`C:\www\legendary-arena-com\docs\marketing\homepage-appendix.md`.
This page is the scorecard summary; the spec is the authoritative
build document.

## Mechanics

The homepage is evaluated against three questions that every visitor
must be able to answer. Each question maps to specific SB7 elements
and is graded independently. The overall grade is the lowest of the
three — the homepage is only as strong as its weakest section.

### Scoring Model

The homepage is graded on a standard letter scale per question:

| Grade | Meaning |
|-------|---------|
| A | Fully implemented, copy-complete, all checklist items pass |
| B | Structurally present, minor gaps in copy or placement |
| C | Partially present — key elements exist but are poorly sequenced, incomplete, or missing support |
| D | Minimal presence — one or two elements exist but the section doesn't function |
| F | Not present |

### Current Grades (2026-05-15)

| # | Question | SB7 Elements | Grade | Summary |
|---|----------|-------------|-------|---------|
| 1 | **What is the problem?** | Character, Problem (villain + 3 levels), Guide (empathy) | **F** | Not stated at any level. No villain, no pain points, no empathy statement. The homepage opens with product-voice. |
| 2 | **What is the product?** | Guide (authority), Plan (process + agreement), Call to Action (direct + transitional) | **C+** | Three strong differentiating pillars exist ("Skill decides," "Mastery is earned," "The rules don't drift") but are poorly sequenced (appear before problem context). No process plan, no agreement plan, no transitional CTA, single CTA placement, no product visual. |
| 3 | **What are the results?** | Avoid Failure, Ends in Success (3 resolutions), Identity Transformation | **F** | No testimonials, no player counts, no community metrics, no failure stakes, no success vision, no identity transformation. Visitor asked to "Play now" on faith alone. |

**Overall: F** — the homepage has strong product-differentiation copy
and solid infrastructure (tournaments, products, newsletter) but
communicates none of the three questions effectively to a cold visitor.

### Player Needs Pyramid Alignment

The product satisfies all five levels of the Player Needs Pyramid. The
homepage communicates none of them.

| Level | Player Need | Product Meets? | Homepage Communicates? |
|-------|------------|---------------|----------------------|
| 5. Mastery & Meaning | Deep strategy, growth, identity | Yes | No |
| 4. Recognition | Skill measurement, provable rank | Yes | No |
| 3. Community | Cooperative play, shared experience | Yes | No (footer only) |
| 2. Trust & Fairness | No pay-to-win, verifiable, deterministic | Yes | No |
| 1. Access & Performance | Instant play, no friction, recoverable | Yes | No |

The homepage's deepest differentiator is **Level 2: Trust & Fairness**
— an uncommon and defensible position. Most games compete at levels
3-4. The pay-to-win villain lives at Level 2 and should anchor the
homepage problem section.

### Grade History

| Date | Q1 (Problem) | Q2 (Product) | Q3 (Results) | Overall | Notes |
|------|-------------|-------------|-------------|---------|-------|
| 2026-05-15 | F | C+ | F | F | Initial assessment. Strong pillars exist but no SB7 story arc. |

Update this table each time a homepage WP closes that changes the
grade. The full template in the marketing repo contains the detailed
checklist for re-evaluation.

## Interactions

- **[Scoring](scoring.md)** — The PAR scoring system is the foundation
  of the Level 4 (Recognition) and Level 5 (Mastery) player needs.
  Homepage messaging about provable rank and replay-verified
  leaderboards depends on the scoring system's integrity.
- **[Hugo Web System](hugo-web-system.md)** — The homepage is a Hugo
  template (`layouts/index.html`) consuming front-matter from
  `content/_index.md`. Implementation of new homepage sections requires
  Hugo layout changes.
- **[Brevo Email Pipeline](brevo-email-pipeline.md)** — The email
  capture CTA on the homepage feeds into the Brevo nurture sequence.
  The template recommends promoting email capture from the footer to
  the homepage body.
- **WP-149 (Public Leaderboard)** — The leaderboard page at
  `/leaderboard/` is the first public recognition surface. The homepage
  can link to it as proof of the recognition system.
- **WP-022 (Homepage)** — The most recent homepage WP added the hero
  image, upcoming tournaments, and featured products sections.

## Edge Cases

- **Grade inflation risk.** Partial implementation of a section (e.g.,
  adding a process plan without an agreement plan) may tempt a grade
  bump that doesn't reflect visitor experience. The launch checklist in
  the full template is binary — all items in a section must pass for
  the section to clear.
- **Stale grades.** If the homepage changes without updating this
  scorecard, the grades drift. The `last-reviewed` date in front-matter
  is the staleness signal. Re-evaluate when any homepage WP closes.
- **Copy vs. structure.** The template contains draft copy blocks, but
  final copy is a marketing decision. The grades evaluate whether the
  *structural elements* are present and correctly sequenced, not
  whether the specific draft copy was used verbatim.

## References

- `C:\www\legendary-arena-com\docs\marketing\homepage-spec.md`
  — homepage build document (what to ship)
- `C:\www\legendary-arena-com\docs\marketing\homepage-appendix.md`
  — strategy reference (Maslow, 20-problem catalog, badge architecture)
- `C:\www\legendary-arena-com\docs\marketing\homepage-review-template.md`
  — original monolithic review template (superseded by spec + appendix)
- [01-VISION.md](../docs/01-VISION.md) — marketing site vision and
  decisions
- [WP-149](../docs/ai/work-packets/WP-149-public-leaderboard-marketing-page.md)
  — public leaderboard marketing page
- [WP-022](https://github.com/legendary-arena/legendary-arena-website)
  — homepage hero, tournaments, and featured products (marketing repo)
- *Building a StoryBrand* by Donald Miller — SB7 framework source
- Business Made Simple website template — BMS website methodology
