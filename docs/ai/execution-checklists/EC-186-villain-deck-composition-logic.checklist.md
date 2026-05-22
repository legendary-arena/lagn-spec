# EC-186 — Villain Deck Composition Logic (Execution Checklist)

**Source:** docs/ai/work-packets/WP-168-villain-deck-composition-logic.md
**Layer:** Game Engine (`packages/game-engine/src/villainDeck/villainDeck.setup.ts`)

## Before Starting
- [ ] WP-167 landed: `VillainCardSchema.copies`, `SchemeSchema.villainDeckTwistCount` / `villainDeckBystanderCount` exist; `core.json` populated.
- [ ] D-16801 + D-16802 present in DECISIONS.md, Accepted (status "effective on WP-168 execution") — verify present; this packet flips that status to effective, it does not re-record.
- [ ] `villainDeck.setup.ts` exports `buildVillainDeck`; `villainDeck.types.ts` `RevealedCardType` includes `'mastermind-strike'`.
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0

## Locked Values (do not re-derive)
- New constant: `MASTER_STRIKE_COUNT = 5` (standard Marvel Legendary core rule)
- **Index base for every `-{NN}` suffix: zero-based**, two-digit, zero-padded (`00`, `01`, …) via `String(index).padStart(2, '0')` from `index = 0` — matches the existing henchman/twist/bystander loops; villain copies and Master Strikes use the identical base.
- Master Strike ext_id: `master-strike-{NN}` (zero-based, `00`..`04`), type `'mastermind-strike'`
- Villain copy ext_id: `{setAbbr}-villain-{groupSlug}-{cardSlug}-{NN}` (zero-based, `00`..`copies-1`)
- Unchanged ext_ids: `scheme-twist-{schemeSlug}-{NN}`, `bystander-villain-deck-{NN}`
- Twist count = scheme `villainDeckTwistCount`, fallback `SCHEME_TWIST_COUNT = 8`
- Bystander count = scheme `villainDeckBystanderCount`, fallback `context.ctx.numPlayers`
- Villain `copies` absent ⇒ exactly 1 instance
- Golden (Midtown / 2 players): `scheme-twist`=8, `bystander`=12, `mastermind-strike`=5, `henchman`=10, `villain`=8 (4 × `copies:2`); deck total=43

## Guardrails
- Remove the non-tactic-mastermind-card branch — the mastermind card is NOT a villain-deck card (D-16801).
- Master Strikes are **generic** — no mastermind identity in the ext_id. Strike *effect resolution* is out of scope.
- Villain copies are distinct instances (suffixed ext_ids), never repeated identical keys (D-16802).
- Preserve the lexical pre-shuffle sort and the existing shuffle call — determinism is non-negotiable.
- All deck entries stay `CardExtId` strings; `JSON.stringify(state)` must succeed.
- Use `for` / `for...of` only — no `.reduce()` in deck assembly.
- The builder must not import `boardgame.io` or `@legendary-arena/registry`.
- Reuse `'mastermind-strike'` — do NOT add a `RevealedCardType` value (no drift-array change).

## Required `// why:` Comments
- Villain copy instancing: distinct ext_ids keep copies independently trackable for escapes/KOs and replay (D-16802, mirrors D-1410).
- `MASTER_STRIKE_COUNT = 5`: standard Legendary rule; cite D-16801.
- Scheme-count fallbacks: note the default applies only when the scheme omits the field. (Emitting a `G.messages` fallback note is deferred — the builder returns a pure result with no `G`; see WP-168 Out of Scope.)

## Files to Produce
- `packages/game-engine/src/villainDeck/villainDeck.setup.ts` — **modified** — copies instancing, scheme-driven counts, generic Master Strikes, remove mastermind-card branch
- `packages/game-engine/src/villainDeck/villainDeck.setup.test.ts` — **modified** — golden + fallback + determinism cases

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0
- [ ] Grep `villainDeck.setup.ts`: no `boardgame.io`, no `Math.random`, no `.reduce(`; `MASTER_STRIKE_COUNT` present
- [ ] No mastermind ext_id (`{setAbbr}-mastermind-...`) appears in the built deck (asserted by test)
- [ ] No files outside the WP `## Files Expected to Change` modified (`git diff --name-only`)
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` D-16801 + D-16802 status finalized to effective (status flip only — bodies already recorded/Accepted, not re-recorded)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` WP-168 checked off with date
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-186 marked Done

## Common Failure Smells (Optional)
- Deck total still ~24 → the scheme-count read or the copies loop fell back instead of reading WP-167 data.
- A lone `core-mastermind-magneto-magneto` entry in the deck → the old mastermind-card branch was not removed.
- Villain-copy or Master-Strike ext_ids starting at `01` instead of `00` → wrong index base; inconsistent with the henchman/twist/bystander instancing (replay-grammar drift).
- Replay/determinism test flips → the lexical sort or shuffle call was altered.
