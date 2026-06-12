/**
 * Tests for scripts/roadmap-counts.mjs — the roadmap count-table generator.
 *
 * Runs under the native Node test runner via:
 *   node --import tsx --test scripts/roadmap-counts.test.ts
 *
 * Coverage: WORK_INDEX status parsing (`[x]`/`[ ]`/`Blocked`), node/cluster
 * classification, combined-line + range + FP expansion, cross-ref skip,
 * placeholder `0/N`, orphan detection, render determinism, marker integrity,
 * and the count-parity invariant against the real WORK_INDEX.md.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WP_ID_REGEX,
  parseWorkIndex,
  parseMindmap,
  expandNodeId,
  findOrphans,
  tallyClusters,
  renderCountTable,
  checkMarkerIntegrity,
} from './roadmap-counts.mjs';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIRECTORY, '..');

// A small self-contained WORK_INDEX fixture exercising every status form.
const WORK_INDEX_FIXTURE = [
  '- [x] WP-005A — Combined first half. Done.',
  '- [x] WP-005B — Combined second half. Done.',
  '- [x] WP-053a — Lowercase suffix. Done.',
  '- [x] WP-053 — Base id, distinct from WP-053a. Done.',
  '- [ ] WP-300 — An open packet, ready to execute.',
  '- [ ] WP-301 — A packet **Blocked** on an unmet dependency.',
  '- [x] WP-400 — A done packet that has no mindmap node (orphan).',
  '- [ ] WP-NNN — Short Title — template example, not a real WP.',
  'Some prose line that is not a checkbox row.',
].join('\n');

// A small mindmap fixture covering combined, cross-ref, FP, placeholder,
// annotation, and reference nodes.
const MINDMAP_FIXTURE = [
  '```mermaid',
  'mindmap',
  '  root((Test Root))',
  '    ["Descriptor — belongs to no cluster, ignored"]',
  '',
  '      Phase X',
  '        ["WP-005A/B ✅ Combined node expands to two members"]',
  '        ["✅ Annotation node with no leading id"]',
  '        ["WP-053a ✅ Lowercase member"]',
  '        ["WP-053 ✅ Base member"]',
  '',
  '      Phase Y',
  '        ["WP-300 🚧 Open member"]',
  '        ["WP-301 ⏸ Blocked member"]',
  '        ["WP-048..051 ✅ PAR pipeline (see Scoring & PAR)"]',
  '',
  '      Foundation',
  '        ["FP-01 ✅ Foundation prompt one"]',
  '        ["FP-02 ✅ Foundation prompt two"]',
  '',
  '      Next Horizons',
  '        ["📦 A queued idea"]',
  '        ["📦 Another queued idea"]',
  '',
  '      Phase 10',
  '        ["📝 A placeholder"]',
  '',
  '      Reference',
  '        ["docs/x.md — a pointer, not a WP"]',
  '```',
].join('\n');

test('parseWorkIndex reads done / open / blocked and skips the template row', () => {
  const status = parseWorkIndex(WORK_INDEX_FIXTURE);
  assert.equal(status.get('WP-005A'), 'done');
  assert.equal(status.get('WP-300'), 'open');
  assert.equal(status.get('WP-301'), 'blocked');
  assert.equal(status.get('WP-400'), 'done');
  // The `WP-NNN` template row carries no real WP id and is not captured.
  assert.equal(status.has('WP-NNN'), false);
});

test('parseWorkIndex keeps lowercase-suffixed and base ids distinct', () => {
  // why: an `[A-Z]`-only regex would truncate WP-053a to WP-053 and collide
  // it with the real WP-053 row, losing one entry. The canonical [A-Za-z]
  // regex keeps both.
  const status = parseWorkIndex(WORK_INDEX_FIXTURE);
  assert.equal(status.get('WP-053a'), 'done');
  assert.equal(status.get('WP-053'), 'done');
  assert.equal(WP_ID_REGEX.source.includes('A-Za-z'), true);
});

test('parseWorkIndex count-parity holds against the real WORK_INDEX.md', () => {
  // AC#10: parseWorkIndex must capture EVERY checkbox WP row. The raw count
  // (checkbox + WP-3-digits, suffix-independent) must equal the parsed size;
  // any regex gap that drops or collides a row fails loudly here.
  const realWorkIndex = readFileSync(
    resolve(REPO_ROOT, 'docs', 'ai', 'work-packets', 'WORK_INDEX.md'),
    'utf8',
  );
  const rawRowCount = (realWorkIndex.match(/^\s*-\s*\[[ xX]\]\s+WP-\d{3}/gm) ?? []).length;
  assert.ok(rawRowCount > 0, 'expected at least one WP row in WORK_INDEX.md');
  assert.equal(parseWorkIndex(realWorkIndex).size, rawRowCount);
});

test('expandNodeId expands combined, range, and FP ids; passes others through', () => {
  assert.deepEqual(expandNodeId('WP-005A/B'), ['WP-005A', 'WP-005B']);
  // Range preserves the left operand's digit width.
  assert.deepEqual(expandNodeId('WP-043..047'), ['WP-043', 'WP-044', 'WP-045', 'WP-046', 'WP-047']);
  assert.deepEqual(expandNodeId('WP-43..47'), ['WP-43', 'WP-44', 'WP-45', 'WP-46', 'WP-47']);
  assert.deepEqual(expandNodeId('FP-01'), ['FP-01']);
  assert.deepEqual(expandNodeId('WP-100'), ['WP-100']);
  assert.deepEqual(expandNodeId('WP-042.1'), ['WP-042.1']);
});

test('parseMindmap classifies nodes, skips the root descriptor, flags cross-refs', () => {
  const nodes = parseMindmap(MINDMAP_FIXTURE);
  // The root descriptor (before any heading) is not a node.
  assert.equal(nodes.some((node) => node.cluster === undefined), false);
  const phaseXNodes = nodes.filter((node) => node.cluster === 'Phase X');
  assert.deepEqual(
    phaseXNodes.map((node) => node.nodeId),
    ['WP-005A/B', null, 'WP-053a', 'WP-053'],
  );
  const crossRef = nodes.find((node) => node.nodeId === 'WP-048..051');
  assert.equal(crossRef?.isCrossRef, true);
  const queued = nodes.find((node) => node.cluster === 'Next Horizons');
  assert.equal(queued?.icon, '📦');
});

test('findOrphans reports a WORK_INDEX WP with no mindmap node', () => {
  const status = parseWorkIndex(WORK_INDEX_FIXTURE);
  const nodes = parseMindmap(MINDMAP_FIXTURE);
  const orphans = findOrphans(status, nodes);
  assert.deepEqual(orphans, ['WP-400']);
});

test('tallyClusters counts WP clusters, FP addend, placeholders, and skips cross-refs', () => {
  const status = parseWorkIndex(WORK_INDEX_FIXTURE);
  const nodes = parseMindmap(MINDMAP_FIXTURE);
  const records = tallyClusters(status, nodes);
  const byCluster = new Map(records.map((record) => [record.cluster, record]));

  const phaseX = byCluster.get('Phase X');
  assert.equal(phaseX.kind, 'wp');
  assert.deepEqual([phaseX.done, phaseX.total], [4, 4]);

  // Cross-ref node is skipped, so Phase Y counts only WP-300 + WP-301.
  const phaseY = byCluster.get('Phase Y');
  assert.deepEqual([phaseY.done, phaseY.total, phaseY.blocked, phaseY.open], [0, 2, 1, 1]);

  const foundation = byCluster.get('Foundation');
  assert.equal(foundation.kind, 'foundation');
  assert.deepEqual([foundation.done, foundation.total], [2, 2]);

  const nextHorizons = byCluster.get('Next Horizons');
  assert.equal(nextHorizons.kind, 'placeholder');
  assert.deepEqual([nextHorizons.total, nextHorizons.queued], [2, 2]);

  const phase10 = byCluster.get('Phase 10');
  assert.deepEqual([phase10.kind, phase10.total, phase10.placeholders], ['placeholder', 1, 1]);

  // The Reference cluster has no WP/FP members and no placeholder icons.
  assert.equal(byCluster.get('Reference').kind, 'excluded');
});

test('renderCountTable is byte-deterministic and reflects the tally', () => {
  const status = parseWorkIndex(WORK_INDEX_FIXTURE);
  const nodes = parseMindmap(MINDMAP_FIXTURE);
  const records = tallyClusters(status, nodes);
  const first = renderCountTable(records, status);
  const second = renderCountTable(records, status);
  assert.equal(first, second);

  assert.match(first, /\| Phase X \| 4\/4 \| — \|/);
  assert.match(first, /\| Phase Y \| 0\/2 \| 1 ⏸, 1 open \|/);
  assert.match(first, /\| Foundation \(Foundation Prompts\) \| 2\/2 \| — \|/);
  assert.match(first, /\| Next Horizons \| 0\/2 \| 2 📦 queued \|/);
  assert.match(first, /\| Phase 10 \| 0\/1 \| 1 📝 placeholders \|/);
  // The excluded Reference cluster emits no row.
  assert.equal(first.includes('| Reference '), false);
  // WP total excludes Foundation Prompts (reported as a separate addend).
  assert.match(first, /\| \*\*Total\*\* \| \*\*4\/6 WP ✅\*\* \(\+ 2\/2 Foundation Prompts\) \| 1 ⏸, 1 open \|/);
  // The single WORK_INDEX-derived open/blocked summary line, in ledger order
  // (WP-300 precedes WP-301 in the fixture, so it is listed first).
  assert.match(first, /\*\*Open \/ blocked WPs \(derived from WORK_INDEX, 2\):\*\* WP-300 open; WP-301 ⏸ blocked\./);
});

test('checkMarkerIntegrity accepts one ordered pair and rejects missing or duplicated markers', () => {
  const valid = [
    'intro',
    '<!-- ROADMAP-COUNTS:START (do not hand-edit) -->',
    'generated body',
    '<!-- ROADMAP-COUNTS:END -->',
    'outro',
  ].join('\n');
  assert.equal(checkMarkerIntegrity(valid, '\n').ok, true);

  const missing = 'no markers here at all';
  assert.equal(checkMarkerIntegrity(missing, '\n').ok, false);

  const duplicated = [
    '<!-- ROADMAP-COUNTS:START -->',
    '<!-- ROADMAP-COUNTS:START -->',
    '<!-- ROADMAP-COUNTS:END -->',
  ].join('\n');
  assert.equal(checkMarkerIntegrity(duplicated, '\n').ok, false);
});

test('checkMarkerIntegrity ignores a prose mention of the marker token', () => {
  // A marker is an HTML-comment line; a backtick-quoted mention of the token
  // in the doc's own changelog must NOT count as a duplicate marker.
  const withProse = [
    '<!-- ROADMAP-COUNTS:START -->',
    'generated body',
    '<!-- ROADMAP-COUNTS:END -->',
    'Changelog: the table is bounded by the `ROADMAP-COUNTS:START` marker.',
  ].join('\n');
  assert.equal(checkMarkerIntegrity(withProse, '\n').ok, true);
});
