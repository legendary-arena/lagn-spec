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
}

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
