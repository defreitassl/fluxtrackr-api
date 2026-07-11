import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getNextFinancialEventDate } from './financial-event-recurrence';

describe('getNextFinancialEventDate', () => {
  it('does not create another occurrence for once', () => {
    assert.equal(getNextFinancialEventDate(new Date('2026-01-15T12:00:00Z'), 'once'), null);
  });

  it('advances monthly, semiannually, and yearly in UTC', () => {
    const date = new Date('2026-01-15T12:34:56.000Z');
    assert.equal(getNextFinancialEventDate(date, 'monthly')?.toISOString(), '2026-02-15T12:34:56.000Z');
    assert.equal(getNextFinancialEventDate(date, 'semiannual')?.toISOString(), '2026-07-15T12:34:56.000Z');
    assert.equal(getNextFinancialEventDate(date, 'yearly')?.toISOString(), '2027-01-15T12:34:56.000Z');
  });

  it('clamps days for February and short months', () => {
    assert.equal(
      getNextFinancialEventDate(new Date('2027-01-31T12:00:00Z'), 'monthly')?.toISOString(),
      '2027-02-28T12:00:00.000Z',
    );
    assert.equal(
      getNextFinancialEventDate(new Date('2024-02-29T12:00:00Z'), 'yearly')?.toISOString(),
      '2025-02-28T12:00:00.000Z',
    );
    assert.equal(
      getNextFinancialEventDate(new Date('2026-05-31T12:00:00Z'), 'monthly')?.toISOString(),
      '2026-06-30T12:00:00.000Z',
    );
  });
});
