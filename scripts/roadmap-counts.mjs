/**
 * Legendary Arena — Roadmap Count-Table Generator
 *
 * Derives the `docs/05-ROADMAP-MINDMAP.md` progress count table from two
 * governed sources of truth:
 *   - `docs/ai/work-packets/WORK_INDEX.md` — per-WP status (`[x]` done /
 *     `[ ]` open / `Blocked`), the authoritative ledger.
 *   - the ```` ```mermaid ```` `mindmap` block in `docs/05-ROADMAP-MINDMAP.md`
 *     — cluster membership (which WP lives under which heading).
 *
 * The table stops being hand-maintained: this generator is the sole writer
 * of the section bounded by the `ROADMAP-COUNTS:START` / `ROADMAP-COUNTS:END`
 * markers. Everything outside the markers (the mindmap nodes, the
 * explanatory prose) is hand-maintained and never touched.
 *
 * Run via:
 *   node scripts/roadmap-counts.mjs            # print the section to stdout
 *   node scripts/roadmap-counts.mjs --write    # rewrite the marker section
 *   node scripts/roadmap-counts.mjs --check    # exit non-zero if out of date
 *
 * Exit codes: 0 clean; 1 orphan(s) present or marker error; 2 out-of-date
 * (under `--check`). An uncaught exception terminates with a non-zero code.
 *
 * The generator is deterministic: identical (WORK_INDEX, ROADMAP) input
 * produces a byte-identical section across runs and platforms. It reads no
 * clock, calls no `Math.random`, and performs no locale-dependent sort.
 * It imports Node built-ins only — no engine, registry, server, or app code.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// why: anchor the repo root to this script's own location (the script lives
// in `<repo>/scripts/`) so the generator works regardless of the caller's
// working directory — the cron and a local run start from different places.
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const WORK_INDEX_PATH = resolve(REPO_ROOT, 'docs/ai/work-packets/WORK_INDEX.md');
const ROADMAP_PATH = resolve(REPO_ROOT, 'docs/05-ROADMAP-MINDMAP.md');

/**
 * Canonical WP-id regex, used by BOTH `parseWorkIndex` (to key the ledger)
 * AND `expandNodeId` (to read mindmap node ids).
 *
 * why: the suffix class is `[A-Za-z]` (case-insensitive), NOT `[A-Z]`. The
 * corpus has uppercase ids (`WP-005A`, `WP-007A`) and lowercase ids
 * (`WP-053a`, `WP-207a`, `WP-207b`). An `[A-Z]`-only class would truncate
 * `WP-053a` to `WP-053`, collide it with the real `WP-053` row, and report
 * a false orphan. The count-parity test (parseWorkIndex size == raw
 * checkbox-row count) fails loudly if this regex ever drops a row.
 */
export const WP_ID_REGEX = /\bWP-\d{3}(?:[A-Za-z]|\.\d+)?\b/;

// why: the marker strings are matched by substring so the human-readable
// "do not hand-edit" note on the START line can change without breaking the
// locator. These two tokens are the contract.
const MARKER_START_TOKEN = 'ROADMAP-COUNTS:START';
const MARKER_END_TOKEN = 'ROADMAP-COUNTS:END';

// why: the closed set of status icons a mindmap node may carry. Only these
// are recognised when reading a node's icon; any other glyph is ignored.
// Placeholder classification depends on the queued (`📦`) / placeholder
// (`📝`) members of this set.
const QUEUED_ICON = '📦';
const PLACEHOLDER_ICON = '📝';
const DONE_ICON = '✅';
const BLOCKED_ICON = '⏸';
const STATUS_ICONS = [DONE_ICON, '🚧', PLACEHOLDER_ICON, QUEUED_ICON, BLOCKED_ICON];

// ---------------------------------------------------------------------------
// Pure helpers — independently unit-testable, no I/O, no boardgame.io
// ---------------------------------------------------------------------------

/**
 * Parse `WORK_INDEX.md` into a Map from WP id to lifecycle status.
 *
 * A row is a checkbox list line (`- [x] …` or `- [ ] …`) whose first WP-id
 * token (per `WP_ID_REGEX`) keys the entry. `[x]` is done; `[ ]` is open
 * unless the row names `Blocked`, in which case it is a dependency-blocked
 * WP. Checkbox rows with no WP id (the `WP-NNN` template line) are skipped.
 *
 * @param {string} workIndexText — full text of WORK_INDEX.md
 * @returns {Map<string, 'done' | 'open' | 'blocked'>}
 */
