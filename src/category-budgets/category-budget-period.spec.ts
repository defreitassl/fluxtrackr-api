import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getBudgetPeriod } from './category-budget-period';

describe('getBudgetPeriod', () => {
  const asOf = new Date('2026-07-15T14:00:00.123Z');

  it('uses complete prior month, exact current instant, and null future cutoff', () => {
    assert.deepEqual(getBudgetPeriod(2026, 6, asOf), {
      monthStart: new Date('2026-06-01T00:00:00.000Z'), monthEnd: new Date('2026-06-30T23:59:59.999Z'), realizedUntil: new Date('2026-06-30T23:59:59.999Z'),
    });
    assert.deepEqual(getBudgetPeriod(2026, 7, asOf), {
      monthStart: new Date('2026-07-01T00:00:00.000Z'), monthEnd: new Date('2026-07-31T23:59:59.999Z'), realizedUntil: asOf,
    });
    assert.equal(getBudgetPeriod(2026, 8, asOf).realizedUntil, null);
  });

  it('keeps UTC boundaries for first/last day and leap February', () => {
    assert.equal(getBudgetPeriod(2026, 7, new Date('2026-07-01T00:00:00.000Z')).realizedUntil?.toISOString(), '2026-07-01T00:00:00.000Z');
    assert.equal(getBudgetPeriod(2026, 7, new Date('2026-07-31T23:59:59.999Z')).realizedUntil?.toISOString(), '2026-07-31T23:59:59.999Z');
    assert.equal(getBudgetPeriod(2028, 2, new Date('2028-03-01T00:00:00.000Z')).monthEnd.toISOString(), '2028-02-29T23:59:59.999Z');
    assert.equal(getBudgetPeriod(2026, 2, new Date('2026-03-01T00:00:00.000Z')).monthEnd.toISOString(), '2026-02-28T23:59:59.999Z');
  });
});
