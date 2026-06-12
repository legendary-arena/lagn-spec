# WP-237 — Site Rules Assistant (Deterministic Retrieval + Claude)

**Status:** DRAFT — Proposal. **Not registered in WORK_INDEX.md. Not
execution-ready.** Five Open Decisions (see §Open Decisions) must be closed by
the operator before this packet can be lint-passed and slotted into the
execution spine. Drafted 2026-06-11.

**Primary Layer:** New **edge service** (Cloudflare Worker) — this layer does
not exist in the current five-layer model (`Registry → Game Engine → Server →
Client`). Standing it up requires an `ARCHITECTURE.md` decision (see Open
Decision D3). It is **not** `apps/server` (the Render game server) and **not**
the game engine.

**Dependencies:** A player-facing rules corpus must exist (Open Decision D2);
the analytics event pipeline (WP-205) should be live to measure the hypothesis
(Open Decision D4). No hard code dependency on a prior WP. Pagefind search
**already ships on `www`** (marketing-repo WP-005); the **pre-flight demand
signal** (see §ROI Hypothesis) is a separate, not-yet-authored marketing-repo
WP, gated on the site-side analytics-platform decision that marketing-repo
WP-021 deferred (no site-side analytics platform exists yet).

---

## Session Context

The 2026-06-11 Pagefind spike proved client-side search is **blocked on the
ewiki** by its CI-enforced JS-free invariant (WP-139 cluster) but is viable on
non-gated surfaces; this packet proposes the *inverse* pattern — **server-side**
deterministic retrieval plus a Claude reasoning layer — for a public
onboarding surface, lifting the genuinely useful idea from the
LLM-orchestrator article (deterministic retrieval tool + LLM that cites it)
while rejecting its OpenAI/Next.js stack in favor of this project's
Anthropic-aligned, edge-hosted reality.

---

## ROI Hypothesis (Operator Sign-Off Required)

This packet exists to test one revenue-adjacent hypothesis, not to ship a
chatbot for its own sake. **It must not be executed until the metric source
and cost ceiling below are confirmed real (Open Decision D4).**

- **Hypothesis:** New players who can ask "how do I play / what does X do?" in
  natural language and get a *cited, source-grounded* answer complete their
  **first match** at a higher rate than players who cannot.
- **Primary metric:** first-match-completion rate for new sessions (from the
  WP-205 analytics events). Target: a measurable lift over the pre-launch
  baseline.
- **Secondary metrics:** bounce rate on the onboarding/play landing surface;
  assistant engagement rate (sessions that ask ≥1 question); refusal rate
  (off-corpus questions correctly declined).
- **Cost ceiling:** Anthropic API spend is capped via per-IP/session rate
  limits + a max tool-iteration cap. Kill the feature if monthly spend exceeds
  the ceiling **without** a measurable completion lift.
- **Kill criteria:** no statistically meaningful first-match-completion lift
  after the agreed measurement window, OR cost-per-incremental-completion above
  the operator's threshold. Either triggers removal, not iteration.
- **Pre-flight demand signal (cheap — do this first).** `www` already has a
  Pagefind search box (marketing-repo WP-005, shipped). **Instrumenting it** to
  log query volume, top queries, and zero-result rate gives a demand signal
  that tests this assistant *before* a dollar of Claude spend: high volume +
  many zero-result rules questions confirms the hypothesis; a quiet search box
  vetoes the build. That instrumentation is itself a small marketing-repo WP,
  gated on the site-side analytics-platform choice (Cloudflare Web Analytics /
  Plausible / minimal custom beacon) that WP-021 deferred.

---

## Goal

After this packet, a **public Cloudflare Worker endpoint** answers
natural-language questions about Legendary Arena rules, grounded **only** in a
deterministic retrieval index built from the curated player-facing rules
corpus. Every answer cites `title + canonical URL + snippet` drawn from tool
output — never an invented link or a fabricated rule. The Worker runs a
**bounded** tool loop (`search_docs` + `fetch_doc`) with a Claude model as the
reasoning layer, behind an origin check + signed token and per-IP/session rate
limits. A **minimal embeddable widget** surfaces it on the agreed onboarding
surface and fires the WP-205 analytics event needed to measure the ROI
hypothesis. Polished multi-turn UI and SSE streaming are explicitly deferred to
a follow-up (see Out of Scope).

---

## Open Decisions (Operator Must Close Before Execution)

This is the part that makes the packet a proposal rather than a ready WP. Each
is a fork the operator owns, not a detail Claude may guess (per
`.claude/rules/architecture.md` "Never guess").

- **D1 — Surface.** Where does the widget live: the `www` marketing
  onboarding page, `play.legendary-arena.com` in-client, or both? Determines
  the analytics seam and the origin-check allowlist.
