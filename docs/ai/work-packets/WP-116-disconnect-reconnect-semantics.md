# WP-116 — Disconnect & Reconnect Semantics (Architecture)

**Status:** Draft (stub — pre-lint, pre-pre-flight; decisions marked `[DECISION REQUIRED]` must be resolved before lint-gate self-review)
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

- `docs/ai/ARCHITECTURE.md` — full read; identify the section after `## Transport` where the new policy section will land. The new section must not contradict the Transport row for "Match state sync" (boardgame.io / Socket.IO 4.8.x).
- `docs/02-ARCHITECTURE.md §Transport` — mirror table format and add the new section under it.
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

## Decision Points (Must be resolved before lint-gate self-review)

> Each block below names a policy choice. The packet author resolves these *before* the WP is linted; the resolutions become the body of the architecture-doc section and the corresponding DECISIONS entries.
>
> **Numeric values in option text are illustrative only.** Examples like "60s" or "5 minutes" do NOT commit the project to those values — concrete timer values are gathered by a future implementation WP from production telemetry (see Out of Scope). What this WP commits is the *class* of policy (fixed vs phase-aware vs deferred-to-defaults), not the magnitude.

### [DECISION REQUIRED] D-11601 — Rejoin grace window
- **Option A:** Fixed window (e.g., 60s) regardless of phase.
- **Option B:** Phase-aware (longer in `play`, shorter in `lobby` / `setup`).
- **Option C:** Defer to boardgame.io defaults; document them and stop.
- *Tradeoff:* A is simplest and easiest to reason about; B matches game UX (mid-turn drops are more painful than lobby drops); C is fastest to ship but means the policy is whatever boardgame.io's defaults happen to be on the version we're on.

### [DECISION REQUIRED] D-11602 — Turn-handover-on-disconnect during `play.main`
- **Option A:** Auto-pass turn (advance to next player after grace window expires).
- **Option B:** Pause match (other players wait until rejoin or abandonment threshold). **"Pause" means:** all players are blocked from advancing turn or phase state (no moves accepted, no `ctx.events.*` calls fired) until the dropped player rejoins or the abandonment threshold from D-11604 is hit. Read-only actions (viewing current `G` projection, chat if implemented) MAY remain available. The socket connection itself is NOT frozen — clients continue receiving heartbeats; only authoritative-state-mutating moves are gated. This distinction is binding on the future implementation WP.
- **Option C:** Host-decides (lobby host can manually pass / abandon).
- *Tradeoff:* A keeps games moving but penalizes the dropped player; B is fair but lets one drop hang the room; C adds UI complexity but matches tabletop norms.

### [DECISION REQUIRED] D-11603 — Lobby ready-state on rejoin
- **Option A:** Ready state preserved across reconnect (server-side cache).
- **Option B:** Ready state cleared on disconnect; rejoining player must re-ready.
- *Tradeoff:* A is friendlier but means a flapping connection can falsely confirm readiness; B is safer but adds friction.

### [DECISION REQUIRED] D-11604 — Mid-match abandonment threshold
- **Option A:** Hard timeout (e.g., 5 minutes past grace window) → match ends, replay emitted with `endReason: 'abandoned'`.
- **Option B:** Vote-to-abandon by remaining players.
- **Option C:** No automatic abandonment — match stays open until manually killed by host.
- *Tradeoff:* A is fair and bounded; B respects player agency; C risks zombie matches.

### [DECISION REQUIRED] D-11605 — Replay-on-abort behavior
- **Option A:** Replay always emitted, with explicit `endReason` field.
- **Option B:** Replay emitted only on natural game end; abandonment produces a stub record.
- *Tradeoff:* A keeps the replay format uniform but stores partial games; B is cleaner but creates two kinds of records.
- *Vision constraint:* This decision is bounded by **Vision §22 (Replay determinism)**. Whichever option is chosen, abandonment MUST NOT produce non-deterministic replay semantics — partial replays under Option A must be byte-replayable from the recorded inputs up to the abandonment point; stub records under Option B must NOT claim replay semantics they don't have. "Partial replay" semantics that can't be deterministically reproduced are forbidden under either option.

### [DECISION REQUIRED — optional] D-11606 — Spectator behavior on player drop
- **Option A (default — defer):** This WP makes no guarantees about spectator behavior on disconnect. Spectators observe whatever outcome the player-policy (D-11601..D-11605) produces, with no separate handling. A future spectator-focused WP may revisit and either confirm this default or specify distinct behavior; until then, spectator-disconnect handling is **undefined and forbidden from being inferred** by implementation WPs.
- **Option B (opt in now):** Specify spectator-disconnect behavior in this WP. Triggers an additional row in the phase × event matrix and a separate D-entry block.

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
- **No spectator-disconnect handling** — deferred unless D-11606 is opted in.
- **No leaderboard / ranking interaction** — that is downstream policy.
- **No auth / session interaction.** Hanko remains deferred per WP-099.
- **No PostgreSQL schema changes.**
- **Refactors of existing transport code.**

---

## Files Expected to Change

- `docs/ai/ARCHITECTURE.md` — **modified** — add `## Disconnect & Reconnect Semantics` section
- `docs/02-ARCHITECTURE.md` — **modified** — mirror section + cross-link
- `docs/ai/DECISIONS.md` — **modified** — append D-11601..D-11605 (and D-11606 if opted in)
- `.claude/rules/architecture.md` — **modified** — one-line pointer to new policy section
- `docs/ai/STATUS.md` — **modified** — one-line capability statement
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check WP-116 off

No other files may be modified. (6 files total — under the `~8 files` soft cap per `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §10` line 126.)

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

> To be filled in by the packet author after `[DECISION REQUIRED]` blocks are resolved and before pre-flight invocation. Mark each §1–§20 lint section as PASS / N/A with one-line justification.
