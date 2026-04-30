/**
 * setupUrlParams.ts — pure URL parser/serializer for the registry viewer's
 * URL-parameterized setup-preview surface (WP-114).
 *
 * Pure helper: no Vue, no DOM, no network, no clocks, no randomness, no I/O.
 * Deterministic: identical input strings yield identical output objects, and
 * identical input compositions yield identical output URLs.
 *
 * Binds exactly five composition fields to URL query parameters using the
 * canonical 9-field names verbatim: `schemeId`, `mastermindId`,
 * `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`. The four count fields
 * (`bystandersCount`, `woundsCount`, `officersCount`, `sidekicksCount`) and
 * all envelope fields are deliberately not URL-bound; the composable layer
 * sources their defaults from `useLoadoutDraft.ts` constants.
 *
 * Authority: WP-114 §Scope (A); EC-116 §Locked Values; D-114XX (canonical
 * URL keys; count/envelope-not-URL-bound).
 */

import type { SetupCompositionInput } from "@legendary-arena/registry/setupContract";

const SINGULAR_KEYS = ["schemeId", "mastermindId"] as const;
const ARRAY_KEYS = ["villainGroupIds", "henchmanGroupIds", "heroDeckIds"] as const;

type ArrayKey = (typeof ARRAY_KEYS)[number];

/**
 * Parses a URL query string into a `Partial<SetupCompositionInput>` containing
 * only the five URL-bound composition fields that were present in the input.
 *
 * Unknown query keys are silently dropped. The parser does not normalize,
 * lowercase, strip, or fuzzy-match values — the validator owns ID-validity
 * rejection. The parser never throws.
 *
 * Empty-value semantics:
 * - Singular keys present with empty value (e.g., `?schemeId=`) → empty
 *   string preserved (`{ schemeId: "" }`).
 * - Array keys present with empty value (e.g., `?villainGroupIds=`) →
 *   empty array (`{ villainGroupIds: [] }`), never `[""]`.
 *
 * @param search - The raw query string, with or without a leading `?`. May be
 *                 `window.location.search` (browser) or any equivalent.
 * @returns A partial composition containing only keys that appeared in the URL.
 */
export function parseSetupUrl(search: string): Partial<SetupCompositionInput> {
  // why: URLSearchParams handles forward slashes in the WP-113 set-qualified
  // ID format (`<setAbbr>/<slug>`, e.g., `core/loki-god-of-mischief`)
  // cleanly through standard URL encoding — no manual `%2F` handling needed,
  // no per-character escaping. This keeps the parser implementation
  // boring and the round-trip with `serializeSetupToUrl` byte-stable.
  const params = new URLSearchParams(search);
  const result: Partial<SetupCompositionInput> = {};

  for (const key of SINGULAR_KEYS) {
    if (!params.has(key)) {
      continue;
    }
    // why: `?schemeId=` (key present with empty value) → `{ schemeId: "" }`,
    // not `{}`. Presence in the URL is semantically meaningful — the user
    // shared a URL with this key, even if blank — and the validator owns
    // ID-validity rejection (the empty string is rejected as unknown_extid
    // by validateMatchSetupDocument). Dropping the key here would mask
    // user intent.
    result[key] = params.get(key) ?? "";
  }

  for (const key of ARRAY_KEYS) {
    if (!params.has(key)) {
      continue;
    }
    const raw = params.get(key) ?? "";
    // why: URLSearchParams yields `""` for an empty value. Splitting `""`
    // by `,` would produce `[""]`, which violates the `string[]` contract
    // (the type expects either zero entries or non-empty entity IDs).
    // Convert empty input to `[]` explicitly so empty arrays serialize and
    // parse symmetrically.
    result[key] = raw === "" ? [] : raw.split(",");
  }

  return result;
}

/**
 * Serializes a full `SetupCompositionInput` into a URL string with the five
 * URL-bound keys emitted in canonical order: `schemeId`, `mastermindId`,
 * `villainGroupIds`, `henchmanGroupIds`, `heroDeckIds`.
 *
 * Count fields and envelope fields are deliberately omitted — defaults live
 * in `useLoadoutDraft.ts` constants and surfacing them in the URL is a
 * future-extension hook, not part of this packet.
 *
 * The `baseUrl` argument MUST be origin + pathname only (e.g.,
 * `https://cards.barefootbetters.com/`). The serializer does not inspect
 * or strip an existing query/hash on `baseUrl`; that is the caller's
 * concern. Browser call sites pass `window.location.origin +
 * window.location.pathname`.
 *
 * @param composition - The full nine-field composition. Singular IDs are
 *                       always emitted (even when empty); array fields are
 *                       only emitted when non-empty so the URL stays compact.
 * @param baseUrl - Origin + pathname; everything before the `?`.
 * @returns A URL string of the form `${baseUrl}?schemeId=…&mastermindId=…`.
 */
export function serializeSetupToUrl(
  composition: SetupCompositionInput,
  baseUrl: string,
): string {
  // why: Only the five composition entity-ID fields are URL-bound. The
  // four count fields (bystanders/wounds/officers/sidekicks) and the
  // entire envelope (schemaVersion, setupId, createdAt, createdBy, seed,
  // playerCount, expansions, heroSelectionMode) are deliberately omitted —
  // their defaults live in `useLoadoutDraft.ts` constants and surfacing
  // them in the URL is a future-extension hook, not part of this packet.
  const params = new URLSearchParams();
  params.set("schemeId", composition.schemeId);
  params.set("mastermindId", composition.mastermindId);
  appendArrayParam(params, "villainGroupIds", composition.villainGroupIds);
  appendArrayParam(params, "henchmanGroupIds", composition.henchmanGroupIds);
  appendArrayParam(params, "heroDeckIds", composition.heroDeckIds);
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Appends an array field to the URLSearchParams as a comma-joined value when
 * the array is non-empty. Empty arrays are skipped to keep shareable URLs
 * compact; round-trip symmetry is preserved because the parser interprets
 * an absent key as "no entry for this field" (which `Partial` represents
 * the same way).
 */
function appendArrayParam(
  params: URLSearchParams,
  key: ArrayKey,
  values: string[],
): void {
  if (values.length === 0) {
    return;
  }
  params.set(key, values.join(","));
}

