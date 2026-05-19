# 02 — Database Migrations
# Legendary Arena · Execution Prompt

> **FULL CONTENTS MODE — Output contract for this session:**
> - Full file contents for every new or modified file (no diffs, no snippets)
> - List of exact commands to run with expected output
> - Acceptance checklist
> - Plain `.sql` migration files only — no migration frameworks
> - ESM only. Node v22+. Migrations must be idempotent.
> - Human-style code: explicit, readable, junior-maintainable.
>   See `docs/ai/REFERENCE/00.6-code-style.md`.
>
> **Relationship to coordination system:** Table names, column types, and schema
> structure in this prompt are governed by `data/legendary_library_schema.sql`
> (the canonical schema). If this prompt conflicts with that file on any table
> or column name, the canonical schema wins. Read it before writing any DDL.
>
> **Authority & Layer Boundary:**
> This document is subordinate to `docs/ai/ARCHITECTURE.md`.
> This prompt produces **server-layer** code only (migration runner, SQL files).
> Migrations operate on the `legendary.*` PostgreSQL schema — they must not
> contain game logic or modify engine state.
> See `docs/ai/ARCHITECTURE.md — "Layer Boundary (Authoritative)"` and
> `.claude/skills/legendary-server/SKILL.md` for server-layer enforcement rules.

---

## Goal

After this session, the project has a zero-dependency migration runner at
`scripts/migrate.mjs` that applies plain SQL files from `data/migrations/` in
filename order. Running it is idempotent. It runs automatically as part of the
Render build step before the server starts. `pnpm migrate` works locally with
a `.env` file.

---

## Assumes

- Prompt 01 (Render infrastructure) is complete:
  - `apps/server/src/server.mjs` exists and starts without error
  - Render Web Service and managed PostgreSQL are provisioned
  - `DATABASE_URL` is wired in the Render environment
  - `data/schema-server.sql` exists (the rules-engine DDL subset from 01)
  - `data/seed-server.sql` exists (the Galactus seed data from 01)
- `data/legendary_library_schema.sql` exists — the canonical full schema
- `data/seed_rules.sql` exists — the rules seed data
- `pg` is installed in `apps/server/` (added during prompt 01)
- `pnpm install` has been run

---

## Context (Read First)

Before writing a single line of code or SQL, read these in order:

- `data/legendary_library_schema.sql` — the canonical schema. All migration
  DDL must use the same `legendary.*` namespace, `bigserial` primary keys, and
  `text` column types as this file. Do not invent table names or column types.
- `data/seed_rules.sql` — shows the exact insert format for `legendary.rules`
  and `legendary.rule_docs`. Migration `002` must match this format.
- `data/schema-server.sql` — the rules-engine DDL from prompt 01. Migration
  `001` should apply these tables using `CREATE TABLE IF NOT EXISTS` so the
  migration is idempotent whether or not the tables already exist.
- `docs/ai/REFERENCE/00.2-data-requirements.md §4` — what belongs in
  PostgreSQL and what does not; specifically `§8.2` for what `game_sessions`
  should track vs. what belongs in boardgame.io's in-memory state.
- `docs/ai/REFERENCE/00.6-code-style.md` — all generated code must follow
  these rules. Key rules for this prompt: Rule 4 (no abbreviations), Rule 6
  (`// why:` comments), Rule 9 (`node:` prefix for built-ins), Rule 13 (ESM
  only), Rule 15 (explicit async error handling).

---

## Scope (In)

- `scripts/migrate.mjs` — new migration runner script
- `data/migrations/001_server_schema.sql` — rules-engine tables
- `data/migrations/002_seed_rules.sql` — rules glossary seed data
- `data/migrations/003_game_sessions.sql` — match tracking table
- `render.yaml` — **modified** — add `&& node --env-file=.env scripts/migrate.mjs`
  to the `buildCommand`
- `package.json` (monorepo root) — **modified** — add `migrate` script entry

---

## Out of Scope

- No changes to `data/legendary_library_schema.sql` — it is the canonical schema
  and must not be modified
- No changes to `data/seed_rules.sql` — migration 002 copies its content; do
  not alter the source file
- No rollback mechanism — this system deliberately has none (see Operational Notes)
- No migration framework installation (no Flyway, Knex migrations, golang-migrate)
- No changes to `apps/server/` source files — this prompt only adds the runner
  and the migration files
- No card display data in migrations — no image URLs, flavor text, or ability strings

---

## Files Expected to Change

- `scripts/migrate.mjs` — **new** — standalone migration runner
- `data/migrations/001_server_schema.sql` — **new** — rules-engine DDL
- `data/migrations/002_seed_rules.sql` — **new** — rules glossary seed
- `data/migrations/003_game_sessions.sql` — **new** — match tracking table
- `render.yaml` — **modified** — updated `buildCommand`
- `package.json` — **modified** — add `migrate` script entry

