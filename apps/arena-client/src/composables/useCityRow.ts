/**
 * Pure transform that derives the 7-cell visual city row from `UICityState`
 * + `UIDecksState` + `escapedPile`.
 *
 * Visual column order (left-to-right) per `DESIGN-BOARD-LAYOUT.md §7.1`:
 *   `Escaped Pile | Bridge | Streets | Rooftops | Bank | Sewers | Villain Deck`
 *
 * Engine-to-visual mapping (per `packages/game-engine/src/board/city.logic.ts`):
 *   - **Engine space 0** is the ENTRY POINT — new villains revealed from the
 *     deck land here. Visually this is the rightmost city slot (Sewers),
 *     adjacent to the Villain Deck cell on the right edge.
 *   - **Engine space 4** is the ESCAPE EDGE — when a villain is pushed past
 *     this slot, it escapes into the Escaped Pile. Visually this is the
 *     leftmost city slot (Bridge), adjacent to the Escaped Pile on the
 *     left edge.
 *   - Visual flow: villain enters at Sewers (right) → advances leftward
 *     through Bank → Rooftops → Streets → Bridge → escapes off the left
 *     edge into the Escaped Pile.
 *
 * The visual cells therefore render the engine's `city.spaces[]` in
 * REVERSE order: visual cell `n` (1..5 left-to-right) corresponds to
 * engine index `4 - (n - 1)` (so visual Sewers = engine 0, visual
 * Bridge = engine 4).
 *
 * @see WP-129 §Acceptance Criteria — City row 7 cells
 * @see EC-132 §2 City visual column order
 * @see DESIGN-BOARD-LAYOUT.md §7.1 City row
 * @see packages/game-engine/src/board/city.logic.ts pushVillainIntoCity
 */

import type {
  UICityCard,
  UICityState,
  UIDecksState,
  UIDisplayEntry,
} from '@legendary-arena/game-engine';

export type CityCell =
  | { kind: 'escaped'; entries: UIDisplayEntry[]; count: number }
  | { kind: 'slot'; cityIndex: number; slotName: string; card: UICityCard | null }
  | { kind: 'villainDeck'; count: number };

// why: visual order is left → right (escape edge → entry edge). The
// engine's `city.spaces[]` is indexed entry → escape (0 = entry,
// length-1 = escape edge per pushVillainIntoCity). The visual order
// is therefore the reverse of the engine order.
const SLOT_NAMES_LEFT_TO_RIGHT: readonly string[] = [
  'Bridge',    // visual leftmost — engine escape edge (highest index)
  'Streets',
  'Rooftops',
  'Bank',
  'Sewers',    // visual rightmost — engine entry point (index 0)
];

/**
 * Build the 7-cell row in left-to-right reading order.
 *
 * Cell 0: escaped pile (left edge). Cells 1..5: city slots in visual
 * left-to-right order, with each cell's `cityIndex` resolved to the
 * corresponding engine index (Bridge = highest engine index, Sewers
 * = engine index 0). Cell 6: villain deck (right edge).
 *
 * The returned array length is always 7. When `city.spaces.length` differs
 * from 5 (defensive — should never happen at MVP), the visual cells use
 * the same reverse-mapping rule (visual leftmost = highest engine index).
 */
export function useCityRow(
  city: UICityState,
  decks: UIDecksState,
): { cells: CityCell[] } {
  const cells: CityCell[] = [];
  cells.push({
    kind: 'escaped',
    entries: city.escapedPile,
    count: city.escapedPile.length,
  });
  // why: iterate visually left-to-right but resolve to engine indices in
  // reverse so visual Sewers (rightmost) maps to engine index 0 (entry)
  // and visual Bridge (leftmost) maps to engine index spaces.length - 1
  // (escape edge). The engine's `city.spaces[0]` is where new villains
  // enter per pushVillainIntoCity; visual cell 5 (Sewers) renders that.
  const escapeEdgeIndex = city.spaces.length - 1;
  for (let visualIndex = 0; visualIndex < city.spaces.length; visualIndex += 1) {
    const cityIndex = escapeEdgeIndex - visualIndex;
    const card = city.spaces[cityIndex] ?? null;
    const slotName = SLOT_NAMES_LEFT_TO_RIGHT[visualIndex] ?? `Slot ${visualIndex + 1}`;
    cells.push({ kind: 'slot', cityIndex, slotName, card });
  }
  cells.push({ kind: 'villainDeck', count: decks.villainDeckCount });
  return { cells };
}
