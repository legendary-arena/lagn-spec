import '../testing/jsdom-setup';

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import {
  DIAGNOSTIC_BUFFER_CAP,
  installDiagnosticCapture,
  getDiagnosticEntries,
  getDroppedEntryCount,
  resetDiagnosticCaptureForTesting,
  redactCredentialsFromUrl,
  buildDiagnosticReport,
  serializeDiagnosticReport,
  buildDiagnosticFileName,
  type DiagnosticContext,
  type DiagnosticEntry,
} from './diagnostics';
import DiagnosticExportButton from '../components/DiagnosticExportButton.vue';

/**
 * Builds a fully-populated context with overridable fields for the pure-builder
 * tests. `entryDroppedCount` defaults to 0 (no truncation).
 */
function sampleContext(
  overrides: Partial<DiagnosticContext> = {},
): DiagnosticContext {
  return {
    appVersion: '1.2.3',
    gitSha: 'abc1234',
    buildTimestamp: '2026-06-08T00:00:00.000Z',
    capturedAtIso: '2026-06-08T12:00:00.000Z',
    locationHref: 'http://localhost/play?match=room-7',
    matchId: 'room-7',
    playerId: '0',
    userAgent: 'test-agent',
    viewportWidth: 1024,
    viewportHeight: 768,
    entryDroppedCount: 0,
    // why: DiagnosticContext now requires uiStateSnapshot; the helper defaults
    // it to null (the no-active-match case) so existing builder cases stay
    // unchanged, and snapshot-specific cases override it explicitly.
    uiStateSnapshot: null,
    // why: DiagnosticContext now requires matchSetup; defaults to null (no setup
    // persisted) so existing builder cases stay unchanged, and the matchSetup
    // case overrides it explicitly.
    matchSetup: null,
    ...overrides,
  };
}

/**
 * Builds a single console-kind entry for shape/serialization tests.
 */
function sampleEntry(sequence: number): DiagnosticEntry {
  return {
    sequence,
    kind: 'console',
    level: 'log',
    message: `entry-${sequence}`,
    stack: null,
    atMs: 1000 + sequence,
  };
}

/**
 * Dispatches a synthetic `window` `'error'` event carrying the given message
 * and optional error, using a plain Event so the test does not depend on the
 * jsdom `ErrorEvent` constructor surface.
 */
function dispatchWindowError(message: string, error: Error | null): void {
  const event = new window.Event('error') as Event & {
    message?: string;
    error?: Error | null;
  };
  event.message = message;
  event.error = error;
  window.dispatchEvent(event);
}

/**
 * Dispatches a synthetic `'unhandledrejection'` event carrying the given
 * reason, using a plain Event so the test does not depend on the jsdom
 * `PromiseRejectionEvent` constructor surface.
 */
function dispatchUnhandledRejection(reason: unknown): void {
  const event = new window.Event('unhandledrejection') as Event & {
    reason?: unknown;
  };
  event.reason = reason;
  window.dispatchEvent(event);
}

