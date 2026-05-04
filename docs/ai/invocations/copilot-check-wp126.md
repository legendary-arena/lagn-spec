# Copilot Check — WP-126 (External Authentication Integration: Hanko Session Verifier)

> **Disposition:** Scratchpad per `.claude/rules/work-packets.md`
> §"Invocation Artifacts (Commit Policy)". Existing
> `copilot-check-wp*.md` files in this directory follow the same
> convention (untracked-by-default; commit only if an EC cites
> normatively). The reconciled, committed record of this check is
> the `## Pre-Flight & Copilot Check Review Log` section appended
> to [`docs/ai/work-packets/WP-126-external-authentication-hanko-session-verifier.md`](../work-packets/WP-126-external-authentication-hanko-session-verifier.md).

**Date:** 2026-05-03
**Pre-flight verdict under review:** READY TO EXECUTE (2026-05-03)
**Inputs reviewed:**
- EC: [`docs/ai/execution-checklists/EC-130-external-authentication-hanko-session-verifier.checklist.md`](../execution-checklists/EC-130-external-authentication-hanko-session-verifier.checklist.md)
- WP: [`docs/ai/work-packets/WP-126-external-authentication-hanko-session-verifier.md`](../work-packets/WP-126-external-authentication-hanko-session-verifier.md)
- Pre-flight: [`docs/ai/invocations/preflight-wp126.md`](preflight-wp126.md) (in-session)

---

## Overall Judgment

**PASS** post-PS-1..PS-4 in-place fixes during pre-flight.

The WP's pre-flight `READY TO EXECUTE` verdict still holds. Findings
surfaced in three categories during the lens scan: Type / contract
integrity (Issue #4 — `Result<T>` parameter mismatch surfaced as
PS-1), Hidden mutation via aliasing (Issue #17 — JWKS cache return
references surfaced as PS-4), and Optional field ambiguity (Issue #5
— `jwksRefreshIntervalMs` default-application surfaced as PS-3).
None of the findings would have caused architectural or determinism
damage at execution because the engine / replay / RNG surfaces are
not touched, but Issue #4 would have caused a mid-implementation
spec-vs-code reconciliation pass and Issue #17 would have allowed a
silent JWKS cache corruption path. Both were resolved in-place
(scope-neutral spec / constraint / AC additions) before this check
returned its disposition. PS-2 (JWKS fetcher injection seam) was
discovered during the pre-flight Runtime Readiness Check, not the
30-issue lens — it's a test-hygiene improvement that prevents global
`fetch` stubbing.

---

## Findings

### 1. Separation of Concerns & Boundaries

1. **Issue #1 (Engine vs UI / App Boundary Drift)** — PASS — server-
   only WP; F-2 grep gates lock containment to
   `apps/server/src/auth/hanko/`; explicit "no orchestrator
   modification" in Out-of-Scope.
2. **Issue #9 (UI Re-implements Engine Logic)** — PASS — no UI
   surface in WP-126.
3. **Issue #16 (Lifecycle Wiring Creep)** — PASS — explicit "no HTTP
   route registration" + `git diff apps/server/src/server.mjs`
   verification gate.
4. **Issue #29 (Assumptions Leaking Across Layers)** — PASS — engine
   does not know auth exists; auth does not import engine /
   registry / preplan / boardgame.io.

### 2. Determinism & Reproducibility

5. **Issue #2 (Non-Determinism)** — N/A — no engine / replay / RNG /
   scoring surface (locked at WP-126 §Vision Alignment determinism
   line).
6. **Issue #8 (No Single Debugging Truth)** — N/A — auth failures
   are observable via closed-union `code` values + log lines; no
   gameplay debugging surface.
7. **Issue #23 (Deterministic Ordering)** — N/A — JWKS cache
   iteration order is not gameplay-relevant.

### 3. Immutability & Mutation Discipline

8. **Issue #3 (Pure vs Immer Mutation)** — N/A — no `G` mutation;
   no Immer use.
