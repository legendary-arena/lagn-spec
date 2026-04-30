# WP-117 — Client Routing Strategy (Architecture)

**Status:** Draft (stub — pre-lint, pre-pre-flight; decisions marked `[DECISION REQUIRED]` must be resolved before lint-gate self-review)
**Primary Layer:** Governance / Policy (no runtime code; may add a single npm dependency if Option A is chosen)
**Dependencies:** WP-061 (gameplay-client framework lock: Vue 3 + Vite + Pinia) — establishes the SPA stack on which this routing decision sits.

---

## Session Context

Both shipped Vue 3 SPAs (`apps/arena-client` and `apps/registry-viewer`) use ad-hoc Pinia-driven tab-switching for view state — there is no router, no deep-linking, and no shared URL convention. WP-114 (URL-parameterized loadout preview, drafted) and WP-115 (public leaderboard endpoints, drafted) both exert pressure toward shareable URLs. This packet locks the routing posture for both apps before the next URL-bearing feature WP relitigates the choice.

---

## Goal

After this session, both Vue SPAs have a written, governance-anchored routing decision. Specifically:

- A new section `## Client Routing` exists in [docs/02-ARCHITECTURE.md](../../02-ARCHITECTURE.md) and [docs/ai/ARCHITECTURE.md](../ARCHITECTURE.md) stating, per app, whether `vue-router` is adopted and at what scope.
- `docs/ai/DECISIONS.md` has 2–4 new `D-NNNN` entries (per-app router decision, history mode, deep-link policy, optional shareable-replay-URL policy).
- If Option A (adopt `vue-router`) is chosen for either app: the relevant `apps/*/package.json` is updated with the locked version, and a follow-up implementation WP is referenced for actually wiring routes.
- If Option B (no router) is chosen for either app: the architecture doc explicitly states "no client router; tab state in Pinia" so future WPs do not relitigate.
- `.claude/rules/architecture.md` import-rules table (Vue layer rows for `apps/arena-client` and `apps/registry-viewer`) is updated if `vue-router` is added to the allowed-imports list.

This WP commits the *decision*; route-table wiring, router guards, and deep-link parsers are deferred to a future implementation WP.

**No observable behavior change.** This packet does not introduce, remove, or modify runtime routing behavior in either SPA. Existing tab-switching and query-parameter handling remain unchanged until the follow-up implementation WP wires `<router-view>`. If Option A is chosen for either app, the only repo-state change in that app is a single dependency entry in `package.json` plus a lockfile update — vue-router is added but not imported, so tree-shaking keeps it out of the production bundle until implementation lands.

**The four decisions are logically independent.** Router adoption (D-11701, D-11702), history mode (D-11703), and shareable replay URL format (D-11704) are recorded as separate decisions to avoid implicit coupling. Choosing Option B for either app does not bind D-11703 or D-11704; choosing Option A does not force D-11704 = A.

---

## Vision Alignment

> Trigger surfaces from §17.1 (00.3 §17.1) evaluated:
> - Client routing itself is **not** a §17.1 surface. Routing mechanism, history mode, and per-app posture (D-11701..D-11703) carry no Vision §17 obligation.
> - Replay URL format (D-11704) is the only path that touches §17. If D-11704 = A (lock format now), §17.1 #2 (Replays — Vision §18, §22, §24) is **Triggered**. If D-11704 = B (defer), §17 is **Not triggered** in this WP.

**Two-case evaluation (executor commits one at lint time):**

- **D-11704 = B (defer):** §17 N/A. This WP locks the routing *mechanism*, not any feature using it. Feature WPs (WP-102 public profile, WP-103 replay storage, WP-115 leaderboard) carry their own §17 obligations.
- **D-11704 = A (lock format):** §17 Triggered. **Vision clauses touched:** §18 (Replay determinism), §22 (Replay verification), §24 (Replay storage). NG-1..NG-7 not crossed. **Conflict assertion:** No conflict — locking a URL *format* does not change replay-loader semantics or storage. **Determinism preservation:** N/A — URL format is presentation-layer; engine and replay-storage layers untouched.

**§20 Funding Surface Gate:** N/A — this WP touches no funding affordances per WP-097 §A/§B/§C. Pure architectural mechanism, no user-visible copy referencing donations or tournament funding.

---

## Execution Checklist (EC)

**Conditional on D-11701 / D-11702 outcome:**

