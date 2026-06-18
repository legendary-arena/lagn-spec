/**
 * useLoadoutDraft.ts — Vue composable for the registry-viewer's Loadout tab
 * (WP-091).
 *
 * Maintains an in-memory MATCH-SETUP draft and exposes mutator methods,
 * a live validation error list, JSON export/import, and "Start from
 * theme" pre-fill. Never persists (no localStorage / sessionStorage /
 * IndexedDB / cookies); re-opening the tab starts a fresh draft. Never
 * contacts the game server; the browser's download/upload is the only
 * external surface.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
// why: Import from the narrow `./setupContract` subpath (not the
// `@legendary-arena/registry` root barrel) because the root re-exports a
// node-only local-file registry factory (`node:fs/promises`, `node:path`)
// that breaks Vite's browser build. Same mitigation pattern as
// themeClient.ts for `./schema` and `./theme.schema`.
import {
  validateMatchSetupDocument,
  type CardRegistryReader,
  type HeroSelectionMode,
  type MatchSetupDocument,
  type MatchSetupValidationError,
  type ValidateMatchSetupDocumentResult,
} from "@legendary-arena/registry/setupContract";

import type { ThemeDefinition } from "../lib/themeClient";
// why: D-24018 — surface ambiguous theme-slug substitutions (a deterministic
// pick among mechanically-different printings) so the guess is discoverable
// under `?debug` rather than fully silent. Gated, prod-stripped (EC-104).
import { devLog } from "../lib/devLog";

// why: Six DEFAULT_* constants exported additively per WP-114 PS-1
// (D-114XX). The URL-preview composable `useSetupFromUrl` (WP-114 §B)
// imports these so the synthesized `MatchSetupDocument` envelope uses
// byte-identical defaults to the editor draft — drift between editor and
// preview would break the round-trip between "Edit this loadout" and the
// shared URL. Exporting is strictly additive: no logic, signature, or
// existing-test invariant changes; the only effect is making the
// constants importable. Originally locked from EC-091 §Locked Values /
// §3.7.
export const DEFAULT_BYSTANDERS_COUNT = 30;
export const DEFAULT_WOUNDS_COUNT = 30;
export const DEFAULT_OFFICERS_COUNT = 30;
export const DEFAULT_SIDEKICKS_COUNT = 0;
export const DEFAULT_PLAYER_COUNT = 2;
export const DEFAULT_EXPANSIONS = ["base"] as const;

/**
 * Generates a fresh 16-hex-character opaque seed.
 *
 * // why: Web Crypto (not Math.random) so the seed remains
 * // determinism-compatible with engine `ctx.random.*` downstream. The
 * // engine consumes this string as an opaque anchor; WP-091 never
 * // parses, interprets, hashes, or validates it beyond length/format.
 */
