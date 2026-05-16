---
title: Homepage Spec
type: Guide
tags:
  - layer-marketing
  - storybrand
  - homepage
  - build-document
related:
  - homepage-marketing-scorecard.md
  - homepage-appendix.md
  - homepage-review-template.md
  - scoring.md
  - hugo-web-system.md
status: draft
source:
  - ../docs/01-VISION.md
  - ../docs/ai/work-packets/WP-149-public-leaderboard-marketing-page.md
last-reviewed: 2026-05-15
---

# Homepage Spec

## Summary

The build document for `www.legendary-arena.com`'s homepage. Contains
everything a designer or developer needs to ship: Core Positioning
statement, hero copy, Problem → Product → Result sections with
implementation-ready copy, the Final Homepage Output (assembled
reference build), the recommended section flow, and the 9-section
readiness checklist with severity-tiered GO / NO-GO rules. This is
the authoritative spec for what to build; the companion
[Homepage Appendix](homepage-appendix.md) explains why.

## Mechanics

The spec is structured around three questions every homepage must
answer in order:

1. **What is the problem?** — Names the villain (pay-to-win), states
   the external, internal, and philosophical problem levels, provides
   an empathy statement, and lists the Core 5 problems.
2. **What is the product?** — Category + benefit label, three locked
   pillars (Skill decides / Mastery is earned / The rules don't drift),
   process plan (3 steps), and agreement plan (The Fair Play Promise).
3. **What are the results?** — Failure stakes, success vision across
   three resolutions, identity transformation (from/to), and required
   proof elements (testimonials, metrics, community signals).

The spec also includes:

- **Core Positioning** — three-line foundation for all messaging.
- **Hero Specification** — grunt test requirements, headline, subhead,
  dual CTAs, and visual requirements.
- **Player Needs** — condensed 5-line priority list (Access → Trust →
  Community → Recognition → Mastery) with a pointer to the full
  pyramid in the appendix.
- **Final Homepage Output** — the assembled page as a reference build,
  showing Hero → Problem → Product → Plan → Results → Proof → CTA in
  shipping form.
- **Recommended Flow Table** — 18-row section sequence mapping each
  section to its SB7 element, question, and current status.
- **Readiness Checklist** — 9 sections with binary pass/fail items.
- **GO / NO-GO** — severity-tiered (Blocker / Major / Minor) with
  10 critical fail conditions.

### Frameworks Applied

- **StoryBrand SB7** (Donald Miller) — 7 principles: Character,
  Problem, Guide, Plan, Call to Action, Avoid Failure, Ends in Success.
- **Business Made Simple website template** — grunt test, CTA placement
  strategy, hero section requirements.
- **PAS** (Problem → Agitate → Solution) — used for the direct sales
  mode in the content framework.

## Interactions

- **[Homepage Marketing Scorecard](homepage-marketing-scorecard.md)** —
  The scorecard grades the homepage against the spec's three questions.
  When the spec's checklist items are implemented, the scorecard grades
  should be re-evaluated.
- **[Homepage Appendix](homepage-appendix.md)** — The spec references
  the appendix for deep theory: full Player Needs Pyramid, 20-problem
  catalog, badge system architecture, L2→L4 dependency analysis, and
  the content framework for newsletters/blogs/emails.
- **[Scoring](scoring.md)** — The PAR scoring system underpins the
  spec's recognition and plan sections. The "Earn your rank" step in
  the process plan depends on PAR being live.
- **[Hugo Web System](hugo-web-system.md)** — The homepage is a Hugo
  template. Implementing the spec requires Hugo layout changes to
  `layouts/index.html` and front-matter additions to
  `content/_index.md`.

## Edge Cases

- **Spec vs. final copy.** The spec contains draft copy blocks as
  implementation targets, not final marketing copy. The copy may be
  refined during implementation, but the structural elements (section
  order, SB7 mapping, checklist items) are non-negotiable.
- **Final Homepage Output is a reference, not a wireframe.** It shows
  content and sequence, not layout or visual design. Designers should
  treat it as a content brief, not a mockup.
- **Severity tiers are not optional.** Blocker items must be resolved
  before any ship decision. Major items must be resolved before
  marketing spend. Skipping the tiering and treating all items equally
  defeats the purpose of the triage system.

## References

- `C:\www\legendary-arena-com\docs\marketing\homepage-spec.md`
  — the build document (authoritative)
- `C:\www\legendary-arena-com\docs\marketing\homepage-appendix.md`
  — companion strategy reference
- [01-VISION.md](../docs/01-VISION.md) — marketing site vision and
  decisions
- [WP-149](../docs/ai/work-packets/WP-149-public-leaderboard-marketing-page.md)
  — public leaderboard marketing page
- *Building a StoryBrand* by Donald Miller — SB7 framework source
- Business Made Simple website template — BMS website methodology
