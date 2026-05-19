# WP-108 — Profile Billing & Funding History UI

**Status:** Done 2026-05-15 (this body backfilled into git on 2026-05-19 to close the WP-108 audit-trail gap — implementation shipped on 2026-05-15 but the design body was not committed alongside)
**Primary Layer:** Server / Billing + Client / Profile
**Dependencies:** WP-097, WP-098, WP-132, WP-133, WP-134

---

## Session Context

WP-132 landed the entitlements data model and `GET /api/me/entitlements` read
API; WP-133/134 landed Stripe checkout session creation, webhook ingestion,
and entitlement fulfillment; WP-097/098 locked the tournament funding policy
and lint-gate trigger; WP-104 landed the owner profile edit surface with
`MyProfilePage.vue`; this packet builds on all of them without modifying their
outputs.

---

## Goal

After this session, the authenticated owner has a **Billing & Funding** section
on their profile page that displays three read-only panels:

1. **Active Benefits** — the owner's current entitlements (cosmetic unlocks),
   fetched from the existing `GET /api/me/entitlements` endpoint.
2. **Purchase History** — a chronological list of the owner's Stripe checkout
   sessions (completed, expired, canceled), fetched from a new
   `GET /api/me/billing/history` endpoint.
3. **Community Funding** — a static informational panel linking to the
   Open Collective funding surface per WP-097's tournament funding policy.

