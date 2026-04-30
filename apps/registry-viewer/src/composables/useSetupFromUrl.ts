/**
 * useSetupFromUrl.ts — Vue composable wiring URL query parameters into a
 * read-only setup-preview document (WP-114).
 *
 * Read-only: no persistence (no localStorage / sessionStorage / IndexedDB /
 * cookies), no engine handoff, no server contact. URL parameters are
 * declarative shareable input, not draft state. The user-initiated
 * "Edit this loadout" button on `<LoadoutPreview>` is the only path that
 * promotes a preview into the editor draft.
 *
 * Reads `window.location.search` once at composable instantiation. The five
 * URL-bound composition fields come from `parseSetupUrl()`; the four count
 * fields and all envelope fields fall back to the constants exported by
 * `useLoadoutDraft.ts` so editor and preview defaults can never drift
 * (drift test in `useSetupFromUrl.test.ts` enforces).
 *
 * Authority: WP-114 §Scope (B); EC-116 §Files to Produce; D-114XX
 * (envelope-not-URL-bound; PS-1 export of DEFAULT_* constants).
 */

import { computed, ref, type ComputedRef } from "vue";

import {
  validateMatchSetupDocument,
  type CardRegistryReader,
  type MatchSetupDocument,
  type MatchSetupValidationError,
  type SetupCompositionInput,
} from "@legendary-arena/registry/setupContract";

import {
  DEFAULT_BYSTANDERS_COUNT,
  DEFAULT_WOUNDS_COUNT,
  DEFAULT_OFFICERS_COUNT,
  DEFAULT_SIDEKICKS_COUNT,
  DEFAULT_PLAYER_COUNT,
  DEFAULT_EXPANSIONS,
} from "./useLoadoutDraft.js";

import { parseSetupUrl } from "../lib/setupUrlParams.js";

/** Per-field matched-count breakdown surfaced for the preview header. */
export interface SetupMatchedCount {
  schemes: number;
  masterminds: number;
  villainGroups: number;
  henchmanGroups: number;
  heroDecks: number;
}

/** The public API returned by `useSetupFromUrl()`. */
export interface UseSetupFromUrlApi {
  parsedParams: ComputedRef<Partial<SetupCompositionInput>>;
  hasUrlParams: ComputedRef<boolean>;
  previewDocument: ComputedRef<MatchSetupDocument | null>;
  validationErrors: ComputedRef<MatchSetupValidationError[]>;
  matchedCount: ComputedRef<SetupMatchedCount>;
}

/**
 * Builds a URL-driven setup-preview composable bound to the supplied card
 * registry. Each invocation returns an independent set of refs (no
 * module-level state, no singletons). `App.vue` calls this exactly once per
 * page per the EC-116 §Locked Values "Composable ownership" rule.
 *
 * @param registry - A CardRegistryReader whose `listCards()` surface
 *                   supplies the ext_id universe for validation.
 */
export function useSetupFromUrl(registry: CardRegistryReader): UseSetupFromUrlApi {
  const parsedParamsRef = ref<Partial<SetupCompositionInput>>(
    parseSetupUrl(window.location.search),
  );

  const parsedParams = computed<Partial<SetupCompositionInput>>(
    () => parsedParamsRef.value,
  );

  const hasUrlParams = computed<boolean>(
    () => Object.keys(parsedParamsRef.value).length > 0,
  );

  const previewDocument = computed<MatchSetupDocument | null>(() => {
    if (!hasUrlParams.value) {
      return null;
    }
    const params = parsedParamsRef.value;
    const composition: SetupCompositionInput = {
      schemeId: params.schemeId ?? "",
      mastermindId: params.mastermindId ?? "",
      villainGroupIds: params.villainGroupIds ?? [],
      henchmanGroupIds: params.henchmanGroupIds ?? [],
      heroDeckIds: params.heroDeckIds ?? [],
      bystandersCount: DEFAULT_BYSTANDERS_COUNT,
      woundsCount: DEFAULT_WOUNDS_COUNT,
      officersCount: DEFAULT_OFFICERS_COUNT,
      sidekicksCount: DEFAULT_SIDEKICKS_COUNT,
    };
    return {
      schemaVersion: "1.0",
      // why: Preview docs are not real loadouts. The synthetic id avoids
      // generating a fresh id per render (which would defeat the
      // determinism contract — identical URLs must yield byte-identical
      // synthetic JSON) and stabilizes test fixtures.
      setupId: "url-preview",
      // why: SetupEnvelope requires `createdAt`; using `new Date().toISOString()`
      // here would break the §Goal determinism contract because two
      // consecutive preview renders of the same URL would produce
      // different timestamps. The Unix-epoch literal signals "synthetic
      // preview document" to any reader.
      createdAt: "1970-01-01T00:00:00.000Z",
      createdBy: "system",
      seed: "0000000000000000",
      playerCount: DEFAULT_PLAYER_COUNT,
      expansions: [...DEFAULT_EXPANSIONS],
      heroSelectionMode: "GROUP_STANDARD",
      composition,
    };
  });

  const validationErrors = computed<MatchSetupValidationError[]>(() => {
    const document = previewDocument.value;
    if (document === null) {
      return [];
    }
    const result = validateMatchSetupDocument(document, registry);
    if (result.ok) {
      return [];
    }
    return result.errors;
  });

  const matchedCount = computed<SetupMatchedCount>(() => {
    const params = parsedParamsRef.value;
    const schemeProvided = "schemeId" in params ? 1 : 0;
    const mastermindProvided = "mastermindId" in params ? 1 : 0;
    const villainProvided = params.villainGroupIds?.length ?? 0;
    const henchmanProvided = params.henchmanGroupIds?.length ?? 0;
    const heroProvided = params.heroDeckIds?.length ?? 0;

    let schemeUnknown = 0;
    let mastermindUnknown = 0;
    let villainUnknown = 0;
    let henchmanUnknown = 0;
    let heroUnknown = 0;

    for (const error of validationErrors.value) {
      if (error.code !== "unknown_extid") {
        continue;
      }
      if (error.field === "composition.schemeId") {
        schemeUnknown += 1;
      } else if (error.field === "composition.mastermindId") {
        mastermindUnknown += 1;
      } else if (error.field.startsWith("composition.villainGroupIds[")) {
        villainUnknown += 1;
      } else if (error.field.startsWith("composition.henchmanGroupIds[")) {
        henchmanUnknown += 1;
      } else if (error.field.startsWith("composition.heroDeckIds[")) {
        heroUnknown += 1;
      }
    }

    return {
      schemes: Math.max(0, schemeProvided - schemeUnknown),
      masterminds: Math.max(0, mastermindProvided - mastermindUnknown),
      villainGroups: Math.max(0, villainProvided - villainUnknown),
      henchmanGroups: Math.max(0, henchmanProvided - henchmanUnknown),
      heroDecks: Math.max(0, heroProvided - heroUnknown),
    };
  });

  return {
    parsedParams,
    hasUrlParams,
    previewDocument,
    validationErrors,
    matchedCount,
  };
}
