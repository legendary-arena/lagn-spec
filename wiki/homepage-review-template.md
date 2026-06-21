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
last-reviewed: 2026-06-16
---

# Homepage Review Template

> **Editing this page**
>
> This ewiki page describes the marketing review template. The full
> source document lives at
> `C:\www\legendary-arena-com\docs\marketing\homepage-review-template.md`
> (in the `legendary-arena-website` repo, not this repo).
>
> - **To edit the source document:** edit the file in the marketing repo,
>   commit with `SPEC:` prefix, push to `main`.
> - **To edit this ewiki page:** edit
>   `C:\pcloud\BB\DEV\legendary-arena\wiki\homepage-review-template.md`,
>   commit with `SPEC:` prefix, push to `main` in the `legendary-arena` repo.
> - **Keep both in sync.** If the source document's scope or structure
>   changes, update this ewiki page too.

## Summary

The marketing **audit instrument** for `www.legendary-arena.com`'s
homepage. It evaluates the homepage against three questions (What is the
problem? What is the product? What are the results?) using the StoryBrand
SB7 framework, produces a current-state grade and a GO / NO-GO decision,
and applies a conversion-layer overlay (the Sales Conversion Audit).

This document was originally the comprehensive, single-file marketing
review. Its content has since been split — the build requirements moved to
[Homepage Spec](homepage-spec.md) and the strategy/theory to
[Homepage Appendix](homepage-appendix.md) — and the template was then
**deduplicated to the review layer only**. It no longer restates the
Player Needs Pyramid, the problem catalog, the copy blocks, or the
readiness checklist; it links to their single owners and holds just the
audit.

## Mechanics

The template is now a thin instrument with three parts:

1. **How to Run This Review** — read the homepage as a cold visitor; grade
   it against the readiness checklist, GO / NO-GO rule, and critical fail
   conditions in [Homepage Spec](homepage-spec.md) (the single canonical
   copy of those criteria); run the Sales Conversion Audit; record the
   result.

2. **Current-State Audit** — the review's deliverable. Per-question grades
   (currently Problem F, Product C+, Results F), element-level audits for
   hero / product / results, and a note on existing infrastructure
   (tournaments, products, newsletter, community links — present but
   under-promoted). This is the point-in-time scorecard; re-grade it when
   the homepage changes.

3. **Sales Conversion Audit** — a conversion-layer overlay derived from
   sales-process principles. Six binary checks: outcome-not-product,
   reality gap, diagnosis before prescription, objection prevention,
   direct ask, and follow-up path. Confirms the page moves a visitor from
   problem recognition to a decision, not just that the SB7 story elements
   exist.

### Single-source ownership (post-dedup)

| Content | Lives in |
|---------|----------|
| Hero spec, problem/product/results copy, reference build, CTA language bank, objection-handling section, readiness checklist, GO / NO-GO, critical fail conditions, recommended flow | [Homepage Spec](homepage-spec.md) |
| Player Needs Pyramid, 28-problem catalog, badge architecture, L2→L4 analysis, Reality Gap model, Objection Library, content framework, physical-vs-digital truth table | [Homepage Appendix](homepage-appendix.md) |
| How-to-run, current-state scorecard, Sales Conversion Audit | This page's source document |

Re-adding build copy or strategy theory to the review template
re-introduces drift (that is how the template once read "20 problems"
while the catalog had grown to 28). Send build changes to the spec and
strategy changes to the appendix.

## Interactions

- **[Homepage Spec](homepage-spec.md)** — the build document and the
  single source of the readiness checklist, GO / NO-GO, and critical fail
  conditions the review grades against.
- **[Homepage Appendix](homepage-appendix.md)** — the strategy reference
  (pyramid, problem catalog, Reality Gap model, Objection Library, content
  framework).
- **[Homepage Marketing Scorecard](homepage-marketing-scorecard.md)** —
  the recorded grade, produced by running this review.
- **[Scoring](scoring.md)** — PAR scoring underpins the recognition and
  skill-measurement entries in the appendix catalog.

## Edge Cases

- **Thin by design.** If this template starts to re-describe the pyramid,
  the catalog, or copy blocks, it is drifting back toward the old monolith.
  Keep it to the review layer.
- **Build status vs. marketing grade.** The spec's recommended-flow table
  keeps a per-section build status ("Exists / Needs creation"); the
  marketing-quality grade lives here in the current-state audit. They are
  two different lenses, intentionally kept apart.
- **Copy and grades are point-in-time.** The current-state audit reflects
  the homepage on its "last recorded" date; re-grade after changes. Final
  copy is a marketing decision — the audit evaluates structural presence,
  not specific wording.

## References

- `C:\www\legendary-arena-com\docs\marketing\homepage-review-template.md`
  — the review template source (authoritative)
- `C:\www\legendary-arena-com\docs\marketing\homepage-spec.md`
  — build document
- `C:\www\legendary-arena-com\docs\marketing\homepage-appendix.md`
  — strategy reference
- [01-VISION.md](../docs/01-VISION.md) — marketing site vision and
  decisions
- [WP-149](../docs/ai/work-packets/WP-149-public-leaderboard-marketing-page.md)
  — public leaderboard marketing page
- [PR #30](https://github.com/legendary-arena/legendary-arena-website/pull/30)
  — original template commit
- *Building a StoryBrand* by Donald Miller — SB7 framework source
