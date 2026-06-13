export { validate, summarize, generateSchema, lagnSchema } from './validator.js'
export type {
  LAGN,
  GameSetup,
  CardCatalog,
  Replay,
  Card,
  Action,
  VillainEvent,
  Turn,
  GameResult,
  ActionType,
  VillainPhaseEvent,
  Outcome,
  LossCondition,
  RarityCode,
  HeroClass,
  CardType,
  Variant
} from './types.js'

// Re-export LAGN_SCHEMA as a constant for programmatic use
import { generateSchema } from './validator.js'

export const LAGN_SCHEMA = generateSchema()
