import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  statusLabel,
  buildMechanicDictionary,
  executablePercent,
  useCoverageLedger,
} from './useCoverageLedger.js';
import type { CoverageLedger, LedgerRow, LedgerStatus } from '../types/coverage.js';

function makeRow(overrides: Partial<LedgerRow>): LedgerRow {
  return {
    extId: 'set/card',
    heroName: 'A Hero',
    set: 'set',
    mechanic: 'draw',
    status: 'executable',
    wp: '',
    decision: '',
    handler: '',
    ...overrides,
  };
}

function makeLedger(rows: LedgerRow[]): CoverageLedger {
  const byStatus = { executable: 0, deferred: 0, unsupported: 0, unmarked: 0 };
  const distinct = new Set<string>();
  for (const row of rows) {
    byStatus[row.status] += 1;
    if (row.mechanic !== '(unmarked)') {
      distinct.add(row.mechanic);
    }
  }
  return {
    schemaVersion: 1,
    cardType: 'hero',
    summary: { totalRows: rows.length, byStatus, distinctMechanics: distinct.size },
    rows,
  };
}

test('statusLabel covers every status and throws on an unknown one', () => {
  assert.equal(statusLabel('executable'), 'Executable');
  assert.equal(statusLabel('deferred'), 'Deferred');
  assert.equal(statusLabel('unsupported'), 'Unsupported');
  assert.equal(statusLabel('unmarked'), 'Unmarked');
  assert.throws(() => statusLabel('mystery' as unknown as LedgerStatus));
});

test('buildMechanicDictionary groups by mechanic, counts cards, and excludes unmarked', () => {
  const rows: LedgerRow[] = [
    makeRow({ extId: 'a', mechanic: 'berserk', status: 'executable', wp: 'WP-256' }),
    makeRow({ extId: 'b', mechanic: 'berserk', status: 'executable', wp: 'WP-256' }),
    makeRow({ extId: 'c', mechanic: 'undercover', status: 'unsupported' }),
    makeRow({ extId: 'd', mechanic: '(unmarked)', status: 'unmarked' }),
  ];
  const dict = buildMechanicDictionary(rows);

  // unmarked excluded → two distinct mechanics
  assert.equal(dict.length, 2);
  // worklist sort: unsupported before executable
  assert.equal(dict[0]?.mechanic, 'undercover');
  assert.equal(dict[0]?.status, 'unsupported');
  const berserk = dict.find((entry) => entry.mechanic === 'berserk');
  assert.equal(berserk?.cardCount, 2);
  assert.equal(berserk?.wp, 'WP-256');
});

test('buildMechanicDictionary sorts same-status entries by card count then name', () => {
  const rows: LedgerRow[] = [
    makeRow({ extId: 'a', mechanic: 'small', status: 'unsupported' }),
    makeRow({ extId: 'b', mechanic: 'big', status: 'unsupported' }),
    makeRow({ extId: 'c', mechanic: 'big', status: 'unsupported' }),
  ];
  const dict = buildMechanicDictionary(rows);
  assert.equal(dict[0]?.mechanic, 'big'); // higher count first
  assert.equal(dict[1]?.mechanic, 'small');
});

test('executablePercent computes a rounded share and handles an empty ledger', () => {
  const ledger = makeLedger([
    makeRow({ extId: 'a', status: 'executable' }),
    makeRow({ extId: 'b', status: 'unsupported', mechanic: 'x' }),
    makeRow({ extId: 'c', status: 'unsupported', mechanic: 'y' }),
    makeRow({ extId: 'd', status: 'unsupported', mechanic: 'z' }),
  ]);
  assert.equal(executablePercent(ledger), 25); // 1/4
  assert.equal(executablePercent(makeLedger([])), 0);
});

test('useCoverageLedger exposes the injected ledger summary + mechanic dictionary', () => {
  const ledger = makeLedger([
    makeRow({ extId: 'a', mechanic: 'berserk', status: 'executable' }),
    makeRow({ extId: 'b', mechanic: 'undercover', status: 'unsupported' }),
  ]);
  const view = useCoverageLedger({ ledger });
  assert.equal(view.summary.value.totalRows, 2);
  assert.equal(view.percentExecutable.value, 50);
  assert.equal(view.mechanics.value.length, 2);
  assert.equal(view.rows.value.length, 2);
});

test('useCoverageLedger falls back to the bundled ledger when none is injected', () => {
  const view = useCoverageLedger();
  // The bundled ledger is the real hero ledger — non-empty, hero card type.
  assert.ok(view.summary.value.totalRows > 0);
  assert.ok(view.mechanics.value.length > 0);
});
