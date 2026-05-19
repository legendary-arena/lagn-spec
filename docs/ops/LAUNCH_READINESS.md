# Launch Readiness — Pre-Launch Gates and Authority Model

**Status:** Authoritative (WP-038)
**Owner:** Release / Launch Authority
**Related decisions:** D-0702 (Balance Changes Require Simulation),
D-0802 (Incompatible Data Fails Loudly), D-0902 (Rollback Is Always
Possible), D-3501 (Ops Metadata), D-3601 (Simulation Types), D-3701
(Beta Types Code Category), D-3704 (Beta Uses the Same Release Gates
as Production), D-3801 (Single Launch Authority), D-3802 (72-Hour
Post-Launch Change Freeze), D-3803 (Launch Gates Inherit from Beta
Exit Gates)
**Companion document:** `docs/ops/LAUNCH_DAY.md`
**Beta exit gate:** `docs/beta/BETA_EXIT_CRITERIA.md`
**Release procedure:** `docs/ops/RELEASE_CHECKLIST.md`

The launch from public beta to general availability (GA) is a
**binary pass/fail decision**. Every readiness gate below is a binary
pass/fail check with a measurable source signal. There is no
partial-readiness state, no partial launch, no scoring, and no
subjective override. **Any single gate failure = NO-GO.** A single
accountable launch authority decides GO or NO-GO once all gates
pass; the authority MAY NOT waive a failing gate.

The engine that runs in beta is the same engine that runs at GA —
**there is no "launch mode," no "GA mode," and no beta-vs-GA code
path** anywhere in `packages/game-engine/`. Launch readiness gates
**observe** the engine; they never mutate it. Launch is a deployment
event, not an engine state transition.

---

## 1. Engine & Determinism Readiness Gates

The four readiness-gate categories below partition the launch surface
into independent risk axes: the engine's deterministic substrate
(this section), the curated content set (§2), the beta exit signal
(§3), and the operational pipeline (§4). Each category produces an
independent verdict; a single failing category fails the whole launch
readiness review.

The engine's authoritative behavior must be intact in the build
proposed for launch. Determinism, replay reproducibility, network
turn validation, and UI projection parity are all binary signals
under the engine contract — see `ARCHITECTURE.md` §MVP Gameplay
Invariants and `ARCHITECTURE.md` §Architectural Principles #1.

| # | Gate | Pass condition | Source signal |
|---|---|---|---|
| 1.1 | No invariant violations in last beta build | `runAllInvariantChecks` (WP-031) reports zero violations across the full open-beta sample (`OpsCounters.invariantViolations` delta from open-beta start equals **0**) | `OpsCounters` (D-3501) + invariant API (WP-031) |
| 1.2 | Replay hash stability verified at scale | `verifyDeterminism` (WP-027) returns a passing `DeterminismResult` for every replay submitted during open beta (**100%** pass rate); the replay state hashes produced by `computeStateHash` match across three independent `replayGame` runs of each replay | WP-027 replay harness output |
| 1.3 | Network turn validation clean under load | `detectDesync` (WP-032) reports zero desync events across the full open-beta sample (`OpsCounters.replayFailures` delta equals **0**) | `detectDesync` + `OpsCounters` |
| 1.4 | Deterministic UI projections match replay playback | The audience-filtered `UIState` projection produced by `buildUIState` (WP-028) matches the projection produced during `replayGame` (WP-029) for every representative replay in the launch suite, byte-identical after canonical serialization | WP-028 / WP-029 projection harness |

**Category 1 verdict:** PASS iff all four gates pass. **Any single
gate failure = NO-GO.**

The engine preserves determinism per `ARCHITECTURE.md` §MVP Gameplay
Invariants, D-3704 (release-gate parity), and the runtime invariant
enforcement landed by WP-031. The launch readiness review asserts
that those locks hold in the build proposed for GA; it does not
introduce new determinism contracts.

---

## 2. Content & Balance Readiness Gates

Content reaching production must have already passed validation
under the engine's load-boundary discipline (D-0802) and must not
carry unresolved balance regressions against the AI simulation
baseline (D-0702).

