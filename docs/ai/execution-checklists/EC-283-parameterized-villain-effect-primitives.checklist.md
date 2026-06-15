# EC-283 — Parameterized Villain Effect Primitives (Execution Checklist)

**Source:** docs/ai/work-packets/WP-252-parameterized-villain-effect-primitives.md
**Layer:** Game Engine / Contracts + Implementation (`packages/game-engine/src/{rules,villain,setup}/**`)
+ overlay tooling (`scripts/convert-cards/apply-effect-markers.mjs`). Reopens D-20201 / D-18901.
**No `data/cards/**` change** (parser translates legacy markers).

Authoritative execution contract for WP-252. Compliance is binary.

---

## Before Starting

- [ ] WP-251 merged (`HERO_EFFECT_HANDLERS` exists — the pattern to mirror).
- [ ] `pnpm --filter @legendary-arena/game-engine build` + `test` exit 0 on the base.
- [ ] Read `villainEffects.execute.ts` end-to-end; record each case body + the `koHeroEachPlayerMag2` literal-2 loop + the `koHeroCurrentPlayer` interactive park path + the `captureBystander` `onFight` gate.
- [ ] Read D-20201 + D-18901 in DECISIONS.md (the policies being reopened).

---

## Locked Values

- **WP:** WP-252. **EC:** EC-283. **Decision:** D-24023 (reserved); D-20201 + D-18901 reopened → Superseded.
- **Primitives (5, locked):** `ko-hero`, `gain-wound`, `capture-hq-hero`, `hero-deck-top-to-escape`, `capture-bystander` (canonical `VILLAIN_EFFECT_PRIMITIVES`).
- **Descriptor (locked):** `VillainEffectDescriptor { primitive: VillainEffectPrimitive; target?: 'current'|'each'; magnitude?: number; selector?: 'rightmost'|'highest-cost'|'lowest-cost' }`.
- **Frozen legacy translation table (locked — exactly these 10):**
  - `gainWoundEachPlayer` → `{gain-wound, target:each}` · `gainWoundCurrentPlayer` → `{gain-wound, target:current}`
  - `koHeroCurrentPlayer` → `{ko-hero, target:current}` (interactive park) · `koHeroEachPlayer` → `{ko-hero, target:each, magnitude:1}` · `koHeroEachPlayerMag2` → `{ko-hero, target:each, magnitude:2}`
  - `heroDeckTopToEscape` → `{hero-deck-top-to-escape}` · `captureBystander` → `{capture-bystander}`
  - `captureHqHeroRightmost|HighestCost|LowestCost` → `{capture-hq-hero, selector:rightmost|highest-cost|lowest-cost}`
- **Frozen, never extended:** `VILLAIN_EFFECT_KEYWORDS` stays at the 10 entries (translation input only; no append ever — D-20201/D-18901 retired).
- **Reverse-map (locked):** export `DESCRIPTOR_TO_LEGACY_VILLAIN_KEYWORD` (inverse table, total over the 10 legacy descriptors). The executor's applied-effects accumulator + `executeVillainAbilities`'s return **stay `VillainEffectKeyword[]`** — push the reverse-mapped keyword, never the descriptor — so `notableEvents`, `EFFECT_KEYWORD_LABELS`, the replay hash, and arena-client are byte-unchanged.
- **`keywords` vs `effects` (locked):** distinct arrays — `keywords: VillainEffectKeyword[]` (legacy, unchanged type) + `effects: VillainEffectDescriptor[]` (descriptors). The former shared-reference assignment in `buildVillainAbilityHooks` is split; rewrite its comment.
- **Behavior identity (locked):** each handler body = its current case body, verbatim, except the `ko-hero{each}` loop runs `magnitude ?? 1` times (was literal-2 for Mag2) and `ko-hero{current}` keeps the interactive park-choice path unchanged.
- **Parser (locked):** accepts legacy `[effect:<keyword>]` (translate via table) AND parameterized `[effect:<primitive>(:<target|selector>)?(:<magnitude>)?]`; both emit `VillainEffectDescriptor[]`.
- **Commit message:** `EC-283: parameterized villain effect primitives — collapse fragmented keywords (D-24023; reopens D-20201/D-18901)`. (`EC-###:` prefix — code staged.)

---

## Guardrails

