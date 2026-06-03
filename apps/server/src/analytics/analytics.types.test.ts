/**
 * Drift tests for analytics types (WP-205 / EC-233).
 *
 * Enforces the 3-layer closed-set invariant locked under D-20501:
 *
 *   1. The TypeScript `AcquisitionEventType` union literal members
 *      (exercised via an exhaustive switch).
 *   2. The canonical `ACQUISITION_EVENT_TYPES` readonly array.
 *   3. The SQL `CHECK (event_type IN (...))` constraint text parsed
 *      from `data/migrations/017_create_analytics_events.sql`.
 *
 * All three sources MUST agree byte-identical — same 9 values, same
 * order, no whitespace drift, no case drift. The drift test parses
 * the migration file with EXACT-equality semantics per the D-20501
 * tightening: literal substring match on `'CHECK (event_type IN ('`
 * followed by reading the 9 quoted strings in order; per-element
 * comparison is whitespace-trimmed exact string equality with
 * preserved order and matched element count. Any deviation (extra
 * value, missing value, order swap, whitespace mismatch, case
 * mismatch) fails the test with a sentence-form diagnostic.
 *
 * Authority: WP-205 §Locked contract values + §Acceptance Criteria
 * → Migration / Schema / Drift; EC-233 §After Completing → Sub-task A
 * close (drift test passes with EXACT equality).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ACQUISITION_EVENT_TYPES,
  type AcquisitionEventType,
} from './analytics.types.js';

// why: monorepo root resolution from this test file's location.
// `apps/server/src/analytics/analytics.types.test.ts` is 4 levels
// below the monorepo root; the migration lives at
// `<root>/data/migrations/017_create_analytics_events.sql`.
const THIS_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = resolve(THIS_DIRECTORY, '..', '..', '..', '..');
const MIGRATION_PATH = resolve(
  MONOREPO_ROOT,
  'data',
  'migrations',
  '017_create_analytics_events.sql',
);

// why: D-20501 tightening — the locked 9-value list in canonical order.
// This array is the source of truth the test asserts against; any
// reordering / addition / removal of an entry here must travel with
// the matching change in the migration file's CHECK constraint and
// the `AcquisitionEventType` union AND `ACQUISITION_EVENT_TYPES`
// canonical array in `analytics.types.ts`.
const LOCKED_EVENT_TYPES: readonly string[] = [
  'direct',
  'search',
  'referral',
  'paid',
  'signup-start',
  'signup-complete',
  'first-match-started',
  'first-match-completed',
  'retention-return',
];

/**
 * Parses the locked SQL CHECK constraint text from the migration file
 * and returns the 9 quoted string literals in the order they appear.
 *
 * Implementation: whitespace-normalize the migration's SQL text by
 * collapsing every run of whitespace (spaces, tabs, newlines) to a
 * single space, then literal substring match on
 * `'CHECK ( event_type IN ('` (the normalized anchor form), then
 * scan the parenthesized list for single-quoted strings until the
 * matching `')` closes the IN-list. Each captured string has its
 * leading + trailing whitespace trimmed; the single-quote delimiters
 * are stripped. Returns the captured array.
 *
 * The normalization step is what makes the parse robust to the
 * multi-line indented form WP-205 §Locked contract values uses
 * while preserving the EXACT-equality semantics D-20501 tightening
 * requires for the captured values themselves (the value strings
 * are matched per-element against `ACQUISITION_EVENT_TYPES` with
 * preserved order, matched count, and case-sensitive equality).
 *
 * Throws a full-sentence diagnostic if the locked anchor substring
 * is not found or if the IN-list cannot be closed — both are a
 * structural migration-file regression that the test must surface
 * loudly.
 */