---

## Role

You are a senior backend engineer setting up a pragmatic, zero-dependency
migration workflow for a Node.js project on Render.com. You favor explicit
control over magic. No ORMs. No heavy migration frameworks unless justified.

---

## Code Style Mandate

All output must follow `docs/ai/REFERENCE/00.6-code-style.md`. Key rules:

- **No abstraction for one-time logic** — `migrate.mjs` is a script, not a
  library. Do not extract a `createMigrationRunner()` factory. Write it
  top-to-bottom (Rule 2).
- **Explicit loops** — processing migration files uses a `for...of` loop with
  descriptive variable names, not `.map()` chains or `.reduce()` (Rule 8).
- **Readable variable names** — `migrationFileName`, `appliedMigrations`,
  `sqlFileContent`, not `f`, `applied`, or `sql` (Rule 4).
- **`node:` prefix on all built-in imports** — `import { readdir, readFile }
  from 'node:fs/promises'` not `from 'fs'` (Rule 13).
- **Full-sentence log messages** — every `console.log` and `console.error`
  tells the reader what happened and what the current state is (Rule 11).
- **Full-sentence error messages** — every `throw` or `process.exit(1)` includes
  which migration failed, what the error was, and what to do next (Rule 11).
- **`// why:` comments** — the transaction wrapper, the `schema_migrations`
  table pattern, the filename sort order, and the exit codes all need `// why:`
  comments (Rule 6).
- **Explicit async error handling** — every `await` that touches the database
  or filesystem is in a try/catch with a specific message (Rule 15).

---

## Deliverables

### 1. Migration runner (`scripts/migrate.mjs`)

A standalone Node.js ESM script. Write it as a linear sequence of named async
functions called from `main()` — no classes, no runner factories, no middleware
pattern. A junior developer should read it top-to-bottom and understand every step.

**Behaviour:**

1. Connect to `DATABASE_URL` using a `pg` pool — config inline, not in a helper
2. Create `schema_migrations` table if it does not exist:
   ```sql
   CREATE TABLE IF NOT EXISTS schema_migrations (
     migration_id   bigserial primary key,
     filename       text unique not null,
     applied_at     timestamptz not null default now()
   );
   ```
   ```js
   // why: schema_migrations is intentionally in the public schema, not
   // legendary.*, so it exists before the legendary schema is created
   // and is visible to any PostgreSQL user without schema path changes.
   ```
3. Read all `.sql` files from `data/migrations/` using `node:fs/promises`
4. Sort files by filename — alphabetical order guarantees numeric prefix order:
   ```js
   // why: filename sort works because all migration files use a zero-padded
   // numeric prefix (001_, 002_, etc.). Relying on filename order rather than
   // a sequence column keeps the runner simple and the intent visible.
   migrationFileNames.sort();
   ```
5. For each file, in a `for...of` loop:
   - Check if the filename is already in `schema_migrations` — skip if so
   - Read the file content
   - Apply it inside a single transaction — roll back the entire file on error:
     ```js
     // why: wrapping each migration file in a transaction means a partial
     // failure rolls back cleanly. Without this, a failed migration halfway
     // through would leave the schema in an undefined state.
     ```
   - Record the filename in `schema_migrations` within the same transaction
   - Log: `[migrate] applied 001_server_schema.sql`
6. Log a completion summary: how many migrations were applied vs. skipped
7. Exit 0 on success, 1 on failure

**Named functions (each with JSDoc, each ≤30 lines):**

- `ensureMigrationsTable(client)` — creates `schema_migrations` if absent
- `loadAppliedMigrations(client)` — returns a `Set` of already-applied filenames
- `applyMigration(client, migrationFileName, sqlFileContent)` — runs one file
  in a transaction and records it
- `main()` — orchestrates the above, handles connect/disconnect, logs summary

**Exit code:**

```js
// why: exit code 1 signals to Render's build system that the migration
// failed and the deployment should not proceed to startCommand. Without
// a non-zero exit, Render would start the server with a broken schema.
if (migrationsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
```

---

### 2. Migration files

**Directory:** `data/migrations/`

