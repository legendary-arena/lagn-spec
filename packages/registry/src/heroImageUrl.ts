/**
 * heroImageUrl.ts — assembles the R2 image URL for a hero's physical card.
 *
 * Solo (single-side) pattern:
 *   {setAbbr}-hr-{heroSlug}-{sides[0]}.webp
 *   e.g., nmut-hr-wolfsbane-night-vision.webp
 *
 * Split (two-side) pattern:
 *   {setAbbr}-hr-{heroSlug}-{sides[0]}-{sides[1]}.webp
 *   e.g., bkwd-hr-falcon-winter-soldier-attune-atone.webp
 *
 * Companion (any side count) pattern — companionSlug inserted between
 * heroSlug and the side segment:
 *   {setAbbr}-hr-{heroSlug}-{companionSlug}-{sides.join('-')}.webp
 *   e.g., mgtg-hr-drax-rhomann-dey-remove-his-spine-also-illegal.webp
 *
 * why: D-14701 introduces the optional companionSlug field on
 * PhysicalCardSchema; the slug names a non-hero companion character that
 * appears on the printed card's artwork alongside the hero. The filename
 * pattern places companionSlug between heroSlug and the side slugs so the
 * filename reads left-to-right as (set, ribbon, hero, companion, sides).
 *
 * why: D-14702 — two-side filenames use source-data sides[] order with NO
 * Array.prototype.sort(). The source-data order is the physical-side order
 * (side A on the left/top of the printed card is first in the array), which
 * is also deterministic because JSON files are byte-identical across
 * Windows/Linux/CI. D-14702 narrowly overrides D-13802's UTF-16 sort lock
 * for sides.length === 2; D-13802 remains in effect for single-side
 * filenames and any future automatic ordering operation.
 *
 * This module performs no I/O and depends on no other registry code. It
 * is callable from build-time tooling (scripts/convert-cards/) and from
 * any future registry-runtime consumer.
 */

// why: URL host is used only for string assembly — this module performs
// no network access against it. Host migration from the bageltop-era
// images.barefootbetters.com to images.legendary-arena.com landed on
// main via commit 0d962f3 before this branch was rebased; this constant
// is the single source of truth for any future host change.
export const R2_BASE_URL = "https://images.legendary-arena.com";

/**
 * Builds the R2 image URL for a hero's physical card.
 *
 * @param setAbbr - Set abbreviation (e.g., "bkwd", "mgtg").
 * @param heroSlug - Hero slug (e.g., "falcon-winter-soldier", "drax").
 * @param sides - Array of 1 or 2 card-side slugs in physical-side order.
 *   For sides.length === 2, source-data order is preserved verbatim (no
 *   sort) per D-14702.
 * @param companionSlug - Optional slug of a non-hero companion character
 *   depicted on the printed card's artwork (e.g., "irani-rael"). When
 *   provided, inserted between heroSlug and the side segment in the
 *   filename.
 * @returns Full R2 image URL string.
 * @throws Error if `sides` is not an array of length 1 or 2 (D-13802
 *   ceiling lock; raising requires a new DECISIONS entry).
 * @throws Error if `companionSlug` is provided and does not match the
 *   slug regex `^[a-z0-9-]+$` (module-boundary defense-in-depth;
 *   PhysicalCardSchema is primary enforcement for registry data).
 */
export function heroImageUrl(
  setAbbr: string,
  heroSlug: string,
  sides: readonly string[],
  companionSlug?: string,
): string {
  if (!Array.isArray(sides) || sides.length < 1 || sides.length > 2) {
    throw new Error(
      `heroImageUrl(setAbbr="${setAbbr}", heroSlug="${heroSlug}"): sides must be ` +
      `an array of length 1 or 2 (D-13802 ceiling lock); received ${JSON.stringify(sides)}.`
    );
  }

  if (companionSlug !== undefined) {
    if (typeof companionSlug !== "string" || companionSlug.length === 0) {
      throw new Error(
        `heroImageUrl(setAbbr="${setAbbr}", heroSlug="${heroSlug}"): companionSlug ` +
        `must be a non-empty slug when provided; received ${JSON.stringify(companionSlug)}. ` +
        `Pass undefined explicitly when no companion appears on the printed artwork.`
      );
    }
    if (!/^[a-z0-9-]+$/.test(companionSlug)) {
      throw new Error(
        `heroImageUrl(setAbbr="${setAbbr}", heroSlug="${heroSlug}"): companionSlug ` +
        `${JSON.stringify(companionSlug)} must match the slug regex ^[a-z0-9-]+$ ` +
        `(lowercase alphanumerics and hyphens only); check the source data for stray ` +
        `whitespace, uppercase, or punctuation.`
      );
    }
  }

  // why: D-14702 — sides[] order is taken from source data verbatim for
  // sides.length === 2 (physical-side order: side A on the left/top of the
  // printed card is first in the array). NO Array.prototype.sort() here.
  // D-13802's UTF-16 sort lock remains in effect for single-side filenames
  // and any future automatic ordering operation — D-14702 is scoped
  // narrowly to sides.length === 2.
  const sidesSegment = sides.join("-");
  const middleSegment = companionSlug !== undefined
    ? `${heroSlug}-${companionSlug}-${sidesSegment}`
    : `${heroSlug}-${sidesSegment}`;
  const filename = `${setAbbr}-hr-${middleSegment}.webp`;
  return `${R2_BASE_URL}/${setAbbr}/${filename}`;
}