export function parseWorkIndex(workIndexText) {
  const statusByWpId = new Map();
  // why: split on `\r?\n` so the parser is correct on this repo's CRLF
  // governance docs — a `$`-anchored row regex would otherwise fail on the
  // trailing `\r` (`.` does not match a carriage return).
  for (const line of workIndexText.split(/\r?\n/)) {
    const checkboxMatch = line.match(/^\s*-\s*\[([ xX])\]\s+(.*)$/);
    if (checkboxMatch === null) {
      continue;
    }
    const checkboxCharacter = checkboxMatch[1];
    const remainder = checkboxMatch[2];
    const idMatch = remainder.match(WP_ID_REGEX);
    if (idMatch === null) {
      // why: a checkbox row that names no WP id is the `- [ ] WP-NNN …`
      // template example, not a real work packet. Skip it so the ledger
      // count stays exact (count-parity).
      continue;
    }
    const wpId = idMatch[0];
    let status;
    if (checkboxCharacter === ' ') {
      // why: an open row that names "Blocked" is waiting on an unmet
      // dependency, not ready to execute — it is tallied separately.
      status = /\bBlocked\b/.test(remainder) ? 'blocked' : 'open';
    } else {
      status = 'done';
    }
    statusByWpId.set(wpId, status);
  }
  return statusByWpId;
}

/**
 * Extract the content of a mindmap node line (`["…"]`) — the text between
 * the opening `["` and the closing `"]`.
 *
 * @param {string} trimmedLine — a node line, already trimmed of indentation
 * @returns {string}
 */
function extractNodeLabel(trimmedLine) {
  let inner = trimmedLine;
  if (inner.startsWith('["')) {
    inner = inner.slice(2);
  }
  if (inner.endsWith('"]')) {
    inner = inner.slice(0, inner.length - 2);
  }
  return inner;
}

/**
 * Read a node's leading id token. A real WP/FP node leads with its id
 * (`WP-001 …`, `WP-005A/B …`, `WP-043..047 …`, `FP-01 …`). A placeholder,
 * annotation, or reference node leads with an icon or prose and has no id.
 *
 * why: only the LEADING token is the node's id. Descriptive prose later in
 * the label (e.g. a Next-Horizons node mentioning `WP-230..235`) must NOT
 * be read as an id — that would double-count those WPs and mis-classify the
 * placeholder cluster.
 *
 * @param {string} label — the node label content
 * @returns {string | null} the leading id, or null if the node has none
 */
function extractLeadingId(label) {
  const firstToken = label.trim().split(/\s+/)[0] ?? '';
  if (/^WP-\d{3}/.test(firstToken)) {
    return firstToken;
  }
  if (/^FP-/.test(firstToken)) {
    return firstToken;
  }
  return null;
}

/**
 * Read the first status icon present in a node label, or null if none.
 *
 * @param {string} label — the node label content
 * @returns {string | null}
 */
function extractIcon(label) {
  for (const character of label) {
    if (STATUS_ICONS.includes(character)) {
      return character;
    }
  }
  return null;
}

/**
 * Parse the `mindmap` block of `docs/05-ROADMAP-MINDMAP.md` into an ordered
 * list of nodes, each tagged with its owning cluster heading.
 *
 * Cluster headings are indented label lines; nodes are `["…"]` bracket-quote
 * lines beneath a heading. The `mindmap` keyword, the `root((…))` line, and
 * the root descriptor (the `["…"]` line that precedes the first heading) are
 * ignored. Cluster and node order is preserved exactly as it appears.
 *
 * @param {string} roadmapText — full text of docs/05-ROADMAP-MINDMAP.md
 * @returns {Array<{ cluster: string, nodeId: string | null, icon: string | null, isCrossRef: boolean }>}
 */
