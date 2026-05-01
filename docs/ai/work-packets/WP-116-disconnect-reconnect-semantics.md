# WP-116 — Disconnect & Reconnect Semantics (Architecture)

**Status:** Ready for execution — decisions resolved 2026-04-30 (D-11601 = B, D-11602 = B, D-11603 = B, D-11604 = A, D-11605 = A, D-11606 = A default-defer); pre-flight 2026-04-30 surfaced 2 BLOCKING + 3 RECOMMENDED PS items, all 5 resolved in this same prep commit; the resolved file count is 6 governance-core files (no EC stub, no `package.json` edit, no rules-table import-row change, no engine touch); single `SPEC:` commit topology per D-10001 + 2026-04-26 Amendment (no `apps/` / `packages/` / `data/` files staged → `.githooks/commit-msg` Rule 5 not triggered → no EC stub required).
**Primary Layer:** Governance / Policy (no code; produces architectural policy + DECISIONS entries)
**Dependencies:** WP-090 (Socket.IO transport shipped 2026-04-24) — establishes that multiplayer match traffic flows over `boardgame.io/client` socket.io; this WP locks the *behavior* on top of that transport, not the transport itself.

---

## Session Context

WP-090 shipped browser-to-engine live-match wiring over Socket.IO 4.8.x via `boardgame.io/client`, but the architecture doc and `.claude/rules/*` are silent on what the *application* does when a player drops mid-match — turn-handover, lobby readiness on rejoin, abandonment policy, and replay-on-abort behavior are all undefined. boardgame.io provides reconnect plumbing; this packet writes the application-level policy on top of it before further multiplayer features (team play WP-109, leaderboard WP-115, future ranked play) re-litigate the same questions.

---

## Goal

After this session, Legendary Arena has a written, governance-anchored disconnect/reconnect policy covering the full multiplayer-match lifecycle. Specifically:

- A new section `## Disconnect & Reconnect Semantics` exists in [docs/02-ARCHITECTURE.md](../../02-ARCHITECTURE.md) and [docs/ai/ARCHITECTURE.md](../ARCHITECTURE.md) covering: rejoin grace window, turn-handover-on-disconnect rules per phase (`lobby` / `setup` / `play` / `end`), lobby ready-state behavior on rejoin, mid-match abandonment policy, replay emission on abort.
- `docs/ai/DECISIONS.md` has 4–6 new `D-NNNN` entries anchoring each policy decision.
- The policy is implementation-agnostic: it does not commit to specific timer values until a future implementation WP gathers production telemetry; it does commit to *which class of policy applies* (e.g., "fixed timeout" vs "variable based on phase" vs "host decides").
- `.claude/rules/architecture.md` cross-references the new policy section so future WP authors land on it before designing reconnect-adjacent features.

This WP produces no code, no tests, no migrations, no boardgame.io configuration changes. Implementation is deferred to a future WP that wires the policy into `apps/server/src/server.mjs` and the arena-client.

**No implicit framework defaults.** This WP explicitly forbids implicit reliance on boardgame.io's built-in disconnect / reconnect behavior. Any framework default that this policy does not explicitly supersede MUST be named verbatim as the chosen option in the corresponding `D-116NN` entry, with the framework version pinned. Future implementation WPs MUST NOT cite "we use boardgame.io defaults" without a `DECISIONS.md` anchor to a D-116NN entry that explicitly accepts that default as the policy.

---

## Vision Alignment

> Triggered by §17.1 #4 (Multiplayer synchronization, reconnection, or late-joining — Vision §4).

**Vision clauses touched:** §3 (Player Trust & Fairness), §4 (Multiplayer correctness), §22 (Replay determinism), §14 (Explicit Decisions, No Silent Drift). NG-1..NG-7 not crossed.

**Conflict assertion:** No conflict — this WP preserves all touched clauses.

**Determinism preservation:** Disconnect events are recorded as deterministic entries in `G.messages` (per existing message-log pattern). Reconnect does not replay or rewind authoritative state — the engine remains the sole source of truth and the rejoining client re-synchronizes by reading current `G` via boardgame.io's standard sync. No new RNG sources, no wall-clock reads inside moves; any timeout values are configuration (server-side, not in `G`).

---

## Execution Checklist (EC)

**No EC is required for WP-116.** No `EC-*-*.checklist.md` file is created for this WP; no `EC_INDEX.md` row is added. This Work Packet is the sole authoritative execution contract.

> **Slot-naming note:** Per repo precedent, EC slot numbers do not have to match WP numbers (EC-103 → EC-111, EC-101 → EC-114, EC-109 → EC-115, EC-102 → EC-117, EC-111 → EC-118, etc.). The EC-116 slot is already occupied by `EC-116-registry-viewer-url-parameterized-setup-preview.checklist.md` (WP-114). This is irrelevant to WP-116 because no EC file is created.

**Rationale:** WP-116 matches the D-10001 risk profile (binary-verifiable, no engine mutation, no persistence, no ordering surface, no irreversible side effects). It modifies only `docs/**` and `.claude/rules/**` — **no files under `packages/` or `apps/` are staged**, so the commit-msg hook (`.githooks/commit-msg` Rule 5) does not require an `EC-###:` prefix and the D-10001 Amendment 2026-04-26 stub-workaround does not apply. WP-116 commits use `SPEC:` prefix, which Rule 5 permits when no code is staged.

