# WP-224 — Hero Ability Markup Corpus Sweep (All 40 Sets)

**Status:** Draft
**Primary Layer:** Card Data + Offline Tooling (no engine changes)
**Dependencies:** WP-222 baseline (no hard engine dependency; may execute in parallel with WP-223)

---

## Session Context

WP-216 through WP-223 built out the hero ability markup pipeline for 14 active sets.
Four additional sets (`amwp`, `dead`, `ff04`, `mgtg`) were scanned but yielded only
`_deferred` entries. The remaining 22 sets have never been scanned against the full
executor family now in place:

> **Unscanned sets (22):**
> `anni`, `antm`, `asrd`, `bkpt`, `bkwd`, `dims`, `dstr`, `fear`, `gotg`,
> `mdns`, `msmc`, `nmut`, `noir`, `pttr`, `rlmk`, `rvlt`, `shld`, `vill`,
> `vnom`, `wpnx`, `wtif`, `xmen`

Pre-session research (run before this WP was drafted) confirms the following about these
22 sets:

1. **`--propose` finds zero new active candidates.** No ability in any unscanned set
   matches the current detection functions for rescue, reveal-draw, reveal-cost-attack,
   reveal-odd-draw, reveal-ko, reveal-min, reveal-ko-or-draw, reveal-attack-choose, or
   reveal-ko-attack.

2. **Exactly 30 new `_deferred` entries are required.** The unscanned sets contain 30
   abilities matching rescue or reveal-top-card patterns that require executors not yet
   implemented.

The primary deliverable of this WP is therefore not new markup tokens, but a
**comprehensive `_deferred` catalogue** that documents every blocked pattern and makes
the gap explicit for future executor WP planning.

---

## Why This Is Useful

The `_deferred` block serves as the executor backlog for the hero ability markup
pipeline. Without it:

- Future executor WPs must re-discover candidate cards via `--propose` sweeps across
  all 40 sets after each new executor is added.
- Pattern families (class-conditional draws, icon-conditional draws, discard-choose,
  fight-timed rescues) are scattered across sets with no central catalogue.

With a complete `_deferred` block, the next executor WP author opens `hero-ability-markers.json`,
scans the `_deferred` entries for the pattern they just implemented, and marks them
directly — no re-sweep needed.

---

## Goal

After this packet:

- `hero-ability-markers.json` has been verified against all 40 sets. No set is
  unscanned.
- The `_deferred` block grows from 4 entries to 34 entries, covering 3 new pattern
  categories (30 new entries).
- **Zero new active markup tokens are added.** `data/cards/*.json` files are not
  modified.
- The `--propose` run confirms zero unexpected candidates (or the WP is amended if
  any are found before proceeding to the deferred documentation step).
- D-22401 is recorded in DECISIONS.md.

---

## Assumes

- `apply-hero-ability-markers.mjs` is present at `scripts/convert-cards/` with
  `--propose` and `--validate` modes (WP-216 baseline).
- All 40 card sets exist under `data/cards/` (40 `*.json` files).
- `VALID_TOKEN_PATTERN` already covers all current hero keywords including
  `reveal-ko-attack` (added in WP-223). No script changes are needed.
- The `_deferred` block currently has 4 entries: `amwp`, `dead`, `ff04`, `mgtg`.
- **Unscanned set definition.** An "unscanned set" is any set not previously included
  in WP-216 through WP-223 active or deferred coverage. The 22 unscanned sets are:
  `anni`, `antm`, `asrd`, `bkpt`, `bkwd`, `dims`, `dstr`, `fear`, `gotg`, `mdns`,
  `msmc`, `nmut`, `noir`, `pttr`, `rlmk`, `rvlt`, `shld`, `vill`, `vnom`, `wpnx`,
  `wtif`, `xmen`.

---

## Context (Read First)

- `scripts/convert-cards/inputs/hero-ability-markers.json` — the file being modified;
  inspect the `_deferred` block (currently 4 entries) and the active map structure
  before editing. The existing 4 entries (`amwp`, `dead`, `ff04`, `mgtg`) define the
  canonical object shape to follow.
- `scripts/convert-cards/apply-hero-ability-markers.mjs` — modes: `--propose`
  (dry-run candidate detection, read-only), `--validate` (JSON parse + schema check,
  CI-safe), apply (default, writes `data/cards/`). Only `--propose` and `--validate`
  are used in this WP — never apply mode.