export function parseMindmap(roadmapText) {
  const nodes = [];
  let insideBlock = false;
  let currentCluster = null;
  for (const rawLine of roadmapText.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!insideBlock) {
      if (trimmed === '```mermaid') {
        insideBlock = true;
      }
      continue;
    }
    if (trimmed === '```') {
      break;
    }
    if (trimmed === '' || trimmed === 'mindmap' || trimmed.startsWith('root((')) {
      continue;
    }
    if (trimmed.startsWith('["')) {
      if (currentCluster === null) {
        // why: a node before any cluster heading is the root descriptor
        // ("Multiplayer Deck-Builder …"); it belongs to no cluster.
        continue;
      }
      const label = extractNodeLabel(trimmed);
      nodes.push({
        cluster: currentCluster,
        nodeId: extractLeadingId(label),
        icon: extractIcon(label),
        // why: a cross-reference node carries the case-sensitive substring
        // "(see " — e.g. "WP-048..051 … (see Scoring & PAR)". It is counted
        // once in its real cluster, never here.
        isCrossRef: label.includes('(see '),
      });
      continue;
    }
    // A non-node, non-keyword indented label is a cluster heading.
    currentCluster = trimmed;
  }
  return nodes;
}

/**
 * Expand a mindmap node id into its member WP/FP ids, encoding the existing
 * counting convention (this generator does not redefine it):
 *   - combined `WP-005A/B` → `[WP-005A, WP-005B]`
 *   - range `WP-043..047` → `[WP-043 … WP-047]`, preserving the left
 *     operand's digit width (`WP-43..47` → `WP-43 … WP-47`)
 *   - `FP-*` → itself (a Foundation Prompt)
 *   - every other id passes through unchanged
 *
 * @param {string} rawId — a node's leading id token
 * @returns {string[]} member ids
 */
export function expandNodeId(rawId) {
  if (rawId.startsWith('FP-')) {
    return [rawId];
  }
  const rangeMatch = rawId.match(/^WP-(\d+)\.\.(\d+)$/);
  if (rangeMatch !== null) {
    const leftOperand = rangeMatch[1];
    const width = leftOperand.length;
    const start = Number.parseInt(leftOperand, 10);
    const end = Number.parseInt(rangeMatch[2], 10);
    const memberIds = [];
    for (let value = start; value <= end; value++) {
      memberIds.push('WP-' + String(value).padStart(width, '0'));
    }
    return memberIds;
  }
  if (rawId.includes('/')) {
    const slashParts = rawId.split('/');
    const head = slashParts[0];
    const base = head.slice(0, head.length - 1);
    const memberIds = [head];
    for (let index = 1; index < slashParts.length; index++) {
      memberIds.push(base + slashParts[index]);
    }
    return memberIds;
  }
  return [rawId];
}

/**
 * Find every WORK_INDEX WP that has no mindmap node (an orphan).
 *
 * @param {Map<string, string>} workIndexStatus — output of parseWorkIndex
 * @param {Array<object>} mindmapNodes — output of parseMindmap
 * @returns {string[]} orphan WP ids, in WORK_INDEX order
 */
export function findOrphans(workIndexStatus, mindmapNodes) {
  const notedWpIds = new Set();
  for (const node of mindmapNodes) {
    if (node.nodeId === null) {
      continue;
    }
    for (const memberId of expandNodeId(node.nodeId)) {
      if (memberId.startsWith('WP-')) {
        notedWpIds.add(memberId);
      }
    }
  }
  const orphans = [];
  for (const wpId of workIndexStatus.keys()) {
    if (!notedWpIds.has(wpId)) {
      orphans.push(wpId);
    }
  }
  return orphans;
}

/**
 * Classify one cluster's nodes into a tally record.
 *
 * @param {string} cluster — the cluster heading
 * @param {Array<object>} nodes — the cluster's nodes, in source order
 * @param {Map<string, string>} workIndexStatus — output of parseWorkIndex
 * @returns {object} a record tagged with `kind`
 */
