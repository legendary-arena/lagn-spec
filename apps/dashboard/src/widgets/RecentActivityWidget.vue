<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  useGovernanceSnapshot,
  type CommitEntry,
  type DecisionEntry,
} from '../composables/useGovernanceSnapshot.js';
import { useDataFreshness } from '../composables/useDataFreshness.js';

type ActivityBadge = 'DECISION' | 'WP' | 'SPEC';

interface ActivityItem {
  readonly key: string;
  readonly badge: ActivityBadge;
  readonly timestampIso: string;
  readonly title: string;
  readonly body: string;
}

const DEFAULT_VISIBLE_COUNT = 10;
const EXPANDED_VISIBLE_COUNT = 50;
const COMMIT_BODY_PLACEHOLDER = '';

const governance = useGovernanceSnapshot();

const generatedAtMillis = ref<number | null>(null);
if (governance.generatedAt !== '') {
  const parsedMillis = Date.parse(governance.generatedAt);
  generatedAtMillis.value = Number.isNaN(parsedMillis) ? null : parsedMillis;
}
// why: D-19804 — 'BUILD' source label, not 'MOCK'; this widget shares the
// snapshot composable from §D and rides the same build-time freshness axis.
const sourceRef = ref<'BUILD'>('BUILD');
const { relativeTime, sourceLabel } = useDataFreshness(generatedAtMillis, sourceRef);

const showExpanded = ref(false);

function decisionToItem(entry: DecisionEntry): ActivityItem {
  return {
    key: `decision:${entry.id}`,
    badge: 'DECISION',
    timestampIso: entry.mtime,
    title: `${entry.id} — ${entry.title}`,
    body: entry.body,
  };
}

function commitToItem(entry: CommitEntry, sequence: number): ActivityItem {
  // why: commit-order descending is preserved as a stable sort baseline;
  // the snapshot does not carry per-commit timestamps (commit-order suffices
  // for the activity feed per WP §D Activity feed source).
  const sequenceKey = String(sequence).padStart(4, '0');
  return {
    key: `commit:${entry.sha}:${sequenceKey}`,
    badge: entry.kind,
    timestampIso: '',
    title: entry.title,
    body: COMMIT_BODY_PLACEHOLDER,
  };
}

const allItems = computed<readonly ActivityItem[]>(() => {
  const merged: ActivityItem[] = [];
  const decisions = governance.decisions(EXPANDED_VISIBLE_COUNT);
  for (const decision of decisions) {
    merged.push(decisionToItem(decision));
  }
  const commits = governance.commits(EXPANDED_VISIBLE_COUNT);
  for (let commitIndex = 0; commitIndex < commits.length; commitIndex += 1) {
    const commit = commits[commitIndex];
    if (commit === undefined) {
      continue;
    }
    merged.push(commitToItem(commit, commitIndex));
  }
  // why: DECISIONS entries all share the same single-file mtime per WP §D
  // (per-entry mtime is out of scope; see RecentActivityWidget tooltip);
  // commits arrive in commit-order descending without timestamps. Sort by
  // timestampIso descending (decisions first because mtime is the most
  // recent commit on DECISIONS.md), fall back to the source order embedded
  // in `key` for stable ties.
  merged.sort((leftItem, rightItem) => {
    if (leftItem.timestampIso !== rightItem.timestampIso) {
      return leftItem.timestampIso < rightItem.timestampIso ? 1 : -1;
    }
    if (leftItem.key === rightItem.key) {
      return 0;
    }
    return leftItem.key < rightItem.key ? -1 : 1;
  });
  return merged;
});

const visibleItems = computed(() => {
  const limit = showExpanded.value ? EXPANDED_VISIBLE_COUNT : DEFAULT_VISIBLE_COUNT;
  return allItems.value.slice(0, limit);
});

const canExpand = computed(() => allItems.value.length > DEFAULT_VISIBLE_COUNT && !showExpanded.value);
const canCollapse = computed(() => showExpanded.value);

type WidgetState = 'loading' | 'error' | 'empty' | 'data';
const state = computed<WidgetState>(() => {
  if (governance.loadError) {
    return 'error';
  }
  if (allItems.value.length === 0) {
    return 'empty';
  }
  return 'data';
});

function badgeClass(badge: ActivityBadge): string {
  return `badge-${badge.toLowerCase()}`;
}

function formatRelativeTimestamp(iso: string): string {
  if (iso === '') {
    return '';
  }
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return '';
  }
  const diffMillis = Date.now() - parsed;
  const diffMinutes = Math.floor(diffMillis / 60000);
  if (diffMinutes < 1) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function toggleExpansion(): void {
  showExpanded.value = !showExpanded.value;
}
</script>

<template>
  <div class="widget recent-activity-widget">
    <header class="widget-header">
      <h3>Recent Activity</h3>
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
      <p>The governance snapshot could not be loaded; please re-run pnpm dash:build or inspect the script logs for the underlying cause.</p>
    </div>

    <div v-else-if="state === 'empty'" class="widget-empty">
      <p>No recent activity captured in the latest snapshot.</p>
    </div>

    <div v-else class="widget-data">
      <ul class="activity-list">
        <li v-for="item in visibleItems" :key="item.key" class="activity-item">
          <span class="activity-badge" :class="badgeClass(item.badge)">{{ item.badge }}</span>
          <div class="activity-content">
            <span class="activity-title">{{ item.title }}</span>
            <span v-if="item.body !== ''" class="activity-body">{{ item.body }}</span>
          </div>
          <span v-if="item.timestampIso !== ''" class="activity-time" :title="item.timestampIso">
            {{ formatRelativeTimestamp(item.timestampIso) }}
          </span>
        </li>
      </ul>

      <div v-if="canExpand || canCollapse" class="activity-footer">
        <button type="button" class="expand-button" @click="toggleExpansion">
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

.widget-header h3 { margin: 0; font-size: 0.9rem; color: var(--p-text-color); }

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
  height: 36px;
  background: var(--p-surface-border, var(--p-content-border-color));
  border-radius: 4px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.widget-error { color: var(--p-text-color); font-size: 0.85rem; }
.widget-empty { color: var(--p-text-muted-color); font-size: 0.85rem; }

.activity-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 460px;
  overflow-y: auto;
}

.activity-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 0.6rem;
  padding: 0.5rem 0.6rem;
  border-radius: 4px;
  background: color-mix(in srgb, var(--p-content-border-color) 25%, transparent);
}

/* why: badges convey kind via the text label first; the colored background
   is the secondary cue so kind is never expressed by color alone. */
.activity-badge {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  white-space: nowrap;
  color: var(--p-primary-contrast-color);
}

.activity-badge.badge-decision { background: var(--p-primary-color); }
.activity-badge.badge-wp { background: var(--p-green-500); }
.activity-badge.badge-spec { background: var(--p-blue-500); }

.activity-content {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.activity-title {
  font-size: 0.8rem;
  color: var(--p-text-color);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.activity-body {
  font-size: 0.72rem;
  color: var(--p-text-muted-color);
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.activity-time {
  font-size: 0.65rem;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.activity-footer {
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