- `docs/ai/DECISIONS.md §D-21602` — the decision governing fight-timed keyword timing
  prefixes. All 13 Category A entries cite it via exact reason strings; no
  re-derivation needed.
- `docs/ai/work-packets/WP-224-hero-ability-markup-corpus-sweep.md §Deferred Entries
  to Add` — the primary execution reference. Contains all 30 entry tables with exact
  `setAbbr`, `heroSlug`, `cardSlug`, `abilityIndex`, and reason strings. Do not
  free-form these values.

---

## Scope (In)

- `scripts/convert-cards/inputs/hero-ability-markers.json` — add exactly 30 new
  `_deferred` entries; no active map entries changed; no other mutations
- `docs/ai/DECISIONS.md` — add D-22401 (corpus sweep decision)
- `docs/ai/STATUS.md` — record WP-224 execution
- `docs/ai/work-packets/WORK_INDEX.md` — flip WP-224 `[ ]` → `[x]` Done with date
- `docs/ai/execution-checklists/EC_INDEX.md` — flip EC-256 Draft → Done

---

## Non-Negotiable Constraints

- **No active tokens added.** If `--propose` surfaces an unexpected candidate in
  any of the 22 unscanned sets, STOP and amend this WP before proceeding. Do not
  add any `[keyword:X]` token to `data/cards/*.json` under this WP.
- **No `data/cards/*.json` modifications.** This WP touches only
  `hero-ability-markers.json` and governance files.
- **No engine code changes.** `heroKeywords.ts`, `heroEffects.execute.ts`, and all
  test files are out of scope.
- **No script changes.** `apply-hero-ability-markers.mjs` is not modified.
- **Format parity.** Every new `_deferred` entry uses the exact existing object shape:
  `{ setAbbr, heroSlug, cardSlug, abilityIndex, abilityText, reason }`. No new fields.
- **Slug fidelity is strict.** `setAbbr`, `heroSlug`, and `cardSlug` MUST exactly
  match values in `data/cards/*.json`. If any mismatch is discovered during entry
  insertion or validation, STOP and reconcile against the source card data before
  proceeding.
- **Uniqueness constraint.** No two `_deferred` entries may share the same
  `(setAbbr, heroSlug, cardSlug, abilityIndex)` tuple. Duplicate detection is a
  blocking error.
- **Minimal diff rule.** Only add new `_deferred` entries. No reformatting,
  reordering of existing entries, or whitespace-only changes are permitted. The only
  allowed mutation to the file is appending / inserting within the `_deferred` array.
- **Run `--validate` after editing** `hero-ability-markers.json` to confirm the file
  parses and all existing active entries are still valid.
- **Code style (`00.6-code-style.md`):** N/A — this WP produces no TypeScript or
  JavaScript files. No code is generated; the only output is JSON entries added to the
  `_deferred` block.

---

## Deferred Entries to Add (30 total)

All entries are organized by pattern category. This grouping is editorial guidance for
future executor WP planning; the JSON entries themselves are sorted by `setAbbr`
(alphabetical) within each category.

### Category A — Fight-Timed (D-21602 Family, 13 entries)

These abilities use keyword timing prefixes (`[keyword:Ambush]:`,
`[keyword:Excessive Violence]:`, `[keyword:Focus] N:`, `[keyword:Indigestion]:`,
`[keyword:Moonlight]:`, `[keyword:Patrol the Rooftops]:`) or fight-win triggers
that are not wired to `executeHeroEffects`. They extend the pattern already
documented in the existing 4 `_deferred` entries.

