# 01 — Render.com Backend Setup
# Legendary Arena · Execution Prompt

> **FULL CONTENTS MODE — Output contract for this session:**
> - Full file contents for every new or modified file (no diffs, no snippets)
> - List of exact commands to run with expected output
> - Acceptance checklist
> - ESM only. Node v22+. No secrets committed to files.
> - Human-style code: explicit, readable, junior-maintainable.
>   See `docs/ai/REFERENCE/00.6-code-style.md`.
>
> **Relationship to coordination system:** Table names, column names, and
> schema structure in this prompt are governed by `data/legendary_library_schema.sql`
> (the canonical schema) and `docs/ai/REFERENCE/00.2-data-requirements.md §4`.
> If this prompt and those documents conflict on any table or column name,
> the canonical schema wins. Do not invent table names from memory —
> read `data/legendary_library_schema.sql` first.
>
> **Authority & Layer Boundary:**
> This document is subordinate to `docs/ai/ARCHITECTURE.md`.
> This prompt produces **server-layer** code only (wiring, startup, process
> lifecycle). It must not contain game logic, define moves, or mutate `G`.
> See `docs/ai/ARCHITECTURE.md — "Layer Boundary (Authoritative)"` and
> `.claude/skills/legendary-server/SKILL.md` for server-layer enforcement rules.

---

## Goal

After this session, the project has a working Render.com deployment: a Node.js
boardgame.io game server connected to a PostgreSQL database, with the rules
loaded into memory at startup, the `legendary` schema initialised, a minimal
game definition wired to the rules cache, and a `render.yaml` that provisions
both services in one deploy. `pnpm check` passes on a correctly configured
machine.

---

## Assumes

- pnpm monorepo exists at `C:\pcloud\BB\DEV\legendary-arena`
- `pnpm install` has been run — `node_modules` exists
- `data/legendary_library_schema.sql` exists (canonical schema — read it before
  writing any DDL)
- `data/seed_rules.sql` exists (actual rules seed data — read it to understand
  the `legendary.rules` and `legendary.rule_docs` column shapes)
- Prompt 00.4 has been run: `scripts/check-connections.mjs` exists and
  `pnpm check` runs successfully
- Render.com account exists with a team that can deploy Web Services and
  managed PostgreSQL
- No game server package exists yet (`apps/server/` is new)

---

## Context (Read First)

Before writing a single line of code, read these in order:

- `data/legendary_library_schema.sql` — the canonical PostgreSQL schema.
  The `legendary` schema namespace, table names, and column types here are
  authoritative. Do not invent table names; use what is in this file.
- `data/seed_rules.sql` — the actual rules seed data. Shows the exact column
  shapes for `legendary.rules` and `legendary.rule_docs`. The seed data for
  Section 1 must use the same column names.
- `docs/ai/REFERENCE/00.2-data-requirements.md §4` — PostgreSQL boundary rules:
  what belongs in the database, what does not, and which tables are used for
  what purpose.
- `docs/ai/REFERENCE/00.2-data-requirements.md §11` — environment variable
  names and `VITE_` prefix rules. The `.env.example` in Section 5 must use
  these exact variable names.
- `docs/ai/REFERENCE/00.6-code-style.md` — all generated code must follow
  these rules. Key rules: Rule 4 (no abbreviations), Rule 6 (`// why:`
  comments), Rule 9 (explicit imports with `node:` prefix for built-ins),
  Rule 13 (ESM only), Rule 14 (field names match data contract).

---

## Scope (In)

- `apps/server/` — new pnpm workspace package containing:
  - `src/rules/loader.mjs`
  - `src/game/legendary.mjs`
  - `src/server.mjs`
  - `package.json` (for the server package)
- `data/schema-server.sql` — DDL for the rules-engine subset of the schema
  (the tables the game server queries at startup; not the full card schema)
- `data/seed-server.sql` — seed data for the rules-engine tables, demonstrating
  FK relationships with one complete mastermind example
- `render.yaml` — Render.com infrastructure-as-code at the monorepo root
- `.env.example` — env var reference (will be superseded by the version
  produced by running 00.4)

---

## Out of Scope

- No frontend code, no Vue components, no Vite config
- No card display data (image URLs, flavor text, ability strings) — that lives
  in R2 and is fetched at runtime
- No authentication implementation — this prompt establishes the server; auth
  is a separate Work Packet
