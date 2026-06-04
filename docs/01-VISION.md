# Legendary Arena — Vision & Direction

> **Last updated:** 2026-04-14

## Purpose

This document defines the **vision goals** for Legendary Arena.

It exists to:
- Establish **non‑negotiable truths** about what the game is
- Provide **directional guidance** for architecture, tooling, and execution
- Detect **project drift early**
- Act as a reference point for design decisions, execution checklists, and AI‑assisted development

If this document is violated, Legendary Arena is no longer being built as intended.

---

## Business Survival (Sales & Product)

**Legendary Arena is a business.** It exists to make money so that the people
working on it can keep working on it. Every other goal in this document —
rules authenticity, content fidelity, multiplayer reliability, fairness,
longevity, and the entire engineering discipline behind them — exists in
service of two survival truths.

### Sales

Every dollar in funds payroll, royalties to Upper Deck and Marvel, cloud
bills, R2 storage, and the next round of content. **No sales = no business,
no game, no royalties.** Selling is the act that funds everything else this
document says we care about. It is not optional, distasteful, or a problem
to solve later. It is the act that keeps Legendary Arena alive.

### A Great Product

Players pay for a faithful, reliable, fast Marvel Legendary that gets better
every release. **No product worth buying = no sales = no business.** The
Primary Vision Goals below are not abstract values; they are the engineering
truths that make the product worth buying. Rules Authenticity, Content
Authenticity, Player Trust & Fairness, Faithful Multiplayer, and Longevity &
Expandability all serve the single question: *will real customers pay for
this?*

---

If sales and product are healthy, the rest of this document is the blueprint
for how to keep them healthy. If either fails, nothing else in this document
matters — because the project ceases to exist.

---

## Primary Vision Goals (Non‑Negotiable)

Primary goals define **what Legendary Arena *is***.
Violation of any primary goal is considered a **hard failure** of vision.

### 1. Rules Authenticity

Legendary Arena follows the **exact rules of the Marvel Legendary card game**.

- No simplifications, reinterpretations, or digital-only shortcuts
- All timing, triggers, edge cases, and interactions match the physical game and official errata
- Rule enforcement is strict, deterministic, and transparent

### 2. Content Authenticity

Legendary Arena uses the **same card images, names, text, and semantics** as the physical cards.

- Card behavior is derived from the printed rules text and official errata
- The digital implementation must never alter gameplay meaning
- Presentation changes (layout, zoom, animations) must not affect rules interpretation

### 3. Player Trust & Fairness

Legendary Arena must be **fair, transparent, and explainable**.

- No hidden modifiers, manipulated randomness, or opaque automation
- All game state transitions must be inspectable, logged, and defensible
- Randomness is verifiably fair and reproducible (seeded for replays)
- The system enforces rules with perfect neutrality — it never makes strategic decisions on behalf of players
- Competitive play is never allowed against an undeclared or retroactively adjusted difficulty benchmark

### 4. Faithful Multiplayer Experience

Multiplayer play must mirror the **tabletop cooperative experience**.

- Turn order, cooperation, and shared responsibility are preserved
- The system supports players rather than replacing player judgment
- Multiplayer synchronization, reconnection, and late-joining must be reliable
- Multiplayer correctness is prioritized over convenience

### 5. Longevity & Expandability

Legendary Arena is built to support **years of expansions, heroes, villains, and rule complexity**.

- Core systems must scale without rewrites
- Adding content must not require structural changes
- Short-term shortcuts that compromise long-term support are not acceptable
- Gameplay themes (WP-055) demonstrate this goal directly: new themes are added
  as static JSON data files without touching engine code, and the schema supports
  hundreds of entries without structural changes

---

## Secondary Vision Goals (Directional but Intentional)

Secondary goals define **how Legendary Arena is currently built**.

Deviation is allowed only when:
- The change is intentional
- The rationale is documented (e.g., `DECISIONS.md`)
- The change does not violate any primary goal

---

### Architecture & Platform

#### 6. Modern Web Application

