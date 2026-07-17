import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { NotificationEvaluatorService } from './notification-evaluator.service';

const now = new Date('2026-07-16T12:00:00.000Z');

function createHarness({
  invoice,
  event,
  charge,
  budget,
  goal,
  preference = { enabled: true, leadDays: 3 },
}: any = {}) {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const client: any = {
    creditCardInvoice: { findFirst: async () => invoice, findMany: async () => [] },
    financialEvent: { findFirst: async () => event, findMany: async () => [] },
    subscriptionCharge: { findFirst: async () => charge, findMany: async () => [] },
    categoryBudget: { findFirst: async () => budget, findMany: async () => [] },
    financialGoal: { findFirst: async () => goal, findMany: async () => [] },
    user: { findMany: async () => [] },
  };
  const notifications: any = {
    resolveSource: async (...args: unknown[]) => calls.push({ name: 'resolveSource', args }),
    resolveSourceExceptDedupeKey: async (...args: unknown[]) => calls.push({ name: 'resolveSourceExceptDedupeKey', args }),
    resolveTypesExcept: async (...args: unknown[]) => calls.push({ name: 'resolveTypesExcept', args }),
    upsertActive: async (...args: unknown[]) => calls.push({ name: 'upsertActive', args }),
  };
  const preferences: any = { getEffective: async () => preference };
  const spending: any = { getSpendingByCategory: async () => new Map([[budget?.categoryId, { totalSpent: { greaterThanOrEqualTo: () => true } }]]) };
  const goals: any = { getGoalProgress: async () => ({ currentAmount: { greaterThanOrEqualTo: () => false } }) };
  return { calls, client, evaluator: new NotificationEvaluatorService(client, notifications, preferences, spending, goals) };
}

function activeCall(calls: Array<{ name: string; args: unknown[] }>) {
  return calls.find((call) => call.name === 'upsertActive')?.args[2] as { dedupeKey: string } | undefined;
}

describe('NotificationEvaluatorService reconciliation', () => {
  it('resolves an older invoice date key before activating the current one', async () => {
    const { calls, client, evaluator } = createHarness({
      invoice: { id: 'invoice', status: 'open', dueDate: new Date('2026-07-19T00:00:00.000Z'), creditCard: { name: 'Nubank' }, installments: [{ installmentAmount: new Prisma.Decimal(100), status: 'pending' }] },
    });
    await evaluator.evaluateInvoice('user', 'invoice', now, client);
    const resolve = calls.find((call) => call.name === 'resolveSourceExceptDedupeKey');
    assert.equal(resolve?.args[4], 'invoice_due_soon:invoice:2026-07-19');
    assert.equal(activeCall(calls)?.dedupeKey, 'invoice_due_soon:invoice:2026-07-19');
  });

  it('reconciles date-based event, subscription charge, and goal keys', async () => {
    const event = createHarness({ event: { id: 'event', status: 'confirmed', date: new Date('2026-07-17T00:00:00.000Z'), name: 'Seguro' } });
    await event.evaluator.evaluateFinancialEvent('user', 'event', now, event.client);
    assert.equal(activeCall(event.calls)?.dedupeKey, 'event_upcoming:event:2026-07-17');

    const charge = createHarness({ charge: { id: 'charge', status: 'pending', chargeDate: new Date('2026-07-17T00:00:00.000Z'), name: 'Streaming' } });
    await charge.evaluator.evaluateSubscriptionCharge('user', 'charge', now, charge.client);
    assert.equal(activeCall(charge.calls)?.dedupeKey, 'subscription_upcoming:charge:2026-07-17');

    const goal = createHarness({ goal: { id: 'goal', status: 'active', targetDate: new Date('2026-07-20T00:00:00.000Z'), targetAmount: {} , name: 'Reserva' }, preference: { enabled: true, leadDays: 30 } });
    await goal.evaluator.evaluateGoal('user', 'goal', now, goal.client);
    assert.equal(activeCall(goal.calls)?.dedupeKey, 'goal_deadline_upcoming:goal:2026-07-20');
  });

  it('resolves previous goal types even with preference disabled without creating an alert', async () => {
    const goal = createHarness({
      goal: { id: 'goal', status: 'active', targetDate: new Date('2026-07-15T00:00:00.000Z'), targetAmount: {}, name: 'Reserva' },
      preference: { enabled: false, leadDays: 30 },
    });
    await goal.evaluator.evaluateGoal('user', 'goal', now, goal.client);
    assert.ok(goal.calls.some((call) => call.name === 'resolveTypesExcept'));
    assert.equal(activeCall(goal.calls), undefined);
  });

  it('resolves every active source notification when its condition ends', async () => {
    const { calls, client, evaluator } = createHarness({ event: { id: 'event', status: 'realized', date: now, name: 'Seguro' } });
    await evaluator.evaluateFinancialEvent('user', 'event', now, client);
    assert.equal(calls[0].name, 'resolveSource');
  });

  it('isolates failed invoice evaluation so subsequent sources continue', async () => {
    const { client, evaluator } = createHarness();
    client.creditCardInvoice.findMany = async () => [{ id: 'broken' }, { id: 'healthy' }];
    client.financialEvent.findMany = async () => [{ id: 'event' }];
    const processed: string[] = [];
    (evaluator as any).evaluateInvoice = async (_user: string, id: string) => { if (id === 'broken') throw new Error('broken invoice'); processed.push(id); };
    (evaluator as any).evaluateFinancialEvent = async (_user: string, id: string) => { processed.push(id); };
    await evaluator.evaluateUser('user', now, client);
    assert.deepEqual(processed, ['healthy', 'event']);
  });

  it('isolates a failed user and continues with the next user', async () => {
    const { client, evaluator } = createHarness();
    client.user.findMany = async () => [{ id: 'broken' }, { id: 'healthy' }];
    const processed: string[] = [];
    (evaluator as any).evaluateUser = async (id: string) => { if (id === 'broken') throw new Error('broken user'); processed.push(id); };
    await evaluator.evaluateAllUsers(now);
    assert.deepEqual(processed, ['healthy']);
  });
});
