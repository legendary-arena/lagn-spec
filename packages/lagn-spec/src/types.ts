import { z } from 'zod'
import { lagnSchema } from './validator.js'

export type LAGN = z.infer<typeof lagnSchema>

export type GameSetup = z.infer<typeof lagnSchema>['setup']
export type CardCatalog = z.infer<typeof lagnSchema>['card_catalog']
export type Replay = z.infer<typeof lagnSchema>['replay']

export type Card = z.infer<typeof lagnSchema>['card_catalog'] extends {
  cards: (infer C)[]
}
  ? C
  : never

export type Action = z.infer<typeof lagnSchema>['replay'] extends {
  turns: Array<{ player_actions: (infer A)[] }>
}
  ? A
  : never

export type VillainEvent = z.infer<typeof lagnSchema>['replay'] extends {
  turns: Array<{ villain_events: (infer V)[] }>
}
  ? V
  : never

export type Turn = z.infer<typeof lagnSchema>['replay'] extends {
  turns: (infer T)[]
}
  ? T
  : never

export type GameResult = z.infer<typeof lagnSchema>['result']

export type ActionType =
  | 'villain_reveal'
  | 'villain_attack'
  | 'villain_escape'
  | 'hero_recruit'
  | 'hero_play'
  | 'hero_discard'
  | 'mastermind_twist'
  | 'mastermind_attack'
  | 'bystander_capture'
  | 'bystander_release'
  | 'wound_dealt'
  | 'shield_deploy'

export type VillainPhaseEvent =
  | 'ambush'
  | 'patrol'
  | 'guard'
  | 'escape_attempted'

export type Outcome = 'victory' | 'defeat'

export type LossCondition =
  | 'mastermind_defeated'
  | 'city_overrun'
  | 'deck_exhausted'

export type RarityCode = 'c1' | 'c2' | 'c3' | 'uc' | 'uc2' | 'uc3' | 'ra'

export type HeroClass = 'strength' | 'instinct' | 'covert' | 'tech' | 'ranged'

export type CardType =
  | 'mastermind'
  | 'scheme'
  | 'villain_group'
  | 'henchmen_group'
  | 'hero'
  | 'shield_officer'
  | 'sidekick'
  | 'wound'
  | 'bystander'

export type Variant = 'solo' | 'cooperative' | 'competitive'

// Compile-time type check: verify types derive from schema
type TypeCheck = LAGN extends z.infer<typeof lagnSchema> ? true : false