- Built as a **Vue 3 Single Page Application (SPA)**
- Designed for modern desktop and tablet browsers
- No reliance on deprecated frameworks or legacy web stacks

#### 7. Strict Layer Separation

The system enforces clear boundaries between:

- Game engine (rules & state)
- Server / multiplayer orchestration
- Client UI
- Content registry (cards, sets, metadata)

Cross‑layer shortcuts and leakage are not permitted.

#### 7a. Identity Boundary — Authentication ≠ Identity ≠ Progression

**Authentication is infrastructural; player identity is game-native.**
External authentication providers (e.g., Hanko) may verify access, but
all player identity, reputation, rank, badges, and competitive history
are owned, computed, and displayed exclusively by Legendary Arena.

This boundary is permanent:

- Authentication providers verify *access*; they never define *identity*.
- Player identity is *progression*-bearing only when that progression
  has been earned through replay-verified play or attested contribution
  per §25 and the badge tier model (D-1004).
- Profile surfaces never accrete social-network semantics (followers,
  likes, OAuth-derived identity, influence scores) — see NG-8.

If an authentication provider is replaced, no identity, reputation,
rank, or recognition is lost: those live in Legendary Arena's own
records, keyed by stable internal account identifiers.

#### 8. Deterministic Game Engine

- Game logic is UI‑agnostic
- Identical inputs always produce identical outcomes
- Suitable for replay, validation, multiplayer synchronization, and testing
- Proven through 314 automated tests across setup, moves, rule execution,
  hero abilities, board keywords, scheme setup, and endgame evaluation
  (Phases 1-5 complete)

---

### Content & Assets

#### 9. Externalized Static Assets

- Card images and static media are hosted in **Cloudflare R2**
- The client references assets by stable URLs
- Assets are not bundled directly into application builds

#### 10. Content as Data

- Cards, sets, and keywords are data-driven
- Expansions should not require new engine logic
- Rules interpretation lives in the engine, not in ad‑hoc content code

**Gameplay Themes** are a first-class expression of this goal. Legendary Arena
supports hundreds of comic-accurate gameplay themes — curated combinations of
mastermind, scheme, villain groups, henchman groups, and hero decks that
faithfully recreate iconic Marvel storylines (sourced from Marvel Unlimited,
Marvel Fandom, CMRO, and the official comics). Themes are defined as static,
validated JSON files with no engine changes, structural modifications, or code
rewrites required to add new ones. The authoritative theme data model is
established in WP-055 as a registry-layer content primitive: purely data, never
behavior.

#### 10a. Registry Viewer (cards.barefootbetters.com)