9. **Issue #17 (Hidden Mutation via Aliasing)** — **RISK → resolved
   as PS-4.** Original WP-126 spec did not address whether
   `JwksCache.getKey(kid)` returns a direct reference to the cache's
   internal `JsonWebKey`. A misbehaving verifier that mutated the
   returned key (e.g., tagged it with metadata) would corrupt the
   cache for subsequent calls.
   **FIX (applied):** D-12603 constraints now require `Object.freeze`
   at insertion or a defensive shallow copy at return; AC item +
   test case enforce non-aliasing.

### 4. Type Safety & Contract Integrity

10. **Issue #4 (Contract Drift Between Types, Tests, and Runtime)** —
    **RISK → resolved as PS-1.** WP-126 spec text used two-parameter
    `Result<T, E>` syntax in multiple places, but the shipped
    contract at [`identity.types.ts:139–141`](../../../apps/server/src/identity/identity.types.ts)
    is single-parameter `Result<T>` with `IdentityErrorCode` hard-
    wired. WP-112 already emits `code` values outside that union
    and casts at [`sessionToken.logic.ts:191–193`](../../../apps/server/src/auth/sessionToken.logic.ts).
    `apps/server` runs `tsx` transpile-only with no `tsc --noEmit`
    step, so the structural mismatch never errors at build time.
    **FIX (applied):** every signature reference aligned to single-
    param `Result<T>`; new Non-Negotiable Constraint locks the
    posture and cites the orchestrator translation site verbatim.
11. **Issue #5 (Optional Field Ambiguity)** — **RISK → resolved as
    PS-3.** `jwksRefreshIntervalMs?: number` default-application at
    factory time was implicit; could have produced scattered
    substitution sites.
    **FIX (applied):** D-12602 recommended-default block now states
    explicitly that the factory substitutes the D-12603 default
    (300_000 ms) at exactly one site; downstream sees a concrete
    number.
12. **Issue #6 (Undefined Merge Semantics)** — N/A — no merge
    semantics in WP-126.
13. **Issue #10 (Stringly-Typed Outcomes)** — PASS — closed-union
    error codes (`SessionVerificationErrorCode`); discriminated
    `Result<T>`; no free-form strings.
14. **Issue #21 (Type Widening at Boundaries)** — PASS post-PS-1 —
    `SessionVerifier`, `VerifiedSessionClaim`, `Result<T>`,
    `AuthProvider` are all narrow types with no `string` / `any` /
    `unknown` widening at the WP boundary.
15. **Issue #27 (Weak Canonical Naming)** — PASS — `apps/server/src/auth/hanko/`
    locked under D-9904; `createHankoSessionVerifier` mirrors
    `createPlayerAccount` precedent; canonical wire-level field
    names per WP-052 / WP-112 (`accountId`, `authProvider`,
    `authProviderSub`, `authProviderId`, `expiresAt`).

### 5. Persistence & Serialization

16. **Issue #7 (Persisting Runtime State by Accident)** — PASS —
    JWKS cache is in-memory only; no `G` field added; no database
    write.
17. **Issue #19 (Weak JSON-Serializability)** — PASS — no `G` state.
18. **Issue #24 (Mixed Persistence Concerns)** — PASS — JWKS cache
    is operational state, not gameplay state; clearly separated.

### 6. Testing & Invariant Enforcement

19. **Issue #11 (Tests Validate Behavior, Not Invariants)** — PASS —
    test plan asserts per-instance state, single-flight
    deduplication, graceful-degradation on refresh failure, and
    non-aliasing as **invariants**, not just happy-path behavior.

### 7. Scope & Execution Governance

20. **Issue #12 (Scope Creep)** — PASS — explicit allowlist with
    conditional `package.json` modification; `git diff --name-only`
    verification step; "anything not explicitly allowed is
    forbidden" framing in WP-126 Out-of-Scope.
21. **Issue #13 (Unclassified Directories)** — PASS —
    `apps/server/src/auth/hanko/` inherits `server` classification
    per `02-CODE-CATEGORIES.md`; optional D-12605 lock per
    executor's call (mirrors D-5202 / D-10201 / D-10301 / D-11201
    precedent of in-DECISIONS.md classification).
22. **Issue #30 (Missing Pre-Session Governance Fixes)** — PASS —
    four PS items resolved in-place during pre-flight; three RS
    items documented as executor-time concerns; D-12601..D-12604
    listed as required-at-execution; D-11201 status flip from
    `Active` → `Resolved` listed in DoD.

