#!/usr/bin/env node
/**
 * build-governance-snapshot.mjs — Build-time governance snapshot generator.
 *
 * Reads `docs/ai/work-packets/WORK_INDEX.md`, `docs/ai/DECISIONS.md`,
 * `docs/ai/STATUS.md`, `docs/ai/work-packets/` (directory listing for WP-file
 * path resolution), and `git log --oneline -50`, then emits a deterministic
 * JSON snapshot consumed by GovernanceThroughputWidget + RecentActivityWidget
 * + StatusFeedWidget + GovernanceKpiStrip. Output path:
 * `apps/dashboard/src/data/governance-snapshot.json` (gitignored; regenerated
 * every `pnpm dash:build`).
 *
 * Authority: WP-198 §D + EC-224b + WP-199 §Locked Contract Values + EC-226 +
 * D-19804..D-19806 (WP-198) + D-19901..D-19910 (WP-199).
 *
 * why: D-19804 — build-time JSON replaces a server endpoint for governance
 * data. The snapshot ships baked into the (CF-Pages, Access-gated) SPA bundle
 * via Vite's static-asset mechanism. A server endpoint would mean a new
 * `/api/admin/governance/*` route, auth posture, and CORS edit — too much
 * surface for a widget that re-renders only on rebuild.
 *
 * why: D-19805 — generator catches all errors and writes
 * `{ error, schemaVersion, generatedAt }` to the output path; exit 0.
 * Throwing aborts the build and is strictly worse for the operator than a
 * clean widget-error state. The Widget Contract (WP-157 §5) already mandates
 * an error state — leveraging it for build-time failures keeps the
 * operator's other widgets reachable.
 *
 * why: D-19904 — `schemaVersion` bumps from `1` to `2`. Bump is additive only:
 * the v1 5-key top-level set (`commits`, `decisions`, `generatedAt`,
 * `schemaVersion`, `throughput`) retains v1 shape byte-identical; v2 adds
 * `status` and `governanceKpis` for a closed lex-sorted 7-key set.
 *
 * why: D-19904 hardening — HEAD commit date is resolved exactly once per
 * generator run (`git log -1 --format=%cI HEAD` invoked inline below). The
 * resolved string is threaded through `generatedAt`, the ISO week anchor for
 * `wpsDoneThisWeek`, and the day-delta arithmetic for `daysSinceLastDoneFlip`.
 * A second `git log -1 --format=%cI HEAD` call would risk inconsistent values
 * if a commit landed between calls.
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 2;
const DECISIONS_BODY_CAP_CHARS = 240;
const STATUS_BODY_CAP_CHARS = 480;
const DECISIONS_TAIL_LIMIT = 50;
const COMMIT_TAIL_LIMIT = 50;
const STATUS_TAIL_LIMIT = 50;
const GIT_LOG_FETCH_COUNT = 50;
const MILLIS_PER_DAY = 86_400_000;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(DASHBOARD_DIR, '..', '..');
const WORK_INDEX_PATH = join(REPO_ROOT, 'docs/ai/work-packets/WORK_INDEX.md');
const DECISIONS_PATH = join(REPO_ROOT, 'docs/ai/DECISIONS.md');
const STATUS_PATH = join(REPO_ROOT, 'docs/ai/STATUS.md');
const WORK_PACKETS_DIR_ABS = join(REPO_ROOT, 'docs/ai/work-packets');
const WORK_PACKETS_DIR_REL = 'docs/ai/work-packets';
const DECISIONS_REL = 'docs/ai/DECISIONS.md';
const OUTPUT_PATH = join(DASHBOARD_DIR, 'src/data/governance-snapshot.json');

// why: WP-198 §D — anchored to start-of-line; status union is closed; trailing
// date is optional so newly-drafted rows with no date still match.
const WORK_INDEX_ROW_PATTERN = /^- \[(x| )\] WP-(\d{3}) — (.+?)\. \*\*(Draft|Done|Ready|Blocked)\*\* (\d{4}-\d{2}-\d{2})?/;
const DECISIONS_HEADING_PATTERN = /^### D-(\d{5}) — (.+?)$/;
// why: WP-199 §Locked Contract Values — anchored to start-of-line; closed
// match shape for the STATUS heading per D-19901. ecNumber captures the
// optional letter suffix verbatim (e.g. `224a`).
const STATUS_HEADING_PATTERN = /^### (WP-\d{3}) \/ (EC-\d{3}[a-z]?) Executed — (.+?) \((\d{4}-\d{2}-\d{2})\)$/;

// why: D-19806 — literal case-sensitive token; segment terminates at the
// first `.` after the token; dependency WPs extracted via /WP-\d{3}/g
// (exactly three digits; WP-99 and WP-1234 do NOT match).
const HARD_DEPS_TOKEN = 'Hard-deps:';
const WP_NUMBER_PATTERN = /WP-\d{3}/g;

// why: PII gate — email-shaped tokens are stripped before any string lands
// in the snapshot. The snapshot ships to the CF Pages CDN (behind WP-197's
// Access gate), but PII in build output is a leak vector even behind Access.
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Run a git subcommand and return its stdout trimmed of trailing whitespace.
 * Errors propagate to the caller's try/catch.
 */
