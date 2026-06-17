# DESIGN — Hollow Effect Detection & Reporting

**Status:** Draft / proposed (2026-06-16). Spine for a multi-packet initiative
(WP-257…WP-260 proposed below). No code lands from this document; it is the
design Jeff reviews before packets are formalized through the governed
WP-drafting workflow (`docs/ai/REFERENCE/01.0a-wp-drafting-phase.md`).

**Authority:** subordinate to `docs/ai/ARCHITECTURE.md`, `.claude/rules/*.md`,
and `docs/01-VISION.md`. New decisions claim **D-24033+** (D-24032 is taken on
`main`). New packets claim **WP-257+** (WP-256 is the latest on `main`).

**Related:** `DESIGN-EFFECT-AUTHORING-SCALE.md` (the static coverage lever);
D-24017 (observable-no-op logging posture); D-24021/D-24024/D-24029
(effect-authoring lineage); `docs/ai/coverage/hero-mechanic-ledger.json`; the
diagnostics export (WP-228 / EC-260).

> **Keystone:** this is **not** a state-diff detector — it is a
> **handler-reachability** detector. The most likely implementation drift is
> someone comparing pre/post `G` and accidentally flagging correct empty-supply
> or failed-condition behavior. The detector asks one question: *did a declared
> mechanic reach an executable handler?*

---

## 1. Problem

When a card declares an ability but the runtime cannot reach an executable
handler for it, the engine currently treats the gap as a non-event. That is a
defect. Today the system has several partial seams but no systematic runtime
invariant:

- **Hero play.** `executeHeroEffects` returns `void`; `moves/coreMoves.impl.ts`
  discards any effect-level outcome. Unsupported keywords fall through
  `executeSingleEffect` silently. `HeroEffectResult` exists in
  `hero/heroEffects.types.ts`, but it is dev/test-oriented and is not produced on
  the live path.
- **Villain / henchman city entry.** `villainEffects.execute.ts` returns an
  applied keyword list, but its documented posture is that out-of-vocabulary
  effects safe-skip silently and are **not** included in the return array. The
  ambush fire site (`villainDeck.reveal.ts:263`) already captures
  `appliedAmbushEffects` (WP-200), so the comparison seam exists — but nothing
  acts on "declared but not executable."
- **The D-24017 no-op logging posture** exists only as hand-authored case logic.
  Legitimate no-ops such as `rescue` with an empty bystander supply are logged
  only where individual handlers remember to.
- **Existing coverage is static.** The mechanic ledger and the hero-effect
  coverage gate answer "which markers have no handler" at CI time. They do not
  answer "which missing handler was actually encountered during play."

Net: the engine can silently swallow a declared mechanic at runtime — the same
product-risk class as the Web-Shooters rescue no-op, but worse: an actually
unimplemented mechanic can be encountered by a player and leave no runtime trail.

---

## 2. Runtime invariant

> **A declared card ability whose executable handler is absent or unreachable is
> hollow and must be surfaced deterministically. A reachable handler that
> intentionally no-ops is not hollow.**

The invariant is about the runtime chain, not about whether `G` changed:

1. **Declaration** — the card declares a mechanic marker or effect hook.
2. **Parsing** — the declaration normalizes into a descriptor / keyword /
   primitive effect.
3. **Dispatch** — the descriptor reaches an executable handler.
4. **Outcome** — the handler applies a change, intentionally no-ops, defers by
   design, or fails an implemented condition.

A hollow effect occurs when steps 1–2 identify a declared mechanic but step 3
cannot reach an executable handler.

"Surface" means the engine emits:
- one JSON-serializable runtime record into `G.diagnostics.hollowEffects`, and
- one full-sentence `G.messages` line observable in the match log.

The engine does **not** write files, report to dashboards, mutate the mechanic
ledger, or create WPs (layer boundary). It emits a deterministic signal;
downstream tooling consumes it (§6).

---

## 3. Hollow versus legitimate no-op

The load-bearing distinction is **handler reachability**, not whether game state
changed.