| # | Gate | Pass condition | Source signal |
|---|---|---|---|
| 2.1 | All content passes validation with zero errors | `validateContent` (WP-033) returns zero `ContentValidationError` entries across the entire launch content bundle; `validateContentBatch` reports zero failing cards | `validateContent` / `validateContentBatch` output |
| 2.2 | No unresolved balance warnings from AI simulation | Every `runSimulation` (WP-036) warning surfaced during the open-beta evaluation window has been either (a) resolved with a content change re-validated by simulation, or (b) accepted under the warning-acceptance discipline below | `runSimulation` output (WP-036) |
| 2.3 | No dominant strategy exceeding defined thresholds | For every scheme × mastermind pair in the curated content set, the dominant-strategy share reported by `runSimulation` falls within the threshold band recorded at WP-036 simulation-baseline establishment; pairs outside the band block launch | `runSimulation` output + WP-036 baseline record |
| 2.4 | Beta balance feedback reconciled with simulation data | Every `BetaFeedback` record with `category: 'balance'` and `severity: 1` from the final 2 weeks of open beta has been compared against the matching `runSimulation` output for the same scheme × mastermind pair; reconciliation finding (confirmed, refuted by simulation, deferred for post-launch monitoring) is recorded against each record | `BetaFeedback` (triaged) + `runSimulation` |

**Category 2 verdict:** PASS iff all four gates pass. **Any single
gate failure = NO-GO.**

**Warning-acceptance discipline.** Content or balance warnings MAY
be accepted only if **all** of the following hold:

1. The warning is explicitly classified as **non-invariant** — it
   does not break any rule in `.claude/rules/architecture.md`,
   `.claude/skills/legendary-game-engine/SKILL.md`, or `ARCHITECTURE.md` §MVP
   Gameplay Invariants.
2. The warning is explicitly classified as **non-competitive** — it
   does not affect win conditions, scoring, or any signal that
   feeds the competitive-integrity surface (Vision §24).
3. The warning is explicitly classified as **non-exploitable** —
   no known sequence of legal moves uses the warning condition to
   gain an advantage outside the design intent.
4. A justification is recorded against the warning in the launch
   readiness review record, naming the human who authored the
   classification and the rationale for each of (1) / (2) / (3).

Acceptance does not waive future correction and does not downgrade
post-launch monitoring priority. Accepted warnings remain on the
post-launch defect backlog at their original severity until a
content fix lands.

---

## 3. Beta Exit Criteria Readiness Gates

The beta exit gate is the structural input to the launch readiness
review. WP-037's binary pass/fail exit gate must be satisfied in
full before this category can be evaluated.

| # | Gate | Pass condition | Source signal |
|---|---|---|---|
| 3.1 | All WP-037 exit criteria satisfied | The `exit(rules, ux, balance, stability)` verdict in `docs/beta/BETA_EXIT_CRITERIA.md` evaluates to `true` for the build proposed for launch | `BETA_EXIT_CRITERIA.md` overall exit verdict |
| 3.2 | No open P0 / P1 issues | The triaged `BetaFeedback` and incident records show zero open P0 or P1 items as of the launch readiness review timestamp | `BetaFeedback` (triaged) + `INCIDENT_RESPONSE.md` severity ladder |
| 3.3 | UX confusion reports below agreed baseline | The per-participant average of `BetaFeedback` records with `category: 'confusion'` from the final 2 weeks of open beta is **≤ 2** across all cohorts (matches `BETA_EXIT_CRITERIA.md` criterion 2.2) | `BetaFeedback` (direct) |
| 3.4 | Kill switch exercised successfully | The launch deployment's rollback rehearsal in `staging` (per `DEPLOYMENT_FLOW.md` §Rollback) completed successfully without data loss against the rollback target identified in the launch readiness review | `DEPLOYMENT_FLOW.md` rollback rehearsal log |

**Category 3 verdict:** PASS iff all four gates pass. **Any unmet
criterion = NO-GO.**

D-3803 anchors this category: launch gates inherit from beta exit
gates. The launch readiness review does not re-derive beta exit
criteria; it consumes them. If `BETA_EXIT_CRITERIA.md` evolves,
this category evolves with it without requiring a separate launch
checklist amendment.

---

## 4. Ops & Deployment Readiness Gates

The release pipeline that promotes the launch artifact must be the
same pipeline that promoted every prior beta build. D-3704 locks
this parity; this category asserts that the parity holds at the
launch boundary.

