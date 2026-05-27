# EC-208 — Scheme Twist Count Fix

**Status:** Complete
**Scope:** Fix twistCount derivation in UIState builder — was counting villainDeck.discard (always 0), should count scheme.twistPile

## Bug

Scheme-twist cards route to `G.scheme.twistPile` (per `villainDeck.reveal.ts`),
not to `villainDeck.discard`. The UIState builder derived `twistCount` by
scanning `villainDeck.discard` for `'scheme-twist'` card types, which always
yielded 0. SchemeTile displayed "Twists: 0/8" regardless of actual twist count.

## Fix

- [x] `uiState.build.ts` — replace discard-scan loop with `gameState.scheme.twistPile.length`
- [x] `uiState.types.ts` — update stale comment on UISchemeState

## Tests

- [x] 819/819 game-engine tests pass
- [x] 444/444 arena-client tests pass
