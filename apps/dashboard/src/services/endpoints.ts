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
} from './mocks.js';
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
