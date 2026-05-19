# EC-178 — Fix Registry Validator Image-URL Domain Check (Hero physicalCards) (Execution Checklist)

**Source:** Ad-hoc INFRA session (no WP) — pre-existing CI failure on
`main`. The "Validate Registry" job in workflow "CI → Build → Deploy"
has been crashing on every run for at least a week with
`TypeError: Cannot read properties of undefined (reading 'includes')`
at `packages/registry/scripts/validate.ts:297`. PR #94 (merged
2026-05-19) confirmed the failure predates it. Root cause: WP-151 /
EC-162 (commit `15861cd`, 2026-05-15) removed `imageUrl` from
`HeroCardSchema` — hero image URLs now live on
`hero.physicalCards[].imageUrl` (per D-15101) — but `validate.ts`'s
`checkImageUrlDomains` and `collectSpotCheckUrls` helpers were not
updated to follow the data move.
**Layer:** Registry tooling (script under `packages/registry/scripts/`)

**Execution Authority:**
This EC exists because the fix touches `packages/registry/scripts/validate.ts`
and the EC-mode commit hook (per `01.3-commit-hygiene-under-ec-mode.md`
Rule 5) requires an `EC-###:` prefix for any staged file under
`packages/`. An `INFRA:` commit cannot carry this change. Follows the
EC-110 / EC-166 / EC-177 ad-hoc precedent (no WP; only an `EC_INDEX.md`
row).

---

## Before Starting

- [ ] Commit `15861cd` ("EC-162: remove HeroCardSchema.imageUrl …") is in `git log`
- [ ] `HeroCardSchema` in `packages/registry/src/schema.ts` has no `imageUrl` field
- [ ] `PhysicalCardSchema` in `packages/registry/src/schema.ts` has `imageUrl: z.string().url()`
- [ ] `pnpm registry:validate` (with `SKIP_IMAGES=1`) reproduces the crash before the fix

---

## Locked Values (do not re-derive)

- **Data move (verbatim per D-15101 / EC-162):** hero image URLs come
  from `hero.physicalCards[].imageUrl`, not `hero.cards[].imageUrl`
  (the latter no longer exists).
- **Loop replacements (two sites in `validate.ts`):**
  - `checkImageUrlDomains` (≈ line 295–301): replace the inner
    `for (const card of hero.cards)` loop with
    `for (const physicalCard of hero.physicalCards)`, checking
    `physicalCard.imageUrl`.
  - `collectSpotCheckUrls` (≈ line 549–552): replace
    `setData.heroes[0]?.cards[0]?.imageUrl` with
    `setData.heroes[0]?.physicalCards[0]?.imageUrl`.
- **Required `// why:` comment text** for both replaced blocks cites
  D-15101 and EC-162 (the data-move authority).

---

## Guardrails

- Only `packages/registry/scripts/validate.ts` is modified
- No schema change (`packages/registry/src/schema.ts` untouched)
- No data-JSON change (`data/cards/**` untouched)
- No refactor of `validate.ts` beyond the two follow-the-data-move sites
- The mastermind / villain / scheme loops in `checkImageUrlDomains` are
  not touched (their `imageUrl` fields still exist on `MastermindCardSchema`,
  `VillainCardSchema`, and `SchemeSchema`)
- Commit prefix is `EC-178:` (Rule 5 — staged file under `packages/`)
- Do NOT bypass hooks with `--no-verify`

---

## Files to Produce

- `packages/registry/scripts/validate.ts` — **modified** —
  two sites: `checkImageUrlDomains` hero loop and
  `collectSpotCheckUrls` hero-card spot pick
- `docs/ai/execution-checklists/EC-178-fix-validate-image-url-domains-hero-physicalcards.checklist.md` — **new** — this file
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — register EC-178

## After Completing

- [ ] `SKIP_IMAGES=1 pnpm registry:validate` exits 0
- [ ] Validator's Phase 2 ("Per-Set Card JSON") completes without a `TypeError`
- [ ] `grep -n "hero.cards\[0\]\?.imageUrl\|for (const card of hero.cards)" packages/registry/scripts/validate.ts` — context-only check; no stray `card.imageUrl` reads remain on the hero loop path
- [ ] Commit subject starts with `EC-178:`
- [ ] EC_INDEX.md EC-178 row marked `Done <date>`
- [ ] On PR after push, `gh pr checks <PR#>` shows "Validate Registry" SUCCESS

## Common Failure Smells

- `COMMIT BLOCKED: Code changes detected but commit is not EC-scoped` →
  commit prefix is not `EC-178:`. Fix the message, do not bypass the hook.
- Validator still crashes at `checkImageUrlDomains` → the loop body
  still references `card.imageUrl` instead of `physicalCard.imageUrl`.
- Spot-check still skipped silently for hero images → `collectSpotCheckUrls`
  still reads from `heroes[0]?.cards[0]?.imageUrl` (undefined).
