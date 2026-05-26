# EC-205 — Core-Set Playability Fixes

**Status:** Complete
**Scope:** Two bug fixes observed during live autoplay on play.legendary-arena.com

## Fix 1 — Bot never attacks mastermind

- [x] `SCORE_FIGHT_MASTERMIND_BASE` raised from 300 → 1500 (highest combat action)
- [x] Behavioral test added: mastermind preferred over non-escape villain
- [x] All 814 engine tests pass

## Fix 2 — Game-over results invisible on live play views

- [x] `EndgameSummary` wired into `PlayDesktop.vue`
- [x] `EndgameSummary` wired into `PlayMobile.vue`
- [x] `isGameOver` computed added to PlayMobile (PlayDesktop already had it)
- [x] All 444 arena-client tests pass