- **D2 — Corpus.** What is the *player-facing* rules source? Options: a curated
  projection of the rules-bearing `wiki/` pages (`turn-system`, `scheme`,
  `scoring`, `villain-deck`, `master-strike`, `board-keywords`,
  `card-type-taxonomy`); newly authored player docs; or the planned-but-unbuilt
  public player wiki (`wiki.legendary-arena.com`, per `docs/ops/domains.json`).
  **Corpus posture:** `www` already carries player-facing content with stable
  canonical URLs (52 weekly strategy posts, about, tournaments) indexed by the
  shipped Pagefind search (marketing-repo WP-005) — but a *canonical rules*
  section does not yet exist; authoring it is the real D2 gap. The assistant
  builds its **own** clean JSON index from that rules content (Pagefind's
  browser index is not a server-side retrieval source). **Exit criteria: narrow
  + canonical, not complete** — a small, correct, stably-URL'd player-facing
  rules set (core turn / scheme / scoring / keywords), not all rules authored.
- **D3 — Home + layer.** Which repo hosts the Worker, and where does it sit in
  the architecture? It is a new edge-service layer; it needs an
  `ARCHITECTURE.md` + `DECISIONS.md` entry defining its boundaries (it must not
  import the game engine, must not touch `G`/`ctx`, must not query the game DB).
- **D4 — Budget + metric.** The monthly Anthropic spend ceiling, and
  confirmation that the WP-205 analytics events needed for the primary metric
  are live and queryable.
- **D5 — Model + streaming.** The Claude model id (consult the `claude-api`
  skill for current ids — do not hardcode from memory) and whether SSE
  streaming is in v1 or deferred to v2.

---

## Assumes

- A player-facing rules corpus with stable canonical URLs exists (Open Decision
  D2). **If false, this packet is BLOCKED** — author the corpus first.
- The WP-205 analytics-events server is live and the first-match-completion
  event is queryable (Open Decision D4).
- An Anthropic API key is provisioned as a Cloudflare Worker secret (never in
  the repo).
- Node v22+ and pnpm are available for the Worker's build/test tooling.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — read the
  five-layer model and dependency-direction rules. This Worker is a **new**
  layer; D3 must add it here before code lands.
- `.claude/rules/architecture.md` — the enforcement view of the above. Confirm
  the Worker imports neither the engine nor `apps/server`, and never touches
  `G`/`ctx` or the game database.
- `docs/01-VISION.md §1, §2, §10` (card/rules content semantics) and
  `§Non-Goals NG-1..7` — the assistant is read-only and must not fabricate
  rules; see §Vision Alignment.
- The `claude-api` skill — authoritative for current Claude model ids, the
  Messages API, tool-use loop shape, and streaming. **Do not** answer model-id
  or pricing questions from memory.
- `docs/ai/work-packets/WP-205-analytics-events-server.md` — the analytics
  event the ROI metric depends on.
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no
  abbreviations), Rule 6 (`// why:` comments), Rule 9 (`node:` prefix), Rule 11
  (full-sentence error messages), Rule 13 (ESM only).
- The chosen corpus files (D2) — confirm exact canonical URLs and front-matter
  before naming any document id or building the index.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- ESM only, Node v22+ — `import`/`export`, never `require()`.
- `node:` prefix on all Node.js built-in imports.
- Full file contents for every new or modified file in the output — no diffs,
  no snippets.
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`.
- Test files use `.test.ts`. Tests run without network or live-key access
  (stub the Anthropic client and the index).

**Packet-specific:**
- **Citations from tool output only.** Every factual claim in an answer must
  trace to a `fetch_doc` result and render `title + canonical URL + snippet`.
  The model must never emit a URL or a rule not present in retrieved content.
- **Retrieval is deterministic.** `search_docs` runs keyword/BM25 over a
  **precomputed index** — no LLM in the retrieval path. Same query + same index
  ⇒ identical results (mirrors "engine owns truth": the factual layer is
  deterministic; the LLM layer is non-authoritative).
- **Bounded tool loop.** Hard cap on tool iterations per request (reject/return
  a graceful message past the cap) — no runaway loops, no unbounded token burn.
- **Argument guardrails.** `search_docs` clamps `limit` to a max, rejects empty
  `query`, and validates every tool argument against a strict schema before use.
- **Secured entry.** Origin check against the D1 allowlist + a signed shared
  token; per-IP/session rate limit returns 429 past threshold.
- **Anthropic SDK only.** Use `@anthropic-ai/sdk`. **No** OpenAI, no `axios`,
  no `node-fetch` — Node built-in `fetch` where needed.
- **No secrets in the repo.** API key and signing token are Worker secrets;
  `.env.example` documents their names only.
- **Read-only.** The Worker never writes game state, never touches `G`/`ctx`,
  never queries the game database, never imports the game engine or
  `apps/server`.

**Session protocol:**
- If any of the five Open Decisions is unresolved, **stop and ask** — do not
  guess the surface, corpus, home repo, budget, or model id.

---

## Scope (In)

> v1 is the leanest end-to-end slice that can *measure the hypothesis*:
> retrieval + Claude + cite-only + minimal embed + the analytics event.
> Concrete paths below are **provisional pending D3**.

### A) Build-time index
- An indexer script that reads the D2 corpus (front matter + body) and emits a
  deterministic JSON index (id, title, canonical URL, searchable text,
  snippet-able body). Two runs over identical input produce byte-identical
  output.

### B) Retrieval tools
- `search_docs(query, limit, offset)` — deterministic keyword/BM25 over the
  index; clamps `limit`, rejects empty `query`, returns `{ id, title, url,
  snippet }[]`.
- `fetch_doc(id)` — returns the full document body + canonical URL for a given
  id; rejects unknown ids with a full-sentence error.

### C) Reasoning loop
- A Claude Messages-API tool loop (model per D5) that may call `search_docs` /
  `fetch_doc`, capped at a max iteration count, instructed to answer **only**
  from tool output and to refuse off-corpus questions ("I can only answer
  questions about Legendary Arena's rules").
- Deterministic follow-ups: `show more` (pagination via saved last-query
  `offset`) and `summarize result #N` (re-fetch by id) using saved per-session
  last-query state.

