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

> **Editing this page**
>
> This ewiki page mirrors the homepage strategy reference. The source
> lives at `C:\www\legendary-arena-com\docs\marketing\homepage-appendix.md`
> (in the `legendary-arena-website` repo, not this repo).
>
> - **To edit the source document:** edit the file in the marketing repo,
>   commit with `SPEC:` prefix, push to `main`.
> - **To edit this ewiki page:** edit
>   `C:\pcloud\BB\DEV\legendary-arena\wiki\homepage-appendix.md`,
>   commit with `SPEC:` prefix, push to `main` in the `legendary-arena` repo.
> - **Keep both in sync.** If the source document changes, update this
>   ewiki page too.

## Summary

The strategy reference companion to [Homepage Spec](homepage-spec.md).
Contains the full theoretical foundation, research, and architecture
that supports the homepage build document: the Player Needs Pyramid
(game-specific Maslow hierarchy with five levels), the complete
25-problem catalog organized under four themes (Fairness, Skill
Measurement, Authenticity, Scalability), the badge system architecture, the L2→L4
trust-to-recognition dependency analysis, and the content framework
for applying Problem → Product → Result across newsletters, blogs,
and emails. Designers and developers work from the spec; this appendix
answers "why" when the spec says "what."

## Mechanics

### Player Needs Pyramid

StoryBrand grounds its framework in behavioral psychology: the brain
scans its environment for information that helps it survive and thrive.
If messaging doesn't connect to that primitive calculus, the customer
tunes out.

Miller maps this to Maslow's hierarchy. The brain processes needs in
order — physical survival first, then safety, then belonging, then
esteem, then self-actualization. The hierarchy is strict: **if
lower-level needs aren't satisfied, higher-level messaging fails.**

For Legendary Arena, the generic Maslow levels translate into a
game-specific Player Needs Pyramid:

```
    5. MASTERY & MEANING
       Become a smarter, better player

    4. RECOGNITION
       Skill is measured and rewarded

    3. COMMUNITY
       Play with others who care about fairness

    2. TRUST & FAIRNESS
       No cheating, no pay-to-win, full transparency

    1. ACCESS & PERFORMANCE
       Fast, reliable, frictionless gameplay
```

#### Level 1 — Access & Performance (Physiological Equivalent)

**What the player asks:** "Can I actually play this easily?"

The base of the pyramid. If the game doesn't load, crashes, or puts
barriers between the player and gameplay, nothing above this level
matters.

| Player Need | How LA Meets It | Problems Addressed |
|-------------|-----------------|-------------------|
| Game works instantly | Web-based — play in your browser, no installs | #15 (session reliability) |
| No barriers to entry | No gating, no waiting systems, no setup friction | #2 (grind/time-gates) |
| Recoverable sessions | Stateless client, reconnection support | #15 (session reliability) |
| Performance-first | Designed for responsiveness (Vision §16) | — |

**Met?** Yes. Strong alignment with product architecture.

**Homepage copy opportunity:**

> Play instantly in your browser. No installs. No friction.

**Homepage section mapping:** Hero, Plan

---

#### Level 2 — Trust & Fairness (Safety Equivalent)

**What the player asks:** "Is this game rigged?"

This is Legendary Arena's **single strongest differentiator.** Most
games compete at levels 3-4 (social, achievement). Very few address
level 2. The pay-to-win villain attacks this level directly — it
threatens the player's sense that the system is fair and stable.

| Player Need | How LA Meets It | Problems Addressed |
|-------------|-----------------|-------------------|
| No pay-to-win | No purchasable power, no tier-gated mechanics (NG-1) | #1 (pay-to-win) |
| No hidden manipulation | No secret modifiers, no manipulated RNG | #4 (hidden mechanics) |
| Rules don't change | Deterministic engine, explicit change governance | #3 (balance patches) |
| Verifiable outcomes | Replay verification, inspectable logs (Vision §3) | #10 (verifiable results) |
| Transparent scoring | PAR-based scoring, every component visible | #5 (gameable leaderboards) |

**Met?** Yes. Deeply solved — this is LA's core thesis.

**Homepage copy opportunity:**

> Every game is verifiable. Nothing is hidden. Skill is all that matters.

Alternative (emotion-first):

> Finally, a card game you can trust.

