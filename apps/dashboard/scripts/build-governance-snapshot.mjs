#!/usr/bin/env node
/**
 * build-governance-snapshot.mjs — Build-time governance snapshot generator.
 *
 * Reads `docs/ai/work-packets/WORK_INDEX.md`, `docs/ai/DECISIONS.md`, and
 * `git log --oneline -50`, then emits a deterministic JSON snapshot consumed
 * by GovernanceThroughputWidget + RecentActivityWidget. Output path:
 * `apps/dashboard/src/data/governance-snapshot.json` (gitignored; regenerated
 * every `pnpm dash:build`).
 *
 * Authority: WP-198 §D + EC-224b §Locked Values §Generator + D-19804 +
 * D-19805 + D-19806.
 *
 * why: D-19804 — build-time JSON replaces a server endpoint for governance
 * data. The snapshot ships baked into the (CF-Pages, Access-gated) SPA bundle
 * via Vite's static-asset mechanism. A server endpoint would mean a new
 * `/api/admin/governance/*` route, auth posture, and CORS edit — too much
 * surface for a widget that re-renders only on rebuild.
 *
 * why: D-19805 — generator catches all errors and writes
 * `{ error, schemaVersion: 1, generatedAt }` to the output path; exit 0.
 * Throwing aborts the build and is strictly worse for the operator than a
 * clean widget-error state. The Widget Contract (WP-157 §5) already mandates
 * an error state — leveraging it for build-time failures keeps the
 * operator's other widgets reachable.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 1;
const BODY_CAP_CHARS = 240;
const DECISIONS_TAIL_LIMIT = 50;
const COMMIT_TAIL_LIMIT = 50;
const GIT_LOG_FETCH_COUNT = 50;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = resolve(SCRIPT_DIR, '..');
const REPO_ROOT = resolve(DASHBOARD_DIR, '..', '..');
const WORK_INDEX_PATH = join(REPO_ROOT, 'docs/ai/work-packets/WORK_INDEX.md');
const DECISIONS_PATH = join(REPO_ROOT, 'docs/ai/DECISIONS.md');
const DECISIONS_REL = 'docs/ai/DECISIONS.md';
const OUTPUT_PATH = join(DASHBOARD_DIR, 'src/data/governance-snapshot.json');

// why: WP §D — anchored to start-of-line; status union is closed; trailing
// date is optional so newly-drafted rows with no date still match.
const WORK_INDEX_ROW_PATTERN = /^- \[(x| )\] WP-(\d{3}) — (.+?)\. \*\*(Draft|Done|Ready|Blocked)\*\* (\d{4}-\d{2}-\d{2})?/;
const DECISIONS_HEADING_PATTERN = /^### D-(\d{5}) — (.+?)$/;

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
 * Resolve HEAD's committer-date ISO timestamp. Falls back to the empty
 * string if `git log` fails (e.g. detached state with no commits).
 *
 * why: D-19804 — generatedAt is the HEAD commit's ISO timestamp, not the
 * build wall-clock. Same commit → same generatedAt → byte-identical JSON is
 * the load-bearing invariant for the determinism contract.
 */
function readHeadCommitIso() {
  try {
    return gitOutput(['log', '-1', '--format=%cI', 'HEAD']);
  } catch {
    return '';
  }
}

/**
 * Resolve a single-file committer-date ISO via `git log -1 --format=%cI`.
 *
 * why: WP §D — DECISIONS mtime is single-file via %cI; per-entry mtime is
 * out of scope for this WP (RecentActivityWidget tooltip notes that
 * DECISIONS entries share the same mtime). Single-file %cI is stable across
 * builds.
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
 * the Thursday of the week containing the input date, per ISO-8601.
 */
function isoWeekKey(date) {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = thursday.getUTCDay();
  const dayOffset = day === 0 ? -3 : 4 - day;
  thursday.setUTCDate(thursday.getUTCDate() + dayOffset);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const dayMillis = 86400000;
  const weekNumber = Math.ceil(((thursday.getTime() - yearStart) / dayMillis + 1) / 7);
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
 * Parse a single WORK_INDEX.md row. Returns the parsed row object, or null if
 * the line does not match the locked regex.
 *
 * why: WP §D + D-19806 — `Hard-deps:` segment is case-sensitive literal,
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
 * why: WP §D — paragraph is the first contiguous block of non-empty lines
 * after the heading; iteration stops at the first empty line; lines joined
 * with a single space; capped via String.prototype.slice(0, 240). No .trim(),
 * no whitespace normalization, no ellipsis.
 *
 * All entries share the same mtime (single-file %cI per WP §D).
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
    // why: WP §D — "first contiguous block of non-empty lines after the
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
    const body = joined.slice(0, BODY_CAP_CHARS);
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
 * Filter git-log output to commit entries with subjects beginning with
 * `WP-NNN:` or `SPEC:`.
 *
 * why: WP §D Activity feed source — only `WP-NNN:` and `SPEC:` commits feed
 * the activity feed. Other prefixes (INFRA:, chore:, etc.) are dropped
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
 * why: insertion-order reliance in the emitted JSON is not deterministic
 * across Node runtime versions; building a key-sorted intermediate before
 * JSON.stringify is the canonical byte-identity guard.
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
 * Main entrypoint. Reads inputs, builds the snapshot, writes it. On any
 * error, catches and writes an error snapshot per D-19805; exits 0.
 */
async function main() {
  const generatedAt = readHeadCommitIso();
  try {
    await ensureOutputDir();
    const workIndexContent = await readFile(WORK_INDEX_PATH, 'utf8');
    const decisionsContent = await readFile(DECISIONS_PATH, 'utf8');
    const decisionsMtime = readFileCommitIso(DECISIONS_REL);
    const commitLines = readGitLogSubjects();

    const rows = readWorkIndex(workIndexContent);
    const byWeek = buildHorizonBuckets(rows, isoWeekKey);
    const byMonth = buildHorizonBuckets(rows, monthKey);
    const byQuarter = buildHorizonBuckets(rows, quarterKey);
    const inFlight = buildInFlight(rows);
    const blocked = buildBlocked(rows);
    const now = buildNowList(rows);
    const decisions = readDecisions(decisionsContent, decisionsMtime);
    const commits = readCommits(commitLines);

    const snapshot = {
      generatedAt,
      schemaVersion: SCHEMA_VERSION,
      throughput: {
        byWeek,
        byMonth,
        byQuarter,
        inFlight,
        blocked,
        now,
      },
      decisions,
      commits,
    };

    await writeSnapshot(snapshot);
  } catch (caught) {
    const rawMessage = caught instanceof Error
      ? caught.message
      : 'The governance snapshot generator failed with a non-Error throw value; check the script logs for the underlying cause.';
    const safeMessage = stripPii(rawMessage);
    const errorSnapshot = {
      error: `Governance snapshot generation failed; please re-run pnpm dash:build or inspect the script logs for the underlying cause. Detail: ${safeMessage}`,
      generatedAt,
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