function gitOutput(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Resolve a single-file committer-date ISO via `git log -1 --format=%cI`.
 *
 * why: WP-198 §D — DECISIONS mtime is single-file via %cI; per-entry mtime is
 * out of scope (RecentActivityWidget tooltip notes that DECISIONS entries
 * share the same mtime). Distinct from the HEAD-commit single-call invariant
 * (D-19904 hardening) because the rev argument is a path, not `HEAD`.
 */
function readFileCommitIso(relativePath) {
  return gitOutput(['log', '-1', '--format=%cI', '--', relativePath]);
}

/**
 * Read the last N commit subjects via `git log --oneline -N`. Returns an
 * empty array if git produced no output.
 */
function readGitLogSubjects() {
  const raw = gitOutput(['log', '--oneline', `-${GIT_LOG_FETCH_COUNT}`]);
  if (raw === '') {
    return [];
  }
  return raw.split('\n');
}

/**
 * Compute the ISO-8601 week key (YYYY-Www) for a given UTC date. Anchored to
 * the Thursday of the week containing the input date, per ISO-8601. Used by
 * the throughput-bucket horizons; distinct from the Monday-anchored week
 * window for `wpsDoneThisWeek` (which uses the D-19905 algorithm).
 */
function isoWeekKey(date) {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = thursday.getUTCDay();
  const dayOffset = day === 0 ? -3 : 4 - day;
  thursday.setUTCDate(thursday.getUTCDate() + dayOffset);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const weekNumber = Math.ceil(((thursday.getTime() - yearStart) / MILLIS_PER_DAY + 1) / 7);
  const year = thursday.getUTCFullYear();
  const weekPadded = String(weekNumber).padStart(2, '0');
  return `${year}-W${weekPadded}`;
}

/**
 * Compute the calendar-month key (YYYY-MM) for a given UTC date.
 */
function monthKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Compute the calendar-quarter key (YYYY-Qn) for a given UTC date.
 */
function quarterKey(date) {
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

/**
 * Strip email-shaped tokens from a string. Replaces matches with the literal
 * `<email-redacted>` marker so PII gate (zero-match on
 * `@barefootbetters.com|@legendary-arena.com|jeff@`) holds.
 */
function stripPii(text) {
  return text.replace(EMAIL_PATTERN, '<email-redacted>');
}

/**
 * Strip a leading UTF-8 BOM (`﻿`) from a string if present.
 *
 * why: D-19905 hardening — operator editors occasionally save with a BOM and
 * a leading `﻿` would prefix the first heading and break the start-of-
 * line regex anchor. Stripping unconditionally is cheaper than per-callsite
 * defensive checks; if no BOM is present the slice is a no-op.
 */
function stripBom(text) {
  if (text.charCodeAt(0) === 0xFEFF) {
    return text.slice(1);
  }
  return text;
}

/**
 * Parse a single WORK_INDEX.md row. Returns the parsed row object, or null if
 * the line does not match the locked regex.
 *
 * why: WP-198 §D + D-19806 — `Hard-deps:` segment is case-sensitive literal,
 * terminates at the first `.` after the token, and dependency numbers are
 * extracted via /WP-\d{3}/g (case-sensitive, exactly three digits). A row
 * with no `Hard-deps:` token is dependency-free, NOT a parse error.
 */
function parseWorkIndexRow(line) {
  const match = WORK_INDEX_ROW_PATTERN.exec(line);
  if (match === null) {
    return null;
  }
  const numberStr = match[2];
  const title = match[3];
  const status = match[4];
  const dateStr = match[5] ?? '';
  const number = Number.parseInt(numberStr, 10);
  const dependencies = [];
  const hardDepsIndex = line.indexOf(HARD_DEPS_TOKEN);
  if (hardDepsIndex !== -1) {
    const segmentStart = hardDepsIndex + HARD_DEPS_TOKEN.length;
    const segmentEnd = line.indexOf('.', segmentStart);
    const segment = segmentEnd === -1 ? line.slice(segmentStart) : line.slice(segmentStart, segmentEnd);
    const depMatches = segment.matchAll(WP_NUMBER_PATTERN);
    for (const depMatch of depMatches) {
      const depNumber = Number.parseInt(depMatch[0].slice(3), 10);
      dependencies.push(depNumber);
    }
  }
  return { number, title, status, date: dateStr, dependencies };
}

/**
 * Split file content into lines, handling both LF and CRLF endings. The
 * generator reads governance docs that may be authored on Windows; a naive
 * split('\n') leaves a trailing `\r` on every line which silently breaks
 * end-of-line regex anchors. Normalizing here is cheaper than per-callsite
 * defensive `\r?` patterns.
 */
function splitLines(content) {
  return content.split(/\r?\n/);
}

/**
 * Parse all WORK_INDEX.md rows. Non-matching lines are dropped silently —
 * WORK_INDEX has section headers and prose interleaved with WP rows, and
 * older rows that pre-date the locked `**Status** YYYY-MM-DD` format also
 * fall through.
 */
function readWorkIndex(content) {
  const rows = [];
  const lines = splitLines(content);
  for (const line of lines) {
    const row = parseWorkIndexRow(line);
    if (row !== null) {
      rows.push(row);
    }
  }
  return rows;
}

/**
 * Build a horizon-bucketed throughput array. For each unique horizon key
 * present in the input rows, emit one `HorizonCount` entry containing the
 * `done` and `drafted` counts that fell into that bucket. Output is sorted
 * lexicographically by key.
 */
function buildHorizonBuckets(rows, keyFn) {
  const buckets = new Map();
  for (const row of rows) {
    if (row.date === '') {
      continue;
    }
    const parsed = new Date(`${row.date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }
    const key = keyFn(parsed);
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = { key, done: 0, drafted: 0 };
      buckets.set(key, bucket);
    }
    if (row.status === 'Done') {
      bucket.done += 1;
    } else if (row.status === 'Draft') {
      bucket.drafted += 1;
    }
  }
  // why: bare Array.prototype.sort uses Unicode code-unit order — same across
  // Node ICU versions. String.prototype.localeCompare is forbidden across
  // the contract (locale-aware sort varies by runtime version and breaks
  // byte-identity).
  const sortedKeys = [...buckets.keys()].sort();
  const result = [];
  for (const key of sortedKeys) {
    const bucket = buckets.get(key);
    if (bucket !== undefined) {
      result.push(bucket);
    }
  }
  return result;
}

/**
 * Build a single WpRef from a parsed row. The `dependencies` list is sorted
 * ascending for deterministic output.
 */
function buildWpRef(row) {
  const sortedDeps = [...row.dependencies].sort((a, b) => a - b);
  return {
    number: row.number,
    title: stripPii(row.title),
    status: row.status,
    dependencies: sortedDeps,
  };
}

/**
 * Build the in-flight list: every WP whose status is `Draft` or `Ready`,
 * sorted by WP number ascending.
 */
function buildInFlight(rows) {
  const refs = [];
  for (const row of rows) {
    if (row.status === 'Draft' || row.status === 'Ready') {
      refs.push(buildWpRef(row));
    }
  }
  refs.sort((left, right) => left.number - right.number);
  return refs;
}

/**
 * Build the blocked list: every WP whose status is `Blocked`, sorted by WP
 * number ascending.
 */
function buildBlocked(rows) {
  const refs = [];
  for (const row of rows) {
    if (row.status === 'Blocked') {
      refs.push(buildWpRef(row));
    }
  }
  refs.sort((left, right) => left.number - right.number);
  return refs;
}

/**
 * Build the "now" list — the executable-now WPs returned by
 * `useGovernanceSnapshot.nextExecutable()`.
 *
 * why: D-19806 — filter to status ∈ {Ready, Draft} AND every dependency
 * resolves to a WpRef with status `Done`. Sort by WP number ascending ONLY;
 * `Ready` and `Draft` are interchangeable — status does NOT affect order;
 * lowest WP number wins.
 */
function buildNowList(rows) {
  const statusByNumber = new Map();
  for (const row of rows) {
    statusByNumber.set(row.number, row.status);
  }
  const candidates = [];
  for (const row of rows) {
    if (row.status !== 'Ready' && row.status !== 'Draft') {
      continue;
    }
    let allDepsDone = true;
    for (const depNumber of row.dependencies) {
      const depStatus = statusByNumber.get(depNumber);
      if (depStatus !== 'Done') {
        allDepsDone = false;
        break;
      }
    }
    if (allDepsDone) {
      candidates.push(buildWpRef(row));
    }
  }
  candidates.sort((left, right) => left.number - right.number);
  return candidates;
}

/**
 * Parse DECISIONS.md entries. Each entry pairs a `### D-NNNNN — Title`
 * heading with its first paragraph.
 *
 * why: WP-198 §D — paragraph is the first contiguous block of non-empty
 * lines after the heading; iteration stops at the first empty line; lines
 * joined with a single space; capped via String.prototype.slice(0, 240). No
 * .trim(), no whitespace normalization, no ellipsis.
 *
 * All entries share the same mtime (single-file %cI per WP-198 §D).
 */
function readDecisions(content, decisionsMtime) {
  const entries = [];
  const lines = splitLines(content);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const headingMatch = DECISIONS_HEADING_PATTERN.exec(line);
    if (headingMatch === null) {
      continue;
    }
    const id = `D-${headingMatch[1]}`;
    const titleText = headingMatch[2];
    // why: WP-198 §D — "first contiguous block of non-empty lines after the
    // heading". Markdown convention puts a blank line between a heading and
    // its body, so leading blanks after the heading are skipped; capture
    // begins at the first non-empty line and stops at the next empty line.
    const paragraphLines = [];
    let inParagraph = false;
    for (let scanIndex = lineIndex + 1; scanIndex < lines.length; scanIndex += 1) {
      const paragraphLine = lines[scanIndex];
      const isEmpty = paragraphLine.trim() === '';
      if (isEmpty) {
        if (inParagraph) {
          break;
        }
        continue;
      }
      inParagraph = true;
      paragraphLines.push(paragraphLine);
    }
    const joined = paragraphLines.join(' ');
    const body = joined.slice(0, DECISIONS_BODY_CAP_CHARS);
    entries.push({
      id,
      title: stripPii(titleText),
      body: stripPii(body),
      mtime: decisionsMtime,
    });
  }
  // why: mtime is identical across entries (single-file %cI), so the
  // mtime-descending sort falls back to id-descending (newer D-NNNNN first)
  // for stable ordering. ID compare uses bare < (Unicode code-unit) per the
  // no-localeCompare contract.
  entries.sort((left, right) => {
    if (left.mtime !== right.mtime) {
      return left.mtime < right.mtime ? 1 : -1;
    }
    if (left.id === right.id) {
      return 0;
    }
    return left.id < right.id ? 1 : -1;
  });
  return entries.slice(0, DECISIONS_TAIL_LIMIT);
}

/**
 * Resolve a Work Packet file path given its three-digit WP number and the
 * pre-fetched directory listing of `docs/ai/work-packets/`.
 *
 * why: D-19906 — resolution is build-time only. Browser SPAs cannot do a
 * runtime glob; resolving here keeps the link deterministic. The widget
 * reads the literal string and suppresses the link when empty. Zero or
 * more-than-one prefix match emits an empty string AND a stderr warning so
 * the ambiguity surfaces as a real signal rather than a hallucinated link.
 *
 * why: D-19906 — prefix uses three-digit zero-padding (`WP-198-`, never
 * `WP-19-`); without padding a search for WP-19 would also match
 * `WP-198-...md`. Padding the wpNumber to 3 digits before constructing the
 * prefix is the load-bearing rule.
 */
function resolveWpFilePath(wpNumber, workPacketFilenames) {
  const paddedNumber = String(wpNumber).padStart(3, '0');
  const prefix = `WP-${paddedNumber}-`;
  const matches = [];
  for (const filename of workPacketFilenames) {
    if (filename.startsWith(prefix) && filename.endsWith('.md')) {
      matches.push(filename);
    }
  }
  if (matches.length === 1) {
    return `${WORK_PACKETS_DIR_REL}/${matches[0]}`;
  }
  process.stderr.write(
    `STATUS.md WP file path resolution warning: WP-${paddedNumber} produced ${matches.length} filename match(es) under ${WORK_PACKETS_DIR_REL}/; emitting empty string for this entry's filePath so the widget suppresses the link.\n`,
  );
  return '';
}

/**
 * Parse STATUS.md entries. Each entry pairs a
 * `### WP-NNN / EC-NNN[a-z]? Executed — Title (YYYY-MM-DD)` heading with its
 * first contiguous paragraph.
 *
 * Mirrors the DECISIONS.md parser structure per D-19907 — same `for...of`
 * over heading matches, same per-entry try/catch, same skip-capture body
 * advance. Differs only in (a) the heading regex, (b) the body cap (480 vs
 * 240), and (c) per-entry filePath resolution (STATUS only).
 *
 * why: D-19905 — three locked determinism rules.
 *  (a) Tie-break by heading byte-offset ascending (top-to-bottom file order),
 *      where "byte-offset" is the JavaScript string index returned by
 *      `rawText.indexOf` / regex `.index` (UTF-16 code-unit index per
 *      hardening i — NEVER `Buffer.byteLength`).
 *  (b) Body capture is the explicit 3-step skip-then-capture-then-stop where
 *      "non-empty" means `line.trim().length > 0` and the stop condition is
 *      the first empty line OR the next `^### ` heading, whichever comes
 *      first.
 *  (c) Date comparisons sort the literal 'YYYY-MM-DD' substring under string
 *      `<` per hardening ii; `Date` round-trip for sort purposes is
 *      FORBIDDEN.
 *
 * why: D-19905 hardening iv — duplicate `(wpNumber, ecNumber, date)`
 * triplets (e.g., copy-paste error in STATUS.md) cause every match in the
 * overlap group to be skipped AND emit a full-sentence stderr warning
 * naming the triplet and the duplicate-match count. Silent inclusion of a
 * phantom 51st entry is FAIL.
 */
function readStatus(content, workPacketFilenames) {
  const rawText = stripBom(content);
  const lines = splitLines(rawText);

  // First pass: collect every heading match with its raw-text index for
  // tie-break and its line index for body capture.
  const headingMatches = [];
  let cursor = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const headingMatch = STATUS_HEADING_PATTERN.exec(line);
    if (headingMatch !== null) {
      // why: D-19905 hardening i — `rawText.indexOf(line, cursor)` returns the
      // JS string index (UTF-16 code-unit) of this heading's first character.
      // The `cursor` argument advances past prior matches so duplicate-line
      // text (rare but possible) cannot resolve to an earlier offset.
      const rawIndex = rawText.indexOf(line, cursor);
      headingMatches.push({
        lineIndex,
        rawIndex,
        wpNumberStr: headingMatch[1].slice(3),
        ecToken: headingMatch[2],
        title: headingMatch[3],
        date: headingMatch[4],
      });
      cursor = rawIndex + line.length;
    } else {
      // Advance cursor monotonically past this line so the next indexOf
      // search starts from the line's end position. The +1 accounts for the
      // `\n` between lines; CRLF input is normalized by splitLines so this
      // single-character separator is correct here.
      const probeIndex = rawText.indexOf(line, cursor);
      if (probeIndex !== -1) {
        cursor = probeIndex + line.length;
      }
    }
  }

  // Second pass: identify duplicate (wpNumber, ecNumber, date) triplets.
  // why: D-19905 hardening iv — count first, then mark every offending
  // triplet as duplicate. The skip step in pass three drops EVERY match
  // sharing the triplet, not just the second-and-later.
  const tripletCounts = new Map();
  for (const m of headingMatches) {
    const key = `${m.wpNumberStr}|${m.ecToken}|${m.date}`;
    const prev = tripletCounts.get(key) ?? 0;
    tripletCounts.set(key, prev + 1);
  }
  const duplicateTriplets = new Set();
  for (const [key, count] of tripletCounts) {
    if (count > 1) {
      duplicateTriplets.add(key);
      const parts = key.split('|');
      process.stderr.write(
        `STATUS.md heading uniqueness warning: the triplet WP-${parts[0]} / ${parts[1]} on date ${parts[2]} appeared ${count} times in the source file; every match in this overlap group is skipped from the snapshot.\n`,
      );
    }
  }

  // Third pass: capture body + resolve filePath for every non-duplicate
  // heading. Per-entry try/catch contains a single bad entry so a malformed
  // body or path resolution does not blank the entire feed.
  const entries = [];
  for (const m of headingMatches) {
    const tripletKey = `${m.wpNumberStr}|${m.ecToken}|${m.date}`;
    if (duplicateTriplets.has(tripletKey)) {
      continue;
    }
    try {
      // why: D-19905 b — 3-step skip-then-capture-then-stop. "Non-empty" is
      // `line.trim().length > 0`. Stop fires on the first empty line OR the
      // next `### ` heading, whichever comes first. Body is joined with `\n`
      // verbatim and capped via `String.prototype.slice(0, 480)` with no
      // `.trim()` and no whitespace normalization.
      const paragraphLines = [];
      let inParagraph = false;
      for (let scanIndex = m.lineIndex + 1; scanIndex < lines.length; scanIndex += 1) {
        const paragraphLine = lines[scanIndex];
        if (paragraphLine.startsWith('### ')) {
          break;
        }
        const isEmpty = paragraphLine.trim().length === 0;
        if (isEmpty) {
          if (inParagraph) {
            break;
          }
          continue;
        }
        inParagraph = true;
        paragraphLines.push(paragraphLine);
      }
      const joined = paragraphLines.join('\n');
      const body = joined.slice(0, STATUS_BODY_CAP_CHARS);

      const wpNumber = Number.parseInt(m.wpNumberStr, 10);
      const ecNumber = m.ecToken.slice(3);
      // why: D-19906 — resolution at build time via the pre-fetched directory
      // listing; widget reads the literal string. Empty string signals zero
      // or >1 matches and the widget suppresses the link.
      const filePath = resolveWpFilePath(wpNumber, workPacketFilenames);

      entries.push({
        wpNumber,
        ecNumber,
        title: stripPii(m.title),
        date: m.date,
        body: stripPii(body),
        filePath,
        _rawIndex: m.rawIndex,
      });
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : 'unknown failure';
      process.stderr.write(
        `STATUS.md per-entry parse warning: WP-${m.wpNumberStr} / ${m.ecToken} on date ${m.date} failed to capture body or resolve filePath (detail: ${detail}); skipping this entry from the snapshot.\n`,
      );
    }
  }

  // why: D-19905 a + hardening ii — sort by date DESCENDING (lex on
  // 'YYYY-MM-DD' substring; Unicode code-unit comparator equals chrono
  // order for ISO dates without any `Date` round-trip), then break ties by
  // heading byte-offset ASCENDING (top-to-bottom file order — earlier in
  // STATUS.md appears earlier in the array within the same date bucket).
  entries.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date < right.date ? 1 : -1;
    }
    return left._rawIndex - right._rawIndex;
  });

  return entries.slice(0, STATUS_TAIL_LIMIT).map((entry) => ({
    body: entry.body,
    date: entry.date,
    ecNumber: entry.ecNumber,
    filePath: entry.filePath,
    title: entry.title,
    wpNumber: entry.wpNumber,
  }));
}

