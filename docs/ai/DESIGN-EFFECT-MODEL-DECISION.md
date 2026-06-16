# Decision: Effect Descriptor Model — Closed Mechanics vs. Composable Primitives

> **Status:** DRAFT — proposed architecture decision for Jeff's ratification.
> Subordinate to `docs/ai/ARCHITECTURE.md` and `.claude/rules/*.md`. **Extends**
> `docs/ai/DESIGN-EFFECT-AUTHORING-SCALE.md`, especially §2b's load-bearing
> finding on closed-union vocabulary pressure. Reserves one `DECISIONS.md`
> D-entry, to be assigned on ratification.
> **Date:** 2026-06-16

---

## 1. The question

Should card effects keep using a **closed, one-keyword-per-mechanic** vocabulary
(an engine change for every new mechanic), or should cards become **self-
describing**, so a new set can usually ship as data with no new engine logic?

It became urgent while scoping Berserk, the first major long-tail effect case.
Implementing it narrowly means: add `'berserk'` to the closed `HeroKeyword`
union + the canonical array + a `DECISIONS` entry + a handler + a drift test +
regenerate coverage. Every future mechanic repeats that ceremony — which fights
Vision Secondary Goal 10 ("expansions should not require new engine logic").

---

## 2. Where we actually are

`DESIGN-EFFECT-AUTHORING-SCALE.md` already diagnosed this — §2a (per-mechanic WP
ceremony), §2b (closed-union-per-magnitude fragmentation, D-20201), §2c
(hardcoded `switch`). The three Levers (WP-250/251/252/253) shipped and addressed
§2c (the ImplementationMap replaced the switch) and **partly** §2b (collapsed 8
`reveal-*` keywords into one parameterized `reveal`).

**But the union is still closed at the mechanic level.** The Levers reduced
fragmentation; they did not open the vocabulary to data-authored mechanics. So
Jeff's read — "I thought we moved away from the closed union" — is half-right: we
shrank closed-keyword fragmentation, we did not move from *closed mechanics* to
*composable primitives*. Berserk proves it — a genuinely new mechanic still costs
an engine change.

---

## 3. The hard constraint

Determinism, replay, and testability (Vision Primary Goal 3) are the competitive-
integrity foundation of the product. **A card cannot carry arbitrary logic the
engine blindly runs** — that breaks replay, auditability, deterministic
simulation, and test predictability.

So "self-describing cards" cannot mean arbitrary per-card rules or scripts. It
must mean:

> Cards declare **deterministic effect descriptors** in a **bounded vocabulary**
> the engine interprets.

The vocabulary does not disappear. The decision is about **what the vocabulary
represents** — and it should stop representing *mechanics* and start representing
*primitives*.

---

## 4. The model spectrum

| Model | New-mechanic cost | Determinism | Fit |
|---|---|---|---|
| **A. One closed keyword per mechanic** (pre-Lever) | An engine WP every time — the grind | Easy | Doesn't scale to 40 sets |
| **B. Parameterized keyword families** (the Levers) | Data for variants; engine for new *families* | Easy | Current transitional state |
| **C. Composable primitives** | Data for most mechanics; engine work only for a new *primitive* | Easy — engine interprets a closed, tested primitive set | **Target** |
| **D. Full per-card scripting DSL** | Data for nearly everything | Hard — needs a sandboxed interpreter; harder to audit/test | Over-engineered for a co-op deck-builder |

---

## 5. Decision

**Adopt model C — composable primitives — as the target effect descriptor
model, as the explicit continuation of the Levers, not a reversal of them.** The
system evolves from mechanic-shaped keywords toward a small, closed, versioned
set of deterministic primitives; card effects are authored as **data** that
composes those primitives.

---

## 6. The critical definition: primitive vs. mechanic

This is the load-bearing distinction. Get it wrong and model C silently decays
back into model A at a larger granularity.

> A **primitive** is an *irreducible, deterministic* engine building block — an
> action, a selector, a value expression, a control combinator, or a binding. A
> primitive is **not** a named mechanic.
>
> A **mechanic** (Berserk, Focus, Wall-Crawl) is a card-facing gameplay concept.
> A mechanic should normally be a *composition* of primitives.

