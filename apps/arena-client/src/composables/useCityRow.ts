/**
 * Pure transform that derives the 7-cell visual city row from `UICityState`
 * + `UIDecksState` + `escapedPile`.
 *
 * Visual column order (left-to-right) per `DESIGN-BOARD-LAYOUT.md §7.1`:
 *   `Escaped Pile | Bridge | Streets | Rooftops | Bank | Sewers | Villain Deck`
 *
 * The engine indexes the city `0..4` and does NOT know which side is the
 * escape edge — the engine-index-to-slot-name mapping is a future board-
 * layout concern. WP-129 only fixes the visual row; the cells indexed
 * 1..5 in the returned array are the engine slots `0..4` in left-to-right
 * order.
 *
 * @see WP-129 §Acceptance Criteria — City row 7 cells
 * @see EC-132 §2 City visual column order
 * @see DESIGN-BOARD-LAYOUT.md §7.1 City row
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

const SLOT_NAMES_LEFT_TO_RIGHT: readonly string[] = [
  'Bridge',
  'Streets',
  'Rooftops',
  'Bank',
  'Sewers',
];

/**
 * Build the 7-cell row in left-to-right reading order.
 *
 * Cell 0: escaped pile. Cells 1..5: city slots 0..4 mapped to the locked
 * left-to-right names. Cell 6: villain deck.
 *
 * The returned array length is always 7. When `city.spaces.length` differs
 * from 5 (defensive — should never happen at MVP), the slot cells render
 * with whatever the engine projected and the names array is reused
 * positionally.
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
  for (let cityIndex = 0; cityIndex < city.spaces.length; cityIndex += 1) {
    const card = city.spaces[cityIndex] ?? null;
    const slotName = SLOT_NAMES_LEFT_TO_RIGHT[cityIndex] ?? `Slot ${cityIndex + 1}`;
    cells.push({ kind: 'slot', cityIndex, slotName, card });
  }
  cells.push({ kind: 'villainDeck', count: decks.villainDeckCount });
  return { cells };
}
