<script lang="ts">
import { defineComponent, computed } from 'vue';
import { storeToRefs } from 'pinia';
import type { HollowEffectRecord } from '@legendary-arena/game-engine';
import { useUiStateStore } from '../../stores/uiState';

/**
 * Compact, unobtrusive debug panel listing the hollow effects observed in the
 * current match. A *hollow* effect is a declared card ability whose executable
 * handler was absent or unreachable at runtime (WP-257 detector); this panel is
 * the first of three reporting consumers (the Download-diagnostics export and the
 * future `/coverage` overlay are the other two).
 *
 * It reads the engine projection `useUiStateStore().snapshot?.hollowEffects`
 * (surfaced from the runtime G.diagnostics channel by WP-258) and renders one
 * row per record — cardType, mechanic, timing, reason, turn. It is purely
 * presentational: it never interprets game state, never imports the engine
 * runtime, and only consumes the read-only UIState projection.
 *
 * // why: renders ONLY when ≥1 record is present (`v-if`). An absent or empty
 * `hollowEffects` is the no-hollow-effects case and must produce no DOM at all
 * (EC-289) — the panel should be invisible during a clean match and appear only
 * when there is something to flag.
 *
 * Per the `@legendary-arena/vue-sfc-loader` separate-compile pipeline (D-6512),
 * this SFC uses `defineComponent({ setup() { return {...} } })` so the
 * `setup()` bindings reach the template's `_ctx` (the ArenaHud store-read
 * precedent). Placement idiom mirrors the `DiagnosticExportButton.vue` sibling
 * (a fixed-position, high-z-index, unobtrusive play-surface overlay).
 *
 * @see WP-258 §Scope (In) B; EC-289 §Locked Values
 * @see DESIGN-HOLLOW-EFFECT-DETECTION.md §6
 */
export default defineComponent({
  name: 'HollowEffectsPanel',
  setup() {
    const store = useUiStateStore();
    const { snapshot } = storeToRefs(store);

    // why: derive the record list once. `snapshot?.hollowEffects` is the
    // optional engine projection — `[]` when absent so the template's
    // `v-if="hollowEffects.length > 0"` cleanly resolves the no-render case.
    const hollowEffects = computed<HollowEffectRecord[]>(
      () => snapshot.value?.hollowEffects ?? [],
    );

    return { hollowEffects };
  },
});
</script>

<template>
  <section
    v-if="hollowEffects.length > 0"
    class="hollow-effects-panel"
    data-testid="hollow-effects-panel"
    aria-label="Hollow effects observed this match"
  >
    <h2 class="hollow-effects-title">Hollow effects</h2>
    <table class="hollow-effects-table">
      <thead>
        <tr>
          <th scope="col">Card</th>
          <th scope="col">Mechanic</th>
          <th scope="col">Timing</th>
          <th scope="col">Reason</th>
          <th scope="col">Turn</th>
        </tr>
      </thead>
      <tbody>
        <!--
          // why: source-array index is a stable :key for the life of a single
          // UIState. The channel is append-only within a match (bounded by the
          // engine cap), so reusing the index cannot trigger spurious DOM
          // thrash. A new snapshot tears the list down and rebuilds it.
        -->
        <tr
          v-for="(record, index) in hollowEffects"
          :key="index"
          :data-index="index"
          data-testid="hollow-effects-row"
        >
          <td data-testid="hollow-effects-cardType">{{ record.cardType }}</td>
          <td data-testid="hollow-effects-mechanic">{{ record.mechanic }}</td>
          <td data-testid="hollow-effects-timing">{{ record.timing }}</td>
          <td data-testid="hollow-effects-reason">{{ record.reason }}</td>
          <td data-testid="hollow-effects-turn">{{ record.turn }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.hollow-effects-panel {
  position: fixed;
  bottom: 8px;
  right: 8px;
  max-width: 28rem;
  max-height: 14rem;
  overflow-y: auto;
  padding: 6px 10px;
  font-size: 12px;
  font-family: monospace;
  color: #f1f5f9;
  background: #3b1d2b;
  border: 1px solid #b45369;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  /* why: a high z-index keeps the panel reachable above any game overlay —
     the hollow effect it reports may itself be tied to a stuck overlay. */
  z-index: 9998;
}

.hollow-effects-title {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
}

.hollow-effects-table {
  border-collapse: collapse;
  width: 100%;
  font-variant-numeric: tabular-nums;
}

.hollow-effects-table th,
.hollow-effects-table td {
  padding: 1px 6px 1px 0;
  text-align: left;
  white-space: nowrap;
}

.hollow-effects-table th {
  border-bottom: 1px solid #b45369;
}
</style>