| setAbbr | heroSlug | cardSlug | abilityIndex | abilityText (abbreviated) |
|---|---|---|---|---|
| `anni` | `fantastic-four-united` | `invisible-woman` | 1 | `[keyword:Focus] 4[icon:recruit] [icon:5] Rescue a Bystander, then you may KO a card...` |
| `bkpt` | `king-black-panther` | `unseen-protector` | 0 | `[team:heroes-of-wakanda] [keyword:Ambush]: Rescue a Bystander.` |
| `mdns` | `blade-daywalker` | `hunt-high-and-low` | 0 | `[keyword:Patrol the Rooftops]: If it's empty, reveal the top card of your deck. You may KO it.` |
| `mdns` | `werewolf-by-night` | `track-the-captives` | 0 | `[keyword:Moonlight]: Whenever you defeat a Villain or Mastermind this turn, you may rescue a Bystander...` |
| `mdns` | `wong-master-of-the-mystic-arts` | `face-your-demons` | 0 | `Once this turn, you may fight the top card of the Bystander Deck...Fight: KO...Rescue this card as a Bystander.` |
| `pttr` | `moon-knight` | `golden-ankh-of-khonshu` | 0 | `Whenever you defeat a Villain on the Rooftops this turn, rescue Bystanders equal to that Villain's printed [icon:piercing].` |
| `rvlt` | `war-machine` | `overwhelming-firepower` | 0 | `Whenever you defeat a Villain or Mastermind this turn, draw a card and rescue a Bystander.` |
| `vnom` | `carnage` | `gruesome-feast` | 0 | `[keyword:Excessive Violence]: Reveal the top card of your deck. You may KO it.` |
| `vnom` | `carnage` | `feast-or-famine` | 0 | `[keyword:Excessive Violence]: Reveal the top card of your deck. If it costs 0, KO it and you may repeat this process.` |
| `vnom` | `venompool` | `can-i-get-a-little-gratitude` | 1 | `[keyword:Excessive Violence]: "Rescue" a Bystander.` |
| `vnom` | `venompool` | `digest-that-chimichanga` | 1 | `[keyword:Indigestion]: "Rescue" a Bystander.` |
| `vnom` | `venompool` | `play-to-the-crowd` | 1 | `[keyword:Indigestion]: "Rescue" two Bystanders.` |
| `wtif` | `party-thor` | `destructive-feast` | 0 | `Whenever you recruit a Hero that costs 5 or more this turn, reveal the top card of your deck and you may KO it.` |

**Reason strings for Category A — use these exact strings, no free-form variation:**

| Entry | Exact `reason` value |
|---|---|
| `anni/fantastic-four-united/invisible-woman` | `"D-21602 — keyword timing prefix: not wired to executeHeroEffects; also carries per-turn-use-count limit and compound rescue+KO effect"` |
| `bkpt/king-black-panther/unseen-protector` | `"D-21602 — keyword timing prefix: not wired to executeHeroEffects"` |
| `mdns/blade-daywalker/hunt-high-and-low` | `"D-21602 — keyword timing prefix: not wired to executeHeroEffects; also 'You may KO it' is optional, unlike unconditional reveal-ko"` |
| `mdns/werewolf-by-night/track-the-captives` | `"D-21602 — fight-win trigger: not wired to executeHeroEffects"` |
| `mdns/wong-master-of-the-mystic-arts/face-your-demons` | `"D-21602 — fight-win trigger: not wired to executeHeroEffects; non-standard combat against Bystander Deck stack"` |
| `pttr/moon-knight/golden-ankh-of-khonshu` | `"D-21602 — fight-win trigger: not wired to executeHeroEffects; also scales to defeated villain's piercing value"` |
| `rvlt/war-machine/overwhelming-firepower` | `"D-21602 — fight-win trigger: not wired to executeHeroEffects"` |
| `vnom/carnage/gruesome-feast` | `"D-21602 — keyword timing prefix: not wired to executeHeroEffects"` |
| `vnom/carnage/feast-or-famine` | `"D-21602 — keyword timing prefix: not wired to executeHeroEffects; also loop mechanic requires new infrastructure even if timing resolved"` |
| `vnom/venompool/can-i-get-a-little-gratitude` | `"D-21602 — keyword timing prefix: not wired to executeHeroEffects"` |
| `vnom/venompool/digest-that-chimichanga` | `"D-21602 — keyword timing prefix: not wired to executeHeroEffects"` |
| `vnom/venompool/play-to-the-crowd` | `"D-21602 — keyword timing prefix: not wired to executeHeroEffects"` |
| `wtif/party-thor/destructive-feast` | `"D-21602 — recruit-event trigger: not wired to executeHeroEffects"` |

---

### Category B — Novel Player-Deck Reveal Patterns (14 entries)

These abilities reveal the top card of the **player's own deck** but require executor
families not yet implemented. Each sub-pattern is a candidate for a future executor WP.

#### B1 — `reveal-discard-choose` (2 entries)
Player must choose to discard OR put the card back. No cost evaluation. No draw.
Requires `G.pendingHeroChoice` routing with a discard-or-return choice object (no attack
grant, unlike `reveal-attack-choose`).

| setAbbr | heroSlug | cardSlug | abilityIndex |
|---|---|---|---|
| `dstr` | `vishanti-the` | `agamotto` | 0 |
| `rvlt` | `scarlet-witch` | `alter-reality` | 0 |

Both have abilityText: `"Reveal the top card of your deck. Discard it or put it back."`