- `data/cards/**` — **zero diff** (no re-marking; the parser translates legacy tokens).
- `VillainEffectKeyword` / `VILLAIN_EFFECT_KEYWORDS` — keep the 10 frozen entries; do NOT append, reorder, or delete (the existing append-only/parity drift tests stay green).
- `VILLAIN_EFFECT_HANDLERS` is a module-level runtime const — never assigned into `G`; `VillainEffectDescriptor` carries no functions (`G` stays JSON-serializable).
- No `.reduce()` in dispatch or handlers; no literal magnitude loop (use `descriptor.magnitude ?? 1`).
- Unknown primitive → warn to `G.messages` + continue, never throw.
- `koHeroCurrentPlayer`'s interactive pending-choice path and `captureBystander`'s `onFight` gate are preserved EXACTLY — the `target`/`selector` branch is the only new control flow.
- **`notableEvents.{types,compose}.ts`, `EFFECT_KEYWORD_LABELS`, `apps/arena-client/**`, and the sentinel `*.replay.json` fixture — zero diff.** The reverse-map keeps the applied-effects surface keyword-typed, so these compile + hash unchanged. If `tsc` wants you to touch them, the descriptor leaked past the executor — re-confine it (reverse-map at the accumulator); never `as any`, never widen the allowlist into notableEvents/arena-client.

---

## Required `// why:` Comments

- At `VILLAIN_EFFECT_KEYWORDS`: cite D-24023 — frozen/retired translation input, no further appends (D-20201/D-18901 reopened).
- At `LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR`: cite it is the migration seam keeping legacy card markers working unchanged.
- At `DESCRIPTOR_TO_LEGACY_VILLAIN_KEYWORD` + the executor accumulator push: cite the applied-effects surface stays keyword-typed so `notableEvents` + replay hash are byte-identical (the behavior-identity guarantee).
- At the split `keywords`/`effects` assignment in `buildVillainAbilityHooks`: cite they are now distinct arrays (was a shared reference).
- At the `ko-hero` handler `each` branch: cite the loop is `magnitude`-driven (generalizes the former literal-2 Mag2 loop); the `current` branch is the unchanged interactive park.
- At the parser dual-grammar site: cite legacy + parameterized both emit descriptors (D-24023 seam).
- At the primitive-drift + translation-parity tests: cite what each catches.

---

## Files to Produce

- `packages/game-engine/src/rules/villainAbility.types.ts` — **modified** — primitive union + `VILLAIN_EFFECT_PRIMITIVES` + `VillainEffectDescriptor` + frozen `LEGACY_VILLAIN_KEYWORD_TO_DESCRIPTOR` + inverse `DESCRIPTOR_TO_LEGACY_VILLAIN_KEYWORD`; `effects` retyped, `keywords` kept keyword-typed (distinct array).
- `packages/game-engine/src/villain/villainEffects.execute.ts` — **modified** — `VILLAIN_EFFECT_HANDLERS` map; `magnitude`-driven each-player KO.
- `packages/game-engine/src/setup/villainAbility.setup.ts` — **modified** — dual legacy+parameterized grammar → descriptors.
- `scripts/convert-cards/apply-effect-markers.mjs` — **modified** — accept parameterized tokens; primitives in the hand-synced list.
- `packages/game-engine/src/rules/villainAbility.types.test.ts` — **modified** — primitive drift + translation-parity.
- `packages/game-engine/src/villain/villainEffects.execute.test.ts` — **modified** — handler + legacy-equivalence (incl. Mag2 == magnitude-2).
- (NO notableEvents / arena-client / replay-hash files — the reverse-map keeps the applied-effects surface keyword-typed. If `tsc` demands one, STOP: the descriptor leaked; re-confine via the reverse-map.)
- Governance: `STATUS.md`, `DECISIONS.md` (D-24023 + reopen D-20201/D-18901), `WORK_INDEX.md` (WP-252 ✅), `EC_INDEX.md` (EC-283 Done), `05-ROADMAP-MINDMAP.md`.

---

## After Completing

- [ ] `pnpm --filter @legendary-arena/game-engine build` exits 0 (no notableEvents/arena-client edits needed — the reverse-map keeps the surface keyword-typed).
- [ ] `pnpm --filter @legendary-arena/game-engine test` — all pass / 0 fail; pre-existing villain assertions unmodified; translation-equivalence passes for all 10 legacy keywords.
- [ ] `Select-String -Path packages\game-engine\src\villain\villainEffects.execute.ts -Pattern "switch \(effect\)|switch \(.*[Kk]eyword\)|iteration < 2|i < 2"` → no output.
- [ ] `VILLAIN_EFFECT_PRIMITIVES` drift = 5; `VILLAIN_EFFECT_KEYWORDS` drift = 10 (unchanged); translation table maps all 10.
- [ ] Test: `[effect:koHeroEachPlayerMag2]` and `[effect:ko-hero:each:2]` parse to the same descriptor and both KO two heroes per player.
- [ ] `git diff --name-only -- data/cards/` → empty.
- [ ] `git diff --name-only -- packages/game-engine/src/events/ apps/arena-client/ packages/game-engine/src/test/fixtures/` → empty (notableEvents + arena-client + sentinel hash untouched).
- [ ] Reverse-map round-trip passes for all 10 legacy keywords; `keywords` and `effects` are distinct arrays; `executeVillainAbilities` still returns `VillainEffectKeyword[]`.
- [ ] `git diff --name-only` → only Files Expected to Change + governance.
- [ ] `node scripts/roadmap-counts.mjs --check` passes (WP-252 node present).