| Runtime outcome | Meaning | Hollow? | Required behavior |
|---|---|:--:|---|
| Declared marker cannot be parsed into any known descriptor | Parser does not understand the declared mechanic | **Yes** | Record hollow event |
| Descriptor parses but has no executable handler | Recognized but unimplemented | **Yes** | Record hollow event |
| Descriptor maps to an unsupported-keyword branch | Dispatch cannot execute it | **Yes** | Record hollow event |
| Handler runs and changes `G` | Implemented and applied | No | No record |
| Handler runs and intentionally no-ops | Implemented; board state made it empty | No | Existing D-24017-style message if useful |
| Condition handler runs and condition fails | Implemented conditional behavior | No | No record (unless the handler itself is missing) |
| Mechanic is on the **explicit deferred allowlist** | Implemented-as-deferred by design | No | Optional message / explicit deferred result |
| Handler throws | Separate runtime-defect class | No | Existing error/warn-and-continue path applies |

The detector must **not** use object diffing to decide success. Empty supply,
empty deck, failed condition, and explicit deferral are valid implemented
outcomes. This boundary is recorded as **D-24033** during WP-257.

**On "deferred":** "deferred = not hollow" holds **only** for mechanics on an
*explicit* deferred allowlist. Today `wound` / `conditional` simply have no
handler (absent from `HANDLED_KEYWORDS`), so without an explicit allowlist they
classify as `no-handler` → hollow. WP-257 must decide the allowlist's contents
and whether a deferred-by-design mechanic should still surface at a lower
severity (it is, after all, a player-visible dead card). Sub-decision under
D-24033.

---

## 4. Engine detection design

### 4.1 Shared execution-outcome contract

WP-257 introduces or normalizes a shared effect-outcome shape sufficient for both
hero and villain paths:

```ts
type EffectExecutionReason =
  | 'applied'
  | 'handler-noop'
  | 'condition-failed'
  | 'deferred'
  | 'no-handler'
  | 'unsupported-keyword'
  | 'parse-unrecognized';

type EffectExecutionOutcome = {
  declared: boolean;
  mechanic: string;
  timing: string;
  executed: boolean;
  reason: EffectExecutionReason;
};
```

The exact shape may differ within existing type boundaries, but the contract must
answer the binary question: *did this declared mechanic reach an executable
handler?*

| Reason | Flags hollow? |
|---|:--:|
| `parse-unrecognized`, `no-handler`, `unsupported-keyword` | **Yes** |
| `applied`, `handler-noop`, `condition-failed`, `deferred` | No |

### 4.2 Hero path

`executeHeroEffects` is promoted from `void` to returning a structured summary
derived from the existing `HeroEffectResult` concept. The play site in
`moves/coreMoves.impl.ts` inspects it. A hero play records a hollow event when:

1. the card has at least one declared hero effect hook; **and**
2. the runtime summary contains no `applied` / `handler-noop` /
   `condition-failed` / `deferred` outcome for that hook; **and**
3. at least one declared effect resolves to `parse-unrecognized` / `no-handler` /
   `unsupported-keyword`.

It does **not** record when the handler ran and the source was empty, a
conditional failed, an outcome was explicitly deferred, or any declared effect
reached a real executable handler for that hook.

**Detecting `parse-unrecognized` is not free.** `G.heroAbilityHooks` carries
*parsed descriptors* only, so a marker the parser couldn't resolve leaves an
**empty hook** — indistinguishable at runtime from a pure flavor-text line with
no mechanic at all. Flavor text must **not** flag; an unresolved marker **must**.
Distinguishing them requires the parser (`setup/heroAbility.setup.ts`,
`setup/villainAbility.setup.ts`) to surface "saw a marker token, resolved it to
nothing" into a runtime-visible form (e.g. an `unresolvedMarkers` field on the
hook), rather than dropping it. This is a real WP-257 sub-task and rides
D-24034 (the runtime record/channel shape). The static coverage probe already
does marker-vs-vocabulary comparison, so there is precedent for the
classification — but it lives at CI time, not in `G`.

### 4.3 Villain / henchman path

The fire sites in `villainDeck.reveal.ts` classify declared descriptors against
runtime outcomes. The current `appliedAmbushEffects` list is useful but
**insufficient alone** — it records only successful applications, so it cannot by
itself separate "implemented handler that no-oped" from "no handler at all."
WP-257 must therefore either:

1. extend the villain execution return contract to include non-applied outcomes
   (per §4.1); or
2. add a companion execution summary beside the existing applied list.

A hollow event is recorded when:

1. the card declares at least one relevant villain/henchman timing hook
   (`onAmbush`, `onFight`, `onEscape`, or an equivalent supported timing); **and**
