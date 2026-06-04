# EC-235 — KO Target Selection Prefers Starting SHIELD Cards (Execution Checklist)

**Source:** No Work Packet — free-standing hot-fix amending D-18503's
within-zone tie-break. Authority anchor is D-20602; landed by operator
direction after observing bot-driven matches at `play.legendary-arena.com`
KO recruited heroes instead of starter cards.
**Layer:** Game Engine

## Before Starting
- [x] Branch off `origin/main` (`claude/fix-ko-target-prefer-shield`)
- [x] D-20602 entry drafted in `docs/ai/DECISIONS.md`
- [x] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [x] `pnpm --filter @legendary-arena/game-engine test` exits 0

## Locked Values (do not re-derive)
- Starter ext_ids — closed enum: `starting-shield-agent`, `starting-shield-trooper` (imported as `SHIELD_AGENT_EXT_ID` and `SHIELD_TROOPER_EXT_ID` from `packages/game-engine/src/setup/buildInitialGameState.ts`)
- Within-zone tie-break: tier 1 starter ext_ids, then tier 2 non-starter non-wound ext_ids; each tier ordered ascending lex
- Zone priority: discard before hand (D-18503 — unchanged)
- Wound exclusion: `WOUND_EXT_ID` (`pile-wound`) never selected (D-18503 — unchanged)
- Single mutation site: `koOneHeroForPlayer` in `villainEffects.execute.ts` (D-18902 mutation-location lock — unchanged)

## Guardrails
- Closed-enum membership check only — NO runtime registry read, NO VP read (D-18503 carries forward)
- No new effect keywords, no new moves, no new contract files
- Four KO dispatch cases (`koHeroCurrentPlayer`, `koHeroEachPlayer`, `koHeroEachPlayerMag2`, and the shared resolver) inherit the new priority via the single shared helper — no per-dispatch divergence
- Existing tests using `core-hero-*` fixtures stay green because no starter ext_ids appear in those fixtures (starter tier empty → fall through to lex-asc tier)
- Determinism preserved: priority order is total over the closed starter enum, then deterministic lex-asc, so identical input G + identical hooks → identical KO target
- Branch is independent of `claude/ci-green-up-typecheck` and the two in-flight WP-207a/b sessions — no file overlap

## Required `// why:` Comments
- `selectKoHeroTarget`: explain two-tier rule + cite D-20602 + note the `core/...` vs `starting-shield-...` lex-pitfall the amendment closes
- `koOneHeroForPlayer`: update existing comment to cite D-20602 alongside D-18503; preserve D-18902 mutation-location lock note

## Files to Produce
- `packages/game-engine/src/villain/villainEffects.execute.ts` — **modified** — two-tier `selectKoHeroTarget` + starter ext_id imports + comment updates on `koOneHeroForPlayer` and `selectKoHeroTarget`
- `packages/game-engine/src/villain/villainEffects.execute.test.ts` — **modified** — 6 new tests in a new `describe('… starting-SHIELD KO priority (D-20602)')` block pinning: starting-first in discard, starting-first in hand (after wound-only discard fall-through), lex-asc fallback when no starter present, zone-priority preservation, `koHeroEachPlayer` inheritance via shared resolver, determinism across two runs
- `docs/ai/DECISIONS.md` — **modified** — D-20602 entry (status Active)
- `docs/ai/execution-checklists/EC-235-ko-target-shield-priority.checklist.md` — **new** — this file
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — one EC-235 index row

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (1048 → 1054 tests; +6 new under `starting-SHIELD KO priority (D-20602)`)
- [ ] `docs/ai/DECISIONS.md` D-20602 entry present and `Status: Active`
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-235 row appended
- [ ] No edits under `packages/registry`, `apps/server`, `apps/arena-client`, `apps/dashboard`, `apps/registry-viewer` (game-engine layer only)

## Common Failure Smells (Optional)
- Tests still pin "lex-smallest" wording in comments → the heuristic was reverted partially; check `selectKoHeroTarget` body for the two-tier scan
- A new test uses `core-hero-a` and expects it to be KO'd ahead of a starter → fixture was migrated wrong; starter should always win in same zone
- `koHeroEachPlayer` test KO list omits starter cards → caller of the shared resolver added its own selection logic; that's a D-18902 violation
- Build fails on circular import → `villainEffects.execute.ts` should import the starter ext_ids from `setup/buildInitialGameState.js` (matches the `WOUND_EXT_ID` pattern from `setup/pilesInit.js`)
