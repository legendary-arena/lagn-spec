/**
 * Effect primitive registry v1 — the homogeneous effect-descriptor AST (D-24030).
 *
 * The CLOSED half of the composable-primitive model (D-24029): a small, versioned,
 * drift-tested set of irreducible primitives the interpreter walks. Card mechanics
 * become DATA that composes these primitives (the OPEN half lives in
 * `heroCompositions.ts`) — never arbitrary per-card code.
 *
 * The descriptor is a homogeneous AST: every node carries a `type`; a composition is
 * an explicit `{ type: 'sequence', steps: [...] }`, never a raw array. The first node
 * types are `sequence` (control), `move-card` + `gain-resource` (actions); the first
 * value expression is `card-printed-stat`. The transient `bind`/`ref` execution context
 * is the D-24029 §9 mechanism: a `move-card` `bind` stores the moved card id, a
 * `card-printed-stat` `ref` reads it back — both key into the same EffectExecutionContext.
 *
 * No boardgame.io imports. No registry imports. Contracts only.
 */

import type { CardExtId } from '../state/zones.types.js';

// ---------------------------------------------------------------------------
// Closed node-type + value-expression unions (drift-detected)
// ---------------------------------------------------------------------------

/**
 * Closed canonical union of effect node types. A node is one step of a composition:
 * `sequence` (control combinator) or an action (`move-card`, `gain-resource`).
 */
export type EffectNodeType =
  | 'sequence'
  | 'move-card'
  | 'gain-resource';

// why: canonical drift array (D-24030) — adding a node type requires updating THIS
// array, the EffectNodeType union, the EFFECT_NODE_HANDLERS registry, AND a DECISIONS.md
// entry together (code-style §Drift Detection). The drift test in effectPrimitive.test.ts
// pins array/union parity and asserts the registry keys deep-equal it bidirectionally.
export const EFFECT_NODE_TYPES: readonly EffectNodeType[] = [
  'sequence',
  'move-card',
  'gain-resource',
] as const;

/**
 * Closed canonical union of value-expression types. A value expression resolves to a
 * number at interpretation time (the amount a `gain-resource` grants).
 */
export type ValueExpressionType =
  | 'card-printed-stat';

// why: canonical drift array (D-24030) — adding a value-expression type requires
// updating THIS array, the ValueExpressionType union, the VALUE_EXPRESSION_EVALUATORS
// registry, AND a DECISIONS.md entry together (code-style §Drift Detection).
export const VALUE_EXPRESSION_TYPES: readonly ValueExpressionType[] = [
  'card-printed-stat',
] as const;

// ---------------------------------------------------------------------------
// Closed parameter unions (drift-detected)
// ---------------------------------------------------------------------------

/**
 * Closed canonical union of resource kinds a `gain-resource` node can grant and a
 * `card-printed-stat` expression can read. `recruit` is seeded so the Berserk Recruit
 * cousin is pure data, not an engine edit (D-24030 / D-24029 §7).
 */
export type EffectResourceKind =
  | 'attack'
  | 'recruit';

// why: canonical drift array (D-24030) — adding a resource kind requires array + union
// + DECISIONS together (code-style §Drift Detection).
export const EFFECT_RESOURCE_KINDS: readonly EffectResourceKind[] = [
  'attack',
  'recruit',
] as const;

/**
 * Closed canonical union of zone kinds a `move-card` endpoint can reference. Scoped to
 * Berserk's substrate (`deck` source, `discard` destination).
 */
export type EffectZoneKind =
  | 'deck'
  | 'discard';

// why: canonical drift array (D-24030) — adding a zone kind requires array + union +
// DECISIONS together (code-style §Drift Detection).
export const EFFECT_ZONE_KINDS: readonly EffectZoneKind[] = [
  'deck',
  'discard',
] as const;

/**
 * Closed canonical union of card positions a `move-card` source endpoint can target.
 * Only `top` (the top of the source zone) is seeded.
 */
export type EffectCardPosition =
  | 'top';