---

## Common Failure Smells

- A villain test needs editing to pass → behavior changed; the translation must be output-identical. The only intended change is Mag2's literal loop → `magnitude`.
- `data/cards/**` in the diff → re-marking crept in; this WP translates, it does not re-mark. Revert.
- `koHeroCurrentPlayer` lost its pending-choice / `captureBystander` lost its `onFight` gate → the `target`/`selector` branch over-merged distinct semantics. Restore.
- `VILLAIN_EFFECT_KEYWORDS` count changed → the legacy union must stay frozen at 10 (translation input).
- `notableEvents.{types,compose}.ts` or an arena-client file shows up in the diff → the descriptor leaked into the applied-effects surface; reverse-map it to a keyword at the executor accumulator (those surfaces stay keyword-typed). Never `as any`.
- The sentinel `*.replay.json` `finalStateHash` changed → the applied-effects narrative changed; the reverse-map must reproduce the exact legacy keyword per descriptor.
- A literal `2` loop remains → the each-player KO wasn't generalized to `magnitude`.

---

## Execution Amendment (2026-06-15, close)

**Hash-unchanged rationale, clarified.** The Guardrails + Common Failure Smells above attribute the unchanged sentinel `finalStateHash` to the reverse-map alone. The reverse-map is necessary (it keeps the applied-effects *narrative* — `notableEvents` / `EFFECT_KEYWORD_LABELS` / message-log — keyword-identical), but it is not the whole story: `villainAbilityHooks` is a field of `LegendaryGameState` and `hashGameState` serializes all of `G`, so retyping `hook.effects` to descriptor objects WOULD change the hash for any scenario whose hooks carry effects. The WP-158 sentinel is byte-unchanged because its replay harness runs with `EMPTY_REGISTRY` (`getSet: () => undefined`) → `buildVillainAbilityHooks` collects nothing → `villainAbilityHooks` is always `[]` (an empty array serializes identically as keywords or descriptors). The fixture is genuinely untouched (`git diff` empty). **Forward caveat:** a future fixture built against a real registry (non-empty hooks) WILL see a *representational* `finalStateHash` change from the hook-table retype — the message / outcome / within-run-determinism oracles stay identical, so re-baselining that fixture is the correct response, not a regression (see D-24023). This completes the EC's reasoning; it does not alter the verified outcome (zero fixture diff for the sentinel).

**Result:** all Acceptance Criteria + DoD satisfied. Engine `build` 0 + `test` **1323 → 1329 / 0** (+6 contract tests: primitive drift, translation totality, reverse-map round-trip ×10, injectivity, dual-grammar equivalence, parameterized-no-keyword); `pnpm sim:coverage --check` OK; no `switch(effect)` / literal-2 loop; `data/cards` / `events` / `arena-client` / `test/fixtures` zero diff. `git diff` = 3 core engine (types/executor/parser) + 7 test files + `scripts/convert-cards/apply-effect-markers.mjs` (validator widened, emitter untouched) + governance.

**Amendment A (2026-06-15, execution).** The Files-to-Produce list named 2 test files (`villainAbility.types.test.ts`, `villainEffects.execute.test.ts`), but retyping `VillainAbilityHook.effects` to descriptors mechanically broke hand-built hook fixtures in **5 more** test files — `setup/villainAbility.setup.test.ts` (the parser test; `.effects` keyword-assertions → `.keywords` + the same-array parity test rewritten distinct-but-parallel), `villainDeck/villainDeck.reveal.test.ts`, `economy/economy.integration.test.ts`, `board/boardKeywords.integration.test.ts`, and `setup/henchmanFightKo.repro.test.ts` (inline `effects: ['<keyword>']` fixtures → descriptor literals; real-registry `.effects` assertions → `.keywords`). All five are **pure fixture migrations with zero behavior change** (the EC's "every villain assertion passes" requirement necessitates them; the WP-248/249 Amendment-A class). The central `hook(...)` test helper now translates legacy keyword strings → descriptors, covering most of `villainEffects.execute.test.ts` in one edit. Close diff = 18 paths (3 core + 7 test + the marker script + 7 governance).