function generateSeed(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * Resolves a bare theme slug to the set-qualified ext_id
 * ("{setAbbr}/{slug}") the engine's match-setup validator requires
 * (D-10014 / D-24018).
 *
 * Theme JSONs (content/themes/*.json, served from R2) store BARE entity
 * slugs with no set prefix (e.g. "magneto", "four-horsemen"). Copying them
 * verbatim into a loadout composition fails the qualified-form pattern and
 * makes Game.setup() throw an HTTP 500 at match creation. This function
 * bridges the two id spaces.
 *
 * Matching is on the slug portion of FlatCard.extId, NOT FlatCard.slug: for
 * heroes / masterminds / villains / henchmen the engine derives the ext_id
 * from the ENTITY slug (hero slug, group slug, mastermind slug), while
 * FlatCard.slug is the individual *card* slug — the two differ (hero
 * "wolverine" has extId "core/wolverine" but FlatCard.slug "keen-senses").
 * The entity slug is only recoverable from extId.
 *
 * The `cardType` filter is mandatory: the same bare slug can map to
 * different ext_ids per entity type — "magneto" is a hero in the Villains
 * set (extId "vill/magneto") AND a mastermind in core (extId "core/magneto").
 * Resolving a heroDeckId without the cardType guard could yield the
 * mastermind's ext_id, which the engine's per-field hero validator rejects.
 *
 * Returns the qualified ext_id, or null ONLY when the slug matches no card
 * of that type. A slug reprinted across multiple sets resolves
 * deterministically (the core printing preferred, else the
 * lexicographically-first ext_id): every "{set}/{slug}" printing of the
 * same entity is an ext_id the engine accepts for that field, so declining
 * would needlessly 500 the match over a card-art/printing difference that
 * does not affect match creation. Callers keep the original bare slug on
 * null so the live validation error list surfaces a genuine data gap (an
 * actionable red error beats a silent drop or an HTTP 500).
 *
 * @param bareSlug - The unqualified theme slug (e.g. "magneto").
 * @param cardType - The composition entity type to match within
 *                   ("scheme" | "mastermind" | "villain" | "henchman" | "hero").
 * @param cards - The registry's flat card list (extId + cardType per card).
 */
function resolveThemeSlugToExtId(
  bareSlug: string,
  cardType: string,
  cards: Array<{ extId: string; cardType: string }>,
): string | null {
  const trimmedSlug = bareSlug.trim();
  if (trimmedSlug === "") {
    return null;
  }
  // why: a slug that already contains "/" is treated as an already-qualified
  // ext_id and passed through untouched, so a future theme authored against
  // qualified ids is never double-resolved. Bare theme slugs are [a-z0-9-]
  // only, so a slash unambiguously means "already qualified".
  if (trimmedSlug.includes("/")) {
    return trimmedSlug;
  }
  const candidateExtIds: string[] = [];
  for (const card of cards) {
    if (card.cardType !== cardType) {
      continue;
    }
    const slashIndex = card.extId.indexOf("/");
    if (slashIndex < 0) {
      continue;
    }
    const entitySlug = card.extId.slice(slashIndex + 1);
    if (entitySlug !== trimmedSlug) {
      continue;
    }
    if (!candidateExtIds.includes(card.extId)) {
      candidateExtIds.push(card.extId);
    }
  }
  if (candidateExtIds.length === 0) {
    return null;
  }
  // why: prefer the core set's printing when the slug exists there — core is
  // the canonical home for shared entities and themes are core-oriented.
  const corePreferredExtId = `core/${trimmedSlug}`;
  if (candidateExtIds.includes(corePreferredExtId)) {
    return corePreferredExtId;
  }
  // why: the slug lives only in non-core set(s). Every printing is a valid
  // ext_id for this field, so resolve to a stable pick instead of declining;
  // declining would keep the bare slug and 500 the match. Sort first so a
  // given theme always yields the same ext_id regardless of registry
  // iteration order (a fresh prefill must be reproducible).
  const sortedCandidateExtIds = [...candidateExtIds].sort();
  const chosenExtId = sortedCandidateExtIds[0] ?? null;
  // why: D-24018 — when 2+ non-core printings exist the pick is genuinely
  // ambiguous AND (verified across all 16 such heroes) the printings are
  // MECHANICALLY DIFFERENT decks, not cosmetic reprints — e.g.
  // dstr/doctor-strange is a 4-card Artifact deck, msis/doctor-strange a
  // 6-card Phasing deck. We keep the theme playable by picking
  // deterministically, but the chosen deck may not be the author's intent, so
  // surface the substitution (not silent) for discoverability. The real fix is
  // qualifying the slug in the theme JSON at source. devLog is `?debug`-gated
  // and prod-stripped, and per EC-104 logs only counts + 3-sample ids.
  if (chosenExtId !== null && sortedCandidateExtIds.length > 1) {
    devLog(
      "theme",
      `Ambiguous ${cardType} slug "${trimmedSlug}" has no core printing; resolved to a deterministic pick. Qualify the slug in the theme JSON to choose a specific printing.`,
      {
        chosen: chosenExtId,
        alternatives: sortedCandidateExtIds.slice(1, 4).join(", "),
        candidateCount: sortedCandidateExtIds.length,
      },
    );
  }
  return chosenExtId;
}

/**
 * Resolves the villain group ext_ids a mastermind "Always Leads".
 *
 * A mastermind with an Always-Leads clause (e.g. Magneto Always Leads the
 * Brotherhood) makes that villain group mandatory in the match deck — the
 * printed rule is "you must include these villains." The mastermind card
 * carries the requirement as bare group slugs in `alwaysLeads` (e.g.
 * `["brotherhood"]`); this resolves each to the set-qualified villain group
 * ext_id the loadout composition stores (e.g. "core/brotherhood").
 *
 * Resolution prefers the mastermind's OWN set printing of the led group
 * (a `{mastermindSetAbbr}/{ledSlug}` villain that exists), so a non-core
 * mastermind leads its own set's group rather than a core reprint. When no
 * same-set printing exists it falls back to `resolveThemeSlugToExtId`'s
 * core-preferred-else-lexicographic pick — the same id-space bridge the theme
 * prefill uses (D-24018). An already-qualified slug (contains "/") passes
 * through untouched. A slug that resolves to no villain group is dropped (the
 * requirement is unenforceable without the group in the registry).
 *
 * @param mastermindExtId - The selected mastermind's set-qualified ext_id.
 * @param cards - The registry's flat card list (extId + cardType + alwaysLeads).
 */
function resolveAlwaysLeadsGroupIds(
  mastermindExtId: string,
  cards: Array<{ extId: string; cardType: string; alwaysLeads?: readonly string[] }>,
): string[] {
  const trimmedMastermindId = mastermindExtId.trim();
  if (trimmedMastermindId === "") {
    return [];
  }
  let leadSlugs: readonly string[] = [];
  for (const card of cards) {
    if (card.cardType === "mastermind" && card.extId === trimmedMastermindId) {
      leadSlugs = card.alwaysLeads ?? [];
      break;
    }
  }
  if (leadSlugs.length === 0) {
    return [];
  }
  const slashIndex = trimmedMastermindId.indexOf("/");
  const mastermindSetAbbr = slashIndex > 0 ? trimmedMastermindId.slice(0, slashIndex) : "";
  const resolvedGroupIds: string[] = [];
  for (const rawLeadSlug of leadSlugs) {
    const ledSlug = rawLeadSlug.trim();
    if (ledSlug === "") {
      continue;
    }
    // why: an already-qualified slug ("{set}/{slug}") is passed through, mirroring
    // resolveThemeSlugToExtId — future card data may qualify alwaysLeads at source.
    if (ledSlug.includes("/")) {
      if (!resolvedGroupIds.includes(ledSlug)) {
        resolvedGroupIds.push(ledSlug);
      }
      continue;
    }
    // why: prefer the mastermind's own set printing of the led group so a
    // non-core mastermind requires its own set's villains, not a core reprint.
    let chosenGroupId: string | null = null;
    if (mastermindSetAbbr !== "") {
      const sameSetGroupId = `${mastermindSetAbbr}/${ledSlug}`;
      for (const card of cards) {
        if (card.cardType === "villain" && card.extId === sameSetGroupId) {
          chosenGroupId = sameSetGroupId;
          break;
        }
      }
    }
    if (chosenGroupId === null) {
      chosenGroupId = resolveThemeSlugToExtId(ledSlug, "villain", cards);
    }
    if (chosenGroupId !== null && !resolvedGroupIds.includes(chosenGroupId)) {
      resolvedGroupIds.push(chosenGroupId);
    }
  }
  return resolvedGroupIds;
}

/**
 * Builds a fresh blank draft with all envelope defaults populated and
 * composition fields empty. Composition counts default per EC-091
 * §Locked Values; the user may override any field before export.
 */
function createBlankDraft(): MatchSetupDocument {
  const createdAt = new Date().toISOString();
  return {
    schemaVersion: "1.0",
    setupId: `setup-${createdAt.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`,
    createdAt,
    createdBy: "player",
    seed: generateSeed(),
    playerCount: DEFAULT_PLAYER_COUNT,
    expansions: [...DEFAULT_EXPANSIONS],
    // why: Downloaded JSON always emits heroSelectionMode explicitly
    // (L4 / WP-093 builder-emission policy). The backward-compat
    // absent-default is for accepting older uploaded JSON only — the
    // builder's authoring output is never implicit.
    heroSelectionMode: "GROUP_STANDARD",
    composition: {
      schemeId: "",
      mastermindId: "",
      villainGroupIds: [],
      henchmanGroupIds: [],
      heroDeckIds: [],
      bystandersCount: DEFAULT_BYSTANDERS_COUNT,
      woundsCount: DEFAULT_WOUNDS_COUNT,
      officersCount: DEFAULT_OFFICERS_COUNT,
      sidekicksCount: DEFAULT_SIDEKICKS_COUNT,
    },
  };
}

/** The public API returned by `useLoadoutDraft()`. */
export interface UseLoadoutDraftApi {
  draft: Ref<MatchSetupDocument>;
  errors: ComputedRef<MatchSetupValidationError[]>;
  isValid: ComputedRef<boolean>;
  /**
   * Villain group ext_ids the selected mastermind "Always Leads" — mandatory
   * villains the match deck must include (e.g. Magneto → "core/brotherhood").
   * Empty when no mastermind is selected or it has no Always-Leads clause.
   */
  requiredVillainGroupIds: ComputedRef<string[]>;
  /**
   * The subset of `requiredVillainGroupIds` not currently in the draft's
   * `villainGroupIds` — non-empty only when a required group was removed or an
   * imported loadout omits it. The builder warns and blocks export while this
   * is non-empty.
   */
  missingRequiredVillainGroupIds: ComputedRef<string[]>;
  setScheme: (schemeId: string) => void;
  setMastermind: (mastermindId: string) => void;
  addVillainGroup: (groupId: string) => void;
  removeVillainGroup: (groupId: string) => void;
  addHenchmanGroup: (groupId: string) => void;
  removeHenchmanGroup: (groupId: string) => void;
  addHeroGroup: (groupId: string) => void;
  removeHeroGroup: (groupId: string) => void;
  setCount: (
    field: "bystandersCount" | "woundsCount" | "officersCount" | "sidekicksCount",
    value: number,
  ) => void;
  setPlayerCount: (value: number) => void;
  setSeed: (seed: string) => void;
  reRollSeed: () => void;
  setThemeId: (themeId: string | undefined) => void;
  setHeroSelectionMode: (mode: HeroSelectionMode) => void;
  prefillFromTheme: (theme: ThemeDefinition) => void;
  loadFromJson: (
    jsonText: string,
  ) => { ok: true } | { ok: false; errors: MatchSetupValidationError[] };
  exportToJsonBlob: () => Blob;
  exportFilename: () => string;
  resetDraft: () => void;
}

/**
 * The composable's registry surface. Widens the validator's extId-only
 * CardRegistryReader with `cardType`, which `prefillFromTheme` needs to
 * resolve a bare theme slug within the correct composition entity type
 * (see resolveThemeSlugToExtId — the same bare slug can map to different
 * ext_ids per type). The real CardRegistry (FlatCard[]) supplies both
 * fields, so every existing call site (LoadoutBuilder, LoadoutPreview)
 * satisfies this without change and the call signature is preserved.
 */
interface LoadoutRegistryReader extends CardRegistryReader {
  listCards(): Array<{
    extId: string;
    cardType: string;
    // why: mastermind-only "Always Leads" villain group slugs — the builder
    // resolves these to villain group ext_ids to auto-include and require them.
    // Optional so non-mastermind cards and the lean test fixtures satisfy the
    // shape without change (the real FlatCard always carries it on masterminds).
    alwaysLeads?: readonly string[];
  }>;
}

/**
 * Builds a loadout-draft composable bound to the supplied card registry.
 * Each invocation returns an independent draft (no module-level state,
 * no singletons).
 *
 * @param registry - A LoadoutRegistryReader whose `listCards()` surface
 *                   supplies the ext_id + cardType universe for validation
 *                   and theme-slug resolution.
 */
export function useLoadoutDraft(registry: LoadoutRegistryReader): UseLoadoutDraftApi {
  const draft = ref<MatchSetupDocument>(createBlankDraft());

  const validationResult = computed<ValidateMatchSetupDocumentResult>(() => {
    return validateMatchSetupDocument(draft.value, registry);
  });

  const errors = computed<MatchSetupValidationError[]>(() => {
    const result = validationResult.value;
    if (result.ok) {
      return [];
    }
    return result.errors;
  });

  const isValid = computed<boolean>(() => validationResult.value.ok);

  const requiredVillainGroupIds = computed<string[]>(() =>
    resolveAlwaysLeadsGroupIds(draft.value.composition.mastermindId, registry.listCards()),
  );

  const missingRequiredVillainGroupIds = computed<string[]>(() => {
    const present = draft.value.composition.villainGroupIds;
    return requiredVillainGroupIds.value.filter((groupId) => !present.includes(groupId));
  });

  function setScheme(schemeId: string): void {
    draft.value.composition.schemeId = schemeId.trim();
  }

  function setMastermind(mastermindId: string): void {
    const trimmedMastermindId = mastermindId.trim();
    draft.value.composition.mastermindId = trimmedMastermindId;
    // why: "Always Leads" — a mastermind that always leads a villain group
    // (e.g. Magneto → Brotherhood) makes that group mandatory in the match
    // deck. Auto-include the led group(s) on selection so the loadout carries
    // the villains the printed rule requires instead of silently omitting them.
    // addUniqueId no-ops on a group already present, so this never duplicates a
    // chip the user (or a theme prefill) already added.
    const requiredGroupIds = resolveAlwaysLeadsGroupIds(
      trimmedMastermindId,
      registry.listCards(),
    );
    for (const requiredGroupId of requiredGroupIds) {
      addUniqueId(draft.value.composition.villainGroupIds, requiredGroupId);
    }
  }

  function addUniqueId(list: string[], groupId: string): void {
    const trimmed = groupId.trim();
    if (trimmed === "") {
      return;
    }
    if (list.includes(trimmed)) {
      return;
    }
    list.push(trimmed);
  }

  function removeId(list: string[], groupId: string): void {
    const index = list.indexOf(groupId);
    if (index >= 0) {
      list.splice(index, 1);
    }
  }

  function addVillainGroup(groupId: string): void {
    addUniqueId(draft.value.composition.villainGroupIds, groupId);
  }

  function removeVillainGroup(groupId: string): void {
    removeId(draft.value.composition.villainGroupIds, groupId);
  }

  function addHenchmanGroup(groupId: string): void {
    addUniqueId(draft.value.composition.henchmanGroupIds, groupId);
  }

  function removeHenchmanGroup(groupId: string): void {
    removeId(draft.value.composition.henchmanGroupIds, groupId);
  }

  function addHeroGroup(groupId: string): void {
    addUniqueId(draft.value.composition.heroDeckIds, groupId);
  }

  function removeHeroGroup(groupId: string): void {
    removeId(draft.value.composition.heroDeckIds, groupId);
  }

  function setCount(
    field: "bystandersCount" | "woundsCount" | "officersCount" | "sidekicksCount",
    value: number,
  ): void {
    const coerced = Number.isFinite(value) ? Math.trunc(value) : 0;
    const clamped = coerced < 0 ? 0 : coerced;
    draft.value.composition[field] = clamped;
  }

  function setPlayerCount(value: number): void {
    const coerced = Number.isFinite(value) ? Math.trunc(value) : DEFAULT_PLAYER_COUNT;
    draft.value.playerCount = coerced;
  }

  function setSeed(seed: string): void {
    draft.value.seed = seed.trim();
  }

  function reRollSeed(): void {
    draft.value.seed = generateSeed();
  }

  function setThemeId(themeId: string | undefined): void {
    if (themeId === undefined || themeId === "") {
      delete draft.value.themeId;
      return;
    }
    draft.value.themeId = themeId;
  }

  function setHeroSelectionMode(mode: HeroSelectionMode): void {
    draft.value.heroSelectionMode = mode;
  }

  function prefillFromTheme(theme: ThemeDefinition): void {
    // why: Theme setupIntent fields hold BARE entity slugs (e.g. "magneto",
    // "four-horsemen") with no set prefix, but the engine's match-setup
    // validator requires set-qualified ext_ids ("{setAbbr}/{slug}", D-10014)
    // and throws an HTTP 500 at match creation otherwise (D-24018). Resolve
    // each bare slug to its qualified ext_id via the registry before
    // assigning. An unresolvable slug is kept verbatim so the live `errors`
    // list flags it (see resolveThemeSlugToExtId).
    //
    // why: `.map(...)` returns fresh arrays, so the draft never aliases the
    // registry-loaded theme singleton — this preserves the L10 / A-091-04
    // anti-aliasing guarantee that the prior spread-copy provided. Scalar
    // fields (schemeId, mastermindId) are immutable strings.
    const cards = registry.listCards();
    const composition = draft.value.composition;
    composition.schemeId =
      resolveThemeSlugToExtId(theme.setupIntent.schemeId, "scheme", cards) ??
      theme.setupIntent.schemeId;
    composition.mastermindId =
      resolveThemeSlugToExtId(theme.setupIntent.mastermindId, "mastermind", cards) ??
      theme.setupIntent.mastermindId;
    composition.villainGroupIds = theme.setupIntent.villainGroupIds.map(
      (slug) => resolveThemeSlugToExtId(slug, "villain", cards) ?? slug,
    );
    composition.henchmanGroupIds = theme.setupIntent.henchmanGroupIds.map(
      (slug) => resolveThemeSlugToExtId(slug, "henchman", cards) ?? slug,
    );
    composition.heroDeckIds = theme.setupIntent.heroDeckIds.map(
      (slug) => resolveThemeSlugToExtId(slug, "hero", cards) ?? slug,
    );
    draft.value.themeId = theme.themeId;
  }

  function loadFromJson(
    jsonText: string,
  ): { ok: true } | { ok: false; errors: MatchSetupValidationError[] } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseFailure) {
      const message =
        parseFailure instanceof Error ? parseFailure.message : String(parseFailure);
      return {
        ok: false,
        errors: [
          {
            field: "root",
            code: "wrong_type",
            message: `The pasted text could not be parsed as JSON: ${message}`,
          },
        ],
      };
    }
    const result = validateMatchSetupDocument(parsed, registry);
    if (!result.ok) {
      return { ok: false, errors: result.errors };
    }
    draft.value = result.value;
    return { ok: true };
  }

  function buildSerializedDocument(): string {
    // why: Deterministic key ordering across two consecutive exports of
    // the same draft. JSON.stringify(value, replacer) with an array
    // replacer emits fields in the supplied order; fields in the array
    // but absent from the object are silently skipped. Envelope fields
    // come first (schema order), then composition last. This also keeps
    // downloaded JSON stable under `git diff` and easy for reviewers to
    // scan.
    const keyOrder: readonly string[] = [
      "schemaVersion",
      "setupId",
      "createdAt",
      "createdBy",
      "seed",
      "playerCount",
      "themeId",
      "expansions",
      "heroSelectionMode",
      "composition",
      "schemeId",
      "mastermindId",
      "villainGroupIds",
      "henchmanGroupIds",
      "heroDeckIds",
      "bystandersCount",
      "woundsCount",
      "officersCount",
      "sidekicksCount",
    ];
    return JSON.stringify(draft.value, keyOrder as string[], 2);
  }

  function exportToJsonBlob(): Blob {
    return new Blob([buildSerializedDocument()], { type: "application/json" });
  }

  function exportFilename(): string {
    const slug = draft.value.composition.schemeId.trim();
    if (slug !== "") {
      return `loadout-${slug}.json`;
    }
    const fallback = draft.value.createdAt.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    return `loadout-${fallback}.json`;
  }

  function resetDraft(): void {
    draft.value = createBlankDraft();
  }

  return {
    draft,
    errors,
    isValid,
    requiredVillainGroupIds,
    missingRequiredVillainGroupIds,
    setScheme,
    setMastermind,
    addVillainGroup,
    removeVillainGroup,
    addHenchmanGroup,
    removeHenchmanGroup,
    addHeroGroup,
    removeHeroGroup,
    setCount,
    setPlayerCount,
    setSeed,
    reRollSeed,
    setThemeId,
    setHeroSelectionMode,
    prefillFromTheme,
    loadFromJson,
    exportToJsonBlob,
    exportFilename,
    resetDraft,
  };
}