#### B2 — `reveal-min-or-discard-choose` (1 entry)
Inverted cost threshold (draw if cost ≥ N) with a player-choice fallback (discard OR
put it back) on the low branch. Requires both a `reveal-min`-style draw AND
`pendingHeroChoice` for the fallback — a compound not expressible with current executors.

| setAbbr | heroSlug | cardSlug | abilityIndex | abilityText |
|---|---|---|---|---|
| `anni` | `brainstorm` | `borrow-from-the-future` | 0 | `"Reveal the top card of your deck. If it costs 2 or more, draw it. Otherwise, discard it or put it back."` |

#### B3 — `reveal-class-conditional-draw` (1 entry)
Draw conditional on the revealed card's hero class. No cost evaluation.

| setAbbr | heroSlug | cardSlug | abilityIndex | abilityText |
|---|---|---|---|---|
| `pttr` | `moon-knight` | `crescent-moon-darts` | 0 | `"Reveal the top card of your deck. If it's [hc:instinct] or [hc:tech], draw it."` |

#### B4 — `reveal-icon-conditional-draw` (2 entries)
Draw conditional on the revealed card having a specific icon (`[icon:attack]` or
`[icon:recruit]`). No cost evaluation.

| setAbbr | heroSlug | cardSlug | abilityIndex | abilityText |
|---|---|---|---|---|
| `pttr` | `spider-woman` | `bioelectric-shock` | 1 | `"Reveal the top card of your deck. If that card has an [icon:attack] icon, draw it."` |
| `pttr` | `spider-woman` | `venom-blast` | 1 | `"Reveal the top card of your deck. If that card has a [icon:recruit] icon, draw it."` |

#### B5 — `reveal-cost-range-attack` (1 entry)
Attack bonus if the revealed card's cost falls in a specific range (cost ∈ {1, 2}) —
not a simple ≤ threshold. A new cost-range parameter format would be required.

| setAbbr | heroSlug | cardSlug | abilityIndex | abilityText |
|---|---|---|---|---|
| `pttr` | `symbiote-spider-man` | `dark-strength` | 1 | `"Reveal the top card of your deck. If it costs 1 [icon:vp] or 2 [icon:vp], you get +2[icon:attack]."` |

#### B6 — `reveal-player-named-class-draw` (1 entry)
Player declares a hero class at activation time (before the reveal); draw if the
revealed card matches the declared class. Requires ability-activation flow changes
not present in the current design.

| setAbbr | heroSlug | cardSlug | abilityIndex | abilityText |
|---|---|---|---|---|
| `rvlt` | `speed` | `race-to-the-rescue` | 0 | `"Choose a Hero Class. (...) Reveal the top card of your deck. If it's the Hero Class you named, draw it. Otherwise, put it back on the top or bottom."` |

#### B7 — `reveal-ko-or-teleport` (1 entry)
Player choice: KO the card OR Teleport it. [keyword:Teleport] is a movement mechanic
(relocate card to a different zone/location) not in the current executor family.

| setAbbr | heroSlug | cardSlug | abilityIndex | abilityText |
|---|---|---|---|---|
| `dims` | `ms-america` | `kick-a-hole-in-reality` | 0 | `"[hc:strength]: Reveal the top card of your deck. KO it or [keyword:Teleport] it."` |

#### B8 — `reveal-recruit-zero-or-no-team-draw` (1 entry)
Compound OR condition: draw if recruit-cost = 0 OR the card has no team icon. Requires
evaluating recruit cost (not VP cost) and team-icon presence — neither is in the current
executor design.

| setAbbr | heroSlug | cardSlug | abilityIndex | abilityText |
|---|---|---|---|---|
| `dims` | `howard-the-duck` | `rebel-without-a-cause` | 0 | `"Reveal the top card of your deck. If it costs 0[icon:recruit] or has no team icon, draw it."` |

#### B9 — `reveal-discard-attack` (1 entry)
Similar to `reveal-ko-attack` but discards the card instead of KO-ing it when cost = 0.
Discard vs. KO is a meaningful gameplay difference; a `reveal-discard-attack` executor
(or a `mode` parameter on `reveal-ko-attack`) would be needed.

| setAbbr | heroSlug | cardSlug | abilityIndex | abilityText |
|---|---|---|---|---|
| `vnom` | `venomized-dr-strange` | `see-future-timelines` | 0 | `"[hc:ranged]: Reveal the top card of your deck. If it costs 0, discard it and you get +2[icon:attack]."` |

