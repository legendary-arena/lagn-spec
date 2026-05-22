# Session Prompt — Execute WP-169 (Scheme Villain-Deck Twist & Bystander Count Curation)

**FULL CONTENTS MODE**

You are operating inside the Legendary Arena AI coordination system. This is a
**fresh execution session** for WP-169. Read the WP and EC in full before any edit.

---

## What You Are Doing

Execute WP-169 to curate `scripts/convert-cards/inputs/scheme-deck-counts.json` so
the registry's per-scheme villain-deck counts match the **printed Setup text**, and
to fix two latent WP-167 pipeline gaps that block that curation. This is a
**data + build-pipeline** packet — **no schema change, no engine change, no `G`,
no moves/phases, no runtime wiring**.

After this session:
- Every scheme whose printed Setup names a single fixed twist count ≠ 8 carries
  that `villainDeckTwistCount`; every scheme naming an explicit villain-deck
  bystander count (incl. an explicit `0`) carries that `villainDeckBystanderCount`.
- `applySchemeDeckCounts` assigns each count independently (omitted ⇒ engine
  default; no `undefined` key); `apply-card-counts.mjs` applies the same overlay
  (with exact-slug loud-fail) to the 4 outlier sets.
- Player-count-dependent twist counts are **carved out** (not encoded), finalized
  in D-16804.
- All 40 `data/cards/*.json` are regenerated (scheme-count deltas only; idempotent).

---

## Authority Chain (Read in This Order)

