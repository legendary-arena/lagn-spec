import { z } from 'zod'

// ============================================================================
// LAGN v1.0 Zod Schema — Single Source of Truth
// ============================================================================

// Enums
const ActionTypeEnum = z.enum([
  'villain_reveal',
  'villain_attack',
  'villain_escape',
  'hero_recruit',
  'hero_play',
  'hero_discard',
  'mastermind_twist',
  'mastermind_attack',
  'bystander_capture',
  'bystander_release',
  'wound_dealt',
  'shield_deploy'
])

const VillainPhaseEventEnum = z.enum([
  'ambush',
  'patrol',
  'guard',
  'escape_attempted'
])

const OutcomeEnum = z.enum(['victory', 'defeat'])

const LossConditionEnum = z.enum([
  'mastermind_defeated',
  'city_overrun',
  'deck_exhausted'
])

const RarityCodeEnum = z.enum(['c1', 'c2', 'c3', 'uc', 'uc2', 'uc3', 'ra'])

const HeroClassEnum = z.enum([
  'strength',
  'instinct',
  'covert',
  'tech',
  'ranged'
])

const CardTypeEnum = z.enum([
  'mastermind',
  'scheme',
  'villain_group',
  'henchmen_group',
  'hero',
  'shield_officer',
  'sidekick',
  'wound',
  'bystander'
])

// ============================================================================
// TIER 1: Game Setup (Required)
// ============================================================================

const GameSetupSchema = z.object({
  mastermind: z.object({
    id: z.string(),
    name: z.string()
  }),
  scheme: z.object({
    id: z.string(),
    name: z.string()
  }),
  villain_groups: z.array(
    z.object({
      id: z.string(),
      name: z.string()
    })
  ).min(1),
  henchmen_groups: z.array(
    z.object({
      id: z.string(),
      name: z.string()
    })
  ).min(1),
  heroes: z.array(
    z.object({
      id: z.string(),
      name: z.string()
    })
  ).min(1),
  bystanders_count: z.number().int().min(0),
  wounds_count: z.number().int().min(0),
  shield_officers_count: z.number().int().min(0),
  sidekicks_count: z.number().int().min(0)
})

// ============================================================================
// TIER 2: Full Card Catalog (Optional)
// ============================================================================

const CardSchema = z.discriminatedUnion('card_type', [
  z.object({
    card_type: z.literal('mastermind'),
    ext_id: z.string(),
    name: z.string(),
    image_url: z.string().url().optional(),
    image_thumb_url: z.string().url().optional()
  }),
  z.object({
    card_type: z.literal('scheme'),
    ext_id: z.string(),
    name: z.string(),
    image_url: z.string().url().optional(),
    image_thumb_url: z.string().url().optional()
  }),
  z.object({
    card_type: z.literal('villain_group'),
    ext_id: z.string(),
    name: z.string(),
    image_url: z.string().url().optional(),
    image_thumb_url: z.string().url().optional()
  }),
  z.object({
    card_type: z.literal('henchmen_group'),
    ext_id: z.string(),
    name: z.string(),
    rarity_code: RarityCodeEnum,
    image_url: z.string().url().optional(),
    image_thumb_url: z.string().url().optional()
  }),
  z.object({
    card_type: z.literal('hero'),
    ext_id: z.string(),
    name: z.string(),
    hero_class: HeroClassEnum.array().min(1),
    rarity_code: RarityCodeEnum,
    image_url: z.string().url().optional(),
    image_thumb_url: z.string().url().optional()
  }),
  z.object({
    card_type: z.literal('shield_officer'),
    ext_id: z.string(),
    name: z.string(),
    image_url: z.string().url().optional(),
    image_thumb_url: z.string().url().optional()
  }),
  z.object({
    card_type: z.literal('sidekick'),
    ext_id: z.string(),
    name: z.string(),
    image_url: z.string().url().optional(),
    image_thumb_url: z.string().url().optional()
  }),
  z.object({
    card_type: z.literal('wound'),
    ext_id: z.string(),
    name: z.string(),
    image_url: z.string().url().optional(),
    image_thumb_url: z.string().url().optional()
  }),
  z.object({
    card_type: z.literal('bystander'),
    ext_id: z.string(),
    name: z.string(),
    image_url: z.string().url().optional(),
    image_thumb_url: z.string().url().optional()
  })
])

const CardCatalogSchema = z.object({
  cards: z.array(CardSchema).min(1)
})

// ============================================================================
// TIER 3: Turn-by-Turn Replay Log (Optional)
// ============================================================================

const ActionSchema = z.object({
  seq: z.number().int().min(0),
  action_type: ActionTypeEnum,
  actor_player_id: z.string().optional(),
  target_card_ext_id: z.string().optional(),
  details: z.record(z.unknown()).optional()
})

const VillainEventSchema = z.object({
  phase: VillainPhaseEventEnum,
  card_ext_id: z.string()
})

const TurnSchema = z.object({
  turn_number: z.number().int().min(1),
  active_player_id: z.string(),
  villain_events: z.array(VillainEventSchema).optional(),
  player_actions: z.array(ActionSchema).optional(),
  stage_transitions: z.array(
    z.object({
      from: z.enum(['start', 'main', 'cleanup']),
      to: z.enum(['start', 'main', 'cleanup'])
    })
  ).optional()
})

const ReplaySchema = z.object({
  turns: z.array(TurnSchema).optional()
})