All migration files must use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF
NOT EXISTS`, and `INSERT ... ON CONFLICT DO NOTHING` (or `ON CONFLICT DO
UPDATE`) so they are idempotent and safe to re-run.

**Read `data/legendary_library_schema.sql` before writing 001.** All table
names, column names, and primary key types must match that file's conventions:
`legendary.*` schema namespace, `bigserial` primary keys, `text` for string
identifiers, snake_case column names.

---

#### `001_server_schema.sql`

Apply the rules-engine DDL from `data/schema-server.sql` (produced by prompt 01).
This migration creates the tables the game server queries at startup.

Do not copy the DDL here — reference `data/schema-server.sql` directly:
```sql
-- 001_server_schema.sql
-- Applies the rules-engine schema subset required by the game server at startup.
-- Source of truth: data/schema-server.sql (produced by prompt 01).
-- All tables use the legendary.* schema namespace and bigserial primary keys.
-- Idempotent: all CREATE TABLE and CREATE INDEX statements use IF NOT EXISTS.
\i data/schema-server.sql
```

**Note for implementation:** If the `\i` metacommand is not supported in the
deployment environment, the runner should read and apply the file content
directly. The runner must handle this transparently — it reads the `.sql` file
content and sends it to `pg.Client.query()`, which handles multi-statement SQL.

---

#### `002_seed_rules.sql`

Apply the rules seed data from `data/seed_rules.sql`.

```sql
-- 002_seed_rules.sql
-- Seeds legendary.rules and legendary.rule_docs from the canonical source.
-- Source of truth: data/seed_rules.sql
-- Idempotent: all inserts use ON CONFLICT DO UPDATE.
\i data/seed_rules.sql
```

---

#### `003_game_sessions.sql`

Create a `game_sessions` table for tracking match metadata.

**Read `docs/ai/REFERENCE/00.2-data-requirements.md §8.2` before writing this
table.** The table tracks metadata about matches — it does NOT store `G` or
`ctx`. Those live in boardgame.io's in-memory state, never in PostgreSQL.

```sql
-- 003_game_sessions.sql
-- Tracks match metadata for audit, debugging, and reconnection.
-- This table stores match lifecycle state only — not boardgame.io's G or ctx.
-- Per 00.2 §8.2: live game state (G, ctx) is managed by boardgame.io in memory.

create table if not exists game_sessions (
  -- Why public schema: game_sessions is infrastructure, not card domain data.
  -- It does not belong in legendary.* alongside card and rules tables.
  game_session_id  bigserial primary key,
  match_id         text unique not null,
  -- match_id is boardgame.io's alphanumeric match identifier (not a UUID).
  -- It is the join key used by all boardgame.io client calls.
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  status           text not null default 'waiting'
                     check (status in ('waiting', 'active', 'complete')),
  player_count     int not null check (player_count between 1 and 5),
  mastermind_ext_id text not null,
  -- mastermind_ext_id references legendary.cards.ext_id (stable across re-seeds).
  -- Using ext_id (text) rather than a bigint FK keeps game_sessions independent
  -- of the card schema seeding order. Per 00.2 §4.4: use ext_id for cross-service
  -- card references.
  scheme_ext_id    text not null
  -- scheme_ext_id references legendary.cards.ext_id for the chosen scheme.
);

create index if not exists game_sessions_match_id_idx
  on game_sessions (match_id);
-- Why: match_id is the primary lookup key from boardgame.io clients.
-- Every reconnect and status check queries by match_id.

create index if not exists game_sessions_status_idx
  on game_sessions (status);
-- Why: status-filtered queries ('active' sessions for monitoring dashboards,
-- 'waiting' sessions for lobby display) will be common at runtime.
```

---

### 3. Updated `render.yaml` build command

```yaml
buildCommand: pnpm install && node --env-file=.env scripts/migrate.mjs
```

Include a YAML comment explaining why migrations run in `buildCommand` rather
than `startCommand`:

```yaml
# why: Running migrate in buildCommand (not startCommand) means migrations
# complete once per deploy, not once per server restart. On Render, a server
# can restart multiple times during a deploy. If migrate ran in startCommand,
# concurrent restarts could race to apply the same migration. BuildCommand
# runs exactly once, sequentially, before any instance starts.
```

---

### 4. `package.json` script entry

Add to the monorepo root `package.json`:

```json
{ "migrate": "node --env-file=.env scripts/migrate.mjs" }
```

---

## Operational Notes (answer these directly, as prose sentences)

1. **Re-runs**: What is the exact console output when `migrate.mjs` runs against
   a database that already has all three migrations applied?

2. **Rollbacks**: This system has no rollback mechanism. Under what specific
   conditions is that acceptable for this project, and what is the manual
   recovery procedure when a bad migration has reached the Render database?

3. **Local dev**: Should developers run a local PostgreSQL instance or connect
   to the Render database directly for local development? One sentence with
   justification, given the risk of running migrations against a shared database.

4. **Migration file naming**: Why are numeric prefixes (`001_`, `002_`) used
   rather than timestamps (e.g., `20250327120000_`)? When would timestamps be
   preferable?

---

## Acceptance Criteria

- [ ] `scripts/migrate.mjs` exists and is valid ESM
- [ ] `pnpm migrate` runs without crashing against a local PostgreSQL instance
- [ ] Running `pnpm migrate` twice produces no errors on the second run (idempotent)
- [ ] Each migration file in `data/migrations/` uses `IF NOT EXISTS` or
      `ON CONFLICT` — none can fail on re-run
- [ ] `schema_migrations` table is created in the `public` schema (not `legendary.*`)
- [ ] `003_game_sessions.sql` uses `text` for `mastermind_ext_id` and
      `scheme_ext_id` — not UUID, not `bigint` FK
- [ ] `game_sessions` table is created in the `public` schema (not `legendary.*`)
- [ ] `render.yaml` `buildCommand` runs migrations before the server starts
- [ ] No function in `migrate.mjs` exceeds 30 lines
- [ ] Every function in `migrate.mjs` has a JSDoc comment
- [ ] No `require()` appears anywhere in `migrate.mjs`
- [ ] All Node.js built-in imports use the `node:` prefix

---

## Verification Steps

```pwsh
# Step 1 — run migrations against a clean local database
pnpm migrate
# Expected: [migrate] applied 001_server_schema.sql
#           [migrate] applied 002_seed_rules.sql
#           [migrate] applied 003_game_sessions.sql
#           [migrate] 3 migrations applied, 0 skipped.

