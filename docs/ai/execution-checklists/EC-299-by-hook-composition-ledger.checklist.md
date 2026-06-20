# EC-299 — By-Hook Composition Ledger (Parser `resolvedMarkers`) (Execution Checklist)

**Source:** docs/ai/work-packets/WP-268-by-hook-composition-ledger.md
**Layer:** Game Engine (`rules/heroAbility.types.ts`, `setup/heroAbility.setup.ts`) + Lever-3 tooling (`scripts/hero-mechanic-ledger.mjs`, `docs/ai/coverage/**`).
**No `data/cards/**` change.** **No coverage-probe / interpreter / executor change.**
**Decision:** D-24045 (reserved at draft; landed at execution). Resolves the WP-267 / D-24044 by-name over-claim.

Authoritative execution contract for WP-268. Compliance is binary.

---

## Before Starting
- [ ] On `main`, clean, ff-synced (re-baseline to current `origin/main`; WP-269 landed via #412). `pnpm -r build` + `pnpm --filter @legendary-arena/game-engine test` + `pnpm ledger:heroes:check` + `pnpm sim:coverage --check` + `pnpm mechanics:metadata:check` all 0. (The last is WP-269's feed gate — this ledger is now its input; baseline-green confirms the starting point.)
- [ ] Read `setup/heroAbility.setup.ts`: the `parseAbilityText` locals + return shape (where `unresolvedMarkers` is declared/returned), the TWO composition-resolve branches (static `HERO_COMPOSITION_MARKERS[name]` push; parameterized `empowered` push), and the `buildHeroAbilityHooks` assembly (where `hook.unresolvedMarkers` is conditionally assigned).
- [ ] Read `scripts/hero-effect-coverage.mjs` — the per-hero `buildHeroAbilityHooks(registry, { heroDeckIds: [extId] })` + `deduplicateHooks` drive (the pattern the ledger mirrors).
- [ ] Read `scripts/hero-mechanic-ledger.mjs` `buildLedger` + `statusForMechanic` + `handlerForMechanic` (today by-name; becomes per-card for composition markers).
- [ ] Record the sentinel replay `finalStateHash` — MUST be unchanged (this WP touches no execution path).
- [ ] Note the committed ledger summary BEFORE (`executable`/`unsupported` counts) — the flip delta is a measured output.

---

## Locked Values
- **WP:** WP-268. **EC:** EC-299. **Decision:** D-24045, reserved.
- **`resolvedMarkers` (locked) — symmetric with `unresolvedMarkers`:** a `string[]` of the composition markers that RESOLVED on a hook. Declared in `parseAbilityText` (`const resolvedMarkers: string[] = [];`), added to the return shape + object, and `push(normalizedKeyword)` in BOTH composition-resolve branches: the parameterized `empowered` branch (on a built composition) AND the static `HERO_COMPOSITION_MARKERS` branch (on `composition !== undefined`). Assigned onto the hook in `buildHeroAbilityHooks` ONLY when non-empty: `if (parsedAbility.resolvedMarkers.length > 0) { hook.resolvedMarkers = parsedAbility.resolvedMarkers; }` (mirror the `unresolvedMarkers` assign verbatim; `exactOptionalPropertyTypes` — assign the field only when present).
- **NOT recorded in `resolvedMarkers`:** legacy `HeroKeyword`s (they are `hook.keywords`, not composition markers), deferred/unresolved markers (those go to `unresolvedMarkers`), icons, magnitudes. ONLY the two composition-resolve branches push.
- **Hook type (locked):** `resolvedMarkers?: string[]` on `HeroAbilityHook` (`rules/heroAbility.types.ts`), adjacent to `unresolvedMarkers`.
- **Ledger hook-building (locked):** in `buildLedger`, per hero `extId`, `const hooks = buildHeroAbilityHooks(registry, { heroDeckIds: [extId] });` (mirror the coverage probe — same partial config, no full `MatchSetupConfig`); aggregate `const cardResolvedMarkers = new Set();` over each `hook.resolvedMarkers ?? []`. Import `buildHeroAbilityHooks` from `'../packages/game-engine/dist/setup/heroAbility.setup.js'` (the path the coverage probe uses).
- **`statusForMechanic` (locked):** signature gains the per-card set; the composition-marker branch becomes `return cardResolvedMarkers.has(mechanic) ? 'executable' : 'unsupported';`. The `MVP_KEYWORDS` → executable, `KNOWN_KEYWORDS` → deferred, and unmarked branches are UNCHANGED. `handlerForMechanic` is unchanged (its `status !== 'executable'` guard returns `''` for a now-unsupported composition row).
- **Determinism (locked):** the regenerated ledger is byte-identical across two runs. `cardResolvedMarkers` is a membership Set (order-independent); hook building is registry-order (deterministic); the existing row sort is unchanged.
- **Coverage probe UNTOUCHED (locked):** `hero-effect-coverage.mjs` already classifies by hook (`primitiveEffects.length`) — `hero-effect-coverage.baseline.json` is expected UNCHANGED. If it changes, something leaked.
- **Commit message (execution):** `EC-299: by-hook composition ledger via parser resolvedMarkers (D-24045)`. (`EC-###:` prefix — code staged; the drafting commit is a separate `SPEC:`.)

---

## Guardrails
- **`resolvedMarkers` is parse-time provenance ONLY — it does NOT affect execution.** No `heroEffects.execute.ts` / `effectPrimitive.interpret.ts` change; `primitiveEffects` semantics + `finalStateHash` unchanged. (Highest-risk: do not let a tooling-honesty change leak into the engine's execution path.)
- **Push `resolvedMarkers` in EXACTLY the two existing composition-resolve branches** — same sites that push `primitiveEffects`. Do NOT push for legacy keywords, deferred markers, or anywhere else.
- **The ledger mirrors the coverage probe's hook-building** — `buildHeroAbilityHooks(registry, { heroDeckIds: [extId] })`; do not invent a new config surface or a full `MatchSetupConfig`.
- **Only the composition-marker classification branch changes** — `MVP_KEYWORDS`/`KNOWN_KEYWORDS`/`unmarked` are byte-identical behavior. A keyword mechanic's status MUST NOT move.
- **Coverage probe + its baseline UNCHANGED** — no `hero-effect-coverage.mjs` / `hero-effect-coverage.baseline.json` diff.
- **`data/cards/**` zero diff**; no barrel (`index.ts`) change (`buildHeroAbilityHooks` is already exported + dist-imported by the coverage probe); no dashboard-source change (the gitignored `apps/dashboard/src/data/*.json` copies regenerate on disk, untracked).
- **No `.reduce()` with branching; explicit `for...of`.** Full file contents. No `boardgame.io`/registry import added to the parser.
- **Byte-stable regen** — run `pnpm ledger:heroes` twice; the artifact must be identical.

---

## Required `// why:` Comments
- At `resolvedMarkers` (type + parse declaration): the positive symmetric record of `unresolvedMarkers` — the composition markers that RESOLVED on this hook; consumed by the mechanic ledger for by-hook (per-card) classification so `/coverage` By-card stops over-claiming deferred-variant cards (D-24045 / resolves D-24044).
- At each `resolvedMarkers.push` site: pushed only where a composition actually resolved (the same gate as the `primitiveEffects` push) — a deferred marker goes to `unresolvedMarkers` instead (Honest-Partial symmetry).
- At the ledger's per-hero hook build: mirrors the coverage probe's `buildHeroAbilityHooks(registry, { heroDeckIds: [extId] })`; aggregating `resolvedMarkers` per card makes composition-marker status by-hook, not by-name.
- At `statusForMechanic`'s composition branch: a composition marker is executable for THIS card only if its hook resolved it (D-24045) — a deferred variant is `unsupported`, matching the by-hook coverage probe + the runtime hollow detector.

---

## Files to Produce
- `packages/game-engine/src/rules/heroAbility.types.ts` — **modified** — `resolvedMarkers?: string[]` on `HeroAbilityHook`.
- `packages/game-engine/src/setup/heroAbility.setup.ts` — **modified** — declare/return `resolvedMarkers`; push in the two resolve branches; conditional-assign in `buildHeroAbilityHooks`.
- `packages/game-engine/src/rules/heroAbility.setup.test.ts` — **modified** — resolved (berserk + empowered core) / deferred (empowered variant) / non-composition coverage.
- `scripts/hero-mechanic-ledger.mjs` — **modified** — per-hero hook build + by-hook `statusForMechanic` for composition markers.
- `docs/ai/coverage/hero-mechanic-ledger.json` — **regenerated** (deferred-variant composition cards flip `executable → unsupported`).
- `docs/ai/coverage/hero-mechanic-ledger.csv` — **regenerated** (same flips; byte-stable).
- (NO coverage-probe / `hero-effect-coverage.baseline.json` / interpreter / executor / `index.ts` / dashboard-source / replay-hash files. **NO `data/metadata/card-mechanics.json`** — WP-269's feed; this WP only verifies it stays fresh, see After Completing.)
- Governance: `STATUS.md`, `DECISIONS.md` (D-24045), `WORK_INDEX.md` (WP-268 ✅), `EC_INDEX.md` (EC-299 Done), `05-ROADMAP-MINDMAP.md` (**update** the existing WP-268 node `📝 → ✅`, backfilled by #413 — do not add a second).

**6 implementation/artifact files + 5 governance** (the JSON + CSV are two files; `git diff` is file-based).

---

## After Completing
- [ ] `pnpm -r build` 0; `pnpm --filter @legendary-arena/game-engine test` 0 fail (resolvedMarkers parser tests pass).
- [ ] Parser: a resolved composition → `hook.resolvedMarkers` has the marker; a deferred empowered variant → `hook.resolvedMarkers` excludes it + `hook.unresolvedMarkers` includes it; a legacy keyword line → `resolvedMarkers` absent.
- [ ] `pnpm ledger:heroes` then `:check` OK; run twice → byte-identical. **Inspect the diff:** bkpt/wtif deferred `empowered` rows flip `executable → unsupported`; antm core-form `empowered` + all `berserk` rows stay `executable`; no keyword mechanic's status moves; record the executable-count delta (est. ~126 → ~122).
- [ ] `pnpm sim:coverage --check` OK and `git diff --name-only -- scripts/coverage/hero-effect-coverage.baseline.json scripts/hero-effect-coverage.mjs` empty (probe untouched).
- [ ] `pnpm mechanics:metadata:check` OK (WP-269's feed is status-independent — reads only `row.extId`+`row.mechanic`; a status-only ledger regen must not drift it); `git diff --name-only -- data/metadata/card-mechanics.json` empty (the feed is WP-269's artifact — a diff or red check = unexpected coupling, STOP).
- [ ] `git diff --name-only -- data/cards/ packages/game-engine/src/hero/ packages/game-engine/src/index.ts apps/` empty; sentinel `finalStateHash` unchanged.
- [ ] `git diff --name-only` = exactly the 11-path allowlist (6 implementation/artifact + 5 governance; gitignored dashboard `src/data/*.json` + `data/metadata/card-mechanics.json` absent).
- [ ] `docs/ai/DECISIONS.md` D-24045 → Active; STATUS records the WP-267 over-claim resolved + **D-24026 pending deploy verification**.
- [ ] `WORK_INDEX.md` WP-268 ✅; `EC_INDEX.md` EC-299 Done; `05-ROADMAP-MINDMAP.md` WP-268 node; `node scripts/roadmap-counts.mjs --check` 0.

---

## Common Failure Smells
- `heroEffects.execute.ts` / `effectPrimitive.interpret.ts` in the diff → `resolvedMarkers` leaked into the execution path; it is parse-time provenance only.
- A keyword mechanic's status changed → the `MVP_KEYWORDS`/`KNOWN_KEYWORDS` branches were touched; only the composition-marker branch becomes per-card.
- `hero-effect-coverage.baseline.json` in the diff → the coverage probe was already by-hook; if its numbers move, something unintended changed.
- `resolvedMarkers` pushed for a legacy keyword or a deferred marker → wrong; push ONLY in the two composition-resolve branches.
- The ledger regen is not byte-identical → a non-deterministic source (unordered iteration over a Map/object instead of the registry order, or a Set serialized in nondeterministic order); aggregate into a Set but emit via the existing sorted rows.
- A deferred empowered card still shows `executable` in the ledger → the ledger still classifies by-name (didn't build hooks / didn't read `resolvedMarkers`).
- `berserk` flipped to `unsupported` → the resolve branch for the static composition didn't push `resolvedMarkers` (berserk always resolves, so it must stay executable).
- `data/cards/**` or `index.ts` in the diff → re-marking or a barrel edit crept in; revert.
- `data/metadata/card-mechanics.json` in the diff, or `mechanics:metadata:check` goes red → unexpected coupling to WP-269's feed. The feed reads only `row.extId`+`row.mechanic` and drops `status`, so a status-only ledger regen must not move it. STOP and find what changed beyond status (a row added/removed, an extId/mechanic renamed); do not commit the feed.
