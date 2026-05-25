# EC-200 — Autoplay Controls v2: Keyboard, Position, Speed, Game-Over Review

**Source:** docs/ai/invocations/session-autoplay-controls-v2.md
**Layer:** Server + Arena Client (cross-cutting)

## Features Implemented

### Feature 1 — Keyboard Shortcuts
- [x] Toolbar is focusable (`tabindex="0"`), scoped `@keydown`, auto-focuses on mount
- [x] Space/Arrow/Home/End map to actions; each key calls `preventDefault()`
- [x] Disabled actions are no-ops (guarded by computed refs)
- [x] `role="toolbar"` on the section element

### Feature 2 — Position Indicator
- [x] Shows `"Move N / M"` when historyLength > 0
- [x] Hidden when historyLength === 0
- [x] Monospace font stack, stable min-width

### Feature 3 — Speed Control
- [x] Server: `setSpeedMode('2x'|'4x')` adjusts activeDelay; floors at 10ms
- [x] Server: `goToEnd` forces `speedMode: 'max'`; resume resets 'max' → '1x'
- [x] Server: pause does NOT reset speed mode
- [x] Server: resume route accepts JSON body with `speedMode`
- [x] Server: `buildResponse` includes `speedMode` in envelope
- [x] Client: speed cycle button 1×→2×→4×→1×
- [x] Client: cycling while playing sends resume with speedMode body
- [x] Client: `resume` service function accepts optional `{ speedMode }` param

### Feature 4 — Game-Over Review State
- [x] Server: `markGameOver()` sets game-over flag + pauses controller
- [x] Server: `withRegisteredController` defers cleanup 5 min on normal exit
- [x] Server: error exit still does immediate cleanup
- [x] Server: `buildResponse` includes `gameOver` in envelope
- [x] Client: toggle shows 🏁 when game over; disabled
- [x] Client: step/restart enabled during game over (not gated on paused)
- [x] Client: watcher sets `paused=true` when `isGameOver` transitions to true
- [x] Client: 404 after game over sets `expired` flag, disables all controls

## Guardrails
- [x] No `.reduce()` introduced
- [x] No Pinia store import in AutoplayControls.vue
- [x] `defineComponent({ setup() { return {...} } })` pattern preserved (D-6512)
- [x] All existing tests pass (33 client + 17 server baseline)
- [x] New tests cover all features (21 client + 7 server)