describe('diagnostics — pure redaction + report builders', () => {
  test('should_redact_credentials_value_and_keep_match_and_player_when_url_has_all_three', () => {
    const redacted = redactCredentialsFromUrl(
      'http://localhost/play?match=room-7&player=0&credentials=SECRET-123',
    );
    assert.match(redacted, /credentials=\*\*\*redacted\*\*\*/);
    assert.equal(redacted.includes('SECRET-123'), false);
    assert.match(redacted, /match=room-7/);
    assert.match(redacted, /player=0/);
  });

  test('should_return_href_unchanged_when_no_credentials_param_present', () => {
    const href = 'http://localhost/play?match=room-7&player=0';
    assert.equal(redactCredentialsFromUrl(href), href);
  });

  test('should_serialize_a_report_with_no_secret_and_a_redacted_token_when_url_carries_credentials', () => {
    const secret = 'TOP-SECRET-CREDENTIAL-VALUE';
    const redactedHref = redactCredentialsFromUrl(
      `http://localhost/play?match=room-7&credentials=${secret}`,
    );
    const report = buildDiagnosticReport(
      [],
      sampleContext({ locationHref: redactedHref }),
    );
    const serialized = serializeDiagnosticReport(report);
    assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes('***redacted***'), true);
  });

  test('should_set_entryCount_and_truncated_false_when_building_report_under_cap', () => {
    const entries = [sampleEntry(0), sampleEntry(1)];
    const report = buildDiagnosticReport(entries, sampleContext());
    assert.equal(report.entryCount, 2);
    assert.equal(report.entryDroppedCount, 0);
    assert.equal(report.truncated, false);
    assert.equal(report.appVersion, '1.2.3');
    assert.equal(report.matchId, 'room-7');
    assert.equal(report.entries.length, 2);
  });

  test('should_set_truncated_true_when_context_reports_dropped_entries', () => {
    const report = buildDiagnosticReport(
      [sampleEntry(0)],
      sampleContext({ entryDroppedCount: 5 }),
    );
    assert.equal(report.truncated, true);
    assert.equal(report.entryDroppedCount, 5);
  });

  test('should_round_trip_via_json_parse_when_report_serialized', () => {
    const report = buildDiagnosticReport([sampleEntry(0)], sampleContext());
    const serialized = serializeDiagnosticReport(report);
    assert.match(serialized, /\n {2}"appVersion"/);
    assert.deepEqual(JSON.parse(serialized), report);
  });

  test('should_use_match_segment_when_match_id_present', () => {
    assert.equal(
      buildDiagnosticFileName('room-7', 1717848000000),
      'legendary-arena-diagnostics-room-7-1717848000000.json',
    );
  });

  test('should_use_no_match_and_sanitize_slashes_when_match_id_absent_or_pathlike', () => {
    assert.equal(
      buildDiagnosticFileName(null, 42),
      'legendary-arena-diagnostics-no-match-42.json',
    );
    assert.equal(
      buildDiagnosticFileName('a/b\\c', 42),
      'legendary-arena-diagnostics-a-b-c-42.json',
    );
  });

  test('should_carry_snapshot_by_reference_and_round_trip_deep_equal_when_snapshot_present', () => {
    const snapshot = {
      currentStage: 'main',
      pendingKoHeroChoice: null,
      zones: { villain: 3, hq: 5 },
      notableEvents: ['villainEscaped'],
    };
    const report = buildDiagnosticReport(
      [],
      sampleContext({ uiStateSnapshot: snapshot }),
    );
    // The exact reference comes back — proving no clone, field filter, or
    // transformation between context and report.
    assert.strictEqual(report.uiStateSnapshot, snapshot);
    const roundTripped = JSON.parse(serializeDiagnosticReport(report));
    assert.deepEqual(roundTripped.uiStateSnapshot, snapshot);
  });

  test('should_serialize_uiStateSnapshot_null_when_no_match_active', () => {
    const report = buildDiagnosticReport(
      [],
      sampleContext({ uiStateSnapshot: null }),
    );
    assert.strictEqual(report.uiStateSnapshot, null);
    const serialized = serializeDiagnosticReport(report);
    assert.match(serialized, /"uiStateSnapshot": null/);
    assert.strictEqual(JSON.parse(serialized).uiStateSnapshot, null);
  });

  test('should_carry_matchSetup_through_and_round_trip_when_present', () => {
    const matchSetup = {
      schemeId: 'core/midtown-bank-robbery',
      bystandersCount: 1,
      woundsCount: 30,
      officersCount: 5,
      sidekicksCount: 12,
    };
    const report = buildDiagnosticReport(
      [],
      sampleContext({ matchSetup }),
    );
    // The exact reference comes back — proving no clone or transformation between
    // context and report (same posture as uiStateSnapshot).
    assert.strictEqual(report.matchSetup, matchSetup);
    const roundTripped = JSON.parse(serializeDiagnosticReport(report));
    assert.deepEqual(roundTripped.matchSetup, matchSetup);
  });

  test('should_serialize_matchSetup_null_when_none_persisted', () => {
    const report = buildDiagnosticReport([], sampleContext({ matchSetup: null }));
    assert.strictEqual(report.matchSetup, null);
    assert.strictEqual(
      JSON.parse(serializeDiagnosticReport(report)).matchSetup,
      null,
    );
  });

  test('should_pass_frozen_snapshot_through_unmodified_when_builder_runs', () => {
    const frozenSnapshot = Object.freeze({
      currentStage: 'cleanup',
      pendingHeroChoice: null,
      mastermind: 'mastermind.loki',
    });
    // A frozen sentinel would throw on any mutation; the builder reads no
    // ambient global and assigns the reference straight through.
    assert.equal(Object.isFrozen(frozenSnapshot), true);
    const report = buildDiagnosticReport(
      [sampleEntry(0)],
      sampleContext({ uiStateSnapshot: frozenSnapshot }),
    );
    assert.strictEqual(report.uiStateSnapshot, frozenSnapshot);
    const roundTripped = JSON.parse(serializeDiagnosticReport(report));
    assert.deepEqual(roundTripped.uiStateSnapshot, frozenSnapshot);
  });

  test('should_redact_credentials_and_omit_secret_when_report_has_snapshot', () => {
    const secret = 'SNAPSHOT-CASE-SECRET-7777';
    const redactedHref = redactCredentialsFromUrl(
      `http://localhost/play?match=room-9&credentials=${secret}`,
    );
    const snapshot = { currentStage: 'main', zones: { hand: 6 } };
    const report = buildDiagnosticReport(
      [],
      sampleContext({ locationHref: redactedHref, uiStateSnapshot: snapshot }),
    );
    const serialized = serializeDiagnosticReport(report);
    assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes('***redacted***'), true);
  });
});