The server gains `GET /api/me/billing/history` (authenticated, reads
`legendary.stripe_checkout_sessions` for the caller's `account_id`). The
client gains a `BillingSection.vue` component rendered on `MyProfilePage.vue`.

---

## Assumes

- WP-132 complete. Specifically:
  - `apps/server/src/entitlements/entitlements.types.ts` exports `Entitlement`,
    `EntitlementKey`, `EntitlementSource` (WP-132)
  - `apps/server/src/entitlements/entitlements.routes.ts` exports
    `registerEntitlementRoutes` and `GET /api/me/entitlements` is wired (WP-132)
- WP-133 complete. Specifically:
  - `apps/server/src/billing/billing.types.ts` exports `BillingConfig`,
    `BillingErrorCode`, `BillingResult`, `StripeEventRecord`,
    `CheckoutSessionRequest`, `CheckoutSessionResponse` (WP-133)
  - `apps/server/src/billing/billing.routes.ts` exports `registerBillingRoutes`
    (WP-133)
  - Migration `012` created `legendary.stripe_checkout_sessions` with columns
    `session_id`, `account_id`, `price_id`, `entitlement_key`, `intent_status`,
    `created_at`, `completed_at` (WP-133)
- WP-134 complete. Specifically:
  - `apps/server/src/billing/processStripeEvent.logic.ts` exports
    `processStripeEvent` — fulfillment processor writes `intent_status`
    transitions and `completed_at` timestamps on checkout session rows (WP-134)
- WP-097 complete. Specifically:
  - `docs/TOURNAMENT-FUNDING.md` exists and defines the funding policy
    including §A Global Navigation Funding Affordance and §C Account / Profile
    Attribution Surface (WP-097)
- WP-098 complete. Specifically:
  - `docs/ai/REFERENCE/00.3-prompt-lint-checklist.md §20` Funding Surface Gate
    exists (WP-098)
- WP-104 complete. Specifically:
  - `apps/arena-client/src/pages/MyProfilePage.vue` exists with the owner
    profile form, links, and teams sections (WP-104, WP-109)
  - `apps/server/src/profile/ownerProfile.logic.ts` exports `getOwnerProfile`
    (WP-104)
- `pnpm -r build` exits 0
- `pnpm test` exits 0
- `docs/ai/DECISIONS.md` exists
- `docs/ai/ARCHITECTURE.md` exists (created in WP-013)

If any of the above is false, this packet is **BLOCKED** and must not proceed.

---

## Context (Read First)

Before writing a single line:

- `docs/ai/ARCHITECTURE.md §Layer Boundary (Authoritative)` — read the Server
  layer responsibilities and the `apps/server` import rules. This packet adds
  a new route in the Server layer; the route must not import game-engine,
  preplan, or registry at runtime.
- `apps/server/src/billing/billing.types.ts` — read it entirely. Contains
  `BillingConfig`, `BillingErrorCode`, `BillingResult<T>`, and the
  `StripeEventRecord` / `CheckoutSessionResponse` shapes. The new billing
  history types extend this file.
- `apps/server/src/billing/billing.routes.ts` — read it entirely. Contains
  the existing `registerBillingRoutes` function that wires checkout + webhook
  handlers. The new history route is registered here.
- `apps/server/src/entitlements/entitlements.types.ts` — read it entirely.
  Contains `Entitlement`, `EntitlementKey`. The client-side benefits panel
  renders these.
- `apps/arena-client/src/pages/MyProfilePage.vue` — read it entirely. The
  billing section is appended as a new `<section>` after the teams block.
- `apps/arena-client/src/lib/api/ownerProfileApi.ts` — read it. Precedent
  for authenticated API call pattern (`Authorization: Bearer` header from
  localStorage).
- `docs/TOURNAMENT-FUNDING.md` — read §A and §C. The community funding
  panel links to the Open Collective surface described there.
- `docs/ai/REFERENCE/api-endpoints.md` — read the Wired section. The new
  `GET /api/me/billing/history` row must be added per D-11804.
- `docs/ai/REFERENCE/00.6-code-style.md` — key rules: Rule 4 (no
  abbreviations), Rule 6 (`// why:` comments), Rule 9 (`node:` prefix),
  Rule 11 (full-sentence error messages), Rule 13 (ESM only), Rule 14
  (field names match data contract).

---

## Vision Alignment

> Required per `00.3-prompt-lint-checklist.md §17.1` — this WP touches
> monetization, supporter tiers, cosmetics, and paid surfaces.

**Vision clauses touched:** NG-1 (No Pay-to-Win), NG-2 (No Gacha /
Randomized Purchases), NG-3 (No Content Withheld for Competitive
Advantage), NG-6 (No Dark Patterns or Psychological Exploitation),
NG-7 (No Monetization Requiring Apology), NG-8 (No Social Influence &
Network Mechanics), Financial Sustainability §3 (permitted revenue
streams: cosmetic purchases, supporter tiers, community support / donor
recognition), Goal 7a (Identity Boundary — authentication is
infrastructural; player identity is game-native), Goal 19a (Player
Profiles Are Reflective, Not Authoritative).

**Conflict assertion:** No conflict: this WP preserves all touched
clauses. The billing section is read-only, displays cosmetic-only SKUs
(D-13203 locks EntitlementKey to six cosmetic / access / presentation
values), introduces no purchase or checkout affordances on the profile
page, and uses neutral non-coercive tone for the community funding panel.

**Non-Goal proximity:** Confirmed — none of NG-1 through NG-8 are
crossed:
- NG-1 / NG-3: Purchase history displays cosmetic SKUs only; no
  gameplay-advantage surfaces exist or are introduced.
- NG-2: All purchases shown are deterministic one-time payments (D-13307);
  no gacha, loot boxes, or randomized outcomes.
- NG-6 / NG-7: No FOMO, scarcity language, countdown timers, or
  manipulative UX. Community funding copy is the Public Blurb from
  `TOURNAMENT-FUNDING.md` used verbatim (D-9701). Open Collective link
  is a text anchor, not a primary button.
- NG-8: No follower counts, social signals, or popularity metrics on
  the profile. Supporter recognition (if present in entitlements) is
  informational only, not comparative.

**Determinism preservation:** N/A — this WP touches no determinism-bearing
surface (no game-engine, replay, RNG, scoring, or simulation changes).

### Funding Surface Gate

> Required per `00.3-prompt-lint-checklist.md §20.1` — this WP touches
> user profile funding attribution surfaces. Authority: WP-097, D-9701,
> D-9801.

**Surface inventory:**

| Surface | WP-097 Source |
|---|---|
| Community Funding panel on `MyProfilePage.vue` (Panel 3 of `BillingSection.vue`) | §C Account / Profile Attribution Surface |
| Open Collective external link (text anchor inside Panel 3) | §A Global Navigation Funding Affordance (profile-scoped instance) |

**G-1 through G-7 disposition:**

- **G-1 (Label discipline): PASS.** No `Buy`, `Purchase`, `Order`,
  `Subscribe`, `Upgrade`, `Unlock`, `Get Access`, `Premium`, `Paid tier`,
  or transactional equivalent appears in any UI label, component name,
  route name, or user-visible text introduced by this WP. Panel headings
  are "Active Benefits", "Purchase History", "Community Funding" — the
  word "Purchase" in "Purchase History" is a retrospective factual
  description of completed transactions, not a transactional CTA; it does
  not appear in a button, link label, or action affordance. The Open
  Collective link text is neutral.
- **G-2 (No subscription framing): PASS.** No monthly/annual plans,
  auto-renew copy, "active/inactive" funding states, "you'll be charged"
  language, "cancel anytime" indicators, or renewal countdowns. The WP
  displays one-time payment history only (D-13307).
- **G-3 (No entitlement advantage): PASS.** Entitlements displayed are
  cosmetic / access / presentation only per D-13203. Funding status
  grants no gameplay advantage, feature access, priority matchmaking,
  enhanced visibility, or exclusive content. Core gameplay is
  byte-identical for funded and non-funded users.
- **G-4 (No registry gating or contextual pressure): N/A.** This WP
  does not touch the registry viewer. No per-card, per-expansion, or
  per-content funding prompt is introduced.
- **G-5 (No dark patterns): PASS.** No emotional manipulation, artificial
  urgency, repeated modals, disabled close buttons, FOMO framing,
  obfuscated wording, or fine-print reversals. The community funding
  panel is static informational text with a single text link. Empty
  states use neutral language ("No active benefits.", "No purchases yet.").
- **G-6 (Platform / tournament scope clarity): PASS.** The community
  funding panel uses the `TOURNAMENT-FUNDING.md §Public Blurb`
  verbatim, which refers to "tournament infrastructure support"
  specifically. No blurring between tournament and platform funding.
- **G-7 (Attribution informational only): PASS.** The Active Benefits
  panel is presentation-only, shows the owner's own entitlements, is not
  displayed in comparison contexts (lobby / leaderboard / opponent rows),
  and carries no amount disclosure. Absence of entitlements carries no
  stigma; presence carries no rank.

**Copy deferral declaration:** User-visible community funding copy
matches `docs/TOURNAMENT-FUNDING.md §Public Blurb (Reusable)` verbatim
per D-9701. No paraphrasing.

**Authority citation:** WP-097, D-9701, D-9801.

---

## Non-Negotiable Constraints

**Engine-wide (always apply — do not remove):**
- Never use `Math.random()` — all randomness uses `ctx.random.*` only
- Never throw inside boardgame.io move functions — return void on invalid input
- Never persist `G`, `ctx`, or any runtime state — see ARCHITECTURE.md §Section 3
- `G` must be JSON-serializable at all times — no class instances, Maps, Sets, or functions
- ESM only, Node v22+ — all new files use `import`/`export`, never `require()`
- `node:` prefix on all Node.js built-in imports (`node:test`, `node:assert`, etc.)
- Test files use `.test.ts` extension — never `.test.mjs`
- No database or network access inside move functions or pure helpers
- Full file contents for every new or modified file in the output — no diffs, no snippets
- Human-style code per `docs/ai/REFERENCE/00.6-code-style.md`

**Packet-specific:**
- `apps/server/src/entitlements/entitlements.types.ts` must not be modified —
  it is a locked contract from WP-132
- `apps/server/src/billing/processStripeEvent.logic.ts` must not be modified —
  it is a locked contract from WP-134
- The new `GET /api/me/billing/history` endpoint uses the same auth pattern as
  `GET /api/me/entitlements` (WP-132) — `requireAuthenticatedSession` +
  `AccountId` resolution + `player_id` two-query lookup
- No Stripe SDK calls from the history endpoint — read-only SQL against
  `legendary.stripe_checkout_sessions` only
- `intent_status` values surfaced to the client are the closed set
  `'open' | 'completed' | 'expired' | 'canceled'` from migration 012's
  CHECK constraint — no new values invented
- The client-side billing section is read-only — no purchase, checkout, or
  mutation affordances on this page (those live at `POST /api/billing/checkout-session`)
- `Cache-Control: no-store` on every response (including error paths) per
  WP-115 D-11504 lock
- `docs/ai/REFERENCE/api-endpoints.md` updated in the same commit per D-11804

**Session protocol:**
- If any contract, field name, or reference is unclear, stop and ask the human
  before proceeding — never guess or invent field names, type shapes, or file
  paths

**Locked contract values:**

- **EntitlementKey closed set** (from WP-132 D-13203):
  `'supporter_tier_basic_2026'` | `'cosmetic_playmat_classic'` |
  `'cosmetic_playmat_comic'` | `'cosmetic_playmat_minimal'` |
  `'cosmetic_cardback_default_plus'` | `'cosmetic_avatar_frame_supporter'`

- **EntitlementSource closed set** (from WP-132 D-13204):
  `'stripe'` | `'admin_grant'` | `'comp'`

- **BillingErrorCode closed set** (from WP-133):
  `'unauthorized'` | `'session_verifier_not_configured'` | `'invalid_price'` |
  `'invalid_request'` | `'stripe_error'` | `'invalid_signature'` |
  `'billing_not_configured'` | `'internal_error'`

- **Checkout session intent_status closed set** (from migration 012):
  `'open'` | `'completed'` | `'expired'` | `'canceled'`

---

## Debuggability & Diagnostics

All behavior introduced by this packet must be debuggable via deterministic
reproduction and state inspection. Logging, breakpoints, or "printf debugging"
are not acceptable debugging strategies.

The following requirements are mandatory:

- Behavior introduced by this packet must be fully reproducible given:
  - identical database state (entitlements + checkout sessions for a given account)
  - identical authenticated session

- Execution must be externally observable via deterministic state changes.
  Invisible or implicit side effects are not permitted.

- This packet must not introduce any state mutation that:
  - cannot be inspected post-execution, or
  - cannot be validated via tests or replay analysis.

- The following invariants must always hold after execution:
  - runtime state remains JSON-serializable
  - packet-owned types contain no invalid entries
  - no cross-packet state is mutated outside declared scope

- Failures attributable to this packet must be localizable via:
  - violation of declared invariants, or
  - HTTP status codes and error envelopes matching the locked contract

---

## Scope (In)

### A) Billing History Types

- **`apps/server/src/billing/billing.types.ts`** — modified:
  - `BillingHistoryEntry` interface:
    - `readonly entitlementKey: string` — the SKU the purchase unlocked;
      non-null (migration 012 column `entitlement_key text NOT NULL` — every
      checkout session is created with a known SKU; rows with NULL
      `entitlement_key` cannot exist per the NOT NULL constraint)
    - `readonly intentStatus: 'open' | 'completed' | 'expired' | 'canceled'`
    - `readonly createdAt: string` — ISO-8601 UTC
    - `readonly completedAt: string | null` — ISO-8601 UTC or null
  - `BillingHistoryResponse` interface:
    - `readonly history: readonly BillingHistoryEntry[]`
  - Add `'history_lookup_failed'` to `BillingErrorCode` union (additive only —
    existing members unchanged)

### B) Billing History Logic

- **`apps/server/src/billing/billingHistory.logic.ts`** — new:
  - `getBillingHistoryForAccount(accountId: AccountId, database: DatabaseClient): Promise<BillingResult<BillingHistoryEntry[]>>`
    - Step 1: existence check via
      `SELECT player_id FROM legendary.players WHERE ext_id = $1 LIMIT 1`
      to confirm the account is valid (value not reused in Step 2;
      two-query pattern matching WP-132 `getEntitlementsForAccount`)
    - Step 2: `SELECT entitlement_key, intent_status, created_at, completed_at
      FROM legendary.stripe_checkout_sessions WHERE account_id = $1
      ORDER BY created_at DESC LIMIT 100` (the `account_id` column stores
      `ext_id text` per WP-133 D-13302 Option A — no player_id join needed
      for the SELECT, but the Step 1 existence check confirms the account is
      valid; LIMIT 100 caps response size deterministically). Rows with
      identical `created_at` values have no secondary ordering guarantee;
      database natural order is acceptable.
    - Returns `BillingResult<BillingHistoryEntry[]>` — on DB fault returns
      `{ ok: false, reason: '...', code: 'history_lookup_failed' }`
  - JSDoc on the exported function

### C) Billing History Route

- **`apps/server/src/billing/billing.routes.ts`** — modified:
  - Add `GET /api/me/billing/history` handler inside the existing
    `registerBillingRoutes` function
  - Auth: `requireAuthenticatedSession` (same pattern as
    `GET /api/me/entitlements`)
  - Response: `200 → { history: BillingHistoryEntry[] }`
  - Error responses (envelope split per D-11802 = (C)):
    - `401 → { code: 'unauthorized' }` (auth/config failure — deterministic
      service-level code)
    - `500 → { error: 'internal_error' }` (operational fault — DB fault,
      helper returns `ok: false` for any reason including account-not-found)
  - If `getBillingHistoryForAccount` returns `{ ok: false }`, the route
    returns `500` with `{ error: 'internal_error' }` — no new status codes,
    no expansion of the error-code union. The 500 envelope intentionally
    does not use `BillingErrorCode` to preserve the D-11802
    operational/service split.
  - `Cache-Control: no-store` on every response path (first statement of
    handler body, before any branching — per D-11504)
  - Status-code domain: `{200, 401, 500}` — closed set

### D) Client-Side Billing API

- **`apps/arena-client/src/lib/api/billingApi.ts`** — new:
  - `fetchBillingHistory(authToken: string | null): Promise<BillingApiResult<BillingHistoryEntry[]>>`
    — calls `GET /api/me/billing/history` with `Authorization: Bearer` header
  - `fetchEntitlements(authToken: string | null): Promise<BillingApiResult<EntitlementDisplay[]>>`
    — calls `GET /api/me/entitlements` with `Authorization: Bearer` header
  - Local `BillingApiResult<T>` type (same `ok/fail` shape as `ownerProfileApi.ts`)
  - Local `BillingHistoryEntry` and `EntitlementDisplay` interfaces (client-side
    mirrors of server wire shapes — no cross-package imports)
  - **Entitlement wire fields consumed by UI** (from `entitlements.types.ts`
    `Entitlement` interface — exact names, Rule 14):
    - `entitlementKey: EntitlementKey` — rendered as human-readable label
    - `source: EntitlementSource` — rendered as badge
    - `grantedAt: string` — ISO-8601 UTC, rendered as date
    - (`sourceRef` and `revokedAt` are present on the wire but not rendered
      by the benefits panel)
  - All timestamps (both `BillingHistoryEntry` and `EntitlementDisplay`) are
    serialized as ISO-8601 UTC strings (`Z` suffix) — `new Date(value).toISOString()`.
    The server returns raw ISO-8601 UTC strings only; the client is responsible
    for display formatting (e.g., locale date rendering).

### E) Billing Section Component

- **`apps/arena-client/src/components/BillingSection.vue`** — new:
  - Three-panel layout rendered inside `MyProfilePage.vue`
  - **Panel 1 — Active Benefits:**
    - Fetches `GET /api/me/entitlements` via `billingApi.fetchEntitlements`
    - Renders each active entitlement as a row: entitlement key (human-readable
      label), source badge, granted date
    - Empty state: "No active benefits. Visit the store to unlock cosmetics."
  - **Panel 2 — Purchase History:**
    - Fetches `GET /api/me/billing/history` via `billingApi.fetchBillingHistory`
    - Renders each checkout session as a row: entitlement key label, status
      badge (`completed` / `open` / `expired` / `canceled`), date
    - Empty state: "No purchases yet."
  - **Panel 3 — Community Funding:**
    - Static informational text per WP-097 §A + §C
    - External link to Open Collective (the URL is a `data-testid`-bearing
      anchor, not a programmatic redirect)
    - Copy tone: neutral, non-coercive per WP-097 funding policy
  - Each panel has a loading / error / ready state
  - Required `data-testid` attributes for state containers:
    - `billing-benefits-loading`, `billing-benefits-error`,
      `billing-benefits-empty`, `billing-benefits-ready`
    - `billing-history-loading`, `billing-history-error`,
      `billing-history-empty`, `billing-history-ready`
    - `billing-funding-panel` (static, always present once section mounts)
  - `defineComponent({ setup() { ... } })` pattern matching MyProfilePage.vue
    precedent (NOT `<script setup>`)
  - All `data-testid` attributes prefixed with `billing-`
  - The Open Collective link is a normal text link (`<a>`), not a primary
    button, to avoid a purchase affordance on the profile page (per WP-097
    neutral, non-coercive tone)

### F) Profile Page Integration

- **`apps/arena-client/src/pages/MyProfilePage.vue`** — modified:
  - Import and render `BillingSection` as a new `<section>` after the teams
    block
  - Pass `authToken` (from the existing `readAuthToken()`) as a prop
  - The billing section renders only when `state === 'ready'` (profile loaded
    successfully)

### G) API Catalog Update

- **`docs/ai/REFERENCE/api-endpoints.md`** — modified:
  - Add one new `Wired` row for `GET /api/me/billing/history` in the
    Server-Registered Routes table per D-11804 replace-whole-row semantics

### H) Tests

Add `node:test` tests:

- **`apps/server/src/billing/billingHistory.logic.test.ts`** — new:
  - `getBillingHistoryForAccount` returns empty array for account with no
    checkout sessions
  - `getBillingHistoryForAccount` returns entries ordered by `created_at DESC`
  - `getBillingHistoryForAccount` returns `{ ok: false, code: 'history_lookup_failed' }`
    when account not found
  - `getBillingHistoryForAccount` returns `{ ok: false, code: 'history_lookup_failed' }`
    on database fault
  - Tests use `hasTestDatabase` conditional skip pattern per D-5201 §3.1

- **`apps/server/src/billing/billingHistory.routes.test.ts`** — new:
  - `GET /api/me/billing/history` returns `200` with `{ history: [...] }` for
    authenticated user with sessions
  - `GET /api/me/billing/history` returns `200` with `{ history: [] }` for
    authenticated user with no sessions
  - `GET /api/me/billing/history` returns `401` for unauthenticated request
  - `GET /api/me/billing/history` returns `500` with
    `{ error: 'internal_error' }` when helper returns `ok: false` (inject a
    database client stub that rejects, or use `hasTestDatabase` conditional
    with a forced fault)
  - `Cache-Control: no-store` header present on all response paths (including
    500)

---

## Out of Scope

- No checkout flow, purchase buttons, or Stripe redirect handling — those are
  separate from the history view
- No entitlement revocation UI — `revokedAt` is excluded by WP-132 contract
- No Stripe Customer Portal integration — deferred per WP-133 D-13308
- No subscription management — one-time payments only per WP-133 D-13307
- No admin grant UI — admin-auth WP gates HTTP exposure (WP-107 blocker)
- No modification of `legendary.stripe_checkout_sessions` or
  `legendary.entitlements` tables — read-only consumers
- No new database migration — reads existing tables from migrations 011 + 012
- No game-engine or registry changes
- No `billingHistory.logic.ts` mutations (INSERT / UPDATE / DELETE / UPSERT / MERGE) — read-only queries only
- Refactors, cleanups, or "while I'm here" improvements are **out of scope**
  unless explicitly listed in Scope (In) above

---

## Files Expected to Change

- `apps/server/src/billing/billing.types.ts` — **modified** — add
  `BillingHistoryEntry`, `BillingHistoryResponse`, extend `BillingErrorCode`
- `apps/server/src/billing/billingHistory.logic.ts` — **new** — billing
  history read helper
- `apps/server/src/billing/billing.routes.ts` — **modified** — wire
  `GET /api/me/billing/history` handler
- `apps/server/src/billing/billingHistory.logic.test.ts` — **new** —
  `node:test` coverage for history logic
- `apps/server/src/billing/billingHistory.routes.test.ts` — **new** —
  `node:test` coverage for history route
- `apps/arena-client/src/lib/api/billingApi.ts` — **new** — client-side
  billing API helpers
- `apps/arena-client/src/components/BillingSection.vue` — **new** —
  three-panel billing & funding component
- `apps/arena-client/src/pages/MyProfilePage.vue` — **modified** — import
  and render `BillingSection`
- `docs/ai/REFERENCE/api-endpoints.md` — **modified** — new `Wired` row
- `docs/ai/STATUS.md` — **modified** — billing history read surface availability
- `docs/ai/DECISIONS.md` — **modified** — add D-10801 and D-10802
- `docs/ai/work-packets/WORK_INDEX.md` — **modified** — check off WP-108

No other files outside the list above may be modified.

---

## Acceptance Criteria

All items must be binary pass/fail. No partial credit.

### A) Billing History Types
- [ ] `billing.types.ts` exports `BillingHistoryEntry` with exactly 4 fields:
      `entitlementKey`, `intentStatus`, `createdAt`, `completedAt`
- [ ] `billing.types.ts` exports `BillingHistoryResponse` with exactly 1 field:
      `history`
- [ ] `BillingErrorCode` union includes `'history_lookup_failed'` alongside all
      8 existing members (additive, no removals)

### B) Billing History Logic
- [ ] `billingHistory.logic.ts` exports `getBillingHistoryForAccount`
- [ ] Function returns `BillingResult<BillingHistoryEntry[]>`
- [ ] Function performs zero Stripe SDK calls (confirmed with `Select-String`)
- [ ] Function performs zero INSERT / UPDATE / DELETE / UPSERT / MERGE (read-only; confirmed with
      `Select-String`)
- [ ] No import from `game-engine`, `registry`, or `preplan` (confirmed with
      `Select-String`)

### C) Billing History Route
- [ ] `GET /api/me/billing/history` returns `200` with
      `{ history: BillingHistoryEntry[] }` for authenticated user
- [ ] `GET /api/me/billing/history` returns `401` for unauthenticated request
- [ ] `Cache-Control: no-store` header present on all response paths
- [ ] Status-code domain is exactly `{200, 401, 500}` — no other codes

### D) Client-Side API
- [ ] `billingApi.ts` exports `fetchBillingHistory` and `fetchEntitlements`
- [ ] Both functions accept `authToken: string | null` parameter
- [ ] No import from `apps/server/` (client-side mirrors only)

### E) Billing Section Component
- [ ] `BillingSection.vue` renders three panels: benefits, purchase history,
      community funding
- [ ] Benefits panel fetches `GET /api/me/entitlements`
- [ ] Purchase history panel fetches `GET /api/me/billing/history`
- [ ] Community funding panel contains an external link to Open Collective
      (text link, not a primary button)
- [ ] Each panel has loading, error, empty, and ready states with
      deterministic `data-testid` attributes: `billing-benefits-{loading,error,empty,ready}`,
      `billing-history-{loading,error,empty,ready}`, `billing-funding-panel`
- [ ] All testid attributes prefixed with `billing-`

### F) Profile Page Integration
- [ ] `MyProfilePage.vue` renders `BillingSection` after the teams block
- [ ] Billing section renders only when profile state is `'ready'`

### G) API Catalog
- [ ] `api-endpoints.md` contains a `Wired` row for
      `GET /api/me/billing/history` with Auth = `authenticated-session-required`

### Tests
- [ ] `pnpm test` exits 0 (all test files)
- [ ] `billingHistory.logic.test.ts` covers empty, populated, not-found, and
      fault scenarios
- [ ] `billingHistory.routes.test.ts` covers 200, 401, 500, and cache-control
- [ ] Test files use `node:test` and `node:assert` only
- [ ] Test files do not import from `boardgame.io`

### Scope Enforcement
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only` — 12 files expected)
- [ ] `processStripeEvent.logic.ts` was not modified (confirmed with `git diff`)
- [ ] `entitlements.types.ts` was not modified (confirmed with `git diff`)

---

## Verification Steps

```pwsh
# Step 1 — build after all changes
pnpm -r build
# Expected: exits 0, no TypeScript errors

# Step 2 — run all tests
pnpm test
# Expected: TAP output — all tests passing, 0 failing

# Step 3 — confirm no Stripe SDK calls in billing history logic
Select-String -Path "apps\server\src\billing\billingHistory.logic.ts" -Pattern "stripe"
# Expected: no output (no Stripe SDK usage)

# Step 4 — confirm read-only (no INSERT/UPDATE/DELETE in history logic)
Select-String -Path "apps\server\src\billing\billingHistory.logic.ts" -Pattern "INSERT|UPDATE|DELETE|UPSERT|MERGE"
# Expected: no output

# Step 5 — confirm no game-engine/registry/preplan imports in history logic
Select-String -Path "apps\server\src\billing\billingHistory.logic.ts" -Pattern "game-engine|registry|preplan"
# Expected: no output

# Step 6 — confirm no server imports in client billing API
Select-String -Path "apps\arena-client\src\lib\api\billingApi.ts" -Pattern "apps/server"
# Expected: no output

# Step 7 — confirm locked files unchanged
git diff --name-only -- "apps/server/src/billing/processStripeEvent.logic.ts" "apps/server/src/entitlements/entitlements.types.ts"
# Expected: no output

# Step 8 — confirm no files outside scope were changed
git diff --name-only
# Expected: only files listed in ## Files Expected to Change
```

---

## Definition of Done

This packet is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm -r build` exits 0
- [ ] `pnpm test` exits 0 (all test files)
- [ ] `GET /api/me/billing/history` returns correct data for authenticated user
      (confirmed via test)
- [ ] `BillingSection.vue` renders three panels with correct data-testid
      attributes
- [ ] No Stripe SDK calls in `billingHistory.logic.ts` (confirmed with
      `Select-String`)
- [ ] No INSERT / UPDATE / DELETE / UPSERT / MERGE in `billingHistory.logic.ts`
      (confirmed with `Select-String`)
- [ ] `processStripeEvent.logic.ts` was not modified (confirmed with `git diff`)
- [ ] `entitlements.types.ts` was not modified (confirmed with `git diff`)
- [ ] No files outside `## Files Expected to Change` were modified
      (confirmed with `git diff --name-only`)
- [ ] `docs/ai/REFERENCE/api-endpoints.md` updated — new `Wired` row for
      `GET /api/me/billing/history` per D-11804
- [ ] `docs/ai/STATUS.md` updated — billing history read surface and profile
      funding section are now available; an authenticated owner can view their
      entitlements, purchase history, and community funding links from their
      profile page
- [ ] `docs/ai/DECISIONS.md` updated — at minimum: D-10801 (billing history
      reads `stripe_checkout_sessions` directly via `account_id` text FK rather
      than joining through `player_id`, matching D-13302 Option A); D-10802
      (three-panel profile integration rather than standalone billing page —
      keeps the billing surface discoverable without adding a new route to the
      client router)
- [ ] `docs/ai/work-packets/WORK_INDEX.md` has WP-108 checked off with today's date
- [ ] `01.5 NOT INVOKED` — this packet does not modify `LegendaryGameState`,
      `buildInitialGameState`, `LegendaryGame.moves`, or any phase hook
