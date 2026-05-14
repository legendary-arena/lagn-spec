# EC-156 — Physical Card Phase 2: Engine + Viewer Consumer Migration (Execution Checklist)

**Source:** `docs/ai/work-packets/WP-141-physical-card-phase-2-consumer-migration.md`

**Layer:** `packages/game-engine/src/setup/`, `packages/game-engine/src/economy/`,
`apps/registry-viewer/src/registry/`, `apps/registry-viewer/src/components/`

## Locked Values

- **Replay hash:** `PRE_WP080_HASH = '2baeecc3'` — unchanged (Scope D no-op; test fixtures lack physicalCards)
- **Engine baseline pre:** 698 tests / 150 suites / 0 fail
- **Engine baseline post:** 705 tests / 153 suites / 0 fail (+7 / +3)
- **Viewer baseline pre:** 31 tests / 5 suites / 0 fail
- **Viewer baseline post:** 33 tests / 7 suites / 0 fail (+2 / +2)
- **Registry baseline:** 53 / 5 / 0 UNCHANGED
- **Commit prefix:** `EC-156:` (code), `SPEC:` (governance close)
- **Decision IDs:** D-14101, D-14102, D-14103

## Scopes

- [x] **Scope A** — buildHeroDeck.ts: physicalCards[].count deck-reservoir migration (D-14101, D-14102)
- [x] **Scope B** — buildCardDisplayData.ts: physicalCards imageUrl + count migration (D-14102, D-14103)
- [x] **Scope C** — economy.logic.ts: physicalCards[].count buildCardStats migration (D-14102)
- [x] **Scope D** — replay hash: no-op (fallback path produces identical hash)
- [x] **Scope E** — shared.ts + schema.ts: viewer hero-card imageUrl migration (D-14103)
- [x] **Scope F** — CardGrid.vue + CardDetail.vue: physicalCardImageUrl preference

## Grep Gates

- [x] `card\.imageUrl` returns zero matches in `packages/game-engine/src/` production code
- [x] `card\.imageUrl` returns zero matches in the Heroes loop of `shared.ts`

## Governance

- [x] D-14101, D-14102, D-14103 appended to DECISIONS.md
- [x] WP-141 flipped to Done in WORK_INDEX.md
- [x] EC-156 row added to EC_INDEX.md
- [x] 01.6 post-mortem authored (mandatory — three triggers)
