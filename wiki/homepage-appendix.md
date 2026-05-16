---
title: Homepage Appendix
type: Guide
tags:
  - layer-marketing
  - storybrand
  - homepage
  - maslow
  - content-strategy
related:
  - homepage-spec.md
  - homepage-marketing-scorecard.md
  - homepage-review-template.md
  - scoring.md
  - brevo-email-pipeline.md
status: draft
source:
  - ../docs/01-VISION.md
  - ../docs/ai/work-packets/WP-149-public-leaderboard-marketing-page.md
last-reviewed: 2026-05-15
---

# Homepage Appendix

## Summary

The strategy reference companion to [Homepage Spec](homepage-spec.md).
Contains the full theoretical foundation, research, and architecture
that supports the homepage build document: the Player Needs Pyramid
(game-specific Maslow hierarchy with five levels), the complete
20-problem catalog organized under three themes (Fairness, Skill
Measurement, Authenticity), the badge system architecture, the L2→L4
trust-to-recognition dependency analysis, and the content framework
for applying Problem → Product → Result across newsletters, blogs,
and emails. Designers and developers work from the spec; this appendix
answers "why" when the spec says "what."

## Mechanics

### Player Needs Pyramid

A five-level game-specific translation of Maslow's hierarchy of needs,
grounded in StoryBrand's insight that the brain processes needs in
order — lower levels must be satisfied before higher-level messaging
lands.

1. **Access & Performance** (Physiological) — Can I play easily?
2. **Trust & Fairness** (Safety) — Is this fair?
3. **Community** (Belonging) — Are others here?
4. **Recognition** (Esteem) — Does my skill matter?
5. **Mastery & Meaning** (Self-Actualization) — Can I improve?

Legendary Arena satisfies all five. The homepage communicates none.
The product's deepest differentiator is Level 2 (Trust & Fairness) —
an uncommon and defensible position.

Each level includes a per-need table mapping player needs to how LA
meets them, which problems from the catalog are addressed, homepage
copy opportunities, and section mapping.

### L2 → L4 Dependency

The most important structural relationship in the pyramid. Recognition
systems (Level 4) only work when the underlying trust layer (Level 2)
is enforced. Most games break esteem by rewarding time over skill,
inflating achievements, or allowing pay-to-win to corrupt rankings.
LA's recognition is fundamentally different because Level 2 is
rigorously enforced — recognition is replay-verified, skill-based,
provable, and deterministic.

### 20-Problem Catalog

Twenty customer-facing problems derived from the Vision document, work
packets, and engine architecture, organized under three themes:

| Theme | Villain | Problems | Core Emotion |
|-------|---------|----------|-------------|
| Fairness | Pay-to-win model | #1–#6 | "It's rigged" |
| Skill Measurement | Opaque systems | #7–#10 | "I can't prove I'm good" |
| Authenticity | Unfaithful adaptations | #11–#20 | "This isn't the real game" |

Each problem includes the customer-facing statement, how LA solves it,
the SB7 problem level (external / internal / philosophical), and the
source specification reference.

The homepage surfaces the Core 5 (condensed in the spec); the full 20
live here as raw materials for ad campaigns, email sequences, and
social content.

### Badge System Architecture

Five badge categories (Skill, Progression, Recognition, Challenge,
Legacy), each targeting a specific esteem driver. Includes the badge
metadata model, five non-negotiable design rules (replay-verified,
public, tiered, balanced rarity, no participation badges), and
analysis of how the L2→L4 dependency makes badges carry real weight.

### Content Framework

Guidance for applying Problem → Product → Result beyond the homepage.
Three content modes:

| Mode | Structure | Used For |
|------|-----------|----------|
| **A — Sales** | Problem → Agitate → Product → Result → CTA | Landing pages, campaign emails, ads |
| **B — Narrative** | Story/Hook → Problem (implicit) → Insight → Result | Newsletters, community posts |
| **C — Authority** | Problem → Analysis → System → Result → Expansion | Blog posts, guides |

Master rule: every piece of content contains problem, solution, and
result — but only sales content should visibly look like it. Includes
a concrete newsletter example in LA's voice and a content type
reference table.

## Interactions

- **[Homepage Spec](homepage-spec.md)** — The spec is the build
  document that consumes this appendix. The spec's Governing Principles
  include a cross-reference to the content framework. The spec's
  Player Needs section points here for the full pyramid breakdown.
- **[Homepage Marketing Scorecard](homepage-marketing-scorecard.md)** —
  The scorecard's Player Needs Pyramid alignment table is derived from
  the pyramid analysis in this appendix.
- **[Scoring](scoring.md)** — PAR scoring is the foundation of the
  Level 4 (Recognition) analysis. The 20-problem catalog references
  PAR in problems #5, #6, #7, and #9.
- **[Brevo Email Pipeline](brevo-email-pipeline.md)** — The content
  framework's Mode B (Narrative) applies directly to Brevo nurture
  sequences. The newsletter example in the content framework is
  written for the Brevo pipeline.

## Edge Cases

- **Pyramid is descriptive, not prescriptive.** The pyramid describes
  player psychology and messaging priority. It does not govern engine
  architecture or feature prioritization — those are driven by work
  packets and the Vision document.
- **Problem catalog is customer-facing language.** The 20 problems
  are written for marketing consumption, not engineering precision.
  The "Solved by" descriptions are simplified; the source references
  point to the precise specifications.
- **Content framework modes are guidelines, not templates.** Rigid
  application of any single mode across all content will cause pattern
  fatigue and erode trust — especially dangerous for a brand built on
  Level 2 (Trust).
- **Badge architecture is pre-implementation.** The badge metadata
  model and category system are design specifications, not implemented
  features. No WP has been drafted for badge implementation.

## References

- `C:\www\legendary-arena-com\docs\marketing\homepage-appendix.md`
  — the strategy reference document (authoritative)
- `C:\www\legendary-arena-com\docs\marketing\homepage-spec.md`
  — companion build document
- [01-VISION.md](../docs/01-VISION.md) — marketing site vision and
  decisions
- [WP-149](../docs/ai/work-packets/WP-149-public-leaderboard-marketing-page.md)
  — public leaderboard marketing page
- *Building a StoryBrand* by Donald Miller — SB7 framework source,
  Maslow hierarchy application
- Business Made Simple website template — BMS website methodology
