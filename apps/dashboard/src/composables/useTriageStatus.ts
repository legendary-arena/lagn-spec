import { computed, type ComputedRef } from 'vue';
import type { ApiError, ServiceResponse } from '../types/index.js';
import type {
  HandoffLatestData,
  HandoffRecord,
  HandoffStatusCounts,
  InspectionLatestData,
  InspectionReportSummary,
} from '../types/triage.js';
import type { PipelineItem, TriageProjection } from './useAgentPipeline.js';

// ============================================================================
// WP-239 / EC-270 — Triage projection composable.
//
// Pure projection of the two triage fetch states into a `TriageProjection` for
// the Pipeline Inspector lane. Mirrors `useSweepHealth` (resolved-fetch-state
// input + `currentTimeMs` parameter + 4-arm state machine). The projection
// type itself lives with its consumer in `useAgentPipeline.ts` (D-23901) to
// avoid a circular type import; this composable imports it type-only.
// ============================================================================

/** The locked meta tag carried by every injected triage lane item. */
const TRIAGE_META = 'Triage';

/** Max characters of a finding/amendment string shown in a lane item label. */
const DESCRIPTION_MAX_LENGTH = 100;
const AMENDMENT_MAX_LENGTH = 80;

/**
 * Resolved fetch state for `GET /api/inspection/latest`. `response` is the
 * `ServiceResponse` envelope once resolved, or `null` while loading; `error` is
 * non-null only on failure. Keeping loading / error / data in one value is what
 * lets the composable be a pure function of its inputs (mirrors
 * `SweepHealthFetchState`).
 */
export interface InspectionTriageFetchState {
  readonly response: ServiceResponse<InspectionLatestData> | null;
  readonly error: ApiError | null;
}

/**
 * Resolved fetch state for `GET /api/handoffs/latest`.
 */
export interface HandoffChainFetchState {
  readonly response: ServiceResponse<HandoffLatestData> | null;
  readonly error: ApiError | null;
}

/**
 * Truncate a string to `maxLength` characters, appending an ellipsis when cut.
 * Keeps long LLM-generated finding descriptions legible inside a narrow lane.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

/**
 * A non-data projection (loading / empty / error). Coherence defaults to
 * `'coherent'` and all item buckets + the distribution are empty.
 */
function emptyProjection(state: TriageProjection['state']): TriageProjection {
  return {
    state,
    coherence: 'coherent',
    summary: null,
    backlog: [],
    active: [],
    history: [],
    distribution: null,
  };
}

/**
 * Build the verdict + P0/P1/P2 summary item that leads the Inspector backlog.
 */
function buildSummaryItem(report: InspectionReportSummary): PipelineItem {
  const { p0, p1, p2 } = report.counts;
  return {
    id: `triage-summary-${report.reportId}`,
    label: `Inspection ${report.verdict} — P0 ${p0} · P1 ${p1} · P2 ${p2}`,
    meta: TRIAGE_META,
  };
}

/**
 * Build the handoff-stale marker shown when the handoff lifecycle's report id
 * lags the latest inspection report (normal inspection-submit/handoffs-sync
 * lag). Names both report ids so the operator sees the skew is transient.
 */
function buildCoherenceMarker(reportId: string, handoffReportId: string | null): PipelineItem {
  const syncedFor = handoffReportId ?? 'none yet';
  return {
    id: `triage-coherence-${reportId}`,
    label: `Handoff lifecycle pending sync — showing inspection report ${reportId}; handoffs last synced for ${syncedFor}`,
    meta: TRIAGE_META,
  };
}

/**
 * Build one lifecycle item from a handoff row. `branchRef` is shown for
 * `fix-proposed`; `amendmentRequest` for `escalated`.
 */
function buildHandoffItem(handoff: HandoffRecord): PipelineItem {
  const shortDescription = truncate(handoff.description, DESCRIPTION_MAX_LENGTH);
  let label = `${handoff.severity} · ${handoff.status} — ${shortDescription} (${handoff.route})`;
  if (handoff.status === 'fix-proposed' && handoff.branchRef !== null) {
    label = `${label} · branch ${handoff.branchRef}`;
  } else if (handoff.status === 'escalated' && handoff.amendmentRequest !== null) {
    label = `${label} · ask: ${truncate(handoff.amendmentRequest, AMENDMENT_MAX_LENGTH)}`;
  }
  return {
    id: `triage-handoff-${handoff.handoffId}`,
    label,
    meta: TRIAGE_META,
  };
}