function classifyCluster(cluster, nodes, workIndexStatus) {
  const workPacketMemberIds = [];
  let foundationDone = 0;
  let foundationTotal = 0;
  for (const node of nodes) {
    if (node.nodeId === null || node.isCrossRef) {
      continue;
    }
    for (const memberId of expandNodeId(node.nodeId)) {
      if (memberId.startsWith('FP-')) {
        foundationTotal += 1;
        // why: Foundation Prompts are not WORK_INDEX rows, so their
        // done-state comes from the mindmap node icon — the only source
        // they have. They are reported as a separate `+N/N` addend, never
        // folded into the WP total.
        if (node.icon === DONE_ICON) {
          foundationDone += 1;
        }
      } else if (memberId.startsWith('WP-')) {
        workPacketMemberIds.push(memberId);
      }
    }
  }

  if (workPacketMemberIds.length > 0) {
    let done = 0;
    let blocked = 0;
    let open = 0;
    let total = 0;
    for (const wpId of workPacketMemberIds) {
      const status = workIndexStatus.get(wpId);
      if (status === undefined) {
        // why: a node id with no WORK_INDEX row is a phantom (the reverse of
        // an orphan); it is out of this generator's scope, so it is not
        // tallied rather than guessed at.
        continue;
      }
      total += 1;
      if (status === 'done') {
        done += 1;
      } else if (status === 'blocked') {
        blocked += 1;
      } else {
        open += 1;
      }
    }
    return { kind: 'wp', cluster, done, total, blocked, open };
  }

  if (foundationTotal > 0) {
    return { kind: 'foundation', cluster, done: foundationDone, total: foundationTotal };
  }

  const isPlaceholder = nodes.length > 0 && nodes.every(
    (node) => node.nodeId === null && (node.icon === QUEUED_ICON || node.icon === PLACEHOLDER_ICON),
  );
  if (isPlaceholder) {
    let queued = 0;
    let placeholders = 0;
    for (const node of nodes) {
      if (node.icon === QUEUED_ICON) {
        queued += 1;
      } else if (node.icon === PLACEHOLDER_ICON) {
        placeholders += 1;
      }
    }
    return { kind: 'placeholder', cluster, total: nodes.length, queued, placeholders };
  }

  // why: a cluster with no WP/FP members and no placeholder icons (the
  // "Reference (one-line pointers)" navigation cluster) is not a count
  // surface; it is excluded from the table entirely.
  return { kind: 'excluded', cluster };
}

/**
 * Tally every cluster in mindmap source order.
 *
 * @param {Map<string, string>} workIndexStatus — output of parseWorkIndex
 * @param {Array<object>} mindmapNodes — output of parseMindmap
 * @returns {object[]} per-cluster records, in source order
 */
export function tallyClusters(workIndexStatus, mindmapNodes) {
  const clusterOrder = [];
  const nodesByCluster = new Map();
  for (const node of mindmapNodes) {
    if (!nodesByCluster.has(node.cluster)) {
      nodesByCluster.set(node.cluster, []);
      clusterOrder.push(node.cluster);
    }
    nodesByCluster.get(node.cluster).push(node);
  }
  const records = [];
  for (const cluster of clusterOrder) {
    records.push(classifyCluster(cluster, nodesByCluster.get(cluster), workIndexStatus));
  }
  return records;
}

/**
 * Render the "Open" column for a WP cluster from its blocked / open counts.
 *
 * @param {number} blocked
 * @param {number} open
 * @returns {string}
 */
function renderOpenColumn(blocked, open) {
  const parts = [];
  if (blocked > 0) {
    parts.push(`${blocked} ${BLOCKED_ICON}`);
  }
  if (open > 0) {
    parts.push(`${open} open`);
  }
  return parts.length === 0 ? '—' : parts.join(', ');
}

/**
 * Render the "Open" column for a placeholder cluster (`N 📦 queued` /
 * `N 📝 placeholders`).
 *
 * @param {number} queued
 * @param {number} placeholders
 * @returns {string}
 */
function renderPlaceholderColumn(queued, placeholders) {
  const parts = [];
  if (queued > 0) {
    parts.push(`${queued} ${QUEUED_ICON} queued`);
  }
  if (placeholders > 0) {
    parts.push(`${placeholders} ${PLACEHOLDER_ICON} placeholders`);
  }
  return parts.length === 0 ? '—' : parts.join(', ');
}

/**
 * Render the single WORK_INDEX-derived open/blocked summary line, listing
 * every non-done WP in WORK_INDEX order.
 *
 * @param {Map<string, string>} workIndexStatus — output of parseWorkIndex
 * @returns {string}
 */
function renderOpenBlockedSummary(workIndexStatus) {
  const nonDone = [];
  for (const [wpId, status] of workIndexStatus) {
    if (status === 'blocked') {
      nonDone.push(`${wpId} ${BLOCKED_ICON} blocked`);
    } else if (status === 'open') {
      nonDone.push(`${wpId} open`);
    }
  }
  const body = nonDone.length === 0 ? 'none — every WORK_INDEX WP is done.' : nonDone.join('; ') + '.';
  return `**Open / blocked WPs (derived from WORK_INDEX, ${nonDone.length}):** ${body}`;
}

