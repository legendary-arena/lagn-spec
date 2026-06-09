/**
 * Always-on, bounded, in-memory diagnostic capture for the arena client
 * (`play.legendary-arena.com`), plus the pure builders that turn the captured
 * buffer into a credential-redacted, shareable JSON report.
 *
 * The capture wraps `console.error/warn/info/log/debug` (always calling
 * through to the original method — never suppressing output) and registers
 * `window` `'error'` + `'unhandledrejection'` listeners, appending each event
 * to a ring buffer capped at {@link DIAGNOSTIC_BUFFER_CAP}. When the operator
 * hits a freeze, {@link DiagnosticExportButton} reads the live browser
 * context, builds a {@link DiagnosticReport} via the pure
 * {@link buildDiagnosticReport}, and downloads it.
 *
 * This module is pure browser code: it imports nothing from the engine,
 * registry, pre-planning, server, Postgres, or multiplayer-framework surfaces
 * (the boundary grep in EC-260 enforces this). The capture state is a single
 * module-level singleton per page load; the report has zero network egress and
 * is never persisted.
 *
 * Posture locked by WP-228 / EC-260 / D-22801.
 */

/**
 * One captured diagnostic event — a console call, an uncaught `window` error,
 * or an unhandled promise rejection.
 */
export interface DiagnosticEntry {
  /** Monotonically increasing, page-lifecycle-scoped; resets to 0 only on reset. */
  sequence: number;
  /** Which capture source produced this entry. */
  kind: 'console' | 'error' | 'unhandledrejection';
  /** The console level for `kind: 'console'`; `null` for error/rejection entries. */
  level: 'log' | 'info' | 'warn' | 'error' | 'debug' | null;
  /** The normalized message text (locked construction per WP-228). */
  message: string;
  /** The associated stack trace when one is available, else `null`. */
  stack: string | null;
  /** Wall-clock capture time in milliseconds. */
  atMs: number;
}

/**
 * The impure context an exporter collects from live browser globals and passes
 * into {@link buildDiagnosticReport}. `locationHref` MUST already be redacted
 * by the caller before it reaches the builder.
 */
export interface DiagnosticContext {
  appVersion: string;
  gitSha: string;
  buildTimestamp: string;
  capturedAtIso: string;
  /** Already credential-redacted by the caller. */
  locationHref: string;
  matchId: string | null;
  playerId: string | null;
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
  /** The current dropped-entry count, sourced from {@link getDroppedEntryCount}. */
  entryDroppedCount: number;
}

/**
 * The serializable report envelope: the scalar context fields plus the derived
 * `entryCount` / `truncated` plus the captured `entries`.
 */
export interface DiagnosticReport {
  appVersion: string;
  gitSha: string;
  buildTimestamp: string;
  capturedAtIso: string;
  locationHref: string;
  matchId: string | null;
  playerId: string | null;
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
  entryCount: number;
  entryDroppedCount: number;
  truncated: boolean;
  entries: DiagnosticEntry[];
}

// why: DIAGNOSTIC_BUFFER_CAP bounds the in-memory capture so an always-on
// buffer cannot grow without limit on a long-lived page; on overflow the
// oldest entry is dropped and entryDroppedCount increments so the exported
// report's truncated flag discloses the loss.
export const DIAGNOSTIC_BUFFER_CAP = 200;

/** The console levels this capture wraps. */
type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
type ConsoleMethod = (...args: unknown[]) => void;

// why: a non-enumerable marker stamped on each replaced console method so a
// Vite HMR module re-instantiation (which resets `installed`) can detect an
// already-wrapped method and not double-wrap it.
const WRAPPED_MARKER = '__diagnosticCaptureWrapped__';

// --- module-singleton capture state (one instance per page load) ---
let captureBuffer: DiagnosticEntry[] = [];
let nextSequence = 0;
let droppedEntryCount = 0;
let installed = false;
let savedConsoleMethods: Partial<Record<ConsoleLevel, ConsoleMethod>> = {};
let windowErrorListener: EventListener | null = null;
let windowRejectionListener: EventListener | null = null;

