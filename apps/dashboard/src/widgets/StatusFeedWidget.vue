<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGovernanceSnapshot } from '../composables/useGovernanceSnapshot.js';
import { useDataFreshness } from '../composables/useDataFreshness.js';
import type { StatusEntry } from '../types/index.js';

const DEFAULT_VISIBLE_COUNT = 10;
const EXPANDED_VISIBLE_COUNT = 50;

const governance = useGovernanceSnapshot();

const generatedAtMillis = ref<number | null>(null);
if (governance.generatedAt !== '') {
  const parsedMillis = Date.parse(governance.generatedAt);
  generatedAtMillis.value = Number.isNaN(parsedMillis) ? null : parsedMillis;
}
// why: D-19804 — 'BUILD' source label, not 'MOCK'; this widget shares the
// snapshot composable and rides the same build-time freshness axis as
// GovernanceThroughputWidget / RecentActivityWidget.
const sourceRef = ref<'BUILD'>('BUILD');
const { relativeTime, sourceLabel } = useDataFreshness(generatedAtMillis, sourceRef);

const showExpanded = ref(false);
const expandedKeys = ref<Set<string>>(new Set());

const allEntries = computed<readonly StatusEntry[]>(() =>
  governance.statusEntries(EXPANDED_VISIBLE_COUNT),
);

const visibleEntries = computed<readonly StatusEntry[]>(() => {
  const limit = showExpanded.value ? EXPANDED_VISIBLE_COUNT : DEFAULT_VISIBLE_COUNT;
  return allEntries.value.slice(0, limit);
});

const canExpand = computed(
  () => allEntries.value.length > DEFAULT_VISIBLE_COUNT && !showExpanded.value,
);
const canCollapse = computed(() => showExpanded.value);

type WidgetState = 'loading' | 'error' | 'empty' | 'data';
const state = computed<WidgetState>(() => {
  if (governance.loadError) {
    return 'error';
  }
  if (allEntries.value.length === 0) {
    return 'empty';
  }
  return 'data';
});

function entryKey(entry: StatusEntry): string {
  return `${entry.wpNumber}:${entry.ecNumber}:${entry.date}`;
}

function isEntryExpanded(entry: StatusEntry): boolean {
  return expandedKeys.value.has(entryKey(entry));
}

function toggleEntryExpansion(entry: StatusEntry): void {
  const key = entryKey(entry);
  const next = new Set(expandedKeys.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedKeys.value = next;
}

function toggleShowMore(): void {
  showExpanded.value = !showExpanded.value;
}

function formatHeader(entry: StatusEntry): string {
  const paddedWp = String(entry.wpNumber).padStart(3, '0');
  return `WP-${paddedWp} / EC-${entry.ecNumber} — ${entry.title}`;
}
</script>

<template>
  <div class="widget status-feed-widget">
    <header class="widget-header">
      <h3>Recent STATUS Entries</h3>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </header>

    <div v-if="state === 'loading'" class="widget-loading" aria-hidden="true">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </div>

    <div v-else-if="state === 'error'" class="widget-error" role="alert">
      <p>
        The governance snapshot could not be loaded; please re-run pnpm dash:build or inspect the
        script logs for the underlying cause.
      </p>
    </div>

    <div v-else-if="state === 'empty'" class="widget-empty">
      <p>No STATUS entries captured in the latest snapshot.</p>
    </div>

    <div v-else class="widget-data">
      <ul class="status-list">
        <li v-for="entry in visibleEntries" :key="entryKey(entry)" class="status-card">
          <button
            type="button"
            class="status-card-header"
            :aria-expanded="isEntryExpanded(entry)"
            @click="toggleEntryExpansion(entry)"
          >
            <span class="status-card-title">{{ formatHeader(entry) }}</span>
            <span class="status-card-meta">
              <span class="status-card-date">{{ entry.date }}</span>
              <span class="status-card-chevron" aria-hidden="true">{{
                isEntryExpanded(entry) ? '▾' : '▸'
              }}</span>
            </span>
          </button>
          <!-- why: D-19906 — `filePath` is the build-time-resolved relative
               path under docs/ai/work-packets/; empty string signals the
               resolver found zero or >1 prefix matches and the widget
               suppresses the link rather than guessing a path. A runtime
               glob would either hallucinate a filename or fall back to a
               broken link — both worse than no link. -->
          <a
            v-if="entry.filePath !== ''"
            class="status-card-open-link"
            :href="`https://github.com/BarefootBetters/legendary-arena/blob/main/${entry.filePath}`"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open WP →
          </a>
          <div v-if="isEntryExpanded(entry)" class="status-card-body">{{ entry.body }}</div>
        </li>
      </ul>

      <div v-if="canExpand || canCollapse" class="status-footer">
        <button type="button" class="expand-button" @click="toggleShowMore">
          <span v-if="canExpand">Show more</span>
          <span v-else>Show fewer</span>
        </button>
      </div>
    </div>
  </div>
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
  margin-bottom: 1rem;
}

.widget-header h3 {
  margin: 0;
  font-size: 0.9rem;
  color: var(--p-text-color);
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

.widget-loading {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.widget-loading .skeleton-row {
  height: 44px;
  background: var(--p-surface-border, var(--p-content-border-color));
  border-radius: 4px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.widget-error {
  color: var(--p-text-color);
  font-size: 0.85rem;
}
.widget-empty {
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
}

.status-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 540px;
  overflow-y: auto;
}

.status-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border-radius: 4px;
  background: color-mix(in srgb, var(--p-content-border-color) 22%, transparent);
}

.status-card-header {
  grid-column: 1 / 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--p-text-color);
  text-align: left;
  font: inherit;
}

.status-card-title {
  font-size: 0.8rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.status-card-meta {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
}

.status-card-date {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
}

.status-card-chevron {
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.status-card-open-link {
  grid-column: 2 / 3;
  align-self: center;
  font-size: 0.7rem;
  color: var(--p-primary-color);
  text-decoration: none;
  white-space: nowrap;
}

.status-card-open-link:hover {
  text-decoration: underline;
}

.status-card-body {
  grid-column: 1 / -1;
  font-size: 0.74rem;
  line-height: 1.45;
  color: var(--p-text-muted-color);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding-top: 0.4rem;
  border-top: 1px solid color-mix(in srgb, var(--p-content-border-color) 40%, transparent);
}

.status-footer {
  margin-top: 0.75rem;
  display: flex;
  justify-content: center;
}

.expand-button {
  background: transparent;
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  color: var(--p-text-color);
  font-size: 0.75rem;
  padding: 0.35rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
}

.expand-button:hover {
  background: var(--p-content-border-color);
}
</style>