**Citation:** `DECISIONS.md` D-10001 + Amendment 2026-04-26 (controlling precedent for no-EC WPs).

---

## Assumes

- WP-090 complete: Socket.IO transport via `boardgame.io/client` is live; arena-client connects to `apps/server/src/server.mjs` over socket.io.
- `docs/02-ARCHITECTURE.md` and `docs/ai/ARCHITECTURE.md` exist and are currently silent on disconnect/reconnect.
- `docs/ai/DECISIONS.md` exists and accepts new `D-NNNN` entries.
- `docs/01-VISION.md §4` defines multiplayer correctness expectations.
- `docs/ai/work-packets/WORK_INDEX.md` has WP-116 reserved (or this WP claims the next free slot at draft time).

If any of the above is false, this packet is **BLOCKED**.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md` — full read; the file has **no** `## Transport` section (verified 2026-04-30 against HEAD `723a73f`; section list is `## Architectural Principles`, `## Section 1`, `## Section 2`, `## Section 3`, `## Section 4`, `## MVP Gameplay Invariants`, `## Section 5`, `## High-Level System Diagram`, `## HTTP API Surface`, `## Client Routing`, `## Internationalization`). Insert the new `## Disconnect & Reconnect Semantics` section **after `## Internationalization`** (the last sequential top-level section before EOF). The new section must not contradict the transport row that lives in `docs/02-ARCHITECTURE.md §Transport` (line 154 — "Match state sync = Socket.IO 4.8.x via boardgame.io/client").
- `docs/02-ARCHITECTURE.md §Transport` (line 150) — mirror section is inserted **after `## Transport`** to keep transport + disconnect/reconnect adjacent. Mirror table format and add the new section under it.
- `docs/01-VISION.md §4` — multiplayer correctness covenant; read to bound the policy choices.
- `docs/ai/DECISIONS.md` — scan recent entries (D-9901..D-9905, D-10001+) for governance-only-WP precedent; match wording style.
- `docs/ai/work-packets/WP-099-auth-provider-selection.md` — structural precedent for a code-free governance WP that produces only doc text + DECISIONS entries.
- `docs/ai/REFERENCE/00.6-code-style.md` — style guide for the prose written into the architecture doc.
- `apps/server/src/server.mjs` — read the current Server() wiring; confirm there is no existing reconnect handler so the policy does not collide with shipped code.
- `apps/arena-client/src/client/bgioClient.ts` — read to confirm the current Client() configuration; the policy must be implementable by a future WP without re-architecting this file.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md` (applies to any prose / examples in the policy doc)
- Full file contents for every new or modified doc — no diffs, no snippets

**Packet-specific:**
- **No code changes.** This is a governance-only WP. Files under `packages/`, `apps/`, `data/`, or `.claude/rules/` (other than architecture.md cross-reference) MUST NOT be modified.
- **No boardgame.io configuration changes.** Reconnect parameters (timeouts, retry counts) are not set in this WP.
- **No new npm dependencies.**
- **The policy must not invent a state surface in `G`.** Disconnect tracking, if added later, lives in `boardgame.io` framework state or in server-side session storage — never in `G`. This WP must explicitly state that constraint in the policy text.
- **Phase-aware:** the policy MUST address each of the four phases (`lobby` / `setup` / `play` / `end`) and the three turn stages (`start` / `main` / `cleanup`) explicitly. Silent omission of any phase is a §1 lint FAIL.
- **Determinism preservation:** reconnect MUST NOT introduce non-deterministic behavior into match state. The policy must state this explicitly.
- **Disconnect and reconnect events MUST NOT advance RNG state, auto-resolve randomness, or implicitly execute turn logic.** Any advancement of turn order, phase boundaries, or stage progression triggered by a disconnect or reconnect MUST be an explicit, deterministic policy decision recorded in a `D-116NN` entry. Specifically: a disconnect handler MAY NOT call `ctx.events.endTurn()` or `ctx.events.setPhase()` as a side effect of the disconnect itself — only as the explicit consequence of a policy choice with a `// why:` comment citing the corresponding D-entry.

**Session protocol:**
- If any `[DECISION REQUIRED]` block in this WP cannot be resolved by reading prior governance, STOP and ask before proceeding.

**Locked contract values:**
- **Phase names:** `'lobby'` | `'setup'` | `'play'` | `'end'`
- **TurnStage values:** `'start'` | `'main'` | `'cleanup'`

---

## Decision Points (Resolved 2026-04-30 per pre-flight PS-3)

All five required decisions (and the optional sixth) resolved before lint-gate self-review per the WP's own header gate. Each entry below records the chosen option, rationale (Vision-clause-grounded where applicable), and rejected options. The corresponding `DECISIONS.md` entries (D-11601..D-11605, plus a one-line D-11606 deferred-default preamble marker mirroring WP-117's D-11703 N/A pattern) are appended at execution time per `## Definition of Done`.

> **Numeric values are illustrative only.** Examples like "60s" or "5 minutes" do NOT commit the project to those values — concrete timer values are gathered by a future implementation WP from production telemetry (see Out of Scope). What this WP commits is the *class* of policy (fixed vs phase-aware vs deferred-to-defaults), not the magnitude.

