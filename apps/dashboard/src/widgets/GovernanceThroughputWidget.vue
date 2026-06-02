<script setup lang="ts">
import { computed, ref } from 'vue';
import { useGovernanceSnapshot, type HorizonKey } from '../composables/useGovernanceSnapshot.js';
import { useDataFreshness } from '../composables/useDataFreshness.js';

interface HorizonOption {
  readonly key: HorizonKey;
  readonly label: string;
  readonly periodKeyFn: (date: Date) => string;
}

/**
 * Compute the ISO-8601 week key (YYYY-Www) for a UTC date. Mirrors the
 * generator-side implementation so the runtime widget can pick the bucket
 * matching today's wall-clock period.
 */
function isoWeekKey(date: Date): string {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = thursday.getUTCDay();
  const dayOffset = day === 0 ? -3 : 4 - day;
  thursday.setUTCDate(thursday.getUTCDate() + dayOffset);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const dayMillis = 86400000;
  const weekNumber = Math.ceil(((thursday.getTime() - yearStart) / dayMillis + 1) / 7);
  const year = thursday.getUTCFullYear();
  const weekPadded = String(weekNumber).padStart(2, '0');
  return `${year}-W${weekPadded}`;
}

function monthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function quarterKey(date: Date): string {
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

const HORIZON_OPTIONS: readonly HorizonOption[] = [
  { key: 'week', label: 'This Week', periodKeyFn: isoWeekKey },
  { key: 'month', label: 'This Month', periodKeyFn: monthKey },
  { key: 'quarter', label: 'This Quarter', periodKeyFn: quarterKey },
];

const selectedHorizon = ref<HorizonKey>('week');

const governance = useGovernanceSnapshot();

const generatedAtMillis = ref<number | null>(null);
if (governance.generatedAt !== '') {
  const parsedMillis = Date.parse(governance.generatedAt);
  generatedAtMillis.value = Number.isNaN(parsedMillis) ? null : parsedMillis;
}
// why: D-19804 — freshness badge source is 'BUILD', not 'MOCK'; the data is
// build-output, not runtime mock. The operator must see which axis the data
// was baked on so they know how to refresh (a `pnpm dash:build`, not a wait
// for next poll cycle).
const sourceRef = ref<'BUILD'>('BUILD');
const { relativeTime, sourceLabel } = useDataFreshness(generatedAtMillis, sourceRef);

const currentHorizonOption = computed(() => {
  const found = HORIZON_OPTIONS.find((option) => option.key === selectedHorizon.value);
  return found ?? HORIZON_OPTIONS[0]!;
});

const currentPeriodKey = computed(() => currentHorizonOption.value.periodKeyFn(new Date()));

const currentBucket = computed(() => {
  const buckets = governance.throughput(selectedHorizon.value);
  for (const bucket of buckets) {
    if (bucket.key === currentPeriodKey.value) {
      return bucket;
    }
  }
  return null;
});

const doneCount = computed(() => currentBucket.value?.done ?? 0);
// why: WP §D + EC §Locked Values §Widgets — In-flight and Blocked counts are
// global stock metrics; WpRef has no date field (locked 4-key contract) so
// they cannot be horizon-filtered. The horizon selector visibly changes
// card 2 (Done flow per period); cards 3 and 4 reflect current stock and
// carry a "current total" subtitle so the UX stays honest.
const inFlightCount = computed(() => governance.inFlight().length);
const blockedCount = computed(() => governance.blocked().length);

const nextWp = computed(() => governance.nextExecutable(1)[0] ?? null);
const queuedExtra = computed(() => {
  const queue = governance.nextExecutable(10);
  return queue.length > 1 ? queue.length - 1 : 0;
});

type WidgetState = 'loading' | 'error' | 'empty' | 'data';
const state = computed<WidgetState>(() => {
  if (governance.loadError) {
    return 'error';
  }
  const hasAny =
    doneCount.value > 0 ||
    inFlightCount.value > 0 ||
    blockedCount.value > 0 ||
    nextWp.value !== null;
  if (!hasAny) {
    return 'empty';
  }
  return 'data';
});

function selectHorizon(option: HorizonOption): void {
  selectedHorizon.value = option.key;
}
</script>

<template>
  <div class="widget governance-throughput-widget">
    <header class="widget-header">
      <h3>Governance Throughput</h3>
      <span v-if="sourceLabel" class="freshness-badge">
        <span class="source">{{ sourceLabel }}</span>
        <span class="timestamp">{{ relativeTime }}</span>
      </span>
    </header>

    <div v-if="state === 'loading'" class="widget-loading" aria-hidden="true">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </div>

    <div v-else-if="state === 'error'" class="widget-error" role="alert">
      <p>The governance snapshot could not be loaded; please re-run pnpm dash:build or inspect the script logs for the underlying cause.</p>
    </div>

    <div v-else-if="state === 'empty'" class="widget-empty">
      <p>No governance throughput available for the selected horizon.</p>
    </div>

    <div v-else class="widget-data">
      <nav class="horizon-tabs" role="tablist" aria-label="Governance throughput horizon">
        <button
          v-for="option in HORIZON_OPTIONS"
          :key="option.key"
          type="button"
          role="tab"
          :aria-selected="selectedHorizon === option.key"
          :class="{ active: selectedHorizon === option.key }"
          @click="selectHorizon(option)"
        >
          {{ option.label }}
        </button>
      </nav>

      <div class="card-grid">
        <article class="card card-primary" aria-label="Now: next executable work packet">
          <span class="card-label">Now: next executable WP</span>
          <span v-if="nextWp" class="card-primary-title">
            WP-{{ String(nextWp.number).padStart(3, '0') }} — {{ nextWp.title }}
          </span>
          <span v-else class="card-primary-title card-primary-empty">No unblocked WP queued — drafting space available.</span>
          <span v-if="nextWp && queuedExtra > 0" class="card-primary-subtitle">+{{ queuedExtra }} more queued</span>
        </article>

        <article class="card card-count" aria-label="Work packets done this period">
          <span class="card-label">Done</span>
          <span class="card-value">{{ doneCount }}</span>
          <span class="card-subtitle">{{ currentHorizonOption.label.toLowerCase() }}</span>
        </article>

        <article class="card card-count" aria-label="Work packets currently in flight">
          <span class="card-label">In-flight</span>
          <span class="card-value">{{ inFlightCount }}</span>
          <span class="card-subtitle">current total</span>
        </article>

        <article class="card card-count" aria-label="Work packets currently blocked">
          <span class="card-label">Blocked</span>
          <span class="card-value">{{ blockedCount }}</span>
          <span class="card-subtitle">current total</span>
        </article>
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
  gap: 0.75rem;
}

