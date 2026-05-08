# Engineering Wiki — Schema

> **The contract for every page under `docs/wiki/`.**
> If a page violates this schema, the page is wrong — not the schema.
>
> **Last updated:** 2026-05-07

---

## Purpose

This wiki is an **internal engineering reference** for game systems,
mechanics, and concepts in the Legendary Arena engine. Each page is an
**entity** (mechanic, system, card-type, keyword, or concept) with a
defined shape, cross-references to related entities, and citations to
authoritative artifacts.

The wiki exists to answer:

- *"What is X, and where does it live in this codebase?"*
- *"Which WPs and DECISIONS govern X?"*
- *"What does X interact with, and what edge cases bite?"*

It is **not** a player-facing reference, a replacement for the
[Glossary](../10-GLOSSARY.md), or a substitute for
[ARCHITECTURE.md](../ai/ARCHITECTURE.md), [DECISIONS.md](../ai/DECISIONS.md),
or Work Packets.

---

## Authority Position

The wiki is **documentation**. It cites authoritative sources; it does
not redefine them. The full authority hierarchy is in
[`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) and
[`docs/ai/ARCHITECTURE.md`](../ai/ARCHITECTURE.md):

```
1. .claude/CLAUDE.md
2. docs/ai/ARCHITECTURE.md
3. docs/01-VISION.md
4. .claude/rules/*.md
5. docs/ai/work-packets/WORK_INDEX.md
6. Individual Work Packets / DECISIONS.md
7. (this wiki)
8. Active conversation context
```

If the wiki and a higher-authority document disagree, **the wiki is
wrong** and must be corrected. Wiki pages never override architecture,
rules, or decisions.

### Wiki vs Glossary

- **Glossary entry** = one-line canonical definition (one row in a
  table). Lives in [10-GLOSSARY.md](../10-GLOSSARY.md). Authoritative
  for *terminology*.
- **Wiki page** = multi-section article with mechanics, interactions,
  edge cases, and citations. Authoritative for *nothing* — it cites
  authoritative sources for everything.

A term may appear in both. The glossary is the terminology lock; the
wiki is the explanatory companion.

**Name lock.** If a term has a glossary entry, the wiki page's
front-matter `title` must match the glossary term **verbatim**
(case-sensitive, character-for-character). No naming variants are
permitted — no `Master Strike` vs `Master-Strike`, no
`MatchSetupConfig` vs `Match Setup Config`. This guarantees
terminology stays a single canonical surface.

---

## Scope Exclusion

The wiki is **descriptive, not prescriptive.** It explains the engine;
it does not govern it.

A wiki page MUST NOT:

- **Redefine rules** from `.claude/CLAUDE.md`, `.claude/rules/*.md`,
  [`docs/ai/ARCHITECTURE.md`](../ai/ARCHITECTURE.md), or
  [`docs/01-VISION.md`](../01-VISION.md). The wiki cites these; they
  remain authoritative.
- **Contain policy or design decisions.** All architectural / design /
  governance decisions live in [DECISIONS.md](../ai/DECISIONS.md). The
  wiki may *reference* a decision; it never *makes* one.
- **Serve as execution instruction.** The wiki is not an Execution
  Checklist or Work Packet. No "run this command", no "do this then
  that", no acceptance criteria, no Definition of Done.
- **Introduce new constraints** that don't exist in higher-tier docs.
  If you find yourself writing *"the engine MUST do X"* in a wiki
  page and X isn't already in ARCHITECTURE.md or a WP, stop — the
  wiki is the wrong place.

If a wiki page drifts into prescriptive territory, the fix is to
either (a) move the prescriptive content into the correct governance
doc and cite it from the wiki, or (b) delete it.

---

## File Layout

```
docs/wiki/
├── SCHEMA.md           # this file — the contract
├── README.md           # purpose, conventions, authority
├── INDEX.md            # categorized list of all pages
└── <slug>.md           # entity pages (one per entity)
```

`SCHEMA.md`, `README.md`, and `INDEX.md` are reserved filenames. All
other `*.md` files in `docs/wiki/` are entity pages and must conform to
this schema.

There are **no subdirectories**. Categorization is by `type` /
front-matter and surfaced in `INDEX.md`. Flat structure prevents
churn when entities cross categories.

### Flat-structure cap

The flat layout is valid up to **50 entity pages**. Beyond 50, a
formal SCHEMA amendment must introduce partitioning before any
further pages are added. This prevents silent drift into an
unmanageable directory.

---

## File Naming

- **Filename = title, kebab-cased.** The filename is a deterministic
  transformation of the front-matter `title`: lowercase, replace
  spaces with `-`, drop characters outside `[a-z0-9-]`, collapse
  consecutive hyphens.
  - `title: Master Strike` → `master-strike.md`
  - `title: HQ` → `hq.md`
    (abbreviations acceptable when canonical in
    [10-GLOSSARY.md](../10-GLOSSARY.md))
  - `title: CardExtId` → `cardextid.md`
- **Singular by default** — `master-strike.md`, not
  `master-strikes.md`.
- **No leading numbers, no prefixes** — `INDEX.md` orders pages, not
  the filesystem.
- **No spaces, no underscores, no special characters** other than
  hyphens. This matches the project's `slug` rule
  (see [10-GLOSSARY.md](../10-GLOSSARY.md) "Slugs use hyphens only")
  and avoids Windows shell quoting and URL-encoding hazards.
- **Reserved files are ALL-CAPS** — `SCHEMA.md`, `README.md`,
  `INDEX.md` (matches `WORK_INDEX.md` / `DECISIONS.md` convention).

---

## Front-Matter Format

Every entity page begins with a YAML front-matter block. Front-matter
is the page's **machine-readable contract**: title, classification,
relationships, and provenance.

> **Wiki-only convention.** YAML front-matter is adopted *only* in
> `docs/wiki/`. It is not the convention for other docs in this repo
> and must not spread into governance documents
> ([`docs/ai/ARCHITECTURE.md`](../ai/ARCHITECTURE.md),
> [`docs/01-VISION.md`](../01-VISION.md),
> [`docs/ai/DECISIONS.md`](../ai/DECISIONS.md), `.claude/rules/*.md`,
> Work Packets, ECs). Those continue to use the existing
> `# Title` + `> **Last updated:**` header pattern.

```yaml
---
title: Master Strike
type: Mechanic
tags: [mastermind, villain-deck, trigger]
related:
  - mastermind.md
  - villain-deck.md
  - rule-execution-pipeline.md
status: canonical
source:
  - ../ai/ARCHITECTURE.md#section-2-data-flow
  - ../10-GLOSSARY.md
  - ../legendary-universal-rules-v23.md
last-reviewed: 2026-05-07
---
```

### Field reference

| Field | Required | Type | Notes |
|---|---|---|---|
| `title` | yes | string | Human-readable title. Match the glossary entry if one exists. |
| `type` | yes | enum | One of the closed set below. |
| `tags` | yes | list of strings | Lowercase-hyphenated. Free vocabulary. Empty list `[]` is permitted but discouraged. |
| `related` | yes | list of relative paths | Other wiki pages this entity touches. May be `[]` for true leaf entities. |
| `status` | yes | enum | `canonical` \| `draft` \| `deprecated` |
| `source` | conditional | list of relative paths | Authoritative artifacts cited by the page. **Non-empty for `canonical`.** May be `[]` for `draft`. For `deprecated`, cite the replacement (or DECISIONS entry explaining the deprecation). |
| `last-reviewed` | yes | date `YYYY-MM-DD` | When the page was last verified against current code/docs. |

`tags` and `related` are **lists**, even when they contain one entry,
to keep the schema regular.

---

## Required Sections

Every entity page must contain these H2 sections, in this order:

1. **`## Summary`** — One to three sentences. What this entity is and
   why it matters in the engine. No code, no citations.
2. **`## Mechanics`** — How it actually works. Concrete, technical,
   citable. Used for **all** `type` values, including `Concept` and
   `System`, for uniform parsing and review surface.
3. **`## Interactions`** — Which other entities this one touches, and
   how. Each interaction names another wiki page (link to it) or names
   a code touchpoint with a citation.
4. **`## Edge Cases`** — Corner conditions, drift hazards, and known
   gotchas. If none are known, write `None known at this revision.`
   rather than omitting the section — silence ≠ "no edge cases."
5. **`## References`** — Bullet list of cited artifacts (WPs, DECISIONS,
   ARCHITECTURE sections, code paths, card data). May overlap with
   front-matter `source` but is the human-readable rendering.

Section names are fixed. Do not rename `Mechanics` to `How it works`
or `Edge Cases` to `Gotchas`.

---

## Optional Sections

These may appear when relevant, in this order, **after Edge Cases**
and **before References**:

- **`## Code Touchpoints`** — Bulleted list of relevant source paths
  with one-line descriptions. Use when the entity has a clear
  implementation footprint (engine helpers, data shapes, validators).
- **`## Data Files`** — JSON / metadata files this entity depends on.
  Use for entities backed by `data/cards/*.json`,
  `data/metadata/*.json`, or `data/migrations/*.sql`.
- **`## History`** — Bulleted timeline of WPs / DECISIONS that
  introduced or changed this entity. Cite each entry by ID.
- **`## Open Questions`** — Gaps the page could not fill from
  authoritative sources. Each item names what's missing and what the
  reader should do (e.g., *"check WP-NNN before relying on this"*).
  Pages with open questions usually have `status: draft`.

If you find yourself wanting a section that isn't here, raise it —
don't invent.

---

## Entity Types (Closed Set)

`type` must be exactly one of:

| Type | Definition | Examples |
|---|---|---|
| `Mechanic` | A discrete in-game mechanic with a specific trigger and effect | Master Strike, Scheme Twist, Bystander Rescue |
| `System` | A coordinated subsystem spanning multiple files / phases | Turn System, Scoring, Setup, Rule Execution Pipeline |
| `Card-Type` | A high-level card categorization recognised by the engine | Mastermind, Scheme, Hero, Villain, Henchman, Bystander |
| `Keyword` | A named ability label — board keyword or hero keyword | Recruit, Attack, Patrol, Guard, Ambush, Draw |
| `Concept` | An abstract data shape, contract, or design concept | `CardExtId`, `MatchSetupConfig`, Move Validation Contract, Determinism |

This set is **closed**. Adding a new type requires updating SCHEMA.md
first.

---

## Status Values (Closed Set)

| Status | Meaning | Constraints |
|---|---|---|
| `canonical` | Every claim is sourced; verified against current code/docs at `last-reviewed`. | `source` is non-empty; no uncited factual claims in body. |
| `draft` | Exists but has uncited claims, content gaps, or pending verification. | `source` may be `[]`. `Open Questions` section recommended. Do not rely on `draft` pages for engineering decisions. |
| `deprecated` | Superseded or no longer accurate. Kept for history. | Page must link to its replacement (or to a DECISIONS entry explaining the deprecation) in the first paragraph of `Summary`. |

A page with **any uncited factual claim** about engine behaviour, data
shape, or rules is `draft` until the claim is sourced. This is the
most common reason to mark a page `draft`. *"It works this way"* is
not a citation; *"per [ARCHITECTURE.md §Section 4](../ai/ARCHITECTURE.md#section-4--game-state-shape)"* is.

---

## Cross-Reference Conventions

### Within the wiki

Use markdown relative paths to other wiki pages:

```markdown
See [Master Strike](master-strike.md) for the trigger semantics.
```

### To repo artifacts outside the wiki

Use markdown relative paths from the wiki page to the artifact:

```markdown
- [ARCHITECTURE.md §Layer Boundary](../ai/ARCHITECTURE.md#layer-boundary-authoritative)
- [WP-026 — Scheme Setup](../ai/work-packets/WP-026-scheme-setup.md)
- [DECISIONS.md D-2601](../ai/DECISIONS.md#d-2601)
- [10-GLOSSARY.md](../10-GLOSSARY.md)
- [zoneOps.ts](../../packages/game-engine/src/zones/zoneOps.ts)
- [data/cards/mdns.json](../../data/cards/mdns.json)
```

The path is relative to the *current page's* location
(`docs/wiki/<slug>.md`), so:

- Up one level → repo `docs/` (`../`)
- Up two levels → repo root (`../../`)

### Forbidden link styles

- **No Obsidian wiki-links** — `[[Master Strike]]` does not render in
  plain markdown viewers.
- **No bare URLs in body text** — every link must have visible link
  text. (Bare URLs in `References` lists are acceptable when the URL
  *is* the identifier, e.g., the Marvel Legendary rules PDF.)
- **No absolute paths** — `C:\...` or `/docs/...` break across
  machines and renderers.

### Section anchors

GitHub-style anchor convention: lowercase, spaces become hyphens,
non-alphanumerics dropped, `§` and other prefixes dropped. Verify
anchors render before publishing — especially when citing
ARCHITECTURE.md sections.

### Link integrity

Every internal link — within the wiki, or out to other repo
artifacts — must resolve to an existing file at commit time. Anchors
should resolve when the target supports them.

- **Broken internal links are lint failures**, even before automated
  tooling exists. Reviewers verify manually until the lint script
  lands.
- If a target is being moved or renamed in the same change, update
  every wiki link in the same commit. No "fix later" notes in the
  body.
- External URLs (genuine outside resources) are exempt from
  resolution checks but must still have visible link text.

---

## Source Field Conventions

Every page's front-matter `source` field is a list of relative paths
to **authoritative artifacts** that back the page's claims. The
`References` section in the body is the human-readable rendering of
the same list (plus any inline citations).

### What counts as an authoritative source

- **Higher-tier governance docs:**
  `.claude/CLAUDE.md`, `.claude/rules/*.md`,
  `docs/ai/ARCHITECTURE.md`, `docs/01-VISION.md`,
  `docs/ai/DECISIONS.md`
- **Work Packets and Execution Checklists:**
  `docs/ai/work-packets/WP-NNN-*.md`,
  `docs/ai/execution-checklists/EC-NNN-*.checklist.md`
- **Reference docs:**
  `docs/ai/REFERENCE/*.md`, `docs/10-GLOSSARY.md`,
  `docs/02-ARCHITECTURE.md`, `docs/12-SCORING-REFERENCE.md`
- **Canonical rules text:**
  `docs/legendary-universal-rules-v23.md` (or the PDF)
- **Code:** specific files in `packages/**` or `apps/**`
- **Data:** specific files under `data/`

### What does NOT count

- This wiki itself (the wiki cannot bootstrap its own authority)
- Conversation transcripts, chat logs, or scratch notes
- External blog posts or third-party tutorials
- Commit messages alone (cite the WP / EC the commit landed under)

### Citation precision

- Cite **section anchors** when the document has them
  (`ARCHITECTURE.md#layer-boundary-authoritative`).
- Cite **specific WP numbers** when describing engine behaviour
  introduced or modified by a WP.
- Cite **specific DECISIONS** by `D-NNNN` ID when describing a
  deliberate design choice.
- For code, cite the file (and optionally the function name in body
  prose); do not cite line numbers — they rot.

---

## Tags

`tags` are open-vocabulary labels that surface relationships
`related` cannot capture. Conventions:

- **Lowercase, hyphenated** — `villain-deck`, not `VillainDeck` or
  `villain_deck`.
- **Prefer existing tags** before inventing new ones. INDEX.md
  surfaces the active tag set.

Suggested starter vocabulary (extend as needed):

- **Layer**: `layer-engine`, `layer-registry`, `layer-server`,
  `layer-preplan`
- **Phase**: `phase-lobby`, `phase-setup`, `phase-play`, `phase-end`
- **Stage**: `stage-start`, `stage-main`, `stage-cleanup`
- **Domain**: `mastermind`, `scheme`, `villain-deck`, `hero-deck`,
  `city`, `hq`, `bystander`, `wound`, `scoring`, `setup`, `endgame`
- **Kind**: `keyword-board`, `keyword-hero`, `trigger`, `effect`,
  `move`, `contract`, `data-shape`
- **Cross-cutting**: `determinism`, `persistence`,
  `drift-detection`, `governance`

---

## When to Add a Page

Add a wiki page when an entity:

1. Is referenced by **two or more** Work Packets, ARCHITECTURE
   sections, or DECISIONS, and
2. Has **non-trivial mechanics** worth explaining beyond a glossary
   one-liner, and
3. Will be **cited by other wiki pages** (i.e., it's an anchor, not
   a leaf).

If only (1) and (2) apply, a glossary entry may be enough. If only
(2) applies, the entity is too local — document it inline in the
relevant WP or code comment instead.

**Do not** add a page for:

- Single-use helpers or one-off implementation details
- Card-specific text (cards live in `data/cards/*.json`)
- Game design rationale (that's [DECISIONS.md](../ai/DECISIONS.md))
- WIP features not yet landed in `main`

---

## When to Mark a Page Draft or Deprecated

**Mark `draft`** when:

- Any factual claim in the body is uncited
- The author flagged content gaps in `Open Questions`
- The page was written before the WP / DECISIONS it depends on landed
- `last-reviewed` is older than 6 months and behaviour may have drifted

**Mark `deprecated`** when:

- A WP / DECISIONS entry has superseded the entity (link to the
  replacement)
- The mechanic was removed from the engine but the page is preserved
  for historical context

Never **delete** a page outright — if it has been linked from elsewhere,
the link will rot. Mark `deprecated` and update the body to point to
the replacement.

---

## Maintenance

- Update `last-reviewed` whenever the page is verified against
  current code/docs (not on every typo fix).
- Promote `draft` → `canonical` only when every body claim has a
  citation and `Open Questions` is empty (or removed).
- When a WP / DECISIONS entry lands that touches an entity, update
  the relevant page's `History` and `References` sections in the same
  PR cycle (best-effort; the wiki is not WP-governed and not blocking).
- INDEX.md should be regenerated when a page is added, renamed, or
  has its `type` / `status` changed.

---

## Publish / Sync Boundary

`docs/wiki/` is the **authoring location** and the only place where
wiki content is edited.

If wiki content is ever published to a rendered site (Hugo,
Docusaurus, hand-rolled, etc.), the published copy is a **read-only
projection** of `docs/wiki/`:

- No edits in the published layer.
- Any drift between `docs/wiki/` and the publish target is resolved
  by re-projecting from `docs/wiki/`, never by hand-editing the
  publish target.
- The publish pipeline is allowed to transform (slugify URLs,
  rewrite link targets, generate indexes); it is not allowed to
  rewrite content.

There is no publish target at v1. This rule exists so that a future
publish step cannot accidentally become a second authoring surface.

---

## Lint Targets (Future Tooling, Optional)

The schema is structured so that a future lint script could verify:

- Every `*.md` (excluding `SCHEMA`/`README`/`INDEX`) has front-matter
  with all required fields.
- `type` ∈ `{ Mechanic, System, Card-Type, Keyword, Concept }`.
- `status` ∈ `{ canonical, draft, deprecated }`.
- `canonical` pages have non-empty `source`.
- All required sections (`Summary`, `Mechanics`, `Interactions`,
  `Edge Cases`, `References`) are present, in order.
- Filename equals the deterministic kebab-case transformation of the
  front-matter `title` (per [File Naming](#file-naming)).
- If the front-matter `title` matches a row in
  [10-GLOSSARY.md](../10-GLOSSARY.md), it matches verbatim
  (case-sensitive).
- All paths in `related` and `source` resolve to existing files.
- All in-body markdown links resolve to existing files / anchors.
- Total entity pages ≤ 50 (per
  [Flat-structure cap](#flat-structure-cap)).

No such tool exists at v1. The schema is human-enforced.

---

## Reserved Filenames

| File | Purpose |
|---|---|
| `SCHEMA.md` | This file — the contract. |
| `README.md` | Purpose, conventions, authority hierarchy, contribution guide. |
| `INDEX.md` | Categorized list of every page in the wiki. |

These filenames are reserved and must not be used as entity slugs.
