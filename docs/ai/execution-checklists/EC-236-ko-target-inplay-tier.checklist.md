# EC-236 — KO Target Selection Adds `inPlay` as Third Zone Tier (Execution Checklist)

**Source:** No Work Packet — free-standing hot-fix following EC-235's
D-20602, addressing a production-observed gap where the auto-resolver
no-opped during the turn-1 spend phase. Authority anchor is D-20603.
**Layer:** Game Engine

## Before Starting
- [x] Branch off `origin/main`
- [x] D-20603 entry drafted in `docs/ai/DECISIONS.md`
- [x] EC-235 + D-20602 already landed (this EC builds on that resolver shape)
- [x] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [x] `pnpm --filter @legendary-arena/game-engine test` exits 0

## Locked Values (do not re-derive)
- Zone priority: **discard → hand → inPlay**
- Within each zone, the D-20602 two-tier rule applies: starter SHIELD ext_ids first (`starting-shield-agent`, `starting-shield-trooper`), then ext_id lex-asc among non-starter non-wound
- Wound exclusion: `WOUND_EXT_ID` (`pile-wound`) never selected — carries from D-18503
- Single mutation site: `koOneHeroForPlayer` in `villainEffects.execute.ts` (D-18902 mutation-location lock — unchanged)
- The inPlay branch fires **only** when both `selectKoHeroTarget(discard)` and `selectKoHeroTarget(hand)` returned `null`; existing zone priority is preserved byte-identical

## Guardrails
- Closed-enum membership check only — NO runtime registry read, NO VP read (D-18503 carries forward)
- No new effect keywords, no new moves, no new contract files
- All four KO dispatch cases (`koHeroCurrentPlayer`, `koHeroEachPlayer`, `koHeroEachPlayerMag2`, the shared resolver) inherit the new tier via the single shared helper — no per-dispatch divergence
- Existing tests with `inPlay: []` (every existing test in `villainEffects.execute.test.ts`) MUST stay byte-identical: the new tier only matters when both prior zones are empty AND inPlay has at least one non-wound non-starter or starter card
- Determinism preserved: the third tier follows the same closed-priority order, so identical input G → identical KO target
- Branch independent of `claude/ci-green-up-typecheck` and the in-flight WP-206 / WP-207a / WP-207b sessions — no file overlap

## Required `// why:` Comments
- `koOneHeroForPlayer`: cite D-20603 at the inPlay branch — explain the autoplay flow that produces the empty-discard/empty-hand state and why inPlay catches the starter cards
- `selectKoHeroTarget`: update the header to cite D-20603 alongside D-20602 + D-18503 (zone list now three tiers, not two)

## Files to Produce
- `packages/game-engine/src/villain/villainEffects.execute.ts` — **modified** — `koOneHeroForPlayer` gains the third `selectKoHeroTarget(zones.inPlay)` branch; comment updates citing D-20603
- `packages/game-engine/src/setup/henchmanFightKo.repro.test.ts` — **modified** (added in this EC's branch) — flips the "BUG REPRO" test into a positive `D-20603` assertion + adds two zone-priority pins
- `docs/ai/DECISIONS.md` — **modified** — D-20603 entry (Status Active)
- `docs/ai/execution-checklists/EC-236-ko-target-inplay-tier.checklist.md` — **new** — this file
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — one EC-236 row

## After Completing
- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0
- [ ] `pnpm --filter @legendary-arena/game-engine test` exits 0 (1054 → 1053 if the previous EC-235 baseline was 1054; my +3 inPlay tests minus the BUG REPRO test that flipped to a positive assertion lands at +2 net new — verify counts at close)
- [ ] `docs/ai/DECISIONS.md` D-20603 entry present and `Status: Active`
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` EC-236 row appended
- [ ] No edits under `packages/registry`, `apps/server`, `apps/arena-client`, `apps/dashboard`, `apps/registry-viewer` (game-engine layer only)

## Common Failure Smells (Optional)
- A test fails with "BUG: KO no-ops because resolver does not consider inPlay" → the previous BUG REPRO assertion wasn't updated; flip it to expect the KO fires
- A `koHeroEachPlayer` test newly fails with an extra KO from inPlay → check that the test fixture has `inPlay: []` (default) and isn't accidentally inheriting a populated inPlay from a shared helper
- A zone-priority test fires from inPlay when the discard had a hero → the new branch isn't gated on the hand branch returning `null`; restore the `return;` statement at the end of the hand branch
- Build fails with a missing import → `selectKoHeroTarget`, `moveCardFromZone`, `koCard` are all already imported by EC-235; no new imports needed
