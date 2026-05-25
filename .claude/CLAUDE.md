# Legendary Arena

A pnpm monorepo implementing the Legendary deck-building card game as a multiplayer web app using boardgame.io.

## Quick Reference

- **Tech stack:** pnpm monorepo, boardgame.io ^0.50.0 (locked), TypeScript, Zod, PostgreSQL, Cloudflare R2
- **Test runner:** `node:test` (native Node.js test runner)
- **Test file extension:** `.test.ts` (never `.test.mjs`)
- **Module system:** ESM-only
- **Node version:** v22+ (uses built-in `fetch`)

## Key Commands

```bash
pnpm install          # install dependencies
pnpm -r build         # build all packages
pnpm test             # run all tests
```

## Session Start: Catch Up On `main`

When the user asks for substantive work in this repo, start with a
quick check of what's landed on `origin/main` since the last session
you worked in. Cheap:

```bash
git fetch origin main --prune
git log origin/main --oneline -10
```

Surface only what matters for the current ask:
- A WP that completed and changes the answer (e.g., user asks you
  to draft WP-X but WP-X already shipped)
- A contract, decision, or invariant the new work would touch
  (DECISIONS.md, ARCHITECTURE.md, `.claude/rules/**`, REFERENCE docs)
- Direct edits to the file(s) the user is asking you to modify
- A stash or open PR that overlaps with the request

If nothing relevant landed, say so in one line and move on. If
something did, one sentence per item — don't enumerate exhaustively.

This catches the "that already shipped while I was offline" class of
drift before it costs an unproductive draft cycle. Especially valuable
here because the WP/EC throughput is high — sessions can land a WP
every few hours.

## Architecture Rules (see .claude/rules/ and .claude/skills/ for details)

> Cross-cutting rules (architecture, code-style, work-packets) load every
> session from `.claude/rules/`. Layer-specific rules (game-engine,
> registry, persistence, server) load on-demand via
> `.claude/skills/legendary-*/SKILL.md` and retain full authority when
> triggered.

- Determinism is non-negotiable: all randomness via `ctx.random.*`, never `Math.random()`
- The engine owns truth: clients submit intents, not outcomes
- `G` is never persisted to a database
- Moves never throw; only `Game.setup()` may throw
- All zones store `CardExtId` strings only, never full card objects
- No `.reduce()` in zone operations or effect application
- Every `ctx.events.setPhase()` and `ctx.events.endTurn()` call needs a `// why:` comment

## External Data

- Card JSON data: `C:\Users\jjensen\bbcode\modern-master-strike\src\data\cards\` (40 sets)
- Card images hosted at: `https://images.legendary-arena.com/`
- Image URLs use hyphens, not underscores

## Documentation

- Architecture: `docs/ai/ARCHITECTURE.md` (authoritative — wins over work packets)
- Work packets: `docs/ai/work-packets/` (one per Claude session)
- Execution checklists: `docs/ai/execution-checklists/` (quick-reference per WP)
- Decisions log: `docs/ai/DECISIONS.md`

## Execution Checklists (Mandatory for Work Packet Execution)

For any Work Packet with a corresponding Execution Checklist
(`docs/ai/execution-checklists/EC-NNN-*.checklist.md`), the checklist is
the **authoritative execution contract**. Claude must read the EC before
starting the WP session. Compliance is binary — every checklist item must
be satisfied exactly.

The EC does not replace the Work Packet. The WP remains the authoritative
design document. If the EC and WP conflict, the WP wins. The EC extracts
the most drift-prone elements (locked values, guardrails, required comments)
into a quick-reference format that prevents re-derivation errors.

ECs are subordinate to `docs/ai/ARCHITECTURE.md` and `.claude/rules/*.md`.

The full EC workflow (read order, coding discipline, debugging, completion
rule) is defined in `docs/ai/REFERENCE/01.1-how-to-use-ecs-while-coding.md`.

**EC governance set:**
- `docs/ai/execution-checklists/EC-TEMPLATE.md` — structure and rules
- `docs/ai/execution-checklists/EC_INDEX.md` — index and status tracking
- `docs/ai/REFERENCE/01.1-how-to-use-ecs-while-coding.md` — usage workflow
- `docs/ai/REFERENCE/01.2-bug-handling-under-ec-mode.md` — clause-driven debugging
- `docs/ai/REFERENCE/01.3-commit-hygiene-under-ec-mode.md` — commit message format and hooks

## Lint Gate (Mandatory for Work Packet Actions)

Before performing **any** of the following actions, Claude MUST invoke and
satisfy the Prompt Lint Gate:

- Creating or modifying Work Packets
- Executing a Work Packet
- Migrating legacy prompts into governed artifacts
- Proposing cross-layer refactors that span multiple Work Packets

The Prompt Lint Gate is defined in:
`docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`

Claude must explicitly confirm that:
- All applicable lint checklist items are satisfied, **OR**
- Any unmet items are explicitly listed, justified, and approved before proceeding

If the lint gate cannot be satisfied, Claude must STOP. Do not work around the
checklist, guess, or silently proceed.

### File Modifications During Execution

Individual file modifications during Work Packet execution are governed by
`.claude/rules/*.md` (loaded automatically by Claude Code), not by the lint
checklist. The lint gate applies to **Work Packet quality**, not to every
individual file edit.

### Authority Constraints

The Prompt Lint Gate:
- Is subordinate to `docs/ai/ARCHITECTURE.md`
- Must not override architectural or layer-boundary rules
- Must not introduce new requirements independently

If a lint checklist item conflicts with ARCHITECTURE.md, Layer Boundary, or
`.claude/rules/*.md`, the higher-authority document wins and the checklist
item must be constrained or treated as non-applicable.