.widget-loading .skeleton-row {
  height: 56px;
  background: var(--p-surface-border, var(--p-content-border-color));
  border-radius: 4px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.widget-error { color: var(--p-text-color); font-size: 0.85rem; }
.widget-empty { color: var(--p-text-muted-color); font-size: 0.85rem; }

.horizon-tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
  background: var(--p-content-border-color);
  border-radius: 6px;
  padding: 0.2rem;
}

.horizon-tabs button {
  flex: 1;
  padding: 0.4rem 0.75rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 0.75rem;
  cursor: pointer;
  color: var(--p-text-muted-color);
}

.horizon-tabs button.active {
  background: var(--p-surface-card, var(--p-content-background));
  color: var(--p-text-color);
  font-weight: 600;
}

.card-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr 1fr;
  gap: 0.75rem;
}

@media (max-width: 899px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem 1rem;
  background: var(--p-content-background, var(--p-surface-card));
  border: 1px solid var(--p-content-border-color, var(--p-surface-border));
  border-radius: 6px;
}

.card-primary {
  border-left: 3px solid var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 6%, var(--p-content-background, var(--p-surface-card)));
}

.card-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--p-text-muted-color);
}

.card-primary-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--p-text-color);
  line-height: 1.3;
}

.card-primary-empty {
  font-weight: 500;
  color: var(--p-text-muted-color);
}

.card-primary-subtitle {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
}

.card-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--p-text-color);
  line-height: 1;
}

.card-subtitle {
  font-size: 0.7rem;
  color: var(--p-text-muted-color);
}
</style>
