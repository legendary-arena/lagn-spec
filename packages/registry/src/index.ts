/**
 * packages/registry/src/index.ts — public API surface
 */

// Types
export type {
  SetIndexEntry,
  SetData,
  Hero,
  HeroCard,
  HeroClass,
  Mastermind,
  MastermindCard,
  VillainGroup,
  VillainCard,
  Scheme,
  FlatCard,
  CardQuery,
  RegistryInfo,
  HealthReport,
  CardRegistry,
  HttpRegistryOptions,
  PhysicalCard,
} from "./types/index.js";

// Factories
export { createRegistryFromHttp        } from "./impl/httpRegistry.js";
export { createRegistryFromLocalFiles  } from "./impl/localRegistry.js";

// Schema (for external validation use)
export {
  SetDataSchema,
  SetIndexEntrySchema,
  HeroCardSchema,
  HeroClassSchema,
  CardQuerySchema,
  KeywordGlossaryEntrySchema,
  KeywordGlossarySchema,
  RuleGlossaryEntrySchema,
  RuleGlossarySchema,
  CardTypeEntrySchema,
  CardTypesIndexSchema,
  ViewerConfigSchema,
  ThemeIndexSchema,
} from "./schema.js";

export type {
  KeywordGlossaryEntry,
  RuleGlossaryEntry,
  CardTypeEntry,
  CardTypesIndex,
  CardType,
  ViewerConfig,
  ThemeIndex,
} from "./schema.js";

// Theme types
export type { ThemeDefinition } from "./theme.schema.js";

// Theme schemas
export {
  ThemeDefinitionSchema,
  ThemeSetupIntentSchema,
  ThemePlayerCountSchema,
  ThemePrimaryStoryReferenceSchema,
  ThemeMusicAssetsSchema,
} from "./theme.schema.js";

// Theme validators
export { validateTheme, validateThemeFile } from "./theme.validate.js";

// why: Browser-safe MATCH-SETUP document contract (WP-091). Consumed by
// apps/registry-viewer (loadout builder) and any future tooling that needs
// to validate a MATCH-SETUP envelope + composition without crossing the
// engine layer boundary. The engine-side validator at
// packages/game-engine/src/matchSetup.validate.ts remains authoritative
// at match creation time; these registry-side exports mirror its ext_id
// lookup algorithm byte-for-byte (D-1209, A-091-03) plus add strict zod
// structural validation of the envelope (WP-093 consumer).
export type {
  CardRegistryReader,
  SetupCompositionInput,
  SetupEnvelope,
  MatchSetupDocument,
  HeroSelectionMode,
  MatchSetupErrorCode,
  MatchSetupValidationError,
  ValidateMatchSetupDocumentResult,
} from "./setupContract/setupContract.types.js";

export {
  UNSUPPORTED_HERO_SELECTION_MODE_TEMPLATE,
  HERO_SELECTION_MODE_READONLY_LABEL,
  HERO_SELECTION_MODE_SHORT_LABEL,
  HERO_SELECTION_MODE_LONG_EXPLANATION,
  HERO_SELECTION_MODE_FUTURE_NOTICE,
} from "./setupContract/setupContract.types.js";

export { MatchSetupDocumentSchema } from "./setupContract/setupContract.schema.js";
export { validateMatchSetupDocument } from "./setupContract/setupContract.validate.js";