2. the declared descriptor is recognized as a runtime candidate; **and**
3. dispatch cannot reach an executable handler (`parse-unrecognized` /
   `no-handler` / `unsupported-keyword`).

It is **not** recorded when the handler runs and intentionally no-ops,
condition-fails, or defers by design. This closes the silent safe-skip without
converting every non-applied ambush into a false positive.

---

## 5. Runtime diagnostics channel

WP-257 introduces a runtime-only diagnostics channel:

```ts
type HollowEffectRecord = {
  cardId: string;
  cardType: 'hero' | 'villain' | 'henchman';
  timing: string;
  mechanic: string;
  reason: 'parse-unrecognized' | 'no-handler' | 'unsupported-keyword';
  turn: number;
};
```

Proposed location: `G.diagnostics.hollowEffects: HollowEffectRecord[]`.

Required constraints:
- JSON-serializable only — no functions, Maps, Sets, Dates, class instances, or
  non-deterministic values.
- Runtime-only; **not** persisted as durable game state; never snapshotted as a
  save-game (Persistence Boundary).
- **Never** used as gameplay input (it must not influence any move, rule, or
  endgame evaluation — it is observation, not state).
- Reset deterministically at the **match-creation / loaded-match-hydration**
  boundary, per the existing persistence rules — not mid-match.
- Bounded by a fixed cap plus dropped-count metadata, mirroring the diagnostics
  ring-buffer posture (a long match cannot grow `G` without limit).
- Safe to include in the diagnostics export snapshot.

Each record also appends one full-sentence `G.messages` line. Example
(illustrative — a genuinely unhandled mechanic, **not** an implemented one like
`rescue`):

```txt
Unhandled effect observed: card "<set>/<villain>" declared an ambush effect at onAmbush, but no executable handler was reached.
```

Message wording should be deterministic and stable enough for tests, but it is
**not** the canonical contract — `HollowEffectRecord` is. Tests assert on the
record; the message is for human/operator visibility.

---

## 6. Reporting architecture

The engine emits one signal. Three downstream consumers read it; none live in
the engine.

### 6.1 `/debug`

The dashboard Debug page (today only env + flags) surfaces the runtime records:
card id / display name (if available downstream), card type, timing, mechanic,
reason, turn, and a count/grouping for repeated identical records. The fastest
path is via the existing **Download-diagnostics** export (which already carries
`uiStateSnapshot` and, post-merge, `matchSetup`); a live UI projection is
acceptable if it respects the same layer boundary. Empty state is explicit:
"no hollow effects observed."

### 6.2 `/coverage`

Runtime-observed hollow effects **overlay** the static mechanic ledger.
Static coverage answers *"is this mechanic unsupported in theory?"*; the overlay
answers *"was it actually encountered during play?"* — distinguishing paper gaps
from gaps that bite players. Proposed overlay fields (D-24035):

```ts
runtimeObserved?: {
  hitCount: number;
  lastSeenTurn?: number;
  examples?: Array<{ cardId: string; cardType: string; timing: string; reason: string }>;
};
```

Derived downstream from diagnostics/tooling — the engine must **not** write to
the ledger.

### 6.3 Architect lane

The architect lane (`apps/dashboard/src/composables/useAgentPipeline.ts`) consumes
runtime-confirmed coverage gaps and converts them into **backlog candidates** —
a WP to implement the missing mechanic. The intake contract carries enough to
draft an implementation WP without the engine knowing the pipeline exists:
mechanic, example card id, timing, reason, observed count, source overlay/export
row, and proposed target layer. The lane may draft backlog items; it must not
mutate game state or invent facts absent from the signal/overlay.

---

## 7. Proposed WP decomposition

| WP | Title | Layer | Depends on | Summary |
|---|---|---|---|---|
| **WP-257** | Hollow Effect Detector — engine runtime invariant | game-engine | — | The detector, outcome taxonomy (§4.1), `HollowEffectRecord` channel, hero + villain classification, parser `unresolvedMarkers` surfacing (§4.2), `G.messages` lines, bounded diagnostics storage, deterministic tests. Records **D-24033** + **D-24034**. The foundation. |
| **WP-258** | Hollow effects on `/debug` | arena-client + dashboard | WP-257 | Project records to operator-visible debug output + diagnostics-export visibility. |
| **WP-259** | Runtime-observed coverage overlay | tooling + dashboard | WP-257 | Overlay runtime-confirmed gaps onto the mechanic ledger / `/coverage`. Records **D-24035**. |
| **WP-260** | Architect-lane gap intake | dashboard agent pipeline | WP-259 | Convert runtime-confirmed gaps into architect-lane backlog candidates. Records **D-24036**. |

