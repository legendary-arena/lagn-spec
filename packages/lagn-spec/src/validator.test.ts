import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import { validate, summarize } from './validator'

describe('LAGN v1.0 Validator', () => {
  // ============================================================================
  // Tier 1: Game Setup Validation
  // ============================================================================

  describe('Tier 1 (Setup) — Valid Cases', () => {
    test('minimal valid setup (Tier 1 only)', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-001',
        variant: 'solo',
        player_count: 1,
        setup: {
          mastermind: { id: 'mm-001', name: 'Thanos' },
          scheme: { id: 'sch-001', name: 'Scheme A' },
          villain_groups: [{ id: 'vg-001', name: 'Villain Group 1' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen 1' }],
          heroes: [{ id: 'h-001', name: 'Hero 1' }],
          bystanders_count: 5,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, true)
      assert.strictEqual(result.errors, undefined)
    })

    test('full setup with all required fields', () => {
      const lagn = {
        lagn_version: '1.0.0',
        $schema: 'https://legendary-arena.com/schemas/lagn/v1/lagn-v1.json',
        game_id: 'game-full-001',
        variant: 'cooperative',
        player_count: 3,
        setup: {
          mastermind: { id: 'mm-loki', name: 'Loki' },
          scheme: { id: 'sch-avengers', name: 'The Avengers Scheme' },
          villain_groups: [
            { id: 'vg-chitauri', name: 'Chitauri' },
            { id: 'vg-infiltrators', name: 'Infiltrators' }
          ],
          henchmen_groups: [
            { id: 'hm-aliens', name: 'Alien Drones' },
            { id: 'hm-assassins', name: 'Assassins' }
          ],
          heroes: [
            { id: 'h-ironman', name: 'Iron Man' },
            { id: 'h-captain', name: 'Captain America' },
            { id: 'h-hulk', name: 'Hulk' }
          ],
          bystanders_count: 10,
          wounds_count: 5,
          shield_officers_count: 2,
          sidekicks_count: 3
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, true)
    })

    test('setup with different variant (competitive)', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-pvp-001',
        variant: 'competitive',
        player_count: 2,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 3,
          wounds_count: 1,
          shield_officers_count: 0,
          sidekicks_count: 1
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, true)
    })
  })

  describe('Tier 1 (Setup) — Invalid Cases', () => {
    test('missing game_id', () => {
      const lagn = {
        lagn_version: '1.0.0',
        variant: 'solo',
        player_count: 1,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, false)
      assert(result.errors && result.errors.length > 0)
    })

    test('invalid variant enum', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-001',
        variant: 'invalid-variant',
        player_count: 1,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, false)
    })

    test('missing setup.mastermind', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-001',
        variant: 'solo',
        player_count: 1,
        setup: {
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, false)
    })
  })

  // ============================================================================
  // Tier 2: Card Catalog Validation
  // ============================================================================

  describe('Tier 2 (Card Catalog) — Valid Cases', () => {
    test('Tier 1 + single card type (mastermind only)', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-001',
        variant: 'solo',
        player_count: 1,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        },
        card_catalog: {
          cards: [
            {
              card_type: 'mastermind',
              ext_id: 'mm-ext-001',
              name: 'Thanos'
            }
          ]
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, true)
    })

    test('Tier 1 + mixed card types', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-002',
        variant: 'cooperative',
        player_count: 2,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        },
        card_catalog: {
          cards: [
            {
              card_type: 'mastermind',
              ext_id: 'mm-ext-001',
              name: 'Thanos'
            },
            {
              card_type: 'scheme',
              ext_id: 'sch-ext-001',
              name: 'Infinity Gems'
            },
            {
              card_type: 'villain_group',
              ext_id: 'vg-ext-001',
              name: 'Black Order'
            }
          ]
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, true)
    })

    test('Tier 1 + all 8 card types', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-003',
        variant: 'cooperative',
        player_count: 1,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        },
        card_catalog: {
          cards: [
            { card_type: 'mastermind', ext_id: 'mm-1', name: 'Mastermind' },
            { card_type: 'scheme', ext_id: 'sch-1', name: 'Scheme' },
            { card_type: 'villain_group', ext_id: 'vg-1', name: 'Villain' },
            {
              card_type: 'henchmen_group',
              ext_id: 'hm-1',
              name: 'Henchmen',
              rarity_code: 'c1'
            },
            {
              card_type: 'hero',
              ext_id: 'h-1',
              name: 'Hero',
              hero_class: ['strength'],
              rarity_code: 'c2'
            },
            { card_type: 'shield_officer', ext_id: 'so-1', name: 'Officer' },
            { card_type: 'sidekick', ext_id: 'sk-1', name: 'Sidekick' },
            { card_type: 'wound', ext_id: 'w-1', name: 'Wound' },
            { card_type: 'bystander', ext_id: 'by-1', name: 'Bystander' }
          ]
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, true)
    })
  })

  describe('Tier 2 (Card Catalog) — Invalid Cases', () => {
    test('invalid rarity_code', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-001',
        variant: 'solo',
        player_count: 1,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        },
        card_catalog: {
          cards: [
            {
              card_type: 'henchmen_group',
              ext_id: 'hm-1',
              name: 'Henchmen',
              rarity_code: 'invalid-rarity'
            }
          ]
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, false)
    })

    test('invalid hero_class array value', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-001',
        variant: 'solo',
        player_count: 1,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        },
        card_catalog: {
          cards: [
            {
              card_type: 'hero',
              ext_id: 'h-1',
              name: 'Hero',
              hero_class: ['invalid-class'],
              rarity_code: 'c1'
            }
          ]
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, false)
    })

    test('missing required card field (ext_id)', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-001',
        variant: 'solo',
        player_count: 1,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        },
        card_catalog: {
          cards: [
            {
              card_type: 'hero',
              name: 'Hero',
              hero_class: ['strength'],
              rarity_code: 'c1'
            }
          ]
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, false)
    })
  })

  // ============================================================================
  // Tier 3: Replay Log Validation
  // ============================================================================

  describe('Tier 3 (Replay) — Valid Cases', () => {
    test('empty replay (no turns)', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-001',
        variant: 'solo',
        player_count: 1,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        },
        replay: {
          turns: []
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, true)
    })

    test('replay with single turn and valid seq', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-001',
        variant: 'solo',
        player_count: 1,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        },
        replay: {
          turns: [
            {
              turn_number: 1,
              active_player_id: 'player-1',
              player_actions: [
                { seq: 0, action_type: 'hero_play' },
                { seq: 1, action_type: 'hero_recruit' },
                { seq: 2, action_type: 'villain_attack' }
              ]
            }
          ]
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, true)
    })

    test('replay with multiple turns', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-001',
        variant: 'cooperative',
        player_count: 2,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        },
        replay: {
          turns: [
            {
              turn_number: 1,
              active_player_id: 'player-1',
              player_actions: [{ seq: 0, action_type: 'hero_play' }]
            },
            {
              turn_number: 2,
              active_player_id: 'player-2',
              player_actions: [{ seq: 0, action_type: 'hero_recruit' }]
            }
          ]
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, true)
    })
  })

  describe('Tier 3 (Replay) — Invalid seq Constraint', () => {
    test('seq with gaps (invalid)', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-001',
        variant: 'solo',
        player_count: 1,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        },
        replay: {
          turns: [
            {
              turn_number: 1,
              active_player_id: 'player-1',
              player_actions: [
                { seq: 0, action_type: 'hero_play' },
                { seq: 2, action_type: 'hero_recruit' },
                { seq: 3, action_type: 'villain_attack' }
              ]
            }
          ]
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, false)
      assert(result.errors && result.errors.length > 0)
    })

    test('seq with duplicates (invalid)', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-001',
        variant: 'solo',
        player_count: 1,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        },
        replay: {
          turns: [
            {
              turn_number: 1,
              active_player_id: 'player-1',
              player_actions: [
                { seq: 0, action_type: 'hero_play' },
                { seq: 1, action_type: 'hero_recruit' },
                { seq: 1, action_type: 'villain_attack' }
              ]
            }
          ]
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, false)
    })

    test('seq unordered (invalid)', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-001',
        variant: 'solo',
        player_count: 1,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        },
        replay: {
          turns: [
            {
              turn_number: 1,
              active_player_id: 'player-1',
              player_actions: [
                { seq: 2, action_type: 'hero_play' },
                { seq: 1, action_type: 'hero_recruit' },
                { seq: 0, action_type: 'villain_attack' }
              ]
            }
          ]
        }
      }
      const result = validate(lagn)
      assert.strictEqual(result.valid, false)
    })
  })

  // ============================================================================
  // Summarize Function
  // ============================================================================

  describe('summarize() function', () => {
    test('returns all nulls for invalid data', () => {
      const invalid = { invalid: 'data' }
      const summary = summarize(invalid)
      assert.strictEqual(summary.valid, false)
      assert.strictEqual(summary.game_id, null)
      assert.strictEqual(summary.variant, null)
      assert.strictEqual(summary.player_count, null)
      assert.strictEqual(summary.result, null)
    })

    test('extracts fields from valid Tier 1', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-123',
        variant: 'solo',
        player_count: 1,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        }
      }
      const summary = summarize(lagn)
      assert.strictEqual(summary.valid, true)
      assert.strictEqual(summary.game_id, 'game-123')
      assert.strictEqual(summary.variant, 'solo')
      assert.strictEqual(summary.player_count, 1)
    })

    test('handles missing result field gracefully', () => {
      const lagn = {
        lagn_version: '1.0.0',
        game_id: 'game-456',
        variant: 'cooperative',
        player_count: 2,
        setup: {
          mastermind: { id: 'mm-001', name: 'Mastermind' },
          scheme: { id: 'sch-001', name: 'Scheme' },
          villain_groups: [{ id: 'vg-001', name: 'Villains' }],
          henchmen_groups: [{ id: 'hm-001', name: 'Henchmen' }],
          heroes: [{ id: 'h-001', name: 'Hero' }],
          bystanders_count: 0,
          wounds_count: 0,
          shield_officers_count: 0,
          sidekicks_count: 0
        }
      }
      const summary = summarize(lagn)
      assert.strictEqual(summary.valid, true)
      assert.strictEqual(summary.result, 'unknown')
    })
  })
})
