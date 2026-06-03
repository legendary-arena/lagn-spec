<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDateRange } from '../../composables/useDateRange.js';
import { useGovernanceSnapshot } from '../../composables/useGovernanceSnapshot.js';
import { useLastVisit } from '../../composables/useLastVisit.js';
import KpiCard from '../../widgets/KpiCard.vue';
import DauChartWidget from '../../widgets/DauChartWidget.vue';
import RevenueChartWidget from '../../widgets/RevenueChartWidget.vue';
import AlertsPanel from '../../widgets/AlertsPanel.vue';
import DailyExecutionPanel from '../../widgets/DailyExecutionPanel.vue';
import VisionCard from '../../widgets/VisionCard.vue';
import GovernanceThroughputWidget from '../../widgets/GovernanceThroughputWidget.vue';
import StatusFeedWidget from '../../widgets/StatusFeedWidget.vue';
import GovernanceKpiStrip from '../../widgets/GovernanceKpiStrip.vue';
import AcquisitionFunnelStripWidget from '../../widgets/AcquisitionFunnelStripWidget.vue';
import OpsAtAGlanceStripWidget from '../../widgets/OpsAtAGlanceStripWidget.vue';
import type { KpiSnapshot } from '../../types/index.js';

const router = useRouter();
const { range, setRange, validRanges } = useDateRange();

const governance = useGovernanceSnapshot();
const { lastVisit, markVisited } = useLastVisit();

// why: D-19910 — strict 4-step ordering at mount:
//   (1) snapshot the local lastVisit value at mount time,
//   (2) compute the diff counts against THAT local snapshot,
//   (3) render the since-you-last-looked line with the computed counts,
//   (4) ONLY THEN call markVisited().
// Steps (1) and (2) happen synchronously below by capturing
// `lastVisit.value` into `lastVisitSnapshotRef` BEFORE markVisited fires.
// Steps (3) and (4) are sequenced in onMounted — render is the template
// reading `lastVisitSnapshotRef`/`diffCounts`/`isFirstVisit`; the mount
// hook fires AFTER the first render frame so markVisited cannot zero out
// the diff for the operator's eye.
const lastVisitSnapshotRef = ref<string | null>(lastVisit.value);

const isFirstVisit = computed(() => lastVisitSnapshotRef.value === null);

const diffCounts = computed(() => {
  const anchor = lastVisitSnapshotRef.value;
  if (anchor === null) {
    return { newCommits: 0, newDecisions: 0, newStatusEntries: 0 };
  }
  const anchorDate = anchor.slice(0, 10);
  let newDecisions = 0;
  for (const decision of governance.decisions(50)) {
    if (decision.mtime > anchor) {
      newDecisions += 1;
    }
  }
  let newStatusEntries = 0;
  for (const entry of governance.statusEntries(50)) {
    if (entry.date > anchorDate) {
      newStatusEntries += 1;
    }
  }
  const commitsList = governance.commits(50);
  let newCommits = 0;
  // why: D-19903 + WP-198 §D — CommitEntry carries no timestamp (the activity
  // feed source is `git log --oneline` only). The since-you-last-looked
  // count for commits is therefore the count of commits whose sha is NOT
  // present in the operator's last-seen state. Without a per-sha record we
  // approximate: count is zero on same-build reloads (snapshot.generatedAt
  // equal to anchor → no rebuild → no new commits possible); when a new
  // build with a newer generatedAt loads, every commit in the snapshot is
  // a candidate "new" entry. Conservative: report count of commits when
  // generatedAt > anchor, else zero.
  if (governance.generatedAt > anchor) {
    newCommits = commitsList.length;
  }
  return { newCommits, newDecisions, newStatusEntries };
});