describe('diagnostics — console + window capture', () => {
  afterEach(() => {
    resetDiagnosticCaptureForTesting();
  });

  test('should_record_entry_and_call_original_when_console_method_wrapped', () => {
    const recorded: unknown[][] = [];
    const realInfo = console.info;
    // Install a recorder as the pre-existing console.info so the wrap saves and
    // calls through to it, proving pass-through.
    console.info = (...args: unknown[]): void => {
      recorded.push(args);
    };
    try {
      installDiagnosticCapture();
      console.info('hello', 42);
      assert.equal(recorded.length, 1);
      assert.deepEqual(recorded[0], ['hello', 42]);
      const entries = getDiagnosticEntries();
      assert.equal(entries.length, 1);
      assert.equal(entries[0]!.kind, 'console');
      assert.equal(entries[0]!.level, 'info');
      assert.equal(entries[0]!.message, 'hello 42');
      assert.equal(entries[0]!.stack, null);
    } finally {
      resetDiagnosticCaptureForTesting();
      console.info = realInfo;
    }
  });

  test('should_use_error_message_and_stack_when_console_called_with_error_argument', () => {
    installDiagnosticCapture();
    const boom = new Error('detonation');
    console.error('prefix that is dropped', boom);
    const entries = getDiagnosticEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.message, 'detonation');
    assert.equal(entries[0]!.stack, boom.stack ?? null);
  });

  test('should_prefer_event_error_over_event_message_when_window_error_has_error', () => {
    installDiagnosticCapture();
    const realError = new Error('real-error-message');
    dispatchWindowError('synthetic-message', realError);
    const entries = getDiagnosticEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.kind, 'error');
    assert.equal(entries[0]!.level, null);
    assert.equal(entries[0]!.message, 'real-error-message');
    assert.equal(entries[0]!.stack, realError.stack ?? null);
  });

  test('should_fall_back_to_event_message_when_window_error_has_no_error', () => {
    installDiagnosticCapture();
    dispatchWindowError('script error only', null);
    const entries = getDiagnosticEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.message, 'script error only');
    assert.equal(entries[0]!.stack, null);
  });

  test('should_capture_unhandledrejection_with_reason_message_when_reason_is_error', () => {
    installDiagnosticCapture();
    const reason = new Error('rejected-with-error');
    dispatchUnhandledRejection(reason);
    const entries = getDiagnosticEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.kind, 'unhandledrejection');
    assert.equal(entries[0]!.message, 'rejected-with-error');
    assert.equal(entries[0]!.stack, reason.stack ?? null);
  });

  test('should_stringify_reason_when_unhandledrejection_reason_is_not_error', () => {
    installDiagnosticCapture();
    dispatchUnhandledRejection('plain string reason');
    const entries = getDiagnosticEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.message, 'plain string reason');
    assert.equal(entries[0]!.stack, null);
  });

  test('should_assign_increasing_sequence_and_return_oldest_to_newest_when_multiple_captured', () => {
    installDiagnosticCapture();
    console.log('first');
    console.warn('second');
    console.error('third');
    const entries = getDiagnosticEntries();
    assert.equal(entries.length, 3);
    assert.deepEqual(
      entries.map((entry) => entry.sequence),
      [0, 1, 2],
    );
    assert.deepEqual(
      entries.map((entry) => entry.message),
      ['first', 'second', 'third'],
    );
  });

  test('should_drop_oldest_and_set_dropped_count_when_buffer_exceeds_cap', () => {
    installDiagnosticCapture();
    const overflow = DIAGNOSTIC_BUFFER_CAP + 5;
    for (let index = 0; index < overflow; index += 1) {
      console.log(`message-${index}`);
    }
    const entries = getDiagnosticEntries();
    assert.equal(entries.length, DIAGNOSTIC_BUFFER_CAP);
    assert.equal(getDroppedEntryCount(), 5);
    // The five oldest (message-0..4) were dropped; the buffer now starts at 5.
    assert.equal(entries[0]!.message, 'message-5');
    const report = buildDiagnosticReport(entries, sampleContext({
      entryDroppedCount: getDroppedEntryCount(),
    }));
    assert.equal(report.truncated, true);
    assert.equal(report.entryCount, DIAGNOSTIC_BUFFER_CAP);
  });

  test('should_noop_and_record_single_entry_when_install_called_twice', () => {
    installDiagnosticCapture();
    installDiagnosticCapture();
    console.log('only once');
    const entries = getDiagnosticEntries();
    assert.equal(entries.length, 1);
  });

  test('should_restore_console_and_reset_sequence_when_reset_called', () => {
    const realLog = console.log;
    installDiagnosticCapture();
    assert.notEqual(console.log, realLog);
    console.log('captured-before-reset');
    assert.equal(getDiagnosticEntries().length, 1);

    resetDiagnosticCaptureForTesting();
    assert.equal(console.log, realLog);
    assert.equal(getDiagnosticEntries().length, 0);
    assert.equal(getDroppedEntryCount(), 0);

    // A fresh install starts sequence at 0 again.
    installDiagnosticCapture();
    console.log('after-reset');
    const entries = getDiagnosticEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.sequence, 0);
  });
});

