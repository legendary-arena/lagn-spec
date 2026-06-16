<script setup lang="ts">
import { computed } from 'vue';
import { useBuildRoadmap, taskStateLabel } from '../../composables/useBuildRoadmap.js';
import type { TaskState } from '../../types/roadmap.js';

// why: the data is static, so the summary is computed once at setup against the
// real clock. Tests cover the pure logic directly (useBuildRoadmap.test.ts); the
// page is thin presentation over the composable.
const summary = useBuildRoadmap();

/** Maps a schedule state to its CSS modifier class for the colored badges/banner. */
function stateClass(state: TaskState): string {
  return `state-${state}`;
}

/** Headline message under the banner, derived from the overall state + counts. */
const bannerMessage = computed(() => {
  const counts = summary.value.counts;
  if (summary.value.overallState === 'overdue') {
    return `Behind schedule — ${counts.overdue} task(s) overdue. Finish the oldest first.`;
  }
  if (summary.value.overallState === 'due-soon') {
    return `On the clock — ${counts.dueSoon} task(s) due within 3 days.`;
  }
  if (summary.value.overallState === 'done') {
    return 'Every tracked task is complete.';
  }
  if (summary.value.overallState === 'blocked') {
    return 'Only blocked work remains — unblock to make progress.';
  }
  return 'On schedule — nothing is slipping.';
});
</script>

<template>
  <div class="vision-page">
    <header class="page-header">
      <h1>Vision &amp; Roadmap</h1>
      <p class="subtitle">
        The vision, and the tracked tasks that turn it into reality. Source of truth:
        <code>apps/dashboard/docs/build-vision-and-roadmap.md</code> (subordinate to
        <code>docs/01-VISION.md</code>).
      </p>
    </header>

    <section class="banner" :class="stateClass(summary.overallState)">
      <span class="banner-state">{{ taskStateLabel(summary.overallState) }}</span>
      <span class="banner-message">{{ bannerMessage }}</span>
    </section>

    <section class="counts">
      <div class="count-chip state-overdue">
        <span class="count-num">{{ summary.counts.overdue }}</span
        ><span>Overdue</span>
      </div>
      <div class="count-chip state-due-soon">
        <span class="count-num">{{ summary.counts.dueSoon }}</span
        ><span>Due soon</span>
      </div>
      <div class="count-chip state-on-track">
        <span class="count-num">{{ summary.counts.onTrack }}</span
        ><span>On track</span>
      </div>
      <div class="count-chip state-done">
        <span class="count-num">{{ summary.counts.done }}</span
        ><span>Done</span>
      </div>
      <div class="count-chip state-blocked">
        <span class="count-num">{{ summary.counts.blocked }}</span
        ><span>Blocked</span>
      </div>
    </section>

    <p class="vision-blurb">
      <strong>No sales = no business. No margin, no mission.</strong> Legendary Arena exists to make
      money so the people building it can keep building it — a faithful, fair, replay-verified
      Marvel Legendary that sends real royalties to Upper Deck and Marvel. This page exists to keep
      the unfinished 20% impossible to forget: every task below is Done, or it has a clock running.
    </p>

    <section v-for="workstream in summary.workstreams" :key="workstream.id" class="workstream">
      <div class="workstream-header">
        <h2>{{ workstream.label }}</h2>
        <span class="state-badge" :class="stateClass(workstream.state)">
          {{ taskStateLabel(workstream.state) }}
        </span>
      </div>
      <ul class="task-list">
        <li v-for="task in workstream.tasks" :key="task.id" class="task-row">
          <span class="state-badge" :class="stateClass(task.state)">
            {{ taskStateLabel(task.state) }}
          </span>
          <div class="task-body">
            <span class="task-title">{{ task.title }}</span>
            <span class="task-meta">
              {{ task.agent }} · target {{ task.targetDate ?? 'ongoing' }} ·
              <span class="task-done">Done = {{ task.doneDefinition }}</span>
            </span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.vision-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.page-header h1 {
  margin: 0 0 0.25rem;
  font-size: 1.5rem;
  color: var(--p-text-color);
}

.subtitle {
  margin: 0;
  font-size: 0.85rem;
  color: var(--p-text-muted-color);
}

.subtitle code {
  font-size: 0.78rem;
}

.banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.9rem 1.1rem;
  border-radius: 8px;
  border-left: 4px solid currentColor;
  background: var(--p-content-background);
}

.banner-state {
  font-weight: 700;
  text-transform: uppercase;
  font-size: 0.8rem;
  letter-spacing: 0.03em;
}

.banner-message {
  color: var(--p-text-color);
  font-size: 0.95rem;
}

.counts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.count-chip {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--p-content-border-color);
  font-size: 0.8rem;
  color: var(--p-text-muted-color);
}

.count-num {
  font-size: 1.1rem;
  font-weight: 700;
  color: currentColor;
}

.vision-blurb {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--p-text-muted-color);
}

.workstream {
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  padding: 1rem 1.25rem;
}

.workstream-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.workstream-header h2 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--p-text-color);
}

.task-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.task-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--p-content-border-color);
}

.task-list .task-row:first-child {
  border-top: none;
  padding-top: 0;
}

.task-body {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.task-title {
  font-size: 0.9rem;
  color: var(--p-text-color);
}

.task-meta {
  font-size: 0.78rem;
  color: var(--p-text-muted-color);
}

.task-done {
  font-style: italic;
}

.state-badge {
  flex-shrink: 0;
  align-self: flex-start;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  border: 1px solid currentColor;
  white-space: nowrap;
}

/* why: state colors use the PrimeVue Aura palette tokens with explicit hex
   fallbacks so the badges stay legible in both light and dark themes even if a
   token is unset. `currentColor` drives the borders/accents above. */
.state-overdue {
  color: var(--p-red-500, #ef4444);
}
.state-due-soon {
  color: var(--p-amber-500, #f59e0b);
}
.state-on-track {
  color: var(--p-blue-500, #3b82f6);
}
.state-done {
  color: var(--p-green-500, #22c55e);
}
.state-blocked {
  color: var(--p-surface-500, #6b7280);
}
</style>