// why: canonical drift array (D-24030) — adding a position requires array + union +
// DECISIONS together (code-style §Drift Detection).
export const EFFECT_CARD_POSITIONS: readonly EffectCardPosition[] = [
  'top',
] as const;

/**
 * Closed canonical union of endpoint owners. Only `current-player` is seeded — Berserk
 * operates on the active player's own zones.
 */
export type EffectOwnerKind =
  | 'current-player';

// why: canonical drift array (D-24030) — adding an owner kind requires array + union +
// DECISIONS together (code-style §Drift Detection).
export const EFFECT_OWNER_KINDS: readonly EffectOwnerKind[] = [
  'current-player',
] as const;

// ---------------------------------------------------------------------------
// Endpoint + reference shapes
// ---------------------------------------------------------------------------

/**
 * A zone endpoint a `move-card` node reads from or writes to. `position` applies to a
 * source endpoint only (`top`); a destination endpoint appends, so it omits `position`.
 */
export interface ZoneEndpoint {
  owner: EffectOwnerKind;
  zone: EffectZoneKind;
  position?: EffectCardPosition;
}

/**
 * The READ half of the D-24029 §9 context mechanism: a `card-printed-stat` expression's
 * `card` field. `ref` names the binding a prior `move-card` `bind` wrote into the
 * EffectExecutionContext. The only `card` shape a value expression accepts this WP (no
 * selector or literal-card forms).
 */
export interface CardReference {
  ref: string;
}

// ---------------------------------------------------------------------------
// Value expressions
// ---------------------------------------------------------------------------

/**
 * Resolves to a card's printed stat (its setup-resolved `G.cardStats` attack/recruit).
 * `card` resolves a context binding; `stat` selects which printed resource to read.
 */
export interface CardPrintedStatExpression {
  type: 'card-printed-stat';
  card: CardReference;
  stat: EffectResourceKind;
}

/**
 * A value expression resolving to a number at interpretation time.
 */
export type ValueExpression = CardPrintedStatExpression;

// ---------------------------------------------------------------------------
// Effect nodes (the homogeneous AST)
// ---------------------------------------------------------------------------

/**
 * Control combinator — runs `steps` in array order, threading the SAME execution
 * context to each step (so a later `ref` reads an earlier `bind`).
 */
export interface SequenceNode {
  type: 'sequence';
  steps: EffectNode[];
}

/**
 * Action — moves the top card of `from` to `to`. `bind`, when present, writes the moved
 * card id into the execution context (the WRITE half of the D-24029 §9 mechanism). An
 * empty source zone is a deterministic no-op (no move, no bind, no reshuffle).
 */
export interface MoveCardNode {
  type: 'move-card';
  from: ZoneEndpoint;
  to: ZoneEndpoint;
  bind?: string;
}

/**
 * Action — grants `amount` (a value expression resolved at interpretation time) of
 * `resource` to the current turn economy.
 */
export interface GainResourceNode {
  type: 'gain-resource';
  resource: EffectResourceKind;
  amount: ValueExpression;
}

/**
 * A node in the homogeneous effect-descriptor AST.
 */
export type EffectNode =
  | SequenceNode
  | MoveCardNode
  | GainResourceNode;

// ---------------------------------------------------------------------------
// Transient execution context (the load-bearing replay invariant)
// ---------------------------------------------------------------------------

// why: D-24029 §9 / D-24030 — the bind/ref store is created PER top-level effect
// evaluation, lexically scoped to its enclosing `sequence`, and is NEVER written to
// `G`/`ctx`. Bound values are transient interpreter state, re-derived identically on
// replay, not game state — a binding persisted into `G` would break the persistence
// boundary (`G` is runtime-only) and risk double-application on replay. It is a local
// `Map`, not a field on any persisted structure.
/**
 * The transient `bind`/`ref` store. A `Map` from binding name to the bound card id,
 * created fresh per top-level `interpretHeroPrimitiveEffect` call. Never persisted.
 */
export type EffectExecutionContext = Map<string, CardExtId>;