### D) Edge entry + guardrails
- The Worker request handler: origin check, signed-token check, per-IP/session
  rate limit, strict request-body validation, then the reasoning loop.

### E) Minimal widget + analytics
- A small embeddable widget on the D1 surface (input + answer + citations
  list). Fires the WP-205 analytics event on use so the ROI metric is
  measurable.

### F) Tests
- `node:test` coverage: retrieval determinism (same query ⇒ same results);
  `limit` clamp; empty-query rejection; unknown-id rejection; tool-loop cap
  enforced; off-corpus refusal; answer payload always carries
  `title+url+snippet`; no `@anthropic-ai/sdk` real network call (client
  stubbed).

---

## Out of Scope

- **The ewiki.** It is blocked by its JS-free invariant (separate concern,
  documented this session) — this packet does not touch `apps/wiki-viewer`.
- **The game engine and `apps/server` game logic.** No moves, no `G`/`ctx`, no
  game-DB access, no boardgame.io.
- **Account creation / user identity.** The assistant is anonymous; auth here
  means origin+token, not player login.
- **A general-purpose chatbot.** Rules-only; off-corpus questions are refused,
  not answered from model priors.
- **SSE streaming and polished multi-turn UI** beyond the minimal embed —
  deferred to a follow-up WP unless D5 pulls streaming into v1.
- Refactors or "while I'm here" improvements not listed in Scope (In).

---

## Files Expected to Change

> **Provisional — concrete paths depend on D3 (home repo + layer).** Listed to
> show shape and bound the surface; finalize on D3 close. Assuming a dedicated
> Worker package `apps/rules-assistant/`:

- `apps/rules-assistant/src/index.ts` — **new** — Worker entry: origin/token
  check, rate limit, request validation, reasoning loop dispatch.
- `apps/rules-assistant/src/retrieval/searchDocs.ts` — **new** — deterministic
  search over the precomputed index.
- `apps/rules-assistant/src/retrieval/fetchDoc.ts` — **new** — id → document
  body + canonical URL.
- `apps/rules-assistant/src/reasoning/claudeLoop.ts` — **new** — bounded
  tool-use loop with cite-only system prompt.
- `apps/rules-assistant/scripts/buildIndex.ts` — **new** — build-time corpus →
  deterministic JSON index.
- `apps/rules-assistant/widget/rulesAssistant.ts` — **new** — minimal embed +
  WP-205 analytics event.
- `apps/rules-assistant/src/**/__tests__/*.test.ts` — **new** — `node:test`
  coverage per Scope (F).
- `apps/rules-assistant/package.json` — **new** — declares `@anthropic-ai/sdk`
  (pin exact version on D5 close); scripts for build/test/index.
- `apps/rules-assistant/.env.example` — **new** — documents
  `ANTHROPIC_API_KEY`, `RULES_ASSISTANT_TOKEN` names only (no values).
- `docs/ai/ARCHITECTURE.md` — **modified** — add the edge-service layer
  boundary (D3).
- `docs/ai/DECISIONS.md` — **modified** — record D3 (layer), D5 (model), and
  the cite-only/determinism contract.

No other files may be modified.

---

## Vision Alignment

- **Vision clauses touched:** §1, §2, §10 (card/rules content semantics);
  Non-Goals NG-1..7 (user-facing, persuasive onboarding surface).
