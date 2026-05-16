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
status: deprecated
source:
  - ../docs/01-VISION.md
last-reviewed: 2026-05-15
---

# Homepage Review Template

## Summary

**Deprecated.** Superseded by [Homepage Spec](homepage-spec.md) (build
document) and [Homepage Appendix](homepage-appendix.md) (strategy
reference) as of 2026-05-15. The original monolithic review template
combined both functions — homepage build spec and deep strategy
analysis — in a single document. The split separates execution context
from theoretical depth, reducing cognitive load for implementers.

The original file is preserved at
`C:\www\legendary-arena-com\docs\marketing\homepage-review-template.md`
for historical reference.

## Mechanics

The original template evaluated the homepage against three questions
(What is the problem? What is the product? What are the results?)
using the StoryBrand SB7 framework and a game-specific Player Needs
Pyramid. It contained:

- Hero section specification with grunt test
- SB7 rationale and current-state audit for each question
- Draft homepage copy blocks
- Player Needs Pyramid with five levels and per-level analysis
- 20-problem catalog under three themes
- Badge system architecture
- L2→L4 trust-to-recognition dependency analysis
- Recommended homepage flow table
- 9-section readiness checklist
- 10 critical fail conditions

All content has been migrated to the spec and appendix:

| Content | Migrated To |
|---------|------------|
| Hero spec, copy blocks, checklist, flow table, fail conditions | [Homepage Spec](homepage-spec.md) |
| Player Needs Pyramid, 20-problem catalog, badge architecture, L2→L4 analysis | [Homepage Appendix](homepage-appendix.md) |
| Graded assessment, grade history | [Homepage Marketing Scorecard](homepage-marketing-scorecard.md) |

New content added in the migration (not present in the original):

- Core Positioning statement (spec)
- Final Homepage Output reference build (spec)
- Severity-tiered GO / NO-GO (spec)
- Content framework for newsletters, blogs, and emails (appendix)

## Interactions

- **[Homepage Spec](homepage-spec.md)** — The build document that
  replaced this template's execution content.
- **[Homepage Appendix](homepage-appendix.md)** — The strategy
  reference that replaced this template's theoretical content.
- **[Homepage Marketing Scorecard](homepage-marketing-scorecard.md)** —
  The scorecard was created alongside this template and survives
  independently as the grading surface.

## Edge Cases

- **The original file still exists in the marketing repo.** It was
  committed and merged via PR #30. It has not been deleted because
  it is referenced by the PR history and may be useful for reviewing
  the evolution of the spec. It should not be edited — all changes
  go to the spec or appendix.
- **Links to this ewiki page.** Any future links should redirect to
  [Homepage Spec](homepage-spec.md) for build concerns or
  [Homepage Appendix](homepage-appendix.md) for strategy concerns.

## References

- `C:\www\legendary-arena-com\docs\marketing\homepage-review-template.md`
  — original monolithic template (preserved, not maintained)
- `C:\www\legendary-arena-com\docs\marketing\homepage-spec.md`
  — replacement build document
- `C:\www\legendary-arena-com\docs\marketing\homepage-appendix.md`
  — replacement strategy reference
- [PR #30](https://github.com/legendary-arena/legendary-arena-website/pull/30)
  — original template commit
