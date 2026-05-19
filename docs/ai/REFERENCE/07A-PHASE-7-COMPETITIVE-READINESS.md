# Phase 7 Execution Order & Competitive Readiness Gate

> **Authority:** Subordinate to `docs/ai/ARCHITECTURE.md` and `DECISIONS.md`.
> This gate is a **mandatory process constraint**, not advisory guidance.
> It defines the **execution order**, **integration invariants**, and
> **readiness checklist** for Legendary Arena's competitive system.

---

## Purpose

Phase 7 introduces **public competition**. Once exposed, these systems
create permanent trust guarantees:

- identity and replay ownership
- replay-verified scoring
- public visibility of results

These guarantees **cannot be weakened, reordered, or partially shipped**.

This document prevents:

- launching leaderboards without verification
- accepting scores without identity
- exposing public data without immutability guarantees

If this gate is violated, Legendary Arena stops being trustworthy,
auditable, or competitively fair.

---

## Scope

**Phase:** 7 — Beta, Launch & Live Ops

**Phase 7 Competitive Work Packets:**
- WP-052 — Player Identity, Replay Ownership & Access Control
- WP-053 — Competitive Score Submission & Verification
- WP-054 — Public Leaderboards & Read-Only Web Access

These three packets form a **single inseparable release unit**.
No component may be launched independently.

This gate has two sections:
1. **Execution order** — mandatory sequencing with per-step gates
2. **Readiness checklist** — must be fully satisfied before public launch

---

## Phase 7 Architectural Principle

> **Competition is a chain.**
>
> The chain is only as strong as its weakest link.

Phase 7 is complete **only when the entire chain is complete**.

```
WP-052  →  WP-053  →  WP-054
Identity    Verification    Public Access
```

Breaking this order is a hard correctness failure.

---

## Execution Order (Mandatory)

### Step 1 — WP-052: Player Identity & Replay Ownership

**Blocking prerequisite for everything else.**

WP-052 establishes:

- `PlayerId` as the sole identity primitive
- guest vs account policy (guests cannot compete)
- replay ownership and visibility
- immutability of ownership metadata

**Gate:**

- [ ] EC-052 complete
- [ ] Guests can play and export replays without an account
- [ ] Accounts can own replays server-side
- [ ] Visibility defaults to `private`
- [ ] No identity logic in `packages/game-engine/`
- [ ] `legendary.players` and `legendary.replay_ownership` tables created
- [ ] Drift-detection tests pass for `AUTH_PROVIDERS` and
      `REPLAY_VISIBILITY_VALUES`

If WP-052 is incomplete, **competition must not exist**.

---

### Step 2 — WP-053: Competitive Score Submission & Verification

**Consumes WP-052. Produces authoritative competitive records.**

WP-053 establishes:

- replay-based submission only
- server-side deterministic re-execution
- PAR-gated scoring
- immutable competitive score records

**Gate:**

- [ ] EC-053 complete
- [ ] Client scores are never trusted
- [ ] Every submission re-executes replay via `replayGame`
- [ ] `legendary.competitive_scores` populated with verified records
- [ ] Idempotent submission enforced via `UNIQUE (player_id, replay_hash)`
- [ ] No re-submission across scoring versions
- [ ] Server delegates to engine scoring — no re-implementation

If WP-053 is incomplete, **leaderboards must not exist**.

---

### Step 3 — WP-054: Public Leaderboards & Read-Only Web Access

**Consumes WP-053. Exposes nothing new.**

WP-054 establishes:

- public read-only access to verified results
- deterministic leaderboard ordering
- visibility enforcement
- no new authority
- no mutation paths

**Gate:**

- [ ] EC-054 complete
- [ ] Read-only SELECT queries only — no INSERT, UPDATE, or DELETE
- [ ] Visibility `('link', 'public')` enforced — private excluded
- [ ] No engine imports in leaderboard code
- [ ] No scoring logic in leaderboard code
- [ ] Fail-closed on missing PAR
- [ ] No sensitive fields exposed (`playerId`, `email`, `replayHash`,
      `stateHash`, `scoreBreakdown`)

If WP-054 is incomplete, **public competition must remain disabled**.

---

## Non-Negotiable Phase 7 Invariants

These invariants apply to the **entire phase**, not individual WPs:

