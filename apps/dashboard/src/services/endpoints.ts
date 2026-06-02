import { apiClient } from './api.js';
import {
  mockKpiSnapshots,
  mockPlayerRecords,
  mockMatchRecords,
  mockRevenueRecords,
  mockDauHistory,
  mockRevenueHistory,
  mockAlerts,
  mockServerNodes,
  mockBillingHealth,
  mockBillingHealthSparklines,
} from './mocks.js';
import type { BillingHealthSparklines } from './billingHealthMocks.js';
import { normalizeRange } from './normalizeRange.js';
import type {
  ServiceResponse,
  KpiSnapshot,
  PlayerRecord,
  MatchRecord,
  RevenueRecord,
  DailyMetric,
  AlertItem,
  ServerNode,
  DateRange,
  BillingHealth,
} from '../types/index.js';

const DATE_RANGE_DAYS: Record<DateRange, number> = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
};

function isMockMode(): boolean {
  return import.meta.env.VITE_USE_MOCKS === 'true';
}

function simulateLatency(): Promise<void> {
  const delay = Math.floor(Math.random() * 400) + 100;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export async function fetchKpiSnapshots(): Promise<ServiceResponse<KpiSnapshot[]>> {
  if (isMockMode()) {
    await simulateLatency();
    return mockKpiSnapshots();
  }
  const response = await apiClient.get<ServiceResponse<KpiSnapshot[]>>('/kpis');
  return response.data;
}

export async function fetchPlayerRecords(): Promise<ServiceResponse<PlayerRecord[]>> {
  if (isMockMode()) {
    await simulateLatency();
    return mockPlayerRecords();
  }
  const response = await apiClient.get<ServiceResponse<PlayerRecord[]>>('/players');
  return response.data;
}

export async function fetchMatchRecords(): Promise<ServiceResponse<MatchRecord[]>> {
  if (isMockMode()) {
    await simulateLatency();
    return mockMatchRecords();
  }
  const response = await apiClient.get<ServiceResponse<MatchRecord[]>>('/matches');
  return response.data;
}

export async function fetchRevenueRecords(): Promise<ServiceResponse<RevenueRecord[]>> {
  if (isMockMode()) {
    await simulateLatency();
    return mockRevenueRecords();
  }
  const response = await apiClient.get<ServiceResponse<RevenueRecord[]>>('/revenue');
  return response.data;
}

export async function fetchDauHistory(range: DateRange): Promise<ServiceResponse<DailyMetric[]>> {
  if (isMockMode()) {
    await simulateLatency();
    return mockDauHistory(DATE_RANGE_DAYS[range]);
  }
  const response = await apiClient.get<ServiceResponse<DailyMetric[]>>('/metrics/dau', {
    params: { range },
  });
  return response.data;
}

export async function fetchRevenueHistory(range: DateRange): Promise<ServiceResponse<DailyMetric[]>> {
  if (isMockMode()) {
    await simulateLatency();
    return mockRevenueHistory(DATE_RANGE_DAYS[range]);
  }
  const response = await apiClient.get<ServiceResponse<DailyMetric[]>>('/metrics/revenue', {
    params: { range },
  });
  return response.data;
}

export async function fetchAlerts(): Promise<ServiceResponse<AlertItem[]>> {
  if (isMockMode()) {
    await simulateLatency();
    return mockAlerts();
  }
  const response = await apiClient.get<ServiceResponse<AlertItem[]>>('/alerts');
  return response.data;
}

export async function fetchServerNodes(): Promise<ServiceResponse<ServerNode[]>> {
  if (isMockMode()) {
    await simulateLatency();
    return mockServerNodes();
  }
  const response = await apiClient.get<ServiceResponse<ServerNode[]>>('/system/nodes');
  return response.data;
}

// why: D-19603 (Paid-Action Error Union + Forward Server Contract) —
// `/metrics/billing/health` is a future server-target path; the follow-up
// server-implementation WP owns the catalog row in
// `docs/ai/REFERENCE/api-endpoints.md`. The forward contract locks the
// response shape as byte-compatible with `BillingHealth`, the rate
// invariants (`0.0 ≤ rate ≤ 1.0`; `count = round(total × rate)`), and
// the `authenticated-session-required` + `finance`/`admin` role gate.
// This WP names the path so the server WP has zero schema ambiguity.
export async function fetchBillingHealth(range: DateRange): Promise<ServiceResponse<BillingHealth>> {
  // why: D-19605 (Mock Determinism Contract + DateRange Normalization
  // extension) — `normalizeRange` is invoked at the SERVICE BOUNDARY
  // before either the mock generator or a future HTTP call sees the
  // range. Widgets pass `range` through reactive refs that may carry
  // stale or non-canonical formats during transitions; normalizing here
  // means downstream code only sees `YYYY-MM-DD` strings under the
  // canonical form, and the hash-of-range seed used by the mock is
  // stable across calls / reloads / widgets.
  if (isMockMode()) {
    await simulateLatency();
    const nowMs = Date.now();
    void normalizeRange(range, nowMs);
    return mockBillingHealth(range, nowMs);
  }
  void normalizeRange(range, Date.now());
  const response = await apiClient.get<ServiceResponse<BillingHealth>>('/metrics/billing/health', {
    params: { range },
  });
  return response.data;
}

// why: D-19603 ext. (Billing Health Window Definition) — the forward
// `BillingHealth` wire shape is locked at 8 aggregate fields, so the
// 30 daily sparkline points required by the widget come from this
// parallel service function. Both `fetchBillingHealth` and this
// function share the same hash-of-range seed, so the aggregate rates
// in `BillingHealth` and the per-day rates in the sparkline are
// consistent within mock-determinism guarantees.
export async function fetchBillingHealthSparklines(
  range: DateRange,
): Promise<ServiceResponse<BillingHealthSparklines>> {
  if (isMockMode()) {
    await simulateLatency();
    const nowMs = Date.now();
    void normalizeRange(range, nowMs);
    return mockBillingHealthSparklines(range, nowMs);
  }
  void normalizeRange(range, Date.now());
  const response = await apiClient.get<ServiceResponse<BillingHealthSparklines>>(
    '/metrics/billing/health/sparklines',
    {
      params: { range },
    },
  );
  return response.data;
}