| Primitive category | Examples |
|---|---|
| **Action** | `move-card`, `draw-card`, `gain-resource`, `ko-card`, `reveal-cards` |
| **Selector** | `current-player`, `top-of-deck`, `revealed-cards`, `chosen-card` |
| **Value expression** | `constant(N)`, `card-printed-stat(card, stat)`, `count(cards)` |
| **Control** | `sequence`, `conditional`, `choice`, `for-each` |
| **Context** | `bind: <name>` (store action output), `ref: <name>` (read stored output) |

A primitive named `discard-top-gain-from-stat` would **fail** this test — it is a
mechanic-shaped macro wearing a primitive's name, and it recreates the closed-
keyword problem one level up. The orthogonal pieces (`move-card` + a `top-of-deck`
selector + `bind` + `gain-resource` + a `card-printed-stat` value expression) are
the real primitives.

---

## 7. What stays closed (the architectural shift)

The closed union does not disappear — it **changes level**:

```
Before:  closed union = the set of supported card MECHANICS   (large, fast-growing)
After:   closed union = the set of supported engine PRIMITIVES (small, slow-growing)
```

In one sentence:

> **Primitive registry:** closed, versioned, deterministic, drift-tested,
> decision-ceremonied.
> **Mechanic space:** open, data-authored, coverage-ledgered.

---

## 8. The core rule going forward

For every new mechanic: **"Is this a new primitive, or a composition of existing
primitives?"**

A **composition** ships as **card data**. It needs card markup, a regenerated
coverage baseline + mechanic ledger, and a behavior test/fixture. It does **not**
need a new keyword, a new engine handler, a primitive-registry drift update, or a
`DECISIONS` entry — *unless the composition exposes a genuinely new architectural
rule or data contract* (a content-ledger note or baseline bump may still apply;
an architecture D-entry does not).

A **genuinely new primitive** earns engine work, and the full ceremony: a clear
deterministic contract, schema/type coverage, ImplementationMap registration,
replay-safe behavior, fixtures, drift protection, a `DECISIONS` entry, and a line
in this descriptor model. That ceremony now applies to the *small, slow* primitive
set, never to *large, fast* content.

---

## 9. Immediate application: Berserk (the proving case)

Berserk's rule: *"Discard the top card of your deck. You get +Attack equal to its
printed Attack."* It should be **neither** a narrow `'berserk'` keyword **nor** a
`discard-top-gain-from-stat` macro. It should be a **composition**:

```
sequence:
  1. move-card  from { owner: current-player, zone: deck, position: top }
                to   { owner: current-player, zone: discard }
                bind discardedCard
  2. gain-resource  resource: attack
                    amount: card-printed-stat(discardedCard, attack)
```

As a descriptor:

```ts
{
  type: 'sequence',
  steps: [
    { type: 'move-card',
      from: { owner: 'current-player', zone: 'deck', position: 'top' },
      to:   { owner: 'current-player', zone: 'discard' },
      bind: 'discardedCard' },
    { type: 'gain-resource',
      resource: 'attack',
      amount: { type: 'card-printed-stat', card: { ref: 'discardedCard' }, stat: 'attack' } }
  ]
}
```

Berserk itself is now **data**. The engine gains reusable primitives (`move-card`,
`gain-resource`, the `card-printed-stat` value expression, `bind`/`ref`, `sequence`).
The mechanically-identical cousin — discard the top card, gain **Recruit** equal
to its printed Recruit — is then authored as data with **no engine change**:

```ts
{
  type: 'sequence',
  steps: [
    { type: 'move-card',
      from: { owner: 'current-player', zone: 'deck', position: 'top' },
      to:   { owner: 'current-player', zone: 'discard' },
      bind: 'discardedCard' },
    { type: 'gain-resource',
      resource: 'recruit',
      amount: { type: 'card-printed-stat', card: { ref: 'discardedCard' }, stat: 'recruit' } }
  ]
}
```

The underlying values already exist in `G` deterministically — `G.cardStats[id]`
carries the printed `attack`/`recruit` resolved at setup, and the reveal handler
already reads it — so `card-printed-stat` is replay-safe.

