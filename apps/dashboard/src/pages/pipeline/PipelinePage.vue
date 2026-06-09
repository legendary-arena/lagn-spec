<script setup lang="ts">
import { computed } from 'vue';
import { useGovernanceSnapshot } from '../../composables/useGovernanceSnapshot.js';
import { useAgentPipeline, type PipelineLane } from '../../composables/useAgentPipeline.js';

const snapshot = useGovernanceSnapshot();
const pipeline = useAgentPipeline();

const lanes = computed<readonly PipelineLane[]>(() => [
  pipeline.architect,
  pipeline.builder,
  pipeline.inspector,
  pipeline.evaluator,
]);

type PageState = 'loading' | 'error' | 'empty' | 'data';

const state = computed<PageState>(() => {
  if (snapshot.loadError) {
    return 'error';
  }
  let totalItems = 0;
  for (const lane of lanes.value) {
    totalItems += lane.items.length;
  }
  if (totalItems === 0) {
    return 'empty';
  }
  return 'data';
});
</script>

<template>
  <div class="pipeline-page">
    <header class="pipeline-header">
      <h2>Pipeline</h2>
      <p class="pipeline-subtitle">Architect → Builder → Inspector → Evaluator</p>
    </header>

    <div v-if="state === 'loading'" class="pipeline-loading" aria-hidden="true">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </div>

    <div v-else-if="state === 'error'" class="pipeline-error" role="alert">
      <p>
        The governance snapshot could not be loaded. Re-run
        <code>pnpm dash:build</code> or inspect the build logs for the underlying cause.
      </p>
    </div>

    <div v-else-if="state === 'empty'" class="pipeline-empty">
      <p>No pipeline activity to display.</p>
    </div>

    <div v-else class="pipeline-lanes">
      <article
        v-for="lane in lanes"
        :key="lane.title"
        class="lane-card"
        :aria-label="`${lane.title} lane`"
      >
        <h3 class="lane-title">{{ lane.title }}</h3>

        <ul v-if="lane.items.length > 0" class="lane-items">
          <li v-for="item in lane.items" :key="item.id" class="lane-item">
            <span class="item-label">{{ item.label }}</span>
            <span v-if="item.meta" class="item-meta">{{ item.meta }}</span>
          </li>
        </ul>

        <p v-else class="lane-empty">{{ lane.emptyMessage }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.pipeline-page {
  max-width: 1400px;
}

.pipeline-header {
  margin-bottom: 1.5rem;
}

.pipeline-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--p-text-color);
}

.pipeline-subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.pipeline-loading {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.pipeline-loading .skeleton-row {
  height: 120px;
  background: var(--p-surface-border, var(--p-content-border-color));
  border-radius: 8px;
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

.pipeline-error {
  background: var(--p-surface-card, var(--p-content-background));
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  border-radius: 8px;
  padding: 1.25rem;
  color: var(--p-text-color);
  font-size: 0.85rem;
}

.pipeline-error code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
  background: var(--p-content-border-color);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
}

.pipeline-empty {
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
}

.pipeline-lanes {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

@media (max-width: 1099px) {
  .pipeline-lanes {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 599px) {
  .pipeline-lanes {
    grid-template-columns: 1fr;
  }
}

.lane-card {
  background: var(--p-surface-card, var(--p-content-background));
  border: 1px solid var(--p-surface-border, var(--p-content-border-color));
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
}

.lane-title {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--p-text-muted-color);
}

.lane-items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.lane-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  background: var(--p-content-background, var(--p-surface-card));
  border: 1px solid var(--p-content-border-color, var(--p-surface-border));
  border-radius: 6px;
  font-size: 0.8rem;
  color: var(--p-text-color);
  line-height: 1.35;
}

.item-label {
  flex: 1;
  word-break: break-word;
}

.item-meta {
  flex-shrink: 0;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  background: var(--p-surface-border, var(--p-content-border-color));
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.lane-empty {
  margin: 0;
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}
</style>