WP-258 and WP-259 are parallel-safe after WP-257. WP-260 depends on WP-259. Each
respects its layer boundary; WP-257 emits only a serializable signal and imports
nothing downstream.

---

## 8. WP acceptance criteria (binary)

### WP-257
- `executeHeroEffects` (or its live-path equivalent) returns an inspectable
  execution summary.
- Hero hollow detection records a `HollowEffectRecord` for declared-but-unreachable
  handlers; villain/henchman detection does the same at the ambush/fight/escape
  sites.
- The parser distinguishes an **unresolved marker** from **flavor text** (only the
  former can flag).
- Legitimate no-ops record **no** hollow event: empty bystander supply; empty
  deck / empty source; failed condition; explicitly-deferred mechanic.
- Unknown marker / unsupported keyword **does** record a hollow event.
- Records are JSON-serializable, runtime-only, never gameplay input, bounded by
  cap + dropped-count, and reset at the match-creation/hydration boundary.
- Each record produces a deterministic `G.messages` line.
- Tests cover at minimum: unknown hero keyword; unsupported hero keyword;
  implemented hero handler that no-ops; failed hero condition; unknown ambush
  descriptor; implemented ambush handler that no-ops; flavor-text line (no flag).

### WP-258
- `/debug` (or the diagnostics-debug surface) displays hollow-effect records,
  with an explicit empty state.
- No engine import into the dashboard/client layer.
- The diagnostics export carries enough hollow-effect data for offline review.

### WP-259
- Runtime-observed hollow effects render as an overlay on coverage, **visually
  distinct** from static-unsupported.
- Overlay data is derived downstream, never written by the engine.
- Repeated observations are counted/grouped deterministically.

### WP-260
- The architect lane consumes runtime-observed gaps as backlog candidates
  carrying mechanic, card example, timing, reason, and observed evidence.
- Generated candidates claim no implementation scope beyond the diagnostic facts.
- The engine remains unaware of the agent pipeline.

---

## 9. Boundaries & non-goals

- The engine **only emits** the signal — it never calls the dashboard, writes a
  WP, mutates the mechanic ledger, or knows the agent pipeline exists.
- `G.diagnostics.hollowEffects` is runtime-only, JSON-serializable, bounded,
  excluded from durable persistence, and never a gameplay input.
- No new nondeterminism: no I/O, clock, randomness, async, or env-dependent
  behavior in the detector.
- Not in scope: *implementing* missing mechanics (that is the downstream work the
  Architect lane generates). This initiative makes gaps **loud**, not filled.
- Does not replace the static coverage gates — it complements them with runtime
  evidence.
- Legitimate no-ops are explicitly excluded from hollow classification.

---

## 10. Open decisions (logged when packets execute)

- **D-24033** — hollow-vs-legitimate boundary: the final reason taxonomy, the
  binary flag map, and the explicit deferred allowlist (incl. whether deferred
  mechanics surface at a lower severity).
- **D-24034** — `HollowEffectRecord` shape + `G.diagnostics.hollowEffects`
  channel: fields, cap, dropped-count, reset cadence, and the parser
  `unresolvedMarkers` surfacing that makes `parse-unrecognized` detectable.
- **D-24035** — the `/coverage` runtime-overlay representation on the ledger row.
- **D-24036** — the architect-lane intake contract for runtime-confirmed gaps.

---

## 11. Survival lens

Every hollow ability is a player reading a card, making a decision, and watching
nothing happen — the quiet version of a broken product. This initiative turns
silent runtime gaps into deterministic evidence:

1. the engine records the hollow effect;
2. `/debug` makes it immediately visible;
3. `/coverage` distinguishes theoretical-unsupported from
   actually-encountered-in-play;
4. the Architect lane receives enough evidence to draft the implementation work.

The Web-Shooters bug set the posture: the engine may legitimately no-op, but it
must never silently swallow a declared ability whose handler does not exist.