describe('DiagnosticExportButton — render + export', () => {
  beforeEach(() => {
    // why: collectContext now reads the UIState store on the click path, which
    // requires an active Pinia; matches the sibling component tests' setup.
    setActivePinia(createPinia());
  });

  test('should_render_download_diagnostics_button_when_mounted', () => {
    const wrapper = mount(DiagnosticExportButton);
    const button = wrapper.find('[data-testid="diagnostic-export-button"]');
    assert.equal(button.exists(), true);
    assert.equal(button.text(), 'Download diagnostics');
  });

  test('should_download_redacted_report_and_copy_to_clipboard_when_clicked', async () => {
    const secret = 'CLICK-SECRET-9999';
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const originalAnchorClick = window.HTMLAnchorElement.prototype.click;
    const originalSearch = window.location.search;
    let downloadedName = '';
    let copiedPayload = '';

    URL.createObjectURL = (): string => 'blob:diagnostic-fake';
    URL.revokeObjectURL = (): void => {};
    window.HTMLAnchorElement.prototype.click = function recordingClick(
      this: HTMLAnchorElement,
    ): void {
      downloadedName = this.download;
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string): Promise<void> => {
          copiedPayload = text;
        },
      },
    });
    window.history.replaceState(
      null,
      '',
      `/play?match=room-42&player=1&credentials=${secret}`,
    );

    try {
      const wrapper = mount(DiagnosticExportButton);
      await wrapper
        .find('[data-testid="diagnostic-export-button"]')
        .trigger('click');
      await flushPromises();

      assert.match(
        downloadedName,
        /^legendary-arena-diagnostics-room-42-\d+\.json$/,
      );
      assert.equal(copiedPayload.includes(secret), false);
      assert.equal(copiedPayload.includes('***redacted***'), true);
      const parsed = JSON.parse(copiedPayload);
      assert.equal(parsed.matchId, 'room-42');
      assert.equal(parsed.playerId, '1');
    } finally {
      URL.createObjectURL = originalCreateObjectUrl;
      URL.revokeObjectURL = originalRevokeObjectUrl;
      window.HTMLAnchorElement.prototype.click = originalAnchorClick;
      delete (navigator as { clipboard?: unknown }).clipboard;
      window.history.replaceState(null, '', originalSearch || '/');
    }
  });
});