/**
 * Render the full regenerated section: the count table plus the single
 * WORK_INDEX-derived open/blocked summary line. Deterministic — identical
 * input yields a byte-identical string.
 *
 * @param {object[]} records — output of tallyClusters
 * @param {Map<string, string>} workIndexStatus — output of parseWorkIndex
 * @returns {string}
 */
export function renderCountTable(records, workIndexStatus) {
  const rows = ['| Cluster | Done | Open |', '|---|---|---|'];
  let workPacketDone = 0;
  let workPacketTotal = 0;
  let totalBlocked = 0;
  let totalOpen = 0;
  let foundationDone = 0;
  let foundationTotal = 0;
  for (const record of records) {
    if (record.kind === 'wp') {
      rows.push(`| ${record.cluster} | ${record.done}/${record.total} | ${renderOpenColumn(record.blocked, record.open)} |`);
      workPacketDone += record.done;
      workPacketTotal += record.total;
      totalBlocked += record.blocked;
      totalOpen += record.open;
    } else if (record.kind === 'foundation') {
      rows.push(`| ${record.cluster} (Foundation Prompts) | ${record.done}/${record.total} | — |`);
      foundationDone += record.done;
      foundationTotal += record.total;
    } else if (record.kind === 'placeholder') {
      rows.push(`| ${record.cluster} | 0/${record.total} | ${renderPlaceholderColumn(record.queued, record.placeholders)} |`);
    }
    // why: an 'excluded' record (the Reference cluster) emits no row.
  }
  rows.push(
    `| **Total** | **${workPacketDone}/${workPacketTotal} WP ${DONE_ICON}** (+ ${foundationDone}/${foundationTotal} Foundation Prompts) | ${renderOpenColumn(totalBlocked, totalOpen)} |`,
  );
  return rows.join('\n') + '\n\n' + renderOpenBlockedSummary(workIndexStatus);
}

// ---------------------------------------------------------------------------
// Marker handling — locate and replace ONLY the bounded section
// ---------------------------------------------------------------------------

/**
 * Verify the roadmap file carries exactly one START and one END marker, in
 * order.
 *
 * @param {string} roadmapText
 * @param {string} eol — the file's line terminator (`\r\n` or `\n`)
 * @returns {{ ok: boolean, startIndex: number, endIndex: number }}
 */
export function checkMarkerIntegrity(roadmapText, eol) {
  const lines = roadmapText.split(eol);
  const startMatches = [];
  const endMatches = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    // why: a marker is an HTML-comment line, not a prose mention of the
    // token. Requiring `<!--` on the line lets the generated doc reference
    // the marker name in its own changelog/notes (e.g. "bounded by the
    // ROADMAP-COUNTS:START marker") without the integrity scan counting that
    // prose as a duplicate marker and refusing to write.
    if (line.includes('<!--') && line.includes(MARKER_START_TOKEN)) {
      startMatches.push(index);
    }
    if (line.includes('<!--') && line.includes(MARKER_END_TOKEN)) {
      endMatches.push(index);
    }
  }
  const ok = startMatches.length === 1 && endMatches.length === 1 && startMatches[0] < endMatches[0];
  return {
    ok,
    startIndex: ok ? startMatches[0] : -1,
    endIndex: ok ? endMatches[0] : -1,
  };
}

/**
 * Replace ONLY the lines between the START and END marker lines with the
 * regenerated section. The marker lines themselves and every byte outside
 * them are preserved exactly.
 *
 * why: the generator is the sole writer of the marker-bounded section, but
 * the rest of the document (the mindmap nodes, the explanatory prose) is
 * hand-maintained and must survive a `--write` untouched. Rewriting only
 * the span — never the whole file — is what guarantees that.
 *
 * @param {string} roadmapText
 * @param {string} generatedSection
 * @param {{ startIndex: number, endIndex: number }} integrity
 * @param {string} eol — the file's line terminator (`\r\n` or `\n`)
 * @returns {string}
 */
