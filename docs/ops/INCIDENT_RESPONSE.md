# Incident Response — Severity Levels & Procedures

**Purpose:** Define the four incident severity levels (P0–P3) with
locked examples and required actions, the four-field incident output
requirement, and the P0/P1-immediate vs. P2/P3-backlog split. This
document is the authority for classifying operational events and
deciding how quickly to respond.

The engine does not auto-heal. Monitoring is **passive** — counters
increment, invariants fire, replays fail — but no automated system
decides corrective action. Humans classify each incident against this
document and decide what to do. This is a deliberate design choice:
production incidents are the last signal that an invariant or
assumption has broken, and the correct response depends on context an
automated system does not have.

---

## Severity Levels

The four levels are a closed union. The typed contract
`IncidentSeverity = 'P0' | 'P1' | 'P2' | 'P3'` is exported from
`packages/game-engine/src/ops/ops.types.ts`. Adding a P4 requires a new
D-entry — this is a governance change, not a code change.

Levels are ordered by descending urgency. A P0 demands immediate
action; a P3 is triaged into the backlog. The mapping from each level
to a required action is locked below.

| Level | Example                   | Action                |
|-------|---------------------------|-----------------------|
| `P0`  | Corrupted game state      | Immediate rollback    |
| `P1`  | Replay desync             | Freeze deployments    |
| `P2`  | Invalid turn spikes       | Investigate           |
| `P3`  | Content lint warnings     | Backlog               |

### P0 — Corrupted game state → Immediate rollback

**Example:** an invariant check in production reports that a zone
contains a card the engine believes should not exist there, or `G` is
no longer JSON-serializable, or `villainDeckCardTypes` disagrees with
`villainDeck.deck`.

**Required action:** immediate rollback via
`DEPLOYMENT_FLOW.md` §Rollback. The current production artifact is
producing game state the engine cannot reason about; no further player
traffic should reach it. Declare the rollback, execute the rollback
preflight, and complete the atomic rollback before doing anything else.

**Rationale:** P0 inherits D-0802 fail-loud semantics at the deployment
boundary. A corrupted game state is the runtime-equivalent of an
incompatible data artifact refused at load — the engine has detected
that a load-bearing assumption is broken. Shipping past it means
shipping corrupted data to the next player that joins.

### P1 — Replay desync → Freeze deployments

**Example:** two clients of the same production match disagree about
state after an ordered sequence of moves, or a replay harness run
against a production match produces a state hash that disagrees with
the hash recorded at match time.

**Required action:** freeze all deployment promotions (no `test →
staging`, no `staging → prod`) until the desync is understood.
Investigate concurrently with the freeze — a desync is evidence that
determinism has been lost, which breaks the network-authority model
(WP-032) and the audit trail (WP-027) simultaneously. If investigation
determines the desync is caused by the current `prod` artifact, escalate
to P0 and roll back.

**Rationale:** P1 is the engine's canonical "something subtle is broken,
and I cannot safely proceed" signal. Determinism is the substrate every
other correctness argument rests on; losing it without understanding
why means every subsequent deployment risks amplifying the bug.

### P2 — Invalid turn spikes → Investigate

**Example:** the `rejectedTurns` counter jumps by an order of magnitude
over its baseline, or `validateIntent` starts returning a
previously-rare `IntentRejectionCode` in significant volume, or the
invariant-check suite starts surfacing a category that was previously
quiet.

**Required action:** investigate. No deployment freeze, no rollback —
but a named investigator is assigned, a time-boxed triage begins, and
the finding is filed as either a P1 escalation (determinism / desync
risk), a P3 de-escalation (benign), or a closed P2 with a fix.

**Rationale:** a spike in invalid turns is usually a symptom of either
a client bug (harmless to the server, annoying to players) or a
content bug (a scenario exposing a previously-unreachable code path).
Either deserves attention, but neither is a deployment-freeze event
absent additional signal.

### P3 — Content lint warnings → Backlog

**Example:** `validateContent` reports a warning (not an error) on a
production content bundle, or a content author flags a cosmetic
inconsistency, or a non-critical linter surfaces a style deviation.

**Required action:** backlog. Capture the warning with enough context
to act on it later, prioritize it against other backlog items, and
continue with normal operations. A P3 is not a deployment-blocker, not
an investigation trigger, and not an on-call page.

**Rationale:** P3 inherits D-1234 graceful-degradation semantics. Not
every signal is worth a response; surfacing a warning and recording it
without acting immediately preserves on-call attention for the P0–P2
events that actually require a decision.

---

## D-0802 vs. D-1234 — Severity-Mapping Explanation