| # | Gate | Pass condition | Source signal |
|---|---|---|---|
| 4.1 | Release checklist completed | Every gate in `docs/ops/RELEASE_CHECKLIST.md` (Gates 1 through 7) evaluates to **pass** for the launch artifact, with no warnings-as-passes and no skipped gates | `RELEASE_CHECKLIST.md` Gates 1–7 output |
| 4.2 | Rollback executed successfully in staging | A live rollback drill against the launch artifact's predecessor completed in `staging` per `DEPLOYMENT_FLOW.md` §Rollback Rules without data loss; the rollback target is recorded in the launch readiness review record | `DEPLOYMENT_FLOW.md` rollback rehearsal log |
| 4.3 | Migration tested forward | If the launch artifact bumps `CURRENT_DATA_VERSION`, every registered migration from the prior `dataVersion` to the new one executes without throwing per `RELEASE_CHECKLIST.md` Gate 4; if `dataVersion` is unchanged, this gate is **n/a** with a one-sentence justification recorded | `migrateArtifact` output + WP-034 migration registry |
| 4.4 | Monitoring dashboards live and verified | Every `OpsCounters` (D-3501) field consumed by the launch monitoring surface is producing a non-stale value in `staging` against the launch artifact; alert rules mapping `OpsCounters` deltas to the P0 / P1 / P2 / P3 severity ladder per `INCIDENT_RESPONSE.md` are configured and exercised | `OpsCounters` snapshot + `INCIDENT_RESPONSE.md` severity ladder |
| 4.5 | No manual prod changes permitted | The launch artifact is byte-identical to the artifact promoted through `dev → test → staging → prod` per `DEPLOYMENT_FLOW.md` §Promotion Rules; no hot-patches, side-loaded configuration, or manual SQL fixes are present in the launch path (per `DEPLOYMENT_FLOW.md` §No Hot-Patching In Prod) | `stampArtifact` identity check + `DEPLOYMENT_FLOW.md` no-hot-patching rule |

**Category 4 verdict:** PASS iff all five gates pass. **Any single
gate failure = NO-GO.**

---

## 5. Single Launch Authority Model

A single named human is the **launch authority** for each launch
event. The launch authority is the one accountable decision owner
for the GO / NO-GO call. Accountability cannot be spread across a
committee; consensus voting is forbidden because consensus dissolves
accountability under pressure and produces deadlock when fast
decisions are needed.

### 5.1 Non-override clauses

The launch authority operates within the binary pass/fail discipline
of the readiness gates. The following clauses are non-negotiable:

- The launch authority **MAY NOT waive a failing readiness gate**.
  A failing gate is a NO-GO under the gate's own binary verdict;
  no override exists.
- The launch authority **MAY ONLY decide GO or NO-GO once all
  gates pass**. If any gate is unevaluated, mid-investigation, or
  failing, the only available decision is NO-GO.
- The launch authority exists **to prevent deadlock, not to
  override invariants**. The role exists because launch is a
  binary moment that needs a single accountable decision; it does
  not exist to grant subjective overrides over the gates.
- The launch authority **MAY NOT introduce a new gate-acceptance
  discipline mid-review**. Acceptance disciplines (e.g., the
  warning-acceptance discipline in §2) are pre-locked in this
  document; the launch authority applies them, not authors them.

### 5.2 Required sign-offs before GO / NO-GO

Before the launch authority records a decision, the following four
sign-offs must be present in the launch readiness review record.
Each sign-off is a named human attesting that the corresponding
category's gates have been evaluated against current source signals
and the verdict is accurate. The launch authority may request
re-verification of any sign-off but may not waive one.

1. **Engine integrity** — Category 1 (Engine & Determinism)
   verdict has been evaluated against `runAllInvariantChecks`,
   `verifyDeterminism`, `detectDesync`, and the WP-028/029
   projection harness output for the launch artifact.
2. **Replay determinism** — Category 1's replay-specific gates
   (1.2, 1.4) have been verified against three independent
   `replayGame` runs per replay, with byte-identical state hashes.
3. **Content safety** — Category 2 (Content & Balance) verdict
   has been evaluated against the `validateContent` output and the
   WP-036 simulation-baseline record for the launch content bundle,
   and any accepted warnings carry a complete `non-invariant +
   non-competitive + non-exploitable` justification.
4. **Operations readiness** — Category 4 (Ops & Deployment)
   verdict has been evaluated against the rollback rehearsal log,
   the release checklist output, and the monitoring dashboard
   verification.