**Homepage section mapping:** Hero, Problem (the villain's home level)

**Strategic insight:** The pay-to-win villain is powerful precisely
because it attacks level 2 — the player's sense of safety and trust.
When Legendary Arena positions itself as the alternative, it's not just
offering a better game; it's offering relief from a fundamental
betrayal of the player's trust.

---

#### Level 3 — Community (Belonging / Tribe Equivalent)

**What the player asks:** "Do people like me play this?"

Once the game works and is fair, the player needs to know they're not
alone — that a community exists, and that it shares their values.

| Player Need | How LA Meets It | Problems Addressed |
|-------------|-----------------|-------------------|
| Cooperative play | Multiplayer mirrors tabletop cooperation (Vision §4) | #14 (multiplayer cooperation) |
| Reliable sessions | Reconnection + late-joining support | #15 (session reliability) |
| Shared experiences | Spectation, shared scenarios, benchmarks | #18 (spectation) |
| Active community | Discord, tournaments, shared challenge runs | #6 (mastery over volume) |

**Met?** Yes, architecturally. But **not communicated on the homepage.**

**Homepage copy opportunity:**

> Join a community of players who believe skill should decide every match.

**Homepage section mapping:** Results, Proof

---

#### Level 4 — Recognition (Esteem / Status Equivalent)

**What the player asks:** "Am I getting better? Does it matter?"

The player now wants proof that their skill is real, measurable, and
respected. Maslow places achievement, mastery, and recognition squarely
in the esteem layer.

Esteem needs have two faces:

- **Self-respect** — confidence in one's own ability
- **Recognition from others** — status and reputation among peers

| Player Need | How LA Meets It | Esteem Function | Problems Addressed |
|-------------|-----------------|-----------------|-------------------|
| Objective skill measurement | PAR-based scenario scoring (Vision §20) | Self-respect | #7 (skill measurement) |
| Performance benchmarks | Scenario-specific baselines, AI playtesting (§22-23) | Self-respect | #9 (performance reality) |
| Verified leaderboards | Replay-verified, immutable rankings (§24) | Recognition | #5 (gameable leaderboards) |
| Anti-grind scoring | Quality-based scoring, not volume-based (§25) | Both | #6 (repetition over mastery) |
| Profiles reflect truth | Performance-derived identity (§19a) | Both | #9 (performance reality) |

**Met?** Yes, deeply. But **not communicated on the homepage.**

**Critical dependency: Recognition requires Trust (L2 → L4).**

This is the most important structural relationship in the pyramid.
Recognition systems only work when the underlying system is trusted.
Most games break the esteem layer by:

- Rewarding **time played** instead of skill
- Inflating achievements so everyone "wins"
- Allowing pay-to-win to corrupt rankings
- Making leaderboards grind-based or gameable

Legendary Arena's recognition system is fundamentally different because
Level 2 (Trust & Fairness) is rigorously enforced:

- Recognition is **earned through replay-verified performance**
- Rankings are **skill-based, not volume-based**
- Achievements are **provable and deterministic**
- Profiles reflect **truth, not perception** (§19a)

**Recognition also feeds upward into Level 5 (Mastery).** It gives
players feedback loops that define what "better" means, creates
long-term goals, and makes the pursuit of excellence visible.

##### Public Leaderboard (WP-149 — Live Surface)

The public leaderboard at `legendary-arena.com/leaderboard/` is the
first user-visible surface of the recognition system. It is a read-only
page consuming the engine's leaderboard API and rendering three views:

1. **Top-N Global PAR** — default view; lowest `finalScore` entries
   across all PAR-published scenarios.
2. **Theme Score** — theme-grouped leaderboard (via `?themeId=`).
3. **Scheme-Mastermind** — URL contract reserved; renders "coming soon"
   placeholder in v1.

Every value on the page (rank, finalScore, rawScore, parVersion,
replayHash, playerDisplayName) comes directly from the API response —
the page performs zero client-side score derivation. Each entry exposes
`replayHash` as a permalink to the underlying replay, making every
ranking position independently verifiable.

**Status:** Drafted, blocked on WP-148 (CORS) + WP-150 (aggregation
endpoints). Vision alignment: §3 (player identity), §10 (content
semantics), §22 (replay verification), §24 (skill measurement).

##### Badge System Architecture (Esteem Engine)

Badges are not rewards — they are **public proof of identity.** When
designed correctly, they create status, signal skill, and enable
recognition by others.

Most games misuse badges by rewarding activity ("Played 100 games,"
"Logged in 30 days," "Spent $50"). This inflates badge counts, destroys
meaning, and collapses the esteem layer into noise. Legendary Arena's
badge system must be fundamentally different: every badge is tied to
replay-verified, deterministic outcomes.

**Five badge categories, each targeting a specific esteem driver:**

| Category | Purpose | Examples | Esteem Driver | Frequency |
|----------|---------|---------|---------------|-----------|
| **Skill** | Prove true competence (highest value) | "Under PAR" — beat scenario benchmark; "Perfect Execution" — no villain escapes; "Strategist" — top X% performance | Competence + respect | Rare |
| **Progression** | Show "I am improving" (momentum) | First sub-PAR run; 5 scenarios under PAR; personal best streak | Self-respect via visible growth | Frequent |
| **Recognition** | Let others see achievement (social) | Weekly Top 10; tournament finalist; "Community Champion" | Status + social standing | Limited |
| **Challenge** | Create aspirational goals | "No Escapes"; "All Bystanders Saved"; scenario-specific achievements | Aspiration + engagement | Moderate |
| **Legacy** | Build long-term identity (lock-in) | Veteran of 50 scenarios; year-end top performer; "Founding Competitor" | Permanent investment + loyalty | Rare |

**System design rules (non-negotiable):**

1. **Badges must represent real achievement.** Every badge is tied to
   replay data, verified scoring, and deterministic outcomes.
2. **Badges must be public and visible.** Show badges on profile cards,
   leaderboards, and match lobbies.
3. **Use tiered progression.** Strategist I → Strategist II →
   Strategist III.
4. **Balance rare vs. frequent.** Frequent badges drive retention. Rare
   badges drive prestige.
5. **No participation badges.** Never reward just "playing a game."

**Badge metadata model:**

```
Badge:
  id:         string
  name:       string
  category:   skill | progression | recognition | challenge | legacy
  criteria:   replay-derived rule
  visibility: public | profile | leaderboard
  rarity:     common | rare | elite
  proof:      replay_id (link to verifiable replay)
```

**The L2 → L4 dependency applies directly to badges.** Because Level 2
is rigorously enforced, every badge carries real weight. "Under PAR"
means the player genuinely beat the scenario benchmark in a verifiable
game.

**Homepage copy opportunity:**

> Your rank reflects how well you play — not how much you grind.

> Every score is replay-verified.

> If you earn it here, it's real.

**Homepage section mapping:** Product, Results

---

#### Level 5 — Mastery & Meaning (Self-Actualization Equivalent)

**What the player asks:** "Is this worth mastering?"

The top of the pyramid. The player seeks deep strategy, long-term
growth, and the experience of becoming someone better through play.
This is where identity transformation lives.

| Player Need | How LA Meets It | Problems Addressed |
|-------------|-----------------|-------------------|
| Deep strategy | Deck-building + scenario variety + expansion depth (§10) | #16 (expansion scaling) |
| Post-game growth | Replay analysis, step-by-step playback (§18-19) | #8 (post-game insight) |
| Exportable learning | Structured JSON export, external tool analysis | #8 (post-game insight) |
| True-to-tabletop | Exact rules fidelity, content authenticity (§1-2) | #11 (rules authenticity) |
| Aspirational identity | Strategist, not grinder. Respected competitor. | #7, #9 |

**Met?** Yes. This is the long-term hook — the reason players stay.

**Homepage copy opportunity:**

> A training ground for mastery.

**Homepage section mapping:** Results, Identity Transformation

---

#### Pyramid Summary

| Level | Player Need | Met? | Communicated on Homepage? |
|-------|------------|------|--------------------------|
| 5. Mastery & Meaning | Deep strategy, growth, identity | Yes | No |
| 4. Recognition | Skill measurement, provable rank | Yes | No |
| 3. Community | Cooperative play, shared experience | Yes | No (footer only) |
| 2. Trust & Fairness | No pay-to-win, verifiable, deterministic | Yes | No |
| 1. Access & Performance | Instant play, no friction, recoverable | Yes | No |

**The product satisfies all five levels. The homepage communicates
none of them.**

#### Homepage-to-Pyramid Mapping

| Homepage Section | Primary Need Level | Why |
|-----------------|-------------------|-----|
| **Hero** | 1 (Access) + 2 (Trust) | Answer "what is this" and "can I trust it" before anything else |
| **Problem** | 2 (Trust) | The villain lives here — anchor the emotional hook at the trust level |
| **Product** | 2 (Trust) + 4 (Recognition) | Pillars resolve the trust problem; scoring system promises recognition |
| **Plan** | 1 (Access) + 2 (Trust) | Process plan removes friction (L1); agreement plan removes fear (L2) |
| **Results** | 4 (Recognition) + 5 (Mastery) | Show what players become — provable skill, deep strategy, identity |
| **Proof** | 3 (Community) + 4 (Recognition) | Testimonials, metrics, and community signals prove belonging + status |

#### Messaging Priority Rule

The hierarchy is strict. Homepage copy should address lower levels
before higher ones:

1. "Play instantly in your browser." (L1)
2. "Every game is verifiable. Nothing is hidden." (L2)
3. "Join players who believe skill should decide." (L3)
4. "Your rank reflects how well you play." (L4)
5. "A training ground for mastery." (L5)

#### Copy Direction: Anchor to Internal Feelings

| Instead of (external/feature) | Say (internal/feeling) |
|------------------------------|----------------------|
| "Skill-first game" | "Finally, a card game you can trust" |
| "Deterministic engine" | "Nothing is hidden — you can prove it" |
| "PAR-based scoring" | "Your rank means something real" |
| "Content-as-data architecture" | "New content never breaks what you've learned" |
| "Replay verification" | "Every result is provable" |

---

### Problems Legendary Arena Solves (Full Catalog)

The 25 problems below are derived from the Vision & Direction document,
work packets, and engine architecture. They are written in customer-facing
language and organized under three dominant themes. Each problem maps to
one of the SB7 problem levels (external, internal, or philosophical) and
references the source specification.

These are the raw materials for homepage copy, ad campaigns, email
sequences, and social content. The homepage itself should surface the
Core 5 (see [Homepage Spec](homepage-spec.md)); the rest live here as
a library.

#### Theme 1: Fairness (The Villain: Pay-to-Win)

The anchoring villain. Everything in this theme ladders under the
core emotional driver: the system is rigged against players who
won't pay.

**1. Pay-to-win systems destroy fair competition.**
Winning is tied to spending money, not skill. The best cards, heroes,
and strategies are locked behind paywalls.
Solved by: Absolute fairness — no purchasable power. No mechanic,
score, RNG seed, or matchmaking consideration depends on account tier.
(Vision NG-1, NG-3)
SB7 level: External + Internal ("it feels rigged")

**2. Grind walls and time-gates replace actual gameplay.**
Players must grind endlessly, wait on energy timers, or log daily to
stay competitive. The game rewards hours logged, not decisions made.
Solved by: No timers, no energy systems, no artificial friction. Every
player has access to the same competitive surface from day one.
(Vision NG-4)
SB7 level: External + Internal ("I'm on a treadmill, not playing a game")

**3. Balance patches destroy the deck you spent weeks learning.**
A patch drops, your carefully-built strategy is invalidated overnight,
and you start over. The rules shift under your feet every cycle.
Solved by: Deterministic, stable ruleset. The system you learn today
is the system you face tomorrow. Rule changes follow explicit change
governance — no silent drift.
(Vision §14, WP-040)
SB7 level: External + Philosophical ("games should reward the investment
you made in learning them")

**4. Hidden modifiers and opaque mechanics erode trust.**
Players can't verify if outcomes are truly fair. Secret difficulty
adjustments, invisible handicaps, or manipulated RNG create suspicion
that the system is working against you.
Solved by: No hidden modifiers. All randomness is verifiably fair and
seeded for replay verification. The engine enforces rules with perfect
neutrality and never makes strategic decisions on behalf of players.
(Vision §3, WP-027)
SB7 level: Internal ("I don't trust the system") + Philosophical
("players deserve to know the rules are being followed")

**5. Leaderboards and ranks can be gamed or manipulated.**
Profiles, ranks, and achievements feel arbitrary because scores aren't
verified. Players worry that top spots are cheated or secretly adjusted.
Solved by: All leaderboard entries are replay-verified and immutable.
Every score is anchored to a cryptographic hash of the replay — tampering
is impossible.
(WP-053, WP-054, Vision §24)
SB7 level: External + Internal ("my rank doesn't mean anything if others
can cheat")

**6. Competition rewards repetition instead of mastery.**
Grinding the same scenario or farming volume gives an advantage over
players who play fewer, higher-quality sessions.
Solved by: Quality-based scoring and anti-farm rules. PAR-based scoring
rewards how well you play, not how often.
(Vision §25)
SB7 level: External + Philosophical ("skill should matter more than
volume")

#### Theme 2: Skill Measurement (The Promise: Provable Mastery)

Players want to know they're getting better — and they want proof
that their skill is real, not a function of luck or system
manipulation.

**7. Skill is hard to measure objectively.**
No reliable way to compare performance across games, scenarios, or
opponents. "Did I win because I'm good, or because the draw was lucky?"
Solved by: PAR-based scenario scoring with full transparency. Players
see raw score, PAR baseline, and final score. Every scoring component
(rounds survived, villains defeated, bystanders rescued) is visible.
(WP-048, Vision §20-24)
SB7 level: Internal ("I don't know if I'm actually good")

**8. Players lack meaningful post-game insight.**
The game ends and there's no structured way to review what went right
or wrong. No way to learn from mistakes or identify patterns.
Solved by: Replay logs with step-by-step playback. Structured JSON
export for external analysis. Every decision from start to end is
reviewable.
(Vision §18, §19, WP-027)
SB7 level: External + Internal ("I want to get better but I can't see
what to fix")

**9. Performance perception doesn't match reality.**
Players' feelings about their skill level may be wrong. No benchmark
exists for what "good" performance looks like on a given scenario.
Solved by: PAR provides a fixed benchmark per scenario. AI playtesting
generates simulated baseline win rates. Players can compare their
performance to published baselines and measure improvement over time.
(WP-036, WP-037, Vision §22)
SB7 level: Internal ("I think I'm better than I am — or worse")

**10. Game results can't be independently verified.**
When disputes arise — in tournaments, in leaderboards, in community
discussions — there's no way to prove what actually happened.
Solved by: Deterministic replay engine. Any game can be re-executed
from its seed and inputs to produce identical results. Replays are
first-class features, not afterthoughts.
(Vision §3, §18, WP-027)
SB7 level: External + Philosophical ("competitive integrity requires
proof, not trust")

#### Theme 3: Authenticity (The Standard: True to Tabletop)

Players who love the physical card game want a digital version that
respects the original — not a simplified, dumbed-down, or
reinterpreted adaptation.

**11. Digital adaptations alter the original game experience.**
Rules are simplified, misinterpreted, or changed for digital
convenience. Card interactions that work one way at the table work
differently on screen.
Solved by: Exact rules and content authenticity. Every timing window,
trigger interaction, and edge case matches the official game and errata.
No digital shortcuts.
(Vision §1, §2, WP-001)
SB7 level: External + Philosophical ("if it's called Legendary, it should
play like Legendary")

**12. Digital cards don't match their physical counterparts.**
Art is altered, names are changed, card text is rewritten, or gameplay
behavior diverges from what's printed on the physical card.
Solved by: Same card images, names, text, and semantics as physical
cards. Behavior derives from printed rules text and official errata.
(Vision §2, WP-001)
SB7 level: External + Internal ("this isn't the game I know")

**13. The system makes decisions players should make.**
Automated systems play cards, resolve triggers, or make tactical
choices on the player's behalf — removing the agency that makes the
game interesting.
Solved by: The system enforces rules and supports players but never
replaces player judgment with automation. Every decision point that
exists at the tabletop exists in the digital version.
(Vision §3, §4)
SB7 level: Internal ("the game is playing itself") + Philosophical
("players should make their own choices")

**14. Multiplayer cooperation doesn't work like it does at the table.**
Digital multiplayer changes how cooperation works — removing player
agency, adding AI decisions, or forcing simplified turn structures
that don't match the tabletop experience.
Solved by: Turn order, cooperation, and shared responsibility are
preserved exactly as tabletop. The system supports multiplayer rather
than replacing it with automation.
(Vision §4, WP-011, WP-012)
SB7 level: External + Internal ("this doesn't feel like playing with
my friends")

**15. Multiplayer sessions are fragile and unreliable.**
Disconnects, desyncs, and dropouts ruin cooperative games. Players
can't reliably rejoin a game in progress.
Solved by: Reliable synchronization, explicit reconnection semantics,
and late-joining support. A dropped connection doesn't mean a lost game.
(Vision §4, WP-012, WP-116)
SB7 level: External ("we lost 30 minutes of gameplay to a disconnect")

**16. New expansions break existing content.**
Adding new heroes, villains, or sets requires engine rewrites or
introduces bugs that break previously-working cards and interactions.
Solved by: Content-as-data architecture. New content is added as JSON
registry entries without touching engine code. The system scales from
dozens to hundreds of cards without rewrites.
(Vision §5, §10)
SB7 level: External + Philosophical ("expansions should add to the game,
not break it")

**17. Game history is lost after you finish playing.**
The session ends and you can never go back to it — never review it,
share it, or learn from it. Great moments vanish.
Solved by: Every game is automatically saved as a replayable, shareable
log. Replay library persists games for minimum 30 days on server, or
indefinitely via local export.
(WP-052, WP-103, Vision §18)
SB7 level: Internal ("I wish I could show someone that game")

**18. Spectating is a second-class experience.**
Watching someone else play shows different information, behaves
differently than actual play, or is simply unavailable.
Solved by: Live spectation and post-game viewing use the same replay
engine. Zero divergence from actual gameplay. Spectators see filtered
views (no hidden cards) but the same game.
(WP-029, Vision §18)
SB7 level: External + Internal ("I want to watch and learn, but I can't")

**19. Accessibility is an afterthought.**
No keyboard navigation, no screen-reader support, no color-blind
indicators. Players with disabilities are locked out of the experience.
Solved by: Full keyboard navigation, screen-reader support, high-contrast
modes, and color-blind friendly indicators. Accessibility enhancements
never alter rules or give advantage.
(Vision §17)
SB7 level: External + Philosophical ("every player deserves to play")

**20. Player identity and history are controlled by third parties.**
Your account, reputation, and competitive history are tied to a
third-party auth provider. If that provider changes policies or shuts
down, your identity goes with it.
Solved by: Player identity, reputation, and competitive history are
owned exclusively by Legendary Arena, keyed by stable internal account
IDs. Swapping auth providers loses no player data.
(Vision §3, §7a)
SB7 level: Internal ("I don't own my own gaming identity") +
Philosophical ("players should own their history")

#### Theme 4: Scalability (The Barrier: The Physical Game Doesn't Scale)

The umbrella villain for this theme: *the game you love becomes harder
to use the more you invest in it.* These problems hit players who are
deeply committed to the physical game — and feel the friction growing
with every expansion they buy.

**21. You can't access the full game — older sets are out of print.**
New players are locked out of older sets that are no longer available.
The "complete experience" depends on what you managed to buy, not what
exists. The game's depth becomes a function of supply, not interest.
Solved by: Every card, hero, and expansion is available digitally from
day one. Content-as-data architecture means nothing goes "out of print."
The full game is always accessible to every player.
(Vision §5, §10)
SB7 level: External + Internal ("I'm missing part of the game, and
it's not my fault") + Philosophical ("a game shouldn't disappear just
because products go out of print")

**22. The game takes over your space.**
Dozens of expansions mean shelves of boxes, playmats, tokens, and
binders. Playing the full game requires dedicating real physical space.
The more you invest, the more impractical it becomes — especially in
small apartments, dorms, or shared spaces.
Solved by: The entire game lives in your browser. No boxes, no storage,
no physical footprint. Every expansion, every card, zero shelf space.
SB7 level: External + Internal ("I love this game, but it's becoming
impractical")

**23. Taking the game anywhere is a chore.**
Want to play at a friend's house or a family gathering? Now you're
carrying boxes, organizing decks, and hoping nothing gets lost or
damaged. The friction kills spontaneous play — you don't play because
it's too much effort to set up.
Solved by: Play instantly in your browser, anywhere, on any device. No
cards to carry, no setup, no teardown. Spontaneous play is the default.
SB7 level: External + Internal ("this is too much effort just to play")

**24. There's no way to prove what actually happened in a physical game.**
Tracking results manually is slow, inconsistent, and error-prone. When
someone claims a high score or a perfect run, you just have to trust
them. Competition without verification isn't real competition.
Solved by: Every game is automatically recorded, replay-verified, and
publishable. Results are deterministic and independently verifiable.
No manual tracking, no trust required.
(Vision §3, §18, §24)
SB7 level: External + Internal ("does this even mean anything?") +
Philosophical ("competition without verification isn't real competition")

**25. Everything you learn disappears when the game ends.**
There's no shared system for strategies, results, or analysis. No place
to contribute knowledge. No way to build on others' discoveries. Every
insight stays locked in the player's head or scattered across forums
with no structure.
Solved by: Replay analysis, structured JSON export, PAR benchmarks, and
a public leaderboard create a shared knowledge layer. Players can
review their own games, compare against baselines, and learn from the
community's collective performance.
(Vision §18-19, §22, WP-149)
SB7 level: External + Internal ("I want to get better, but there's
nowhere to grow") + Philosophical ("mastery requires a system for
sharing knowledge")

#### Strategic Summary

The 25 problems collapse into four dominant themes for homepage messaging:

| Theme | Villain | Core Emotion | Key Problems |
|-------|---------|-------------|--------------|
| **Fairness** | The pay-to-win model | "It's rigged" | 1, 2, 3, 4, 5, 6 |
| **Skill Measurement** | Opaque/unverifiable systems | "I can't prove I'm good" | 7, 8, 9, 10 |
| **Authenticity** | Unfaithful digital adaptations | "This isn't the real game" | 11, 12, 13, 14, 15, 16, 17, 18, 19, 20 |
| **Scalability** | The physical game doesn't scale | "The more I invest, the harder it gets" | 21, 22, 23, 24, 25 |

The strongest anchoring villain for the homepage is **the pay-to-win
system** — it's universally understood, emotionally resonant, and
immediately positions Legendary Arena as the alternative. The
scalability theme (#21-25) is a powerful secondary hook for players
who already love the physical game and feel the friction growing.

---

### Content Framework: Applying Problem → Product → Result Beyond the Homepage

The homepage spec uses a strict Problem → Product → Result structure
because it is a sales surface. But the same three elements should be
present — implicitly or explicitly — in every piece of Legendary Arena
content. The difference is **how visible the structure is.**

#### Master Rule

Every piece of content must answer:

- **What's wrong?** (problem)
- **What fixes it?** (solution / product)
- **What changes?** (result)

These elements are always present. They are not always structured
linearly. Forcing every email and blog post into a rigid
Problem → Product → Result format will cause pattern fatigue and make
the brand sound like a perpetual sales funnel — especially dangerous
for a brand built on trust (Level 2).

#### Content Modes

##### Mode A — Sales (Direct Structure)

**Structure:** Problem → Agitate → Product → Result → CTA

**Used for:** Landing pages, campaign emails, ads, product launches.

This is the homepage model. Problem is explicit, product is named,
result is stated, CTA is direct. The classic PAS (Problem → Agitate →
Solution) framework. Use the full Problem → Product → Result arc
without disguising it.

##### Mode B — Narrative (Indirect Structure)

**Structure:** Story/Hook → Problem (implicit) → Insight → Result → CTA (optional)

**Used for:** Email newsletters, community posts, Discord announcements.

The problem is woven into narrative rather than stated as a headline.
The product appears as context, not a pitch. The result is felt, not
declared.

**Example (Legendary Arena newsletter style):**

> You ever feel like your skill doesn't matter?
>
> You build the perfect deck... and then lose to someone who just
> bought better cards. That's not competition — that's math.
>
> We built Legendary Arena to fix that. Every match is verifiable.
> Every outcome is fair.
>
> If you win here, it's because you earned it.

Same three elements — but reads as a conversation, not a pitch.

**Newsletter structure:**

1. Hook (problem OR insight OR story)
2. Expand (make it relatable)
3. Show (solution or perspective)
4. Result (what changes or why it matters)
5. CTA (optional — newsletters earn trust, not always clicks)

##### Mode C — Authority (Expanded Structure)

**Structure:** Problem → Deep Analysis → System/Solution → Result → Expansion

**Used for:** Blog posts, guides, documentation, long-form content.

Blogs need depth, not just persuasion. The problem is explored — why
it exists, why it persists, what others get wrong. The solution is
explained with evidence. The result includes examples and applications.

**Blog structure:**

1. Problem (clear + specific)
2. Deep analysis (why it exists, why it matters)
3. Solution (the system or concept)
4. Result (what changes)
5. Expansion (examples, applications, implications)

A blog is not "here's the answer" — it's "here's why this answer is
correct."

#### Content Type Reference

| Content Type | Primary Job | Mode | Problem Visibility |
|-------------|-------------|------|-------------------|
| Homepage | Conversion | A (Sales) | Explicit |
| Landing page | Conversion | A (Sales) | Explicit |
| Campaign email | Conversion | A (Sales) | Explicit |
| Newsletter | Relationship / engagement | B (Narrative) | Implicit / story |
| Community post | Engagement | B (Narrative) | Implicit / story |
| Blog post | Education / SEO / authority | C (Authority) | Explicit + analyzed |
| Guide / docs | Authority | C (Authority) | Explicit + analyzed |
| Announcement | Information | B (Narrative) | Light or absent |

#### Repetition Risk

If every email follows the same visible Problem → Product → Result
arc, readers will pattern-match and disengage. The antidote is Mode B:
the elements are present but the surface structure varies. Some emails
lead with a story. Some lead with an insight. Some lead with a
question. The underlying logic is the same; the presentation rotates.

#### Strategic Alignment

Because Legendary Arena is built on trust, fairness, and skill
validation — and because the product is fundamentally
**counter-positioning** against pay-to-win — all content should lean
into **problem-first storytelling, not product-first messaging.** The
power comes from exposing the villain. The product is the resolution,
not the headline.

This applies across all three modes:

- **Sales:** Lead with the villain. The product resolves it.
- **Narrative:** Lead with the feeling the villain creates. The product
  is the relief.
- **Authority:** Lead with the systemic problem. The product is the
  proof that a better way exists.

---

### 25 Problems: Problem → Product → Result

| # | Problem (What's wrong?) | Product (How LA fixes it) | Result (What changes?) |
|---|------------------------|--------------------------|----------------------|
| 1 | Pay-to-win systems make skill irrelevant | No purchasable power — absolute fairness (NG-1, NG-3) | Winning means you outplayed everyone, not outspent them |
| 2 | Grind walls and time-gates replace gameplay | No timers, no energy systems, no artificial friction (NG-4) | Every session is real gameplay, not a treadmill |
| 3 | Balance patches destroy your learned strategy | Deterministic, stable ruleset with explicit change governance (§14) | The deck you master today still works tomorrow |
| 4 | Hidden modifiers and opaque mechanics erode trust | No hidden modifiers, verifiably fair RNG, replay verification (§3) | You can prove every outcome is legitimate |
| 5 | Leaderboards and ranks can be gamed | Replay-verified, immutable rankings with cryptographic hashes (§24) | Your rank means something — no one can cheat their way up |
| 6 | Competition rewards repetition over mastery | PAR-based scoring rewards quality, not volume (§25) | Fewer, better sessions beat grinding |
| 7 | Skill is hard to measure objectively | PAR-based scenario scoring with full transparency (§20-24) | You know exactly how good you are — and can prove it |
| 8 | No meaningful post-game insight | Replay logs with step-by-step playback and JSON export (§18-19) | You can review, learn from, and share every game |
| 9 | Performance perception doesn't match reality | PAR benchmarks + AI-generated baselines per scenario (§22) | Objective feedback replaces guesswork |
| 10 | Game results can't be independently verified | Deterministic replay engine — re-execute any game from seed (§3, §18) | Disputes are settled by proof, not trust |
| 11 | Digital adaptations alter the original game | Exact rules and content authenticity — every edge case matches (§1-2) | It plays like the real game because it is the real game |
| 12 | Digital cards don't match physical counterparts | Same images, names, text, and semantics as physical cards (§2) | The cards you know are the cards you play |
| 13 | The system makes decisions players should make | Engine enforces rules but never replaces player judgment (§3-4) | Every decision point from the tabletop exists here |
| 14 | Multiplayer cooperation doesn't match tabletop | Turn order, cooperation, and shared responsibility preserved exactly (§4) | Playing with friends feels like the table |
| 15 | Multiplayer sessions are fragile and unreliable | Reliable sync, reconnection, and late-joining support (§4) | A dropped connection doesn't mean a lost game |
| 16 | New expansions break existing content | Content-as-data architecture — JSON registry, no engine rewrites (§5, §10) | New content adds to the game, never breaks it |
| 17 | Game history is lost after you finish | Every game saved as replayable, shareable log (§18) | Great moments are preserved — reviewable and shareable |
| 18 | Spectating is a second-class experience | Same replay engine for live spectation and post-game viewing (§18) | Watching is as faithful as playing |
| 19 | Accessibility is an afterthought | Full keyboard nav, screen-reader support, color-blind indicators (§17) | Every player can play |
| 20 | Player identity controlled by third parties | Identity keyed by stable internal account IDs, auth-provider-independent (§3, §7a) | You own your history — no platform can take it |
| 21 | Older sets are out of print — can't access the full game | Every card and expansion available digitally, content-as-data (§5, §10) | The full game is always accessible to every player |
| 22 | The game takes over your space — shelves of boxes | Entire game lives in your browser, zero physical footprint | Every expansion, every card, zero shelf space |
| 23 | Taking the game anywhere is a chore | Play instantly in any browser, any device, no setup | Spontaneous play is the default |
| 24 | No way to prove what happened in a physical game | Automatic recording, replay-verified, deterministic results (§3, §18, §24) | No manual tracking, no trust required |
| 25 | Everything you learn disappears when the game ends | Replay analysis, JSON export, PAR benchmarks, public leaderboard (§18-19, §22, WP-149) | Shared knowledge layer — review, compare, learn |

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
  PAR in problems #5, #6, #7, #9, and #25.
- **[Brevo Email Pipeline](brevo-email-pipeline.md)** — The content
  framework's Mode B (Narrative) applies directly to Brevo nurture
  sequences. The newsletter example in the content framework is
  written for the Brevo pipeline.

## Edge Cases

- **Pyramid is descriptive, not prescriptive.** The pyramid describes
  player psychology and messaging priority. It does not govern engine
  architecture or feature prioritization — those are driven by work
  packets and the Vision document.
- **Problem catalog is customer-facing language.** The 25 problems
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