The severity ladder (P0 → P1 → P2 → P3) is not an arbitrary ranking; it
is a deliberate mapping from two architectural decisions that govern
when the engine fails loud versus when it degrades gracefully.

- **D-0802 (Incompatible Data Fails Loudly)** governs the load
  boundary. When the engine detects data it cannot reason about, the
  correct response is to refuse the operation with a full-sentence
  explanation. **P0 inherits this semantics at the deployment
  boundary** — corrupted game state is the live-play analogue of an
  incompatible persisted artifact; the correct response is immediate
  rollback, not "continue and see what happens." **P1 inherits the
  same fail-loud semantics for determinism-critical signals** —
  replay desync is an invariant violation in the deterministic-
  reproduction substrate, and the correct response is to stop
  promoting new releases until the invariant is re-established.
- **D-1234 (Graceful Degradation for Unknown Types)** governs the
  runtime tolerance for non-critical variance. When the engine
  encounters a signal that is unexpected but not load-bearing, the
  correct response is to record it and continue. **P3 inherits this
  semantics** — content lint warnings are exactly the kind of signal
  D-1234 was written for; they should be captured, triaged, and
  prioritized, not escalated. **P2 sits between the two extremes**:
  the volume of invalid turns is not immediately load-bearing (the
  engine is rejecting them correctly, per `validateIntent`), but the
  change in rate is a signal worth investigating before it either
  escalates into a P1 determinism concern or de-escalates into a P3
  backlog item.

This mapping lets future authors extend the severity ladder without
re-deriving the principle: a new severity level slots in at the
boundary between "fail-loud at the deployment boundary" and "degrade
gracefully in the runtime observability surface," and cites the
D-entry that applies.

---

## Every Incident Produces Four Fields

Every incident — regardless of severity — produces an incident record
with the following four fields. Records that do not carry all four are
incomplete and must not be closed until they do.

1. **Root cause.** The underlying reason the incident occurred. "A
   migration threw" is a symptom; "the `dataVersion` bump in release
   N added a required field to `MatchSnapshot` but the forward
   migration did not populate it from the prior shape" is a root
   cause. Root cause is the question the incident is actually
   answering; everything else is context.
2. **Invariant violated (if applicable).** The specific engine
   invariant (from `.claude/rules/architecture.md`,
   `.claude/skills/legendary-game-engine/SKILL.md`, `ARCHITECTURE.md` §MVP Gameplay
   Invariants, or a named D-entry) that the incident breaks. If the
   incident does not break any invariant, this field is `n/a` with a
   one-sentence explanation of why — not left blank.
3. **Version implicated.** The `EngineVersion`, `DataVersion`, and
   (if relevant) `ContentVersion` of the artifact on which the
   incident was observed. Version is load-bearing because rollback
   targets are chosen by version identity; a blank version field
   makes the rollback decision ambiguous.
4. **Corrective action.** The concrete follow-up: a rollback
   completed, a release gate added to `RELEASE_CHECKLIST.md`, a new
   invariant check filed, a backlog item opened, or a combination of
   these. Corrective action is the commitment the incident record
   encodes — without it, the same incident will recur.

Incident records are part of the audit trail that makes future
rollback decisions tractable. Keep them durable and searchable.

---

## P0/P1 vs. P2/P3 — Timing

- **P0 and P1 are immediate-action events.** On-call is paged; the
  on-call engineer declares the incident, executes the required
  action (rollback for P0; deployment freeze + investigation for
  P1), and writes the four-field incident record as the incident
  resolves.
- **P2 events are named-investigator events.** A specific human is
  assigned; a time-boxed triage window is set (typically measured in
  hours, not days); the investigator either escalates to P1, de-
  escalates to P3, or closes the P2 with a fix.
- **P3 events are backlog events.** Captured with enough context to
  act on later; prioritized against the rest of the backlog; not
  paged, not time-boxed, not tracked on the on-call dashboard.

The split exists because on-call attention is a finite and
replenishable resource. Spending it on P3 events leaves nothing in
reserve for the P0 events that genuinely need it.

---

## What this document is not

- **Not a runbook.** Concrete per-incident playbooks (e.g., "how to
  roll back the prod database," "how to replay a production match in
  staging") live alongside the per-environment procedures WP-042
  produces.
- **Not an alert configuration.** Alerting integrations are explicitly
  out of scope for WP-035 (monitoring is passive in MVP). Alert rules
  that map `OpsCounters` changes to pages are ops-tooling territory.
- **Not a post-mortem template.** Post-mortems are authored after an
  incident closes; this document defines the classification and the
  incident-record contract that feeds the post-mortem.
