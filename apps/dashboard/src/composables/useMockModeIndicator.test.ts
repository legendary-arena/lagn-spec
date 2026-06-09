import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useMockModeIndicator } from './useMockModeIndicator.js';
import { __testHooks } from '../services/analyticsLiveFetchers.js';

// why: the dashboard test runner is `node --import tsx --test`, where Vite's
// build-time env object is undefined. The composable reads the LIVE gate only
// through analyticsLiveFetchers' isLiveModeEnabled(), whose env source is
// swappable via `__testHooks.setEnv()` — so the visibility truth table is
// driven here through that hook, never by touching the real env object.

// Re-typed here purely as the test oracle for the byte-for-byte assertion;
// the single runtime source of the copy remains useMockModeIndicator.ts.
const LOCKED_MESSAGE =
  'Mock data — this dashboard is showing sample metrics, not live data. To show real metrics, set VITE_USE_MOCKS=false and a valid VITE_API_BASE_URL in the deploy environment, then redeploy.';

beforeEach(() => {
  __testHooks.setEnv({ VITE_USE_MOCKS: 'false', VITE_API_BASE_URL: 'http://localhost:8080' });
});

afterEach(() => {
  __testHooks.setEnv(undefined);
});

test('should_report_mock_data_when_VITE_USE_MOCKS_is_true', () => {
  __testHooks.setEnv({ VITE_USE_MOCKS: 'true', VITE_API_BASE_URL: 'http://localhost:8080' });
  assert.equal(useMockModeIndicator().isMockData, true);
});

test('should_report_mock_data_when_VITE_API_BASE_URL_is_empty', () => {
  __testHooks.setEnv({ VITE_USE_MOCKS: 'false', VITE_API_BASE_URL: '' });
  assert.equal(useMockModeIndicator().isMockData, true);
});

test('should_report_mock_data_when_VITE_API_BASE_URL_is_unset', () => {
  __testHooks.setEnv({ VITE_USE_MOCKS: 'false' });
  assert.equal(useMockModeIndicator().isMockData, true);
});

test('should_report_live_data_when_both_live_conditions_hold', () => {
  __testHooks.setEnv({ VITE_USE_MOCKS: 'false', VITE_API_BASE_URL: 'http://localhost:8080' });
  assert.equal(useMockModeIndicator().isMockData, false);
});

test('should_return_the_locked_copy_string_when_message_is_read', () => {
  assert.equal(useMockModeIndicator().message, LOCKED_MESSAGE);
});

test('should_return_the_same_message_regardless_of_live_state', () => {
  __testHooks.setEnv({ VITE_USE_MOCKS: 'true' });
  const mockState = useMockModeIndicator();
  __testHooks.setEnv({ VITE_USE_MOCKS: 'false', VITE_API_BASE_URL: 'http://localhost:8080' });
  const liveState = useMockModeIndicator();
  assert.equal(mockState.message, liveState.message);
  assert.equal(liveState.message, LOCKED_MESSAGE);
});
