# Legendary Arena — Game Board Layout (Draft Wireframe)

> **Status:** DRAFT (2026-05-03). Exploratory wireframe used to align
> on visual layout concepts **before** a board-layout WP is drafted.
> This document is **non-normative**, **non-contractual**, and **not
> referenced by any WP, EC, or DECISIONS.md entry**.
>
> It exists solely as a discussion artifact to reduce re-derivation
> cost and decision churn during the eventual board-layout WP.
>
> **Authority:** SUBORDINATE to `docs/ai/ARCHITECTURE.md`,
> `docs/01-VISION.md`, the WP-028 UIState contract at
> `packages/game-engine/src/ui/uiState.types.ts`, the WP-089
> `LegendaryGame.playerView` projection wiring, and the WP-100
> interactive gameplay surface scaffolds at
> `apps/arena-client/src/components/play/`.
>
> **Reader contract.** This document fixes *visual intent only*. If
> you find yourself asking "does this force the engine/UI to do X?"
> the answer is almost certainly "no — that belongs in the WP." Every
> claim about UIState field names is **illustrative until verified
> against the WP-028 contract**; §4 marks verification status per row
> (`Bound` / `Illustrative` / `Pending`).

---

## §1 — Goals & Non-Goals

**Goals.**
- Lock the eight visual zones of the shared board (City, HQ,
  Mastermind, Scheme, decks/piles, opponent panels, own hand+economy,
  game log) and their relative positions.
- Map every visual region to one or more `UIState` fields so a future
  WP can implement the layout against the existing engine projection
  surface without inventing new contracts.
