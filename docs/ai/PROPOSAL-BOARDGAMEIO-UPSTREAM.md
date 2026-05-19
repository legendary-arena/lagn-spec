# PROPOSAL — boardgame.io Upstream Contribution Posture

**Status:** 🟡 **DRAFT / BRAINSTORM** — captures research and recommendation; not yet ratified. No DECISIONS.md entry has been inserted. On acceptance, the draft entry in §6 would land as a new `D-XXXX` under "Engineering / Dependencies."

**Date:** 2026-05-05
**Informs:** any future Work Packet that proposes filing a PR or design issue against `boardgameio/boardgame.io`; any decision to upgrade off `boardgame.io ^0.50.0`.
**Authority chain:** `docs/ai/ARCHITECTURE.md` (locks `boardgame.io ^0.50.0`) → `.claude/skills/legendary-game-engine/SKILL.md` (LOCKED note on the version) → this proposal.

This proposal does **not** amend ARCHITECTURE.md, VISION.md, or any rules file. It captures a strategic posture toward an external dependency and proposes a future DECISIONS entry to record that posture.

---

## 1. Why this proposal exists

Legendary Arena is built on `boardgame.io ^0.50.0` (locked across `packages/game-engine`, `apps/server`, and `apps/arena-client`). The dependency is load-bearing: the engine's `Game()`, `Ctx`, `FnContext`, the Immer mutation model, and the Server() integration are all version-specific and named in `.claude/skills/legendary-game-engine/SKILL.md`.

Two questions surfaced in a 2026-05-04 strategy discussion:

