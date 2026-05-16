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

> **Editing this page**
>
> This ewiki page mirrors the homepage build document. The source lives at
> `C:\www\legendary-arena-com\docs\marketing\homepage-spec.md`
> (in the `legendary-arena-website` repo, not this repo).
>
> - **To edit the source document:** edit the file in the marketing repo,
>   commit with `SPEC:` prefix, push to `main`.
> - **To edit this ewiki page:** edit
>   `C:\pcloud\BB\DEV\legendary-arena\wiki\homepage-spec.md`,
>   commit with `SPEC:` prefix, push to `main` in the `legendary-arena` repo.
> - **Keep both in sync.** If the source document changes, update this
>   ewiki page too.

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

Every homepage must answer three questions in order. If a visitor can't
answer all three within a few seconds of scrolling, the page isn't doing
its job.

### Governing Principles (from *Building a StoryBrand*)

- **The customer is the hero, not your brand.** Position the customer as
  the hero and Legendary Arena as the guide.
- **Clarity over cleverness.** Visitors decide within seconds. If they
  can't pass the "grunt test" (could a caveman glance at the site and
  grunt what we offer, how it improves their life, and how to get it?),
  the page fails.
- **People don't buy the best products; they buy the products they can
  understand the fastest.**
- **Customers buy solutions to internal problems.** The purchase decision
  is driven by how the problem makes the customer *feel*.
- **Write it in Morse code.** Brief, punchy, relevant. No paragraphs
  above the fold.
- **Repetition drives action.** CTAs must appear multiple times — hero,
  top-right nav, and repeated as the visitor scrolls.
- **Problem-first across all channels.** The Problem → Product → Result
  structure applies to newsletters, blogs, and emails — but the surface
  structure varies by content type. See
  [Homepage Appendix § Content Framework](homepage-appendix.md) for
  Mode A (Sales), Mode B (Narrative), and Mode C (Authority) guidance.

---

### Core Positioning

Legendary Arena is the only card game where:

- Every game is fair
- Every result is provable
- Every rank means something

This is the foundation of all messaging.

---

### Hero Section Specification (Grunt Test)

The hero must communicate the offer in under 5 seconds with zero
ambiguity. A new visitor must answer three questions without scrolling:

1. What is this?
2. How does it help me?
3. How do I start?

If any answer requires scrolling, the hero fails.

#### Required Structure

**1. Category + Benefit Headline**

> A card game where the best player wins — not the biggest spender

**2. Pain-driven Subhead**

> No pay-to-win. No hidden rules. Every match is decided by skill.

**3. Direct CTA (Primary)**

> Play Free

Must be above the fold. Button color must differ from everything else
on the page.

**4. Transitional CTA (Secondary)**

> Watch gameplay

For visitors not ready to commit. Placed next to or below the direct
CTA.

**5. Hero Visual**

Screenshot, gameplay video, or illustrated scene showing the product
in action. Not a placeholder SVG. Not a logo. Not abstract art.

#### Current State

| Element | Required | Present? |
|---------|----------|----------|
| Category + benefit headline | Yes | No — "The arena awaits" tells a cold visitor nothing |
| Pain-driven subhead | Yes | No — "Assemble your heroes..." assumes deck-building vocabulary |
| Direct CTA above fold | Yes | Partial — "Play now" exists but visitor has no context yet |
| Transitional CTA | Yes | No |
| Hero visual | Yes | No — placeholder SVG |

---

### Player Needs (Priority Order)

1. **Access** — can I play easily?
2. **Trust** — is this fair?
3. **Community** — are others here?
4. **Recognition** — does my skill matter?
5. **Mastery** — can I improve?