- Competition must never exist without identity (WP-052)
- Scores must never exist without verification (WP-053)
- Public views must never create new authority (WP-054)
- No Phase 7 component may be launched independently
- No Phase 7 component may be bypassed
- Identity affects access only — never gameplay, scoring, or RNG
- All competitive records are immutable once created
- All replay ownership is immutable once assigned
- Replay re-execution is the sole anti-cheat mechanism
- The server is an enforcer, not a calculator

Violation of any invariant is a **hard launch-blocking defect**.

---

## Phase 7 Readiness Checklist (Binary)

Phase 7 is considered **READY** only when **all** items are true:

### Identity & Ownership

- [ ] EC-052 complete
- [ ] Guests cannot submit competitively
- [ ] Replay ownership immutable after creation
- [ ] Visibility defaults to `private`
- [ ] GDPR deletion removes ownership metadata and account
- [ ] No identity types in `packages/game-engine/`

### Competitive Verification

- [ ] EC-053 complete
- [ ] All competitive scores replay-verified
- [ ] PAR gate enforced for every submission
- [ ] Competitive records immutable — no UPDATE function exists
- [ ] No client-reported values trusted
- [ ] `stateHash` recomputed and stored for every submission
- [ ] `rawScore` and `finalScore` recomputed via engine contracts

### Public Access

- [ ] EC-054 complete
- [ ] Public access read-only only
- [ ] Deterministic ordering enforced (`finalScore` ASC, `createdAt` ASC)
- [ ] Private replays never visible in any public result
- [ ] No sensitive fields exposed in public types
- [ ] Fail-closed on missing PAR — empty results, not errors

### Layer Boundaries

- [ ] No engine imports across all Phase 7 server code
- [ ] No `boardgame.io` imports in identity, competition, or leaderboard files
- [ ] No scoring logic re-implemented in server code
- [ ] No mutation paths in WP-054 leaderboard code

### Documentation

- [ ] `docs/ai/STATUS.md` updated for all three WPs
- [ ] `docs/ai/DECISIONS.md` updated for all three WPs
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-052, WP-053, WP-054
      checked off with completion dates
- [ ] No prior WP contracts modified (WP-027, WP-048, WP-051)

If any item is false, Phase 7 is **NOT READY**.

---

## Allowed & Forbidden Launch States

### Allowed

- Identity + verification + public access released together
- Closed beta with identity + verification, public access disabled
  via feature flag
- Post-launch leaderboard scaling with **read-only** optimizations
  (caching, pagination tuning)

### Forbidden

- Public leaderboards without verification
- Verification without identity
- Public access with any mutation capability
- "Temporary" bypass of visibility rules
- "Best effort" or partial leaderboard output
- Score display derived from client data
- Independent launch of any single WP without the others

---

## Operational Guidance

- Feature flags may disable **WP-054 public visibility**, but must never:
  - bypass WP-053 verification
  - weaken WP-052 ownership rules
  - expose unverified scores
- Monitoring and metrics are allowed at all stages
- Caching is allowed **only** if it preserves:
  - read-only guarantees
  - deterministic ordering
  - visibility enforcement
  - fail-closed behavior on missing PAR

---

## Relationship to Governance

| Document | Relevance |
|----------|-----------|
| `ARCHITECTURE.md` | Layer boundaries, persistence rules, engine authority |
| `DECISIONS.md` | Identity, ownership, scoring, and verification decisions |
| `WORK_INDEX.md` | Phase 7 WP dependency chain |
| `.claude/skills/legendary-server/SKILL.md` | Server is wiring-only — enforcer, not calculator |
| `.claude/skills/legendary-game-engine/SKILL.md` | Engine owns all gameplay and scoring authority |
| `12-SCORING-REFERENCE.md` | Scoring formula and PAR model (frozen) |
| `13-REPLAYS-REFERENCE.md` | Replay governance, identity policy, privacy controls |

---

## Phase 7 Gate Decision

### Execution Status

- [ ] WP-052 complete — identity and ownership established
- [ ] WP-053 complete — competitive verification operational
- [ ] WP-054 complete — public leaderboards available

### Readiness Verdict

- [ ] All readiness checklist items pass — Phase 7 approved for launch
- [ ] Readiness incomplete — Phase 7 work continues

### Blockers (if any)

| Area | Issue | WP | Status |
|------|-------|----|--------|
| (none at creation) | | | |

---

## Final Statement

Phase 7 represents the moment Legendary Arena becomes **publicly accountable**.

From this point forward:

- games have history
- scores have proof
- leaderboards have meaning

This execution order is not a suggestion.
It is a **release law**.