### 8. Extensibility & Future-Proofing

23. **Issue #14 (Extension Seams)** — PASS — replacement-safety
    locked structurally (F-2 + F-6); `SessionVerifier` interface
    admits any verifier; broker swap is a directory replacement.
24. **Issue #28 (Upgrade / Deprecation Story)** — PASS — F-6
    replacement-safety thought experiment passes; deletion of
    `apps/server/src/auth/hanko/` + Hanko deps + `HANKO_*` env vars
    + the catalog row requires zero WP-112 / WP-052 / WP-099 file
    change.

### 9. Documentation & Intent Clarity

25. **Issue #15 (Missing "Why" for Invariants)** — PASS — every
    constraint carries rationale; EC §4 enumerates required
    `// why:` sites including the new D-12603 freeze-or-copy
    invariant, the PS-3 default-application site, and the PS-2
    `config.fetcher` resolution site.
26. **Issue #20 (Ambiguous Authority Chain)** — PASS — explicit
    hierarchy citation in WP-126 §Context (Read First); WP-099 §A /
    §B / §C, D-9901..D-9905, WP-112 D-11201..D-11204, D-11804,
    D-5201 cited verbatim.
27. **Issue #26 (Implicit Content Semantics)** — PASS — federation
    claim → `AuthProvider` mapping is locked under D-12604 (no-
    default; executor must observe a real Hanko token before
    locking lookup-table keys); JWKS endpoint convention locked at
    `${tenantBaseUrl}/.well-known/jwks.json` with tenant-scoped-
    origin semantics.

### 10. Error Handling & Failure Semantics

28. **Issue #18 (Outcome Evaluation Timing)** — PASS — verifier-side
    `expiresAt` defense-in-depth + orchestrator-side canonical lock
    are both clear; verifier-side check rejects expired tokens
    before invoking the resolver, orchestrator-side
    `expiresAt <= now()` is the canonical lock per WP-112.
29. **Issue #22 (Silent vs Loud Failure)** — PASS — closed-union
    error codes + full-sentence `reason` per Rule 11; fail-closed
    default per D-11204; verifier never throws (factory may throw
    only on invalid startup config, validated once).

### 11. Single Responsibility & Logic Clarity

30. **Issue #25 (Overloaded Function Responsibilities)** — PASS —
    `createHankoSessionVerifier` orchestrates verification only;
    `createJwksCache` owns key fetch + cache only; mapping-table
    lookup is its own constant; clear narrow-input/narrow-output
    contracts on every exported function.

---

## Mandatory Governance Follow-ups (at execution)

- **DECISIONS.md entries:**
  - D-12601 (Hanko dependency surface — built-ins-only or `@teamhanko/*` package + version pin)
  - D-12602 (config shape & env-var names; tenant-scoped-origin semantics)
  - D-12603 (JWKS refresh policy — interval, single-flight, freeze-or-copy aliasing defense, interval timer lifetime)
  - D-12604 (federation/IdP claim mapping — exact claim key + per-provider example values + closed-set lookup keys; no draft-time default)
  - D-11201 status flipped `Active` → `Resolved` (per its body's "Status flips to `Resolved` once WP-126 lands")
  - Optional D-12605 (`apps/server/src/auth/hanko/` directory classification) per executor's call
- **02-CODE-CATEGORIES.md update:** optional only if D-12605 is written.
- **WORK_INDEX.md update:** WP-126 row checked off with date + EC-mode commit hash; deferred-placeholder text replaced with completion summary mirroring WP-104 / WP-112 row format.
- **EC_INDEX.md update:** EC-130 row flipped `Draft` → `Done {YYYY-MM-DD}`.
- **03.1-DATA-SOURCES.md update:** optional addition documenting Hanko JWKS endpoint as an external operational input (executor's call; non-blocking per pre-flight Input Data Traceability disposition).

---

## Pre-Flight Verdict Disposition

- [x] **CONFIRM** — Pre-flight `READY TO EXECUTE` verdict stands.
      Session prompt generation authorized when an executor schedules
      the session. PS-1..PS-4 resolved in-place during pre-flight;
      no `RISK` or `BLOCK` findings outstanding.
- [ ] HOLD — N/A
- [ ] SUSPEND — N/A