- No full card schema (`data/legendary_library_schema.sql` already defines it;
  do not re-create or modify it)
- No lobby system, no match creation UI
- No CI/CD workflow file
- No WebSocket client code

---

## Files Expected to Change

- `apps/server/package.json` — **new** — server package declaration
- `apps/server/src/rules/loader.mjs` — **new** — rules cache loader
- `apps/server/src/game/legendary.mjs` — **new** — minimal boardgame.io game definition
- `apps/server/src/server.mjs` — **new** — authoritative boardgame.io server
- `data/schema-server.sql` — **new** — rules-engine DDL subset
- `data/seed-server.sql` — **new** — seed data for rules-engine tables
- `render.yaml` — **new** — Render infrastructure-as-code
- `.env.example` — **new** (superseded by 00.4 version once that runs)

---

## Role

You are a senior backend engineer with deep, opinionated experience in Node.js
(ESM, v22+), boardgame.io (v0.50.x), PostgreSQL, and Render.com deployment.
You have shipped production Node.js game servers. You make pragmatic tradeoffs,
write comments that explain *why* not just *what*, and you do not reach for
complexity when simplicity works.

---

## Project Context

**Legendary Arena** is an authoritative multiplayer card game server modelled
on the Marvel Legendary board game. Early-production target: fewer than 100
concurrent players.

### What already exists (do not recreate or contradict)

| Layer | What exists | Where |
|---|---|---|
| Card registry JSON | Per-set JSON files | R2: `https://images.barefootbetters.com/metadata/{abbr}.json` |
| Card images | WebP files | R2: `https://images.barefootbetters.com/{abbr}/` |
| Registry Viewer SPA | Vite + Vue 3 | Cloudflare Pages: `https://cards.barefootbetters.com` |
| Full card schema | `data/legendary_library_schema.sql` | Monorepo — do not modify |
| Rules seed data | `data/seed_rules.sql` | Monorepo — do not modify |
| Monorepo root | pnpm workspaces | `legendary-arena/` |

### What PostgreSQL is — and is NOT — for

**Use PostgreSQL for (rules engine backing store):**
- Mastermind strike counts, victory points, `always_leads` relationships
- Scheme twist counts, setup constraint text
- Rules glossary (`legendary.rules`, `legendary.rule_docs`) — loaded at startup
- Villain group → mastermind relationships
- Configuration that varies between sessions (expansion availability)

**Never use PostgreSQL for (per 00.2 §4):**
- Live turn state (`G`, `ctx`) — boardgame.io keeps this in memory
- Card display data (image URLs, ability text, flavor) — in R2 JSON
- Player session data — boardgame.io handles this

This distinction is critical. The database is a **rules engine backing store**,
not a card display mirror.

### CORS and networking

Allowed origins (write these out explicitly — do not build from an array loop):
- `https://cards.barefootbetters.com` (production SPA)
- `http://localhost:5173` (local Vite dev server)

---

## Code Style Mandate

All output must follow `docs/ai/REFERENCE/00.6-code-style.md`. Key rules:

- **No factory functions** — the `pg.Pool` config goes inline, never wrapped
  in a helper (Rule 2).
- **No abstraction until 3+ uses** — if helper logic is called once, inline it
  (Rule 1).
- **Full English variable names** — `pool` or `dbPool` not `pg`; `rulesCache`
  not `rc`; `matchConfiguration` not `cfg` (Rule 4).
- **`node:` prefix on all built-in imports** — `import { join } from 'node:path'`
  not `from 'path'` (Rule 13).
- **Functions fit on one screen** — `loadRules()` must be split into clearly
  named sub-functions if the body exceeds 30 lines (Rule 5).
- **Comments explain WHY** — every non-obvious decision gets a `// why:`
  comment (Rule 6).
- **No `Array.reduce()`** for assembling the rules cache — use explicit
  `for...of` loops (Rule 8).
- **Full-sentence error messages** — `process.exit(1)` must be preceded by a
  message naming what failed and where to look (Rule 11).
- **No `import *`** — import named exports explicitly (Rule 9).

---

## Deliverables

### Section 1 — PostgreSQL Schema (`data/schema-server.sql`)

**Read `data/legendary_library_schema.sql` and `data/seed_rules.sql` before
writing this section.** The table names, column names, and primary key strategy
in this file must be consistent with the canonical schema.