#### B10 — `reveal-optional-ko` (1 entry)
`You may KO it` — the player may choose not to KO (unlike the unconditional `reveal-ko`).

| setAbbr | heroSlug | cardSlug | abilityIndex | abilityText |
|---|---|---|---|---|
| `vill` | `electro` | `electroshock-therapy` | 1 | `"Reveal the top card of your deck. You may KO it."` |

#### B11 — `reveal-conditional-discard-or-return` compound (2 entries)
Multi-branch reveals where the outcome depends on class, team, or card type, and the
player has a choice on at least one branch.

| setAbbr | heroSlug | cardSlug | abilityIndex | abilityText |
|---|---|---|---|---|
| `vill` | `sabretooth` | `leap-of-the-tiger` | 0 | `"Reveal the top card of your deck, then put it back on top of your deck or into your discard pile. If that card was an [hc:instinct] Ally, you get +2[icon:attack]."` |
| `vill` | `sabretooth` | `take-one-for-the-team` | 0 | `"Reveal the top card of your deck. If it's a [team:brotherhood] Ally, you may draw it. Otherwise, you may KO it."` |

---

### Category C — Complex Rescue Patterns (3 entries)

These rescue abilities involve mechanics that are architecturally distinct from the
standard `rescue a Bystander` executor.

| setAbbr | heroSlug | cardSlug | abilityIndex | abilityText | Reason |
|---|---|---|---|---|---|
| `mdns` | `elsa-bloodstone` | `stalk-the-night-stalkers` | 1 | `"[hc:tech]: If a Bystander is KO'd this way, you may also rescue that Bystander instead of putting it in the KO pile."` | KO-event response rescue: rescue is triggered by a prior KO in the same ability chain, not as a standalone action. Requires event-response plumbing not present in the current hero effects executor. |
| `noir` | `spider-man-noir` | `solve-the-crime` | 0 | `"[hc:instinct]: [keyword:Investigate] the Bystander Stack for a Bystander and rescue it."` | [keyword:Investigate] searches the full Bystander Stack (not just the top card); requires stack-search logic not in the current executor family. |
| `wtif` | `doctor-strange-supreme` | `to-save-christine` | 1 | `"[hc:instinct][keyword:Soulbind a Bystander or Villain]: You get +2[icon:attack]. If it's Special Bystander, you may do its Rescue effect."` | Soulbind keyword captures a bystander/villain face-down; "do its Rescue effect" requires inline execution of a Special Bystander's embedded rescue effect text — not expressible in the current executor family. |

---

## Future Executor WP Candidates (Planning Guide)

The `_deferred` catalogue implies these executor WPs as high-yield next steps:

| Future WP | Pattern | Cards Unlocked |
|---|---|---|
| `reveal-discard-choose` | `dstr/agamotto`, `rvlt/scarlet-witch/alter-reality` | 2 (known) |
| `reveal-discard-attack` | `vnom/venomized-dr-strange/see-future-timelines` | 1 |
| `reveal-optional-ko` | `vill/electro/electroshock-therapy` | 1 |
| `reveal-class-conditional-draw` | `pttr/moon-knight/crescent-moon-darts` | 1 |
| Fight-timing dispatch (large WP) | All Category A entries | ~13 |

This table is editorial; it is NOT a binding scope commitment.

---

## Out of Scope

