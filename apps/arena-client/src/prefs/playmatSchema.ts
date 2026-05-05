/**
 * playmatSchema.ts
 *
 * Closed-set narrower for the active playmat skin name. The closed set
 * is derived directly from `Object.keys(skinManifest)` per WP-130 §A
 * canonical-source rule — the manifest is the single source of truth,
 * never duplicated by hand. The previous registry-viewer single-key
 * preference precedents (`useCardSize` / `useThemeSize` under WP-121 /
 * WP-124) use plain TypeScript narrowing rather than Zod for the same
 * reason: a closed-set string check is a one-liner that adds zero
 * dependencies and zero schema-version envelope.
 *
 * The narrower returns the parsed value or `'classic'` (D-13005
 * unconditional fallback) and emits a single `console.warn` with a
 * full-sentence reason per `00.6` Rule 11 when the input is missing,
 * the wrong type, or outside the closed set. The default skin
 * `'classic'` matches physical Marvel Legendary board art (D-13003).
 *
 * @see WP-130 §A "Pinia preferences store" — canonical-source rule
 * @see DECISIONS.md D-13001 (bundled discovery), D-13003 (bundled set),
 *      D-13005 (asset-failure / empty-state fallback to `'classic'`)
 */

import { skinManifest, type SkinName } from './skinManifest';

/**
 * The closed set of valid skin names, derived from the manifest keys
 * exactly once. Exported for test-time drift detection (the schema's
 * closed set must equal `Object.keys(skinManifest)`).
 */
export const SKIN_NAMES: readonly SkinName[] = Object.keys(skinManifest) as SkinName[];

/**
 * The unconditional fallback skin per D-13005. Used both as the
 * default-on-first-launch value and the asset-failure fallback in
 * `useSkinApplier`.
 */
export const DEFAULT_SKIN_NAME: SkinName = 'classic';

/**
 * Returns true when the value is one of the closed-set skin names.
 * Acts as a TypeScript predicate so callers can narrow `unknown` to
 * `SkinName` without an additional cast.
 */
export function isSkinName(value: unknown): value is SkinName {
  if (typeof value !== 'string') {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(skinManifest, value);
}

/**
 * Parses an arbitrary input into a `SkinName`. Returns `DEFAULT_SKIN_NAME`
 * (`'classic'`) on any rejection — missing, wrong type, or outside the
 * closed manifest set. Emits a single `console.warn` with a
 * full-sentence reason per `00.6` Rule 11 so corrupt or stale
 * `localStorage` blobs surface in the dev console without breaking the
 * UI.
 *
 * @param value - Any value, typically the raw `localStorage` string.
 * @returns The parsed `SkinName` or `DEFAULT_SKIN_NAME`.
 */
export function parseSkinName(value: unknown): SkinName {
  if (isSkinName(value)) {
    return value;
  }
  // why: Rule 11 requires a full-sentence reason for any swallowed
  // error or rejected input. The fallback target is locked at
  // `DEFAULT_SKIN_NAME` per D-13005; do not branch the fallback by
  // failure mode (corrupt blob, unknown skin name, missing key all
  // collapse to the same recovery path).
  console.warn(
    `[playmat] Rejected skin-name input ${JSON.stringify(value)}; falling back to '${DEFAULT_SKIN_NAME}' per D-13005. Valid skin names: ${SKIN_NAMES.join(', ')}.`,
  );
  return DEFAULT_SKIN_NAME;
}
