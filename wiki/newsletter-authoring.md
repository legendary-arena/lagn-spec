---
title: Newsletter Authoring
type: Tutorial
tags:
  - hugo
  - marketing-site
  - content-strategy
  - brevo
  - designer-reference
related:
  - blog-post-authoring.md
  - brevo-email-pipeline.md
  - ewiki-authoring.md
  - homepage-appendix.md
  - homepage-review-template.md
status: draft
source:
  - C:\www\legendary-arena-com\docs\brevo\newsletter-template.md
  - C:\www\legendary-arena-com\docs\brevo\email-automation.md
  - C:\www\legendary-arena-com\docs\04-CONTENT-CONVENTIONS.md
  - C:\www\legendary-arena-com\docs\brand\strategy.md
  - C:\www\legendary-arena-com\docs\marketing\homepage-review-template.md
  - C:\www\legendary-arena-com\docs\marketing\homepage-appendix.md
  - C:\www\legendary-arena-com\static\brand-tokens.css
last-reviewed: 2026-05-16
---

# Newsletter Authoring

> **Editing this page**
>
> This ewiki page is the authoring guide for weekly email newsletters
> sent via Brevo. Newsletter drafts live in the marketing repo at
> `C:\www\legendary-arena-com\docs\brevo\newsletter-drafts\`.
>
> - **To edit this ewiki page:** edit
>   `C:\pcloud\BB\DEV\legendary-arena\wiki\newsletter-authoring.md`,
>   commit with `SPEC:` prefix, push to `main` in the `legendary-arena` repo.
> - **Authoritative sources:** Template spec lives at
>   `C:\www\legendary-arena-com\docs\brevo\newsletter-template.md`;
>   brand voice lives at
>   `C:\www\legendary-arena-com\docs\brand\strategy.md`.

## Summary

A step-by-step guide for writing, styling, and sending weekly email
newsletters for Legendary Arena via Brevo. Covers the 10-section
email structure, Mode B (Narrative) content framework, the
blog-to-email pipeline, CTA hierarchy and rotation, UTM tracking
conventions, pre-send QA checklist, and brand voice constraints.
All newsletter content should reinforce the positioning established
in the [Homepage Review Template](homepage-review-template.md) —
the same 28-problem catalog, the same SB7 framework, the same
problem-first storytelling approach.

## Mechanics

### Quick Start

1. Write the companion blog post first (see
   [Blog Post Authoring](blog-post-authoring.md))
2. Create a newsletter draft at
   `C:\www\legendary-arena-com\docs\brevo\newsletter-drafts\week-NN.md`
3. Transfer content into the Brevo template
4. Run the pre-send QA checklist
5. Create a Brevo campaign and schedule the send

### Newsletter Draft Template

```markdown
# Newsletter Draft — Week NN

**Companion post:** `<blog-post-slug>`
**CTA:** Play | Newsletter | Tournament
**newsletter_slug:** `<blog-post-slug>`

---

## Subject line

<Sentence-case subject; no trailing punctuation; aligns with content>

## Hook

<1-2 sentences. Teaser summarizing what's in this issue.
Sets expectations and earns the scroll.>

## Tip / Strategy

<2-3 paragraphs. The main value block — actionable content
(deck-building advice, meta analysis, scenario strategy).
This is what subscribers signed up for.>

## Challenge

<Specific in-game challenge for the week. Concrete, achievable,
tied to the tip content when possible.>

## Read more

https://www.legendary-arena.com/posts/<slug>/

## CTA