Create DDL for the rules-engine subset the game server queries at startup.
All tables must be in the `legendary` schema namespace.

**Tables to create (in dependency order):**

1. `legendary.sets` — set/expansion lookup (if not already created by the full
   schema run; use `CREATE TABLE IF NOT EXISTS`)
2. `legendary.masterminds` — rules data for masterminds (strike count, vp,
   always_leads slugs, FK to sets)
3. `legendary.villain_groups` — rules data for villain groups (led_by slugs,
   FK to sets)
4. `legendary.schemes` — rules data for schemes (twist count, epic count, FK
   to sets)
5. `legendary.rules` — rules glossary index (matches columns in `seed_rules.sql`)
6. `legendary.rule_docs` — rules full text (matches columns in `seed_rules.sql`)

**Requirements for every table:**
- Use `bigserial primary key` (consistent with `legendary_library_schema.sql` —
  do not use UUID)
- `created_at timestamptz not null default now()`
- At least one index beyond the PK — justify each with a `-- Why this index`
  comment
- A `-- Why this table exists` comment at the top of each `CREATE TABLE`
- Foreign keys with `ON DELETE CASCADE` where appropriate
- Use `IF NOT EXISTS` on all `CREATE TABLE` and `CREATE INDEX` statements so
  this script is safe to run against a database that already has the full schema

**Seed block requirement:**

Include one complete seed block for the Galactus mastermind from the Core Set,
demonstrating the FK relationships between `legendary.sets`,
`legendary.masterminds`, `legendary.villain_groups`, and `legendary.schemes`.
Use actual Galactus game data (strike count: 5, vp: 6). Wrap in a transaction.

**What NOT to include:**
- No card display data (names are fine as identifiers, but no image URLs,
  flavor text, or ability strings)
- No hero cards, hero decks, hero classes — those are in the full schema
- No seeder for `legendary.rules` / `legendary.rule_docs` — use
  `data/seed_rules.sql` for that (it already exists)

---

### Section 2 — Rules Loader (`apps/server/src/rules/loader.mjs`)

**Read `data/seed_rules.sql` before implementing.** The queries must match the
actual column names in `legendary.rules` and `legendary.rule_docs`.

Requirements:

1. Connect to PostgreSQL via `pg` pool using `process.env.DATABASE_URL` — pool
   config inline, not in a helper function
2. On startup: load all rows from `legendary.rules` and `legendary.rule_docs`
   into `rulesCache` — one query per table, assembled into a nested in-memory
   object using explicit `for...of` loops (no `.reduce()`)
3. Export `getRules()` — synchronous after startup; returns the cached object.
   Export name is locked: `getRules` (per 00.3 §6).
4. Export `loadRules()` — async, called once at server startup. Export name is
   locked: `loadRules` (per 00.3 §6). Break into named sub-functions if body
   exceeds 30 lines.
5. On connection failure: log a full-sentence error message and `process.exit(1)`
6. JSDoc comment above `getRules()` documenting the complete return shape
7. No boardgame.io imports — pure data layer
8. `// why:` comments on every non-obvious decision
9. Use `node:` prefix for all Node.js built-in imports

**`rulesCache` shape (document this in JSDoc):**
```js
{
  rules: {
    [code]: { ruleId, code, label, cardTypes, raw }
    // keyed by code (e.g., 'shards', 'traps') for O(1) lookup by the game engine
  },
  ruleDocs: {
    [ruleId]: { ruleId, definition, summary, raw }
    // keyed by ruleId for O(1) lookup when resolving [rule:X] markup tokens
  }
}
```

---

### Section 3 — Game Definition (`apps/server/src/game/legendary.mjs`)

Requirements:

1. Import `getRules()` from `../rules/loader.mjs` — named import, explicit path
2. Minimal but structurally correct `LegendaryGame` using boardgame.io `Game()`
3. Includes: `setup(ctx, matchData)`, one `moves` entry (`playCard`), one
   `endIf()` condition
4. Comment block at the top explaining:
   - Why `G` never touches the database
   - What belongs in `G` vs. what is looked up from `rulesCache`
   - Why `ctx.random.*` is used instead of `Math.random()`
5. ESM only — no `require()`
6. `node:` prefix on any Node.js built-in imports

Keep this minimal. The purpose is to show the seam between rules data and game
state, not to implement full game logic.

---

### Section 4 — Server (`apps/server/src/server.mjs`)