/**
 * Reads a millisecond wall-clock timestamp for a captured entry.
 *
 * @returns The current time in milliseconds.
 */
function captureTimestampMs(): number {
  // why: Date.now() here is a client-layer diagnostic timestamp marking when an
  // entry was captured; it is outside the engine determinism boundary, which
  // governs packages/game-engine only.
  return Date.now();
}

/**
 * Reports whether a console method already carries the wrapped marker.
 *
 * @param method The console method to inspect.
 * @returns `true` when the method is already one of our wrappers.
 */
function isWrappedConsoleMethod(method: ConsoleMethod): boolean {
  return (method as unknown as Record<string, unknown>)[WRAPPED_MARKER] === true;
}

/**
 * Stamps a non-enumerable wrapped marker on a console method.
 *
 * @param method The wrapper method to mark.
 */
function markConsoleMethodWrapped(method: ConsoleMethod): void {
  Object.defineProperty(method, WRAPPED_MARKER, {
    value: true,
    enumerable: false,
    configurable: true,
    writable: false,
  });
}

/**
 * Appends an entry to the ring buffer, assigning the next sequence number and
 * enforcing the buffer cap.
 *
 * @param partial The entry fields other than `sequence`.
 */
function appendEntry(partial: Omit<DiagnosticEntry, 'sequence'>): void {
  const entry: DiagnosticEntry = {
    sequence: nextSequence,
    kind: partial.kind,
    level: partial.level,
    message: partial.message,
    stack: partial.stack,
    atMs: partial.atMs,
  };
  nextSequence += 1;
  captureBuffer.push(entry);
  // why: on overflow drop the oldest entry and increment droppedEntryCount so
  // the report's truncated flag (= droppedEntryCount > 0) discloses the loss.
  if (captureBuffer.length > DIAGNOSTIC_BUFFER_CAP) {
    captureBuffer.shift();
    droppedEntryCount += 1;
  }
}

/**
 * Derives the `message` and `stack` for a wrapped `console.*` call per the
 * locked construction: a non-`Error` argument list is `String(value)`-joined
 * by a single space; if any argument is an `Error`, the first such error's
 * `.message` and `.stack` win.
 *
 * @param args The arguments passed to the console method.
 * @returns The normalized message and stack.
 */
function buildConsoleMessageAndStack(args: unknown[]): {
  message: string;
  stack: string | null;
} {
  let firstError: Error | null = null;
  for (const arg of args) {
    if (arg instanceof Error) {
      firstError = arg;
      break;
    }
  }
  if (firstError !== null) {
    return { message: firstError.message, stack: firstError.stack ?? null };
  }
  const stringifiedArgs: string[] = [];
  for (const arg of args) {
    stringifiedArgs.push(String(arg));
  }
  return { message: stringifiedArgs.join(' '), stack: null };
}

/**
 * Builds a wrapper for a console method that records the call and then always
 * calls through to the original.
 *
 * @param level    The console level being wrapped.
 * @param original The original console method to call through to.
 * @returns The wrapper method.
 */
function makeWrappedConsoleMethod(
  level: ConsoleLevel,
  original: ConsoleMethod,
): ConsoleMethod {
  return function wrappedConsoleMethod(...args: unknown[]): void {
    // why: call through to the original console method first and always, so the
    // capture never suppresses output (pass-through capture).
    original.apply(console, args);
    const { message, stack } = buildConsoleMessageAndStack(args);
    appendEntry({
      kind: 'console',
      level,
      message,
      stack,
      atMs: captureTimestampMs(),
    });
  };
}

/**
 * Returns a wrapped replacement for one console method, saving the original
 * first. A method that already carries the wrapped marker (HMR re-instantiation
 * reset `installed` but left the live wrapper in place) is returned unchanged so
 * it is never double-wrapped.
 *
 * @param level   The console level being wrapped.
 * @param current The live console method for that level.
 * @returns The method to assign back to `console[level]`.
 */