[Play now](https://play.legendary-arena.com/)

## Footer

You are receiving this because you signed up at legendary-arena.com.

{{ unsubscribe }}
```

### The 10-Section Email Structure

Every newsletter follows this structure in order. Sections 1, 6,
8-10 are handled by the Brevo template; the draft covers sections
2-5.

| # | Section | Content | Author Writes? |
|---|---------|---------|----------------|
| 1 | Header | LA wordmark linking to `www.legendary-arena.com` | No (template) |
| 2 | Hook | 1-2 sentence teaser | Yes |
| 3 | Tip / Strategy | 2-3 paragraphs of actionable content | Yes |
| 4 | Challenge | Specific in-game challenge for the week | Yes |
| 5 | Read more | Link to companion blog post | Yes |
| 6 | CTA | Primary action button (play/newsletter/tournament) | Yes (type only) |
| 8 | Featured from the Shop | Single product spotlight with UTM link | Yes (product + link) |
| 9 | Share / Forward | One-line prompt to forward or share | No (template) |
| 10 | Footer | Unsubscribe, social links, org identity | No (template) |

### Content Structure (Mode B — Narrative)

Newsletters follow **Mode B (Narrative)** from the content framework
in the [Homepage Appendix](homepage-appendix.md). The structure is:

**Story/Hook -> Problem (implicit) -> Insight -> Result -> CTA (optional)**

| Element | Newsletter Mapping | Visibility |
|---------|-------------------|------------|
| Hook | Section 2 (Hook) | Explicit — earns the scroll |
| Problem | Woven into Section 3 (Tip/Strategy) | Implicit — felt, not declared |
| Insight | Section 3 body — the solution or perspective | Core value delivery |
| Result | End of Section 3 — what changes | Stated naturally |
| CTA | Section 6 — action button | Optional feel, always present |

#### How Mode B Differs from Mode A and Mode C

| Mode | Used For | Problem Visibility | Tone |
|------|----------|-------------------|------|
| A (Sales) | Homepage, landing pages, campaign emails | Explicit headline | Direct pitch |
| B (Narrative) | Newsletters, community posts, Discord | Implicit / story | Conversational authority |
| C (Authority) | Blog posts, guides, long-form | Explicit + analyzed | Educational depth |

The key distinction: in Mode B, the problem is **woven into
narrative** rather than stated as a headline. The product appears
as **context, not a pitch**. The result is **felt, not declared**.

#### Newsletter-Specific Structure

1. **Hook** — problem OR insight OR story (varies per issue)
2. **Expand** — make it relatable
3. **Show** — solution or perspective
4. **Result** — what changes or why it matters
5. **CTA** — optional feel; newsletters earn trust, not always clicks

The surface structure varies — some issues lead with a story, some
with an insight, some with a question. The underlying
Problem -> Product -> Result logic is always present. Rotating the
presentation prevents pattern fatigue.

### Connecting to the 28-Problem Catalog

Every newsletter should connect to one or more of the 28 problems
from the [Homepage Review Template](homepage-review-template.md),
just like blog posts — but with a different voice.

**Blog posts** (Mode C) analyze problems explicitly:
"Here's the problem, here's why it exists, here's the fix."

**Newsletters** (Mode B) narrate problems implicitly:
"You ever feel like your skill doesn't matter?"

The same catalog entry, different surface. The internal and
philosophical SB7 levels work especially well for newsletters
because they're emotional, not analytical.

#### Example: Problem #1 (Pay-to-Win) in Mode B

> You build the perfect deck... and then lose to someone who just
> bought better cards. That's not competition — that's math.
>
> We built Legendary Arena to fix that. Every match is verifiable.
> Every outcome is fair.
>
> If you win here, it's because you earned it.

The problem (#1) is never named. The feeling is named. The product
is the relief.

### CTA Hierarchy and Rotation

#### Primary CTA (one per email)

| CTA | Button Text | Target URL |
|-----|-------------|------------|
| Play | "Play now" | `https://play.legendary-arena.com/` |
| Newsletter | Subscribe prompt | Newsletter signup |
| Tournament | Tournament entry | `https://play.legendary-arena.com/` |

**Rotation:** 4-week batch cycle: 2x play, 1x newsletter,
1x tournament. Welcome email always uses "Play now".

**CTA contract:** max 2 words, single verb, per
`C:\www\legendary-arena-com\docs\brand\strategy.md`.

#### Secondary Links (always present)

| Link | Format | Count |
|------|--------|-------|
| Read more | Text link to companion blog post | Exactly 1 |
| Shop | Text link to `/shop/` with UTM params | Exactly 1 |
| Share/Forward | Text link to blog post canonical URL | Exactly 1 |

**Maximum deep-links per email body: 4** (Read more + CTA + Shop +
Share). Footer links (social, unsubscribe) are not counted.

**Hidden CTA prohibition:** No additional promotional links inside
paragraph text, images, or headings. Only the defined 4 links are
allowed.

### UTM Tracking Conventions

All shop links in newsletters must include UTM parameters for
attribution tracking.

**Newsletter shop link format:**

```
https://www.legendary-arena.com/shop/?utm_source=newsletter&utm_medium=email&utm_campaign=<newsletter_slug>&utm_content=featured-product
```

**Parameter reference:**

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `utm_source` | `newsletter` | Origin surface |
| `utm_medium` | `email` | Delivery channel |
| `utm_campaign` | `<newsletter_slug>` | Edition identifier |
| `utm_content` | `featured-product` | Link purpose (fixed) |

**Slug coupling invariant:** `newsletter_slug`, blog post slug, and
UTM `utm_campaign` value MUST be identical strings. Any mismatch
breaks attribution tracking silently.

### Featured from the Shop

One product per issue. Compact block: product name + one-line
description + UTM-tagged link. No images (keeps email weight low
and avoids rendering issues in restrictive email clients).

**Placement constraint:** Must always appear:
- Below the primary CTA
- Above the Share/Forward module
- Above the footer

Any deviation is a layout violation.

### Blog-to-Email Pipeline

```
1. Write blog post (content/posts/<slug>.md)
   - Front-matter: series, cta, newsletter_week, newsletter_slug

2. Write newsletter draft (docs/brevo/newsletter-drafts/week-NN.md)
   - Hook, Tip/Strategy, Challenge drawn from blog content
   - Read more link -> blog post
   - CTA matches blog post cta field

3. Transfer to Brevo template
   - Paste draft content into template sections
   - Set subject line, verify all links

4. Pre-send QA (8 checks + 5 funnel checks)

5. Create Brevo campaign: "Newsletter -- <newsletter_slug>"
   - Schedule: Tuesday or Wednesday, 10:00 AM ET
```

### Brand Voice for Email

**Voice:** Direct, confident, heroic. No irony, no hype.

**Prohibited in email copy:**
- Emoji
- Exclamation marks
- Hedging verbs: `get`, `try`, `enjoy`, `perhaps`, `maybe`
- Conversational filler: `hey`, `let's`, `so`, `well`
- Self-deprecation: `fan-made`, `amateur`, `side project`
- Generic adjectives: `fun`, `exciting`, `epic`
- Questions as subject lines or section headers

**Verb palette:**
`assemble` `build` `recruit` `fight` `master` `defeat` `earn` `become`

**CTA contract:** max 2 words, single verb. Allowed: "Play now",
"Browse cards", "Read rules", "View registry". Disallowed: "Click
here", "Start playing now", generic phrases.

### Email Design Constraints

**Colors (light mode only — email has no dark mode toggle):**

| Element | Token | Value |
|---------|-------|-------|
| Background | `--la-color-bg-primary` | `#fdfcf8` |
| Body text | `--la-color-text-primary` | `#1a1d2e` |
| Secondary text | `--la-color-text-secondary` | `#4a5168` |
| CTA button background | `--la-color-red` | `#7a1d1f` |
| CTA button text | — | `#ffffff` (10.4:1 AAA contrast) |
| Link color | `--la-color-blue` | `#1d4ed8` |

**Typography:** System font stack (no web fonts in email):
`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`

**Layout:**
- Max content width: 600px
- Mobile: single-column on viewports under 480px
- HTML size: under 100KB (Gmail clips at ~102KB)
- Plain-text fallback required (CTA link + unsubscribe link)

**Images:**
- Use production URLs:
  `https://www.legendary-arena.com/images/posts/<slug>/hero.webp`
- Images must be deployed before the newsletter send
- Alt text required on all images
- Email must remain comprehensible with images blocked
- Logo: PNG (not SVG), max 200px wide

### Pre-Send QA Checklist

**All 8 checks must pass before any production send.**

- [ ] **Test send** — developer inbox (Gmail) + alternate client
  (Outlook or Apple Mail)
- [ ] **Link validation** — all URLs resolve: blog link, CTA target,
  shop link, unsubscribe. Production URLs only (no localhost/preview)
- [ ] **Image validation** — all images load, alt text present, email
  comprehensible with images blocked
- [ ] **Rendering check** — desktop and mobile layout verified via
  Brevo preview + real inbox
- [ ] **Personalization check** — preview as a real contact, verify
  fallback values
- [ ] **Funnel validation** — click through: email -> blog post ->
  CTA block -> target. Each hop resolves
- [ ] **Deliverability** — test email lands in inbox (not spam),
  sender identity matches
- [ ] **Subject line** — aligns with email content (no clickbait)

**Funnel integrity check (5 sub-checks):**

1. Read more link resolves to correct blog post
2. Blog CTA button navigates to target (play/newsletter/tournament)
3. Newsletter shop link resolves to `/shop/` with UTM params visible
4. Blog shop link resolves to `/shop/` with UTM params visible
5. Share link resolves to blog post canonical URL

Record QA results in
`C:\www\legendary-arena-com\docs\brevo\newsletter-drafts\qa-log.md`
(append-only).

### Compliance Requirements

- Brevo unsubscribe placeholder (`{{ unsubscribe }}`) in every footer
- Organizational identity in footer (CAN-SPAM requirement)
- Subject line must align with email content
- No API keys or internal URLs in newsletter content
- Double opt-in enforced at Brevo list level

### Sending

**Campaign naming:** `Newsletter -- <newsletter_slug>`
(e.g., `Newsletter -- week-01-deck-checklist`)

**Schedule:** Tuesday or Wednesday, 10:00 AM ET

**Metrics:** Record opens, clicks, bounces, and unsubscribes in
`qa-log.md` at least 48 hours post-send (append-only, no
retroactive edits).

### Annotated Newsletter Example

```markdown
# Newsletter Draft — Week 04

**Companion post:** `week-04-deck-construction`
**CTA:** Tournament
**newsletter_slug:** `week-04-deck-construction`

---

## Subject line

Why your deck loses before the game starts

## Hook

<!-- MODE B: Lead with the feeling, not the headline.
     Connect to Problem #3 (balance patches destroy strategy)
     and #6 (repetition over mastery) — but don't name them.
     Use the internal SB7 level: how it FEELS. -->

You spent an hour building the perfect deck. Three games later,
you are losing to players running cards you dismissed. The
problem was never your card choices — it was your construction
method.

## Tip / Strategy

<!-- 2-3 paragraphs. This is the value block. The problem is
     woven in (Mode B), not stated as a headline (Mode A).
     Solution appears as context, not a pitch. -->

Most players build top-down: pick the strongest cards, fill the
gaps. This produces decks that look powerful in a vacuum but
collapse under pressure. The missing step is a strategy sentence
— one line that defines what your deck does and becomes the
filter for every card decision.

Once your strategy is clear, map your resource curve. A deck
loaded with high-cost finishers starves itself in the early
turns. A deck with nothing above cost three runs out of reach
when it matters. The balance point depends on your strategy
sentence, not on a fixed ratio.

The final discipline is scenario scouting. The Scheme and
Mastermind you face determine which threats arrive and when.
Building in isolation — ignoring the threat — is the single
most common construction error.

## Challenge

Build a new deck using the seven-step checklist from this
week's blog post. After one session, identify the two cards
that sat dead in your hand and replace them. Measure the
difference in your next session.

## Read more

https://www.legendary-arena.com/posts/week-04-deck-construction/

## CTA

[Play now](https://play.legendary-arena.com/)

## Featured from the Shop

**Starter Deck Bundle** — Everything you need for your first
five sessions. One purchase, zero guesswork.

https://www.legendary-arena.com/shop/?utm_source=newsletter&utm_medium=email&utm_campaign=week-04-deck-construction&utm_content=featured-product

## Footer

You are receiving this because you signed up at legendary-arena.com.

{{ unsubscribe }}
```

## Interactions

- **[Blog Post Authoring](blog-post-authoring.md)** — Every
  newsletter has a companion blog post. The blog post is written
  first; the newsletter draws from it using Mode B voice instead
  of Mode C. The `newsletter_slug` field ties them together.
- **[Brevo Email Pipeline](brevo-email-pipeline.md)** — The
  technical infrastructure: Brevo API integration, subscriber state
  model, welcome automation, CF Pages subscribe function, and
  domain authentication.
- **[Homepage Review Template](homepage-review-template.md)** — The
  28-problem catalog and SB7 framework. Newsletters map to catalog
  problems using implicit/emotional language (internal and
  philosophical SB7 levels).
- **[Homepage Appendix](homepage-appendix.md)** — Contains the
  content framework (Mode A/B/C) that governs how
  Problem -> Product -> Result is expressed. Newsletters use Mode B
  (Narrative), including the newsletter example.
- **[Ewiki Authoring](ewiki-authoring.md)** — Style guide for ewiki
  content. Newsletters use a different rendering surface (email
  clients) with different constraints (no CSS variables, system
  fonts, 600px max width).

## Edge Cases

- **Slug coupling.** `newsletter_slug`, blog post slug, and UTM
  `utm_campaign` value must be identical. Any mismatch breaks
  attribution tracking and blog cross-references silently. No
  automated check exists.
- **Gmail clipping.** Gmail clips emails over ~102KB. The HTML
  weight must stay under 100KB including all inline styles and
  template chrome.
- **Image deployment timing.** Newsletter images reference
  production URLs. If the blog post hasn't been deployed before the
  newsletter send, images will be broken. Always push the blog post
  first.
- **Dark mode.** Email clients may invert colors in dark mode.
  The CTA button color (`#7a1d1f` on white) was chosen for AAA
  contrast (10.4:1) in light mode. Dark mode inversion is
  unpredictable across clients — test with images blocked and colors
  inverted.
- **Plain-text fallback.** Brevo generates a plain-text version
  automatically, but it should be reviewed to ensure the CTA link
  and unsubscribe link are present and functional.
- **Welcome email CTA.** The welcome email always uses "Play now"
  regardless of the current rotation cycle. Do not change this.
- **Pattern fatigue.** If every newsletter follows the same visible
  Problem -> Product -> Result arc, subscribers disengage. Rotate
  the surface structure (story, insight, question) while keeping
  the underlying logic consistent. This is the core Mode B
  discipline.

## References

- `C:\www\legendary-arena-com\docs\brevo\newsletter-template.md`
  — 10-section email structure specification (v2, WP-020)
- `C:\www\legendary-arena-com\docs\brevo\email-automation.md`
  — Brevo pipeline architecture and automation config
- `C:\www\legendary-arena-com\docs\brevo\newsletter-drafts\`
  — newsletter draft storage location
- `C:\www\legendary-arena-com\docs\brevo\newsletter-drafts\qa-log.md`
  — QA results log (append-only)
- `C:\www\legendary-arena-com\docs\brand\strategy.md` — brand voice,
  verb palette, CTA contract, failure modes
- `C:\www\legendary-arena-com\docs\marketing\homepage-review-template.md`
  — 28-problem catalog and SB7 framework
- `C:\www\legendary-arena-com\docs\marketing\homepage-appendix.md`
  — content framework (Mode A/B/C) with newsletter example
- `C:\www\legendary-arena-com\static\brand-tokens.css` — brand token
  CSS variables (email uses raw values, not CSS vars)
- `C:\www\legendary-arena-com\functions\api\subscribe.js` — CF Pages
  subscribe function