- Show how the layout adapts at narrower viewports (mobile / tablet)
  and in two non-active-player modes (spectator, opponent's turn).
- Surface the open layout questions that should be locked at
  board-layout-WP draft time.

All goals in this section are **descriptive, not prescriptive**: they
illustrate intended layout relationships and UIState usage without
locking component boundaries, interaction mechanics, or rendering
policy. The future board-layout WP retains full authority over the
implementation contract.

**Non-Goals.**
- Not a CSS / Vue component design — no class names, no Pinia stores,
  no event handlers.
- Not a visual style guide — colors, typography, iconography, and
  art direction are out of scope.
- Not a prescription for the WP-100 click-to-play scaffolds — those
  exist already at `apps/arena-client/src/components/play/` and use
  a stage-only-gated minimal layout that this wireframe will eventually
  supersede.
- Not a spectator-mode design — only sketched at low resolution as
  one of the variation modes.
- Not a replay scrubber design — the WP-064 replay inspector
  (`<ReplayInspector />`) already owns that surface.

---

## §2 — Layout Principles

Five principles, in tension-resolution order:

1. **Active player's own hand is bottom-prominent.** Mirrors the
   physical-table experience where you hold your cards in front of
   you. Hand cards are large, fully-readable, and click-to-play.

2. **Shared board occupies the visual center.** City row, HQ row,
   Mastermind, and Scheme are the most attention-demanding zones —
   villains advance, heroes appear, masterminds threaten, schemes
   tick. These compete for center mass.

3. **Opponents are top-edge mini panels.** Mirrors "across the table."
   Each opponent shows only their public state (hand count, deck
   count, discard count, in-play count, victory count, wound count,
   active-player indicator) — never their hand contents (the
   WP-089 `LegendaryGame.playerView` projection redacts
   `handCards` / `handDisplay` per audience).

4. **Pile counts and global progress live near the edges.** Hero
   deck count, KO pile, wounds, bystanders, officers, sidekicks,
   twist track, escaped-villain count — all readable but
   non-interactive in the dominant case (with one click-through to
   browse).

5. **The HUD bar is visually constrained to one row at the top edge.**
   Phase, turn number, active player, and global progress indicators
   (twists, mastermind tactics defeated, escaped villains) must be
   readable at a glance without competing for board space.

**Gameplay semantics note.** Scoring (`UIGameOverState.par`) only
appears at game end per WP-067 D-6701 safe-skip semantics — never
mid-match. This is a gameplay rule, not a layout constraint, and is
documented here only to anchor the §3 wireframe's HUD-bar contents.

**Tension resolution.** When principles conflict (e.g., a 5-handed
match crowds the opponent panels against the shared board), the
shared board wins. Opponent panels collapse to single-line
summaries before the shared board compresses.

---

## §3 — Primary Wireframes

Two viewports rendered at draft fidelity, both showing the same
`UIState` — only the spatial arrangement differs:

- **§3.1 — Desktop Landscape Wireframe** (1280×800 to 1920×1080).
  Computer monitors. Shared board occupies the visual center;
  opponents at top edge; active player's hand at bottom edge.
- **§3.2 — Mobile Portrait Wireframe** (375×667 to 414×896).
  Mobile phones. Vertical stacking; sticky top HUD; sticky
  bottom turn-actions panel; intermediate zones scroll vertically;
  wide rows (city, HQ, hand) scroll horizontally within their
  zone.

Both wireframes are non-normative drafts; a future board-layout WP
supersedes both. Three-handed cooperative match (P1 = "you", P2 +
P3 = teammates) used as the reference example throughout.

### §3.1 — Desktop Landscape Wireframe (1280×800 to 1920×1080)

Active player on their turn. Three-handed cooperative match.

**Reading note.** This ASCII wireframe is **proportionally
illustrative, not pixel-accurate**. Box widths convey relative
prominence only; exact sizing, padding, responsiveness, and any
animation/transition behavior are deliberately unspecified at this
stage. Field names cited inside the wireframe are illustrative
until §4 marks them `Bound`.

```
+============================================================================+
|  TOP HUD BAR                                                                |
|  [Phase: play]   [Turn 4]   [Active: You]   [Twists: 2/8]   [Strikes: 0/3] |
|  [🎨 Skin: Classic ▼]                            [⚙ Settings]   [? Help]   |
+============================================================================+
|                                                                             |
|   OPPONENT PANELS  (top edge — mini cards, public state only)               |
|                                                                             |
|     +--------------------+      +--------------------+                      |
|     |  P2 — Bob          |      |  P3 — Cara         |                      |
|     |  ◯ idle            |      |  ◯ idle            |                      |
|     |  Hand:    5        |      |  Hand:    6        |                      |
|     |  Deck:   14        |      |  Deck:   11        |                      |
|     |  Discard: 8        |      |  Discard: 12       |                      |
|     |  In-play: 0        |      |  In-play: 2        |                      |
|     |  Victory: 4 ▼      |      |  Victory: 3 ▼      |                      |
|     |     (12 VP)        |      |     (7 VP)         |                      |
|     +--------------------+      +--------------------+                      |
|                                                                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|   MASTERMIND ZONE                              SCHEME ZONE                  |
|                                                                             |
|   +-------------------+ +------+ +------+    +-------------------+ +------+ |
|   | Mastermind        | | Tac- | |Master|    | Current Scheme    | |Scheme| |
|   |  Loki             | | tics | |Strike|    |  Capture Five     | | Twist| |
|   |                   | | Deck | | Pile |    |  Bystanders       | | Pile | |
|   |                   | |      | |      |    |                   | |      | |
|   |  HP: 3/5          | | [4]  | | [2]  |    |  Twists: 2/8      | | [2]  | |
|   |                   | |face- | |face- |    |                   | |      | |
|   |  Captured:        | | down | |  up  |    |  Setup hooks:     | |face- | |
|   |   • Bystander A   | |      | |      |    |   • +1 city slot  | |  up  | |
|   +-------------------+ +------+ +------+    +-------------------+ +------+ |
|     ▲ tile + tactics    ▲ destination          ▲ tile + twist     ▲ dest.   |
|       (face-down)         pile (face-up;         progress bar       pile    |
|                           strikes accumulate     (count derived     (face-up |
|                           after resolving)       from twist pile)   resolved |
|                                                                     twists) |
|                                                                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|   <-- ESCAPED VILLAINS  (escape edge)        VILLAIN-DECK ENTRY (source) -->|
|                                                                             |
|     +-------+ +-------+ +-------+ +-------+ +-------+ +-------+ +-------+   |
|     |Escaped| | Bridge| |Streets| |Rooft- | | Bank  | |Sewers | |Villain|   |
|     | Pile  | |       | |       | |ops    | |       | |       | | Deck  |   |
|     |       | |  --   | |Henchm.| |Villain| |  --   | |  --   | |       |   |
|     |  [3]  | |       | |Group A| | Doom  | |       | |       | | [14]  |   |
|     |       | |       | | $3 atk| | $5 atk| |       | |       | |       |   |
|     |       | |       | |       | |       | |       | |       | |▼ next |   |
|     +-------+ +-------+ +-------+ +-------+ +-------+ +-------+ +-------+   |
|     ▲ where  ▲ escape       ▲ click to fight                   ▲ face-down  |
|       villains  edge                                            (next       |
|       end up                                                     reveal)    |
|                                                                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|   HQ ROW  (recruitable heroes — click to recruit; deck refills empty slots) |
|                                                                             |
|     +--------+ +--------+ +--------+ +--------+ +--------+ +---------+      |
|     | Wolver-| | Iron   | | Storm  | | Hawkeye| | Spider-| |  Hero   |      |
|     | ine    | | Man    | |        | |        | | man    | |  Deck   |      |
|     |        | |        | |        | |        | |        | |         |      |
|     | $4 rec | | $3 rec | | $5 rec | | $2 rec | | $6 rec | |  [42]   |      |
|     +--------+ +--------+ +--------+ +--------+ +--------+ +---------+      |
|     ▲ click to recruit                                     ▲ refills HQ     |
|                                                              on recruit     |
|                                                                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|   SHARED DECKS  (face-down stacks; drawn from on game effects; counts only) |
|                                                                             |
|     +---------+ +---------+ +---------+ +---------+ +---------+             |
|     | Wounds  | | Horrors | |Bystander| |S.H.I.E. | |Sidekicks|             |
|     |  Deck   | |  Deck   | |  Deck   | | L.D.    | |  Deck   |             |
|     |         | |         | |         | |Officers | |         |             |
|     |  [24]   | |  [10]   | |  [12]   | |  [22]   | |  [13]   |             |
|     | drawn   | | drawn   | | attach  | | recruit | | drawn   |             |
|     | on      | | via     | | to      | | for $3  | | via card|             |
|     | damage  | | effect  | | villains| | (HQ-adj)| | effect  |             |
|     +---------+ +---------+ +---------+ +---------+ +---------+             |
|     ▲ all five are face-down — top card never visible to any audience       |
|                                                                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|   SHARED KO PILE  (face-up; cards KO'd by any player or card effect)        |
|                                                                             |
|     +---------+   [6 cards total — click to view all ▼]                     |
|     |  Iron   |                                                             |
|     |  Man    |   Recent KOs:                                               |
|     |  Tech   |     T4 — Henchman A KO'd by Wolverine effect                |
|     |  $4     |     T3 — S.H.I.E.L.D. Trooper KO'd by player choice         |
|     |  (top)  |     T2 — Wound KO'd by Cyclops's effect                     |
|     +---------+                                                             |
|                                                                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|   YOUR HAND  (P1 — Alice)                                                   |
|                                                                             |
|     +------+ +------+ +------+ +------+ +------+ +------+                   |
|     | SHD  | | SHD  | | T-T  | | IM   | | SHD  | | $2   |                   |
|     | Off  | | Off  | | Tech | | Tech | | Off  | | rec  |                   |
|     | $1   | | $1   | | $3*  | | $4   | | $1   | |      |                   |
|     +------+ +------+ +------+ +------+ +------+ +------+                   |
|                                                                             |
|   IN PLAY THIS TURN                                                         |
|     +------+ +------+                                                       |
|     | Wol  | | T-T  |                                                       |
|     | Mut  | | Tech |                                                       |
|     +------+ +------+                                                       |
|                                                                             |
|   ECONOMY  Attack: 3   Recruit: 2   Pierce: 0   Wounds drawn this turn: 0   |
|                                                                             |
|   YOUR DECK [18 — face-down]    YOUR DISCARD [6 — face-up; top: SHD Off] ▼  |
|     (top card NEVER visible      (top card always visible to all audiences; |
|      to any audience —            click ▼ to browse the full pile in order  |
|      shuffle integrity            of most-recent-played first)              |
|      preserved)                                                             |
|                                                                             |
|   YOUR VICTORY PILE  [4 cards — 11 VP]                       [view all ▼]   |
|                                                                             |
|     +---------+   Composition counters (drive card-effect readouts):        |
|     | Hench-  |     Bystanders rescued:   1                                 |
|     | man A   |     Villains defeated:    2                                 |
|     | (top)   |     Henchmen defeated:    1                                 |
|     | $0      |     Mastermind cards:     0                                 |
|     +---------+     Wounds in pile:       0                                 |
|                     ─────────────────────────                               |
|                     Scenario-specific (only shown when current scenario     |
|                     contains card effects that read these counters):        |
|                       S.H.I.E.L.D. Level: 0   ← shield + hydra count        |
|                       HYDRA Level:        0                                 |
|                                                                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|   TURN ACTIONS  —  A Player Turn  (full rules in §5.1)                      |
|                                                                             |
|   Match start: random first player.  Turn order: clockwise rotation.        |
|   On your turn, perform 3 steps in order:                                   |
|                                                                             |
|     Step 1 — Reveal villain  (play.start stage)                             |
|       Play the top card of the Villain/Adversary Deck.                      |
|       [ ▶ Reveal top of Villain Deck ]   villain enters Sewers; ambushes,   |
|                                           schemes, master strikes resolve   |
|                                                                             |
|     Step 2 — Play / Recruit / Fight  (play.main stage)                      |
|       Play cards from your hand, using them to recruit and fight.           |
|         • Tap a card in hand          → play card                           |
|         • Tap a city villain          → fight (consumes Attack)             |
|         • Tap an HQ hero              → recruit (consumes Recruit)          |
|         • Tap the mastermind tile     → fight (consumes Attack)             |
|       [ Pass priority ]   when no further actions are legal/desired         |
|                                                                             |
|     Step 3 — End turn  (play.cleanup stage)                                 |
|       Discard your hand and draw 6 new cards.                               |
|       [ ✓ End turn — discard hand and draw 6 ]                              |
|                                                                             |
|   Other:                                                                    |
|     [ Concede ]   ◯ Pre-plan (active during opponents' turns; WP-059 defer) |
|                                                                             |
+============================================================================+
|                                                                             |
|   GAME LOG  (collapsible, bottom-right; replay inspector in spectator mode) |
|     ▾ Recent moves                                                          |
|                                                                             |
+============================================================================+
```

**Notes on the wireframe.**
- The five-slot city is locked for MVP per WP-015 / WP-026. The
  visual column order is locked per reviewer feedback 2026-05-03:
  **Bridge | Streets | Rooftops | Bank | Sewers | Villain Deck**
  (left to right). The escape edge sits on the **left** (Bridge);
  the entry edge sits on the **right** (Sewers), with the villain
  deck immediately to its right as column 6. Visual flow: villains
  enter from the deck → into Sewers → advance leftward through Bank
  → Rooftops → Streets → Bridge → escape off the left edge. The
  engine indexes the city `0..4` and doesn't know which side is
  "escape" — the engine-index-to-slot-name mapping is a future
  board-layout-WP lock; the wireframe only fixes the visual order.
- The HQ row also shows 5 active slots + the **Hero Deck** as
  column 6 on the right edge — parallel to the City row + Villain
  Deck pattern. The hero deck refills empty HQ slots as heroes are
  recruited (per WP-015). Both decks are face-down and non-interactive
  in the dominant case; tooltips show count and (for hero deck only)
  the total deck size remaining.
- Two **destination piles** sit beside the Mastermind and Scheme
  zones (face-up; cards land here after resolving). The
  **Master Strike Pile** (right of Tactics deck) accumulates
  Master Strike cards as they're revealed and resolved from the
  villain deck — the count drives strike-related card effects
  (e.g., "for each Master Strike in the strike pile, +1 attack")
  and is the source for the Mastermind tile's strike progress
  readout. The **Scheme Twist Pile** (right of the Scheme tile)
  accumulates Scheme Twist cards as they're resolved — the count
  drives the in-tile twist progress bar (e.g., `Twists: 2/8`)
  and is the source for any card effect that reads the twist
  pile contents.
- The **Escaped Pile** (city row column 1, far left of Bridge)
  is the destination for villains pushed off the Bridge edge.
  When a villain is pushed past the Bridge, it physically moves
  to the Escaped Pile (face-up; inspectable via click). Per WP-067
  the count is also surfaced in the top HUD bar via
  `progress.escapedVillains`. Some Scheme effects reference this
  pile as a win condition (e.g., "if 5 villains escape, the
  Mastermind wins").
- The **Horrors Deck** is the 5th cell of the Shared Decks zone
  (face-down stack of Horror cards used by Marvel Studios sets and
  the Big Trouble in Little China set). Functions like the Wounds
  Deck — players draw Horrors from this stack on triggering card
  effects, and Horrors clutter their decks/hands until KO'd. The
  Horrors Deck only renders when `horrorsCount > 0` in
  `MatchSetupConfig` (set-dependent — most sets don't use Horrors;
  the cell renders as a 0-count placeholder when not in scope per
  future board-layout WP).
- The TURN ACTIONS panel no longer shows the WP-100 D-10003
  `[ Draw 6 ]` scaffold button — Step 3 (End turn) handles
  discard + draw atomically per WP-008B (the engine moves your
  in-play and hand to the discard pile, then draws 6 from your
  deck per WP-006B; if your deck has < 6 cards, the discard
  reshuffles into the deck and drawing resumes). The future
  engine WP that adds `turn.onBegin` auto-draw to a `HAND_SIZE`
  constant will fold Step 3's redraw into the next player's
  Step 1 transition; until then, Step 3 is the explicit trigger.
- `Pre-plan: not yet active` — the WP-059 pre-plan UI integration
  is drafted but not yet shipped; the affordance is shown as a
  reservation, not a promise.

---

### §3.2 — Mobile Portrait Wireframe (375×667 to 414×896)

Same `UIState` as §3.1, vertically stacked for portrait phones.
Wireframe target width: 48 chars (representative of a typical
phone code-block render at standard monospace font; physical
pixel width ~336–384 px). Three sticky zones: top HUD, opponent
panels (collapsible), bottom turn-actions. The middle scrolls
vertically; wide rows (city, HQ, hand) scroll **horizontally
within their zone**.

**Reading note.** This ASCII wireframe is **proportionally
illustrative, not pixel-accurate**. Box widths and sticky-zone
behavior convey relative prominence and scroll mechanics only;
exact sizing, padding, responsive breakpoints, animation/transition
behavior, gesture handling, and pinch-to-zoom mechanics are
deliberately unspecified at this stage. Field names cited inside
the wireframe are illustrative until §4 marks them `Bound`.

```
+----------------------------------------------+
|  STICKY TOP HUD                              |
|  ARENA  Phase: play   T4   ◉ You (P1)        |
|  Twists 2/8   Strikes 0/3   Escaped 3        |
|  🎨 Classic ▼              ⚙ menu   ? help   |
+----------------------------------------------+
|  MASTERMIND                  [Strike Pile]   |
|   Loki      HP: 3/5            [2] face-up   |
|   Tactics:  [4] face-down                    |
|   Captured: Bystander A                      |
+----------------------------------------------+
|  SCHEME                      [Twist Pile]    |
|   Capture Five Bystanders      [2] face-up   |
|   Twists: 2/8                                |
|   Hooks: +1 city slot @ T0                   |
+----------------------------------------------+
|  CITY  (◀ swipe horizontally ▶)              |
|                                              |
|  +---+ +---+ +---+ +---+ +---+ +---+ +----+  |
|  |Esc| |Brg| |Str| |Rfp| |Bnk| |Swr| |VlnD|  |
|  |[3]| | - | |HnA| |VlD| | - | | - | |[14]|  |
|  +---+ +---+ +---+ +---+ +---+ +---+ +----+  |
|   ▲ escape pile                  ▲ deck      |
+----------------------------------------------+
|  HQ  (◀ swipe ▶)                             |
|                                              |
|  +---+ +---+ +---+ +---+ +---+ +----+        |
|  |Wol| |IM | |Sto| |Hwk| |Spd| |HrDk|        |
|  |$4 | |$3 | |$5 | |$2 | |$6 | |[42]|        |
|  +---+ +---+ +---+ +---+ +---+ +----+        |
|                                ▲ refills HQ  |
+----------------------------------------------+
|  SHARED DECKS  (face-down stacks)            |
|   Wounds Deck:               [24]            |
|   Horrors Deck:              [10]            |
|   Bystanders Deck:           [12]            |
|   S.H.I.E.L.D. Officers:     [22]            |
|   Sidekicks Deck:            [13]            |
+----------------------------------------------+
|  KO PILE  (shared; face-up)                  |
|   Top: Iron Man Tech ($4)        [6 ▼]       |
+----------------------------------------------+
|  OPPONENTS  [▼ tap row to expand panel]      |
|   P2 Bob:  5h • 14d • 8x • 4v (12 VP) ▼      |
|   P3 Cara: 6h • 11d • 12x • 3v (7 VP) ▼      |
|     (h=hand • d=deck • x=discard • v=vp)     |
+----------------------------------------------+
|  IN PLAY THIS TURN                           |
|   +---+ +---+                                |
|   |Wol| |T-T|                                |
|   +---+ +---+                                |
+----------------------------------------------+
|  ECONOMY                                     |
|   Atk 3   Rec 2   Pierce 0   Wnds 0          |
+----------------------------------------------+
|  YOUR DECK    [18 — face-down]               |
|     (top card NEVER visible to any audience) |
|                                              |
|  YOUR DISCARD [ 6 — face-up]   ▼             |
|   Top: S.H.I.E.L.D. Officer ($1)             |
|     (tap ▼ to browse full pile in order of   |
|      most-recent-played first)               |
+----------------------------------------------+
|  YOUR VICTORY PILE [4 cards — 11 VP]  ▼      |
|                                              |
|   Composition counters:                      |
|     Bystanders rescued:   1                  |
|     Villains defeated:    2                  |
|     Henchmen defeated:    1                  |
|     Mastermind cards:     0                  |
|     Wounds in pile:       0                  |
|   ─────────────────────────────              |
|   Scenario-specific (when applicable):       |
|     S.H.I.E.L.D. Level: 0                    |
|     HYDRA Level:        0                    |
+----------------------------------------------+
|  YOUR HAND (P1 — Alice)                      |
|  (◀ swipe to see all 6 cards ▶)              |
|                                              |
|  +---+ +---+ +---+ +---+ +---+ +---+         |
|  |SHD| |SHD| |T-T| |IM | |SHD| |$2 |         |
|  |$1 | |$1 | |$3*| |$4 | |$1 | |rec|         |
|  +---+ +---+ +---+ +---+ +---+ +---+         |
+----------------------------------------------+
|  STICKY BOTTOM TURN ACTIONS                  |
|                                              |
|  A Player Turn (full rules in §5.1)          |
|   Match start: random first player.          |
|   Turn order: clockwise rotation.            |
|                                              |
|  Step 1 — Reveal villain (play.start):       |
|    [ ▶ Reveal top of Villain Deck ]          |
|                                              |
|  Step 2 — Play / Recruit / Fight (play.main):|
|    Tap a card in hand     → play             |
|    Tap a city villain     → fight            |
|    Tap an HQ hero         → recruit          |
|    Tap the mastermind     → fight            |
|    [ Pass priority ]                         |
|                                              |
|  Step 3 — End turn (play.cleanup):           |
|    [ ✓ End turn — discard hand and draw 6 ]  |
|                                              |
|  Other:                                      |
|    [Concede]   ◯ Pre-plan: inactive          |
+----------------------------------------------+
|  ▲ Game log (collapsed; tap to expand)       |
+----------------------------------------------+
```

**Notes on the portrait wireframe.**
- Three sticky zones: **top HUD bar**, **bottom turn-actions
  panel**, and the **game log chevron** at the very bottom edge.
  Everything between scrolls vertically.
- Wide rows scroll **horizontally within their zone**: City row
  (7 cells: Escaped + 5 city slots + Villain Deck) often won't
  fit in a 375-px viewport at readable cell width and so the
  user swipes horizontally; HQ row (6 cells) and Your Hand
  (variable, often 6+ cards) scroll the same way. Pinch-to-zoom
  inside a zone is a future board-layout-WP question (§7.2).
- The **OPPONENTS** zone is collapsible — by default it shows
  one-line summaries (`P2 Bob: 5h • 14d • 8x • 4v (12 VP)`) with
  a `▼` to expand each opponent into a full panel matching the
  desktop layout's opponent-panel detail. Tap-to-expand is the
  only way to inspect an opponent's full state on portrait.
- The **STICKY BOTTOM TURN ACTIONS** panel is always visible;
  tapping the active step's button fires the corresponding move
  per WP-100 + WP-008B. The panel's height adapts to the active
  stage — only the active stage's buttons are full-prominence;
  the inactive steps render as collapsed disabled rows.
- **`◀ swipe ▶`** indicators tell the user a zone scrolls
  horizontally. The actual scroll mechanic is the future
  board-layout-WP's responsibility — overflow-x:auto, snap-points,
  pagination, etc., are all viable.

---

## §4 — Region-by-Region Mapping to UIState

Every visual region reads from `UIState`, never from `LegendaryGameState`
directly. The future board-layout WP MUST honor this boundary —
clients consume audience-filtered `UIState` from the WP-089
`LegendaryGame.playerView` projection, never raw `G`. Both wireframes
(§3.1 desktop landscape and §3.2 mobile portrait) read from the same
`UIState` — only the spatial arrangement differs.

**Audit basis.** This table is verified against the WP-028 contract
at `packages/game-engine/src/ui/uiState.types.ts` (audited
2026-05-03 against the post-WP-111 shape). The WP-089
`LegendaryGame.playerView` projection wires this UIState through
`buildUIState` + `filterUIStateForAudience`; the only audience-
filtered fields are `players[i].handCards` and
`players[i].handDisplay` (redacted unless `i === ownIndex`).

**Mapping legend.**
- **`Bound`** — field shape and semantics are already locked by a
  cited WP and verified against the live `uiState.types.ts`.
- **`Illustrative`** — field usage shown for clarity; exact wiring
  may be finalized in the board-layout WP. The general shape is
  bound but the exact composition or derivation is the WP's call.
- **`Pending`** — UIState field name or presence must be confirmed
  or **added** by the board-layout WP. The wireframe references this
  data, but no UIState surface exists today.

The future board-layout WP MUST resolve every `Pending` row before
locking — either by extending `UIState` (and updating
`uiState.types.drift.test.ts`) or by deriving the data at projection
time inside `buildUIState`.

| Visual Region | UIState Field(s) | Status | Read Posture | Source WP |
|---|---|---|---|---|
| Phase indicator | `game.phase` | `Bound` | enum mapping | WP-007A |
| Turn number | `game.turn` | `Bound` | numeric readout | WP-007A |
| Active-player banner | `game.activePlayerId` | `Bound` | string match against own `playerId` | WP-007A + WP-028 |
| Current stage indicator | `game.currentStage` | `Bound` | enum (`'start' / 'main' / 'cleanup'`); drives turn-action gating | WP-007A |
| Twist progress (HUD + Scheme tile) | `scheme.twistCount` (count only); the **threshold** is a scenario constant from the registry, NOT in UIState today | `Illustrative` | progress bar; the threshold side must be sourced from scenario metadata or projected by the board-layout WP | WP-026 |
| Mastermind tactics progress (HUD + tile) | `mastermind.tacticsRemaining` + `mastermind.tacticsDefeated` | `Bound` | progress bar (Legendary's "tactics defeated" IS the strike progress — when all tactics are defeated, the mastermind is defeated) | WP-019 |
| Top HUD escape counter | `progress.escapedVillains` | `Bound` | numeric readout | WP-067 |
| Re-skin / playmat selector (`🎨 Skin: <name> ▼`) | NOT IN `UIState` — pure client-local preference (Pinia store + `localStorage` per WP-068 / WP-121 / WP-124 precedent) | N/A (UI-only) | client-local preferences store; opens a modal/sheet listing available skins; selection persists across sessions; never affects engine state or replay determinism | future board-layout WP + WP-068 prefs precedent |
| Settings / Help buttons (`⚙` / `?`) | NOT IN `UIState` — client-local | N/A (UI-only) | open menus / overlays | future board-layout WP |
| Opponent panel | `players[i]` (where `i !== ownIndex`) — `handCount` / `deckCount` / `discardCount` / `inPlayCount` / `victoryCount` / `woundCount` | `Bound` | counts only; `handCards` / `handDisplay` redacted by `filterUIStateForAudience` per WP-029 + WP-089. **Note:** the KO pile is **shared** (a single global pile), not per-player — never appears in opponent panels. The wireframe's `Victory: N ▼` drill-down requires either: (a) extending `UIPlayerState` with a victory-card array, or (b) the board-layout WP synthesizing the modal from a separate projection. | WP-028 + WP-029 + WP-089 |
| Mastermind tile (name + tactics + display) | `mastermind.id` + `mastermind.display` (`UICardDisplay` with `name`, `imageUrl`, `cost`) + `mastermind.tacticsRemaining` + `mastermind.tacticsDefeated` | `Bound` | display + counter; **HP-equivalent IS `tacticsRemaining`** (Legendary masterminds don't have HP — they have a stack of tactics; defeating the last tactic defeats the mastermind) | WP-019 + WP-111 |
| Mastermind tactics deck cell (right of tile) | `mastermind.tacticsRemaining` | `Bound` | count only (face-down) | WP-019 |
| Master Strike Pile (right of Tactics deck) | NOT IN `UIState` today | `Pending` | face-up destination pile + count + click-to-browse. **Drives strike-related card effects** (count read by abilities like "for each Master Strike in the strike pile, +1 attack"). The board-layout WP must add a UIState surface (e.g., `mastermind.strikePile[]` or `mastermind.strikePileCount`) and update `uiState.types.drift.test.ts`. | WP-019 + WP-024 + future board-layout WP |
| Mastermind captured (bystanders attached to mastermind) | NOT IN `UIState` today (captured bystanders live in `G` but aren't projected) | `Pending` | rendered inside the Mastermind tile as a list. Board-layout WP must add a projection. | WP-019 + future board-layout WP |
| Scheme tile (name + twist count) | `scheme.id` + `scheme.twistCount` | `Bound` | display + counter. The **twist threshold** is a scenario constant from the registry (NOT in UIState); the in-tile progress bar (e.g., `Twists: 2/8`) requires the board-layout WP to source the threshold from scenario metadata. | WP-026 + WP-111 |
| Scheme Twist Pile (right of Scheme tile) | NOT IN `UIState` today | `Pending` | face-up destination pile + count + click-to-browse. **Drives twist-related card effects.** Mirrors the in-tile twist counter — both must derive from the same source once projected. Board-layout WP adds (e.g., `scheme.twistPile[]`) and updates the drift test. | WP-026 + WP-024 + future board-layout WP |
| City row (5 slots, columns 2-6: **Bridge \| Streets \| Rooftops \| Bank \| Sewers** L→R) | `city.spaces[0..4]` — each space is `null` or `UICityCard` (which carries `extId` + `type` + `keywords[]` + `display`) | `Bound` | per-slot conditional render; `display` carries `name`/`imageUrl`/`cost` per WP-111. Engine-index-to-slot-name mapping is a future board-layout-WP lock; the wireframe fixes only the visual column order. | WP-015 + WP-111 |
| Escaped Villains Pile (city row, column 1 — far-left edge) | Count: `progress.escapedVillains` (`Bound`). Pile contents (the actual escaped cards): NOT IN `UIState` today | `Bound` (count) / `Pending` (contents) | counter + (future) face-up destination pile with click-to-browse. **Some Scheme effects reference this pile as a win condition** (e.g., "if 5 villains escape, Mastermind wins"); count is bound today, full pile contents need board-layout WP to extend `UIState`. | WP-015 + WP-067 + future board-layout WP |
| Villain Deck (city row, column 7 — right edge) | NOT IN `UIState` today (`G.villainDeck.deck.length` is in G but not projected) | `Pending` | count only; **next reveal NEVER pre-computed client-side** (revealing future villains breaks determinism). Board-layout WP adds (e.g., `villainDeck.count`) and updates the drift test. | WP-014A + WP-014B + future board-layout WP |
| HQ row (5 slots) | `hq.slots[0..4]` (`(string \| null)[]`) + `hq.slotDisplay?` (`(UIHQCard \| null)[]` per WP-111 PS-6 fallback) | `Bound` | per-slot conditional render; the `slotDisplay` parallel array carries `display: UICardDisplay` payloads aligned to the same indices. | WP-015 + WP-111 |
| Hero Deck cell (HQ row column 6) | NOT IN `UIState` today (`G.heroDeck.deck.length` lives in G but isn't projected) | `Pending` | count only; face-down. Board-layout WP adds (e.g., `heroDeck.count`) and updates the drift test. | WP-015 + future board-layout WP |
| Shared decks zone — Wounds Deck | NOT IN `UIState` today (`G.piles.wounds.length` lives in G but isn't projected) | `Pending` | face-down deck cell + count readout. Source pool for "gain a wound" effects. Board-layout WP adds. | WP-017 + future board-layout WP |
| Shared decks zone — Horrors Deck | NOT IN `UIState` today; also depends on whether `MatchSetupConfig.horrorsCount` field is added (Horrors mechanic is a future-set extension to the engine) | `Pending` | face-down deck cell + count readout. Board-layout WP adds; renders as a 0-count placeholder when the active scenario doesn't use Horrors. | WP-017 + future board-layout WP |
| Shared decks zone — Bystanders Deck | NOT IN `UIState` today (`G.piles.bystanders.length` lives in G but isn't projected) | `Pending` | face-down deck cell + count readout. Source pool for villain-ambush captures and "Rescue a Bystander" effects. Board-layout WP adds. | WP-017 + future board-layout WP |
| Shared decks zone — S.H.I.E.L.D. Officers | NOT IN `UIState` today | `Pending` | face-down deck cell + count readout; recruitable for $3 (HQ-adjacent affordance). Board-layout WP adds. | WP-017 + WP-016 + future board-layout WP |
| Shared decks zone — Sidekicks Deck | NOT IN `UIState` today | `Pending` | face-down deck cell + count readout; drawn from via card effects (set-dependent). Board-layout WP adds. | WP-017 + future board-layout WP |
| Shared KO Pile | NOT IN `UIState` today (`G.piles.ko` lives in G but isn't projected) | `Pending` | face-up cell rendering top card + count + click-to-browse. The KO pile is **shared** across all players (single global pile per WP-017); never per-player. Board-layout WP adds (e.g., `ko.count` + `ko.topCardId` + `ko.cards[]` for browse). | WP-017 + future board-layout WP |
| Own hand (cards + display) | `players[ownIndex].handCards?` (`string[]`) + `players[ownIndex].handDisplay?` (`UICardDisplay[]`, parallel-aligned by index per WP-111) | `Bound` | full card render; click-to-play. Both fields are present for `ownIndex`; `filterUIStateForAudience` redacts both for `i !== ownIndex` and for spectators per WP-029 + WP-089. | WP-028 + WP-029 + WP-089 + WP-100 + WP-111 |
| In-play this turn (per-card render) | `players[ownIndex].inPlayCount` is in UIState (`Bound`); the per-card array (`inPlay[]` + `inPlayDisplay[]`) is NOT in UIState today | `Bound` (count) / `Pending` (per-card render) | board-layout WP adds an in-play array if it wants to render individual cards; otherwise the wireframe's IN PLAY zone collapses to a count-only chip | WP-016 + future board-layout WP |
| Economy bar | `economy.attack` + `economy.recruit` + `economy.availableAttack` + `economy.availableRecruit` | `Bound` (4 fields) / `Pending` (`piercing` + `woundsDrawn`) | numeric readouts. **Note:** the wireframe shows `Pierce: 0` and `Wounds drawn this turn: 0` but `economy` only carries `attack` + `recruit` + their `available` siblings today; `piercing` + `woundsDrawn` are not in `UIState` and would need to be added if the board-layout WP wants to surface them. | WP-018 + future board-layout WP |
| Own deck count | `players[ownIndex].deckCount` | `Bound` | count + face-down annotation; top card NEVER projected (shuffle integrity). | WP-006A + WP-028 |
| Own discard | `players[ownIndex].discardCount` (`Bound`); top card identity + browse contents NOT in UIState today | `Bound` (count) / `Pending` (top card + browse) | board-layout WP adds a discard projection if it wants the wireframe's "top card visible" behavior; otherwise the cell renders count only. | WP-006A + future board-layout WP |
| Own wound count | `players[ownIndex].woundCount` | `Bound` | count of wound cards in the owning player's deck/hand/discard combined; per WP-028 contract | WP-017 + WP-028 |
| Per-player victory pile (own) | `players[ownIndex].victoryCount` (`Bound`); pile contents (`victory[]` array) + total VP NOT in UIState today | `Bound` (count) / `Pending` (contents + VP total + composition) | board-layout WP adds a victory-pile projection (`players[i].victoryCards[]` or similar) if it wants to render top card + composition counters + VP total. | WP-020 + future board-layout WP |
| Per-player victory-pile composition counters | NOT IN `UIState` today; would derive from `players[ownIndex].victoryCards[]` (Pending) + each card's `cardType` / `cardKeywords` per registry | `Pending` | computed live by board-layout WP; surfaced as readouts. **Always-shown counters:** Bystanders rescued, Villains defeated, Henchmen defeated, Mastermind cards, Wounds in pile. **Scenario-specific counters** (S.H.I.E.L.D. Level, HYDRA Level, etc.): only rendered when the current scenario contains card effects that read them — discovery mechanism is §7.2 #6. | WP-020 + WP-022 + WP-025 + future board-layout WP |
| Turn-action bar | `game.currentStage` (`Bound`) drives stage gating per WP-007A; click affordances per WP-100 | `Bound` (gating) / `Illustrative` (button labels + 3-step grouping) | stage-gated buttons; each step's affordances enabled only when `game.currentStage` matches. The 3-step grouping in the wireframe is a UI-layer organizing principle, not a UIState shape. | WP-007A + WP-100 |
| Game log | `log` (`string[]`) | `Bound` | append-only scroll | WP-028 + WP-064 |
| Endgame summary | `gameOver?` (when `game.phase === 'end'`) — `outcome` + `reason` + optional `scores: FinalScoreSummary` + optional `par: UIParBreakdown` | `Bound` | modal trigger; PAR breakdown via `gameOver.par` per D-6701 safe-skip (always omitted at runtime under MVP per WP-067). | WP-020 + WP-067 |

**No region reads from `G` directly.** All client rendering goes
through `buildUIState` per WP-028 + WP-089 + WP-111. The WP-089
`LegendaryGame.playerView` projection composes `buildUIState` +
`filterUIStateForAudience(uiState, audience)`; the only fields the
filter touches are `players[i].handCards` and
`players[i].handDisplay` — both are **redacted (omitted)** for
`i !== ownIndex` and for the `'spectator'` audience per WP-029. All
other fields (deck/discard/inPlay/victory/wound counts, the city,
the HQ, mastermind, scheme, economy, log, progress, gameOver) are
public information by design and pass through unchanged regardless
of audience.

**Audit summary.** Of the 30+ visual regions in this table, ~12
fields are `Bound` (verified against `uiState.types.ts` today),
~3 are `Illustrative` (the general shape is bound but exact
composition is the WP's call), and ~15 are `Pending` — meaning the
data exists in `G` but is **not yet projected through `UIState`**.
The future board-layout WP must extend `UIState` to expose every
`Pending` row (and update `uiState.types.drift.test.ts` to pin the
new field set) before the wireframe's full functionality can ship.

---

## §5 — Turn Structure & Click Affordances

### §5.1 — Turn Structure

**Match start:** choose a random player to go first. The engine's
`Game.setup()` per WP-005A picks the first player via
`ctx.random.*` (deterministic from the match seed); the locked
match seed is recorded so the same setup replays identically.

**Turn order:** clockwise rotation around the table. The engine
advances `ctx.currentPlayer` on every `endTurn` move per
boardgame.io's per-phase turn order, locked at match setup per
WP-007A; once set, the order does not change for the duration of
the match.

**On your turn, perform three steps in order:**

**Step 1 — Reveal villain** (`play.start` stage)

Play the top card of the Villain/Adversary Deck. The new villain
enters the city's entry slot (Sewers — column 6 of the city row
per §7.1's locked column order). Per WP-014A's reveal pipeline,
ambush effects, scheme twists, and master strikes resolve at this
point:

- If the revealed card is a **villain or henchman**: it enters
  Sewers; if Sewers is occupied, the resident villain advances
  (Sewers → Bank → Rooftops → Streets → Bridge); if a villain is
  pushed past Bridge, it **escapes** to the Escaped Pile (city
  row column 1) and `progress.escapedVillains` increments.
- If the revealed card is a **Master Strike**: it resolves its
  attached effect (typically each player suffers some loss);
  after resolution the card moves face-up to the **Master
  Strike Pile** (right of Tactics deck per §7.1).
- If the revealed card is a **Scheme Twist**: it resolves its
  scheme-specific effect; after resolution the card moves
  face-up to the **Scheme Twist Pile** (right of Scheme tile
  per §7.1) and `scheme.twistsResolved` increments.
- If the revealed card is a **Bystander**: it attaches face-up
  to the topmost villain in the city (typically Sewers entry);
  the villain "captures" the bystander until fought.

The active player has no choice in step 1 — the engine drives it
on the `[▶ Reveal top of Villain Deck]` button or via auto-advance
into `play.main` after resolution.

**Step 2 — Play / Recruit / Fight** (`play.main` stage)

Play cards from your hand, using them to recruit and fight. The
active player may, in any order, repeat any of the following:

- **Tap a card in hand → play it.** Resolves the card's play
  effect (per WP-022 hero keywords + WP-023 conditional effects);
  the card moves to in-play this turn; the card's stats add to
  `turnEconomy.attack` / `turnEconomy.recruit` / etc. per WP-018.
- **Tap a city villain → fight.** Consumes Attack equal to the
  villain's attack cost; on success the villain moves to the
  active player's victory pile per WP-016. If the villain has
  attached bystanders, they move with the villain.
- **Tap an HQ hero → recruit.** Consumes Recruit equal to the
  hero's cost; on success the hero moves to the active player's
  discard pile (NOT in-play — the hero will appear in a future
  draw); the HQ slot is then refilled from the Hero Deck (column
  6 of the HQ row).
- **Tap the mastermind tile → fight.** Consumes Attack equal to
  the mastermind's per-strike cost per WP-019; on success a
  Master Strike attached to the mastermind resolves (or the
  mastermind itself if all strikes are already gone). On the
  final strike the mastermind is defeated and moves to the
  active player's victory pile; the engine evaluates endgame
  per WP-010.

Step 2 ends when the active player taps `[Pass priority]` or
`[End turn]`. There is no auto-advance — the player decides when
to end step 2.

**Step 3 — End turn** (`play.cleanup` stage)

Discard your hand and draw 6 new cards. Tap
`[✓ End turn — discard hand and draw 6]`. The engine, per
WP-008B's `endTurn` move:

1. Moves all in-play cards + remaining hand cards to the active
   player's discard pile.
2. Draws 6 cards from the active player's deck into their hand.
   If the deck has fewer than 6 cards, the engine reshuffles the
   discard pile into the deck per WP-006B (using `ctx.random.*`
   for shuffle determinism), then resumes drawing.
3. Resets `turnEconomy` to zeros.
4. Advances `ctx.currentPlayer` to the next player in clockwise
   order.
5. Resets `currentStage` to `play.start` for the new active
   player; their step 1 begins.

**Stage gating** per WP-007A: each step's affordances are gated
by `G.currentStage` — only the active stage's controls are
enabled; all others render as **disabled with a tooltip**
explaining why (per WP-100's "never silently no-op" pattern).

**Cooperative game posture (Vision §3 + §4):** the active player
is the only player whose moves resolve during steps 1–3. Other
players observe + may pre-plan their next turn (per WP-059 once
shipped). There is no "across the table" PvP framing — this is
a cooperative recreation of physical Marvel Legendary.

### §5.2 — Click Affordances (Mapping to Moves)

The future board-layout WP MUST honor the WP-100 + WP-008B click-to-play
contract. Every interactive region maps to a single `UiMoveName`:

| Click Target | Move Emitted | Stage Gating | Notes |
|---|---|---|---|
| Card in own hand | `playCard` | `play.main` only | per WP-008B |
| Villain card in city slot | `fightVillain` | `play.main` only; respects `turnEconomy.attack` | per WP-016 |
| Hero in HQ slot | `recruitHero` | `play.main` only; respects `turnEconomy.recruit` | per WP-016 |
| Mastermind tile | `fightMastermind` | `play.main` only; only when own `attack >= mastermindAttackCost` | per WP-019 |
| "Draw 6" button | `drawCards` (count: 6) | `play.start` only (scaffold) | WP-100 D-10003 — removed when engine adds auto-draw |
| "End Turn" button | `endTurn` | `play.cleanup` only | per WP-008B |
| "Concede" button | (future move; not yet defined) | any stage during own turn | RESERVED |
| KO pile / discard / victory pile | (no move — opens browse modal) | any stage | view-only modal |
| Opponent panel | (no move — opens opponent-detail modal) | any stage | view-only modal; reads only public fields |
| Pre-plan affordance | (deferred — WP-059 surface) | non-active-player turns | RESERVED |

**Disabled state.** When a click target's stage gating fails, the
affordance renders disabled (greyed, non-clickable) with a tooltip
explaining why. Never silently no-op — the user must understand why
their click didn't fire. WP-100 already follows this pattern; the
board-layout WP inherits it.

**Cost gating.** Cost-affordability gating (e.g., disabling a Hero
in HQ when `turnEconomy.recruit < hero.cost`) is **deferred** —
WP-100 is stage-only-gated until a future WP adds `cost` data into
the projection. WP-111 ships `cost: number | null` on each
`UICardDisplay`, so the data IS available; the deferred decision is
*how to render the disabled state*, not whether the data exists.

---

## §6 — Variations

### §6.1 — Opponent's Turn (you are P2)

When `activePlayer !== ownSeat`, the layout is byte-identical except:
- Top HUD reads `Active: Bob (P2)`
- Your turn-action bar disables every button except "Concede"
- Pre-plan affordance becomes active (a future WP-059 surface)

The opponent panels promote one entry to the top — Alice (the
active player) — and demote your seat into the panel grid.

### §6.2 — Spectator (no own hand)

When the audience is `'spectator'` per WP-029:
- The **Your hand** + **Your in-play** + **Your deck/discard/victory**
  region collapses to a single-line summary: `Spectating — no
  player view`.
- The full game log expands into the freed bottom-half space.
- The opponent panels show all N seats (no "ownIndex" omission).
- All click affordances are disabled. The view is read-only.

### §6.3 — Endgame Summary (`phase === 'end'`)

A modal overlay fades in over the board:
- **Outcome line:** "Heroes Win" or "Mastermind Wins" or
  "Scheme Resolved" (per `gameOver.outcome`).
- **VP table:** per-player VP breakdown from
  `gameOver.victoryBreakdown[]`.
- **PAR delta** (only if `gameOver.par` is defined per D-6701
  safe-skip): raw / par / final scores + scoring config version.
- **Match summary:** turn count, twists resolved, masterminds
  defeated, total bystanders rescued, total villains escaped.
- **CTAs:** "View replay" / "Play again" / "Back to lobby."

The board behind the modal stays visible and dimmed — the user can
dismiss the modal to inspect final state.

### §6.4 — Mobile / Narrow Layout (320–768px)

**See §3.2 — Mobile Portrait Wireframe** for the full ASCII
wireframe of the portrait layout. §3.2 is now a first-class
wireframe alongside §3.1's desktop landscape, not a §6 variation.
This subsection retained as a cross-reference anchor.

### §6.5 — Tablet (768–1280px)

The desktop layout compresses:
- Opponent panels move to a left-edge column (still visible, narrower).
- Mastermind + Scheme stack vertically on the right edge.
- City + HQ stretch the full middle width.
- Own hand + in-play + economy stay bottom-prominent.

---

## §7 — Decisions Locked + Open Questions

### §7.1 — Decisions Locked by Reviewer Feedback (2026-05-03)

Two decisions resolved during the first review pass on this draft.
Future board-layout WP **inherits** these — no need to re-litigate
unless a DECISIONS.md entry overrides them explicitly.

- **City visual column order (left to right):**
  `Bridge | Streets | Rooftops | Bank | Sewers | Villain Deck`.
  Escape edge on the left (Bridge); entry edge on the right
  (Sewers); villain deck immediately to the right of Sewers as
  column 6. Visual flow: deck → Sewers → advance leftward → escape.
  The engine-index-to-slot-name mapping is still a future
  board-layout-WP lock; only the visual column order is fixed.
- **Hero Deck inline as HQ row column 6.** Parallels the Villain
  Deck pattern — both decks sit on the right edge of their
  respective rows, both are face-down + non-interactive, both
  refill their row's empty slots automatically.
- **Shared Decks zone is its own dedicated row beneath the HQ.**
  Four face-down deck cells (left to right): **Wounds | Bystanders
  | S.H.I.E.L.D. Officers | Sidekicks**. The pile-counts chip
  strip that previously sat beneath the HQ has been **removed**
  (redundant with the visual deck cells). The Sidekicks cell
  renders even when `sidekicksCount: 0` (as a 0-count placeholder
  with disabled interaction) — exact behavior is a future
  board-layout-WP lock.
- **Shared KO Pile is its own dedicated zone, face-up.** Single
  cell showing the top card face-up + count + recent-KO log scrub.
  The KO pile is **shared** (single global pile per WP-017),
  never per-player. The opponent panels do NOT show a "KO: N"
  per-player line — this was a bug in the initial draft, fixed
  in this pass.
- **Per-player victory pile is expanded in the active player's
  zone with composition counters.** Top card visible face-up; full
  pile via click-to-browse modal. Always-shown counters: Bystanders
  rescued, Villains defeated, Henchmen defeated, Mastermind cards,
  Wounds in pile. Scenario-specific counters (S.H.I.E.L.D. Level,
  HYDRA Level, etc.) only render when the current scenario contains
  card effects that read them — exact set is a future
  board-layout-WP lock (see §7.2 #6).
- **Opponent victory piles are inspectable.** Each opponent panel
  shows `Victory: N ▼` with VP total; click reveals the opponent's
  full victory pile contents. VP cards are public knowledge by
  design (they're built from face-up resolved cards), so this does
  not break the WP-029 audience-filtering boundary.
- **Master Strike Pile** sits to the right of the Tactics deck in
  the Mastermind zone. Face-up destination pile; cards land here
  after a Master Strike resolves from the villain deck. The count
  drives strike-related card effects and feeds the Mastermind
  tile's strike progress readout (the in-tile "Strike count: 0"
  line is **removed** — externalized to this pile).
- **Scheme Twist Pile** sits to the right of the Scheme tile.
  Face-up destination pile; cards land here after a Scheme Twist
  resolves. The count is the same data as the in-tile twist
  progress bar (e.g., `Twists: 2/8`) — both render from the same
  source. Some card effects reference the pile contents directly,
  not just the count.
- **Escaped Pile is city row column 1** (far-left of Bridge —
  before Bridge in left-to-right reading order). Face-up
  destination pile for villains pushed off the Bridge edge. The
  city row now has **7 columns** (Escaped Pile + 5 city slots +
  Villain Deck). Cell width tightens to 9 chars (interior 7) to
  fit the 7-cell row in the 79-char wireframe target. The count
  is also surfaced in the top HUD bar via `progress.escapedVillains`.
- **Horrors Deck is the 5th cell of the Shared Decks zone**
  (between Wounds and Bystanders). The Shared Decks zone now has
  **5 cells**: Wounds | Horrors | Bystanders | S.H.I.E.L.D.
  Officers | Sidekicks. Horrors functions like Wounds (face-down
  source pool; card effects pull Horrors into players' decks).
  Set-dependent: the cell renders as a 0-count placeholder when
  the active scenario does not use Horrors; board-layout WP locks
  the empty-deck render policy.
- **Two viewport variants are first-class wireframes**, not a
  primary + variation split: §3.1 — Desktop Landscape (1280×800
  to 1920×1080) and §3.2 — Mobile Portrait (375×667 to 414×896).
  Both render the same `UIState`; only the spatial arrangement
  differs. The future board-layout WP must implement both;
  intermediate viewports (tablet 768–1280px) collapse one or the
  other per breakpoint per §6.5.
- **Your Deck is face-down; Your Discard is face-up.** The deck's
  top card is **NEVER** visible to any audience (revealing it
  would break shuffle integrity — the engine's `ctx.random.*`
  shuffle is the only authority on draw order). The discard pile's
  top card is **always visible to all audiences** (deterministically
  computable from cards played); the full discard pile is
  browsable in click-to-expand order of most-recent-played first.
  Both wireframes annotate this distinction inline; the §4 mapping
  table reflects it as well.
- **Turn structure locked at 3 steps per §5.1.** Match start picks
  a random first player; turn order is clockwise rotation. On
  each player's turn, three steps in order: (1) Reveal villain
  at `play.start`, (2) Play / Recruit / Fight at `play.main`, (3)
  End turn (discard + draw 6) at `play.cleanup`. Every step's
  affordances are stage-gated per WP-007A. The TURN ACTIONS panel
  (desktop §3.1) and the STICKY BOTTOM TURN ACTIONS panel (mobile
  §3.2) both render the 3-step structure with the active stage's
  affordances at full prominence and inactive steps collapsed
  /disabled.
- **Re-skin / playmat selector exists in the top HUD bar** of both
  wireframes as `🎨 Skin: <name> ▼` (desktop) or `🎨 <name> ▼`
  (mobile compact). Clicking opens a modal/sheet listing available
  skins (board art, color theme, card-frame style); selection
  persists in client-local preferences (`localStorage`-backed
  Pinia store per WP-068 / WP-121 / WP-124 precedent) and
  **never** affects engine state, replay determinism, or any
  audience-filtered field. The available-skin set, the
  default-skin selection, the skin-discovery mechanism (bundled
  vs R2-published vs operator-uploaded), and the empty-state
  fallback are all locked at board-layout-WP draft time per
  §7.2 #7.
- **§4 mapping table verified against `uiState.types.ts` today.**
  ~12 rows are `Bound`, ~3 are `Illustrative`, ~15 are `Pending`.
  The `Pending` rows enumerate every UIState extension the future
  board-layout WP needs to land (or its predecessor projection
  WP — extending `UIState` is a separate concern from rendering
  the layout against it).

### §7.2 — Open Questions (Lock at Board-Layout-WP Draft Time)

**Eight decisions** a future board-layout WP must lock. Each is
non-arbitrary; reasonable people will disagree on at least two.

1. **Mastermind position.** Top-left, top-right, or top-center?
   Top-center crowds the scheme zone; top-left mirrors physical play
   for right-handed users; top-right is symmetric to the "Active
   player" HUD reading order.

2. **Opponent panel orientation.** Top-edge row (3-handed, fits
   horizontally) vs. left-edge column (5-handed, doesn't). Decision
   may need to be player-count-dependent.

3. **HQ slot count for non-MVP variants.** MVP locks 5 (per WP-015);
   some Legendary variants use 6. Layout should stretch gracefully —
   but board-layout WP must declare whether 6-slot is rendered as a
   stretched 5-row + Hero Deck or an explicit 6-row + Hero Deck (7
   total cells). The §7.1 inline-deck-on-right pattern survives
   either way.

4. **In-play card persistence.** When a card is played, does it
   stay in the in-play row through cleanup, or does it visually
   migrate to the discard pile mid-turn? The engine moves it to
   discard at `play.cleanup` end-of-turn; the visual transition is
   a UX choice.

5. **Card-back vs face-down representation.** Mastermind tactics
   deck, hero deck (HQ row column 6 per §7.1), villain deck (city
   row column 7 per §7.1), own deck, and the five shared decks
   (Wounds, Horrors, Bystanders, S.H.I.E.L.D. Officers, Sidekicks)
   — all face-down. Do they show a generic card-back image, a
   per-deck themed back, or a number-with-deck-icon? Affects
   image-asset pipeline scope. (Note: this question interacts with
   #7 — different skins may render the same face-down card with
   different art.)

6. **Scenario-specific victory-pile composition counters.** The
   §3 wireframes show S.H.I.E.L.D. Level + HYDRA Level as
   illustrative scenario-specific counters surfaced from VP-pile
   composition. The full set varies by set/scenario (e.g., World
   War Hulk's "Smashes" counter, Dark City's "Bindings" counter).
   The board-layout WP must lock: (a) the discovery mechanism —
   is the counter set declared in `data/metadata/scenario-counters.json`
   or derived from card effects in the loaded scenario? (b) the
   max number of counters shown without UX collapse (probably 3-4);
   (c) whether counters render in opponent victory-pile drill-down
   or only in the active player's zone.

7. **Re-skin / playmat selector.** The wireframes show a
   `🎨 Skin: <name> ▼` button in the top HUD bar. The board-layout
   WP must lock: (a) **discovery mechanism** — is the available-skin
   set bundled in the client build, fetched from R2 (mirrors the
   WP-082 / WP-125 metadata-from-R2 pattern), or operator-uploadable?
   (b) **scope of a skin** — board background art only, or also
   card-frame style, color theme, and audio? (c) **default skin** —
   "Classic" (matching physical Marvel Legendary), "Comic" (panel-
   art forward), or "Minimal" (high-contrast a11y baseline)?
   (d) **per-user persistence** — `localStorage` only (per WP-068 /
   WP-121 / WP-124 precedent) or also synced to `legendary.player_profiles`
   (would require schema extension per WP-104 column-additive
   pattern)? (e) **empty state** — what renders when no skin is
   selected or the selected skin's assets fail to load?

8. **Pre-plan UI integration affordance.** Where does the WP-059
   pre-plan surface appear during opponent's turn? Modal overlay,
   side drawer, or inline replacement of the turn-actions bar?

---

## §8 — What This Wireframe Is NOT

- Not a CSS / Vue component design.
- Not a visual style guide.
- Not a contract — a future board-layout WP supersedes everything
  here, including the §3 wireframes and the §4 mapping table.
- Not a prescription — `apps/arena-client/src/components/play/` already
  has stage-only-gated scaffolds (HandRow, CityRow, HQRow,
  MastermindTile, TurnActionBar, PlayView) that the future WP may
  evolve, supersede, or replace wholesale.
- Not a spectator-mode design — only sketched at low resolution as
  a §6.2 variation.
- Not a replay scrubber design — `<ReplayInspector />` (WP-064)
  already owns that surface and uses the WP-064 D-6401 keyboard
  focus pattern.
- Not load-bearing for any test — no test asserts against this file.

### §8.1 — Out-of-Scope but Commonly Asked

The following frequently-requested concerns are **deliberately
out of scope** for this wireframe. Asking "what about X?" for any
of these is a signal that the question belongs in the future
board-layout WP, not in this draft:

- **Animations / transitions** — card-flip, draw, discard,
  fight-impact, scheme-twist reveal, etc.
- **Hover vs click affordances** — desktop hover-to-preview vs
  click-to-zoom; the wireframe shows click only.
- **Accessibility roles / ARIA** — `role="button"`,
  `aria-live="polite"`, screen-reader announcements,
  keyboard-tab order. WP-064's D-6401 stepper-focus pattern is
  the only accessibility pattern this draft cites by reference.
- **CSS grid vs flex implementation** — the wireframe's box
  layouts are conceptual; the implementation choice is a
  board-layout-WP concern.
- **Pixel-perfect typography** — font-size scaling, line-height,
  text-overflow truncation, multi-line label wrapping.
- **Responsive breakpoint values** — the wireframes target
  representative viewports (1280×800 desktop, 375×667 mobile)
  but don't lock the breakpoints between them.
- **Color theming** — light/dark mode, contrast ratios beyond
  WP-061's accessibility baseline. (See §7.2 #7 — re-skinning
  is the user-facing surface for theming.)
- **Sound effects / music** — not addressed by this wireframe.
- **Pinch-to-zoom inside zones on mobile** — flagged as a §3.2
  open question; left to the board-layout WP.
- **Drag-and-drop interactions** — Legendary's MVP is
  click-to-play per WP-100; drag is a future-WP concern.
- **Localization / i18n** — string externalization, RTL
  layouts, multi-byte character widths.

---

## §9 — Future-Supersession Path

A future `WP-NNN — Game Board Layout (Active-Player View)` WP would:

1. Cite this draft as a non-normative input artifact (link to it
   from §Authorizing Contracts; do not include it in the §1 Scope
   read-order list).
2. Lock the eight Open Questions from §7.2 into `[DECISION REQUIRED]`
   blocks with recommended defaults.
3. Define the production Vue component tree under
   `apps/arena-client/src/components/play/` (extending or
   superseding the WP-100 scaffolds).
4. **Recommend (but not mandate)** a `data-testid` mapping for
   each major visual region so future accessibility, smoke, and
   replay tests can assert layout structure without DOM coupling.
   Whether to enforce `data-testid` coverage as a hard requirement
   is a board-layout-WP-time decision, not a wireframe-time one.
5. Resolve every `Pending` row in the §4 mapping table either by
   extending `UIState` (and updating
   `uiState.types.drift.test.ts`) or by deriving the data at
   projection time inside `buildUIState`. The board-layout WP may
   also defer some `Pending` rows to a separate predecessor
   projection-extension WP if the projection work is large enough
   to warrant scope separation.
6. Produce a `docs/ai/post-mortems/01.6-WP-NNN-board-layout.md` if
   the §7.2 decisions surface tension worth capturing.

This wireframe is *retired* the moment a board-layout WP lands —
its only job is to make the WP draftable without a re-derivation
session.

---

*Last updated: 2026-05-03 (initial draft + five reviewer feedback
passes — pass 1 locked city visual column order Bridge | Streets |
Rooftops | Bank | Sewers | Villain Deck (L→R) and Hero Deck inline
as HQ row column 6; pass 2 added Shared Decks zone (Wounds +
Bystanders + S.H.I.E.L.D. Officers + Sidekicks), expanded Shared KO
Pile (face-up, top-card visible), expanded per-player Victory Pile
with composition counters including scenario-specific S.H.I.E.L.D.
Level + HYDRA Level, fixed opponent-panel KO bug; pass 3 added four
new piles — Master Strike Pile (right of Tactics deck) + Scheme
Twist Pile (right of Scheme tile) + Escaped Pile (city row column 1,
left of Bridge — city row grew to 7 columns at 9-char width) +
Horrors Deck (Shared Decks zone now 5 cells); pass 4 split §3 into
§3.1 — Desktop Landscape Wireframe + §3.2 — Mobile Portrait
Wireframe (both first-class, both rendering the same UIState),
clarified Your Deck face-down vs Your Discard face-up, replaced
TURN ACTIONS panel with locked 3-step turn structure (random first
player + clockwise rotation; Step 1 Reveal villain at play.start,
Step 2 Play/Recruit/Fight at play.main, Step 3 End turn — discard
+ draw 6 — at play.cleanup), added §5.1 Turn Structure prose docs
documenting the full 3-step rules with reveal-pipeline
disambiguation, renamed §5 Click Affordances to §5.2; pass 5 audit:
verified §4 mapping table against the live WP-028 contract at
`packages/game-engine/src/ui/uiState.types.ts` and the WP-089
`LegendaryGame.playerView` projection — corrected ~15 field-name
errors (e.g., `phase` → `game.phase`, `city.slots` → `city.spaces`,
`mastermind.hpRemaining` → `mastermind.tacticsRemaining`,
`scheme.schemeId` → `scheme.id`, `scheme.twistsResolved` →
`scheme.twistCount`, `players[i].victoryVp` removed (not in
UIState)), added a 3-state Bound/Illustrative/Pending status
column with a legend, marked all the shared-pile counts (Wounds /
Bystanders / Officers / Sidekicks / Horrors / KO / Hero Deck /
Villain Deck) and destination piles (Master Strike Pile / Scheme
Twist Pile / Escaped Villain contents) as `Pending` since they
exist in G but aren't projected through UIState today; added the
🎨 Skin / playmat re-skin button to both desktop + mobile HUD bars
with §7.1 lock + §7.2 #7 open-question block; restructured §7.2
fixing the count from 6 to 8 with the new re-skin question;
added §8.1 — Out-of-Scope but Commonly Asked deferral list
(animations, hover, ARIA, CSS-grid-vs-flex, breakpoint values,
i18n, drag-and-drop, sound); restructured §1 Goals to add the
"descriptive not prescriptive" disclaimer; split §2 Principle 5
into a layout rule + a separate gameplay-semantics note; added
"Reading note" prefaces before each §3 ASCII wireframe; added a
Reader Contract paragraph to the front matter; clarified §9 item
4 as a recommendation (not a mandate) re: data-testid coverage;
not yet referenced by any WP, EC, or DECISIONS entry)*
*Maintained by: ad-hoc; promoted to a board-layout WP's authority
chain when one is drafted*