1. `.claude/CLAUDE.md` — root coordination, EC-mode rules, lint gate, governance set
2. `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — Registry layer; the
   converter is build tooling that produces the data Registry validates
3. `.claude/rules/architecture.md` + `.claude/rules/code-style.md` — enforced invariants
4. `.claude/skills/legendary-registry/SKILL.md` — registry-layer enforcement
5. `docs/ai/work-packets/WP-169-scheme-villain-deck-count-curation.md` — **THE WORK PACKET**
6. `docs/ai/execution-checklists/EC-187-scheme-villain-deck-count-curation.checklist.md`
   — **THE EXECUTION CHECKLIST** (every item satisfied exactly)
7. `docs/ai/DECISIONS.md` — D-1411, D-1412 (fallbacks), D-16702/D-16703 (WP-167 field
   source), D-16803/D-16804 (this packet — land them; D-16804 carries the carve-out list)
8. `docs/ai/REFERENCE/00.2-data-requirements.md §1.5` — the two optional scheme fields
   (documented by WP-167; unaffected here)
9. `docs/ai/REFERENCE/00.6-code-style.md` — Rules 4, 6, 7, 11, 14

**Then read the actual source you will modify or reference:**

10. `scripts/convert-cards/convert-cards-v15.mjs` — **will modify** —
    `applySchemeDeckCounts` (~line 342) + its call site (~line 1558)
11. `scripts/convert-cards/apply-card-counts.mjs` — **will modify** — the loud-fail
    villain-counts / leads overlay pattern to mirror; confirm it has NO scheme-deck logic
12. `scripts/convert-cards/inputs/scheme-deck-counts.json` — **will modify** — current
    Midtown-only entry + `_note`
13. `data/cards/*.json` — **the source of the printed counts** — each scheme's
    `cards[].abilities[]` `"Setup: …"` line is the extraction source (reference only;
    regenerated, never hand-edited)
14. `packages/registry/src/schema.villainDeckComposition.test.ts` — reference only —
    the WP-167 sibling test (do NOT modify it; you add a NEW test file)

---

## Pre-Execution Checks

- [ ] WP-169 + EC-187 + D-16803/D-16804 merged to `main` (this drafting bundle).
- [ ] WP-167 complete on `main`: `SchemeSchema` has the two optional fields;
      `convert-cards-v15.mjs` has `applySchemeDeckCounts`; the Midtown entry exists.
- [ ] `apply-card-counts.mjs` confirmed to have NO scheme-deck-count logic yet
      (this packet adds it).
- [ ] `pnpm --filter @legendary-arena/registry build` exits 0
- [ ] `pnpm --filter @legendary-arena/registry test` exits 0 (note the baseline count)

---

## Execution Rules

1. **One Work Packet per session** — only WP-169.
2. **EC-187 is the execution contract** — every item satisfied exactly; if EC and WP
   conflict on design, **the WP wins**.
3. **ESM only**, `node:` prefix on built-ins, no `require()`. Test files `.test.ts`.
4. **No schema change** (`schema.ts` untouched) and **no engine change** — WP-168
   consumes these counts; this packet only supplies data + pipeline plumbing.
5. **Independent assignment**: assign each count only when present; never write an
   `undefined`-valued key. An omitted count keeps the engine default.
6. **Loud-fail in BOTH converters**: exact-slug match only; an unmatched slug **or**
   an entry carrying neither count throws a full-sentence error and exits non-zero,
   before that set's output is written. Never fuzzy-match; never silently skip.
7. **Mutation boundary**: mutate only the two count fields on the matched scheme, in
   place — never clone, reconstruct, or re-serialize the `scheme` object.
8. **Field placement**: append count field(s) after the scheme's existing keys (after
   `cards`, as WP-167 Midtown), `villainDeckTwistCount` before `villainDeckBystanderCount`.
9. **`data/cards/*.json` are generated** — edit the input/converter then regenerate;
   a second regen must produce zero diff (idempotent).
10. **01.5 NOT INVOKED** — no runtime-engine surface is wired; nothing in this packet
    touches `game.ts`, moves, phases, or `G`.
11. **SAFE-KNOBS: N/A** — this packet touches no tunable knob surface.

---

## Locked Values (Copy Verbatim — Do Not Re-derive)

- **Field names:** `villainDeckTwistCount`, `villainDeckBystanderCount`.
- **Engine fallbacks (do NOT encode when the printed value equals these):** twists
  `8` (D-1411); bystanders `numPlayers` (D-1412).
- **Input shape:** `{ setAbbr: { schemeSlug: { villainDeckTwistCount?, villainDeckBystanderCount? } } }`
  — at least one count present per entry (D-16803).
- **Keep existing:** `core.midtown-bank-robbery → { villainDeckTwistCount: 8, villainDeckBystanderCount: 12 }`.
- **Outlier sets (applied by `apply-card-counts.mjs`):** `2099`, `amwp`, `wpnx`, `wtif`.
- **Explicit-zero bystander:** `chmp.hypnotize-every-human → villainDeckBystanderCount: 0`.

---

## Files Expected to Change

- `scripts/convert-cards/convert-cards-v15.mjs` — **modified** — independent per-count
  assignment in `applySchemeDeckCounts`.
- `scripts/convert-cards/apply-card-counts.mjs` — **modified** — load + apply
  scheme-deck-counts for the 4 outlier sets (same loud-fail + validate-before-write).
- `scripts/convert-cards/inputs/scheme-deck-counts.json` — **modified** — curate flat
  twist + explicit bystander overrides (incl. zero); update `_note`.
- `data/cards/*.json` — **regenerated** — curated scheme counts only (all 40 files).
- `packages/registry/src/schema.schemeDeckCounts.test.ts` — **new** — `node:test`
  coverage.
- `docs/ai/DECISIONS.md` — **modified** — land D-16803, D-16804 (D-16804 carries the
  finalized carve-out list).
- `docs/ai/STATUS.md` / `WORK_INDEX.md` / `EC_INDEX.md` — **modified** — record + check off.

No other files may be modified. (Do NOT touch `villain-card-counts.json`, `leads.json`,
`schema.ts`, `00.2`, or `schema.villainDeckComposition.test.ts`.)

---

## Critical Implementation Notes

- **`applySchemeDeckCounts` rewrite:** today it assigns both counts unconditionally.
  Change it to assign each count only when present in the entry; throw on an entry
  carrying neither count. Keep the existing exact-slug throw + validate-before-write.
- **`apply-card-counts.mjs` overlay:** mirror the existing villain-counts / leads
  loud-fail pattern in that same file. It is the **only** producer for the 4 outlier
  sets, so without this their entries are silently ignored.
- **Twist disambiguation:** encode only when the number of twists *shuffled into the
  villain deck* is a single constant. Twists placed *outside* the deck ("N additional
  Twists next to this Scheme") are excluded from the count, **not** a carve-out trigger
  — encode only the in-deck constant (Killbots → 5). Carve out when the in-deck count
  itself is player-count-dependent, additive per player, or conditionally extended.
- **Census completeness:** triage every scheme into {default-8 (unencoded),
  flat-twist-encoded, bystander-encoded, carve-out}. Record the finalized carve-out
  list in D-16804. Absence from the file means "intentionally default or carve-out".
- **`_note` checklist:** must state (i) at-least-one-count (D-16803); (ii) omitted ⇒
  engine default; (iii) producer-per-set (`convert-cards-v15` = 36 npm sets,
  `apply-card-counts` = 4 outliers); (iv) counts from committed Setup text; (v)
  player-count-dependent twists carved out (D-16804).
- **Tests:** twist-only key-absent, explicit-zero bystander, outlier-set application,
  no-over-encoding of defaults, carve-out-not-encoded, 40-file `SetDataSchema`
  validation. `node:test`/`node:assert`; no `boardgame.io`/`@legendary-arena/game-engine` import.

---

## Verification After Execution

```pwsh
node scripts/convert-cards/convert-cards-v15.mjs
node scripts/convert-cards/apply-card-counts.mjs        # exits 0; loud-fails only on real mismatches
pnpm --filter @legendary-arena/registry test            # all passing, 0 failing
Select-String -Path "data\cards\core.json" -Pattern "villainDeckTwistCount"   # portals = 7, no bystander key
Select-String -Path "data\cards\chmp.json" -Pattern "villainDeckBystanderCount" # hypnotize = 0
Select-String -Path "data\cards\2099.json" -Pattern "villainDeckTwistCount"   # outlier-set counts present
node scripts/convert-cards/convert-cards-v15.mjs
node scripts/convert-cards/apply-card-counts.mjs
git diff --name-only -- data/cards/                     # empty (idempotent)
git diff --name-only                                    # only the allowlist
# Manual loud-fail probe: add a bogus slug + an empty entry under an outlier set, run apply-card-counts.mjs, confirm non-zero exit + full-sentence error, revert.
```

---

## Post-Execution Updates

- [ ] `docs/ai/DECISIONS.md` — D-16803, D-16804 flipped to Accepted; D-16804 carries
      the finalized carve-out scheme list.
- [ ] `docs/ai/STATUS.md` — scheme villain-deck counts curated across all 40 sets
      (player-count-dependent twists carved out).
- [ ] `docs/ai/work-packets/WORK_INDEX.md` — WP-169 checked off with date.
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` — EC-187 → Done.

---

## Post-Merge Close Ritual (REQUIRED)

After the operator merges the execution PR via the GitHub UI, the executing session
drives cleanup to silent state (mirrors 01.0b §11.4–11.7). Replace
`<execution-branch>` with this session's actual branch name:

```pwsh
node scripts/prune-empty-claude-branch.mjs --verify-current   # expect VERIFY PASS; FAIL STOPs the ritual
git branch -D claude/<execution-branch>                       # local
git push origin --delete claude/<execution-branch>            # remote
# from the canonical clone:
node scripts/prune-empty-claude-branch.mjs --report           # expect silent
```
