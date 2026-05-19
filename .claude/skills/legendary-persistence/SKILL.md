---
name: legendary-persistence
description: Authoritative enforcement rules for the Persistence boundary. Apply when adding or modifying snapshots, database writes, or save/load logic, or answering what may be persisted (snapshots = derived counts only; G and ctx are runtime-only).
---
---
paths:
  - "packages/game-engine/src/persistence/**"
  - "apps/server/**"
---

# Persistence Rules — Claude Enforcement

This file defines **non-negotiable persistence boundaries** for
AI-assisted development.

Persistence rules are **cross-layer** and are governed by
**`docs/ai/ARCHITECTURE.md` -- "Layer Boundary (Authoritative)"**.

No layer may reinterpret persistence responsibilities independently.

It enforces the data lifecycle model formalised in:
- WP-013 -- Persistence Boundaries & Snapshots
- `docs/ai/ARCHITECTURE.md` (authoritative)
- `docs/ai/work-packets/WORK_INDEX.md`

This file does NOT implement persistence.
It prevents invalid persistence.

If a conflict exists, **ARCHITECTURE.md wins**.

---

## The Three Data Classes [Invariant]

All data in Legendary Arena falls into **exactly one** of these classes.
These names are canonical and must be referenced via
`PERSISTENCE_CLASSES` constants -- never string literals.

```
PERSISTENCE_CLASSES = {
  RUNTIME:       'runtime',
  CONFIGURATION: 'configuration',
  SNAPSHOT:      'snapshot',
}
```

Defined in `src/persistence/persistence.types.ts`.

### Class 1 -- Runtime State (NEVER PERSIST)

These objects exist **only in boardgame.io's in-memory process**.
Persisting any of them is a critical bug.

| Object | Why |
|---|---|
| `G` (entire object) | Owned by boardgame.io; re-hydration bypasses state integrity |
| `ctx` | boardgame.io internal metadata; no public contract |
| `ImplementationMap` | Contains functions; not serializable |
| In-flight `RuleEffect[]` | Transient execution artifacts |
| `G.hookRegistry` | Derived from setup; rebuilt every match |
| `G.lobby` | Transient phase state |
| `G.currentStage` | Reset each turn; runtime only |
| Socket / session data | Network-layer state |

Rules:
- Never write these to PostgreSQL, Redis, files, logs, or caches
- Never snapshot them directly
- Never attempt to restore a match using them

### Class 2 -- Configuration State (SAFE TO PERSIST)

These are deterministic **inputs** to a match.

| Object | Notes |
|---|---|
| `MatchSetupConfig` | 9-field locked setup payload |
| Player names & seat assignments | Created at join time |
| Match creation timestamp | ISO 8601 |

Rules:
- May be stored before or after a match
- Never mutated by gameplay
- Maps to `PersistableMatchConfig` only -- never G or ctx

`PersistableMatchConfig` shape (exact):
```
{
  matchId:     string
  setupConfig: MatchSetupConfig
  playerNames: Record<string, string>   // playerId -> display name
  createdAt:   string                   // ISO 8601
}
```

### Class 3 -- Snapshot State (SAFE AS IMMUTABLE RECORDS)

Snapshots are **derived, read-only audit records**.

Rules:
- Never re-hydrated into a live match
- Never replace G as the source of truth
- Use **zone counts only** -- never zone contents
- Safe to delete without affecting game integrity
- Entirely JSON-serializable
- Frozen via `Object.freeze()`

`MatchSnapshot` shape (exact top-level keys):
```
{
  matchId:      string
  snapshotAt:   string                  // ISO 8601
  turn:         number
  phase:        string
  activePlayer: string
  players: {
    playerId:     string
    deckCount:    number
    handCount:    number
    discardCount: number
    inPlayCount:  number
    victoryCount: number
  }[]
  counters:     Record<string, number>
  messages:     string[]
  outcome?:     { result: 'heroes-win' | 'scheme-wins'; reason: string }
}
```

Excluded from snapshots (never include):
- `hookRegistry`, `lobby`, `currentStage`
- `CardExtId[]` arrays (zone contents)
- Any function references

---

## What Lives Where [Invariant]

| Data | Location | Mutable |
|---|---|---|
| Card metadata & images | R2 / `data/` | No (immutable releases) |
| Match setup config | boardgame.io `matchData` | No |
| Live game state (`G`) | boardgame.io memory | Yes -- via moves only |
| boardgame.io metadata (`ctx`) | boardgame.io memory | Yes -- internal |
| Rules text (seeded) | PostgreSQL `legendary.rules` | No |
| Card registry | Server memory | No |
| `ImplementationMap` | Runtime memory (NOT in G) | No |
| Snapshots (`MatchSnapshot`) | Application storage | No (immutable) |

---

## Snapshot Creation Rules [Invariant]

`createSnapshot(G, ctx, matchId)` in `src/persistence/snapshot.create.ts`:

- **Pure function** -- no I/O, no async, no database access
- **Never throws** -- no `throw` statement permitted
- Returns `Readonly<MatchSnapshot>` via `Object.freeze()`
- Derives zone **counts** from `G.playerZones` (not contents)
- Copies `G.counters` and `G.messages` by value (shallow copy)
- Sets `snapshotAt` using `new Date().toISOString()`
- Sets `outcome` from endgame result if present; `undefined` if ongoing
- Deterministic: two calls on the same G produce identical output

// why: zone counts not contents prevents snapshots from becoming a
second source of truth about card positions

---

## Snapshot Validation Rules [Invariant]

`validateSnapshotShape(input)` in `src/persistence/snapshot.validate.ts`:

- Returns `{ ok: true } | { ok: false; errors: MoveError[] }`
- Imports `MoveError` from `src/moves/coreMoves.types.ts` -- never redefines it
- Validates shape only -- does NOT check that `matchId` exists in any store
- **Never throws** -- structured results only

---

## Prohibited Persistence Behaviors

Claude must never:

- Persist or cache `G` or `ctx`
- Store zone contents (`CardExtId[]`) in snapshots
- Serialize handler functions or closures
- Treat snapshots as save-games
- Re-hydrate a match from a snapshot
- Add persistence logic to moves, phases, or rules
- Introduce database or network access into game-engine code
- Include `hookRegistry`, `lobby`, or `currentStage` in snapshots
- Define new error types for persistence -- reuse `MoveError`
- Use string literals for data class names -- use `PERSISTENCE_CLASSES`

---

## When Unsure -- STOP

If a change appears to:
- Blur runtime vs configuration vs snapshot data
- Add new persisted fields
- Change snapshot shape
- Store additional game state outside boardgame.io

STOP and consult:
- WP-013
- `docs/ai/ARCHITECTURE.md`
- `WORK_INDEX.md`
- `DECISIONS.md`

Never guess. Persistence mistakes cause silent corruption.

---

## Final Rule

**G is not a database.**
**Snapshots are not save-files.**
**Configuration is input, not state.**

If code "works" but violates these rules, it is wrong.