// Validate seq constraint: strictly increasing by 1, no gaps, no duplicates
// The seq values must appear in order: [0,1,2...] or [1,2,3...] etc.
const validateSeqConstraint = (actions: Array<{ seq: number }>): boolean => {
  if (actions.length === 0) return true
  const seqs = actions.map(a => a.seq)

  // Get the starting seq value
  const firstSeq = seqs[0]

  // Check that each seq is exactly firstSeq + index
  for (let i = 0; i < seqs.length; i++) {
    if (seqs[i] !== firstSeq + i) return false
  }

  return true
}

// ============================================================================
// Root LAGN Schema
// ============================================================================

export const lagnSchema = z.object({
  lagn_version: z.literal('1.0.0'),
  $schema: z.string().url().optional(),
  game_id: z.string(),
  variant: z.enum(['solo', 'cooperative', 'competitive']),
  player_count: z.number().int().min(1).max(5),
  setup: GameSetupSchema,
  card_catalog: CardCatalogSchema.optional(),
  replay: ReplaySchema.optional(),
  result: z.object({
    outcome: OutcomeEnum,
    loss_condition: LossConditionEnum.optional(),
    victory_points: z.number().int().optional(),
    timestamp: z.string().datetime().optional()
  }).optional()
}).refine(
  (data) => {
    if (data.replay?.turns) {
      for (const turn of data.replay.turns) {
        if (turn.player_actions && turn.player_actions.length > 0) {
          if (!validateSeqConstraint(turn.player_actions)) {
            return false
          }
        }
      }
    }
    return true
  },
  {
    message: 'Replay action seq must be strictly increasing with no gaps or duplicates',
    path: ['replay', 'seq']
  }
)

export type LAGN = z.infer<typeof lagnSchema>

// ============================================================================
// Validator Functions
// ============================================================================

export interface ValidationResult {
  valid: boolean
  errors?: string[]
}

export function validate(json: unknown): ValidationResult {
  const result = lagnSchema.safeParse(json)
  if (result.success) {
    return { valid: true }
  }
  const errors = result.error.errors.map((err) => {
    const path = err.path.length > 0 ? err.path.join('.') : 'root'
    return `${path}: ${err.message}`
  })
  return { valid: false, errors }
}

export interface SummarizeResult {
  valid: boolean
  game_id: string | null
  variant: string | null
  player_count: number | null
  result: string | null
}

export function summarize(json: unknown): SummarizeResult {
  const validation = validate(json)
  if (!validation.valid) {
    return {
      valid: false,
      game_id: null,
      variant: null,
      player_count: null,
      result: null
    }
  }

  const data = json as Record<string, any>
  const outcome = data.result?.outcome ?? 'unknown'
  const result = `${outcome}${
    data.result?.loss_condition ? ` (${data.result.loss_condition})` : ''
  }`

  return {
    valid: true,
    game_id: String(data.game_id ?? null),
    variant: String(data.variant ?? null),
    player_count: typeof data.player_count === 'number' ? data.player_count : null,
    result
  }
}

// ============================================================================
// JSON Schema Generation
// ============================================================================

export function generateSchema(): Record<string, any> {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'LAGN v1.0 — Legendary Arena Game Notation',
    description: 'Three-tier JSON format for Legendary Arena game records: Tier 1 (setup), Tier 2 (card catalog), Tier 3 (replay log)',
    type: 'object',
    properties: {
      lagn_version: {
        type: 'string',
        const: '1.0.0'
      },
      $schema: {
        type: 'string',
        format: 'uri',
        default: 'https://legendary-arena.com/schemas/lagn/v1/lagn-v1.json'
      },
      game_id: {
        type: 'string',
        description: 'Unique game identifier'
      },
      variant: {
        type: 'string',
        enum: ['solo', 'cooperative', 'competitive']
      },
      player_count: {
        type: 'integer',
        minimum: 1,
        maximum: 5
      },
      setup: {
        type: 'object',
        required: [
          'mastermind',
          'scheme',
          'villain_groups',
          'henchmen_groups',
          'heroes',
          'bystanders_count',
          'wounds_count',
          'shield_officers_count',
          'sidekicks_count'
        ],
        properties: {
          mastermind: {
            type: 'object',
            required: ['id', 'name'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' }
            }
          },
          scheme: {
            type: 'object',
            required: ['id', 'name'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' }
            }
          },
          villain_groups: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['id', 'name'],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' }
              }
            }
          },
          henchmen_groups: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['id', 'name'],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' }
              }
            }
          },
          heroes: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['id', 'name'],
              properties: {
                id: { type: 'string' },
                name: { type: 'string' }
              }
            }
          },
          bystanders_count: { type: 'integer', minimum: 0 },
          wounds_count: { type: 'integer', minimum: 0 },
          shield_officers_count: { type: 'integer', minimum: 0 },
          sidekicks_count: { type: 'integer', minimum: 0 }
        }
      },
      card_catalog: {
        type: 'object',
        properties: {
          cards: {
            type: 'array',
            minItems: 1,
            items: { type: 'object' }
          }
        }
      },
      replay: {
        type: 'object',
        properties: {
          turns: {
            type: 'array',
            items: { type: 'object' }
          }
        }
      },
      result: {
        type: 'object',
        properties: {
          outcome: { type: 'string', enum: ['victory', 'defeat'] },
          loss_condition: {
            type: 'string',
            enum: [
              'mastermind_defeated',
              'city_overrun',
              'deck_exhausted'
            ]
          },
          victory_points: { type: 'integer' },
          timestamp: { type: 'string', format: 'date-time' }
        }
      }
    },
    required: ['lagn_version', 'game_id', 'variant', 'player_count', 'setup']
  }
}