# Step 2 — run again to confirm idempotency
pnpm migrate
# Expected: [migrate] skipped 001_server_schema.sql (already applied)
#           [migrate] skipped 002_seed_rules.sql (already applied)
#           [migrate] skipped 003_game_sessions.sql (already applied)
#           [migrate] 0 migrations applied, 3 skipped.

# Step 3 — verify schema_migrations table exists and has 3 rows
psql $env:DATABASE_URL -c "SELECT filename, applied_at FROM schema_migrations ORDER BY migration_id;"
# Expected: 3 rows with the three migration filenames

# Step 4 — verify game_sessions table exists with correct columns
psql $env:DATABASE_URL -c "\d game_sessions"
# Expected: columns including match_id text, status text, mastermind_ext_id text

# Step 5 — verify the full connection health check still passes
pnpm check
# Expected: PostgreSQL check passes, all other checks pass

# Step 6 — verify ESM structure
node --input-type=module --eval "import('./scripts/migrate.mjs')"
# Expected: no SyntaxError (the script will attempt to connect — Ctrl+C is fine)
```

---

## Definition of Done

This session is complete when ALL of the following are true:

- [ ] All acceptance criteria above pass
- [ ] `pnpm migrate` exits 0 on a fresh database and on a fully-migrated database
- [ ] The `render.yaml` `buildCommand` includes the migration step with the
      `// why:` YAML comment explaining the build vs. start distinction
- [ ] No file outside `## Files Expected to Change` was modified
- [ ] `docs/ai/STATUS.md` updated with what was built
- [ ] `docs/ai/DECISIONS.md` updated with the decision to use `ext_id text`
      references in `game_sessions` rather than `bigint` FKs
- [ ] `docs/ai/WORK_INDEX.md` has this prompt checked off

---

## Hard Constraints

- No migration frameworks — no Flyway, Liquibase, Knex migrations, golang-migrate
- ESM only — no `require()` in `migrate.mjs`
- `pg` only for database access — no additional database packages
- All Node.js built-in imports use the `node:` prefix (00.6 Rule 13):
  `import { readdir, readFile } from 'node:fs/promises'`
  `import { join } from 'node:path'`
- Migration files are plain `.sql` — no JavaScript wrapping SQL strings
- All DDL uses `legendary.*` namespace and `bigserial` primary keys — consistent
  with `data/legendary_library_schema.sql` (00.2 §4)
- `game_sessions` uses `ext_id text` references — not UUID, not bigint FK
  (per 00.2 §4.4 — use `ext_id` for cross-service card references)
- `schema_migrations` and `game_sessions` live in the `public` schema —
  not `legendary.*` (infrastructure vs. domain separation)
- Script must be safe for Render's build environment — no TTY assumptions,
  no interactive prompts
- **No factory functions or class wrappers** — linear script with named async
  functions (00.6 Rule 2)
- **No `Array.reduce()`** — explicit `for...of` loops for migration file
  processing (00.6 Rule 8)
- **No abbreviated variable names** — `migrationFileName`, `sqlFileContent`,
  not `f`, `sql` (00.6 Rule 4)
- **No nested ternaries** — `if/else` for all conditional logic (00.6 Rule 3)
- **No function longer than 30 lines** (00.6 Rule 5)
- **All console messages are full sentences** including the migration filename
  and next step (00.6 Rule 11)
- **Every non-obvious block has a `// why:` comment** (00.6 Rule 6)
- **Explicit async error handling** — every database and filesystem `await` is
  in a try/catch (00.6 Rule 15)

---

*Last updated: see git log*
*Run order: 00.4 (connection check) → 01 (Render infra) → this prompt (02) → Work Packets*
*Schema authority: `data/legendary_library_schema.sql`*
