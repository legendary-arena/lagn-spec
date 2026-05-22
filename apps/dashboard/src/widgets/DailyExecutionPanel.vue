<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useDailyChecklist, type ChecklistCategory } from '../composables/useDailyChecklist.js';
import { useDataFreshness } from '../composables/useDataFreshness.js';
import type { ServiceResponse } from '../types/index.js';

interface CategoryGroup {
  key: ChecklistCategory;
  label: string;
}

const CATEGORY_GROUPS: readonly CategoryGroup[] = [
  { key: 'content', label: 'Content' },
  { key: 'community', label: 'Community' },
  { key: 'growth', label: 'Growth' },
];

const { items, completedCount, totalCount, loadError, loadedAt, toggle, resetAll } = useDailyChecklist();

// why: localStorage is read synchronously in the composable, so the freshness
// source is the local browser store rather than a network response. 'MOCK'
// keeps the badge vocabulary consistent with the other dashboard widgets.
const updatedAt = ref<number | null>(loadedAt.value);
const source = ref<ServiceResponse<unknown>['source'] | null>('MOCK');
const { relativeTime, sourceLabel } = useDataFreshness(updatedAt, source);

// why: the four-state widget contract requires a loading state; the data
// resolves synchronously, so loading is only visible until the first mount.
const isReady = ref(false);
onMounted(() => {
  isReady.value = true;
});

type PanelState = 'loading' | 'error' | 'empty' | 'data';
const panelState = computed<PanelState>(() => {
  if (!isReady.value) {
    return 'loading';
  }
  if (loadError.value) {
    return 'error';
  }
  if (totalCount.value === 0) {
    return 'empty';
  }
  return 'data';
});

const groupedItems = computed(() =>
  CATEGORY_GROUPS.map((group) => ({
    ...group,
    items: items.value.filter((item) => item.category === group.key),
  })),
);

const completionBadge = computed(() => `Daily: ${completedCount.value}/${totalCount.value} complete`);

function handleToggle(id: string): void {
  toggle(id);
}

/**
 * Confirms before clearing the checklist. resetAll is destructive, and the
 * composable deliberately does not prompt, so the confirmation lives here.
 */
function handleReset(): void {
  const confirmed = window.confirm('Reset all daily checklist items? This clears today\'s progress.');
  if (confirmed) {
    resetAll();
  }
}
</script>

<template>
  <section class="widget daily-panel" aria-labelledby="daily-panel-title">
    <header class="widget-header">
      <h3 id="daily-panel-title">Daily Execution</h3>
      <div class="header-meta">
        <span class="completion-badge">{{ completionBadge }}</span>
        <span v-if="sourceLabel" class="freshness-badge">
          <span class="source">{{ sourceLabel }}</span>
          <span class="timestamp">{{ relativeTime }}</span>
        </span>
      </div>
    </header>

    <div v-if="panelState === 'loading'" class="widget-loading">
      <div class="skeleton-block"></div>
      <div class="skeleton-block"></div>
      <div class="skeleton-block"></div>
    </div>

    <div v-else-if="panelState === 'error'" class="widget-error" role="alert">
      <p>The daily checklist could not be read from local storage. Your saved progress may be unavailable; try reloading the page.</p>
    </div>

    <div v-else-if="panelState === 'empty'" class="widget-empty">
      <p>No checklist items are configured.</p>
    </div>

    <div v-else class="widget-body">
      <div v-for="group in groupedItems" :key="group.key" class="checklist-group">
        <h4 class="group-heading">{{ group.label }}</h4>
        <ul class="checklist-items">
          <li
            v-for="item in group.items"
            :key="item.id"
            class="checklist-item"
            :class="{ completed: item.completed }"
          >
            <label class="item-label">
              <input
                type="checkbox"
                class="item-checkbox"
                :checked="item.completed"
                @change="handleToggle(item.id)"
              />
              <span class="item-text">{{ item.label }}</span>
              <span class="item-cadence">{{ item.cadence }}</span>
            </label>
          </li>
        </ul>
      </div>
    </div>

    <footer v-if="panelState === 'data'" class="widget-footer">
      <button type="button" class="reset-button" @click="handleReset">Reset day</button>
    </footer>
  </section>
</template>

<style scoped>
.widget {
  background: var(--p-surface-card, var(--p-content-background));
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  border-radius: 8px;
  padding: 1.25rem;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.widget-header h3 {
  margin: 0;
  font-size: 0.9rem;
  color: var(--p-text-color);
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.completion-badge {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--p-primary-color);
  white-space: nowrap;
}

.freshness-badge {
  font-size: 0.65rem;
  color: var(--p-text-muted-color);
  display: flex;
  gap: 0.35rem;
}

.freshness-badge .source {
  background: var(--p-surface-border, var(--p-content-border-color));
  color: var(--p-text-color);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-weight: 600;
}

.widget-loading .skeleton-block {
  height: 32px;
  background: var(--p-surface-border, var(--p-content-border-color));
  border-radius: 4px;
  animation: pulse 1.5s infinite;
  margin-bottom: 0.5rem;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.widget-error { color: var(--p-text-color); font-size: 0.85rem; }
.widget-empty { color: var(--p-text-muted-color); font-size: 0.85rem; }

.widget-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.group-heading {
  margin: 0 0 0.4rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.checklist-items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.item-label {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  cursor: pointer;
}

.item-label:hover {
  background: var(--p-surface-border, var(--p-content-border-color));
}

.item-checkbox {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: var(--p-primary-color);
}

.item-text {
  flex: 1;
  font-size: 0.85rem;
  color: var(--p-text-color);
}

.item-cadence {
  font-size: 0.65rem;
  color: var(--p-text-muted-color);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  white-space: nowrap;
}

/* why: completed rows are muted (not hidden) and keep their checkbox checked,
   so completion is signalled by the checkbox state and text, never by color
   alone. */
.checklist-item.completed .item-text {
  color: var(--p-text-muted-color);
  text-decoration: line-through;
}

.widget-footer {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
}

.reset-button {
  background: transparent;
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  color: var(--p-text-muted-color);
  padding: 0.4rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.reset-button:hover {
  color: var(--p-text-color);
  border-color: var(--p-primary-color);
}
</style>