Category 3 (Beta Exit Criteria) does not require its own sign-off
because its verdict is the consumed `BETA_EXIT_CRITERIA.md` overall
exit verdict — that document is the sign-off.

### 5.3 Decision record

Once all four sign-offs are present and all four category verdicts
are PASS, the launch authority records the decision with:

- The decision: **GO** or **NO-GO**.
- The decision timestamp (UTC, ISO 8601).
- The rationale: a one-paragraph statement explaining why the
  current state of the gates supports the recorded decision. For
  GO, the rationale references each of the four sign-offs by
  signer. For NO-GO, the rationale names the failing gate(s) and
  the corrective action required before re-review.
- The launch artifact's `EngineVersion`, `DataVersion`, and
  `ContentVersion` triple (per WP-034 / D-0801).

The decision record is part of the audit trail and is preserved
indefinitely.

### 5.4 Why a single authority

A single named human prevents the three failure modes that
committee-style launch decisions suffer under pressure:

- **Diffused accountability.** When a launch goes wrong, "the
  committee approved it" is not a debuggable answer. A named
  authority gives the post-incident review a clear starting point
  and preserves the audit trail required by D-0902.
- **Deadlock risk.** A binary launch decision under load needs a
  single decision owner. Consensus voting produces tied votes,
  procedural arguments about quorum, and indefinite "let's
  reconvene tomorrow" loops — all of which translate into
  unplanned operational risk.
- **Gate erosion.** A committee under pressure to ship is more
  likely to negotiate around a failing gate than a single
  authority who is on the record as accountable. The non-override
  clauses in §5.1 are easier to enforce against one person than
  against a roomful of stakeholders.

D-3801 records this rationale formally.

---

## 6. Final GO / NO-GO Verdict Summary

The final launch verdict aggregates the four category verdicts and
the launch authority's recorded decision. Aggregation is a single
boolean expression with no weighting and no partial credit:

```
launch(engine, content, beta_exit, ops, authority_decision) =
  engine.pass
    AND content.pass
    AND beta_exit.pass
    AND ops.pass
    AND authority_decision == 'GO'
```

Any `false` short-circuits the verdict to `false`. The launch is
**blocked** when the verdict is `false`, regardless of which input
caused the short-circuit.

There is no scoring, no partial launch, no "soft launch as a
substitute for failing a gate," and no category substitution.
"Soft launch" in `LAUNCH_DAY.md` is a traffic-shaping discipline
that runs **after** GO has been recorded — it is not a way to
bypass a failing readiness gate.

---

## 7. Relationship to Companion Documents

- `docs/ops/LAUNCH_DAY.md` — the procedural companion. Defines the
  T-1h → T-0 → T+72h timeline once the launch readiness review
  has produced a GO verdict. **A NO-GO verdict halts the launch
  process before any T-1h step runs.**
- `docs/ops/RELEASE_CHECKLIST.md` — the per-artifact gate suite.
  Category 4.1 above consumes its output. Launch is not a
  shortcut around the release checklist.
- `docs/ops/DEPLOYMENT_FLOW.md` — the promotion path. Launch is a
  `staging → prod` promotion under the same atomic-promotion and
  no-hot-patching rules that apply to every prior promotion.
- `docs/ops/INCIDENT_RESPONSE.md` — the severity ladder. The
  launch authority decision record references the same P0 / P1 /
  P2 / P3 ladder used in beta and production.
- `docs/beta/BETA_EXIT_CRITERIA.md` — the input to Category 3.
- `docs/beta/BETA_STRATEGY.md` — beta-period operating model. The
  same release-gate parity (D-3704) that applied to beta applies
  to GA verbatim.

---

## 8. What This Document Is Not

- **Not a per-environment runbook.** Per-environment promotion
  procedures live in WP-042 (Deployment Checklists) and the
  deployment-flow document.
- **Not an alert configuration.** Alert wiring of `OpsCounters` to
  the severity ladder is an ops-tooling concern; this document
  asserts that wiring exists and is verified, not how it is
  implemented.
- **Not a marketing or communications plan.** Launch communications
  are a product concern outside the engine and ops surfaces; they
  do not gate the engineering launch decision.
- **Not a post-launch feature roadmap.** WP-039 (Post-Launch
  Metrics & Live Ops) and WP-040 (Growth Governance) own the
  post-GA forward plan; this document closes at the GO / NO-GO
  decision moment.