const sinceYouLastLookedLine = computed(() => {
  if (isFirstVisit.value) {
    if (governance.generatedAt === '') {
      return 'First visit — viewing the latest build snapshot.';
    }
    return `First visit — viewing snapshot from ${governance.generatedAt}.`;
  }
  const counts = diffCounts.value;
  return `Since you last looked: ${counts.newCommits} new commits, ${counts.newDecisions} new DECISIONS, ${counts.newStatusEntries} new STATUS entries.`;
});

onMounted(() => {
  // Step 4 of D-19910 — mark the visit AFTER first render. The render reads
  // `lastVisitSnapshotRef` + `diffCounts` + `isFirstVisit` (all captured
  // synchronously above), so writing the new value here cannot zero the
  // diff the operator sees on this load.
  if (governance.generatedAt !== '') {
    markVisited(governance.generatedAt);
  }
});

function handleKpiClick(kpi: KpiSnapshot): void {
  if (kpi.id === 'active-players') {
    router.push({ name: 'players' });
  } else if (kpi.id === 'revenue-today') {
    router.push({ name: 'monetization' });
  } else if (kpi.id === 'matches-running') {
    router.push({ name: 'gameplay' });
  } else if (kpi.id === 'server-health') {
    router.push({ name: 'system' });
  }
}
</script>

<template>
  <div class="overview-page">
    <VisionCard />

    <GovernanceKpiStrip />

    <div class="page-header">
      <h1>Overview</h1>
      <div class="range-selector">
        <button
          v-for="rangeOption in validRanges"
          :key="rangeOption"
          :class="{ active: range === rangeOption }"
          @click="setRange(rangeOption)"
        >
          {{ rangeOption }}
        </button>
      </div>
    </div>

    <p class="since-you-last-looked">{{ sinceYouLastLookedLine }}</p>

    <div class="kpi-grid">
      <KpiCard kpi-id="active-players" @click="handleKpiClick" />
      <KpiCard kpi-id="matches-running" @click="handleKpiClick" />
      <KpiCard kpi-id="revenue-today" @click="handleKpiClick" />
      <KpiCard kpi-id="server-health" @click="handleKpiClick" />
    </div>

    <DailyExecutionPanel />

    <div class="overview-governance-grid">
      <GovernanceThroughputWidget />
      <StatusFeedWidget />
    </div>

    <div class="charts-grid">
      <DauChartWidget />
      <RevenueChartWidget />
    </div>

    <!-- why: WP-203 §Scope (In) — the strip lands immediately after the
         DauChart row (engagement) so the operator's eye moves from
         engagement → acquisition pressure → alerts. Additive-only:
         no other Overview widget is removed, hidden, or relocated per
         the §Non-Negotiable Constraints rule. -->
    <AcquisitionFunnelStripWidget />

    <!-- why: WP-204 §Scope (In) — the ops strip lands immediately after
         the acquisition strip so all pre-mortem-grouped strips (revenue
         trend → acquisition → ops) sit in a vertical run. Additive-only:
         the existing AlertsPanel render below remains byte-identical
         apart from this single strip insertion. -->
    <OpsAtAGlanceStripWidget />

    <AlertsPanel />
  </div>
</template>

<style scoped>
.overview-page {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--p-text-color);
}

.range-selector {
  display: flex;
  gap: 0.25rem;
  background: var(--p-content-border-color);
  border-radius: 6px;
  padding: 0.2rem;
}

.range-selector button {
  padding: 0.4rem 0.75rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 0.8rem;
  cursor: pointer;
  color: var(--p-text-muted-color);
}

.range-selector button.active {
  background: var(--p-surface-card, var(--p-content-background));
  color: var(--p-text-color);
  font-weight: 600;
}

.since-you-last-looked {
  margin: -0.75rem 0 0;
  font-size: 0.78rem;
  color: var(--p-text-muted-color);
  font-style: italic;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.overview-governance-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1rem;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 1rem;
}

@media (max-width: 1199px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }

  .overview-governance-grid {
    grid-template-columns: 1fr;
  }

  .charts-grid {
    grid-template-columns: 1fr;
  }
}
</style>