function replaceMarkedSection(roadmapText, generatedSection, integrity, eol) {
  // why: split AND join on the file's own EOL so every untouched line is
  // byte-preserved (the round-trip is lossless); the regenerated section is
  // re-terminated to match, keeping the rest of the document unchanged.
  const lines = roadmapText.split(eol);
  const before = lines.slice(0, integrity.startIndex + 1);
  const after = lines.slice(integrity.endIndex);
  return [...before, ...generatedSection.split('\n'), ...after].join(eol);
}

// ---------------------------------------------------------------------------
// CLI wrapper — wires args → helpers → file / stdout. Returns an exit code.
// ---------------------------------------------------------------------------

/**
 * Run the command-line interface. Returns the process exit code rather than
 * calling `process.exit` so buffered stdout flushes before the process ends.
 *
 * @param {string[]} args — argv past the script name
 * @returns {Promise<number>} exit code
 */
async function runCli(args) {
  const mode = args.includes('--write') ? 'write' : args.includes('--check') ? 'check' : 'default';

  let workIndexText;
  let roadmapText;
  try {
    workIndexText = await readFile(WORK_INDEX_PATH, 'utf8');
    roadmapText = await readFile(ROADMAP_PATH, 'utf8');
  } catch (error) {
    process.stderr.write(`roadmap-counts: could not read a source document (${error.message}). Check that WORK_INDEX.md and docs/05-ROADMAP-MINDMAP.md exist.\n`);
    return 1;
  }

  const workIndexStatus = parseWorkIndex(workIndexText);
  const mindmapNodes = parseMindmap(roadmapText);

  // why: the orphan gate (D-24002) fires in EVERY mode, ahead of any render
  // or write. A WORK_INDEX WP with no mindmap node is named and the run
  // exits non-zero so no work packet can be silently uncounted; `--write`
  // refuses to rewrite while an orphan exists. Loud fail — never bucketed.
  const orphans = findOrphans(workIndexStatus, mindmapNodes);
  if (orphans.length > 0) {
    for (const wpId of orphans) {
      process.stdout.write(`ORPHAN: ${wpId} — add a mindmap node for this WP\n`);
    }
    return 1;
  }

  const records = tallyClusters(workIndexStatus, mindmapNodes);
  const generatedSection = renderCountTable(records, workIndexStatus);

  if (mode === 'default') {
    process.stdout.write(generatedSection + '\n');
    return 0;
  }

  // why: detect the file's own line terminator so the write path preserves
  // it exactly (these governance docs are CRLF; rewriting them as LF would
  // diff every line and violate the byte-unchanged-outside-markers contract).
  const eol = roadmapText.includes('\r\n') ? '\r\n' : '\n';
  const integrity = checkMarkerIntegrity(roadmapText, eol);
  if (!integrity.ok) {
    process.stdout.write('ERROR: ROADMAP-COUNTS markers not found or invalid\n');
    return 1;
  }

  const updatedRoadmap = replaceMarkedSection(roadmapText, generatedSection, integrity, eol);

  if (mode === 'check') {
    if (updatedRoadmap === roadmapText) {
      return 0;
    }
    process.stdout.write('roadmap-counts: docs/05-ROADMAP-MINDMAP.md count table is out of date — run `pnpm roadmap:counts:write`.\n');
    return 2;
  }

  try {
    await writeFile(ROADMAP_PATH, updatedRoadmap, 'utf8');
  } catch (error) {
    process.stderr.write(`roadmap-counts: could not write docs/05-ROADMAP-MINDMAP.md (${error.message}).\n`);
    return 1;
  }
  return 0;
}

/**
 * Report whether this file was invoked directly as a CLI (vs imported by the
 * test for its pure helpers).
 *
 * why: this module is both an importable library (the `.test.ts` imports the
 * pure helpers) and a CLI. Guarding the CLI behind a direct-run check keeps
 * importing the helpers side-effect free.
 *
 * @returns {boolean}
 */
function isRunDirectly() {
  const invokedPath = process.argv[1];
  if (invokedPath === undefined) {
    return false;
  }
  return resolve(invokedPath) === fileURLToPath(import.meta.url);
}

if (isRunDirectly()) {
  runCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      // why: an uncaught failure must surface as a non-zero exit, never be
      // swallowed — a silently-zero crash would let the cron PR stale counts.
      process.stderr.write(`roadmap-counts failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}
