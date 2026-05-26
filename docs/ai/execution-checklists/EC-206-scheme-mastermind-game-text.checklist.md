# EC-206 — Scheme & Mastermind Game Text on Play Surface

**Status:** Complete
**Scope:** Surface card ability text for scheme and mastermind on the live play views

## Data Pipeline

- [x] `SchemeState.gameText?: readonly string[]` added (G type, optional)
- [x] `MastermindState.gameText?: readonly string[]` added (G type, optional)
- [x] `UISchemeState.display?: UICardDisplay` added (scheme card name/image)
- [x] `UISchemeState.gameText?: readonly string[]` added
- [x] `UIMastermindState.gameText?: readonly string[]` added
- [x] `buildSchemeGameText()` extracts scheme abilities from registry at setup
- [x] `buildMastermindState()` extracts base card abilities from registry at setup
- [x] `buildCardDisplayData()` adds scheme card display entry (name/imageUrl)
- [x] `buildUIState()` projects gameText and scheme display through to UIState
- [x] Drift tests updated for new fields on UIMastermindState and UISchemeState
- [x] Replay fixture hash updated (G state changed with new fields)

## UI Components

- [x] `SchemeTile.vue` renders gameText as list items below twist counter
- [x] `SchemeTile.vue` uses `scheme.display` for card art when available
- [x] `MastermindTile.vue` renders gameText as list items above bystanders section

## Tests

- [x] 814/814 game-engine tests pass
- [x] 444/444 arena-client tests pass
