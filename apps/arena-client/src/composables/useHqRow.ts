/**
 * Pure transform that derives the 6-cell visual HQ row from `UIHQState`
 * + `UIDecksState`.
 *
 * Visual column order (left-to-right) per `DESIGN-BOARD-LAYOUT.md §7.1`:
 *   `Hero1 | Hero2 | Hero3 | Hero4 | Hero5 | Hero Deck`
 *
 * Per D-12903 the MVP HQ slot count is 5; if a future scenario projects
 * 6 hero slots, the returned array length grows to 7 (6 heroes + Hero
 * Deck). The renderer should render whatever count the engine projects.
 *
 * Per WP-128 / pre-flight 2026-04-29 PS-6, `UIHQState.slots` carries
 * `(string | null)[]` (bare CardExtIds) and the optional `slotDisplay?`
 * carries the parallel display payload. WP-129 binds to both: the bare
 * `slots` for stable identity, the `slotDisplay` for cost-gating.
 *
 * @see WP-129 §Acceptance Criteria — HQ row 6 cells
 * @see EC-132 §2 HQ visual column order
 * @see DESIGN-BOARD-LAYOUT.md §7.1 HQ row
 */

import type {
  UICardDisplay,
  UIDecksState,
  UIHQCard,
  UIHQState,
} from '@legendary-arena/game-engine';

export type HqCell =
  | { kind: 'hero'; hqIndex: number; cardId: string | null; display: UICardDisplay | null }
  | { kind: 'heroDeck'; count: number };

/**
 * Build the (N+1)-cell row in left-to-right reading order.
 *
 * Cells `0..N-1`: hero slots from `hq.slots[0..N-1]`. Cell N: hero deck.
 * For each hero slot, the parallel `hq.slotDisplay?[i]` payload populates
 * the cell's `display` field; when the parallel array is missing or the
 * slot is empty, `display` is `null`.
 */
export function useHqRow(
  hq: UIHQState,
  decks: UIDecksState,
): { cells: HqCell[] } {
  const cells: HqCell[] = [];
  for (let hqIndex = 0; hqIndex < hq.slots.length; hqIndex += 1) {
    const cardId = hq.slots[hqIndex] ?? null;
    let display: UICardDisplay | null = null;
    if (hq.slotDisplay !== undefined) {
      const slot: UIHQCard | null = hq.slotDisplay[hqIndex] ?? null;
      if (slot !== null) {
        display = slot.display;
      }
    }
    cells.push({ kind: 'hero', hqIndex, cardId, display });
  }
  cells.push({ kind: 'heroDeck', count: decks.heroDeckCount });
  return { cells };
}