Requirements:

1. Call `loadRules()` before creating the boardgame.io server — do not start
   the server if rules fail to load
2. Initialize `Server()` from boardgame.io with `LegendaryGame`
3. CORS: allow exactly the two origins listed above — written out explicitly in
   an array literal, not built dynamically from a loop or config object:
   ```js
   origins: [
     'https://cards.barefootbetters.com',
     'http://localhost:5173',
   ]
   ```
4. Read `PORT` from `process.env.PORT`, fallback to `8000`:
   ```js
   // why: Render.com injects PORT automatically. The fallback 8000 is for
   // local development only. Do not set PORT in the Render dashboard —
   // Render will override it anyway and double-setting causes confusion.
   const port = process.env.PORT ?? '8000';
   ```
5. Log on startup: port, count of rules loaded, `NODE_ENV`
6. Export a `/health` endpoint returning `{ status: 'ok' }` — this is checked
   by `pnpm check` (via `checkBoardgameioServer()` in `scripts/check-connections.mjs`)
7. `// why:` comment explaining why the server must be authoritative for
   WebSocket traffic and what that means on Render

---

### Section 5 — Render Infrastructure

**`render.yaml`** (at monorepo root):

```yaml
# Legendary Arena — Render.com Infrastructure
# Run: render deploy  (or commit to main — Render auto-deploys)

services:
  # Game server — boardgame.io authoritative WebSocket server
  - type: web
    name: legendary-arena-server
    runtime: node
    buildCommand: pnpm install
    startCommand: node apps/server/src/server.mjs
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: legendary-arena-db
          property: connectionString
      # JWT_SECRET must be set manually in the Render dashboard.
      # Generate with:
      # node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"
      - key: JWT_SECRET
        sync: false

databases:
  # Managed PostgreSQL — rules engine backing store
  - name: legendary-arena-db
    plan: starter
    # why: starter plan is sufficient for <100 concurrent games at launch.
    # The rules cache is loaded at startup; ongoing DB queries are minimal.
```

**`.env.example`:**

Variable names must match `docs/ai/REFERENCE/00.2-data-requirements.md §11`
exactly. This file will be superseded by the version produced by running the
00.4 connection health check prompt — keep it minimal here.

```ini
# ── Database ──────────────────────────────────────────────────────────────────
# Render auto-wires this from the managed PostgreSQL. For local dev,
# use a local PostgreSQL connection string.
DATABASE_URL=postgresql://user:password@localhost:5432/legendary_arena

# Used by check-connections.mjs to verify the correct DB is connected.
EXPECTED_DB_NAME=legendary_arena

# ── Auth ──────────────────────────────────────────────────────────────────────
# Generate with:
# node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"
# Never commit a real value.
JWT_SECRET=your-32-byte-hex-string-here

# ── Game Server ───────────────────────────────────────────────────────────────
NODE_ENV=development
GAME_SERVER_URL=https://legendary-arena.onrender.com
# Render sets PORT automatically — do not add to Render env vars.
PORT=8000

# ── Cloudflare ────────────────────────────────────────────────────────────────
R2_PUBLIC_URL=https://images.barefootbetters.com
CF_PAGES_URL=https://cards.barefootbetters.com

# ── Frontend (Vite) ───────────────────────────────────────────────────────────
# VITE_ prefix exposes this to the browser bundle.
VITE_GAME_SERVER_URL=https://legendary-arena.onrender.com
```

---

## Operational Notes (answer these directly, as prose sentences)

1. **Migrations**: How should schema changes be applied to the Render PostgreSQL
   database? Where do migration files live in the monorepo? What tool, if any,
   do you recommend and why, given the project's constraint of no ORMs?

2. **Rule updates**: A new expansion's rules are added to `legendary.rules` and
   `legendary.rule_docs` via `seed_rules.sql`. Does the server need to restart?
   Why or why not, given the startup-load caching strategy in `loader.mjs`?

3. **Why not turn state in PostgreSQL?** One sentence — specific to boardgame.io's
   architecture, not a general answer about database performance.

4. **First bottleneck at scale**: Given startup-load rules caching and the Render
   starter tier, what is the first bottleneck at ~100 concurrent games, and what
   is the minimal operational fix that does not require rewriting the architecture?

---

## Acceptance Criteria

