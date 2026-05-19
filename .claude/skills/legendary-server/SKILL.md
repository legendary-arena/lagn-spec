---
name: legendary-server
description: Authoritative enforcement rules for the Server layer. Apply when editing apps/server/**, wiring boardgame.io Server(), loading registry/rules at startup, defining endpoints, or questions about server-vs-engine responsibility (server wires; engine decides).
---
---
paths:
  - "apps/server/**"
---

# Server Rules — Claude Enforcement

This file defines **non-negotiable rules for the server layer**
(`apps/server/**`) during AI-assisted development.

This file enforces the **Server layer** responsibilities defined in
**`docs/ai/ARCHITECTURE.md` -- "Layer Boundary (Authoritative)"**.

Any gameplay logic detected in the server violates the Layer Boundary.

It enforces architectural decisions defined in:
- `docs/ai/ARCHITECTURE.md` (authoritative)
- WP-004 -- Server Bootstrap
- WP-011 / WP-012 -- Match creation, lobby, and CLI flows
- `docs/ai/work-packets/WORK_INDEX.md`

This file does NOT define gameplay or rules.
If a conflict exists, **ARCHITECTURE.md wins**.

---

## Scope

Applies ONLY to:
- `apps/server/**`

Does NOT apply to:
- `packages/game-engine/**`
- `packages/registry/**`
- UI or client-side code

---

## Server Role [Invariant]

The server is a **wiring layer only**.

It is responsible for:
- Loading immutable inputs (registry data, rules text)
- Wiring `LegendaryGame` into `boardgame.io Server()`
- Exposing network endpoints and CLI entrypoints
- Managing process lifecycle (startup, shutdown)

The server must **NEVER**:
- Contain game logic
- Implement rules or effects
- Define or modify moves
- Define a boardgame.io `Game()` directly
- Mutate or inspect gameplay state (`G`) beyond routing

Violations are architectural bugs.

Source: ARCHITECTURE.md, Package Boundaries

---

## Startup Sequence [Invariant]

Before `Server()` accepts *any* requests, **both** of the following
independent startup tasks must succeed.

### Task 1 -- Card Registry

```
createRegistryFromLocalFiles({ metadataDir, cardsDir })
```

Responsibilities:
- Load `data/metadata/sets.json`
- Load `data/cards/[set-abbr].json`
- Validate all files against Zod schemas
- Return an immutable `CardRegistry`

Log on success: `[server] registry loaded: X sets, Y heroes, Z cards`

Rules:
- Registry is read-only after load
- Server must never "fix up" registry data
- On failure, server must not start

### Task 2 -- Rules Text (PostgreSQL)

```
loadRules() <- apps/server/src/rules/loader.mjs
```

Responsibilities:
- Read from `legendary.rules` table in PostgreSQL
- Load rules text into server memory
- Expose access via `getRules()`

Log on success: `[server] rules loaded: N rules`

Rules:
- `rules/loader.mjs` belongs to the server layer only
- Game engine code must never import it
- Rules text is read-only at runtime
- On failure, server must not start

### Startup Completion

Only when **both tasks succeed** may the server:
- Instantiate `Server()`
- Accept network requests
- Signal readiness from the process entrypoint

Source: ARCHITECTURE.md, Server Startup Sequence

---

## Process & Entrypoint

- Entrypoint: `apps/server/src/index.mjs`
- Node v22+ only
- ESM only -- no CommonJS
- Graceful shutdown on `SIGTERM`
- `render.yaml` startCommand: `node apps/server/src/index.mjs`

Source: WP-004

---

## CLI Scripts [Invariant]

Location: `apps/server/scripts/`

Canonical scripts:
- `create-match.mjs`
- `list-matches.mjs`
- `join-match.mjs`

Rules:
- Use **Node v22 built-in `fetch` only** -- never `axios` or `node-fetch`
- Exit with status `1` on failure
- Emit full-sentence error messages to `stderr`
- Contain no game logic
- Call server endpoints -- never engine functions directly

CLI scripts are clients, not part of the engine.

Source: WP-011, WP-012

---

## Server / Engine Boundary [Invariant]

- Server wires `LegendaryGame` into boardgame.io -- nothing more
- Server never:
  - Mutates `G`
  - Interprets `G`
  - Applies rule logic
- Server passes deterministic inputs only

All gameplay authority lives in `packages/game-engine`.

---

## Prohibited Server Behaviors [Guardrail]

Claude must never:
- Implement game rules in the server
- Add move logic or effect handling
- Import registry into the engine via the server
- Add persistence logic for `G` or `ctx`
- Read or write card data at move time
- Treat the server as a "coordinator" of gameplay

If logic belongs to the engine, it must live there.

---

## When Unsure -- STOP

If a change appears to:
- Add logic beyond wiring
- Touch gameplay state
- Blur engine vs server responsibilities
- Introduce persistence or interpretation of `G`

STOP and consult:
- `docs/ai/ARCHITECTURE.md`
- `WORK_INDEX.md`
- `DECISIONS.md`

Do not guess.

---

## Final Rule

**The server connects pieces. It does not decide outcomes.**

If the server "makes the game easier to implement," it is doing too much.