These are excluded because `hero-ability-markers.json` scope is strictly:
- **player-deck reveal** (top card of the player's own hero deck)
- **player-triggered rescue** (rescuing a Bystander from the Bystander Stack)

Any mechanic operating on a different deck, a global state, or requiring cross-player
interaction is out of scope by design. The following patterns appear in the 22 sets but
are **not added to `_deferred`** because they fall outside this scope:

- **Villain Deck reveals** (`anni/psi-lord` × 4, `msmc/stepford-cuckoos` × 2,
  `rvlt/hellcat/demon-sight`, `vnom/carnage`)
- **Hero Deck reveals** (`nmut/karma` × 2, `xmen/psylocke` × 2, `rvlt/scarlet-witch/chaos-magic`)
- **Bystander Deck reveals** (`dims/howard-the-duck/traveling-companion`)
- **Specialty stack reveals** (`shld/agent-coulson/build-the-strike-team`,
  `vill/mystique/turn-the-tide`, `rvlt/hellcat/part-time-pi`)
- **Multi-player choice mechanics** (`pttr/black-cat/cat-burglar`)
- **Victory Pile fights** (`rvlt/war-machine/simulated-target-practice`)
- **`wpnx`** — entire set uses Weapon X Sequence / Berserk mechanics; no rescue or
  player-deck reveal abilities present

The following sets confirmed **zero hero ability rescue/reveal-top-card lines** in all
40-set coverage:
> `antm`, `asrd`, `bkwd`, `fear`, `gotg`, `rlmk`, `wpnx`

---

## Locked Contract Values

| Value | Form |
|---|---|
| `hero-ability-markers.json` `_deferred` format | `{ setAbbr, heroSlug, cardSlug, abilityIndex, abilityText, reason }` (no new fields) |
| Active map entries added | **0** |
| New `_deferred` entries | **30** |
| `_deferred` total after | **34** |
| Invariant | initial (4) + added (30) = final (34) |
| `data/cards/*.json` modifications | **none** |
| Engine / tooling script changes | **none** |

---

## Files Expected to Change

- `scripts/convert-cards/inputs/hero-ability-markers.json` — **modified** — `_deferred`
  array grows from 4 entries to 34 entries (+30); active map unchanged
- `docs/ai/DECISIONS.md` — **modified** — D-22401 added with Active status and Landed date
- `docs/ai/STATUS.md` — **modified** — WP-224 execution entry added
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — WP-224 `[ ]` → `[x]` Done with date
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — EC-256 Draft → Done

No files are created. No files outside this list may be modified.

---

## Implementation Steps

1. **Run `--propose` across all 40 sets.**
   ```bash
   node scripts/convert-cards/apply-hero-ability-markers.mjs --propose
   ```
   Expected outcome: no candidate rows belonging to any of the 22 previously unscanned
   sets. Existing known candidates in already-scanned sets (if any) are ignored.

   If **ANY** candidate appears for a set in:
   ```
   { anni, antm, asrd, bkpt, bkwd, dims, dstr, fear, gotg,
     mdns, msmc, nmut, noir, pttr, rlmk, rvlt, shld, vill,
     vnom, wpnx, wtif, xmen }
   ```
   → **STOP** and amend WP-224 before proceeding. Do not add any `[keyword:X]` token
   under this WP.

2. **Add 30 new `_deferred` entries to `hero-ability-markers.json`.**
   Insert in the `_deferred` array. Sort the **entire** `_deferred` array by `setAbbr`
   (primary), `heroSlug` (secondary), `cardSlug` (tertiary), `abilityIndex`
   (quaternary). The category groupings in this WP (A/B/C) are editorial only and
   **MUST NOT** affect final JSON ordering. The entries are fully specified in the
   tables above — use the exact slugs from the tables. Verify each `setAbbr`,
   `heroSlug`, and `cardSlug` against `data/cards/*.json` before inserting. Add all 30
   entries in a single edit.

2.5 **Run JSON parse check before `--validate`.**
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('scripts/convert-cards/inputs/hero-ability-markers.json','utf8'))"
   ```
   Must exit 0. Catches syntax errors (trailing commas, mismatched braces) before the
   full validator runs.

3. **Run `--validate`.**
   ```bash
   node scripts/convert-cards/apply-hero-ability-markers.mjs --validate
   ```
   Must exit 0. All existing active entries must still pass validation.

4. **Record D-22401 in `docs/ai/DECISIONS.md`.**

5. **Governance close:** Update `docs/ai/STATUS.md`, `docs/ai/work-packets/WORK_INDEX.md`
   (WP-224 → Done), and `docs/ai/execution-checklists/EC_INDEX.md` (EC-256 → Done).

---

## Verification Steps

```bash
# 1. Gate check — no candidates for any of the 22 unscanned sets
node scripts/convert-cards/apply-hero-ability-markers.mjs --propose
# Expected: zero candidate rows for anni antm asrd bkpt bkwd dims dstr fear gotg
#           mdns msmc nmut noir pttr rlmk rvlt shld vill vnom wpnx wtif xmen

# 2. JSON parse integrity
node -e "JSON.parse(require('fs').readFileSync('scripts/convert-cards/inputs/hero-ability-markers.json','utf8'))"
# Expected: exits 0 (no output)

# 3. Schema validation — all active entries still pass
node scripts/convert-cards/apply-hero-ability-markers.mjs --validate
# Expected: exits 0

# 4. _deferred count invariant
node -e "const j=JSON.parse(require('fs').readFileSync('scripts/convert-cards/inputs/hero-ability-markers.json','utf8')); console.log(j._deferred.length)"
# Expected: 34