function wrapConsoleMethodIfNeeded(
  level: ConsoleLevel,
  current: ConsoleMethod,
): ConsoleMethod {
  if (isWrappedConsoleMethod(current)) {
    return current;
  }
  savedConsoleMethods[level] = current;
  const wrapped = makeWrappedConsoleMethod(level, current);
  markConsoleMethodWrapped(wrapped);
  return wrapped;
}

/**
 * Wraps every console level once, saving the originals. Written as explicit
 * per-level reassignments (not a loop) so each `console.<level>` wrap is direct
 * and obvious.
 */
function installConsoleWraps(): void {
  console.log = wrapConsoleMethodIfNeeded('log', console.log);
  console.info = wrapConsoleMethodIfNeeded('info', console.info);
  console.warn = wrapConsoleMethodIfNeeded('warn', console.warn);
  console.error = wrapConsoleMethodIfNeeded('error', console.error);
  console.debug = wrapConsoleMethodIfNeeded('debug', console.debug);
}

/**
 * Normalizes a `window` `'error'` event: prefer `event.error` (an `Error`) for
 * `message` + `stack`, else fall back to `event.message` with no stack.
 *
 * @param event The error event.
 * @returns The normalized message and stack.
 */
function normalizeWindowErrorEvent(event: ErrorEvent): {
  message: string;
  stack: string | null;
} {
  if (event.error instanceof Error) {
    return { message: event.error.message, stack: event.error.stack ?? null };
  }
  return { message: event.message, stack: null };
}

/**
 * Normalizes an `'unhandledrejection'` event: when the reason is an `Error`,
 * use its `.message` + `.stack`; otherwise `String(reason)` with no stack.
 *
 * @param event The promise-rejection event.
 * @returns The normalized message and stack.
 */
function normalizeRejectionEvent(event: PromiseRejectionEvent): {
  message: string;
  stack: string | null;
} {
  const reason: unknown = event.reason;
  if (reason instanceof Error) {
    return { message: reason.message, stack: reason.stack ?? null };
  }
  return { message: String(reason), stack: null };
}

/**
 * Registers the `window` `'error'` + `'unhandledrejection'` listeners and saves
 * their references so reset can remove them.
 */
function installWindowListeners(): void {
  windowErrorListener = (event: Event): void => {
    const { message, stack } = normalizeWindowErrorEvent(event as ErrorEvent);
    appendEntry({
      kind: 'error',
      level: null,
      message,
      stack,
      atMs: captureTimestampMs(),
    });
  };
  windowRejectionListener = (event: Event): void => {
    const { message, stack } = normalizeRejectionEvent(
      event as PromiseRejectionEvent,
    );
    appendEntry({
      kind: 'unhandledrejection',
      level: null,
      message,
      stack,
      atMs: captureTimestampMs(),
    });
  };
  window.addEventListener('error', windowErrorListener);
  window.addEventListener('unhandledrejection', windowRejectionListener);
}

/**
 * Installs the diagnostic capture: wraps the console methods and registers the
 * window listeners. Idempotent — a second call NO-OPs via the module-level
 * `installed` flag, and the per-method wrapped marker additionally guards
 * against double-wrapping under a Vite HMR module re-instantiation.
 */
export function installDiagnosticCapture(): void {
  if (installed) {
    return;
  }
  installed = true;
  installConsoleWraps();
  installWindowListeners();
}

/**
 * Returns the captured entries oldest → newest (by ascending `sequence`) as a
 * defensive copy.
 *
 * @returns The current buffer contents, oldest first.
 */
export function getDiagnosticEntries(): DiagnosticEntry[] {
  return captureBuffer.slice();
}

/**
 * Returns the number of entries dropped from the front of the buffer because of
 * the {@link DIAGNOSTIC_BUFFER_CAP} overflow.
 *
 * @returns The dropped-entry count.
 */
export function getDroppedEntryCount(): number {
  return droppedEntryCount;
}

/**
 * Tears the capture back down for test isolation: restores the original console
 * methods, removes the window listeners, clears the buffer, and resets the
 * sequence + dropped counters. Production code never calls this.
 */
