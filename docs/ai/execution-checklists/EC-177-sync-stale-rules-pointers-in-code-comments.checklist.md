# EC-177 — Sync Stale Rules-Path Pointers in Code Comments (Execution Checklist)

**Source:** Ad-hoc INFRA session (no WP) — surfaced as a follow-up to commit
`7c04e55` ("INFRA: move layer-specific rules to .claude/skills/ for on-demand
loading"), which renamed four `.claude/rules/<layer>.md` files into
`.claude/skills/<name>/SKILL.md` SKILL.md but left four in-code references
pointing at the old paths.
**Layer:** Cross-cutting (engine code comments + one SQL migration comment)

**Execution Authority:**
This EC exists because commit `7c04e55` was an `INFRA:` commit and the
EC-mode commit hook (per `01.3-commit-hygiene-under-ec-mode.md` Rule 5)
forbids `INFRA:` for staged files under `packages/`. The four code-comment
updates were reverted from that commit to clear the hook; this EC closes
the four stale pointers under a properly-scoped `EC-177:` commit.

---

## Before Starting

- [ ] Commit `7c04e55` is in `git log` on the working branch
- [ ] `.claude/skills/legendary-game-engine/SKILL.md` exists
- [ ] `.claude/skills/legendary-persistence/SKILL.md` exists
- [ ] The four target files still contain `.claude/rules/<layer>.md`
      pointers (see Files to Produce below)

---

## Locked Values (do not re-derive)

- **Path replacements (verbatim, four total):**
  - `.claude/rules/game-engine.md` → `.claude/skills/legendary-game-engine/SKILL.md`
  - `.claude/rules/persistence.md` → `.claude/skills/legendary-persistence/SKILL.md`
- **Sections cited in the comments do not change.** `§Throwing Convention`
  (game-engine) and `Class 2 Configuration` (persistence) still exist verbatim
  in the moved SKILL.md bodies — the move was byte-for-byte below the
  prepended frontmatter, so the section anchors are still valid.

---

## Guardrails

- Comment text outside the path string is preserved byte-for-byte
- No code (non-comment) is touched
- No new `// why:` comments added; no existing `// why:` comments removed
- No frontmatter, no JSDoc rewrap, no whitespace changes
- Commit prefix is `EC-177:` (Rule 5 — staged set includes `packages/`)
- Do NOT bypass hooks with `--no-verify`

---

## Files to Produce

- `packages/game-engine/src/game.ts` — **modified** — line ~228
  `// why:` block: replace `.claude/rules/game-engine.md` →
  `.claude/skills/legendary-game-engine/SKILL.md`
- `packages/game-engine/src/invariants/assertInvariant.ts` — **modified**
  — lines ~9 (JSDoc) and ~50 (`// why:`): same replacement, two sites
- `packages/game-engine/src/setup/buildHeroDeck.ts` — **modified** —
  line ~19 (JSDoc): same replacement
- `data/migrations/006_create_replay_blobs_table.sql` — **modified** —
  line ~31 (`-- why:`): replace `.claude/rules/persistence.md` →
  `.claude/skills/legendary-persistence/SKILL.md`
- `docs/ai/execution-checklists/EC-177-sync-stale-rules-pointers-in-code-comments.checklist.md` — **new** — this file
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — register EC-177

## After Completing

- [ ] `grep -rn "\.claude/rules/\(game-engine\|persistence\)\.md" packages/ data/migrations/` returns zero hits
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` baseline preserved
- [ ] Commit subject starts with `EC-177:`
- [ ] EC_INDEX.md EC-177 row marked `Done <date>`

## Common Failure Smells

- `COMMIT BLOCKED: Code changes detected but commit is not EC-scoped` →
  commit prefix is not `EC-177:`. Fix the message, do not bypass the hook.
- Grep finds stray hits in `.claude/skills/legendary-game-engine/SKILL.md`
  body → those are intentionally NOT in scope (the body was preserved
  byte-for-byte by commit `7c04e55`; cleaning internal cross-references
  in the moved skill body is a separate, optional follow-up).