# 5. Card JSON untouched
git diff data/
# Expected: empty (no output)

# 6. Full monorepo build
pnpm -r build
# Expected: exits 0
```

## Acceptance Criteria

- [ ] `--propose` exits 0 with zero candidate rows for all 22 unscanned sets
- [ ] JSON parse check exits 0
- [ ] `--validate` exits 0
- [ ] `_deferred` count = 34 (invariant: 4 + 30 = 34)
- [ ] `git diff data/` is empty — no `data/cards/*.json` modified
- [ ] `pnpm -r build` exits 0
- [ ] D-22401 is Active in DECISIONS.md with a Landed date
- [ ] WORK_INDEX.md shows WP-224 `[x]` Done with date
- [ ] EC_INDEX.md shows EC-256 Done
- [ ] `git diff --name-only` lists only the 5 files in `## Files Expected to Change`

---

## Decisions to Record

### D-22401 — Hero Ability Markup Corpus Sweep All 40 Sets (WP-224)

**Decision:** Full scan of all 22 previously unscanned sets confirms zero new active
`hero-ability-markers.json` entries for the current executor family (9 executor keywords
as of WP-223). All abilities matching rescue or reveal-top-card patterns either (a) use
fight-timed keyword timing not wired to `executeHeroEffects`, or (b) require new executor
families not yet implemented (class/icon/range-conditional draws, discard-choose,
discard-attack, optional-ko, Teleport-reveal, player-named-class, Investigate, Soulbind).
Thirty new `_deferred` block entries are added across three pattern categories.
`hero-ability-markers.json` now provides complete coverage of all 40 card sets.

**Rationale:** Documenting deferred patterns centrally eliminates re-discovery sweeps
from future executor WPs. Each future executor WP can scan the `_deferred` block for
its pattern and mark those cards directly.

**Packet:** WP-224 / EC-256.
**Drafted:** 2026-06-08. **Landed:** (pending execution).
**Status:** Drafted

---

## Definition of Done

- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs --propose` exits 0,
      no unexpected candidates in the 22 unscanned sets
- [ ] `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` exits 0
- [ ] `_deferred` block has exactly **34** entries (was 4, +30)
- [ ] `data/cards/*.json` files are **unchanged** (`git diff data/` shows nothing)
- [ ] `pnpm -r build` exits 0
- [ ] D-22401 Active in DECISIONS.md with Landed date
- [ ] WORK_INDEX.md WP-224 → `[x]` Done with date
- [ ] EC_INDEX.md EC-256 → Done
- [ ] STATUS.md updated with WP-224 entry

---

## Commit Topology

**Single commit** (data-only WP, no engine changes):

```
EC-256: hero-ability-markers corpus sweep — 30 deferred entries, all 40 sets covered
```

Files:
- `scripts/convert-cards/inputs/hero-ability-markers.json` (+30 `_deferred` entries)
- `docs/ai/DECISIONS.md` (D-22401)
- `docs/ai/STATUS.md`
- `docs/ai/work-packets/WORK_INDEX.md`
- `docs/ai/execution-checklists/EC_INDEX.md`

---

## Pre-Flight Verdict

**Verdict: READY TO EXECUTE** (2026-06-08)

Prerequisites confirmed:
- WP-216 baseline: `apply-hero-ability-markers.mjs` present with `--propose` and
  `--validate` modes — confirmed present (established WP-216; script unchanged since)
- All 40 card sets: `data/cards/*.json` — confirmed present (WP-218 completed,
  full set imported)
- `_deferred` initial state: exactly 4 entries (`amwp`, `dead`, `ff04`, `mgtg`) —
  confirmed per prior session research
- No hard engine dependency: WP-224 may execute in parallel with or after WP-223

Scope locked:
- 5 files, all `— modified`, no new files, no code changes
- Zero active tokens added; `data/cards/*.json` untouched
- `apply-hero-ability-markers.mjs` not modified

Risk items:
- **RS-1** (non-blocking): Cannot verify repo is green (build/tests passing) without
  running commands in the execution session. Execution session must run
  `node scripts/convert-cards/apply-hero-ability-markers.mjs --validate` as its
  first action (EC-256 Before Starting checkpoint).

No blocking pre-session actions (PS) required.

---

## Copilot Check Verdict

**Verdict: PASS** (2026-06-08)
**Pre-flight verdict under review:** READY TO EXECUTE (2026-06-08)

WP-224 is a data-only offline tooling WP. Most of the 30 copilot-check issues collapse
to rapid PASS or N/A because no runtime code, engine state, or UI surface is touched.

Findings for issues with non-trivial surface:

- **Issue 4 (Contract Drift):** PASS — `_deferred` object shape is locked verbatim in
  both EC-256 §Locked Values and WP-224 §Locked Contract Values. No type drift possible.
- **Issue 12 (Scope Creep):** PASS — strict 5-file allowlist; `git diff --name-only`
  verification step explicit in Acceptance Criteria.
- **Issue 19 (JSON Serializability):** PASS — all `_deferred` entries are plain JSON
  objects (string fields + integer abilityIndex). JSON parse check explicitly required
  as Step 2.5 / EC-256 §After Completing item 2.
- **Issue 22 (Silent vs Loud Failure):** PASS — failure modes are explicit: `--validate`
  fail → JSON syntax error; `--propose` unexpected candidate → STOP and amend WP-224.
- **Issue 23 (Deterministic Ordering):** PASS — 4-key sort order locked
  (`setAbbr` → `heroSlug` → `cardSlug` → `abilityIndex`); category groupings
  explicitly noted as editorial only and not affecting JSON ordering.
- **Issue 26 (Implicit Content Semantics):** PASS — reason strings are verbatim and
  locked in WP-224 §Category A Reason Strings table; no free-form variation permitted.
- **Issue 28 (No Upgrade Story):** PASS — additive only; no breaking changes to
  existing entries; no migration needed.

All remaining issues: PASS or N/A (no engine, no UI, no persistence, no TypeScript,
no boardgame.io, no DB, no determinism surface).

Pre-Flight Verdict Disposition: **CONFIRM** — READY TO EXECUTE verdict stands.
Session prompt generation authorized.

---

## Lint Gate Self-Review

Gate: `00.3-prompt-lint-checklist.md`. Run 2026-06-08.

| Section | Result | Notes |
|---|---|---|
| §1 Work Packet Structure | **PASS** | All 10 required sections present after this review pass |
| §2 Non-Negotiable Constraints | **PASS** | Engine-wide code constraints: N/A (data-only WP, no code produced); 00.6 reference: N/A noted inline; packet-specific constraints, session protocol, locked contract values all present |
| §3 Prerequisites (Assumes) | **PASS** | WP-216 script baseline, 40-set presence, _deferred initial count, script modes all listed |
| §4 Context References | **PASS** | Context section added with specific file paths and decision reference; 00.2 N/A (no 00.2 §8.1 field names used — _deferred fields are hero-ability-markers-specific) |
| §5 Output Completeness | **PASS** | 5 files, all `— modified`, bounded list; no ambiguous output language |
| §6 Naming Consistency | **PASS** | No 00.2 canonical field names used; _deferred fields consistently named |
| §7 Dependency Discipline | **PASS** | No new npm dependencies |
| §8 Architectural Boundaries | **PASS** | Data-only offline tooling; no engine, no server, no DB, no boardgame.io |
| §9 Windows Compatibility | **PASS** | All WP commands use `node`, `git`, `pnpm` — cross-platform; no Unix-specific syntax in this WP |
| §10 Env Variable Hygiene | **N/A** | No env vars used |
| §11 Authentication | **N/A** | No auth surfaces |
| §12 Test Quality | **N/A** | No tests produced |
| §13 Commands and Verification | **PASS** | All commands exact with expected output; `node` and `pnpm` only |
| §14 Acceptance Criteria | **PASS** | 10 binary observable items added |
| §15 Definition of Done | **PASS** | STATUS.md, DECISIONS.md, WORK_INDEX.md, EC_INDEX.md all present; scope boundary check in AC item 10 |
| §16 Code Style | **N/A** | No TypeScript or JavaScript produced; JSON entries are static data |
| §17 Vision Alignment | **N/A** | No active markup tokens added; no card JSON modified; no scoring/replay/identity/monetization surfaces. WP is invisible to end users. |
| §18 Prose-vs-Grep | **N/A** | No literal-string-scoped grep Verification Steps |
| §19 Bridge Staleness | **N/A** | No repo-state-summarizing artifact |
| §20 Funding Surface Gate | **N/A** | No UI surfaces; no user-visible copy; pure offline tooling documentation |
| §21 API Catalog Update | **N/A** | No HTTP endpoints; no `apps/server` library functions |

**Lint Gate Verdict: PASS**
