# EC-194 — Fix YourVictoryPile `victoryVP` Prop Kebab↔Camel Mismatch (Execution Checklist)

**Source:** (no WP — ad-hoc INFRA defect fix; follows the EC-110 / EC-166 / EC-177 / EC-178 / EC-183 / EC-192 / EC-193 precedent)
**Layer:** Client (`apps/arena-client/src/components/play/YourVictoryPile.{vue,test.ts}`)

## Before Starting
- [x] Reproduce: live production at `play.legendary-arena.com` showed `Your Victory Pile — N cards / 0 VP` regardless of the actual final score. Verified against match `yQKzaxyZykU` 2026-05-23 via Claude in Chrome: Pinia store `players[0].victoryVP = 8` (engine projection correct, scoring correct), but the `[data-testid="play-your-victory-vp"]` span rendered `"0 VP"`. Forced runtime mutation `store.snapshot.players[0].victoryVP = 99` then `42` then `"MARKER_777"` left the DOM at `"0 VP"` while `victoryCards.length` reactivity worked normally — proving the disconnect is specific to this one prop binding, not a snapshot-replacement or reactivity issue.
- [x] Smoking gun: the leaked attribute `victory-vp="MARKER_777"` appeared on the rendered `<section>` element (Vue's `inheritAttrs: true` forwards unmatched bindings to the component root). The prop was never reaching the child.
- [x] Root cause: Vue's runtime `camelize("victory-vp") === "victoryVp"` (single cap after the hyphen), NOT `"victoryVP"`. The component declared `props: { victoryVP: { type: Number, default: 0 } }`. Vue matched the incoming kebab key against `victoryVp`, found no such prop, and silently fell back to `default: 0`. `victoryCards` is unaffected because `camelize("victory-cards") === "victoryCards"` matches the declared prop name exactly. This is a documented Vue antipattern — the official style guide recommends `videoSrc` over `videoSRC` for exactly this reason.
- [x] `pnpm -r build` exits 0; engine + arena-client tests green pre-change

## Locked Values (do not re-derive)
- Component prop name in `YourVictoryPile.vue` MUST be `victoryVp` (single capital `p`), NOT `victoryVP`
- Template reference in `YourVictoryPile.vue` MUST be `{{ victoryVp }}`, NOT `{{ victoryVP }}`
- Engine-layer field `UIPlayerState.victoryVP` (camelCase with consecutive capitals) STAYS as-is — that name mirrors `PlayerScoreBreakdown.totalVP` per D-12801 and is read directly via JS property access (no kebab round-trip) in `PlayDesktop.vue`, `PlayMobile.vue`, and `OpponentPanel.vue`. The kebab↔camel hazard only applies to the COMPONENT PROP, where the parent's `:victory-vp="..."` binding goes through Vue's runtime camelize.
- Parent bindings in `PlayDesktop.vue` and `PlayMobile.vue` STAY as `:victory-vp="viewer.victoryVP ?? 0"` — the kebab key is unchanged; only the *resolved* camelCase target on the child side changes (`victoryVP` → `victoryVp`), which is what Vue's `camelize` produces from `victory-vp`.

## Guardrails
- Do NOT touch `UIPlayerState.victoryVP` in `uiState.types.ts` or its projection in `uiState.build.ts` or filter in `uiState.filter.ts` — that's the engine contract, locked per D-12801
- Do NOT touch `OpponentPanel.vue` / `OpponentPanel.test.ts` — those access `player.victoryVP` as a JS property on the engine-typed `UIPlayerState`, not via Vue prop binding
- Do NOT change the parent binding form (`:victory-vp="..."`) — kebab is the project's Vue style convention; only the child prop name changes
- Do NOT introduce a new well-known constant or DECISIONS entry — this is a Vue-convention defect fix
- Scope is `YourVictoryPile.vue` + `YourVictoryPile.test.ts` only

## Required `// why:` Comments
- `YourVictoryPile.vue` prop declaration — multi-paragraph: (1) Vue's `camelize("victory-vp")` produces `victoryVp` not `victoryVP`, (2) the engine-layer `UIPlayerState.victoryVP` keeps the canonical `totalVP` casing per D-12801 — only the component prop name changes, (3) reference Vue style guide's `videoSrc` over `videoSRC` recommendation

## Files to Produce
- `apps/arena-client/src/components/play/YourVictoryPile.vue` — **modified** — rename prop `victoryVP` → `victoryVp` in `props: {...}`; update template `{{ victoryVP }}` → `{{ victoryVp }}`; add multi-paragraph `// why:` comment on the prop declaration
- `apps/arena-client/src/components/play/YourVictoryPile.test.ts` — **modified** — rename `victoryVP:` → `victoryVp:` in three prop-passing fixtures (lines 26, 35, 51)
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — add the EC-194 ad-hoc row (no `WORK_INDEX.md` row)

## After Completing
- [x] `pnpm --filter arena-client test` exits 0 (baseline 389 → 389, no test count change — same tests pass against renamed prop)
- [x] `pnpm --filter arena-client build` exits 0
- [ ] Commit prefix `EC-194:` for the staged files under `apps/arena-client/`; EC file + EC_INDEX row in a `SPEC:` governance commit
- [ ] Production verification via Claude in Chrome: after deploy, the live match's `[data-testid="play-your-victory-vp"]` DOM text matches `players[0].victoryVP` from the store (no more silent `0`)

## Common Failure Smells
- DOM still shows `0 VP` after deploy → prop rename didn't apply OR template still reads `{{ victoryVP }}` (old name)
- Test failure on `victoryVP` prop → forgot to rename in the test file's prop fixtures
- `<section>` root still carries `victory-vp="..."` as an attribute → prop binding still mismatched (Vue forwarded the unmatched attr); check that the child prop is `victoryVp` (single cap)
- TypeScript / vue-tsc error on `victoryVp` reference → template uses `{{ victoryVP }}` (old name) but prop is `victoryVp` (new name); both must match