**Eyes-open cost (the real trade):** doing Berserk this way means the *first* WP
**bootstraps the primitive infrastructure** — the descriptor schema, the
interpreter (including transient execution context for `bind`/`ref`), and the
first action primitives — not just one handler. So the first step is **larger**
than a narrow keyword would have been; the payoff (every cousin becomes data,
forever) lands *after* it. Ratifying model C is ratifying that front-loaded cost.

**Context-lifetime default (pin in the WP):** the execution context is created
per top-level effect evaluation; a binding is lexically scoped to its enclosing
`sequence` and visible to later steps within it; and the context is **never
written to `G`** — bound values are transient interpreter state, re-derived
identically on replay, not game state. This keeps `bind`/`ref` inside the
determinism and `G`-is-runtime-only invariants (a binding persisted into `G`
would violate the persistence boundary and risk double-application on replay).

---

## 10. Counter-pressure (the honest case against)

**Premature abstraction.** The code standard says *"duplicate first, abstract on
the third copy,"* and Berserk is the *first* of its pattern. Building a complete
effect language up front would be exactly that over-engineering.
*Mitigation:* do **not** design the whole language now. Grow the primitive
registry **one primitive at a time, at the lowest reusable level the current
mechanic justifies** — for Berserk, only `move-card` / `gain-resource` /
`card-printed-stat` / `bind` / `sequence`, and only the pieces not already
present. What tips "abstract on the third copy" toward "abstract on the first"
*here* is that the mechanic ledger already **proves** the long tail exists (124
unsupported hero mechanics today) — we are not speculating about future content;
the corpus already contains it.

**Interaction is the real hard part.** Composable primitives make *firing* an
effect trivial; *how effects interact* (timing, execution context lifetime,
triggers, ordering, replacement) is where engine complexity legitimately lives.
Legendary being co-op and non-stack keeps this far more tractable than MTG, but
a future mechanic that introduces a new timing or replacement model may still
justify a new primitive or even a small interaction subsystem. This decision does
not pretend otherwise.

---

## 11. Ratification requirements

This decision is ratified when the next free `DECISIONS.md` D-entry records:

1. The effect descriptor target is **composable primitives** — not closed
   mechanics, not arbitrary scripting.
2. The **primitive registry stays closed, versioned, deterministic, drift-tested**;
   the **mechanic space is open**, data-authored, coverage-ledgered.
3. Every new mechanic is first evaluated as a *composition of existing primitives*.
4. Only a *genuinely new primitive* justifies engine work + decision ceremony.
5. Berserk is the first proving case, implemented as data over reusable primitives.
6. `DESIGN-EFFECT-AUTHORING-SCALE.md` §2b/§5 is updated to reflect the shift from
   mechanic-keywords to primitive composition.

---

## 12. Acceptance criteria for the Berserk proving WP

The Berserk WP passes only if:

- Berserk cards execute deterministically; their rows flip `unsupported →
  executable` in the coverage output, and the baseline + mechanic ledger are
  regenerated intentionally.
- **No arbitrary per-card code or script execution** is introduced — only
  descriptor data interpreted by closed primitives.
- The implemented primitives (`move-card`, `gain-resource`, `card-printed-stat`,
  `bind`, `sequence`) are **reusable outside Berserk** and live in a drift-
  protected registry with a `DECISIONS` entry.
- A mechanically-adjacent variant (gain **Recruit** from the discarded card's
  printed Recruit) is representable as **data** with no new engine keyword.
- The new descriptor schema is documented; existing replay, fixture, and
  regression tests continue to pass.

---

## 13. Recommendation (one line)

> **Adopt composable effect primitives as the target descriptor model: keep the
> primitive registry closed, deterministic, and drift-tested, but stop treating
> every card mechanic as an engine keyword. Berserk is the first proof case —
> expressed as data composed from reusable primitives, not as a new closed
> mechanic keyword.**
>
> The engine knows primitives. Cards declare compositions. Mechanics stop being
> engine vocabulary unless they introduce a genuinely new primitive.