export function resetDiagnosticCaptureForTesting(): void {
  if (savedConsoleMethods.log !== undefined) {
    console.log = savedConsoleMethods.log;
  }
  if (savedConsoleMethods.info !== undefined) {
    console.info = savedConsoleMethods.info;
  }
  if (savedConsoleMethods.warn !== undefined) {
    console.warn = savedConsoleMethods.warn;
  }
  if (savedConsoleMethods.error !== undefined) {
    console.error = savedConsoleMethods.error;
  }
  if (savedConsoleMethods.debug !== undefined) {
    console.debug = savedConsoleMethods.debug;
  }
  savedConsoleMethods = {};
  if (windowErrorListener !== null) {
    window.removeEventListener('error', windowErrorListener);
    windowErrorListener = null;
  }
  if (windowRejectionListener !== null) {
    window.removeEventListener('unhandledrejection', windowRejectionListener);
    windowRejectionListener = null;
  }
  captureBuffer = [];
  nextSequence = 0;
  droppedEntryCount = 0;
  installed = false;
}

/**
 * Redacts the `credentials` query-param value in a URL, replacing it with the
 * literal `***redacted***` while leaving `match` / `player` intact.
 *
 * @param href The (typically absolute) location href to redact.
 * @returns The href with the credentials value redacted.
 */
export function redactCredentialsFromUrl(href: string): string {
  // why: redaction targets the credentials query param only (the live-match
  // session secret); match/player are retained for correlation in the report.
  try {
    const url = new URL(href);
    if (url.searchParams.has('credentials')) {
      url.searchParams.set('credentials', '***redacted***');
    }
    return url.toString();
  } catch (urlParseError) {
    // why: a non-absolute or malformed href cannot be parsed by URL(); a
    // string-level fallback still strips the credentials value so the session
    // secret never survives into the report even for an unparseable href.
    return href.replace(/([?&]credentials=)[^&#]*/g, '$1***redacted***');
  }
}

/**
 * Builds the report envelope from the captured entries and the collected
 * context. Pure: it performs no ambient `window` / `Date` / global reads — the
 * impure caller passes everything in.
 *
 * @param entries The captured entries, oldest → newest.
 * @param context The browser context collected by the caller.
 * @returns The assembled report.
 */
export function buildDiagnosticReport(
  entries: DiagnosticEntry[],
  context: DiagnosticContext,
): DiagnosticReport {
  return {
    appVersion: context.appVersion,
    gitSha: context.gitSha,
    buildTimestamp: context.buildTimestamp,
    capturedAtIso: context.capturedAtIso,
    locationHref: context.locationHref,
    matchId: context.matchId,
    playerId: context.playerId,
    userAgent: context.userAgent,
    viewportWidth: context.viewportWidth,
    viewportHeight: context.viewportHeight,
    entryCount: entries.length,
    entryDroppedCount: context.entryDroppedCount,
    truncated: context.entryDroppedCount > 0,
    entries,
  };
}

/**
 * Serializes a report to 2-space-indented JSON suitable for download and
 * clipboard sharing.
 *
 * @param report The report to serialize.
 * @returns The pretty-printed JSON string.
 */
export function serializeDiagnosticReport(report: DiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Builds the download file name for a diagnostic report. An absent match id
 * becomes the literal `no-match`; `/` and `\` in the id are replaced with `-`
 * so the name stays a single safe filename component.
 *
 * @param matchId      The match id (already URL-decoded) or `null` when absent.
 * @param capturedAtMs The single `Date.now()` read at click time.
 * @returns The `.json` file name.
 */
export function buildDiagnosticFileName(
  matchId: string | null,
  capturedAtMs: number,
): string {
  const rawMatchSegment = matchId !== null && matchId !== '' ? matchId : 'no-match';
  const safeMatchSegment = rawMatchSegment.replaceAll('/', '-').replaceAll('\\', '-');
  return `legendary-arena-diagnostics-${safeMatchSegment}-${capturedAtMs}.json`;
}