/**
 * Compute the Monday-anchored ISO week range (UTC) containing the given
 * committer-date ISO. Returns `weekStartIso` and `weekEndIso` as
 * 'YYYY-MM-DD' strings for lex-string membership comparisons, plus the
 * `todayMidnightMs` epoch for day-delta arithmetic.
 *
 * why: D-19905 c — ISO weekday is `((utcDate.getUTCDay() + 6) % 7) + 1`
 * (Mon=1 ... Sun=7). The translation is locked because the naive `getDay()`
 * returns Sunday=0...Saturday=6 which is off by one for ISO week math.
 * `Intl.DateTimeFormat` and `toLocaleString` are FORBIDDEN — locale-
 * dependent calculations vary across runtime ICU versions and break the
 * determinism gate.
 */
function computeIsoWeekRange(headCommitIso) {
  const parsed = new Date(headCommitIso);
  const utcYear = parsed.getUTCFullYear();
  const utcMonth = parsed.getUTCMonth();
  const utcDay = parsed.getUTCDate();
  const todayUtcMidnight = new Date(Date.UTC(utcYear, utcMonth, utcDay));
  const isoWeekday = ((todayUtcMidnight.getUTCDay() + 6) % 7) + 1;
  const weekStart = new Date(Date.UTC(utcYear, utcMonth, utcDay - (isoWeekday - 1)));
  const weekEnd = new Date(Date.UTC(
    weekStart.getUTCFullYear(),
    weekStart.getUTCMonth(),
    weekStart.getUTCDate() + 6,
  ));
  return {
    todayMidnightMs: todayUtcMidnight.getTime(),
    weekStartIso: formatUtcDateString(weekStart),
    weekEndIso: formatUtcDateString(weekEnd),
  };
}

