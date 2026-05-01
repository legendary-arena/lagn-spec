# WP-117 — Client Routing Strategy (Architecture)

**Status:** Ready for execution — decisions resolved 2026-04-30 (D-11701 = B, D-11702 = B, D-11703 = N/A, D-11704 = B); pre-flight 2026-04-30 surfaced 5 BLOCKING + 5 RECOMMENDED PS items, all 10 resolved in this same prep commit; the resolved file count is 5 governance-core files (no EC stub, no `package.json` edit, no rules update, no `vue-router` adoption); single `SPEC:` commit topology per D-10001 (no `apps/` / `packages/` / `data/` files staged → `.githooks/commit-msg` Rule 5 not triggered → no EC stub required).
**Primary Layer:** Governance / Policy (no runtime code; no npm dependency added under the resolved B/B/N-A/B path).
**Dependencies:** WP-061 (gameplay-client framework lock: Vue 3 + Vite + Pinia) — establishes the SPA stack on which this routing decision sits.

---

## Session Context

Both shipped Vue 3 SPAs use ad-hoc per-app view-state mechanisms with **no client router**, but the mechanisms are not uniform and they are not Pinia-driven:

- **`apps/arena-client/src/App.vue`** discriminates the active view via a `selectRoute(parseQuery(window.location.search))` helper at `App.vue:84`, returning one of `'profile' | 'fixture' | 'live' | 'lobby'`. Deep-linking via `?profile=` / `?fixture=` / `?match=` + `?player=` + `?credentials=` is shipped and load-bearing for WP-061 fixture replay and WP-102 public profile (`/?profile=alice`). The Pinia store `useUiStateStore` (`apps/arena-client/src/stores/uiState.ts`) holds the `UIState` projection snapshot only (per WP-061's locked one-state-field contract); it carries **no** view/tab/route state.
- **`apps/registry-viewer/src/App.vue`** discriminates the active view via a local `const activeView = ref<ActiveView>("cards")` at `App.vue:77`, switching across `'cards' | 'themes' | 'loadout'`. The WP-114 `setupUrlParams` query-string handling (shipped at `c059199`, closed at `8e67447`) carries the loadout-preview URL surface; the file-level `apps/registry-viewer/CLAUDE.md` summary explicitly states "No router — single-page with tab switching".

WP-114 (URL-parameterized loadout preview, **shipped 2026-04-30**) and WP-115 (public leaderboard endpoints, drafted at `bfdefe1` 2026-04-30) both exert pressure toward shareable URLs. This packet locks the routing posture for both apps before the next URL-bearing feature WP relitigates the choice — the lock is *"preserve the existing per-app surfaces; defer formal-router adoption to a future WP that has a concrete consumer"*. No engine touch, no `<router-view>` wiring, no engine state surface change.

---

## Goal

After this session, both Vue SPAs have a written, governance-anchored routing posture. Under the resolved B/B/N-A/B path:

- A new section `## Client Routing` exists in [docs/ai/ARCHITECTURE.md](../ARCHITECTURE.md) and [docs/02-ARCHITECTURE.md](../../02-ARCHITECTURE.md) stating, per app, that **no client router is adopted today**; the existing per-app view-state mechanisms are preserved verbatim (arena-client `selectRoute()` query-string discriminator; registry-viewer local `activeView` ref + WP-114 `setupUrlParams`).
- `docs/ai/DECISIONS.md` has four new entries: **D-11701** (`apps/arena-client` → no router; preserve `selectRoute()`), **D-11702** (`apps/registry-viewer` → no router; preserve `activeView` + WP-114 query params), **D-11703** marked **N/A in DECISIONS preamble** (no router adopted, history mode irrelevant), and **D-11704** (replay URL format → defer to whichever WP first exposes a replay UI).
- The architecture doc cross-link explicitly states "no client router today; per-app view-state preserved" so future WPs do not relitigate the choice without superseding D-11701 / D-11702 with a `DECISIONS.md` entry that names a concrete router-integration consumer.
- No `.claude/rules/architecture.md` change — `vue-router` is **not** added to allowed-imports for either app under the resolved path.

This WP commits the *decision* only; if a future WP supersedes D-11701 or D-11702 with Option A, that future WP owns the package.json edit, the rules update, the EC stub, and the `<router-view>` wiring under its own scope.

**No observable behavior change.** This packet does not introduce, remove, or modify runtime routing behavior in either SPA. Existing tab-switching and query-parameter handling remain unchanged. No `apps/`, `packages/`, or `data/` files are touched.

**The four decisions are logically independent.** Router adoption (D-11701, D-11702), history mode (D-11703), and shareable replay URL format (D-11704) are recorded as separate decisions to avoid implicit coupling. Choosing Option B for either app does not bind D-11703 or D-11704; the resolved path happens to take Option B for both apps, but a future WP could supersede D-11701 alone (adopting a router for the arena-client only) without re-opening D-11702.

---

## Vision Alignment

> Trigger surfaces from §17.1 (00.3 §17.1) evaluated:
> - Client routing itself is **not** a §17.1 surface. Routing mechanism, history mode, and per-app posture (D-11701..D-11703) carry no Vision §17 obligation.
> - Replay URL format (D-11704) is the only path that touches §17. Under the resolved D-11704 = B (defer), §17 is **Not triggered** in this WP.

**Resolved evaluation (D-11704 = B):** §17 **N/A**. This WP locks the routing *mechanism*, not any feature using it. Feature WPs (WP-102 public profile, WP-103 replay storage, WP-115 leaderboard) carry their own §17 obligations. The future WP that introduces a replay viewer (or extends WP-115 leaderboard score-detail to surface replay links) will lock the URL format under its own §17 evaluation per D-11704's deferral language.

**Conflict assertion:** No conflict — this WP records a "no router today; preserve existing per-app surfaces" posture; engine, replay-storage, and ranking layers are untouched.

**Non-Goal proximity:** N/A — no monetization or competitive surface touched. NG-1..NG-7 not crossed.

**Determinism preservation:** N/A — no engine / replay / RNG / PAR surface touched. The shipped per-app surfaces (arena-client `selectRoute()`, registry-viewer `setupUrlParams`) are deterministic by construction (pure URL-parsing helpers); preserving them changes nothing.

**§20 Funding Surface Gate:** N/A — this WP touches no funding affordances per WP-097 §A/§B/§C. Pure architectural mechanism, no user-visible copy referencing donations or tournament funding.

---

## Execution Checklist (EC)

**No EC is required for WP-117** under the resolved B/B/N-A/B path. No `EC-*-*.checklist.md` file is created; no `EC_INDEX.md` row is added. WP-117 is the sole authoritative execution contract. The single commit uses `SPEC:` prefix.

**Rationale:** WP-117 matches the D-10001 risk profile (binary-verifiable, no engine mutation, no persistence, no ordering surface). It modifies only `docs/**` — no files under `packages/`, `apps/`, or `data/` are staged, so the commit-msg hook (`.githooks/commit-msg` Rule 5) does not require an `EC-###:` prefix and the D-10001 Amendment 2026-04-26 stub-workaround does not apply. WP-117's commit uses `SPEC:` prefix, which Rule 5 permits when no code is staged.

**Citation:** `DECISIONS.md` D-10001 + Amendment 2026-04-26 (controlling precedent for no-EC governance WPs); WP-118 / WP-119 / WP-066 / WP-094 governance-WP no-EC precedents.

**Future-supersession note.** If a later WP supersedes D-11701 or D-11702 with Option A (adopt `vue-router`), that future WP owns the EC stub + `EC-NNN:` commit prefix per the D-10001 Amendment 2026-04-26 hook-integration carve-out. The next free EC slot at the time of writing this prep commit is **EC-121**; the actual slot is reassigned at the future WP's lint time per the EC-103 → EC-111 / EC-101 → EC-114 / EC-109 → EC-115 / EC-102 → EC-117 / EC-111 → EC-118 retarget precedent. This WP does not pre-allocate that slot.

---

## Assumes

- WP-061 complete: Vue 3 + Vite + Pinia locked for `apps/arena-client`.
- `apps/registry-viewer/package.json` exists and currently has no `vue-router` dependency (verified at HEAD `cf0d618`).
- `apps/arena-client/package.json` exists and currently has no `vue-router` dependency (verified at HEAD `cf0d618`).
- `apps/arena-client/src/App.vue` already discriminates view via a `selectRoute()` query-string helper at `App.vue:84` (route is one of `'profile' | 'fixture' | 'live' | 'lobby'`); `apps/arena-client/src/stores/uiState.ts` carries the Pinia `UIState` projection snapshot store (per WP-061 one-state-field contract) and **does not** carry view/tab state.
- `apps/registry-viewer/src/App.vue` carries view state in a local `const activeView = ref<ActiveView>("cards")` ref at `App.vue:77` plus the WP-114 `setupUrlParams` query-string handling for the loadout-preview surface.
- `docs/ai/DECISIONS.md` exists.

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §System Layers` — the Vue SPAs row; confirm exact app names and current capabilities.
- `docs/02-ARCHITECTURE.md` — Tech Stack at a Glance + Package Boundaries — note where the new section will land.
- `apps/arena-client/src/App.vue` and `apps/arena-client/src/stores/uiState.ts` — confirm current view-state mechanism.
- `apps/registry-viewer/src/App.vue` — confirm current tab-switching mechanism (Cards / Themes / Loadout per WP-114).
- `docs/ai/work-packets/WP-114-registry-viewer-url-parameterized-setup-preview.md` — read to understand what WP-114 does with URL params *without* a router; the routing decision must not invalidate WP-114's shipped query-param approach.
- `docs/ai/work-packets/WP-115-public-leaderboard-http-endpoints.md` — read to understand whether WP-115 expects client-side leaderboard pages with deep links.
- `.claude/rules/architecture.md` — find the import-rules table; this is what gets updated if `vue-router` is allowed.
- `docs/ai/REFERENCE/00.6-code-style.md` — applies to any prose written into the architecture doc.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`
- Full file contents for every new or modified file — no diffs, no snippets

**Packet-specific:**
- **No route-table wiring.** This WP commits the decision and (if applicable) installs the package; actual `<router-view>` integration is a separate implementation WP.
- **No deletion of existing URL-param handling.** WP-114's `setupUrlParams.ts` (already landed per commit `c059199`) must remain functional — the router decision does not retroactively rewrite that surface.
- **WP-114 query-parameter contract is preserved verbatim.** If D-11702 = A (registry-viewer adopts vue-router), router query handling MUST round-trip the same `window.location.search` contract WP-114 ships today: identical key names, identical value encoding, identical empty-vs-missing semantics. No renaming, normalization, aliasing, or "helpful" key transformation is permitted under this WP or any follow-up implementation WP. Migration of WP-114's parser to consume `route.query` is allowed only if it produces byte-equivalent output for every existing URL.
- **One decision per app.** The decision for `apps/arena-client` and the decision for `apps/registry-viewer` may differ; both must be stated explicitly.
- **If `vue-router` is adopted:** version is locked at draft time, history mode (`createWebHistory` vs `createWebHashHistory`) is committed, the dependency is added in `dependencies` (not `devDependencies`).
- **If no router:** the architecture doc explicitly states "no client router; tab state in Pinia" with the reasoning so future WPs do not relitigate.

**Session protocol:**
- If any `[DECISION REQUIRED]` block cannot be resolved, STOP and ask. (All four decisions are resolved in this prep commit per `## Decision Points` below — D-11701 = B, D-11702 = B, D-11703 = N/A, D-11704 = B.)
- **Unrelated untracked files (per pre-flight 2026-04-30 PS-8, mirroring WP-030 / D-3001 / WP-118 §5.2 mystery-untracked-file precedent):** the execution session may observe unrelated uncommitted / untracked files in `git status` (e.g., a residual EC-119 checklist from prior WP-115 stub work, future arch-inventory regenerations under `docs/ai/audits/`). These are out of WP-117 scope. Do not stage, modify, or comment on them. Stage by exact filename only — never `git add .` / `-A` / `-u`. The WP-117 close-out commit must contain only the resolved-allowlist file diffs and nothing else.

**Locked contract values:**
- N/A for this WP — no engine constants touched.

**Forbidden packages (per `00.3 §7`):**
- No alternative routers (`@vaadin/router`, `vue-class-component` routing helpers, etc.) — if a router is adopted, it is `vue-router` v4.x.

---

## Decision Points (Resolved 2026-04-30 per pre-flight PS-4)

All four decisions resolved before lint-gate self-review per the WP's own header gate. Each entry below records the chosen option, one-line rationale, and the rejected options. The corresponding `DECISIONS.md` entries (D-11701, D-11702, D-11703 N/A preamble, D-11704) are appended at execution time per `## Definition of Done`.

### D-11701 — `apps/arena-client` router posture → **Option B (no router; preserve `selectRoute()`)**

No `vue-router` adopted; preserve the current `selectRoute()` query-string discriminator in `apps/arena-client/src/App.vue:84` verbatim. The shipped deep-linking surface (`?profile=` / `?fixture=` / `?match=` + `?player=` + `?credentials=`) continues to function unchanged. `<router-view>` is **not** introduced; `useUiStateStore` continues to hold the `UIState` projection snapshot only (no Pinia view/tab state added).

- *Rationale:* The shipped `selectRoute()` helper is a 28-line pure URL-parsing function that already carries the project's only deep-linking surface (WP-061 fixture replay; WP-102 public profile). It was added intentionally under prior WPs and is grep-discoverable, deterministic, and side-effect-free. Adopting `vue-router` would introduce a ~13 KB gzip dependency without a concrete consumer beyond what the existing helper handles, plus a layer of `<router-view>` indirection that's specifically called out as out-of-scope for WP-117. The current state is "no router today; future WP-NNN may adopt one with a named consumer" — this decision codifies that posture rather than relitigating it on every URL-bearing feature WP.
- *De-facto Option C note (per pre-flight PS-10):* the existing `selectRoute()` is structurally similar to what Option C describes (a lightweight in-house route discriminator). Option B as resolved here is **not** a formal Option C selection — it is preservation of an existing helper that pre-dates this WP's option taxonomy. A future WP that supersedes D-11701 with formal Option A (adopt `vue-router`) treats the existing `selectRoute()` as the migration starting point, not as a "to-be-replaced legacy" scaffolding.
- *Rejected:*
  - **Option A (adopt `vue-router@4.x`):** would unblock formal route guards / `<router-view>` slot / browser-history integration, but no current consumer demands them. The deferral cost is mechanically inert (a future WP can adopt with a one-line dependency add, an EC stub, and `<router-view>` wiring). Reversing the choice is cheap; introducing the dependency without a consumer is the lifecycle-creep failure mode (#16) the copilot-check lens is designed to prevent.
  - **Option C (formalize as in-house router with extraordinary justification):** the WP body explicitly flags Option C as bikeshed bait. The existing `selectRoute()` does not need formal Option C blessing; it is preserved as part of `App.vue`'s view-discriminator surface, not promoted to a router abstraction.

### D-11702 — `apps/registry-viewer` router posture → **Option B (no router; preserve current state)**

No `vue-router` adopted. Preserve the local `const activeView = ref<ActiveView>("cards")` at `apps/registry-viewer/src/App.vue:77` plus the WP-114 `setupUrlParams` query-string handling for the loadout-preview surface (`apps/registry-viewer/src/lib/setupUrlParams.ts`, `apps/registry-viewer/src/composables/useSetupFromUrl.ts`, `apps/registry-viewer/src/components/LoadoutPreview.vue` — all shipped at `c059199`, closed at `8e67447`). The file-level `apps/registry-viewer/CLAUDE.md` "No router — single-page with tab switching" documentation continues to be accurate.

- *Rationale:* Registry-viewer is public-facing (`cards.barefootbetters.com`) and Option A would unblock proper SEO + per-card deep links, but those concerns have not surfaced as concrete consumer demands and the WP-114 query-param surface already proves that Option B can carry deep-link weight for the curated-loadout surface. The cost of switching to Option A is non-zero (lockfile churn, EC stub, rules update, follow-up `<router-view>` wiring WP) and would be premature absent a named consumer beyond "SEO eventually". The deferral is reversible by a future WP that supersedes D-11702 with Option A and names the consumer.
- *Rejected:*
  - **Option A (adopt `vue-router@4.x`):** premature without a concrete consumer; the WP-114 query-param surface already serves the only shipped deep-link demand on this app.
  - **Option C (in-house router with extraordinary justification):** the registry-viewer's `activeView` ref is a single-line tab switcher, not a router. Promoting it to formal Option C is unjustified.

### D-11703 — History mode → **N/A (no router adopted in either app)**

D-11703 is conditional on D-11701 = A or D-11702 = A. Both resolved to Option B; D-11703 is therefore **N/A**. No `DECISIONS.md` entry is created for D-11703 in this WP. A future WP that supersedes D-11701 or D-11702 with Option A owns the D-11703 decision under its own scope (with full rationale + rejected options).

The N/A status is recorded in the `DECISIONS.md` preamble at WP-117 execution close so future grep-by-decision-ID queries find an explicit "N/A — see WP-117" hit rather than a missing entry.

### D-11704 — Shareable replay URL format → **Option B (defer)**

No replay URL format is locked in this WP. Format is deferred to whichever WP first exposes a replay UI surface (likely candidate: a future `WP-NNN: Replay Viewer`, or an extension to WP-115's leaderboard `GET /api/leaderboards/scores/:replayHash` endpoint when its client-side rendering lands per pre-flight PS-9 forward-link). When that WP lands, it owns the D-11704 supersession with full §17 Vision Alignment treatment (Vision §18 / §22 / §24 trigger surfaces) under its own scope.

- *Rationale:* No replay UI is shipped today; locking the URL format absent a concrete consumer is exactly the kind of "decide before code exists" trap the WP would otherwise create. The WP-115 stub (`bfdefe1` 2026-04-30) names `:replayHash` as the canonical replay identity in HTTP path-param spelling, matching `00.2-data-requirements.md` — that spelling is the natural starting point for the future format lock, but locking it now without a UI consumer would foreclose future format choices (e.g., short-IDs, signed-URL variants) without justification.
- *Rejected:*
  - **Option A (lock format now):** triggers §17 Vision Alignment in this WP for a contract surface no consumer needs today. The cost is unbounded — any future replay-viewer WP would have to either accept the format or supersede D-11704, and the supersession path is identical to the deferral path with one fewer hop.

**File-allowlist consequence (per pre-flight PS-7 recount):** D-11701/02 = B/B and D-11703 = N/A and D-11704 = B ⇒ resolved file count is **5** (governance-core only; no package.json edit, no lockfile regen, no rules update, no EC stub, no EC_INDEX row). The executing session must verify `git diff --name-only` matches all 5 files exactly; any other file modified is a scope violation.

---

## Scope (In)

### A) Architecture-doc additions
- **`docs/ai/ARCHITECTURE.md`** — modified: add `## Client Routing` section stating per-app posture (no router; preserve `selectRoute()` for arena-client; preserve `activeView` + WP-114 query-params for registry-viewer) and a one-line policy on the deferred replay URL format (D-11704 = B).
- **`docs/02-ARCHITECTURE.md`** — modified: mirror section. The `Tech Stack at a Glance` table gets a "Client routing" row stating "no client router today; per-app view-state preserved per D-11701 / D-11702".

### B) DECISIONS entries
- **`docs/ai/DECISIONS.md`** — modified: append D-11701 (arena-client → no router; preserve `selectRoute()`), D-11702 (registry-viewer → no router; preserve `activeView` + WP-114 query params), D-11704 (replay URL format → defer). D-11703 is recorded as **N/A in the DECISIONS preamble** (one-line marker, no full entry — see `## Decision Points` D-11703 above for rationale).

### C) STATUS + WORK_INDEX
- **`docs/ai/STATUS.md`** — modified: one-line capability statement.
- **`docs/ai/work-packets/WORK_INDEX.md`** — modified: check WP-117 off.

**Total: 5 files** (governance-only; no `apps/`, `packages/`, `data/`, lockfile, or `.claude/rules/` files staged).

---

## Out of Scope

- **No `vue-router` adoption.** D-11701 = B and D-11702 = B; the dependency is **not** added to either app's `package.json` under this WP. A future WP that supersedes either decision with Option A owns the package.json edit, the lockfile regen, the rules update, and the EC stub.
- **No `<router-view>` wiring.** Actual integration into either `App.vue` is deferred (would be a separate implementation WP that supersedes D-11701 or D-11702 with Option A).
- **No `.claude/rules/architecture.md` change.** Under the resolved B/B path, `vue-router` is not added to allowed-imports for either app.
- **No EC file or EC_INDEX row.** Under the no-EC path (D-10001 + 2026-04-26 Amendment), no `EC-*-client-routing-strategy.checklist.md` is created.
- **No modification of `apps/arena-client/src/App.vue` or `apps/arena-client/src/stores/uiState.ts`.** The existing `selectRoute()` discriminator and the existing `useUiStateStore` (per WP-061's one-state-field contract) stay byte-for-byte unchanged.
- **No modification of `apps/registry-viewer/src/App.vue` or any WP-114 file (`apps/registry-viewer/src/lib/setupUrlParams.ts`, `apps/registry-viewer/src/composables/useSetupFromUrl.ts`, `apps/registry-viewer/src/components/LoadoutPreview.vue`).** WP-114 contract is preserved verbatim per the Non-Negotiable Constraints "WP-114 query-parameter contract is preserved verbatim" line.
- **No route guards / per-route auth.** Auth is governed by WP-099 / WP-112; routing posture does not amend the auth model.
- **No SSR.** Vue SPAs remain client-rendered.
- **No Vue 2 / Nuxt / other framework consideration.** Stack is locked at WP-061.
- **No CDN / static-host configuration changes.**
- **No replay URL format lock.** D-11704 = B (defer); the future WP that introduces a replay viewer (or extends WP-115 leaderboard `GET /api/leaderboards/scores/:replayHash` to surface client-side replay links) owns the format lock.

**Session protocol — unrelated untracked files (per pre-flight 2026-04-30 PS-8, mirroring WP-030 / D-3001 / WP-118 §5.2 mystery-untracked-file precedent):** the execution session may observe unrelated untracked files in `git status` (e.g., a residual EC-119 checklist from WP-115 stub work, future arch-inventory regenerations under `docs/ai/audits/`). These are out of WP-117 scope. Do not stage, modify, or comment on them. Stage by exact filename only — never `git add .` / `-A` / `-u`. The WP-117 close-out commit must contain only the resolved-allowlist file diffs and nothing else.

---

## Files Expected to Change

Resolved file count: **5** (per `## Decision Points` D-11701/02 = B/B and D-11703 = N/A and D-11704 = B). Verification Step 5 must compare `git diff --name-only` against this exact list:

1. `docs/ai/ARCHITECTURE.md` — **modified** — add `## Client Routing` section (no router today; per-app surfaces preserved verbatim; D-11704 deferral noted).
2. `docs/02-ARCHITECTURE.md` — **modified** — mirror section + add a "Client routing" row to the `Tech Stack at a Glance` table noting "no client router today; per-app view-state preserved per D-11701 / D-11702".
3. `docs/ai/DECISIONS.md` — **modified** — append D-11701, D-11702, D-11704 entries (with chosen options + rationale matching `## Decision Points`); record D-11703 as N/A in the DECISIONS preamble (one-line marker — see D-11703 entry in `## Decision Points` for rationale).
4. `docs/ai/STATUS.md` — **modified** — capability line for the routing posture.
5. `docs/ai/work-packets/WORK_INDEX.md` — **modified** — flip WP-117 row `[ ]` → `[x]` with date.

5 files is **at** the `~8 files` soft cap per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §5` (line 126). No conditional additions are in scope under the resolved B/B/N-A/B path.

**Future-supersession note.** If a later WP supersedes D-11701 or D-11702 with Option A (adopt `vue-router`), that future WP carries its own scope: package.json edit + lockfile regen + `.claude/rules/architecture.md` allowed-imports update + retargeted EC stub at the next free slot (EC-121 as of 2026-04-30) + EC_INDEX row + `<router-view>` wiring. None of those files are in this WP's scope.

---

## Acceptance Criteria

### Architecture doc
- [ ] `docs/ai/ARCHITECTURE.md` contains a `## Client Routing` section
- [ ] The section states D-11701 explicitly: "no router today; preserve `selectRoute()` query-string discriminator at `apps/arena-client/src/App.vue:84`"
- [ ] The section states D-11702 explicitly: "no router today; preserve local `activeView` ref at `apps/registry-viewer/src/App.vue:77` + WP-114 `setupUrlParams` query-string handling"
- [ ] The section explicitly notes that D-11703 is N/A under the resolved path
- [ ] The section explicitly notes that D-11704 is deferred to a future replay-viewer / WP-115-extension WP
- [ ] `docs/02-ARCHITECTURE.md` mirrors with a one-line "Client routing" row in `Tech Stack at a Glance`

### DECISIONS
- [ ] D-11701 (arena-client → Option B; preserve `selectRoute()`) entry exists with chosen option + rationale + de-facto Option C note + rejected options
- [ ] D-11702 (registry-viewer → Option B; preserve `activeView` + WP-114 query params) entry exists with chosen option + rationale + rejected options
- [ ] D-11703 (history mode) recorded as **N/A** in DECISIONS preamble (one-line marker — no full entry)
- [ ] D-11704 (replay URL format → Option B; defer) entry exists with chosen option + rationale + rejected options + forward-link to the future replay-viewer / WP-115-extension WP

### Hygiene
- [ ] STATUS + WORK_INDEX updated
- [ ] No files outside the 5-file `## Files Expected to Change` list modified
- [ ] `git diff --name-only -- 'apps/**' 'packages/**' 'data/**'` returns no output (no code touched)
- [ ] Commit prefix is `SPEC:` (governance-only path; D-10001 + 2026-04-26 Amendment apply)
- [ ] Inherited untracked items (e.g., residual EC-119 checklist, future arch-inventory regenerations) are not staged in the WP-117 commit

---

## Verification Steps

```pwsh
# Step 1 — confirm architecture section exists
Select-String -Path "docs\ai\ARCHITECTURE.md" -Pattern "^## Client Routing"
# Expected: one match

# Step 2 — per-app posture cited in the new section
Select-String -Path "docs\ai\ARCHITECTURE.md" -Pattern "arena-client|registry-viewer|selectRoute|activeView" -Context 0,2
# Expected: matches inside the new section (visual inspection); each app named explicitly

# Step 3 — DECISIONS entries
Select-String -Path "docs\ai\DECISIONS.md" -Pattern "^### D-1170[124]|^## D-1170[124]"
# Expected: 3 matches — D-11701 (arena-client posture), D-11702 (registry-viewer posture), D-11704 (replay URL format)
# why: regex covers both `### D-NNNNN` and `## D-NNNNN` header forms (DECISIONS.md uses both — D-5201 is `###`, D-9905 is `##`).
# why: D-11703 is recorded as N/A in the DECISIONS preamble (one-line marker), not as a full entry — verify by inspection separately.

# Step 4 — D-11703 N/A preamble marker
Select-String -Path "docs\ai\DECISIONS.md" -Pattern "D-11703.*N/A|D-11703.*not adopted"
# Expected: at least one match (the N/A preamble line)

# Step 5 — scope check
git diff --name-only
# Expected: exactly these 5 files (per `## Decision Points` resolved B/B/N-A/B):
#   docs/ai/ARCHITECTURE.md
#   docs/02-ARCHITECTURE.md
#   docs/ai/DECISIONS.md
#   docs/ai/STATUS.md
#   docs/ai/work-packets/WORK_INDEX.md
# Any other path → STOP, scope violation, abort and investigate.

# Step 6 — no code touched
git diff --name-only -- "apps/**" "packages/**" "data/**"
# Expected: no output

# Step 7 — full test suite (no behavior changes)
pnpm -r test
# Expected: exits 0; baseline counts unchanged across all 8 workspaces

# Step 8 — full build (no broken deps; vacuous under no-package.json-change path)
pnpm -r build
# Expected: exits 0

# Step 9 — architecture-inventory cross-check (advisory)
# Confirms the no-router posture lands in the deterministic dependency snapshot.
pnpm arch:inventory:save
Select-String -Path "docs\ai\audits\architecture-inventory-latest.md" -Pattern "vue-router"
# Expected: no match in the `### Framework — client` table; `vue-router` stays under "Other candidates ... not currently installed". Advisory step — not a gate.
```

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] All `[DECISION REQUIRED]` blocks resolved (D-11701 = B, D-11702 = B, D-11703 = N/A, D-11704 = B per `## Decision Points`)
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm -r test` exits 0 (baseline counts unchanged)
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated with D-11701, D-11702, D-11704 entries + D-11703 N/A preamble marker
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-117 checked off with date
- [ ] No files outside the 5-file `## Files Expected to Change` list were modified
- [ ] Lint-gate self-review passes — §17 N/A under the resolved D-11704 = B (no replay format locked); §20 N/A (no funding surface)
- [ ] No EC governance close required (no EC stub created under the resolved no-EC path); commit prefix is `SPEC:`

---

## Lint Self-Review

> Filled in 2026-04-30 per pre-flight PS-5, after `[DECISION REQUIRED]` blocks D-11701..D-11704 were resolved in `## Decision Points` to B/B/N-A/B. Reviewed against `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` §1-§20.

| § | Verdict | Justification |
|---|---|---|
| §1 — Work Packet Structure | **PASS** | All required sections present and non-empty: `## Goal`, `## Vision Alignment`, `## Execution Checklist (EC)`, `## Assumes`, `## Context (Read First)`, `## Non-Negotiable Constraints`, `## Decision Points`, `## Scope (In)`, `## Out of Scope` (with multiple explicit exclusions including the WP-118-style untracked-files rule), `## Files Expected to Change`, `## Acceptance Criteria` (12 binary checks across 3 sub-groups), `## Verification Steps` (9 commands), `## Definition of Done` (10 items). |
| §2 — Non-Negotiable Constraints Block | **PASS** | Engine-wide constraints (ESM only, Node v22+, human-style code per `00.6-code-style.md`, full file contents — no diffs / snippets). Packet-specific constraints (no route-table wiring; no deletion of existing URL-param handling; WP-114 query-param contract preserved verbatim; one decision per app; if router adopted, version locked + history mode committed + dependency in `dependencies`). Session protocol (decision-block resolution, untracked-files do-not-stage rule per WP-030 / D-3001 / WP-118 §5.2 precedent). |
| §3 — Prerequisites (`## Assumes`) | **PASS** | Six explicit assumptions, each grep-verifiable against current HEAD `cf0d618`: WP-061 complete, both apps lack `vue-router` dep, arena-client view discriminator at `App.vue:84`, arena-client `useUiStateStore` carries snapshot only, registry-viewer `activeView` ref + WP-114 surface, `DECISIONS.md` exists. The pre-flight PS-2 correction (Pinia tab-state misstatement) is folded in. |
| §4 — Context References (`## Context (Read First)`) | **PASS** | Specific section references: `ARCHITECTURE.md §System Layers`, `02-ARCHITECTURE.md §Tech Stack at a Glance` + `Package Boundaries`, both apps' `App.vue` + `stores/uiState.ts` + WP-114 files by path, dependency WPs (WP-114, WP-115) by file, `.claude/rules/architecture.md` for the import-rules table (read for diff-free verification), `00.6-code-style.md`. |
| §5 — Output Completeness (`## Files Expected to Change`) | **PASS** | All 5 files listed with `— modified` markers and one-line descriptions per file. File count is **at** the `~8 files` soft cap per §5 line 126; no overage. The future-supersession note explicitly defers conditional-router-adoption files (package.json, lockfile, `.claude/rules/architecture.md`, EC stub, EC_INDEX) to a future WP. |
| §6 — Naming Consistency | **PASS** | No new field names introduced. Auth posture not touched (D-9905 closed-set per WP-099). Status taxonomy not touched (WP-118's four-state set per D-11804). Existing helper names cited verbatim (`selectRoute`, `activeView`, `setupUrlParams`, `useUiStateStore`). |
| §7 — Dependency Discipline | **PASS** | `## Non-Negotiable Constraints` line 123 forbids alternative routers. Under the resolved B/B path, **no new dependency is added**. The forbidden-alternative-router rule remains in force for any future supersession WP. |
| §8 — Architectural Boundaries | **PASS** | Layer Boundary per `.claude/rules/architecture.md` is preserved by construction — no engine code touched, no `boardgame.io` imports anywhere in scope, no `pg` import, no engine state surface change. The Vue layer rows (`apps/arena-client`, `apps/registry-viewer`) at `.claude/rules/architecture.md:166-167` are **not modified** (no `vue-router` added to allowed-imports under the resolved path). |
| §9 — Windows Compatibility | **PASS** | Verification Steps use PowerShell-compatible commands (`Test-Path`, `Select-String -Path`, `Get-ChildItem -Recurse | Select-String`, `pnpm` commands); no bash-specific syntax. |
| §10 — Environment Variable Hygiene | **N/A** | No environment variables introduced or referenced. |
| §11 — Authentication Clarity | **N/A** | No auth surface touched. WP-099 / WP-112 govern auth; this WP is silent on auth per `## Out of Scope` line "No route guards / per-route auth". |
| §12 — Test Quality | **N/A** | No tests produced. WP changes no behavior; no test additions or deletions expected. AC line "no code touched" + Verification Step 7 (`pnpm -r test` exits 0, baseline counts unchanged) enforces. |
| §13 — Commands and Verification | **PASS** | All 9 verification commands are PowerShell-native or `pnpm` invocations; each step has expected-output annotation. Step 5 (scope check) lists the resolved 5-file allowlist exactly. Step 6 enforces the no-code-touch invariant. Step 9 is explicitly marked advisory. |
| §14 — Acceptance Criteria Quality | **PASS** | 12 binary checks across 3 sub-groups (Architecture doc, DECISIONS, Hygiene). Every item is observable via the corresponding Verification Step. No subjective items. The decision-conditional AC sub-groups from the original draft (Package.json, Rules, EC stub) are removed because the resolved B/B/N-A/B path does not trigger them. |
| §15 — Definition of Done | **PASS** | Section exists with 10 checkboxes covering: all AC pass, all `[DECISION REQUIRED]` blocks resolved, build + test exit 0, STATUS / DECISIONS / WORK_INDEX updates, scope-boundary check, lint-gate self-review pass, no EC governance close required. |
| §16 — Code Style | **N/A** | No code produced. Doc-only WP. Prose follows `00.6-code-style.md` guidance for documentation files. |
| §17 — Vision Alignment | **PASS** | `## Vision Alignment` block present. §17.1 trigger surfaces evaluated: client routing itself is not a §17.1 surface (D-11701 / D-11702 / D-11703 carry no §17 obligation); D-11704 = B (defer) means §17 is not triggered in this WP — the future replay-viewer WP that locks the format owns the §17 evaluation. Conflict assertion: "No conflict". Determinism preservation: N/A. Non-Goal proximity: NG-1..NG-7 not crossed. |
| §18 — Prose-vs-Grep Discipline | **PASS** | Verification Steps use scoped patterns (`^## Client Routing`, `^### D-1170[124]`, `arena-client\|registry-viewer\|selectRoute\|activeView`); Step 5 (`git diff --name-only`) is path-scoped; Step 6 (`-- 'apps/**' 'packages/**' 'data/**'`) is path-scoped. The architecture-doc cross-link will discuss routing in prose, but the verification greps target file existence and section headers, not forbidden-token enumeration. |
| §19 — Bridge-vs-HEAD Staleness Rule | **PASS** | This is a forward-locking governance WP, not a repo-state-summarizing artifact. The decisions land at execution time and are HEAD-current by construction. The WP body cites HEAD `cf0d618` as the verification anchor for the `## Assumes` block. |
| §20 — Funding Surface Gate Trigger | **N/A** | Pure documentation / governance update; no UI surfaces, no user-visible copy, no funding channels referenced. Per §20.1 governance-doc carve-out (line 619-627), this WP only mentions WP-097 / D-9701 / §20 if at all (it does not). |

**Summary:** 14 PASS, 6 N/A (each justified per §10 / §11 / §12 / §16 / §20 N/A discipline). Zero FAIL. Lint gate satisfied.

**Pre-Session Actions Resolved (2026-04-30):**

- [x] PS-1 — `## Session Context` rewritten with the actual per-app view-state mechanisms (arena-client `selectRoute()` discriminator at `App.vue:84`; registry-viewer `activeView` ref at `App.vue:77` + WP-114 `setupUrlParams`); the false "Pinia-driven tab-switching" claim removed.
- [x] PS-2 — `## Assumes` rewritten with file-path-anchored, grep-verifiable assumptions; the false "view-state lives in Pinia stores" claim removed.
- [x] PS-3 — D-11701 Option B description rewritten to describe the preserved `selectRoute()` surface verbatim (the false "URL is always `/`" claim removed); de-facto Option C note added per PS-10.
- [x] PS-4 — D-11701 = B (preserve `selectRoute()`), D-11702 = B (preserve `activeView` + WP-114 query params), D-11703 = N/A (no router adopted), D-11704 = B (defer to future replay-viewer / WP-115-extension WP).
- [x] PS-5 — `## Lint Self-Review` filled (this section).
- [x] PS-6 — `## Files Expected to Change` citation `00.3 §10` → `00.3 §5` (the `~8 files` soft cap is at §5 line 126).
- [x] PS-7 — File-count totals collapsed to the resolved single value (5 files); the off-by-one conditional-matrix totals removed entirely.
- [x] PS-8 — `## Out of Scope` adds the do-not-stage rule for unrelated untracked files; mirrors WP-030 / D-3001 / WP-118 §5.2 mystery-untracked-file precedent.
- [x] PS-9 — D-11704 forward-link target named: "future WP-NNN: Replay Viewer or extension to WP-115 leaderboard `GET /api/leaderboards/scores/:replayHash` client-side rendering".
- [x] PS-10 — D-11701 body adds a one-line note acknowledging the existing `selectRoute()` is structurally a de-facto Option C (lightweight in-house route discriminator); future router-integration WP treats it as the migration starting point, not as legacy scaffolding to be replaced.

**Pre-flight verdict disposition:** All 5 BLOCKING items resolved (PS-1..PS-5). All 5 RECOMMENDED items accepted and applied (PS-6..PS-10). Pre-flight verdict will flip to **READY 2026-04-30** on re-verdict. The copilot check will be re-run; expected outcome BLOCK → CONFIRM (the BLOCK was driven by the PS-1 / PS-3 contract drift and the PS-30 missing-pre-session-fixes, both now resolved).