The Registry Viewer is the **public-facing card and theme browser** for
Legendary Arena, a ground-up rebuild of the earlier www.master-strike.com
card data viewer. The original card data was sourced from the
[`@master-strike/data`](https://www.npmjs.com/package/@master-strike/data)
npm package, then converted, patched, and upgraded into the current
R2-hosted JSON format. Card images are sourced from
[legendarycardgame.com](https://www.legendarycardgame.com/), the
community's definitive card image resource for the Legendary card game.

It serves three audiences:

- **Players** — browse all cards across 40+ sets, read keyword and rule
  definitions via tooltips, explore comic-accurate gameplay themes
- **Contributors** — inspect card data quality, validate set health, and
  verify theme setup intents against the registry
- **The project itself** — acts as a living smoke test for the R2 data
  pipeline and content-as-data architecture

The viewer is intentionally lightweight (Vue 3 SPA, no router, no backend)
and follows the same layer boundaries as the rest of the project. It
consumes registry data from R2 at runtime and never touches the game engine.

Architecture and history are documented in `apps/registry-viewer/CLAUDE.md`
and `apps/registry-viewer/HISTORY-modern-master-strike.md`.

---

### Operations & Scalability

#### 11. Stateless Client Philosophy

- The client reflects an authoritative game state
- Refresh, reconnect, and multi-device play are supported by design
- Local state is disposable and recoverable

#### 12. Cloud-Friendly Design

- Infrastructure assumptions support horizontal scaling
- No single-machine or session-bound assumptions
- Multiplayer architecture anticipates growth

---

### Development & Governance

#### 13. Execution Checklist–Driven Development

- Significant work follows Execution Checklists (ECs)
- Bugs are treated as **execution contract violations**, not patch targets
- Fixes require root-cause identification and checklist remediation

#### 14. Explicit Decisions, No Silent Drift

- Architectural or platform shifts must be documented
- "Just this once" exceptions are not allowed
- Long-term clarity is favored over short-term speed

#### 15. Built for Contributors

- Codebase structure must be understandable without tribal knowledge
- Documentation is authoritative, not aspirational
- The project should remain approachable as it grows

---

### Player Experience

#### 16. Performance & Responsiveness

- Gameplay must feel instantaneous even with full player counts, large decks, and complex schemes
- Large-scale trigger chains and keyword interactions must never cause visible lag
- Performance is a correctness concern, not a polish concern

#### 17. Accessibility & Inclusivity

- Full keyboard navigation, screen-reader support, high-contrast modes, and color-blind friendly indicators
- Tooltips, rules explanations, and the game log must be clear and comprehensive
- Accessibility enhancements must never alter rules or give any player an advantage

#### 18. Replayability & Spectation

- Every game is automatically saved as a replayable, shareable log
- Spectator mode is a first-class feature, not an afterthought
- Replays are perfectly faithful to the original game (enabled by the deterministic engine)

#### 19. AI-Ready Export & Analysis Support

- The game provides clean, structured, machine-readable exports of game logs, replay files, deck compositions, and state snapshots
- Exports are designed for use with external LLMs for post-game analysis, setup generation, and strategy review
- No in-game AI assistance or prompting — all AI interaction is external and player-initiated, preserving Primary Goals 3 and 4

#### 19a. Player Profiles Are Reflective, Not Authoritative

**A profile is a compiled, queryable view derived from replays,
scoring records, and verified actions. Editing a profile cannot alter
history, standing, or recognition.**

The distinction is precise:

- **Decorative profile fields** (handle, bio, avatar, outbound links)
  remain user-editable. They describe the player; they do not measure
  the player.
- **Merit-bearing surfaces** (badges, rank, replay history,
  competitive submissions) are derived from immutable underlying
  records (`legendary.competitive_scores`, `legendary.replay_blobs`,
  `legendary.player_badges`) and are not editable from the profile.
- A profile change cannot retroactively change a leaderboard
  position, revoke a badge that was earned, or rewrite a replay
  outcome.

Profiles reflect proven history; they do not produce it.

---

### Skill Measurement & Competitive Benchmarking

Legendary Arena is not only a faithful digital implementation of *Marvel Legendary* — it is designed to become the **definitive environment for measuring player skill, strategic decision‑making, and team composition effectiveness** across all valid game scenarios.

To support this, Legendary Arena adopts a standardized performance framework inspired by **PAR scoring in golf**: a shared, scenario-specific benchmark against which skillful play can be objectively measured.

**Public competitive recognition and personal achievement recognition
are distinct.** Only replay-verified, scenario-normalized outcomes may
appear in comparative competitive contexts (leaderboards, ladders,
year-end honors, archive standings). Personal milestones (veteran
recognition badges, profile achievements) may appear on profiles
without altering any comparison surface. The two surfaces are
governed separately: comparison by §25(a), recognition by §25(b),
and they never feed each other.

#### 20. PAR-Based Scenario Scoring

For every valid combination of:
- Scheme
- Mastermind
- Villain groups

Legendary Arena defines a **PAR baseline**.

PAR represents the expected outcome of **competent, rules-faithful play** by experienced players. It is **not perfect play**, and it is deliberately **beatable**.

PAR exists to establish:
- A shared difficulty reference
- A stable comparison point across players and hero lineups
- A common language for evaluating performance

#### 21. Scenario-Aware Scoring Model

Player performance is evaluated using a **composite, scenario-aware scoring model** derived from the complete game record.

**Positive Performance Factors**
- Total Victory Points earned
- Number of bystanders rescued
- Efficient resolution (fewer rounds / hands played)

**Penalty Factors**
- Villains escaped
- Scheme twists resolving negatively
- Other scenario-defined failure or pressure events

Each scenario defines explicit weightings for these factors, producing a **normalized score relative to PAR**.

Scoring is objective, transparent, and scenario-specific — never generic or one-size-fits-all.

#### 22. Deterministic & Reproducible Evaluation

- Scoring is fully **deterministic**
- Results are computed entirely from:
  - The authoritative game log
  - The final game state
- No subjective judgment, heuristics, or inferred intent is permitted

If a game can be replayed, it must produce the same score. Anything else is invalid.

#### 23. Competitive Leaderboards & Submission

Legendary Arena supports **optional competitive benchmarking** — never
real-time or turn-based player-vs-player combat.

Two competitive surfaces are sanctioned:

**(a) Scenario benchmarking (primary).** Players compete by selecting
a defined scenario (Scheme + Mastermind + Villains) and a chosen hero
composition. The competitive question is always:

> "Who can achieve the best performance **against this scenario** with
> **this team**?"

**(b) Asynchronous player-vs-player comparison (secondary).** Players
may be compared against one another through aggregate views over their
independently played, replay-verified scenario runs — seasonal ladders,
year-end honors, cross-scenario archives. In this surface:

- Players never interact during gameplay
- Players never share a game state
- Players never act as opponents inside a match
- Competition occurs only by comparing outcomes after the fact

This is **competition via comparison**, not combat. The underlying
inputs remain scenario-specific and replay-verified per §22 and §24.

The competitive question, in either surface, is never:

> "Who unlocked or purchased more advantages?"

Supported structures include:
- Scenario-specific leaderboards
- Aggregate seasonal leaderboards over verified scenario runs
- Public or private scoreboards
- Player-submitted results verified by replay data

See D-0005 for the decision record authorizing surface (b).

#### 24. Replay-Verified Competitive Integrity

All leaderboard entries must be:
- Backed by a complete, deterministic replay
- Fully re-scorable by the engine
- Immune to tampering, editing, or manual adjustment
- Competitive integrity is enforced structurally by the platform, not by moderation, trust, or manual review

Competitive integrity is enforced by mathematics and reproducibility, not trust.

#### 25. Skill Over Repetition (Anti-Bot, Not Anti-Veteran)

This system exists to:
- Reward strategic mastery
- Expose meaningful differences in player decision-making
- Encourage experimentation with hero teams and approaches
- Honor seasoned players whose sustained, high-quality play has
  contributed to Legendary Arena over months and years

It must never reward:
- Bot scripts, automation, or alt-account farming
- Repetitive low-quality play of the same scenario for cumulative-count credit
- Exploit-driven optimization

The intent of this clause is anti-bot and anti-farm, not anti-veteran.
A player who has invested years in Legendary Arena and accumulated
demonstrably high-quality play across many scenarios is exactly the
kind of player this system exists to recognize. The language *"how
long or how often"* below targets bots gamifying the system, not the
veteran whose long history of skilled play is itself the achievement.

Legendary Arena measures **how well** a game was played as the
primary axis. **Sustained quality over time** is recognized as a
secondary axis when — and only when — every contributing run has
independently met a quality floor.

This applies to every competitive surface, including §23(b)
asynchronous comparison, under three distinct rules:

(a) **Rankings — volume input forbidden.** Seasonal ladders, year-end
    honors, archive standings, and any other competitive ranking
    surface MUST use quality-normalized inputs only — best-N-runs,
    average PAR delta, per-attempt efficiency, or equivalent.
    Cumulative counts of wins, sessions, or attempts alone are NOT
    valid ranking inputs. (This rule is unchanged from the
    pre-amendment §25 and is reinforced by D-0005.)

**All badges represent verifiable claims.** Every earned badge
corresponds to replay-validated performance, attested community
contribution, or deterministic project-state evidence. Badges are
never cosmetic achievements without objective backing. The three
evidence classes map to the badge issuer tiers defined in D-1004
(rule-driven, admin-attested, external-system-attested). A badge
proposal that cannot identify its evidence class is not a badge
proposal under this vision.

(b) **Recognition — volume permitted under bot-resistance constraints.**
    Veteran-recognition badges, profile milestones, and similar
    non-competitive honors MAY count qualifying runs, provided ALL
    of the following hold:

    - **Quality floor.** Each contributing run independently passes
      a quality predicate (e.g., sub-PAR final score, zero villain
      escapes, zero Master Strikes resolved, all bystanders rescued,
      or a scenario-specific equivalent declared in the badge's
      criteria). Runs that fail the floor do not count toward the
      threshold.
    - **Distinct-scenario breadth.** Thresholds are stated in
      distinct `ScenarioKey`s (per `parScoring.types.ts`), not in
      repeats of the same scenario. The same scenario beaten 1,000
      times advances the badge by exactly one.
    - **Real-time elapsed window.** The badge is issued only after a
      stated minimum wall-clock window has passed since the player's
      first qualifying run. A binge-in-a-day cannot satisfy a
      veteran badge regardless of run count.
    - **No feed into rankings.** Recognition badges issued under this
      clause do not feed any ranking, ladder, or honors computation.
      They live on the profile surface; rankings are governed by (a).

(c) **Telemetry — display only.** Volume statistics — total runs
    completed, hours played, lifetime scenario coverage — may be
    recorded and displayed as non-ranking, non-recognition profile
    data. They never feed rankings (governed by (a)) and they do not
    by themselves issue badges (governed by (b)).

Bot-resistance is the test that distinguishes (a) from (b). A
criterion is permitted under (b) if a bot script optimizing for it
would still have to produce a long, distributed history of
high-quality play that materially benefits the community. A
criterion is forbidden under (b) if it can be satisfied by
repetitive low-quality play, by a single binge, or by farming the
same scenario.

Repetition alone is worthless. Repetition layered on quality,
sustained over years across many scenarios, is exactly what veteran
recognition rewards.

See D-0006 for the decision record authorizing rule (b).

#### 26. Simulation-Calibrated PAR Determination

**PAR is determined by simulation before players ever choose heroes, so success
reflects skill — not hindsight adjustment.**

PAR calibration uses a three-phase pipeline:

1. **Content-driven seed** — every Mastermind, Scheme, and Villain Group carries
   a transparent, version-controlled Difficulty Rating (integer 1-10). A formula
   produces an immediate PAR estimate for any scenario. This provides day-one
   coverage before simulation runs.

2. **Simulation calibration** — heuristic AI plays hundreds to thousands of games
   per scenario (no hero optimization — PAR is scenario-only). PAR is set to
   the 55th percentile of simulated Raw Scores, targeting 80-90% accuracy at
   launch.

3. **Post-release refinement** — real player data validates and refines difficulty
   ratings over time, without changing the scoring formula or invalidating
   existing scores.

This means:
- Every valid scenario has a PAR baseline immediately (seed), refined before
  release (simulation), and validated over time (real data)
- PAR is always scenario-only — never adapted to hero selection or luck
- Difficulty ratings give players a human-readable explanation of why PAR is
  what it is; simulation gives statistical correctness
- New expansions receive PAR automatically when difficulty ratings are assigned
  and simulation is run

Once declared, PAR baselines are immutable for the purpose of competition.
Refinements create new versions, never retroactive adjustments. This preserves
the meaning of historical scores and prevents hindsight bias.

For the full PAR derivation pipeline, see `docs/12-SCORING-REFERENCE.md`.

---

## PAR Scoring System — How It Works

Legendary Arena uses a **PAR-based scoring system**, inspired by golf, to measure
player skill, strategic efficiency, and team composition effectiveness across any
scenario.

The system has **two distinct layers**, exactly mirroring how golf works:

### Layer A: Scenario Difficulty (PAR = Course Rating)

PAR measures **how hard the scenario is**, independent of who plays it or which
heroes they choose. It is computed from the Scheme, Mastermind, Villain Groups,
and player count using difficulty ratings from the content registry.

PAR answers one question: *"What is a reasonable outcome for competent,
rules-faithful play on this setup?"*

- Static per scenario configuration
- Not player-adaptive, not hero-dependent, not luck-normalized
- Equivalent to a golf course's par rating

### Layer B: Player & Hero Performance (Execution Quality)

Each completed game produces a **Raw Score** derived from four outcomes in the
authoritative replay:

**Rewarded (better play = lower score):**
- Victory Points earned (defeating villains and masterminds)
- Bystanders rescued (saving civilians — the strongest positive action)

**Penalized (worse play = higher score):**
- Rounds played (efficiency)
- Escapes and penalties (loss of board control, scheme pressure, civilian casualties)

The Raw Score is then normalized against PAR:

```
Final Score = Raw Score - PAR
```

- **Negative** = under PAR (exceptional play)
- **Zero** = at PAR (solid, expected play)
- **Positive** = over PAR (room for improvement)

Lower is always better.

### Why the Separation Matters

Because these are separate layers:
- A brutal scenario can still produce elite scores
- An easy scenario can still expose poor play
- Hero selection becomes visible as skill, not luck
- Leaderboards are comparable within a scenario without flattening difficulty
  across scenarios

> **PAR measures how hard the world is.**
> **Final Score measures how heroic you were inside it.**

### What This Enables

- Objective comparison across players on a shared benchmark
- Meaningful leaderboards without PvP imbalance
- Replay-verified integrity (no cheating, no subjectivity)
- Insight into which hero teams perform best against each scenario
- Competition based on skill, not grinding or purchases

### What It Explicitly Avoids

- No pay-to-win modifiers
- No hidden scoring factors
- No subjective judgment
- No grind incentives or repetition rewards
- No scenario-agnostic scoring

If two players submit the same replay, the score is identical. Always.

For the full reference formula, weights, and worked examples, see
`docs/12-SCORING-REFERENCE.md`.

---

## Scoring Philosophy

The purpose of scoring is not to declare a single "correct" way to play *Marvel
Legendary*.

The purpose is to:
- Make skill visible
- Make improvement measurable
- Give players a reason to revisit scenarios with intention

PAR provides a shared performance language:
- **Under PAR** — exceptional execution
- **At PAR** — strong, expected play
- **Over PAR** — a challenge worth refining

### Heroic Values in Scoring

Legendary Arena judges heroes not by how quietly they contain threats, but by how
many lives they save.

The scoring model encodes a **moral hierarchy** drawn from the source material:

- Saving civilians is the **strongest positive action** a player can take
- Letting a villain escape is failure — but letting civilians suffer is worse
- A bystander lost to an escaping villain is penalized **more heavily** than a
  normal villain escape

This means a player who takes risks to rescue bystanders — even at the cost of
letting some villains escape — will outscore a player who plays conservatively and
maintains perfect board control but ignores civilians.

The system rewards **heroism**, not caution.

Legendary Arena becomes not only a place to play, but a **training ground for mastery** — where excellence is measurable, replayable, and earned.

**Legendary Arena scoring measures how well you solved the challenge — not how long
you played, how lucky you were, or what you unlocked.**

---

## Non-Goals: Exploitative Monetization (Explicitly Disallowed)

Legendary Arena will fund itself (see **Financial Sustainability** below), but
the following monetization *approaches* are permanently disallowed. They are
not "ideas for later." They are hard **non-goals**, regardless of market
trends, revenue pressure, or external requests.

If any of the following are proposed, the answer is **no**.

---

### NG‑1. Pay‑to‑Win or Power Purchases

Legendary Arena will **never** sell:
- Increased damage, draw power, or resource generation
- Modified card behavior
- Advantageous starting conditions
- Enhanced probabilities or altered randomness
- Any mechanical edge in competitive or cooperative play

If money changes how the game *plays*, it violates the vision.

---

### NG‑2. Gacha, Loot Boxes, or Randomized Purchases

- No loot boxes
- No card packs with randomized outcomes
- No real-money RNG tied to progression or ownership

All purchasable content must be:
- Fully disclosed
- Deterministic

---

### NG‑3. Pay-for-Power Content

Paid content (heroes, masterminds, villains, expansion packs) must
never be tuned differently based on ownership. Ownership never alters
card balance, behavior, or competitive viability.

---

### NG‑4. Energy Systems, Timers, or Friction Monetization

Legendary Arena will **never** include:
- Energy limits
- Cooldowns that can be bypassed with payment
- Artificial wait timers
- "Pay to skip" mechanics

Players are never monetized for wanting to play the game.

---

### NG‑5. Ads, Sponsorships, or Brand Insertion in Gameplay

- No advertisements during gameplay
- No branded cards or in-table sponsor placements that break immersion
- No sponsor messaging tied to in-game actions or outcomes

The gameplay frame is not an ad surface. Sponsorship of events,
tournaments, leaderboards, the marketing site, or other surfaces
outside the gameplay frame is governed by §Financial Sustainability,
not by this rule.

---

### NG‑6. Dark Patterns or Psychological Exploitation

Legendary Arena rejects:
- FOMO-driven monetization pressure
- Manipulative UX designed to induce spending
- Obfuscated pricing or bundled confusion
- Deceptive scarcity claims (fake urgency, false "X left!" counters)

If a monetization tactic relies on psychological pressure rather than value, it is disallowed.

---

### NG‑7. Monetization That Requires Apology or Explanation

A simple rule:

> **If a monetization decision requires a forum post explaining why "it's actually fair," it is already disqualified.**

Monetization must be:
- Obvious
- Honest
- Respectful
- Transparent in pricing

---

### NG‑8. Social Influence & Network Mechanics

**Legendary Arena supports descriptive identity, not social
networking.**

Profiles may link outward (personal sites, Discord, LinkedIn,
YouTube, Steam, etc.), but the Arena itself does not host:

- Follower or following graphs
- Like / heart / upvote / endorsement counters
- Karma, influence, or reputation scores derived from social activity
- Trending feeds, "popular players," or any amplification mechanic
  driven by attention rather than play
- Comment threads on profiles that produce visible reputation signal

Outbound links describe a player; they do not rank or amplify them.
Recognition flows from skill (§25(a)) and from sustained quality
(§25(b)) — never from popularity, follower count, or social signal.

The reason is the same as NG‑6: any system that rewards attention
will eventually drift into rewarding manipulation of attention. Merit
must remain the only currency.

---

### Monetization Boundary Summary

Legendary Arena **will** generate revenue (see Financial Sustainability below)
but draws a permanent line:

- **Bright lines:** no pay-to-win (NG‑1), no gacha or randomized
  purchases (NG‑2), no balance disparity between paid and free
  content (NG‑3), no friction monetization (NG‑4), no ads inside the
  gameplay frame (NG‑5), no dark patterns (NG‑6), no monetization
  that requires apology (NG‑7)
- **Open commercial space:** any revenue model that stays on the
  right side of those lines — subscriptions, expansion packs,
  cosmetics, enterprise and tournament licensing, sponsorship outside
  the gameplay frame, premium tiers, recognition programs, and any
  other model not yet imagined

The fastest way to destroy trust is to compromise fairness.
Legendary Arena chooses trust — even when it costs money.

This boundary is final.

---

## Financial Sustainability ("No Margin, No Mission")

**No margin, no mission.**

Legendary Arena is not a hobby project or a temporary experiment. It is a living digital institution built for decades of service. If the project cannot generate enough revenue to cover all real-world expenses — cloud hosting, R2 storage, bandwidth, maintenance, security, legal compliance, and ongoing development — then the vision is doomed from the start. Longevity without solvency is an illusion.

This principle is **foundational**. It directly supports Primary Goal 5 (Longevity & Expandability) and is treated with the same seriousness as Rules Authenticity or Player Trust.

### Core Requirements

- The game must be **financially self-sustaining** from launch onward
- Revenue must never compromise any Primary Goal, Secondary Goal, or Non-Goal
- Revenue models must protect gameplay fairness (per Non-Goals NG‑1 through NG‑7); within that constraint, pricing, packaging, and distribution are open commercial decisions

### Sustainable Revenue Model

Legendary Arena will fund itself through transparent, value-adding revenue streams that respect the vision:

1. **Legendary Supporter Subscriptions**
   Monthly or annual tiers that unlock cosmetic and convenience
   enhancements: custom playmats, card-back designs, UI themes, sound
   packs, unlimited cloud replay storage, advanced export filters,
   priority matchmaking queues, and early access to non-gameplay
   features. Subscriptions deliver real product differentiation; the
   only thing they never include is gameplay advantage.

2. **One-Time Cosmetic & Presentation Purchases**
   Deterministic, fully disclosed packs of visual flair (alternate frames, themed tables, avatar options) that enhance the table experience without altering rules or balance.

3. **Premium Recognition Tiers**
   Higher-tier supporter programs where backers receive public
   recognition, exclusive cosmetic flair, and priority access to
   community surfaces. Supporter names may appear in credits or on a
   permanent "Hall of Legends" wall.

4. **Enterprise & Organized-Play Licensing (Future-Proofed)**
   Paid hosting tools or white-label access for tournament organizers, content creators, schools, or libraries — strictly for facilitation, never for player advantage.

### Royalties & IP Ecosystem Support

A non-negotiable portion of every dollar earned flows directly as **royalties to Upper Deck Entertainment and Marvel**.

- These royalties are paid promptly and transparently on all revenue streams
- They exist to fuel the continued creation of new physical Legendary sets, heroes, villains, masterminds, and schemes
- More revenue for Legendary Arena means more money for Upper Deck and Marvel to hire premium artists, writers, and designers — directly improving the artwork, thematic depth, and overall quality of the card game that Legendary Arena faithfully recreates
- This creates a virtuous cycle: a thriving digital Arena leads to stronger royalties, which leads to richer official content, which leads to an ever-expanding, higher-quality experience for every player, physical and digital alike

Financial success is not an afterthought; it is the engine that keeps the entire Legendary ecosystem alive and growing.

### Operational Guardrails

- Full revenue will be directed first to covering expenses and royalties, then to an operating buffer and content expansion
- If revenue ever falls short, non-essential features will be scaled back **before** any compromise to rules, fairness, accessibility, or royalties

This is not a compromise.
This is the hard truth that makes every other goal possible.
**No margin, no mission.**

---

## How This Document Is Used

- **Design review:** Does this change violate a primary goal?
- **Architecture review:** Does this weaken or bypass a secondary goal?
- **Scoring review:** Does this compromise the fairness or determinism of competitive measurement?
- **Monetization review:** Does this cross a non-goal boundary?
- **Financial review:** Does this support long-term sustainability, royalties, and ecosystem health without violating any other rule?
- **Execution review:** Is this aligned with Legendary Arena's intent?
- **Pre-flight review:** Does the Work Packet align with the vision before execution begins?
- **Onboarding:** New contributors read this document first — it defines the *why* behind every decision

Primary goals define **what must never change**.
Secondary goals define **how we choose to build it today**.
Non-goals define **how we will never make money**.
Financial sustainability defines **how we will make money** — and why it matters.

---

**Legendary Arena is the definitive, faithful, digital home for the greatest cooperative deck-building experience ever created — built with reverence for the tabletop original, engineered to last, funded in a way that protects the vision forever, and designed to send real money back to Upper Deck and Marvel so they can keep making even more beautiful, magical sets for years to come.**

This is our covenant.
This is our vision.
This is Legendary Arena.

---
