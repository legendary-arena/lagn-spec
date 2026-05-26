/**
 * Shared trait slug normalization for the Legendary Arena game engine.
 *
 * Single canonical normalization path for hero class and team slugs.
 * Imported by both the markup parser (heroAbility.setup.ts) and the
 * trait builder (buildCardTraits.ts).
 */

// why: single canonical normalization path; prevents competing normalizers.
// Defined once here — do NOT define a second normalizer in any other file.

/**
 * Normalizes a raw trait slug to a canonical lowercase trimmed form.
 *
 * @param raw - Raw trait string from registry or markup.
 * @returns Normalized slug (trimmed, lowercased).
 */
export function normalizeTraitSlug(raw: string): string {
  return raw.trim().toLowerCase();
}