### D-11601 — Rejoin grace window → **Option B (phase-aware)**

A phase-aware grace window: longer in `play` (mid-turn drops are the most painful failure mode the WP is designed to address); shorter in `lobby` / `setup` / `end` (drop-during-lobby is functionally a leave-and-rejoin, not a recoverable interruption). Concrete window magnitudes per phase are NOT locked here — the future implementation WP gathers production telemetry and locks numbers under its own DECISIONS entry per `## Out of Scope`.

- *Rationale:* Vision §4 (Faithful Multiplayer Experience — *"Multiplayer synchronization, reconnection, and late-joining must be reliable"*) and Vision §3 (Player Trust & Fairness — opaque automation is forbidden; the policy must visibly distinguish recoverable interruptions from voluntary leaves). The WP body itself names this tradeoff: *"B matches game UX (mid-turn drops are more painful than lobby drops)"*. A phase-aware class is structurally compatible with §3 because every transition is observable via deterministic `G.messages` entries and the per-phase magnitudes are server-side configuration (not in `G`, not in moves).
- *Rejected:*
  - **Option A (fixed window regardless of phase):** under-serves the load-bearing `play.main` mid-turn case the WP names as primary motivation. A fixed window long enough for `play` is wastefully long for `lobby`; a window short enough for `lobby` is unfair for `play`. The simplicity gain does not outweigh the per-phase fairness loss.
  - **Option C (defer to boardgame.io defaults):** explicitly forbidden by `## Goal` line 26 (*"This WP explicitly forbids implicit reliance on boardgame.io's built-in disconnect / reconnect behavior"*). Option C as written would produce a policy that drifts whenever the framework version is bumped — exactly the silent-drift failure mode Vision §14 forbids.

### D-11602 — Turn-handover-on-disconnect during `play.main` → **Option B (pause match)**

The match is **paused** for the duration of the rejoin grace window plus any extension up to the D-11604 abandonment threshold. The "pause" definition (binding on the future implementation WP) is: all players are blocked from advancing turn or phase state — **no moves are accepted, no `ctx.events.endTurn()` or `ctx.events.setPhase()` calls fire** as a side effect of the disconnect itself. Read-only actions (viewing current `G` projection, chat if implemented) MAY remain available. The socket connection itself is NOT frozen — clients continue receiving heartbeats; only authoritative-state-mutating moves are gated. The pause is **bounded** by D-11604's hard-timeout abandonment threshold, so Option B does not create unbounded zombie matches.

- *Rationale:* Vision §3 (Trust & Fairness — Option A's auto-pass would penalize the dropped player without consent or a fair grace window; pause is fair). Vision §1 (Rules Authenticity — tabletop Legendary semantics treat a player stepping away as the table waiting, not as the table proceeding without them). The pause bound (D-11604 = A hard timeout) prevents the well-known "B is fair but lets one drop hang the room" failure mode the WP body names. The structural pause definition (no `ctx.events.*` calls, no moves accepted) directly matches `## Non-Negotiable Constraints` line 95 (*"a disconnect handler MAY NOT call `ctx.events.endTurn()` or `ctx.events.setPhase()` as a side effect of the disconnect itself"*).
- *Rejected:*
  - **Option A (auto-pass turn):** keeps games moving but penalizes the dropped player — directly violates Vision §3's covenant that *"the system enforces rules with perfect neutrality — it never makes strategic decisions on behalf of players"*. Auto-passing a turn IS a strategic decision (it forfeits the dropped player's main-phase actions), made by the system, on the dropped player's behalf, without their authorization.
  - **Option C (host-decides):** adds UI complexity (host controls, host-promotion-on-host-drop, host-abuse mitigation) without a concrete consumer demand. The WP body line 122 names this tradeoff: *"C adds UI complexity but matches tabletop norms"*. Option C is reversible — a future WP can supersede D-11602 with Option C and add the host-controls surface under its own scope when host-decides is requested by a real consumer.

### D-11603 — Lobby ready-state on rejoin → **Option B (cleared on disconnect)**

