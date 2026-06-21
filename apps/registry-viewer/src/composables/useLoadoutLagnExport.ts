/**
 * useLoadoutLagnExport.ts — LAGN Tier 1 export composable for Registry Viewer Loadout tab (WP-245).
 *
 * Converts a MATCH-SETUP draft into LAGN Tier 1 JSON format, generates a UUID v4 game_id,
 * and validates the result via @legendary-arena/lagn. Supports user-selected variant/outcome
 * and exposes a download-ready Blob.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import { validate, type LAGN } from "@legendary-arena/lagn";
import type { MatchSetupDocument } from "@legendary-arena/registry/setupContract";

/**
 * Mid-execution amendments (spec vs actual LAGN v1.0 validator):
 *
 * 1. Variant enum (EC-276 §Locked Values):
 *    EC specifies "classic" | "custom", validator expects "solo" | "cooperative" | "competitive"
 *    Mapping: "classic" → "solo", "custom" → "cooperative"
 *
 * 2. Outcome enum (validator source of truth):
 *    EC specifies "victory" | "loss", validator expects "victory" | "defeat" ✓ (compatible)
 *
 * 3. Loss condition enum (EC-276 vs validator):
 *    EC specifies "unavailable", validator expects "mastermind_defeated" | "city_overrun" | "deck_exhausted"
 *    Mapping: "loss" → "defeat" with loss_condition="deck_exhausted" (safest for setup-only exports)
 */

export interface UseLoadoutLagnExportApi {
  variant: Ref<"classic" | "custom">;
  outcome: Ref<"victory" | "loss">;
  lossReason: ComputedRef<"unavailable">;
  gameId: Ref<string>;
  buildLagnFile: () => { file: string; gameId: string } | null;
  exportToJsonBlob: () => Blob;
  exportFilename: () => string;
  validationErrors: ComputedRef<string[]>;
  isValid: ComputedRef<boolean>;
  regenerateGameId: () => void;
}

/**
 * Generate a fresh UUID v4 using Web Crypto API.
 */
function generateGameId(): string {
  return crypto.randomUUID();
}

/**
 * Map the EC-276 user-facing variant to the LAGN validator enum.
 */
function mapVariantToLagn(userVariant: "classic" | "custom"): "solo" | "cooperative" | "competitive" {
  return userVariant === "classic" ? "solo" : "cooperative";
}

/**
 * Map the EC-276 user-facing outcome to the LAGN validator enum.
 */
function mapOutcomeToLagn(userOutcome: "victory" | "loss"): "victory" | "defeat" {
  return userOutcome === "victory" ? "victory" : "defeat";
}

/**
 * Convert a MATCH-SETUP composition to LAGN GameSetup format.
 * All 9 composition fields are mapped per EC-276 locked values.
 */
function compositionToLagnSetup(composition: MatchSetupDocument["composition"]): LAGN["setup"] {
  return {
    mastermind: {
      id: composition.mastermindId,
      name: "", // LAGN requires name field; registry viewer only stores ID. Validator handles optional resolution.
    },
    scheme: {
      id: composition.schemeId,
      name: "",
    },
    villain_groups: composition.villainGroupIds.map((id) => ({ id, name: "" })),
    henchmen_groups: composition.henchmanGroupIds.map((id) => ({ id, name: "" })),
    heroes: composition.heroDeckIds.map((id) => ({ id, name: "" })),
    bystanders_count: composition.bystandersCount,
    wounds_count: composition.woundsCount,
    shield_officers_count: composition.officersCount,
    sidekicks_count: composition.sidekicksCount,
  };
}

/**
 * Build a LAGN object from draft state and user-selected variant/outcome.
 * Returns null if composition is missing required fields.
 */
function buildLagnObject(
  draft: MatchSetupDocument,
  gameId: string,
  variant: "classic" | "custom",
  outcome: "victory" | "loss",
): LAGN | null {
  const composition = draft.composition;

  // Validate that all required composition fields are present.
  if (!composition.mastermindId || !composition.schemeId) {
    return null;
  }
  if (composition.villainGroupIds.length === 0 || composition.henchmanGroupIds.length === 0) {
    return null;
  }
  if (composition.heroDeckIds.length === 0) {
    return null;
  }

  const setup = compositionToLagnSetup(composition);
  const lagnVariant = mapVariantToLagn(variant);
  const lagnOutcome = mapOutcomeToLagn(outcome);

  return {
    lagn_version: "1.0.0",
    $schema: "https://legendary-arena.com/schemas/lagn/v1/lagn-v1.json",
    game_id: gameId,
    variant: lagnVariant,
    player_count: draft.playerCount,
    setup,
    result: {
      outcome: lagnOutcome,
      loss_condition: lagnOutcome === "defeat" ? "deck_exhausted" : undefined,
    },
  };
}

