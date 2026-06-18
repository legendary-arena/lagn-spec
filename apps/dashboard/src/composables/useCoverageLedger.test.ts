import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  statusLabel,
  buildMechanicDictionary,
  executablePercent,
  useCoverageLedger,
} from './useCoverageLedger.js';
import type {
  CoverageLedger,
  LedgerRow,
  LedgerStatus,
  RuntimeObservedEntry,
  RuntimeObservedHollows,
} from '../types/coverage.js';

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

function makeRuntimeObserved(
  byMechanic: Record<string, RuntimeObservedEntry>,
): RuntimeObservedHollows {
  return {
    schemaVersion: 1,
    generatedFrom: { runSeed: 'test-seed', gamesPlayed: 1, matrixDescription: 'test matrix' },
    summary: {
      distinctMechanics: Object.keys(byMechanic).length,
      totalObservations: 0,
      hollowEffectsDropped: 0,
      byReason: { 'no-handler': 0, 'unsupported-keyword': 0, 'parse-unrecognized': 0 },
    },
    byMechanic,
  };
}

test('useCoverageLedger joins the runtime-observed overlay by mechanic key (present / absent)', () => {
  const ledger = makeLedger([
    makeRow({ extId: 'a', mechanic: 'phase', status: 'unsupported' }),
    makeRow({ extId: 'b', mechanic: 'berserk', status: 'executable' }),
  ]);
  const runtimeObserved = makeRuntimeObserved({
    phase: {
      hitCount: 3,
      lastSeenTurn: 7,
      byReason: { 'no-handler': 3, 'unsupported-keyword': 0, 'parse-unrecognized': 0 },
      examples: [{ cardId: 'wwhk/korg', cardType: 'hero', timing: 'onPlay', reason: 'no-handler' }],
    },
  });
  const view = useCoverageLedger({ ledger, runtimeObserved });

  // present: a mechanic in the artifact reads its runtime-observed entry by key
  const observed = view.runtimeObservedByMechanic.value['phase'];
  assert.equal(observed?.hitCount, 3);
  assert.equal(observed?.lastSeenTurn, 7);
  assert.equal(observed?.byReason['no-handler'], 3);
  // absent: a mechanic NOT in the artifact reads as none ("not observed in play")
  assert.equal(view.runtimeObservedByMechanic.value['berserk'], undefined);
  // the run-level summary is exposed for the page header
  assert.equal(view.runtimeObservedSummary.value.distinctMechanics, 1);
});

test('useCoverageLedger falls back to the bundled runtime-observed artifact when none is injected', () => {
  const view = useCoverageLedger();
  // The bundled artifact is the real one — byMechanic is a record (possibly empty
  // when the committed sweep observed no runtime hollows), summary is present.
  assert.equal(typeof view.runtimeObservedByMechanic.value, 'object');
  assert.ok(view.runtimeObservedSummary.value.distinctMechanics >= 0);
});