- **Conflict assertion:** *No conflict: this WP preserves all touched clauses.*
  The assistant is read-only, cites sources, refuses off-corpus questions, and
  never fabricates rules or gates gameplay.
- **Non-Goal proximity check:** none of NG-1..7 are crossed. NG-1 (no
  pay-to-win) is untouched — the assistant is free, informational, and confers
  no in-game advantage beyond explaining published rules equally to all.
- **Determinism preservation:** the **retrieval** layer is deterministic (same
  query + index ⇒ same results); the LLM layer is explicitly non-authoritative
  and never reads or writes game state — it mirrors the engine-owns-truth
  boundary rather than violating it.

---

## Funding Surface Gate

§20 N/A — this WP defines no funding affordances, no donate/support copy, and
no funding-channel integrations; the assistant answers rules questions only and
references no funding surfaces.

---

## API Catalog Update

§21 N/A — this WP adds **no** HTTP endpoint to `apps/server` and adds no
`apps/server/src/**` library function. The endpoint is a separate Cloudflare
Worker (a distinct edge service), which is outside the
`docs/ai/REFERENCE/api-endpoints.md` catalog's scope (that catalog tracks
`apps/server` surfaces only). If D3 instead routes this through `apps/server`,
§21 becomes triggered and a catalog row is required.

---

## Acceptance Criteria

### Retrieval
- [ ] `buildIndex` produces byte-identical output across two runs on identical
      corpus input.
- [ ] `search_docs` returns identical results for identical `(query, index)`.
- [ ] `search_docs` clamps `limit` to the documented max and rejects an empty
      `query` with a full-sentence error.
- [ ] `fetch_doc` rejects an unknown id with a full-sentence error.

### Reasoning + guardrails
- [ ] Every answer payload includes `title + url + snippet` sourced from
      `fetch_doc` output; no answer emits a URL absent from retrieved content.
- [ ] An off-corpus question returns the refusal message, not a model-prior
      answer.
- [ ] The tool loop stops at the documented iteration cap.
- [ ] A request failing the origin check or token check is rejected; requests
      past the rate-limit threshold return 429.

### Hygiene
- [ ] No `openai`, `axios`, or `node-fetch` import anywhere (confirmed with
      `Select-String`).
- [ ] No `@anthropic-ai/sdk` real network call in tests (client stubbed).
- [ ] No API key or token literal in the repo (confirmed with `Select-String`).
- [ ] The minimal widget fires the WP-205 analytics event on use.

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified (confirmed
      with `git diff --name-only`).

---

## Verification Steps

```pwsh
# Step 1 — build the Worker package
pnpm --filter rules-assistant build
# Expected: exits 0, no TypeScript errors

# Step 2 — run all tests
pnpm --filter rules-assistant test
# Expected: TAP output — all tests passing, 0 failing

# Step 3 — index determinism (two runs byte-identical)
pnpm --filter rules-assistant build-index
# Expected: identical index hash across two consecutive runs

# Step 4 — no forbidden HTTP clients
Select-String -Path "apps\rules-assistant\src" -Pattern "openai|axios|node-fetch" -Recurse
# Expected: no output

# Step 5 — no secret literals in the repo
Select-String -Path "apps\rules-assistant" -Pattern "sk-ant|ANTHROPIC_API_KEY\s*=" -Recurse
# Expected: no output (only the name documented in .env.example, no value)

# Step 6 — only in-scope files changed
git diff --name-only
# Expected: only files listed in ## Files Expected to Change
```

---

## Definition of Done

- [ ] All Open Decisions (D1–D5) closed and recorded.
- [ ] All acceptance criteria above pass.
- [ ] `pnpm --filter rules-assistant build` exits 0.
- [ ] `pnpm --filter rules-assistant test` exits 0.
- [ ] Index determinism confirmed (Step 3).
- [ ] No `openai`/`axios`/`node-fetch` import; no secret literal in the repo.
- [ ] No files outside `## Files Expected to Change` were modified.
- [ ] `docs/ai/STATUS.md` updated — the public rules-assistant endpoint now
      exists and the ROI metric is being measured.
- [ ] `docs/ai/DECISIONS.md` updated — D3 (edge-service layer), D5 (model), and
      the cite-only/determinism contract recorded.
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-237 registered and checked
      off with today's date.

---

## Lint Status (Draft)

Structural sections (§1) present. Gates that **cannot pass until Open Decisions
close**: §5 (paths provisional pending D3), §7 (Anthropic SDK version pin
pending D5), §10 (secret location pending D3). §11 auth N/A (no identity model —
origin+token only). §17 satisfied (Vision Alignment present). §20/§21 N/A with
justification. **Do not register or execute until D1–D5 are resolved.**