/**
 * Checks that a LAGN file's variant and player_count agree, returning a
 * full-sentence error per violation (empty array when they are consistent).
 *
 * Why this guard exists: the @legendary-arena/lagn schema validates variant
 * and player_count independently — it accepts "solo" with player_count 2, or
 * "cooperative" with player_count 1, because neither is structurally illegal.
 * But a solo loadout with two seats can never start a solo match on the play
 * surface: the engine holds the match in its lobby phase until every required
 * seat readies (packages/game-engine/src/lobby/lobby.validate.ts
 * validateCanStartMatch), so the lone player waits forever for a second who
 * never joins. The Registry Viewer's default player count is 2 while the LAGN
 * variant dropdown defaults to Classic (→ "solo"), so an unedited export is
 * this exact contradiction. This export guard blocks it at authoring time
 * rather than letting an unstartable file ship. It lives in the export layer,
 * not the published spec validator, so the LAGN contract itself is unchanged.
 */
function checkVariantPlayerCountConsistency(lagn: LAGN): string[] {
  if (lagn.variant === "solo" && lagn.player_count !== 1) {
    return [
      `This loadout's variant is "solo", which requires exactly 1 player, but the player count is ${lagn.player_count}. Set the "Player count (1–5)" field to 1 to export a solo loadout, or change the LAGN Variant to a multiplayer mode.`,
    ];
  }
  if (lagn.variant !== "solo" && lagn.player_count < 2) {
    return [
      `This loadout's variant is "${lagn.variant}", which requires at least 2 players, but the player count is ${lagn.player_count}. Set the "Player count (1–5)" field to 2 or more to export a ${lagn.variant} loadout, or change the LAGN Variant to Classic (solo).`,
    ];
  }
  return [];
}

/**
 * Builds a loadout-LAGN-export composable for a given draft.
 * Each invocation returns an independent composable (no module-level state).
 */
export function useLoadoutLagnExport(draft: Ref<MatchSetupDocument>): UseLoadoutLagnExportApi {
  const variant = ref<"classic" | "custom">("classic");
  const outcome = ref<"victory" | "loss">("victory");
  const gameId = ref<string>(generateGameId());

  const lossReason = computed<"unavailable">(() => "unavailable");

  const lagnObject = computed<LAGN | null>(() => {
    return buildLagnObject(draft.value, gameId.value, variant.value, outcome.value);
  });

  const validationErrors = computed<string[]>(() => {
    if (!lagnObject.value) {
      return ["Draft composition is incomplete (missing mastermind, scheme, villain group, henchman group, or hero group)."];
    }
    const result = validate(lagnObject.value);
    const schemaErrors = result.valid ? [] : result.errors || [];
    // why: the LAGN schema validates variant and player_count independently,
    // so a "solo" export with 2 seats passes it but cannot start a solo match
    // (see checkVariantPlayerCountConsistency). Append the cross-field guard
    // so isValid drops and the Download LAGN button disables.
    const consistencyErrors = checkVariantPlayerCountConsistency(lagnObject.value);
    return [...schemaErrors, ...consistencyErrors];
  });

  const isValid = computed<boolean>(() => validationErrors.value.length === 0);

  function buildLagnFile(): { file: string; gameId: string } | null {
    if (!isValid.value || !lagnObject.value) {
      return null;
    }
    // Custom replacer to maintain field order while preserving nested objects.
    // JSON.stringify's array replacer only works on top-level keys, so we use
    // a function replacer that orders keys but includes all nested properties.
    const keyOrder = [
      "lagn_version",
      "$schema",
      "game_id",
      "variant",
      "player_count",
      "setup",
      "result",
      "mastermind",
      "scheme",
      "villain_groups",
      "henchmen_groups",
      "heroes",
      "bystanders_count",
      "wounds_count",
      "shield_officers_count",
      "sidekicks_count",
      "outcome",
      "loss_condition",
      "id",
      "name",
    ];

    function replacer(key: string, value: unknown): unknown {
      if (typeof value !== "object" || value === null) {
        return value;
      }
      // Preserve arrays as arrays
      if (Array.isArray(value)) {
        return value;
      }
      const obj = value as Record<string, unknown>;
      const ordered: Record<string, unknown> = {};
      for (const k of keyOrder) {
        if (k in obj) {
          ordered[k] = obj[k];
        }
      }
      // Include any remaining keys not in keyOrder
      for (const k of Object.keys(obj)) {
        if (!(k in ordered)) {
          ordered[k] = obj[k];
        }
      }
      return ordered;
    }

    const file = JSON.stringify(lagnObject.value, replacer, 2);
    return { file, gameId: gameId.value };
  }

  function exportToJsonBlob(): Blob {
    const built = buildLagnFile();
    if (!built) {
      return new Blob([], { type: "application/json" });
    }
    return new Blob([built.file], { type: "application/json" });
  }

  function exportFilename(): string {
    return `game-${gameId.value}.lagn.json`;
  }

  function regenerateGameId(): void {
    gameId.value = generateGameId();
  }

  return {
    variant,
    outcome,
    lossReason,
    gameId,
    buildLagnFile,
    exportToJsonBlob,
    exportFilename,
    validationErrors,
    isValid,
    regenerateGameId,
  };
}
