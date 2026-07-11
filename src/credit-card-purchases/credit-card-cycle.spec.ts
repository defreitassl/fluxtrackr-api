import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getInvoiceCycles, splitAmountInCents } from './credit-card-cycle';

describe('splitAmountInCents', () => {
  it('divides an amount exactly', () => assert.deepEqual(splitAmountInCents(36, 12), Array(12).fill(300)));
  it('distributes remaining cents to the first installments', () => assert.deepEqual(splitAmountInCents(10, 3), [334, 333, 333]));
});

describe('getInvoiceCycles', () => {
  it('puts purchases before and on closing day in the current cycle', () => {
    assert.equal(getInvoiceCycles(new Date('2026-07-09T23:59:59Z'), 10, 20, 1)[0].closingDate.toISOString(), '2026-07-10T00:00:00.000Z');
    assert.equal(getInvoiceCycles(new Date('2026-07-10T23:59:59Z'), 10, 20, 1)[0].closingDate.toISOString(), '2026-07-10T00:00:00.000Z');
  });
  it('puts a purchase after closing in the next cycle', () => assert.equal(getInvoiceCycles(new Date('2026-07-11T00:00:00Z'), 10, 20, 1)[0].closingDate.toISOString(), '2026-08-10T00:00:00.000Z'));
  it('moves due date to next month when due day is not after closing', () => assert.equal(getInvoiceCycles(new Date('2026-07-10T12:00:00Z'), 25, 7, 1)[0].dueDate.toISOString(), '2026-08-07T00:00:00.000Z'));
  it('clamps configured days in February and short months', () => {
    const cycles = getInvoiceCycles(new Date('2027-01-31T12:00:00Z'), 31, 31, 2);
    assert.equal(cycles[0].closingDate.toISOString(), '2027-01-31T00:00:00.000Z');
    assert.equal(cycles[0].dueDate.toISOString(), '2027-02-28T00:00:00.000Z');
    assert.equal(cycles[1].closingDate.toISOString(), '2027-02-28T00:00:00.000Z');
    assert.equal(cycles[1].dueDate.toISOString(), '2027-03-31T00:00:00.000Z');
  });
});
