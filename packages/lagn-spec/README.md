# LAGN v1.0 — Legendary Arena Game Notation

A standardized JSON format for exchanging Legendary Arena game records, compatible with any implementation.

**File extension:** `.lagn.json`

## Installation

```bash
npm install @legendary-arena/lagn
```

## Usage

### Programmatic Validation

```javascript
import { validate, summarize } from '@legendary-arena/lagn'

const json = JSON.parse(fs.readFileSync('match.lagn.json', 'utf-8'))

// Validate
const result = validate(json)
if (result.valid) {
  console.log('Valid LAGN file')
} else {
  console.error('Invalid:', result.errors)
}

// Summarize
const summary = summarize(json)
console.log(`Game: ${summary.game_id}, Outcome: ${summary.result}`)
```

### CLI Tool

```bash
npx lagn validate match.lagn.json
# Output: ✓ Valid LAGN file: game_id=..., variant=..., players=..., outcome=...

# Exit codes:
# 0 = valid
# 1 = invalid
# 2 = file not found / I/O error
```

## Schema

The LAGN v1.0 format is a three-tier JSON schema:

### Tier 1: Game Setup (Required)

Game metadata and initial board configuration.

- `game_id` — Unique game identifier (string)
- `variant` — Game mode (`solo`, `cooperative`, `competitive`)
- `player_count` — Number of players (1–5)
- `setup` — Initial board state
  - `mastermind` — Boss villain
  - `scheme` — Villain scheme card
  - `villain_groups` — City villain groups
  - `henchmen_groups` — Henchmen deck
  - `heroes` — Hero lineup
  - Pile counts: `bystanders_count`, `wounds_count`, `shield_officers_count`, `sidekicks_count`

### Tier 2: Card Catalog (Optional)

Full card data for offline validation and cross-engine compatibility.

- `card_catalog.cards[]` — Array of cards
  - Card types: `mastermind`, `scheme`, `villain_group`, `henchmen_group`, `hero`, `shield_officer`, `sidekick`, `wound`, `bystander`
  - Fields: `ext_id`, `name`, `card_type`, `image_url` (optional), `image_thumb_url` (optional)
  - `hero` cards include: `hero_class[]` (`strength`, `instinct`, `covert`, `tech`, `ranged`)
  - Henchmen and hero cards include: `rarity_code` (`c1`, `c2`, `c3`, `uc`, `uc2`, `uc3`, `ra`)

### Tier 3: Replay Log (Optional)

Turn-by-turn game replay for deterministic validation.

- `replay.turns[]` — Array of turn records
  - `turn_number` — Turn index (1-indexed)
  - `active_player_id` — Player whose turn it is
  - `villain_events[]` — Villain phase events (ambush, patrol, guard, escape)
  - `player_actions[]` — Player actions with **strictly increasing seq** (no gaps, no duplicates)
  - Action types: `villain_reveal`, `villain_attack`, `hero_play`, `hero_recruit`, `bystander_capture`, `wound_dealt`, etc.

## Schema URL

All `.lagn.json` files should include the canonical schema URL:

```json
{
  "$schema": "https://legendary-arena.com/schemas/lagn/v1/lagn-v1.json",
  ...
}
```

This enables VS Code to auto-validate `.lagn.json` files with editor hints.

## Examples

See `examples/`:
- `tier1-setup-only.lagn.json` — Minimal setup (Tier 1 only)
- `tier2-with-catalog.lagn.json` — Setup + full card data (Tier 1 + Tier 2)
- `tier3-with-replay.lagn.json` — Complete game record (all three tiers)

## Validation Guarantees

- **Determinism:** Schema is immutable within a major version. Tier 4+ extensions will not break Tier 1/2/3 parsers.
- **Offline:** Schema is bundled in the package. Validation never requires network access.
- **Replay Integrity:** `seq` field is strictly ordered (1, 2, 3...) with no gaps or duplicates. Critical for anti-cheat verification.

## License

MIT — Free for any use, derivative works permitted.