When a player disconnects from the `lobby` phase, their ready flag (`G.lobby.ready[playerId]` per `packages/game-engine/src/types.ts` `LobbyState`) is cleared. On rejoin, the player must explicitly re-ready before the lobby may transition to `setup`. Server-side ready-state caches (Option A's mechanism) are explicitly forbidden by this decision.

- *Rationale:* Vision §3 (Trust & Fairness — *"No hidden modifiers, manipulated randomness, or opaque automation"*). A flapping connection that auto-restores readiness creates an opaque automation surface: the player did not actively confirm readiness for the post-flap state, but the system records them as ready. That is exactly the implicit-state-confirmation pattern §3 forbids. The friction cost is per-rejoin (one click per drop event) and the safety property is structural — Vision §3 wins.
- *Rejected:*
  - **Option A (ready state preserved across reconnect):** friendlier ergonomics but the WP body itself names the failure mode: *"a flapping connection can falsely confirm readiness"*. Under Option A, a player whose connection drops at the moment another player toggles a ready-affecting parameter (scheme change, hero-selection mode change per WP-093 D-9301) would be auto-confirmed as ready under the new parameters they never saw — a Vision §3 covenant violation. Reversible — a future WP can supersede D-11603 with a refined Option A that re-confirms-on-rejoin (effectively a hybrid) if the per-rejoin click friction proves load-bearing.

### D-11604 — Mid-match abandonment threshold → **Option A (hard timeout → match ends; replay emitted with `endReason: 'abandoned'`)**

After the rejoin grace window from D-11601 elapses without the dropped player rejoining, an additional **hard timeout** elapses and the match is forcibly ended. The match-end transition emits a deterministic replay (per D-11605) with an explicit `endReason: 'abandoned'` field. The hard-timeout magnitude is NOT locked here — the future implementation WP gathers production telemetry and locks numbers under its own DECISIONS entry per `## Out of Scope`. What this WP commits is the *class*: deterministic threshold ⇒ deterministic match end ⇒ replay emitted with explicit `endReason`.

- *Rationale:* Vision §3 (Trust & Fairness — bounded outcomes; no zombie matches that the system has no recovery path for) and Vision §22 (Deterministic & Reproducible Evaluation — the abandonment trigger is a deterministic threshold, not a moderator decision, so the replay re-scores deterministically). Pairs cleanly with D-11602 = B (pause is capped by abandonment, not unbounded). The `endReason: 'abandoned'` field is the seam for downstream filtering (WP-115 leaderboard, future replay-viewer WP) to distinguish abandonment-triggered match ends from natural game ends without inspecting the replay body.
- *Forward-link to future implementation WP:* the full closed set of `endReason` values (e.g., `'natural-victory' | 'natural-defeat' | 'abandoned' | ...`) is locked at the future implementation WP that wires the policy. D-11604 commits only that the field is required and that `'abandoned'` is one valid value. This mirrors the WP-118 D-11804 status-enum closed-set pattern (locking the field-presence + one canonical value here, deferring the full enum to the implementation surface).
- *Rejected:*
  - **Option B (vote-to-abandon by remaining players):** respects player agency but requires a UI surface (vote prompt, vote-tally state, vote-timeout policy) no consumer demands today. Reversible — a future WP can supersede D-11604 with Option B and add the vote-controls surface when the policy concern emerges.
  - **Option C (no automatic abandonment):** risks zombie matches that the system has no recovery path for. Vision §3 covenant *"All game state transitions must be inspectable, logged, and defensible"* is harder to satisfy when matches sit indefinitely in a paused state with no operator-visible end condition. Operations Guardrails (Vision §"Operational Guardrails") implicitly require bounded match lifecycle for capacity planning.

### D-11605 — Replay-on-abort behavior → **Option A (replay always emitted, with explicit `endReason` field)**

Every match end — natural victory, natural defeat, or abandonment per D-11604 — emits a deterministic replay. The replay record always carries the `endReason` field defined under D-11604. Partial replays under abandonment must be **byte-replayable from recorded inputs up to the abandonment point** per the Vision §22 constraint preserved verbatim under *Vision constraint preserved verbatim* below. Stub records (Option B) are forbidden — there is exactly one record shape, distinguished by the `endReason` discriminator.

- *Rationale:* Vision §22 (Deterministic & Reproducible Evaluation — *"If a game can be replayed, it must produce the same score. Anything else is invalid"*) and Vision §24 (Replay-Verified Competitive Integrity — *"All leaderboard entries must be backed by a complete, deterministic replay ... immune to tampering, editing, or manual adjustment"*). Option A keeps the replay format uniform: downstream consumers (WP-115 leaderboard, future replay-viewer WP, replay-validation tooling) work against one record shape; abandonment is a discriminator value, not a separate record type. Vision §14 (Explicit Decisions, No Silent Drift) is preserved because the discriminator is explicit on every record.
- *Vision constraint preserved verbatim:* whichever option is chosen, abandonment MUST NOT produce non-deterministic replay semantics — partial replays under Option A must be byte-replayable from the recorded inputs up to the abandonment point. "Partial replay" semantics that can't be deterministically reproduced are forbidden under either option.
- *Rejected:*
  - **Option B (replay emitted only on natural game end; abandonment produces a stub record):** cleaner per-record but creates two record types that bifurcate downstream consumers. WP-115 leaderboard would have to special-case stubs (display? hide? aggregate?); the future replay-viewer WP would have to detect record-type and branch. The bifurcation cost is per-consumer and grows over time. The "stub records must NOT claim replay semantics they don't have" Vision constraint already forbids the most common Option B failure mode (stub records labelled as replays); under that constraint, Option B's record-type bifurcation buys nothing the `endReason` discriminator does not.

### D-11606 — Spectator behavior on player drop → **Option A (default — defer)**

This WP makes no guarantees about spectator behavior on disconnect. Spectators observe whatever outcome the player-policy (D-11601..D-11605) produces, with no separate handling. **Spectator-disconnect handling is undefined and forbidden from being inferred by implementation WPs.** No D-11606 entry is created in `DECISIONS.md` at execution close — instead a one-line preamble marker is added (mirroring WP-117's D-11703 N/A preamble pattern) so that grep-by-decision-ID queries find an explicit "deferred — see WP-116" hit rather than a missing entry.

- *Rationale:* No spectator surface ships today; locking spectator semantics absent a concrete consumer is the "decide before code exists" trap pattern the WP-117 D-11704 deferral established. The `## Decision Points` original Option A wording (*"undefined and forbidden from being inferred"*) is preserved as the binding posture: future spectator-focused WPs that wire the spectator surface must supersede D-11606 with their own Option B decision; they may not silently extend the player-policy to spectators.
- *Forward-link to future spectator-focused WP:* the future WP that introduces a spectator surface owns the D-11606 supersession with full §17 Vision Alignment treatment (Vision §3 trust covenant for spectator visibility; Vision §11 stateless-client posture for spectator state). Until then, the deferral is the policy.
- *Rejected:*
  - **Option B (opt in now):** premature without a concrete consumer; would add a sixth decision row to the phase × event matrix and a sixth DECISIONS entry for a surface no current WP touches. The deferral is reversible by a future WP that names the consumer.

### File-allowlist consequence (per pre-flight PS-3 resolution)

D-11601 = B, D-11602 = B, D-11603 = B, D-11604 = A, D-11605 = A, D-11606 = A (defer) ⇒ resolved file count is **6** (governance-core only): `docs/ai/ARCHITECTURE.md`, `docs/02-ARCHITECTURE.md`, `docs/ai/DECISIONS.md`, `.claude/rules/architecture.md`, `docs/ai/STATUS.md`, `docs/ai/work-packets/WORK_INDEX.md`. No conditional additions are in scope under the resolved path. The executing session must verify `git diff --name-only` matches all 6 files exactly; any other file modified is a scope violation.

---

## Scope (In)

### A) Architecture-doc additions
- **`docs/ai/ARCHITECTURE.md`** — modified: add `## Disconnect & Reconnect Semantics` section after `## Transport` (or wherever the existing layout dictates). Section MUST include:
  - A **phase × event matrix** with rows = phases (`lobby` / `setup` / `play` / `end`) and columns = events (`disconnect` / `reconnect` / `timeout`), with an explicit outcome stated in each of the 12 cells. Prose-only coverage is **insufficient** — the table is mandatory. For `play.main`, an additional row covering turn-stage interactions (`start` / `main` / `cleanup`) MAY be added but does not replace the four-phase row.
  - Rejoin grace policy (per D-11601).
  - Turn-handover-on-disconnect policy for `play.main` (per D-11602).
  - Lobby ready-state policy on rejoin (per D-11603).
  - Abandonment policy (per D-11604).
  - Replay-on-abort policy (per D-11605).
  - Explicit statement: "Disconnect tracking does not mutate `G`."
  - Explicit statement: "Disconnect / reconnect events do not advance RNG state or implicitly execute turn logic."
  - Cross-link to `D-11601..D-11605` (and `D-11606` if opted in).
- **`docs/02-ARCHITECTURE.md`** — modified: mirror section, with summary-level prose appropriate to the human-facing doc. Cross-link to the authoritative version.

### B) DECISIONS entries
- **`docs/ai/DECISIONS.md`** — modified: append `D-11601` through `D-11605` (and `D-11606` if not deferred). Each entry follows existing format: title, rationale, alternatives considered, references.

### C) Rules cross-reference
- **`.claude/rules/architecture.md`** — modified: add a one-line pointer to the new architecture-doc section under the existing "Layer Boundary" or a new "Disconnect & Reconnect" subsection. Do not duplicate the policy text — pointer only.

### D) STATUS update
- **`docs/ai/STATUS.md`** — modified: append a one-line entry stating "Disconnect/reconnect policy locked at WP-116 (policy only — no server or client implementation; any implementation MUST cite WP-116 + D-11601..D-11605)."

### E) WORK_INDEX entry
- **`docs/ai/work-packets/WORK_INDEX.md`** — modified: check WP-116 off with date and Commit hash; add notes summarizing the five locked decisions.

---

## Out of Scope

- **No implementation.** No code in `apps/server`, `apps/arena-client`, `packages/game-engine`, or anywhere else.
- **No timer / timeout numerical values committed.** Policy classes only; concrete values gathered by future implementation WP from production telemetry.
- **No spectator-disconnect handling** — D-11606 = A (default-defer); a future spectator-focused WP owns the supersession with full §17 Vision Alignment treatment if/when a spectator surface ships.
- **No leaderboard / ranking interaction** — that is downstream policy.
- **No auth / session interaction.** Hanko remains deferred per WP-099.
- **No PostgreSQL schema changes.**
- **Refactors of existing transport code.**

**Session protocol — unrelated untracked files (per pre-flight 2026-04-30 PS-5, mirroring WP-030 / D-3001 / WP-117 §Out-of-Scope / WP-118 §5.2 mystery-untracked-file precedent):** the execution session may observe unrelated untracked files in `git status` (e.g., a residual `EC-119-public-leaderboard-http-endpoints.checklist.md` from WP-115 stub work, future arch-inventory regenerations under `docs/ai/audits/`). These are out of WP-116 scope. Do not stage, modify, or comment on them. Stage by exact filename only — never `git add .` / `-A` / `-u`. The WP-116 close-out commit must contain only the resolved-allowlist file diffs and nothing else. The same rule applies to **this prep commit** — only `docs/ai/work-packets/WP-116-disconnect-reconnect-semantics.md` is staged.

---

## Files Expected to Change

- `docs/ai/ARCHITECTURE.md` — **modified** — add `## Disconnect & Reconnect Semantics` section
- `docs/02-ARCHITECTURE.md` — **modified** — mirror section + cross-link
- `docs/ai/DECISIONS.md` — **modified** — append D-11601..D-11605 (and D-11606 if opted in)
- `.claude/rules/architecture.md` — **modified** — one-line pointer to new policy section
- `docs/ai/STATUS.md` — **modified** — one-line capability statement
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check WP-116 off

No other files may be modified. (6 files total — under the `~8 files` soft cap per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §5` line 126.)

---

## Acceptance Criteria

### Architecture doc
- [ ] `docs/ai/ARCHITECTURE.md` contains a `## Disconnect & Reconnect Semantics` section
- [ ] The section contains a phase × event matrix: 4 rows (`lobby` / `setup` / `play` / `end`) × 3 columns (`disconnect` / `reconnect` / `timeout`), with an explicit outcome stated in each of the 12 cells (no `—` or "TBD" placeholders)
- [ ] The section addresses turn-stage drops in `play.main` explicitly (either as an extra row in the matrix or as adjacent prose)
- [ ] The section contains the literal statement: "Disconnect tracking does not mutate `G`."
- [ ] The section contains an explicit statement that disconnect / reconnect events do not advance RNG state, auto-resolve randomness, or implicitly execute turn logic
- [ ] The section cross-links to D-11601..D-11605 (and D-11606 if opted in)

### DECISIONS
- [ ] `docs/ai/DECISIONS.md` contains entries D-11601..D-11605 (and D-11606 if opted in)
- [ ] Each entry names alternatives considered + the chosen option + rationale

### Rules
- [ ] `.claude/rules/architecture.md` contains a pointer to the new architecture section, no duplicated policy text

### Hygiene
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-116 row checked off with date + commit hash
- [ ] No files outside `## Files Expected to Change` were modified (`git diff --name-only`)

---

## Verification Steps

```pwsh
# Step 1 — confirm new architecture section exists
Select-String -Path "docs\ai\ARCHITECTURE.md" -Pattern "^## Disconnect & Reconnect Semantics"
# Expected: one match

# Step 2 — confirm phase coverage in the new section
Select-String -Path "docs\ai\ARCHITECTURE.md" -Pattern "lobby|setup|play|end" -Context 0,0
# Expected: matches inside the new section (visual inspection)

# Step 3 — confirm DECISIONS entries
Select-String -Path "docs\ai\DECISIONS.md" -Pattern "^### D-1160[1-6]|^## D-1160[1-6]"
# Expected: 5 matches (D-11601..D-11605), or 6 if D-11606 is opted in.
# why: regex covers both `### D-NNNNN` and `## D-NNNNN` header forms (DECISIONS.md uses both — D-5201 is `###`, D-9905 is `##`)

# Step 4 — confirm rules cross-reference
Select-String -Path ".claude\rules\architecture.md" -Pattern "Disconnect & Reconnect"
# Expected: at least one match

# Step 5 — confirm no code files touched
git diff --name-only
# Expected: only the six files in ## Files Expected to Change

# Step 6 — confirm no Math.random / Date.now / etc. in modified prose (sanity check vs §18)
# (Doc-only WP; this step is here so the verification list is complete.)
git diff -- docs/ai/ARCHITECTURE.md docs/02-ARCHITECTURE.md | Select-String "Math\.random|Date\.now"
# Expected: no output (prose should cite D-entries instead of token names if discussing forbidden APIs)
```

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] All five (or six) `[DECISION REQUIRED]` blocks resolved with chosen option + rationale recorded in DECISIONS
- [ ] `docs/ai/STATUS.md` updated
- [ ] `docs/ai/DECISIONS.md` updated with D-11601..D-11605
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-116 checked off with today's date
- [ ] No files outside `## Files Expected to Change` were modified
- [ ] Lint-gate self-review (per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md`) passes — including §17 Vision Alignment confirmation

---

## Lint Self-Review

> Filled in 2026-04-30 per pre-flight PS-4, after `[DECISION REQUIRED]` blocks D-11601..D-11606 were resolved in `## Decision Points` to B/B/B/A/A/A-defer. Reviewed against `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md` §1-§20.

| § | Verdict | Justification |
|---|---|---|
| §1 — Work Packet Structure | **PASS** | All required sections present and non-empty: `## Session Context`, `## Goal`, `## Vision Alignment`, `## Execution Checklist (EC)`, `## Assumes`, `## Context (Read First)`, `## Non-Negotiable Constraints`, `## Decision Points` (now resolved with chosen options + rationale + rejected options), `## Scope (In)`, `## Out of Scope` (with the WP-117-style untracked-files protocol), `## Files Expected to Change`, `## Acceptance Criteria` (12 binary checks across 4 sub-groups), `## Verification Steps` (6 PowerShell-native commands), `## Definition of Done` (7 items). |
| §2 — Non-Negotiable Constraints Block | **PASS** | Engine-wide constraints (ESM only, Node v22+, human-style code per `00.6-code-style.md`, full file contents — no diffs / snippets). Packet-specific constraints: no code changes, no boardgame.io configuration changes, no new npm dependencies, no `G` state surface for disconnect tracking, phase-aware coverage mandatory across all four phases + three turn stages, determinism preservation explicit, disconnect/reconnect events MUST NOT advance RNG state or implicitly execute turn logic (line 95 — explicit prohibition on `ctx.events.endTurn()` / `ctx.events.setPhase()` as side effects of disconnect). Session protocol (decision-block resolution gate; untracked-files do-not-stage rule). |
| §3 — Prerequisites (`## Assumes`) | **PASS** | Five explicit assumptions, each grep-verifiable against current HEAD `723a73f`: WP-090 complete (Socket.IO transport shipped 2026-04-24); both architecture docs exist and are silent on disconnect/reconnect (verified — no `## Disconnect & Reconnect Semantics` section anywhere); `DECISIONS.md` exists; Vision §4 multiplayer correctness covenant defined; `WORK_INDEX.md` has WP-116 reserved (verified at `WORK_INDEX.md` line 2423). The blocking-condition language preserved verbatim. |
| §4 — Context References (`## Context (Read First)`) | **PASS** | Specific section references: `docs/ai/ARCHITECTURE.md` (with explicit confirmation that no `## Transport` section exists — anchor is `## Internationalization`); `docs/02-ARCHITECTURE.md §Transport` (line 150) with the "Match state sync" row at line 154; `docs/01-VISION.md §4`; `docs/ai/DECISIONS.md` recent entries (D-9901..D-9905, D-10001+) for governance-only-WP precedent; `docs/ai/work-packets/WP-099-auth-provider-selection.md` as structural precedent; `docs/ai/REFERENCE/00.6-code-style.md`; `apps/server/src/server.mjs` (135 lines — verified no existing reconnect handler at HEAD `723a73f`); `apps/arena-client/src/client/bgioClient.ts` (200 lines — verified no client-side reconnect parameter at HEAD `723a73f`). PS-1 corrected the `## Transport` anchor mismatch. |
| §5 — Output Completeness (`## Files Expected to Change`) | **PASS** | All 6 files listed with `— modified` markers and one-line descriptions per file. File count is **under** the `~8 files` soft cap per §5 line 126 (PS-2 corrected the `§10` → `§5` citation drift). The architecture-doc additions (ARCHITECTURE.md + 02-ARCHITECTURE.md), DECISIONS append, `.claude/rules/architecture.md` cross-link, STATUS line, and WORK_INDEX flip are exhaustive — no conditional additions exist under the resolved B/B/B/A/A/A-defer path. |
| §6 — Naming Consistency | **PASS** | No new field names introduced. `endReason: 'abandoned'` (under D-11604) is the only new identifier; full English word, no abbreviation, follows `00.6-code-style.md` Rule 4. The full `endReason` closed-set is forward-linked to the future implementation WP per D-11604 body. Phase / turn-stage names locked verbatim against `MATCH_PHASES` / `TURN_STAGES` in `packages/game-engine/src/turn/turnPhases.types.ts:17-35`. |
| §7 — Dependency Discipline | **PASS** | `## Non-Negotiable Constraints` line 91 forbids new npm dependencies. No `package.json` edit under any D-11601..D-11606 outcome. WP-090 (transport) is the sole dependency and is complete. |
| §8 — Architectural Boundaries | **PASS** | Layer Boundary per `.claude/rules/architecture.md` is preserved by construction — no engine code touched, no `boardgame.io` import added, no `pg` import, no engine state surface change. The architecture-doc text under D-11602 = B and D-11604 = A explicitly forbids disconnect handlers from calling `ctx.events.endTurn()` or `ctx.events.setPhase()` as side effects of the disconnect itself; the future implementation WP is bound by this constraint. The `.claude/rules/architecture.md` cross-link is one line (pointer only, no policy duplication). |
| §9 — Windows Compatibility | **PASS** | Verification Steps use PowerShell-compatible commands (`Select-String -Path`, `git diff --name-only`, `git diff -- ... | Select-String`); no bash-specific syntax. |
| §10 — Environment Variable Hygiene | **N/A** | No environment variables introduced or referenced. The future implementation WP that wires reconnect-window magnitudes will introduce config (likely env-driven), but that is out of scope for WP-116. |
| §11 — Authentication Clarity | **N/A** | No auth surface touched. WP-099 / WP-112 govern auth; this WP is silent on auth per `## Out of Scope` line "No auth / session interaction. Hanko remains deferred per WP-099." |
| §12 — Test Quality | **N/A** | No tests produced. WP changes no behavior; no test additions or deletions expected. The Vue/Pinia reactivity invariant from WP-064/WP-120 post-mortem and the cross-WP contract scan rule from WP-120 post-mortem both apply only to client-app or contract-bearing WPs and resolve cleanly to N/A here. |
| §13 — Commands and Verification | **PASS** | All 6 verification commands are PowerShell-native or `git`/`pnpm` invocations; each step has expected-output annotation. Step 1 confirms section header. Step 2 confirms phase coverage. Step 3 uses the `### D-NNNNN | ## D-NNNNN` regex (covering both header forms — D-5201 is `###`, D-9905 is `##`) with a `// why:` annotation. Step 5 enforces the no-code-touch invariant. Step 6 is a sanity check on forbidden-token absence in modified prose. |
| §14 — Acceptance Criteria Quality | **PASS** | 12 binary checks across 4 sub-groups (Architecture doc — 6 checks; DECISIONS — 2 checks; Rules — 1 check; Hygiene — 3 checks). Every item is observable via the corresponding Verification Step. No subjective items. The 12-cell phase × event matrix coverage check is explicit; the literal "Disconnect tracking does not mutate `G`" statement and the determinism-preservation statement are each checked separately under the Architecture doc sub-group. |
| §15 — Definition of Done | **PASS** | Section exists with 7 checkboxes covering: all AC pass, all decision blocks resolved (now satisfied per `## Decision Points`), STATUS / DECISIONS / WORK_INDEX updates, scope-boundary check, lint-gate self-review pass (this section). |
| §16 — Code Style | **N/A** | No code produced. Doc-only WP. Prose in the architecture-doc additions and DECISIONS entries follows `00.6-code-style.md` guidance for documentation files (full English words, full-sentence explanations, explicit option-rationale-rejected structure). |
| §17 — Vision Alignment | **PASS** | `## Vision Alignment` block present at lines 32-40. §17.1 trigger surface #4 (Multiplayer synchronization, reconnection, late-joining — Vision §4) is the explicit trigger; §17.1 #2 (Replays, replay verification — Vision §22, §24) also triggered by D-11605 = A. Vision clauses cited verbatim: §3 (Player Trust & Fairness), §4 (Multiplayer correctness), §22 (Replay determinism), §14 (Explicit Decisions). NG-1..NG-7 not crossed. Conflict assertion: "No conflict — this WP preserves all touched clauses". Determinism preservation: explicit (disconnect events recorded as deterministic `G.messages` entries; reconnect re-syncs from authoritative `G`; no new RNG sources, no wall-clock reads inside moves; timeouts are server-side configuration). |
| §18 — Prose-vs-Grep Discipline | **PASS** | Verification Steps use scoped patterns (`^## Disconnect & Reconnect Semantics`, `^### D-1160[1-6]\|^## D-1160[1-6]`, `Disconnect & Reconnect`); Step 5 (`git diff --name-only`) is path-scoped. Step 6 (`git diff -- docs/ai/ARCHITECTURE.md docs/02-ARCHITECTURE.md | Select-String "Math\.random|Date\.now"`) is path-scoped to modified docs only and uses regex anchors that target token call-sites; the policy text mentions `ctx.random.*` and `ctx.events.*` conceptually but does not call them. Per §18.1, the `Math.random|Date.now` grep pattern is doc-only (no source-code scope), so prose mentions are not scope-relevant. |
| §19 — Bridge-vs-HEAD Staleness Rule | **PASS** | This is a forward-locking governance WP, not a repo-state-summarizing artifact. The decisions land at execution time and are HEAD-current by construction. The WP body cites HEAD `723a73f` as the verification anchor for the `## Assumes` block and the `## Context (Read First)` per-doc anchors. The pre-flight (gitignored scratchpad `docs/ai/invocations/preflight-wp116.md`) records the verification state at time of writing. |
| §20 — Funding Surface Gate Trigger | **N/A** | Pure governance / architectural-policy update; no UI surfaces, no user-visible copy, no funding channels referenced. Per §20.1 governance-doc carve-out (line 619-627), this WP does not mention WP-097, D-9701, or §20 in any user-facing-surface context. The rationale per §20.1 *"Applicability is declared, never inferred"*: no §20.1 trigger surface (global navigation funding affordance / registry viewer funding affordance / user profile funding attribution / tournament-specific funding-channel integration / user-visible copy referencing donate/support-tournaments/tournament-funding) is present in any of the 6 files modified. |

**Summary:** 14 PASS, 6 N/A (each justified per §10 / §11 / §12 / §16 / §20 N/A discipline). Zero FAIL. Lint gate satisfied.

**Pre-Session Actions Resolved (2026-04-30):**

- [x] PS-1 — `## Context (Read First)` updated to name the actual per-doc anchors (`docs/ai/ARCHITECTURE.md` after `## Internationalization`; `docs/02-ARCHITECTURE.md` after `## Transport`); the `## Transport` conflation removed.
- [x] PS-2 — `## Files Expected to Change` citation `00.3 §10` → `00.3 §5` corrected (cap is at §5 line 126).
- [x] PS-3 — D-11601 = B (phase-aware grace), D-11602 = B (pause match), D-11603 = B (ready cleared on disconnect), D-11604 = A (hard timeout → match ends; replay emitted with `endReason: 'abandoned'`), D-11605 = A (replay always emitted with `endReason`); D-11606 = A (default-defer; preamble marker only at execution close, no DECISIONS entry).
- [x] PS-4 — `## Lint Self-Review` filled (this section).
- [x] PS-5 — `## Out of Scope` adds the do-not-stage rule for unrelated untracked files; mirrors WP-030 / D-3001 / WP-117 / WP-118 §5.2 mystery-untracked-file precedent.

**Pre-flight verdict disposition:** Both BLOCKING items resolved (PS-3, PS-4). All 3 RECOMMENDED items accepted and applied (PS-1, PS-2, PS-5). Pre-flight verdict flips to **READY 2026-04-30** on re-verdict (recorded in `docs/ai/invocations/preflight-wp116.md` re-run pass). The copilot check re-run flips initial-pass HOLD → CONFIRM (5 RISK findings resolved per re-run pass).