async function parseCheckConstraintValues(): Promise<readonly string[]> {
  const sql = await readFile(MIGRATION_PATH, 'utf8');
  const normalized = sql.replace(/\s+/g, ' ');
  const anchor = 'CHECK ( event_type IN (';
  const anchorIndex = normalized.indexOf(anchor);
  if (anchorIndex === -1) {
    throw new Error(
      `Migration file at ${MIGRATION_PATH} does not contain the locked anchor substring "${anchor}" (whitespace-normalized); the analytics_events_event_type_check constraint has drifted from the D-20501 locked form. Verify the migration file matches WP-205 §Locked contract values byte-identical.`,
    );
  }
  const listStart = anchorIndex + anchor.length;
  const listEnd = normalized.indexOf(')', listStart);
  if (listEnd === -1) {
    throw new Error(
      `Migration file at ${MIGRATION_PATH} contains the CHECK anchor but no closing ')' for the IN-list; the migration is structurally malformed.`,
    );
  }
  const listBody = normalized.substring(listStart, listEnd);
  const captured: string[] = [];
  const quotedRegex = /'([^']*)'/g;
  let match: RegExpExecArray | null = quotedRegex.exec(listBody);
  while (match !== null) {
    captured.push(match[1] ?? '');
    match = quotedRegex.exec(listBody);
  }
  return captured;
}

describe('analytics types — drift detection (WP-205 / EC-233)', () => {
  test('ACQUISITION_EVENT_TYPES deep-equals the locked 9-value list in order (D-20501)', () => {
    assert.deepStrictEqual(
      [...ACQUISITION_EVENT_TYPES],
      [...LOCKED_EVENT_TYPES],
      'ACQUISITION_EVENT_TYPES has drifted from the D-20501 locked 9-value list; update the canonical array in analytics.types.ts to match the locked order byte-identical.',
    );
    assert.equal(
      ACQUISITION_EVENT_TYPES.length,
      9,
      'ACQUISITION_EVENT_TYPES must carry exactly 9 entries per D-20501; the schema-CHECK-route-validator-canonical-array 4-layer enforcement depends on this count.',
    );
  });

  test('every AcquisitionEventType union member appears in ACQUISITION_EVENT_TYPES via an exhaustive switch (D-20501)', () => {
    // why: an exhaustive switch over the union forces a compile-time
    // error if a new union member is added without updating this
    // test. The runtime assertion then confirms each member is
    // present in the canonical array — catches the case where the
    // union grows but the array does not.
    function isMemberPresent(value: AcquisitionEventType): boolean {
      switch (value) {
        case 'direct':
        case 'search':
        case 'referral':
        case 'paid':
        case 'signup-start':
        case 'signup-complete':
        case 'first-match-started':
        case 'first-match-completed':
        case 'retention-return':
          return ACQUISITION_EVENT_TYPES.includes(value);
        default: {
          const exhaustiveCheck: never = value;
          return exhaustiveCheck;
        }
      }
    }
    for (const value of LOCKED_EVENT_TYPES) {
      assert.equal(
        isMemberPresent(value as AcquisitionEventType),
        true,
        `Union member "${value}" was missing from ACQUISITION_EVENT_TYPES; the union and the canonical array have drifted.`,
      );
    }
  });

  test('SQL CHECK constraint values byte-equal ACQUISITION_EVENT_TYPES (D-20501 tightening; EXACT-equality semantics)', async () => {
    const sqlValues = await parseCheckConstraintValues();
    assert.equal(
      sqlValues.length,
      ACQUISITION_EVENT_TYPES.length,
      `SQL CHECK constraint exposes ${sqlValues.length} values; ACQUISITION_EVENT_TYPES has ${ACQUISITION_EVENT_TYPES.length}. The two MUST match element count per D-20501.`,
    );
    for (let index = 0; index < ACQUISITION_EVENT_TYPES.length; index = index + 1) {
      const sqlValue = (sqlValues[index] ?? '').trim();
      const arrayValue = ACQUISITION_EVENT_TYPES[index];
      assert.equal(
        sqlValue,
        arrayValue,
        `SQL CHECK constraint position ${index} carries "${sqlValue}" but ACQUISITION_EVENT_TYPES[${index}] is "${arrayValue}"; the 3-layer closed-set enforcement (union + canonical array + SQL CHECK) has drifted. Update the migration file at ${MIGRATION_PATH} OR the canonical array at analytics.types.ts so both match byte-identical (D-20501 EXACT-equality semantics: per-element exact string equality, preserved order, matched element count, whitespace-trimmed).`,
      );
    }
  });
});