/**
 * Read the six status counts defensively. The fetcher's object guard validates
 * that `counts` is an object but not its keys, so a partial counts object from a
 * stale server deploy is possible at runtime despite the type.
 */
function readDistribution(counts: Partial<HandoffStatusCounts>): HandoffStatusCounts {
  // why: each key is read with `?? 0` so a missing key renders 0, never
  // `undefined` — mirrors `computeSweepHealthRate`'s defensive numeric reads.
  // There is deliberately NO hard "partial counts → error" gate that would
  // blank the whole surface on one missing key.
  return {
    open: counts.open ?? 0,
    claimed: counts.claimed ?? 0,
    fixProposed: counts.fixProposed ?? 0,
    escalated: counts.escalated ?? 0,
    resolved: counts.resolved ?? 0,
    wontFix: counts.wontFix ?? 0,
  };
}

/**
 * Derive the Inspector-lane triage projection from the two resolved fetch
 * states. Returns a `ComputedRef<TriageProjection>`; the page samples `.value`
 * once and injects it into `useAgentPipeline` (mirroring the sweep projection).
 *
 * State precedence mirrors `useSweepHealth.state`: `error` (either fetch
 * failed) → `loading` (either unresolved) → `empty` (`inspection.latest ===
 * null` only) → `data`.
 */
export function useTriageStatus(
  inspectionStateGetter: () => InspectionTriageFetchState,
  handoffStateGetter: () => HandoffChainFetchState,
  // why (WP-204 wall-clock discipline): `currentTimeMs` is passed in (sampled
  // once at the page render boundary) rather than read via Date.now() inside the
  // composable, so the projection is a pure function of its inputs and the
  // wall-clock-independence test can pin every arm deterministically. v1 has no
  // time-relative derivation (handoff aging is deferred — §Future Work), so the
  // value is intentionally not read here; the parameter preserves the discipline
  // and keeps the signature ready for when aging lands.
  currentTimeMs: number,
): ComputedRef<TriageProjection> {
  void currentTimeMs;

  return computed<TriageProjection>(() => {
    const inspectionState = inspectionStateGetter();
    const handoffState = handoffStateGetter();

    if (inspectionState.error !== null || handoffState.error !== null) {
      return emptyProjection('error');
    }
    if (inspectionState.response === null || handoffState.response === null) {
      return emptyProjection('loading');
    }

    const inspectionData = inspectionState.response.data;
    const handoffData = handoffState.response.data;
    const latest = inspectionData.latest;
    // why: 'empty' fires ONLY when no inspection report exists. A PASS report
    // with zero findings / zero handoffs is the healthy 'data' case (green
    // verdict, empty buckets) — never hidden.
    if (latest === null) {
      return emptyProjection('empty');
    }

    // why (D-23902): the inspection and handoff endpoints are fed by separate CI
    // steps (inspection-submit vs handoffs-sync), so a reportId skew is the
    // normal sync-lag window, NOT corruption. It degrades to a 'handoff-stale'
    // marker with the surface still rendered — never a fetch error, never a
    // blank lane (which would hide a freshly-submitted report's findings).
    const isCoherent =
      handoffData.reportId !== null && handoffData.reportId === latest.reportId;
    const coherence: TriageProjection['coherence'] = isCoherent ? 'coherent' : 'handoff-stale';

    const backlog: PipelineItem[] = [];
    const active: PipelineItem[] = [];
    const history: PipelineItem[] = [];

    backlog.push(buildSummaryItem(latest));
    if (coherence === 'handoff-stale') {
      backlog.push(buildCoherenceMarker(latest.reportId, handoffData.reportId));
    }

    // why: handoffs arrive pre-ordered (findingIndex ASC, handoffId ASC) from
    // the server; this loop preserves that received order and never re-orders
    // the rows (determinism + Vue-key stability). Explicit for…of — no reduce.
    for (const handoff of handoffData.handoffs) {
      const item = buildHandoffItem(handoff);
      if (handoff.status === 'open' || handoff.status === 'claimed') {
        backlog.push(item);
      } else if (handoff.status === 'fix-proposed' || handoff.status === 'escalated') {
        active.push(item);
      } else {
        // resolved | wont-fix (terminal)
        history.push(item);
      }
    }

    return {
      state: 'data',
      coherence,
      summary: {
        verdict: latest.verdict,
        counts: { p0: latest.counts.p0, p1: latest.counts.p1, p2: latest.counts.p2 },
      },
      backlog,
      active,
      history,
      distribution: readDistribution(handoffData.counts),
    };
  });
}
