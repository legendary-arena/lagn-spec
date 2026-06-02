export interface ServiceResponse<T> {
  data: T;
  updatedAt: number;
  source: 'LIVE' | 'CACHED' | 'MOCK';
}

export interface ApiError {
  message: string;
  code?: string;
  retryable?: boolean;
}

export type DateRange = '7d' | '14d' | '30d' | '90d';

export type UserRole = 'admin' | 'operator' | 'finance' | 'support';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
}

export interface KpiSnapshot {
  id: string;
  label: string;
  value: number;
  previousValue: number;
  unit: string;
  trend: 'up' | 'down' | 'flat';
  // why: D-19802 — `target` / `tolerance` / `direction` are all OPTIONAL so
  // existing KPIs without a threshold continue to type-check. A KPI rendering
  // a status chip MUST supply all three; absence of `target` is the explicit
  // opt-out signal (computeKpiStatus returns null and no chip is rendered).
  target?: number;
  tolerance?: number;
  direction?: 'higher-is-better' | 'lower-is-better';
}

export type KpiStatus = 'on-track' | 'off-track' | 'needs-attention';

/**
 * Canonical readonly array mirroring the `KpiStatus` union, drift-pinned via
 * a `node:test` assertion (see `utils/kpiStatus.test.ts`). Pattern mirrors
 * `MATCH_PHASES` / `TURN_STAGES` from `.claude/rules/code-style.md §Drift
 * Detection`. Adding a 4th status to the union without updating this array
 * (or vice versa) fails the drift test loudly.
 */
export const KPI_STATUSES: readonly KpiStatus[] = ['on-track', 'off-track', 'needs-attention'];

export interface PlayerRecord {
  id: string;
  name: string;
  email: string;
  matchesPlayed: number;
  winRate: number;
  lastActive: string;
  status: 'active' | 'inactive' | 'banned';
}

export interface MatchRecord {
  id: string;
  startedAt: string;
  duration: number;
  playerCount: number;
  scheme: string;
  mastermind: string;
  outcome: 'villain_wins' | 'hero_wins' | 'in_progress';
}

export interface RevenueRecord {
  id: string;
  date: string;
  amount: number;
  source: string;
  currency: string;
}

export interface DailyMetric {
  date: string;
  value: number;
}

export interface AlertItem {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface ServerNode {
  id: string;
  name: string;
  region: string;
  status: 'healthy' | 'degraded' | 'down';
  cpuPercent: number;
  memoryPercent: number;
  activeConnections: number;
  uptime: number;
}

export type WebSocketState = 'connected' | 'disconnected' | 'disabled';

export interface BillingHealth {
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly webhookFailureRate: number;
  readonly webhookFailureCount: number;
  readonly webhookTotalCount: number;
  readonly intentAbandonmentRate: number;
  readonly intentAbandonedCount: number;
  readonly intentTotalCount: number;
}

export interface NetRevenueSeries {
  readonly dates: readonly string[];
  readonly gross: readonly number[];
  readonly royalty: readonly number[];
  readonly stripeFees: readonly number[];
  readonly infraCogs: readonly number[];
  readonly net: readonly number[];
}