Legendary Arena satisfies all five — but the homepage must communicate
them in this order. If the homepage leads with Level 5 messaging
("become a master strategist") before establishing Level 2 ("this game
is fair"), the higher-level promise has no foundation and won't land.

The product's deepest differentiator is **Level 2: Trust & Fairness** —
an uncommon and defensible position. Most games compete at levels 3-4.
The pay-to-win villain lives at Level 2 and should anchor the homepage
problem section.

Full pyramid breakdown with per-level analysis:
[Homepage Appendix § Player Needs Pyramid](homepage-appendix.md)

---

### 1. What is the problem?

**SB7 elements: The Character + Has a Problem + Meets a Guide (empathy)**

The visitor needs to see their own frustration reflected back at them
before they'll care about a solution.

#### The Character and Their Desire

A story doesn't pick up until the hero wants something. The homepage must
define a single, clear desire:

| Criterion | Target | Current State |
|-----------|--------|---------------|
| **Single customer desire** | "A card game that rewards your brain, not your wallet." | Not defined. Homepage speaks in product-voice. |
| **Story gap** | Gap between where the customer is and where they want to be — keeps them scrolling. | No story gap opened. |

#### The Villain + Three Levels

Every good story needs a villain — a root cause the audience can point
to. The villain causes problems on three levels:

- **External problem:** The tangible, surface-level frustration.
- **Internal problem:** How the external problem makes the hero *feel*.
  This is what actually drives the purchase.
- **Philosophical problem:** Why it's simply *wrong* that people have to
  deal with this.

| Criterion | Target | Current State |
|-----------|--------|---------------|
| **The villain** | The pay-to-win model — sells power instead of rewarding skill. Relatable, singular, real, dastardly. | Not named. |
| **External problem** | "Card games lock the best cards behind paywalls and time-gates." | Not present. |
| **Internal problem** | "It makes you feel like the game is rigged — like no amount of skill matters if someone else spent more." | Not present. |
| **Philosophical problem** | "Games *should* be won by the smartest player, not the biggest spender." | Not present. |
| **Empathy statement** | Copy that mirrors the customer's frustration — proving the guide understands. | Not present. |

#### Core Problems Legendary Arena Solves

1. Pay-to-win systems make skill irrelevant
2. Hidden mechanics make outcomes untrustworthy
3. Rankings don't reflect real ability
4. Digital versions don't match the real game
5. Players can't learn from their mistakes

Full 20-problem catalog with SB7 mappings and source references:
[Homepage Appendix § Problems Catalog](homepage-appendix.md)

#### Problem Section (Homepage Copy)

**Headline**

> Tired of games where the biggest wallet wins — not the best player?

**Villain Statement**

> The pay-to-win model ruins competitive play.

**Three Levels**

- **External:** Top decks are locked behind money or grind.
- **Internal:** It feels like your skill doesn't matter.
- **Philosophical:** Games should reward thinking — not spending.

**Empathy**

> We've played those games too. It's frustrating.

#### Current State

The homepage skips the problem entirely. It opens with product-voice
("The arena awaits") and moves straight into feature pillars. No villain,
no named frustration, no empathy statement.

**Grade: F** — problem is not stated at any level.

---

### 2. What is the product?

**SB7 elements: Meets a Guide (authority) + Gives Them a Plan + Calls Them to Action**

Once the visitor sees their problem on screen, the page earns the right
to present a solution.

#### Section Ordering Rule

The product section must appear *after* the problem is established.
Non-negotiable. The pillars exist to resolve the three levels of
problem — if the problem hasn't been stated, the pillars have nothing to
resolve.

#### The Guide (Authority)

The guide has two qualities: empathy (covered in the problem section) and
**authority** — demonstrated competence. Authority signals include
testimonials, statistics, awards, and logos.

**Trust = Empathy + Authority.** Both halves are required.

#### The Plan

Even after empathy, authority, and a clear product, the customer won't
commit without a plan:

- **Process plan:** Step-by-step instructions — alleviates *confusion*.
- **Agreement plan:** Promises addressing fears — alleviates *fear*.

#### The Call to Action

- **Direct CTA:** Clear, bold, repeated invitation to commit. Use direct
  verbs: "Play Now," "Start a Match," "Join Free."
- **Transitional CTA:** Lower-risk step for visitors not ready to commit.
  "Watch a 2-min demo," "Join the Discord."

Both types must be present. Direct CTA in 3+ locations minimum: hero,
top-right nav, and repeated per section.

#### Product Section (Homepage Copy)

**Category + Benefit**

> A web-based deck-building game where skill decides every match.

**3 Pillars (Locked Messaging)**

Each pillar maps 1:1 to a problem level:

| Problem Level | Pillar | Copy |
|---------------|--------|------|
| External | **Skill decides** | Win based on decisions, not purchases. |
| Internal | **Mastery is earned** | Improve through strategy, not grind. |
| Philosophical | **The rules don't drift** | No balance changes that invalidate your skill. |

**Process Plan (Removes Confusion)**

> 1. Build your deck
> 2. Play the scenario
> 3. Earn your rank

**Agreement Plan (Removes Fear)**

> **The Fair Play Promise**
> - No pay-to-win
> - No artificial time-gates
> - No disruptive balance patches

#### Recognition You Can Trust

The recognition system (leaderboards, PAR scoring, badges) works because
Level 2 (Trust & Fairness) is rigorously enforced. Recognition is earned
through replay-verified performance. Rankings are skill-based, not
volume-based. Achievements are provable and deterministic.

> Your rank reflects how well you play — not how much you grind.

> Every score is replay-verified.

> If you earn it here, it's real.

Full recognition architecture (L2→L4 dependency, WP-149 leaderboard,
badge system): [Homepage Appendix § Recognition](homepage-appendix.md)

#### Current State

| Criterion | Required | Present? |
|-----------|----------|----------|
| Plain-English category label | Yes | No — buried in meta description |
| Benefit statement | Yes | No — pillars imply benefits but don't state one |
| Pillar-to-problem mapping | Yes | Partial — pillars exist but appear before problem |
| Process plan | Yes | Partial — subhead reads as tagline, not a plan |
| Agreement plan | Yes | No |
| Visual proof (screenshot/video) | Yes | No |
| Direct CTA (repeated) | Yes | Partial — one placement, hero only |
| Transitional CTA | Yes | No |

**Grade: C+** — good differentiating copy exists but is poorly sequenced,
has no plan, no transitional CTA, no visual support, and only one CTA
placement.

---

### 3. What are the results?

**SB7 elements: Avoid Failure + Ends in a Success + Identity Transformation**

The visitor now knows the problem and the product. The final question:
what happens when real people use this product?

#### Avoiding Failure (The Stakes)

A story lives and dies on the question: what's at stake? The homepage
must hint at what the customer stands to lose by *not* engaging.

Caution: fear is salt in the recipe. A pinch is essential; too much
turns customers off.

#### Ending in Success (The Vision)

The success vision should resolve all three levels of problem:

- **External resolution:** The tangible outcome.
- **Internal resolution:** How the customer will *feel*.
- **Philosophical resolution:** Why the world is now more right.

#### Identity Transformation

The homepage should define an aspirational identity — who the customer
*becomes* by engaging the brand.

#### Results Section (Homepage Copy)

**Failure Stakes**

> Stay in pay-to-win systems, and your skill will never matter.

**Success Vision**

- **External:** Every match is decided by your choices.
- **Internal:** You feel the satisfaction of real competition.
- **Philosophical:** You're part of a fair system.

**Identity Transformation**

| From | To |
|------|----|
| Grinding for cards | Competing with strategy |
| Frustrated player | Respected competitor |
| "The game is rigged" | "The game is fair" |

**Required Proof Elements**

- 2-3 player testimonials showing transformation
- Player count OR engagement metric
- Discord member count OR active tournament participation

#### Current State

| Criterion | Required | Present? |
|-----------|----------|----------|
| Failure stakes | Yes | No |
| Success vision (external) | Yes | No |
| Success vision (internal) | Yes | No |
| Success vision (philosophical) | Yes | No |
| Identity transformation | Yes | No |
| Player testimonials | Yes | No |
| Traction metrics | Yes | No |
| Community signal | Yes | No (footer only) |

The homepage provides zero evidence that anyone has used the product and
gotten a result. The visitor is asked to "Play now" on faith alone.

**Grade: F** — no stakes, no results, no proof, no transformation.

---

### Final Homepage Output (Reference Build)

This is the assembled page as it should ship. Each section references
the spec above for rationale and audit criteria.

---

**Hero**

> A card game where the best player wins — not the biggest spender
>
> No pay-to-win. No hidden rules. Every match is decided by skill.
>
> [Play Free] [Watch Gameplay]

---

**Problem**

> Tired of games where your skill doesn't matter?
>
> Pay-to-win systems lock power behind money and grind.
> It feels like the game is rigged — like no amount of skill matters
> if someone else spent more.
> Games should reward thinking — not spending.
>
> We've played those games too. It's frustrating.

---

**Product**

> A web-based deck-building game where skill decides every match.
>
> - **Skill decides.** Win based on decisions, not purchases.
> - **Mastery is earned.** Improve through strategy, not grind.
> - **The rules don't drift.** No balance changes that invalidate your skill.

---

**Plan**

> 1. Build your deck
> 2. Play the scenario
> 3. Earn your rank
>
> **The Fair Play Promise**
> - No pay-to-win
> - No artificial time-gates
> - No disruptive balance patches

---

**Results**

> Stay in pay-to-win systems, and your skill will never matter.
>
> - Every match is decided by your choices.
> - You feel the satisfaction of real competition.
> - You're part of a fair system.
>
> _From frustrated player → respected competitor._

---

**Proof**

> [Testimonials — 2-3 player transformation quotes]
> [Traction metric — sessions played / tournaments completed]
> [Community signal — Discord members / active players]

---

**CTA**

> Play Free

---

### Recommended Homepage Flow

| # | Section | SB7 Element | Question | Status |
|---|---------|-------------|----------|--------|
| 1 | **Hero: headline + subhead + CTA** | Character + grunt test | Product (above fold) | Needs rewrite |
| 2 | **Pain headline + three levels** | Problem (villain + 3 levels) | Problem | Needs creation |
| 3 | **Empathy statement** | Guide (empathy) | Problem | Needs creation |
| 4 | **CTA (first repeat)** | Call to Action (direct) | — | Needs creation |
| 5 | **Product label + pillars** | Guide (authority) | Product | Exists, needs repositioning |
| 6 | **Process plan (3 steps)** | The Plan (process) | Product | Needs creation |
| 7 | **Agreement plan** | The Plan (agreement) | Product | Needs creation |
| 8 | **CTA (second repeat)** | Call to Action (direct + transitional) | — | Needs creation |
| 9 | **Failure stakes** | Avoid Failure | Results | Needs creation |
| 10 | **Success vision** | Ends in Success (3 resolutions) | Results | Needs creation |
| 11 | **Identity transformation** | Transformation — from/to | Results | Needs creation |
| 12 | **Testimonials / player quotes** | Guide (authority) | Results | Needs creation |
| 13 | **Traction metrics** | Guide (authority) | Results | Needs creation |
| 14 | **CTA (third repeat)** | Call to Action (direct) | — | Needs creation |
| 15 | **Upcoming tournaments** | Ends in Success — active community | Results | Exists |
| 16 | **Featured products** | Ends in Success — ecosystem depth | Results | Exists |
| 17 | **Lead generator / email capture** | Call to Action (transitional) | Results | Exists in footer, needs promotion |
| 18 | **Community links** | Guide (authority) | Results | Exists in footer, needs promotion |

---

### Scoring Summary

| Question | SB7 Elements | Answered? | Grade |
|----------|-------------|-----------|-------|
| **What is the problem?** | Character, Problem (villain + 3 levels), Guide (empathy) | Not stated at any level | F |
| **What is the product?** | Guide (authority), Plan (process + agreement), Call to Action (direct + transitional) | Partially — good pillars, poor sequencing, no plan, single CTA | C+ |
| **What are the results?** | Avoid Failure, Ends in Success (3 resolutions), Identity Transformation | Not stated | F |

**Overall:** The homepage has strong product-differentiation copy and
solid infrastructure but communicates none of the three questions
effectively to a cold visitor.

---

### Homepage Readiness Checklist (SB7 + Enforcement)

**Rule:** If any item is unchecked, the homepage is a **FAIL — do not
ship.**

#### 1. Hero Section (Grunt Test — Blocker)

Must pass within 5 seconds, no scrolling.

- [ ] Category is explicitly stated (e.g., "web-based deck-building game")
- [ ] Primary benefit is clearly stated
- [ ] Headline is customer-focused (not brand-focused)
- [ ] Subhead reflects customer pain or desired outcome
- [ ] Direct CTA present (e.g., "Play Free")
- [ ] CTA uses a strong verb (no "Learn More")
- [ ] Visual supports clarity (product or outcome, not decorative)

**Grunt Test Validation**

- [ ] Visitor can answer "What is this?" immediately
- [ ] Visitor can answer "How does it help me?"
- [ ] Visitor can answer "What do I do next?"

If any answer requires interpretation or scrolling, the hero fails.

#### 2. Problem Section (Customer Hook)

**Desire + Story Gap**

- [ ] A single customer desire is clearly defined
- [ ] Desire is stated in customer language (not brand terms)
- [ ] A visible "story gap" is created

**Villain**

- [ ] A single, clear villain is explicitly stated
- [ ] Villain is external (not vague internal phrasing)
- [ ] Villain is understandable in under 2 seconds

**Problem — All Three Levels Present**

- [ ] External problem (tangible issue)
- [ ] Internal problem (emotional frustration)
- [ ] Philosophical problem ("this shouldn't be this way")

**Empathy**

- [ ] Empathy statement present
- [ ] Uses "we understand" positioning
- [ ] Reflects real customer frustration (not generic)

#### 3. Product Section (Clarity + Solution)

**Category + Benefit**

- [ ] Product category is visible above the fold or immediately after problem
- [ ] Benefit is explicit and tied to resolving the problem
- [ ] Copy passes the "fast comprehension" test

**Differentiation (3 Pillars)**

- [ ] Exactly 3 pillars (no more, no less)
- [ ] Each pillar is benefit-first (not feature-first)
- [ ] Each pillar maps to a problem level:

| Problem Level | Pillar | Mapped? |
|---------------|--------|---------|
| External | Skill decides | [ ] |
| Internal | Mastery is earned | [ ] |
| Philosophical | The rules don't drift | [ ] |

- [ ] Pillars are placed AFTER the problem section

**Visual Proof**

- [ ] Screenshot, demo, or product visualization present
- [ ] Visual shows actual use or outcome (not abstract art)

#### 4. Plan Section (Simplicity + Trust)

**Process Plan**

- [ ] Exactly 3 steps
- [ ] Steps are simple, sequential, and clear
- [ ] Removes confusion about "what do I do next"

**Agreement Plan**

- [ ] Named plan (e.g., "The Fair Play Promise")
- [ ] At least 3 commitments listed
- [ ] Addresses customer fears (risk, fairness, effort)
- [ ] Commitments are specific (no vague promises)

#### 5. CTA System (Enforced)

**Direct CTA Placements**

- [ ] CTA in top-right navigation (persistent)
- [ ] CTA in hero section
- [ ] CTA repeated after product section
- [ ] CTA repeated near bottom of page

Minimum: **4 placements.**

**CTA Quality**

- [ ] Uses direct action verbs (Play, Start, Join, Get)
- [ ] Visually distinct color (contrasts with all other UI)
- [ ] Not diluted by too many competing buttons

**Transitional CTA**

- [ ] At least one low-commitment option present
- [ ] Positioned after problem or product section

#### 6. Results Section (Closing the Sale)

**Failure Stakes**

- [ ] Clearly defined "what happens if you don't act"
- [ ] Uses moderate tension (not fear-heavy)
- [ ] Reinforces the villain's impact

**Success Vision — All Three Required**

- [ ] External outcome (what changes)
- [ ] Internal outcome (how they feel)
- [ ] Philosophical outcome (why this matters)

**Identity Transformation**

- [ ] "From / To" transformation present
- [ ] Clear aspirational identity defined

#### 7. Proof and Authority (Trust System)

**Testimonials**

- [ ] At least 2 testimonials
- [ ] Show before/after transformation
- [ ] Specific and real (not generic praise)

**Metrics / Credibility**

- [ ] At least one measurable signal (players, matches, or community
  size) OR alternative credibility

**Community Signals**

- [ ] Discord or community presence visible on homepage body
- [ ] Evidence of activity (not just a link)

#### 8. Structure and Flow (Final Validation)

- [ ] Homepage follows the required sequence:
  Hero → Problem → Empathy → Product → Plan → CTA → Results → Proof → CTA
- [ ] No major section is missing
- [ ] No section appears out of order
- [ ] Information builds logically (no premature product pitch)

#### 9. Content Quality (Scan Test)

- [ ] No paragraphs above the fold
- [ ] Copy is scannable (short lines, bullets)
- [ ] Headlines carry most of the meaning
- [ ] No jargon or internal language
- [ ] Every section answers a customer question

---

### GO / NO-GO Rule

**Severity Levels**

BLOCKER (must fix before ship):

- Hero fails grunt test (section 1)
- No problem defined at any level (section 2)
- No CTA system (section 5)
- Product appears before problem (structural flow)

MAJOR (must fix before marketing spend):

- No plan section (section 4)
- No proof or authority signals (section 7)
- No results or transformation (section 6)
- Pillars not mapped to problem levels (section 3)

MINOR (fix in next iteration):

- Copy not fully optimized
- Visual polish incomplete
- Community signals weak
- Transitional CTA placement suboptimal

**PASS conditions** — all must be true:

- All BLOCKER items resolved
- All MAJOR items resolved
- All 9 checklist sections have every box checked
- Grunt test passes (section 1)

---

### Critical Fail Conditions (Do Not Ship)

If **any** of the following are true, the homepage is not ready.

**1. Hero Clarity Failure (Grunt Test)**

Visitor cannot instantly answer: What is this? How does it help me?
What do I do next?

Impact: User bounces immediately.

**2. No Defined Problem**

No clear villain. Missing any of the 3 problem levels. No empathy
statement.

Impact: No emotional connection, no engagement.

**3. Product-First Instead of Problem-First**

Product or pillars appear before the problem is established.

Impact: Differentiation doesn't land.

**4. Missing Plan**

No 3-step process plan. No agreement/promise plan.

Impact: User hesitates at the moment of commitment and does not act.

**5. Broken CTA System**

Fewer than 4 direct CTA placements. No transitional CTA.

Impact: Even interested users don't convert.

**6. No Proof / No Authority**

No testimonials. No metrics. No visible community activity.

Impact: Requires blind trust.

**7. No Results or Transformation**

No failure stakes. No success vision. No identity transformation.

Impact: No motivation to care or continue.

**8. Weak or Misaligned Pillars**

Not 3 pillars. Not mapped 1:1 to problem levels. Feature-focused.

Impact: Differentiation collapses into a feature list.

**9. No Visual Product Proof**

No screenshot, gameplay video, or demo.

Impact: The page reads as vaporware.

**10. Structural Flow Breakdown**

Homepage does not follow: Hero → Problem → Product → Plan → Results →
Proof → CTA.

Impact: The story arc breaks.

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
