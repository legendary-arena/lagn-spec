# Code Checks & Balances System — Legendary Arena

**Project:** legendary-arena.com
**Last Updated:** June 8, 2026

---

## The Question (Rephrased)

In accounting, embezzlement is prevented through **separation of duties** — one person handles accounts payable, another handles accounts receivable, and a third reconciles the books. No single person can both create and approve a transaction. This makes fraud nearly impossible because it would require collusion between multiple people.

**How do we apply that same principle to software development?**

As a solo developer working with AI assistants (Claude), there's a risk that code gets written, merged, and deployed without independent review — the equivalent of one person handling all the money. Bugs, security flaws, bad architecture decisions, and technical debt can slip through unchecked.

The goal: establish a system where code passes through **multiple independent review stages** before it ships — even when you're the only human developer. Each stage has a different focus and a different "set of eyes," whether that's a separate Claude session, a checklist, an automated tool, or a deliberate change of perspective.

**This is a control system, not a ceremony.** The full pipeline is the *maximum* rigor, reserved for the changes that can actually hurt you. A typo fix and a payment-flow rewrite do not get the same treatment. Risk decides how much of the system you run (see §3), and every gate below resolves to a binary pass/fail so the decision can't be quietly fudged.

---

## Table of Contents

1. [The Four Agents](#the-four-agents)
2. [The Workflow](#the-workflow)
3. [Risk Classification & Control Matrix](#risk-classification--control-matrix)
4. [Agent 1: The Architect (Documentation & Planning)](#agent-1-the-architect)
5. [Agent 2: The Builder (Writing Code)](#agent-2-the-builder)
6. [Agent 3: The Inspector (Review & Maintenance)](#agent-3-the-inspector)
7. [Agent 4: The Evaluator (Acquisition Readiness)](#agent-4-the-evaluator)
8. [The Merge Gate & Required Artifacts](#the-merge-gate--required-artifacts)
9. [How to Implement This Solo](#how-to-implement-this-solo)
10. [Checklists](#checklists)
11. [CI Required Checks (Your Silent Fifth Agent)](#ci-required-checks)
12. [The Accounting Parallel](#the-accounting-parallel)

---

## 1. The Four Agents

Just like the accounting model, the development process is split across distinct roles, and no single one of them handles a feature end to end. Three agents run the daily build flow — Architect, Builder, Inspector — and a fourth, the Evaluator, audits the *whole system* on a cadence rather than per-feature (see §7). Each agent has a specific mandate and a specific deliverable.

| Agent | Role | Accounting Equivalent | Mandate |
|-------|------|-----------------------|---------|
| **The Architect** | Documentation & Planning | Controller / CFO | Define WHAT to build and WHY before any code is written |
| **The Builder** | Writing Code | Accounts Payable | Write code that matches the Architect's spec — nothing more, nothing less |
| **The Inspector** | Review & Maintenance | Auditor | Verify the code matches the spec, is secure, and is maintainable |
| **The Evaluator** | Acquisition Readiness | Outside Due Diligence Firm | Assess whether the entire codebase is worth buying — could a new team take over tomorrow? |

**The key rule:** The person (or AI session) that writes the code should NOT be the same session that reviews it. Fresh eyes catch what familiar eyes miss.

---

## 2. The Workflow

Every feature, bug fix, or change follows this pipeline:

```
           DAILY WORKFLOW (per feature)
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  ARCHITECT  │────▶│   BUILDER   │────▶│  INSPECTOR  │
│             │     │             │     │             │
│ • Spec doc  │     │ • Code      │     │ • Review    │
│ • Data flow │     │ • Tests     │     │ • Security  │
│ • Acceptance│     │ • Comments  │     │ • Docs sync │
│   criteria  │     │             │     │ • Verdict   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       │         ┌─────────────┐               │
       └────────▶│   FAIL?     │◀──────────────┘
                 │ Back to the │
                 │ right agent │
                 └─────────────┘

        QUARTERLY / PRE-SALE (whole codebase)
              ┌──────────────────┐
              │    EVALUATOR     │
              │                  │
              │ • Documentation  │
              │ • Code quality   │
              │ • Tech debt      │
              │ • Onboarding     │
              │ • Ops readiness  │
              │ • Acquisition    │
              │   score (1–5)    │
              └──────────────────┘
```

**Nothing ships without the Inspector's sign-off — scaled to the change's risk tier (see §3).** If the Inspector finds a problem, it goes back — either to the Builder (code issue) or the Architect (spec issue). This loop continues until the merge gate (§8) passes.

---

## 3. Risk Classification & Control Matrix

The three-agent flow is the *maximum* rigor. Running it for every typo would grind the project to a halt, and a system that's too heavy to follow gets abandoned — which is worse than no system at all. So every change is classified by risk first, and the tier decides how much of the machinery you actually run.

### Risk Classification (Determines Required Rigor)

Classify every change BEFORE work begins:

- **LOW** — UI text, styling, copy, docs, non-functional changes. Nothing a user's money, data, or security depends on.
- **MEDIUM** — application logic, APIs, data transformations, new widgets, state management. Bugs here produce wrong answers, not breaches.
- **HIGH** — authentication, payments, billing, security, data integrity, infrastructure, anything touching customer data or revenue capture.

When in doubt, classify **UP**. A change that *reads* customer data is at least MEDIUM; a change that *writes* it, or gates money, is HIGH. Misclassifying down is how a "quick fix" ships unreviewed into the payment path.

### Control Matrix (Enforceable Gates)

The tier columns show what each control requires at that risk level.

| Control | LOW | MEDIUM | HIGH |
|---|---|---|---|
| Spec required | Lite (bullets) | Full spec | Full spec + threat model |
| Test contract (I/O + invariants) | Optional | Required | Required |
| Builder/Inspector separation | Optional | Required | Required |
| Inspector review | Lightweight | Full | Full + adversarial |
| Severity-based findings (P0–P2) | Optional | Required | Required |
| CI gates (lint / test / type / audit) | Required | Required | Required |
| Coverage must not drop | No | Yes | Yes (strict) |
| Cross-model / cross-platform review | No | Optional | Required |
| Rollback plan | No | Optional | Required |
| Manual human review (Jeff reads every line) | No | Optional | Required |

Two things **never** scale down, at any tier:

- **CI gates always run.** The automation is cheap and never gets tired (see §11).
- **No self-merge of HIGH-risk code without a fresh-eyes pass.** A shared blind spot on auth or payments is the one that costs real money.

This replaces "always do everything" with "do exactly what the risk requires." The point isn't less rigor — it's rigor aimed where it pays.

---

## 4. Agent 1: The Architect (Documentation & Planning)

### When: BEFORE any code is written

### Responsibilities
- Define the feature in plain English (what it does, who it's for, why it matters)
- Write a specification document that includes:
  - **User story:** "As a [user], I want to [action] so that [benefit]"
  - **Data flow:** What data goes in, what comes out, where it's stored
  - **Edge cases:** What happens when things go wrong (empty data, network failure, bad input)
  - **Acceptance criteria:** A numbered list of testable conditions that must be true for the feature to be considered done
  - **Dependencies:** What existing code, APIs, or packages does this touch?
  - **File map:** Which files will be created or modified
- Review and update the project's master documentation (README, API docs, architecture notes) BEFORE the code changes — not after

### Deliverable
A markdown spec file saved in a `/docs/specs/` folder, named by feature:
```
/docs/specs/2026-06-08-add-card-search.md
```

### Test Contract (Required for MEDIUM and HIGH)

A prose spec is *descriptive*; a test contract is *executable*. For any MEDIUM- or HIGH-risk change, the spec MUST pin down concrete examples the Inspector can later check the code against — otherwise "done" is a matter of opinion.

Each test contract specifies:

- **Inputs:** representative example inputs, including at least one invalid one
- **Outputs:** the exact expected output for each input
- **Invariants:** conditions that must ALWAYS hold, valid input or not
- **Failure modes:** what the system does on bad input — and what it must NOT do

Example:

| Field | Value |
|---|---|
| Input | `{ userId: null }` |
| Output | `400` error, body `{ error: "userId is required" }` |
| Invariant | No database write occurs on invalid input |
| Failure mode | Reject and log; never create a partial record |

With the contract in place, "done" has a precise meaning: the code produces these outputs for these inputs and holds these invariants. Nothing softer counts.

### The Architect's Rule
**"The spec is the contract."** The Builder should be able to write the code using ONLY the spec, without needing to ask clarifying questions. If the spec is ambiguous, that's the Architect's fault, not the Builder's. The spec is not a straitjacket, though — when reality contradicts the spec mid-build, the Builder follows the **Spec Deviation Rule** (§5) rather than guessing or silently improvising.

### How to Run This Agent with Claude
Open a Claude session dedicated to planning. Tell Claude:

> "You are the Architect agent. Your job is to write a specification document for this feature. Do NOT write any code. Define what needs to be built, the data flow, edge cases, and acceptance criteria. For MEDIUM/HIGH-risk work, include a test contract (inputs, outputs, invariants, failure modes). Output a markdown spec document."

Save the spec. Close the session. Do not reuse this session for coding.

---

## 5. Agent 2: The Builder (Writing Code)

### When: AFTER the Architect's spec is approved

### Responsibilities
- Read the spec document and build ONLY what it describes
- Write clean, commented code that a stranger could understand
- Write basic tests that verify each acceptance criterion from the spec
- Add inline comments explaining WHY (not just what) the code does
- Flag any spec ambiguities — do NOT guess; send it back to the Architect
- Commit code with clear, descriptive commit messages

### Deliverable
- Working code that passes all tests
- A brief build note (what was built, any deviations from spec, any concerns)
- Code committed to a feature branch (NOT directly to main)

### The Builder's Rules
1. **"Build to spec."** If the spec says three buttons, build three buttons — not four because you thought it would be nice.
2. **"No silent changes."** Any departure from the spec follows the Spec Deviation Rule below — it is written down and reviewed, never improvised quietly.
3. **"No self-review"** for MEDIUM- and HIGH-risk work. The Builder does NOT approve their own MEDIUM/HIGH work — that's the Inspector's job. For LOW-risk changes (per the Control Matrix in §3) a single session may build and self-inspect against the checklist.

### The Spec Deviation Rule

Specs meet reality, and reality sometimes wins. The Builder MAY deviate from the spec ONLY if **all** of these hold:

1. The deviation is written down in the build note (what changed, and why)
2. The deviation is explicitly flagged to the Inspector
3. The Inspector confirms the change is acceptable

A deviation that is *documented and reviewed* is normal engineering. A deviation that is **undocumented or unreviewed** is a **P1 finding** (§6) — it ships nothing until it's resolved. This is the escape valve that keeps "the spec is the contract" from becoming a lie the moment the spec is slightly wrong.

### How to Run This Agent with Claude
Open a NEW Claude session (not the Architect session). Provide the spec document and tell Claude:

> "You are the Builder agent. Here is the spec document for this feature. Write the code that implements this spec exactly. Include comments and basic tests. Flag any ambiguities in the spec — do not make assumptions. If you must deviate from the spec, document the deviation in the build note rather than changing it silently. Do NOT review or critique the spec; just build what it says."

Save the code. Close the session. Do not reuse this session for review.

---

## 6. Agent 3: The Inspector (Review & Maintenance)

### When: AFTER the Builder's code is complete

### Responsibilities
- **Spec compliance:** Read the spec, then read the code. Does the code do what the spec says? Are all acceptance criteria met?
- **Code quality:** Is the code readable? Are there unnecessary complications? Could it be simpler?
- **Security review:** Are there exposed secrets, SQL injection risks, XSS vulnerabilities, or unvalidated inputs?
- **Edge case testing:** Try to break it. What happens with empty data, huge data, special characters, missing fields?
- **Documentation sync:** Does the README / API doc still match the code after this change?
- **Performance:** Any obvious bottlenecks? Unnecessary loops, redundant API calls, memory leaks?
- **Dependency check:** Are new packages necessary? Are they maintained? Any known vulnerabilities?

### Deliverable — Severity-Based Findings (Mandatory Format)

"Looks good to me" is not a review. The Inspector produces a written report with **every finding tagged by severity**, and a **verdict that follows mechanically from the findings** — so the merge decision is a function of the evidence, not a mood.

**Findings**
- **P0 — must fix before merge:** security holes, data loss, incorrect results, determinism violations, anything that breaks production or corrupts data.
- **P1 — must fix before merge:** real bugs, missing error handling, undocumented spec deviations, major maintainability problems.
- **P2 — optional:** style nits, naming, opportunistic cleanups, "nice to have" refactors.

**Verdict Rule (deterministic)**
- Any open **P0** → **FAIL** (back to the Builder — or the Architect, if the spec itself is wrong)
- Any open **P1** → **FAIL**
- Only **P2** remaining → **PASS**

The verdict is not a judgment call; it's a lookup against the open findings. That's what makes the merge gate (§8) impossible to fudge. (The old APPROVED / REVISE / REDESIGN labels still map cleanly: PASS = APPROVED, a P0/P1 in the code = REVISE, a P0/P1 in the spec = REDESIGN.)

### The Inspector's Rules
1. **"Trust nothing."** Assume the code has bugs until proven otherwise.
2. **"The spec is the contract."** If the code does something the spec doesn't mention, that's a flag — either the spec is incomplete or the Builder went off-script (and, if so, the Spec Deviation Rule should already have caught it).
3. **"No fixing."** The Inspector does NOT fix the code. They report what's wrong, by severity. The Builder fixes it. This prevents the Inspector from becoming the Builder — and from reviewing their own repairs.

### How to Run This Agent with Claude
Open a THIRD Claude session (not the Architect or Builder session). Provide BOTH the spec document AND the code, then tell Claude:

> "You are the Inspector agent. Here is the spec document and the code that was written to implement it. Review the code against the spec. Check for: spec compliance, security issues, edge cases, code quality, and documentation accuracy. Tag EVERY finding as P0 (must-fix: security / data loss / correctness), P1 (must-fix: bugs / maintainability / undocumented spec deviation), or P2 (optional). Then state the verdict by rule: any open P0 or P1 → FAIL; only P2 remaining → PASS. Do NOT fix anything — only report what needs to change."

---

## 7. Agent 4: The Evaluator (Acquisition Readiness & Technical Due Diligence)

### When: QUARTERLY (scheduled review) or BEFORE any sale, partnership, or investor conversation

### Scope: the Evaluator reviews the SYSTEM, not the change

The Evaluator is **not part of the feature flow.** It does not gate individual PRs and it never sits between the Builder and a merge. It runs on a cadence — quarterly, before a sale or partnership, or at a major milestone — and it judges the *whole codebase*: documentation, debt, onboarding, operational readiness. Keeping it out of the daily loop is deliberate; loading acquisition-grade due diligence onto every bug fix would be exactly the over-specification this system exists to avoid.

### The Scenario

A company wants to purchase legendary-arena.com. Before they write a check, they send their senior developer or engineering team to review the entire codebase, architecture, documentation, and operational setup. They need to answer one question: **"If we buy this tomorrow, can our team take it over, understand it, maintain it, and grow it — without the original developer in the room?"**

This is the hardest test your code will ever face. The Evaluator doesn't care about individual features. They care about the whole system — how it fits together, how well it's documented, how much technical debt is hiding under the surface, and how expensive it will be to onboard their team.

### What an Acquiring Company Wants to See

#### A. Documentation That Stands Alone

The buyer's team has never seen your code. They need to understand the entire system from documentation alone, without calling you.

**Required documents:**
- **Architecture overview** — a high-level diagram showing how all the pieces connect (frontend, backend, APIs, database, hosting, CDN, third-party services). One page, visual, with arrows showing data flow.
- **Tech stack summary** — every technology used, with version numbers. Vue 3.x, Node.js 2x.x, Cloudflare Pages, WordPress, npm packages with versions. A new developer should be able to recreate the dev environment from this document.
- **Repository map** — a folder-by-folder description of what lives where and why. Not just file names — purpose and relationships.
- **API documentation** — every endpoint, with request/response examples, authentication requirements, and error codes.
- **Database schema** — every table/collection, every field, data types, relationships, and indexes. Include an entity-relationship diagram.
- **Deployment guide** — step-by-step instructions to deploy the application from a fresh machine. If it takes more than one page, the deployment process is too complex.
- **Environment variables** — a complete list of every env var, what it does, and where to get the values (without exposing actual secrets).
- **Third-party service inventory** — every external service the app depends on (Cloudflare, R2 storage, WordPress, npm registry, etc.), with account ownership details, cost, and what happens if the service goes down.

#### B. Code Quality & Consistency

The buyer's developer will read the code. What they're looking for:

- **Consistent style** — does the code follow a single formatting standard throughout? ESLint + Prettier configs should be in the repo and enforced.
- **Naming conventions** — are variables, functions, files, and folders named in a way that explains what they do? A new developer should be able to guess what `applyLeads.ps1` does from the name alone.
- **No dead code** — commented-out blocks, unused functions, abandoned features still in the repo. Dead code signals neglect.
- **Separation of concerns** — is business logic mixed with UI code? Are API calls scattered throughout components, or centralized in a service layer?
- **Error handling** — does the code fail gracefully, or does one bad API response crash the app?
- **No hardcoded values** — magic numbers, hardcoded URLs, inline credentials. Everything configurable should be in env vars or config files.

#### C. Technical Debt Register

Every codebase has technical debt. The buyer expects this. What they DON'T expect is *hidden* debt. A transparent debt register builds trust.

**Maintain a `TECH_DEBT.md` file in the repo root:**

```markdown
# Technical Debt Register

| # | Description | Impact | Effort to Fix | Priority |
|---|-------------|--------|---------------|----------|
| 1 | Card data pipeline has manual steps (PowerShell) | Medium — onboarding friction | High | P2 |
| 2 | No automated test suite for frontend components | High — regressions undetected | Medium | P1 |
| 3 | WordPress integration is tightly coupled | Medium — hard to swap CMS | High | P3 |
```

The buyer will respect honesty far more than discovering debt during their own review. A clean debt register says: "We know what's imperfect, we've prioritized it, and here's what it would cost to fix." Every check listed as *required but not-yet-wired* in §11 belongs in this register — a known gap is a P2 line item, not a surprise.

#### D. Onboarding Speed Test

The ultimate measure: **How long does it take a competent developer who has never seen the code to make their first meaningful contribution?**

- **Under 1 day:** Excellent. Docs are clear, dev environment sets up fast, code is readable.
- **1–3 days:** Acceptable. Some tribal knowledge still in the original developer's head.
- **1 week+:** Red flag. Buyer will either walk away or demand a steep discount.

**How to test this yourself:** Open a fresh Claude session with NO memory of Legendary Arena. Paste only the documentation (not the code). Ask Claude to explain the architecture, set up the dev environment, and implement a small feature. If Claude struggles, a human developer will too.

#### E. Operational Readiness

The buyer needs to know the app won't break the day you walk away.

- **Uptime and monitoring** — even a simple uptime check (UptimeRobot, free tier) shows the app is being watched.
- **Backup strategy** — how is data backed up? How quickly can it be restored?
- **Domain and account ownership** — are registrations, hosting accounts, and API keys under a transferable business account (not a personal Gmail)?
- **Bus factor** — if Jeff is unavailable tomorrow, can someone else keep the site running using only the documentation?
- **Revenue and cost documentation** — monthly revenue, hosting costs, service costs, margins. This lives outside the code repo but is part of the acquisition package.

#### F. Upgrade Path & Roadmap

The buyer is buying the future potential, not just today's product.

- **Roadmap document** — prioritized list of planned features and known issues.
- **Upgrade documentation** — when dependencies need updating (Vue 3.x to 4.x, Node.js version bumps), how complex is it?
- **CHANGELOG.md** — maintained in the repo root, documenting every release.
- **Migration guides** — if the buyer wants to move from Cloudflare to AWS, or WordPress to a headless CMS, how hard is that? The more modular the architecture, the more the codebase is worth.

### The Evaluator's Deliverable

A **Technical Due Diligence Report** with a readiness score:

| Category | Score (1–5) | Notes |
|----------|-------------|-------|
| Documentation completeness | | |
| Code quality & consistency | | |
| Test coverage | | |
| Technical debt transparency | | |
| Onboarding speed | | |
| Operational readiness | | |
| Security posture | | |
| Upgrade path clarity | | |
| **Overall acquisition readiness** | | |

**Score guide:**
- **5** — Ready to sell tomorrow. Buyer's team takes over with minimal friction.
- **4** — Minor gaps. A few documents to write, a few tests to add. 1–2 weeks of cleanup.
- **3** — Significant work needed. Documentation gaps, missing tests, tribal knowledge not captured. 1–2 months.
- **2** — Major concerns. Buyer demands steep discount or extended transition with original developer.
- **1** — Not acquisition-ready. Too much risk without the original developer staying long-term.

### How to Run The Evaluator

**Quarterly self-evaluation:** Every 3 months, open a fresh Claude session (preferably Opus 4.8 or a different platform like Gemini). Paste your repo structure, documentation files, and a sample of code. Tell it:

> "You are the Evaluator agent. You represent a company considering acquiring this codebase. Review the documentation, code structure, and overall readiness as if your team needs to take over this project tomorrow without the original developer. Score each category 1–5 and identify the top 3 gaps that would reduce the acquisition value."

**Before any sale or partnership conversation:** Run the full evaluation. Fix everything scored 3 or below. The cost of fixing gaps before a sale is always lower than the price discount a buyer will demand when they find those gaps themselves.

### The Evaluator's Rules
1. **"Assume the original developer is gone."** If any knowledge exists only in Jeff's head and not in the documentation, it's a gap.
2. **"A buyer sees debt as cost."** Every undocumented piece of technical debt reduces the purchase price.
3. **"The documentation IS the product."** A buyer evaluates the docs before the code. If the docs are poor, many buyers won't even look at the code.
4. **"Test the onboarding."** If a competent developer can't set up and contribute within a day using only the docs, the codebase isn't ready.

---

## 8. The Merge Gate & Required Artifacts

Everything above converges here. The merge gate is the single binary decision — the lock on the vault — and it is **not** a matter of opinion.

### The Merge Gate (Enforced)

A change may merge to `main` ONLY if every one of these is true:

- All wired CI checks are **passing** (see §11)
- **No open P0 findings**
- **No open P1 findings**
- The inspection report is attached (or, for LOW-risk work, the Inspector checklist is completed)
- The spec ID is referenced
- For HIGH-risk work: a rollback plan exists and Jeff has read the diff

If any line is false, the merge is **BLOCKED**. There is no "I'll fix it after it's live" for P0/P1 findings. The one sanctioned exception — an urgent production hotfix — is itself a *documented* path: ship fast, then run the full review **immediately after** it's live (the Hybrid option in §9), and file any findings. Speed is allowed; skipping the gate quietly is not.

### Required Artifacts Per Change

The gate can only be objective if it has objects to check. Every change leaves a paper trail — the equivalent of a receipt behind every transaction:

| Artifact | Where | Required for |
|---|---|---|
| Spec ID | `docs/specs/YYYY-MM-DD-feature.md` | All tiers (LOW: a bullet spec is fine) |
| Build note | PR description or commit body | All tiers |
| Inspection report (P0/P1/P2) | PR comment or `docs/specs/…-review.md` | MEDIUM, HIGH |
| CI run link | PR checks | All tiers |
| Rollback plan | PR description | HIGH |

**No artifact, no merge.** A change with no spec ID and no inspection report is indistinguishable from code that skipped review — so the gate treats it as exactly that: an automatic FAIL. Artifacts are also the audit trail the Evaluator (§7) reads months later to confirm the system was actually followed, not just documented.

---

## 9. How to Implement This Solo

You're one person, but you can enforce separation of duties by using **separate sessions, separate mindsets, and separate checklists.** Match the option to the risk tier (§3) — the heavier setups are for the changes that can actually hurt you.

### Option A: Three Claude Sessions — Same Model (Baseline)

For each feature:
1. **Session 1 (Architect):** Plan and spec the feature. Save the spec file. Close the session.
2. **Session 2 (Builder):** Paste the spec. Write the code. Save the code. Close the session.
3. **Session 3 (Inspector):** Paste BOTH the spec and the code. Get the review. Act on findings.

The sessions must be separate because Claude in one session develops context bias — it becomes attached to its own output and less likely to catch its own mistakes. A fresh session reviews with genuinely fresh eyes.

### Option B: Three Claude Models — Different Strengths (Better)

Use different Claude models for each agent, matched to what that role demands:

| Agent | Recommended Model | Why This Model |
|-------|-------------------|----------------|
| **Architect** | **Claude Opus 4.8** | Most advanced reasoning. The spec needs big-picture thinking, edge case anticipation, and thoroughness. This is where you want the strongest model — a bad spec creates bad code downstream. |
| **Builder** | **Claude Opus 4.6** | Excellent at code generation and following structured specs. Strong with Node.js, Vue 3, and your existing codebase patterns. Reliable, fast, and well-suited for implementation work. |
| **Inspector** | **Claude Sonnet 4.6** | Fast, detail-oriented, and cost-effective for review work. A different model family member than the Builder means genuinely different "eyes" — it won't share the Builder's assumptions or blind spots. Sonnet is also more concise in its output, which is what you want from a reviewer (findings, not essays). |

**Why this works:** Each Claude model has slightly different training emphasis and reasoning patterns. Opus 4.8 is the most thorough thinker (Architect). Opus 4.6 is a strong, reliable coder (Builder). Sonnet 4.6 is fast and sharp at pattern recognition (Inspector). The model differences create natural independence between agents — it's not the same "mind" reviewing its own work.

**How to switch models:** In claude.ai, use the model selector dropdown at the top of each new conversation. In the API, change the `model` parameter. In Claude Code (VS Code), you can configure which model it uses.

### Option C: Cross-Platform — Different AI Companies (Best Independence)

This is the strongest checks-and-balances setup. Each agent runs on a different AI platform, built by a different company, with different training data and different biases. This is the equivalent of hiring three audit firms from three different countries.

**Recommended Cross-Platform Assignment:**

| Agent | Platform | Model | Why |
|-------|----------|-------|-----|
| **Architect** | **Claude** (Anthropic) | Opus 4.8 | Strongest at structured planning, spec writing, and anticipating edge cases. Claude excels at long-form, thoughtful documentation. This is the most critical role — get it right here, everything downstream is easier. |
| **Builder** | **GitHub Copilot** (Microsoft/OpenAI) | GPT-4o or Copilot Chat | Purpose-built for code generation inside VS Code. Copilot has deep training on open-source code patterns, strong autocomplete, and tight IDE integration. It's designed to build, not plan or review. |
| **Inspector** | **Grok** (xAI) or **Gemini** (Google) | Latest available | A completely different AI family ensures maximum independence. Grok tends to be direct and less "polite" about pointing out problems — useful for an Inspector who shouldn't sugarcoat findings. Gemini has strong code analysis and a different training corpus. Either one catches things the Claude/OpenAI family might share as blind spots. |

**Why cross-platform is the gold standard:**

AI models from the same company share training philosophies, safety tuning, and often overlapping training data. They tend to make similar assumptions and have similar blind spots. When Claude reviews Claude's work, it's like having two accountants from the same firm — better than one, but they think alike.

When you use Claude, Copilot, and Grok, you get three fundamentally different perspectives:
- Claude (Anthropic) tends toward thoroughness, safety, and structured thinking
- Copilot (OpenAI) tends toward practical, pattern-matched code solutions
- Grok (xAI) tends toward directness and is less likely to "agree to be agreeable"
- Gemini (Google) has access to different training data and different reasoning patterns

If all three independently agree the code is good, your confidence level is very high. If one flags something the others missed, that's exactly the system working as intended.

**Practical workflow:**

```
1. Open Claude (Opus 4.8)
   → Write the spec document
   → Save as markdown
   → Close

2. Open VS Code with GitHub Copilot
   → Feed it the spec (paste into Copilot Chat or as a comment block)
   → Build the code with Copilot's help
   → Save and commit to feature branch

3. Open Grok (or Gemini)
   → Paste the spec AND the code
   → Ask: "Review this code against this spec.
     Check for: spec compliance, security issues,
     edge cases, code quality. Tag every finding
     P0/P1/P2 and give the verdict: any open P0 or
     P1 → FAIL, only P2 → PASS."
   → Act on findings
```

### Option D: Hybrid — Mix and Match by Situation

Not every task needs the full cross-platform treatment. Scale the rigor to the risk tier (§3):

| Situation | Risk | Approach | Why |
|-----------|------|----------|-----|
| **New feature** | MEDIUM/HIGH | Option C — full cross-platform | Maximum independence, maximum coverage |
| **Complex refactor** | MEDIUM | Option B — three Claude models | Same ecosystem means consistent codebase understanding |
| **Simple bug fix** | LOW | Option A — two Claude sessions (build + inspect) | Fast, lightweight, still has separation |
| **Security-sensitive code (auth, payments)** | HIGH | Option C + manual review | Cross-platform AND you personally read every line |
| **Documentation update** | LOW | Option A — single session is fine | Low risk, no code changes |
| **Production hotfix (urgent)** | any | Fix it fast with Copilot, then do Option C review AFTER it's live | Speed first, rigor second — but always circle back (§8) |

### Cost Comparison

| Approach | Cost | Independence Level | Speed |
|----------|------|--------------------|-------|
| Option A (same model, 3 sessions) | Free (claude.ai) or low API cost | Good | Fast |
| Option B (3 Claude models) | Free (claude.ai model switcher) | Better | Fast |
| Option C (cross-platform) | Varies — Copilot ~$10/mo, Grok free tier available, Claude free tier available | Best | Moderate (switching between platforms takes time) |
| Option D (hybrid) | Low — use expensive options only when risk warrants it | Matched to risk | Balanced |

### Which Option Should You Start With?

**Start with Option B** (three Claude models). It gives you strong independence with zero extra cost and no new tools to learn. You're already in Claude — just switch models between sessions.

**Graduate to Option C** (cross-platform) for anything classified HIGH — user data, authentication, payment processing, or public-facing security. These are the areas where a shared blind spot between models could cause real damage.

**Use Option D** (hybrid) as your daily operating mode once you're comfortable with the system. Match the rigor to the risk, and you'll move fast without cutting corners.

---

## 10. Checklists

> Classify the change's risk tier (§3) **first** — it decides which boxes below are mandatory versus optional.

### Architect Checklist (Before Coding Begins)
- [ ] Risk tier classified (LOW / MEDIUM / HIGH)
- [ ] User story written in "As a... I want... so that..." format
- [ ] Data flow described (inputs, outputs, storage)
- [ ] All edge cases identified and documented
- [ ] Acceptance criteria listed and numbered
- [ ] Test contract written (inputs, outputs, invariants, failure modes) — required for MEDIUM/HIGH
- [ ] Affected files identified
- [ ] Dependencies listed
- [ ] Spec saved to `/docs/specs/` with date prefix

### Builder Checklist (Before Submitting for Review)
- [ ] Code implements ALL acceptance criteria from the spec
- [ ] No features added that aren't in the spec
- [ ] Any spec deviation documented in the build note and flagged for the Inspector
- [ ] Code has inline comments explaining non-obvious logic
- [ ] Basic tests written for each acceptance criterion
- [ ] All tests pass
- [ ] No hardcoded secrets, API keys, or passwords
- [ ] Build note written (what was built, any deviations)
- [ ] Code committed to a feature branch with a descriptive message

### Inspector Checklist (Before Verdict)
- [ ] Every acceptance criterion verified against the code
- [ ] No unspecified features present (scope creep check)
- [ ] Input validation on all user-facing fields
- [ ] No console.log or debug statements left in production code
- [ ] Error handling present for network calls and file operations
- [ ] No exposed secrets or credentials
- [ ] XSS protection: user input is sanitized before rendering
- [ ] SQL/NoSQL injection: queries use parameterized inputs
- [ ] Performance: no unnecessary loops, redundant API calls, or memory leaks
- [ ] Dependencies: all new packages are necessary, maintained, and vulnerability-free
- [ ] Documentation (README, API docs) updated to reflect changes
- [ ] Code runs without errors in a clean environment
- [ ] Every finding tagged P0 / P1 / P2
- [ ] Verdict by rule: any open P0 or P1 → FAIL; only P2 → PASS
- [ ] Required artifacts present for the merge gate (§8)

### Evaluator Checklist (Quarterly or Pre-Sale)
- [ ] Architecture overview document exists and is current
- [ ] Tech stack summary with version numbers is complete
- [ ] Repository map describes every folder's purpose
- [ ] API documentation covers all endpoints with examples
- [ ] Deployment guide works from a fresh machine
- [ ] All environment variables documented (without exposing secrets)
- [ ] Third-party service inventory is complete with ownership details
- [ ] TECH_DEBT.md exists and is up to date
- [ ] CHANGELOG.md is maintained
- [ ] No dead code or commented-out blocks in production files
- [ ] ESLint + Prettier configs enforced in the repo
- [ ] Onboarding speed test passed (fresh Claude session can navigate the docs)
- [ ] Domain and hosting accounts are under transferable business ownership
- [ ] Backup strategy documented and tested
- [ ] Revenue and cost summary prepared (for acquisition conversations)
- [ ] Overall readiness score assigned (1–5 per category)

---

## 11. CI Required Checks (Your Silent Fifth Agent)

Beyond the human/AI agents, automated checks run on every commit and every push. They are objective, tireless, and impossible to argue with — the independent audit that can't be talked into a bad merge. Per the Control Matrix (§3), **CI gates are the one control that never scales down**: they run at every risk tier.

### Required Checks (all must pass)

| Check | Catches | Status in this repo |
|------|----------------|---------------------|
| Lint (ESLint) | Common bugs, unused vars, style drift | **Wired** (blocking) — `pnpm lint` |
| Typecheck (`vue-tsc --noEmit`) | Type errors, null-reference bugs | **Wired** (blocking) — `pnpm typecheck` |
| Unit tests (native `node:test`) | Logic bugs, broken invariants | **Wired** (blocking) — `pnpm test` |
| Coverage floor (lines 90 / branch 80 / funcs 88) | New code shipped without tests | **Wired** (blocking) — `pnpm test:coverage` |
| Build (`vite build`) | Broken imports, Vue template compile errors | **Wired** (blocking) — `pnpm build` |
| Format (Prettier `--check`) | Inconsistent formatting | **Wired** (blocking) — `pnpm format:check` |
| Dependency audit (`pnpm audit`) | Known CVEs in dependencies | Available (workspace-level); not yet a CI step |
| Secret scan | Committed keys, tokens, passwords | To wire |
| Husky + lint-staged | Runs the above automatically before each commit | To wire |
| GitHub Actions (CI) | Runs every check on every push — catches what local checks miss | **Wired** — `Dashboard Gates` job |

> **Honest current state (2026-06-08):** lint, typecheck, unit tests, a coverage floor, Prettier formatting, and the production build all run as **blocking** gates — in CI via the `Dashboard Gates` job (`.github/workflows/ci.yml`) and locally via `pnpm --filter @legendary-arena/dashboard <script>`. (The dashboard source was reformatted to the Prettier baseline in the same change that flipped the gate to blocking.) `pnpm audit` (workspace-level), secret-scanning, and Husky pre-commit hooks are **not** yet wired; each is a tracked line in `TECH_DEBT.md` (§7‑C), not a silent omission. Stack note: the test runner is native **`node:test` via `tsx`**, not Vitest or Jest — write new tests against the existing `*.test.ts` harness, not a new framework.

### The Rule (Non-Negotiable)

**No code merges to `main` unless every wired check passes.** A failing check is a hard stop — never merged "red," never overridden without a written reason in the PR. Run the checks locally before every commit (Husky + lint-staged makes this automatic) and again in CI on every push. Even if all three agents miss something, the automation is the backstop — the lock on the vault that doesn't get tired, distracted, or attached to its own code.

---

## 12. The Accounting Parallel

| Accounting Principle | Code Equivalent |
|---------------------|-----------------|
| Separation of duties | Different agents for spec, code, review, and acquisition readiness |
| Dual authorization | Code requires both Builder completion AND Inspector sign-off |
| Materiality thresholds (audit scope scales with $ at stake) | Risk tiers — LOW/MEDIUM/HIGH scale how much review a change gets (§3) |
| Authorization limits | The merge gate — deterministic P0/P1 block, no self-merge of HIGH-risk code (§8) |
| Audit trail | Git commit history, spec documents, inspection reports — the required artifacts (§8) |
| Reconciliation | Inspector compares code against spec (like reconciling books against bank statements) |
| Independent audit | Automated CI checks (ESLint, tests, `pnpm audit`) — can't be influenced or biased |
| External audit | The Evaluator — like hiring an outside CPA firm to review the books before a sale |
| Segregation of assets | Feature branches — new code is isolated from production until approved |
| No self-approval | The Builder never reviews their own MEDIUM/HIGH code |
| Rotation of duties | Alternate which Claude session acts as which agent — prevents pattern blindness |
| Surprise audits | Periodically review OLD code with a fresh Inspector session — catch accumulated debt |
| Documentation requirements | Every change has a spec (the "receipt") filed before work begins |
| Annual financial statements | Quarterly Evaluator report — the "balance sheet" of your codebase health |
| Transferable books | Documentation that lets a new owner operate without the original accountant |

**The bottom line:** Just as no single person should handle the full flow of money in a business, no single session or mindset should handle the full lifecycle of code. The separation doesn't slow you down — risk tiers keep it proportional, and the binary gates keep it honest. It prevents the kind of mistakes that are far more expensive to fix after they ship.