- [ ] `apps/server/src/server.mjs` starts without errors with a valid `.env`
- [ ] `GET /health` returns `{ "status": "ok" }` with HTTP 200
- [ ] `loadRules()` queries `legendary.rules` and `legendary.rule_docs` — no
      other table names
- [ ] `getRules()` returns synchronously after `loadRules()` has resolved
- [ ] `rulesCache` is keyed by `code` for rules, by `rule_id` for ruleDocs
- [ ] All table DDL in `data/schema-server.sql` uses `legendary.*` namespace
- [ ] All primary keys in `schema-server.sql` use `bigserial` — no UUID
- [ ] `render.yaml` references `legendary-arena-db` in both the service and
      the database block
- [ ] No `require()` appears anywhere in generated `.mjs` files
- [ ] All Node.js built-in imports use the `node:` prefix
- [ ] CORS origins are written out as a literal two-item array — not dynamically
      built
- [ ] No function in any generated file exceeds 30 lines
- [ ] Every function has a JSDoc comment

---

## Verification Steps

```pwsh
# Step 1 — verify the server package installs cleanly
pnpm install
# Expected: no errors

# Step 2 — run the server locally (requires .env with DATABASE_URL)
node --env-file=.env apps/server/src/server.mjs
# Expected: logs port, rules count, NODE_ENV — then stays running

# Step 3 — check the health endpoint (in a second terminal)
curl http://localhost:8000/health
# Expected: {"status":"ok"}

# Step 4 — run the full connection health check
pnpm check
# Expected: all checks pass, including boardgame.io /health → 200 OK

# Step 5 — apply the schema to local PostgreSQL
psql $DATABASE_URL -f data/schema-server.sql
# Expected: CREATE TABLE, CREATE INDEX messages — no errors

# Step 6 — apply the seed data
psql $DATABASE_URL -f data/seed-server.sql
# Expected: INSERT messages, no FK constraint violations
```

---

## Definition of Done

This session is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm check` exits 0 on a correctly configured machine
- [ ] `GET /health` returns 200 both locally and after Render deploy
- [ ] `data/schema-server.sql` uses the same naming conventions as
      `data/legendary_library_schema.sql` (checked side by side)
- [ ] No file outside `## Files Expected to Change` was modified
- [ ] `docs/ai/STATUS.md` updated with what was built
- [ ] `docs/ai/DECISIONS.md` updated with any architectural decisions made
      (e.g., choice of startup-load vs. lazy-load for rules cache)
- [ ] `docs/ai/WORK_INDEX.md` has this prompt checked off

---

## Hard Constraints

- ESM only — `"type": "module"` in `apps/server/package.json`; no `require()`
- Node.js v22+; boardgame.io v0.50.x — use `Server()` and `Game()`, not the
  deprecated `createServer()`
- `pg` for PostgreSQL — no ORMs (no Prisma, Knex, Sequelize, or TypeORM)
- No Redis, no Kubernetes, no message queues
- No frontend code
- No secrets in files — all sensitive values via environment variables
- **Table names must match `data/legendary_library_schema.sql`** — use the
  `legendary.*` schema namespace; do not invent table names
- **All Node.js built-in imports use `node:` prefix** — `node:path`, `node:fs`,
  `node:crypto` (00.6 Rule 13)
- **No factory functions** — `pg.Pool` config inline (00.6 Rule 2)
- **No `Array.reduce()`** for assembling nested objects — use `for...of`
  (00.6 Rule 8)
- **No abbreviated variable names** — `pool` not `pg`, `rulesCache` not `rc`,
  `port` not `p` (00.6 Rule 4)
- **No nested ternaries** — use `if/else` (00.6 Rule 3)
- **No function longer than 30 lines** — break into named sub-functions
  (00.6 Rule 5)
- **All error messages are full sentences** identifying what failed and what to
  check (00.6 Rule 11)
- **Every non-obvious block has a `// why:` comment** (00.6 Rule 6)
- **No `import *`** — named imports only (00.6 Rule 9)
- **`loadRules` and `getRules` are the locked export names** — do not rename
  (00.3 §6)
- **CORS origins are a literal array** — not built from a variable or loop
  (00.6 Rule 7)

---

*Last updated: see git log*
*Run order: 00.4 (connection check) → this prompt (01) → 00.5 (R2 validation) → Work Packets*
*Schema authority: `data/legendary_library_schema.sql` and `data/seed_rules.sql`*