1. Are there roadmap items in [`boardgame.io/roadmap.md`](https://github.com/boardgameio/boardgame.io/blob/main/roadmap.md) where LA could contribute work that benefits both projects?
2. Is the upstream project healthy enough that contributions would actually land in a useful timeframe?

The data behind both questions points the same direction: contribute selectively and **never on the critical path**. This proposal captures the reasoning so future sessions don't re-derive it from scratch.

---

## 2. Findings — upstream maintenance state

### 2.1 Activity signal

| Signal | Observation |
|---|---|
| Stars | 12,322 |
| License | MIT |
| Last human commit on `main` | 2024-11-04 ("Remove unmaintained repo banner") |
| All commits since | dependabot only (last: 2024-12-30) |
| Last feature merge | March 2025 ([PR #1217](https://github.com/boardgameio/boardgame.io/pull/1217), 10 lines) — and even that PR's `mergedAt` shows null in the API as of 2026-05-04, suggesting it may have been re-opened |
| Open PRs of substance | [#1226](https://github.com/boardgameio/boardgame.io/pull/1226) (Koa→Express, 20k lines, June 2025), [#1219](https://github.com/boardgameio/boardgame.io/pull/1219) (TS docs, May 2025), [#1224](https://github.com/boardgameio/boardgame.io/pull/1224) (TS examples, June 2025), [#1227](https://github.com/boardgameio/boardgame.io/pull/1227) (def exports, July 2025) — all sit untouched |
| Recently closed-without-merge | [#1221](https://github.com/boardgameio/boardgame.io/pull/1221) (thunk support), [#1220](https://github.com/boardgameio/boardgame.io/pull/1220) (redux replacement) — clean PRs, rejected May 2025 |

### 2.2 Maintainer posture

- **@delucis (Chris Swithinbank)** — original maintainer, now at `@withastro` (Astro). Commented on PR #1226 (2025-06-21): *"I'm not actively maintaining boardgame.io at the moment."* No funding link visible on his profile.
- **@benbot (Benjamin Botwin)** — filed [#1188 "Throwing my hat in for maintainer"](https://github.com/boardgameio/boardgame.io/issues/1188) on 2024-08-13 (closed 2024-09-21 with no apparent commit-rights handover). Still around: most recent comment 2026-01-13 on [#1200](https://github.com/boardgameio/boardgame.io/issues/1200), and engagement on [#1185 "Maintainer discussion"](https://github.com/boardgameio/boardgame.io/issues/1185) (last updated 2025-02-03) and [#1192 "Possible enhancements"](https://github.com/boardgameio/boardgame.io/issues/1192) (2025-07-16). Profile: hobbyist game-dev in Florida, 54 followers, no company, no Sponsors page. Pattern reads as someone who *wanted* to maintain, never got fully empowered, and is now drifting in.
- **Funding routes are org-level only.** GitHub Sponsors → `boardgameio` org; OpenCollective → `opencollective.com/boardgameio`. delucis controls the org account; benbot doesn't see that money personally.

### 2.3 Roadmap items still open (commit `4f3c90d`)

| Item | Issue | Last activity |
|---|---|---|
| Bots in multiplayer | [#383](https://github.com/boardgameio/boardgame.io/issues/383) | comment 2024-05-18 |
| Lobby improvements | [#354](https://github.com/boardgameio/boardgame.io/issues/354) | comment 2019; touched 2021 |
| Migrate to Svelte | [#432](https://github.com/boardgameio/boardgame.io/issues/432) | n/a |
| Third-party storage connectors (Postgres `StorageAPI.Async`) | open invite | n/a |
| MessagePack / compression | implicit | n/a |
| Server scaling | [#277](https://github.com/boardgameio/boardgame.io/issues/277) | **0 comments**, last touched 2020 |
| Recipes / code organization patterns (docs) | open invite | n/a |

### 2.4 LA's actual touchpoints with the framework

- `boardgame.io ^0.50.0` LOCKED in `packages/game-engine/package.json`, `apps/server/package.json`, `apps/arena-client/package.json`.
- Engine code uses **type-only imports** almost everywhere (`Ctx`, `FnContext`, `Game`, `PlayerID`).
- One real interop wart: [`apps/arena-client/src/client/bgioClient.ts:33,36`](apps/arena-client/src/client/bgioClient.ts:33) reaches into `boardgame.io/dist/cjs/client.js` and `.../multiplayer.js` because the package's ESM `exports` map doesn't expose those entrypoints cleanly to a Vue/ESM consumer.
- `.claude/rules/code-style.md` explicitly bans `boardgame.io/testing`; LA wrote its own [`makeMockCtx`](packages/game-engine/src/test/mockCtx.ts) used in 20+ test files.
- Pre-planning layer is type-only-import-at-compile-time per `.claude/rules/architecture.md` — LA already treats the dependency as something to insulate from, not extend.
- LA does **not** persist `G` to PostgreSQL. `.claude/skills/legendary-persistence/SKILL.md` forbids it. `pg` is used for application tables only (identities, profiles, leaderboards, replays, competitions). No `StorageAPI.Async` adapter exists or is wanted.

---

## 3. Options considered

### Option A — Status quo

Treat boardgame.io as effectively-frozen. Work around friction in-repo (the `dist/cjs/*` shim, the `makeMockCtx` test helper). File no PRs.

| Pros | Cons |
|---|---|
| Zero coordination cost | No goodwill capital; LA's friction points stay friction points for everyone |
| No critical path depends on upstream review latency | If bgio dies entirely, LA inherits the maintenance burden alone |
| Aligned with current `.claude/rules/architecture.md` posture (treat bgio as data-input boundary) | Reputational: a 12k-star ecosystem has nothing from us |

### Option B — Goodwill upstream PRs (small, surgical)

File one or two low-risk PRs that solve real LA frictions and benefit any consumer. Candidates, in order of leverage:

1. **ESM `exports` map** so consumers can `import` from `boardgame.io/client` and `.../multiplayer` without `dist/cjs/*` paths. Removes the [`bgioClient.ts:33,36`](apps/arena-client/src/client/bgioClient.ts:33) wart. <50 lines. Helps every Vite/Vue/Svelte consumer.
2. **TypeScript type tightening** on `Ctx` / `FnContext` / `Game` / `PlayerID`. Similar in spirit to the still-open #1219 / #1224.
3. **Documentation** — recipes / code organization patterns. The roadmap explicitly lists this. LA has battle-tested patterns (layer boundaries, persistence classes, rule-execution pipeline, engine-vs-server discipline) that distill cleanly into a generic recipe.

| Pros | Cons |
|---|---|
| Removes a real LA wart (the dist/cjs shim) | PRs may sit untouched for 6–12 months (precedent: #1219, #1224, #1226) |
| Docs PRs have the highest merge probability — it's the only category that moved in 2024–25 | LA can't depend on the merge for shipping anything; benefit is goodwill + small in-repo cleanup |
| Builds review history with whoever revives the project (benbot or successor) | Coordination cost: branch, CI, follow-ups |

### Option C — Bots-in-multiplayer design issue (#383)

LA has a real simulation harness in [`packages/game-engine/src/simulation/`](packages/game-engine/src/simulation/) with policy interface, legal-move enumeration, par aggregation, and a runner. The shape `(state) → legalMoves → policy → move` is a reusable primitive. Issue #383 is the most-recently-active roadmap item (last comment 2024-05-18).

| Pros | Cons |
|---|---|
| Most active issue in the open roadmap | LA's bots are *offline simulation drivers*; #383 is about *connecting bots as multiplayer players* (different problem: seat reservation, auth, connection lifecycle) |
| LA's policy interface design is novel and worth sharing | Substantial extraction work to make it generic and bgio-agnostic |
| Could attract benbot's attention on a topic he engages with | Speculative — easy to spend a week and get no review |

Recommended sub-action: comment on #383 with a sketch and ask for a steer before building anything. A PR without a design discussion is unlikely to land.

### Option D — Soft fork / vendored patches

Maintain a private fork or patches-package layer for any framework-level fix LA needs to ship.

| Pros | Cons |
|---|---|
| Zero blocking on upstream | Maintenance burden grows with every patch |
| Already partially the posture — type-only imports, custom `makeMockCtx`, pre-planning isolation | Diverges from upstream over time; reintegration cost rises |
| Shippable today, no coordination | Technical debt accrues silently |

This isn't an *alternative* to A/B; it's the safety net underneath them. LA should be willing to vendor a patch if a friction point becomes shipping-blocking, and not condition any release on an upstream merge.

### Option E — Sponsor a maintainer

| Sub-option | Pros | Cons |
|---|---|---|
| **E1: Recurring GitHub Sponsorship to delucis** ($20–30/mo) | Reads as a long-term relationship; he's the one with merge rights | He's at Astro now; sponsorship doesn't buy bandwidth |
| **E2: One-time OpenCollective donation to `boardgameio`** | Easy | Drops into an org pool delucis controls; benbot doesn't see it; doesn't create personal obligation |
| **E3: Direct private outreach to benbot with a paid-time offer** ($200 / hour) | Treats him as a person; either-yes-or-honest-no is informative either way | He has no published rate; may decline; only reaches him |
| **E4: Public bounty on a specific PR via Algora** ($200) | Public signal; *anyone* with merge rights or interest can act | Platform overhead; only works if the work itself is well-scoped |

(Note: Polar — formerly an OSS bounty platform — pivoted to AI/SaaS billing as of 2026 and is no longer the right tool. Algora and IssueHunt remain.)

### Option F — Upgrade off boardgame.io entirely

Out of scope for this proposal. Would require a separate `PROPOSAL-FRAMEWORK-MIGRATION.md` and a vision/architecture review. Mentioned only for completeness.

---

## 4. Recommendation

**Adopt Option A as the default, with Options B and D as accepted complements, and Option E held in reserve.**

Concretely:

1. **Default posture** (Option A + D): no critical path depends on an upstream merge. If a bgio friction becomes shipping-blocking, vendor a patch. Continue treating the dependency as a data-input boundary per `.claude/rules/architecture.md`.

2. **Single goodwill PR** (Option B, item 3): file a documentation contribution distilling LA's layer-boundary / persistence-class / engine-vs-server patterns into a generic recipe. Highest merge probability of any candidate, lowest risk if it sits unmerged.

3. **One design issue** (Option C, comment-only): leave a thoughtful comment on [#383](https://github.com/boardgameio/boardgame.io/issues/383) sketching the policy-interface shape. Do not build a PR speculatively. If benbot or another engaged contributor responds, reassess.

4. **Sponsorship deferred**: do not deploy money until there is a *specific* contribution in flight. If item 2 above sits unreviewed for 4–8 weeks, then consider Option E4 (public Algora bounty on that exact PR) or E3 (direct outreach to benbot). One-time OpenCollective donations to the org are not recommended — they don't move the needle on review attention.

5. **Re-evaluate** when any of these signals appear: benbot or a new maintainer starts merging non-dependabot PRs again; a v0.51 release ships; the "unmaintained" banner returns; an open PR that LA filed gets reviewed.

---

## 5. Open questions / wait-and-see signals

- **Will the docs PR get traction?** A reasonable test of upstream responsiveness. 4–8 weeks is the watch window.
- **Did benbot ever get commit rights?** [#1188](https://github.com/boardgameio/boardgame.io/issues/1188) was closed but it's not visible whether that closure granted rights or simply ended the discussion. Could be inferred by whether his name appears on any future merge.
- **Is `@fladrif` a third option?** They authored [#1217](https://github.com/boardgameio/boardgame.io/pull/1217) (the only feature-shaped PR with movement in 2025) and the 2024-11-04 banner-removal commit. Possibly more active than benbot. Worth noting in any tagged PR comment.
- **What does v1.0 look like?** The roadmap is titled "Roadmap to v1.0" but `v0.50` is the current line and there is no public timeline. If v1.0 lands, the locked-version constraint in `.claude/skills/legendary-game-engine/SKILL.md` becomes a question.
- **Marvel-IP concerns from contributing?** Contribution would be to a generic framework, not to LA's card content. No Marvel surface area exposed. Confirmed not blocking, but flagged for completeness.

---

## 6. Draft DECISIONS entry (if ratified)

> Drop-in text for `DECISIONS.md` once approved. Numbering slot to be assigned by the editor; suggested category is "Engineering / Dependencies."

### D-XXXX — boardgame.io Upstream Contribution Posture: Goodwill, Never Critical Path

**Type:** Engineering / Dependencies
**Date:** 2026-05-05 (proposed)
**Supersedes:** none

**Decision:** Legendary Arena treats `boardgame.io ^0.50.0` as an effectively-frozen dependency. No release, milestone, or Work Packet may be conditioned on an upstream PR being merged. Goodwill contributions (documentation, ESM exports, type tightening) are permitted and encouraged, but must be filed with the explicit understanding that they may sit unreviewed for an extended period and provide no shipping benefit to LA. If a framework-level fix becomes shipping-blocking, LA vendors a patch rather than waiting for upstream.

**Rationale:**

1. **Upstream is dormant.** Last human commit on `main` is 2024-11-04; original maintainer publicly said in 2025-06 that he is not actively maintaining; the would-be successor (@benbot) commented as recently as 2026-01 but has not gained commit rights. Substantive open PRs (#1219, #1224, #1226, #1227) sit untouched.
2. **LA's architecture already insulates the dependency.** Layer boundaries (`.claude/rules/architecture.md`), the type-only-import discipline, the custom `makeMockCtx`, and the persistence rules forbidding `G` storage all compose into a "bgio is an input boundary" posture. Conditioning anything on upstream merges would contradict that posture.
3. **The mutually-beneficial intersection is narrow.** LA has already engineered around every friction point that mattered to it. Upstreaming therefore benefits the community more than it benefits LA. That asymmetry is fine, but it must not be confused with "LA needs the merge."
4. **Sponsorship is a precision tool, not a default.** One-time donations to the org pool do not create personal review obligation for any specific contributor. Sponsorship spend, if any, is reserved for moments where a specific PR or design conversation is in flight and benefits from a public bounty (Algora) or a private paid-time offer.

**Implementation:**

- No change required to `.claude/rules/architecture.md` or `.claude/skills/legendary-game-engine/SKILL.md`; this decision codifies the existing posture.
- Goodwill PRs filed under this decision should be linked from this proposal's "Citations" section as they appear, with their current upstream status noted.
- Re-evaluation triggers (§5 signals): each is sufficient on its own to reopen the question.

**Status:** Draft (proposed 2026-05-05). On acceptance: Active until superseded by a framework-migration decision or a maintainer-revival signal.

**Citation:** boardgame.io [roadmap.md @ 4f3c90d](https://github.com/boardgameio/boardgame.io/blob/4f3c90df0d891f2e17f2bfafbed1bd4f4b804256/roadmap.md); [PR #1226](https://github.com/boardgameio/boardgame.io/pull/1226) (delucis comment 2025-06-21); [issue #1188](https://github.com/boardgameio/boardgame.io/issues/1188); [issue #1185](https://github.com/boardgameio/boardgame.io/issues/1185); `.claude/rules/architecture.md` (Pre-Planning Layer + Layer Boundary sections); `.claude/skills/legendary-game-engine/SKILL.md` (boardgame.io Version invariant).

---

## 7. Appendix — citations

- boardgame.io repo: `https://github.com/boardgameio/boardgame.io` (12.3k stars, MIT, default branch `main`)
- Roadmap pinned commit: `4f3c90df0d891f2e17f2bfafbed1bd4f4b804256` (2024-12-30)
- Funding routes: GitHub Sponsors `https://github.com/sponsors/boardgameio` (org), OpenCollective `https://opencollective.com/boardgameio`
- delucis profile: `https://chrisswithinbank.net/`, company `@withastro`
- benbot profile: GitHub `@benbot`, Florida, no Sponsors page
- LA touchpoint files: [`apps/arena-client/src/client/bgioClient.ts:33`](apps/arena-client/src/client/bgioClient.ts:33), [`packages/game-engine/src/game.ts:1`](packages/game-engine/src/game.ts:1), [`packages/game-engine/src/simulation/simulation.runner.ts`](packages/game-engine/src/simulation/simulation.runner.ts), `.claude/rules/architecture.md`, `.claude/rules/code-style.md`, `.claude/skills/legendary-persistence/SKILL.md`, `.claude/skills/legendary-game-engine/SKILL.md`.
- Bounty platforms surveyed (2026-05-05): Algora (active, bounties + jobs); Polar (pivoted to AI/SaaS billing — no longer applicable); IssueHunt (active, classic GitHub-issue bounty model); GitHub Sponsors (recurring/one-time, requires sponsoree to have a profile set up).