/**
 * Format a Date as 'YYYY-MM-DD' using UTC calendar fields. The single
 * formatter site keeps the ISO week range and KPI date arithmetic on the
 * same representation.
 */
function formatUtcDateString(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Compute the three governance KPI numbers per WP-199 §B + EC-226 §Locked
 * Values: `wpsDoneThisWeek`, `daysSinceLastDoneFlip`, `openDrafts`.
 *
 * why: D-19908 — every field is a required non-optional `number`; `0` is
 * the meaningful zero-value (zero WPs done this week is a real, surface-
 * able operator state, not a missing-data state). The composable returns
 * `null` only for the whole-snapshot-error case.
 *
 * why: D-19905 hardening ii — date sort comparator on the literal
 * 'YYYY-MM-DD' substring; `Date` round-trip for SORT is FORBIDDEN. Day
 * delta arithmetic uses `Date.UTC(year, month-1, day)` for both sides,
 * which is permitted within ISO-week-arithmetic context.
 */
function computeGovernanceKpis(workIndexRows, headCommitIso) {
  const { todayMidnightMs, weekStartIso, weekEndIso } = computeIsoWeekRange(headCommitIso);
  let wpsDoneThisWeek = 0;
  let openDrafts = 0;
  let latestDoneDate = '';

  for (const row of workIndexRows) {
    if (row.status === 'Draft') {
      openDrafts += 1;
      continue;
    }
    if (row.status !== 'Done') {
      continue;
    }
    if (row.date === '') {
      continue;
    }
    // why: D-19905 hardening ii — week membership uses lex-string comparison
    // on the 'YYYY-MM-DD' substrings; chronological order equals lexicographic
    // order for ISO dates under Unicode code-unit comparator.
    if (row.date >= weekStartIso && row.date <= weekEndIso) {
      wpsDoneThisWeek += 1;
    }
    if (latestDoneDate === '' || row.date > latestDoneDate) {
      latestDoneDate = row.date;
    }
  }

  let daysSinceLastDoneFlip = 0;
  if (latestDoneDate !== '') {
    // why: D-19905 hardening ii — splitting the YYYY-MM-DD into integer parts
    // and feeding `Date.UTC` is a one-off arithmetic primitive, not a sort
    // comparator. The result is a UTC epoch millisecond count; subtracting
    // and dividing by MILLIS_PER_DAY yields whole UTC days.
    const latestParts = latestDoneDate.split('-');
    const latestMidnightMs = Date.UTC(
      Number.parseInt(latestParts[0], 10),
      Number.parseInt(latestParts[1], 10) - 1,
      Number.parseInt(latestParts[2], 10),
    );
    daysSinceLastDoneFlip = Math.floor((todayMidnightMs - latestMidnightMs) / MILLIS_PER_DAY);
  }

  return { daysSinceLastDoneFlip, openDrafts, wpsDoneThisWeek };
}

/**
 * Filter git-log output to commit entries with subjects beginning with
 * `WP-NNN:` or `SPEC:`.
 *
 * why: WP-198 §D Activity feed source — only `WP-NNN:` and `SPEC:` commits
 * feed the activity feed. Other prefixes (INFRA:, chore:, etc.) are dropped
 * silently. The list preserves git's commit-order-descending sequence.
 */
function readCommits(rawLines) {
  const entries = [];
  for (const line of rawLines) {
    const spaceIndex = line.indexOf(' ');
    if (spaceIndex === -1) {
      continue;
    }
    const sha = line.slice(0, spaceIndex);
    const subject = line.slice(spaceIndex + 1);
    let kind = null;
    if (/^WP-\d{3}:/.test(subject)) {
      kind = 'WP';
    } else if (subject.startsWith('SPEC:')) {
      kind = 'SPEC';
    }
    if (kind === null) {
      continue;
    }
    entries.push({
      sha,
      kind,
      title: stripPii(subject),
    });
  }
  return entries.slice(0, COMMIT_TAIL_LIMIT);
}

/**
 * Deep-sort an object/array structure by key, recursively. Arrays preserve
 * their input order (callers must pre-sort meaningful arrays).
 *
 * why: D-19904 hardening — JS object insertion-order is implementation-
 * defined for integer-like keys and historically inconsistent across V8
 * versions; building a key-sorted intermediate before JSON.stringify is
 * the canonical byte-identity guard. This is the single JSON key-sort
 * mechanism for the generator (no JSON.stringify replacer is used; one
 * mechanism, not both).
 */
function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      sorted[key] = sortObjectKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Ensure the output directory exists before writing.
 */
async function ensureOutputDir() {
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
}

/**
 * Write a snapshot object to OUTPUT_PATH. Builds a key-sorted intermediate
 * first, then emits UTF-8 / LF JSON with a single trailing newline.
 */
async function writeSnapshot(snapshot) {
  const sorted = sortObjectKeys(snapshot);
  const json = `${JSON.stringify(sorted, null, 2)}\n`;
  await writeFile(OUTPUT_PATH, json, { encoding: 'utf8' });
}

/**
 * Read STATUS.md content. Returns the raw text on success or null on read
 * failure (file missing or unreadable). Per-field degradation per D-19805
 * narrowed: a missing STATUS surfaces as an empty feed in the widget, NOT
 * as an error state for the whole snapshot.
 *
 * why: D-19805 (narrowed to per-field) — the inherited WP-198 contract is
 * "snapshot generator failure mode writes error JSON". WP-199 narrows that
 * for the STATUS source so a missing STATUS.md does NOT blank the entire
 * snapshot (the throughput / decisions / commits surfaces are still real
 * data). The widget renders its empty state cleanly while the rest of the
 * dashboard keeps working.
 *
 * why: D-19905 hardening iii — explicit 'utf-8' encoding; implicit-binary
 * `readFile` returns a `Buffer` whose `.toString()` defaults vary by Node
 * version and OS locale. Stripping a leading BOM happens at the parser
 * site (`readStatus` calls `stripBom`).
 */
async function readStatusContent() {
  try {
    return await readFile(STATUS_PATH, 'utf-8');
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : 'unknown read failure';
    process.stderr.write(
      `STATUS.md read warning: failed to read ${STATUS_PATH} (detail: ${detail}); emitting an empty status: [] feed in the snapshot rather than tripping the full-snapshot error path.\n`,
    );
    return null;
  }
}

/**
 * Read the `docs/ai/work-packets/` directory listing. Returns the array of
 * entry names; on failure returns an empty array (every filePath resolution
 * will then emit empty string + stderr warning).
 */
async function readWorkPacketFilenames() {
  try {
    return await readdir(WORK_PACKETS_DIR_ABS);
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : 'unknown read failure';
    process.stderr.write(
      `STATUS.md work-packets directory read warning: failed to readdir ${WORK_PACKETS_DIR_ABS} (detail: ${detail}); every StatusEntry.filePath will be the empty string and the widget will suppress every "Open WP" link.\n`,
    );
    return [];
  }
}

/**
 * Main entrypoint. Reads inputs, builds the snapshot, writes it. On any
 * error, catches and writes an error snapshot per D-19805; exits 0.
 *
 * why: D-19904 hardening b — `git log -1 --format=%cI HEAD` is invoked
 * exactly ONCE per generator run (inline below). The resolved string is
 * threaded through `generatedAt`, the ISO week anchor for
 * `wpsDoneThisWeek`, and the day-delta arithmetic for
 * `daysSinceLastDoneFlip`. A second invocation anywhere in the generator
 * would risk inconsistent values if a commit landed mid-run.
 */
async function main() {
  let headCommitIso = '';
  try {
    headCommitIso = execFileSync('git', ['log', '-1', '--format=%cI', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    headCommitIso = '';
  }

  try {
    await ensureOutputDir();
    // why: D-19905 hardening iii — explicit 'utf-8' encoding on every
    // governance-source readFile; never the implicit-binary form.
    const workIndexContent = await readFile(WORK_INDEX_PATH, 'utf-8');
    const decisionsContent = await readFile(DECISIONS_PATH, 'utf-8');
    const statusContent = await readStatusContent();
    const workPacketFilenames = await readWorkPacketFilenames();
    const decisionsMtime = readFileCommitIso(DECISIONS_REL);
    const commitLines = readGitLogSubjects();

    const workIndexClean = stripBom(workIndexContent);
    const decisionsClean = stripBom(decisionsContent);

    const rows = readWorkIndex(workIndexClean);
    const byWeek = buildHorizonBuckets(rows, isoWeekKey);
    const byMonth = buildHorizonBuckets(rows, monthKey);
    const byQuarter = buildHorizonBuckets(rows, quarterKey);
    const inFlight = buildInFlight(rows);
    const blocked = buildBlocked(rows);
    const now = buildNowList(rows);
    const decisions = readDecisions(decisionsClean, decisionsMtime);
    const commits = readCommits(commitLines);
    const status = statusContent === null
      ? []
      : readStatus(statusContent, workPacketFilenames);
    const governanceKpis = computeGovernanceKpis(rows, headCommitIso);

    const snapshot = {
      commits,
      decisions,
      generatedAt: headCommitIso,
      governanceKpis,
      schemaVersion: SCHEMA_VERSION,
      status,
      throughput: {
        blocked,
        byMonth,
        byQuarter,
        byWeek,
        inFlight,
        now,
      },
    };

    await writeSnapshot(snapshot);
  } catch (caught) {
    const rawMessage = caught instanceof Error
      ? caught.message
      : 'The governance snapshot generator failed with a non-Error throw value; check the script logs for the underlying cause.';
    const safeMessage = stripPii(rawMessage);
    const errorSnapshot = {
      error: `Governance snapshot generation failed; please re-run pnpm dash:build or inspect the script logs for the underlying cause. Detail: ${safeMessage}`,
      generatedAt: headCommitIso,
      schemaVersion: SCHEMA_VERSION,
    };
    try {
      await ensureOutputDir();
      await writeSnapshot(errorSnapshot);
    } catch {
      // why: best-effort write — even if persistence fails we exit 0 so the
      // build runner stays alive (per D-19805). The widget's load-error
      // state still renders if the existing file is stale or missing.
    }
  }
}

await main();