- **If both D-11701 = B/C and D-11702 = B/C (no router adopted in either app):** No EC is required. No `EC-*-*.checklist.md` file is created for this WP; no `EC_INDEX.md` row is added. WP-117 is the sole authoritative execution contract. Commits use `SPEC:` prefix. The D-10001 risk profile applies cleanly: only `docs/**` and `.claude/rules/**` are touched, so `.githooks/commit-msg` Rule 5 is not triggered.

- **If D-11701 = A or D-11702 = A (router adopted in at least one app):** A minimal stub EC is required per **D-10001 Amendment 2026-04-26 (Hook Integration Carve-Out)** to satisfy `.githooks/commit-msg` Rules 4 + 5 (any `apps/`-staged file requires an `EC-###:` prefix, which in turn requires an EC file to exist).

  **Slot assignment (retarget convention):** The EC-117 slot is already occupied by `EC-117-public-profile-page.checklist.md` (WP-102, retargeted from EC-102 on the 2026-04-28 staleness sweep). Per repo precedent (EC-103 → EC-111, EC-101 → EC-114, EC-109 → EC-115, EC-102 → EC-117, EC-111 → EC-118), the executing session assigns the **next free EC slot** at lint time and creates `EC-NNN-client-routing-strategy.checklist.md`. As of 2026-04-30, EC-118, EC-119, and EC-120 are also occupied; EC-121 is the first free slot. The actual slot is whatever is free at execution; the slot must be locked in `EC_INDEX.md` with a "Slot retargeted from EC-117 to EC-NNN — EC-117 occupied by EC-117-public-profile-page (WP-102)" note matching the established retarget-precedent format.

  **Stub shape (per D-10001 Amendment):**
  - Contain no independent locked values, scope, verification steps, or acceptance criteria.
  - Redirect all execution authority to WP-117 by explicit citation.
  - Be ≤ 20 content lines.
  - Carry status `Stub` in `EC_INDEX.md`, flipping `Stub → Done` at WP-117 governance close (not `Draft → Done`).

  **Commit prefix on the stub path:** `EC-NNN:` where NNN is the assigned retarget slot, NOT `EC-117:` (since EC-117 is WP-102's slot, using that prefix would falsely tag the commit as belonging to the public-profile EC).

**Why this conditional shape:** WP-117 is governance-class (binary-verifiable, no engine mutation, no persistence, no ordering surface). The package.json dependency add is mechanically inert — vue-router is added but not imported, so tree-shaking keeps it out of the bundle until a follow-up implementation WP wires `<router-view>`. The risk profile matches D-10001 cleanly; the only reason a stub may be needed is the hook's file-existence mechanic for `apps/`-staged commits, which is exactly what the D-10001 Amendment was written to handle.

**Citation:** `DECISIONS.md` D-10001 + Amendment 2026-04-26 (controlling precedent for both the no-EC path and the stub path); `docs/ai/execution-checklists/EC_INDEX.md` retarget-precedent rows (EC-111 / EC-114 / EC-115 / EC-117 / EC-118).

**The executor decides the path at lint-self-review time**, after the four decisions are resolved. The decision determines (a) commit-prefix, (b) whether a retargeted EC stub + `EC_INDEX.md` row are added to the file count, and (c) which DoD line about EC governance close applies.

---

## Assumes

- WP-061 complete: Vue 3 + Vite + Pinia locked for `apps/arena-client`.
- `apps/registry-viewer/package.json` exists and currently has no `vue-router` dependency.
- `apps/arena-client/package.json` exists and currently has no `vue-router` dependency.
- Both apps' current view-state lives in Pinia stores or local component state — confirmed by reading `apps/arena-client/src/stores/uiState.ts` and `apps/registry-viewer/src/App.vue`.
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
- If any `[DECISION REQUIRED]` block cannot be resolved, STOP and ask.

**Locked contract values:**
- N/A for this WP — no engine constants touched.

**Forbidden packages (per `00.3 §7`):**
- No alternative routers (`@vaadin/router`, `vue-class-component` routing helpers, etc.) — if a router is adopted, it is `vue-router` v4.x.

---

## Decision Points (Must be resolved before lint-gate self-review)

### [DECISION REQUIRED] D-11701 — `apps/arena-client` router posture
- **Option A:** Adopt `vue-router@4.x`. Routes: `/lobby`, `/match/:matchId`, `/replay/:replayId` (or similar). History mode TBD in D-11703.
- **Option B:** No router. Tab state stays in Pinia (`uiState.ts`). No deep links. URL is always `/`.
- **Option C:** Lightweight in-house router (~50 LOC: parse `window.location.pathname`, dispatch to component). **Strongly discouraged.** This recreates a subset of `vue-router` semantics (history handling, back/forward navigation, scroll restoration, route param parsing edge cases, navigation guards) without battle-tested behavior. Selecting Option C requires extraordinary justification recorded verbatim in the chosen `DECISIONS.md` entry — including which specific `vue-router` features the in-house router intentionally omits and why.
- *Tradeoff:* A is conventional and unblocks shareable URLs but adds ~13KB gzipped + a layer of indirection; B is simplest but blocks every future "share this link" feature; C is bikeshed bait — assume A or B unless there's a concrete reason neither fits.

### [DECISION REQUIRED] D-11702 — `apps/registry-viewer` router posture
- **Option A:** Adopt `vue-router@4.x`. Routes: `/cards`, `/cards/:cardExtId`, `/themes/:themeId`, `/loadout` (with WP-114 query params preserved verbatim as `route.query` — see Non-Negotiable Constraints).
- **Option B:** No router. Tab + query-param approach already in place. Stay.
- **Option C:** As C in D-11701 — **strongly discouraged**, same justification bar.
- *Tradeoff:* Registry-viewer is public-facing (`cards.barefootbetters.com`); Option A enables proper SEO + shareable card links + browser back-button working as expected. Option B is shipped and working; the cost of switching is non-zero. WP-114's URL-parameterized setup preview already proves that Option B can carry deep-link weight for the loadout surface — Option A is justified by the *card detail* and *theme* surfaces, not by anything WP-114 already solved.

### [DECISION REQUIRED] D-11703 — History mode (only if any router adopted)
- **Option A:** `createWebHistory()` — clean URLs (`/match/abc123`). Requires server-side fallback (every unknown path returns `index.html`).
- **Option B:** `createWebHashHistory()` — hash URLs (`/#/match/abc123`). No server config needed.
- *Tradeoff:* A is the modern default but means `apps/server` (or the static-host config for `cards.barefootbetters.com`) needs SPA fallback; B sidesteps the server config but gives uglier URLs and known SEO + analytics quirks.

### [DECISION REQUIRED] D-11704 — Shareable replay URL format (optional; defer if not yet relevant)
- **Option A:** Lock format now (e.g., `/replay/:replayId` with `:replayId` matching the WP-103 replay-storage convention). Triggers §17 Vision Alignment in this WP.
- **Option B:** Defer to whichever WP first exposes a replay UI.
- *Tradeoff:* A prevents drift across multiple feature WPs; B keeps this WP smaller and lets implementation context shape the format.

---

## Scope (In)

### A) Architecture-doc additions
- **`docs/ai/ARCHITECTURE.md`** — modified: add `## Client Routing` section stating per-app decision, history mode (if applicable), and a one-line policy on shareable URLs.
- **`docs/02-ARCHITECTURE.md`** — modified: mirror section. Update the `Tech Stack at a Glance` table to include `vue-router` row (or explicitly list "no client router" under the relevant apps).

### B) Per-app package.json (only if D-11701 or D-11702 = Option A)
- **`apps/arena-client/package.json`** — modified (only if Option A): add `"vue-router": "^4.x.x"` to `dependencies`.
- **`apps/registry-viewer/package.json`** — modified (only if Option A): add `"vue-router": "^4.x.x"` to `dependencies`.

### C) DECISIONS entries
- **`docs/ai/DECISIONS.md`** — modified: append `D-11701..D-11703` (and `D-11704` if opted in).

### D) Rules update (only if any router adopted)
- **`.claude/rules/architecture.md`** — modified: update the import-rules table to add `vue-router` to the allowed-import list for the relevant app row(s).

### E) STATUS + WORK_INDEX
- **`docs/ai/STATUS.md`** — modified: one-line capability statement.
- **`docs/ai/work-packets/WORK_INDEX.md`** — modified: check WP-117 off.

---

## Out of Scope

- **No `<router-view>` wiring.** Actual integration into `App.vue` is a separate implementation WP.
- **No route guards / per-route auth.** Auth is governed by WP-099 / WP-112; routing posture does not amend the auth model.
- **No SSR.** Vue SPAs remain client-rendered.
- **No Vue 2 / Nuxt / other framework consideration.** Stack is locked at WP-061.
- **No registry-viewer URL-param refactor.** WP-114's query-param approach stays in place even if Option A is chosen for D-11702 — refactor is a follow-up WP.
- **No CDN / static-host configuration changes.** If `createWebHistory()` is chosen, the SPA-fallback wiring is a follow-up infra WP.

---

## Files Expected to Change

File count varies by decision. The full conditional matrix:

**Always (governance core, 5 files):**
- `docs/ai/ARCHITECTURE.md` — **modified** — add `## Client Routing` section
- `docs/02-ARCHITECTURE.md` — **modified** — mirror section + Tech Stack row
- `docs/ai/DECISIONS.md` — **modified** — append D-11701..D-11703 (D-11704 conditional)
- `docs/ai/STATUS.md` — **modified** — capability line
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off

**Conditional on D-11701 = A:**
- `apps/arena-client/package.json` — **modified** — add vue-router dependency + lockfile (`pnpm-lock.yaml` regenerated as a paired side-effect)

**Conditional on D-11702 = A:**
- `apps/registry-viewer/package.json` — **modified** — add vue-router dependency + lockfile (same lockfile, same paired regeneration)

**Conditional on either D-11701 = A or D-11702 = A:**
- `.claude/rules/architecture.md` — **modified** — add `vue-router` to allowed-imports row(s)
- `docs/ai/execution-checklists/EC-NNN-client-routing-strategy.checklist.md` — **new** — minimal stub per D-10001 Amendment 2026-04-26 (≤20 lines; redirects authority to WP-117). NNN is assigned at lint time per retarget convention (EC-117 is occupied; EC-121 is the next free slot as of 2026-04-30).
- `docs/ai/execution-checklists/EC_INDEX.md` — **modified** — add the retargeted EC-NNN row, status `Stub`, with retarget note matching the EC-103→EC-111 / EC-102→EC-117 precedent format.

**Conditional on D-11704 = A:**
- (no additional files — entry lands in `docs/ai/DECISIONS.md` already in the always-list)

**File-count totals:**
- Both apps choose B/C, D-11704 = B: **5 files** (governance-only, no router, no stub).
- One app chooses A, D-11704 = B: **9 files** (governance + 1 package.json + lockfile + rules + EC stub + EC_INDEX).
- Both apps choose A, D-11704 = B: **10 files** (governance + 2 package.json + 1 lockfile + rules + EC stub + EC_INDEX).
- Both apps choose A, D-11704 = A: **10 files** (D-11704 lands in DECISIONS.md, already counted).

Worst case = **10 files**, which exceeds the `~8 files` soft cap per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §10` (line 126). The overage is justified by the mechanical-inertness of the conditional additions (each file is either a one-line edit or a ≤20-line stub redirecting authority to WP-117). If the executor wants to stay within the cap, the package.json + EC-stub work can be split into a dedicated implementation WP — but that contradicts the stated Goal of locking the dependency at decision time, so the executor should accept the overage rather than re-architect.

---

## Acceptance Criteria

### Architecture doc
- [ ] `docs/ai/ARCHITECTURE.md` contains a `## Client Routing` section
- [ ] The section states the decision for `apps/arena-client` explicitly (Option A, B, or C)
- [ ] The section states the decision for `apps/registry-viewer` explicitly (Option A, B, or C)
- [ ] If any app adopts a router, history mode is stated
- [ ] If neither app adopts a router, the section explicitly says so

### Package.json (conditional)
- [ ] Only modified if Option A chosen for the corresponding app
- [ ] `vue-router` version pinned to a specific minor (e.g., `^4.4.0`), not `*` or `latest`
- [ ] Listed in `dependencies`, not `devDependencies`

### DECISIONS
- [ ] D-11701 (arena-client posture) entry exists with chosen option + rationale
- [ ] D-11702 (registry-viewer posture) entry exists with chosen option + rationale
- [ ] D-11703 (history mode) entry exists if either app adopts a router; otherwise marked N/A in DECISIONS preamble
- [ ] D-11704 (replay URL format) — present if opted in; absent if deferred

### Rules
- [ ] If router adopted, `.claude/rules/architecture.md` import-rules row reflects new allowed-import; otherwise unchanged

### EC stub (conditional on D-11701 = A or D-11702 = A)
- [ ] A retargeted `EC-NNN-client-routing-strategy.checklist.md` exists at the next free EC slot (≥ EC-121 as of 2026-04-30) and is ≤ 20 content lines
- [ ] Stub redirects all execution authority to WP-117 by explicit citation; carries no independent locked values, scope, verification steps, or acceptance criteria
- [ ] `docs/ai/execution-checklists/EC_INDEX.md` contains the retargeted EC-NNN row with status `Stub` and a retarget note in the standard precedent format (e.g., "Slot retargeted from EC-117 to EC-NNN — EC-117 occupied by EC-117-public-profile-page (WP-102)")
- [ ] At WP-117 governance close, the retargeted EC-NNN row flips `Stub → Done` (not `Draft → Done`)

### Hygiene
- [ ] STATUS + WORK_INDEX updated
- [ ] No files outside the resolved (decision-conditional) `## Files Expected to Change` list were modified
- [ ] If `pnpm install` is run, lockfile updates are committed (only if package.json was modified)
- [ ] Commit prefix matches EC path: `EC-NNN:` (the assigned retarget slot, NOT `EC-117`) if stub created; `SPEC:` if no stub created

---

## Verification Steps

```pwsh
# Step 1 — confirm architecture section
Select-String -Path "docs\ai\ARCHITECTURE.md" -Pattern "^## Client Routing"
# Expected: one match

# Step 2 — per-app decision present in section
Select-String -Path "docs\ai\ARCHITECTURE.md" -Pattern "arena-client|registry-viewer" -Context 0,2
# Expected: matches inside the new section (visual inspection)

# Step 3 — DECISIONS entries
Select-String -Path "docs\ai\DECISIONS.md" -Pattern "^### D-1170[1-4]|^## D-1170[1-4]"
# Expected: 2-4 matches depending on opted-in decisions
#   - Always: D-11701 (arena-client posture), D-11702 (registry-viewer posture)
#   - Conditional: D-11703 (history mode — only if any router adopted)
#   - Optional: D-11704 (replay URL format — only if opted in)
# why: regex covers both `### D-NNNNN` and `## D-NNNNN` header forms (DECISIONS.md uses both — D-5201 is `###`, D-9905 is `##`)

# Step 4 — package.json conditional
# (only if Option A chosen for arena-client)
Select-String -Path "apps\arena-client\package.json" -Pattern '"vue-router"'
# Expected: one match if Option A; no match if Option B/C

# Step 5 — pnpm install + build (only if package.json changed)
pnpm install
pnpm -r build
# Expected: exits 0

# Step 6 — no test impact (governance-only)
pnpm -r test
# Expected: exits 0; no test count change

# Step 7 — scope check
git diff --name-only
# Expected: only files in the resolved (decision-conditional) `## Files Expected to Change` list.
#   - Governance-only path (both apps B/C, D-11704 = B): 5 files
#   - Stub path (either app = A): governance core + conditional adds (8-10 files)

# Step 8 — EC stub gate (conditional on D-11701 = A or D-11702 = A)
# Substitute NNN with the actual retargeted slot assigned at lint time (EC-117 is taken; EC-121 is the next free slot as of 2026-04-30).
Get-ChildItem -Path "docs\ai\execution-checklists" -Filter "EC-*-client-routing-strategy.checklist.md"
# Expected: one match if any router adopted; no match otherwise

Select-String -Path "docs\ai\execution-checklists\EC_INDEX.md" -Pattern "client-routing-strategy"
# Expected: one row if any router adopted; no rows otherwise. The matching row must include a retarget note matching the established precedent format.
```

---

## Definition of Done

- [ ] All acceptance criteria pass
- [ ] All `[DECISION REQUIRED]` blocks resolved with chosen option recorded in DECISIONS
- [ ] `pnpm -r build` exits 0 (verifies no broken deps if package.json modified)
- [ ] `pnpm -r test` exits 0 (verifies no regressions)
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated with D-11701..D-11703 (and D-11704 if opted in)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-117 checked off with today's date + commit hash
- [ ] No files outside `## Files Expected to Change` were modified
- [ ] Lint-gate self-review passes — §17 evaluation committed to one of the two cases (D-11704 = B → §17 N/A; D-11704 = A → §17 Triggered with full Vision Alignment block); §20 N/A justified
- [ ] EC governance close path matches D-11701 / D-11702 outcome — if stub was created, EC_INDEX.md row flipped `Stub → Done`; if no stub was created, no EC governance close required

---

## Lint Self-Review

> To be filled in by the packet author after `[DECISION REQUIRED]` blocks are resolved and before pre-flight invocation.
