import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import {
  NOTIFICATION_RECONCILIATION_CRON,
  NotificationEvaluatorService,
} from './notification-evaluator.service';

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
    notification: { findMany: async () => [] },
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
  return { calls, client, spending, evaluator: new NotificationEvaluatorService(client, notifications, preferences, spending, goals) };
}

function activeCall(calls: Array<{ name: string; args: unknown[] }>) {
  return calls.find((call) => call.name === 'upsertActive')?.args[2] as { dedupeKey: string } | undefined;
}

describe('NotificationEvaluatorService reconciliation', () => {
  it('uses a daily UTC reconciliation schedule', () => {
    assert.equal(NOTIFICATION_RECONCILIATION_CRON, '0 15 0 * * *');
  });

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

  it('queries only current candidates and preserves unresolved source ids once', async () => {
    const { client, evaluator } = createHarness();
    const queries: Record<string, any> = {};
    client.creditCardInvoice.findMany = async (args: any) => {
      queries.invoice = args;
      return [{ id: 'invoice' }];
    };
    client.financialEvent.findMany = async (args: any) => {
      queries.event = args;
      return [];
    };
    client.subscriptionCharge.findMany = async (args: any) => {
      queries.charge = args;
      return [{ id: 'charge' }];
    };
    client.categoryBudget.findMany = async (args: any) => {
      queries.budget = args;
      return [{ id: 'budget' }];
    };
    client.financialGoal.findMany = async (args: any) => {
      queries.goal = args;
      return [{ id: 'goal' }];
    };
    client.notification.findMany = async (args: any) => {
      queries.notification = args;
      return [
        { sourceType: 'credit_card_invoice', sourceId: 'invoice' },
        { sourceType: 'financial_event', sourceId: 'historical-event' },
        { sourceType: 'financial_event', sourceId: 'historical-event' },
      ];
    };
    const processed: string[] = [];
    (evaluator as any).evaluateInvoice = async (_user: string, id: string) => processed.push(`invoice:${id}`);
    (evaluator as any).evaluateFinancialEvent = async (_user: string, id: string) => processed.push(`event:${id}`);
    (evaluator as any).evaluateSubscriptionCharge = async (_user: string, id: string) => processed.push(`charge:${id}`);
    (evaluator as any).evaluateBudget = async (_user: string, id: string) => processed.push(`budget:${id}`);
    (evaluator as any).evaluateGoal = async (_user: string, id: string) => processed.push(`goal:${id}`);

    const result = await evaluator.evaluateUser('user', now, client);

    assert.deepEqual(queries.invoice.where, { userId: 'user', status: { in: ['open', 'closed', 'overdue'] } });
    assert.deepEqual(queries.event.where, { userId: 'user', status: 'confirmed', date: { gte: new Date('2026-07-16T00:00:00.000Z') } });
    assert.deepEqual(queries.charge.where, { userId: 'user', status: 'pending' });
    assert.deepEqual(queries.budget.where, { userId: 'user', isActive: true, year: 2026, month: 7 });
    assert.deepEqual(queries.goal.where, { userId: 'user', status: 'active', targetDate: { not: null } });
    assert.deepEqual(queries.notification.where, { userId: 'user', resolvedAt: null });
    assert.deepEqual(processed, ['invoice:invoice', 'event:historical-event', 'charge:charge', 'budget:budget', 'goal:goal']);
    assert.deepEqual(result, {
      invoiceCandidates: 1,
      eventCandidates: 1,
      subscriptionChargeCandidates: 1,
      budgetCandidates: 1,
      goalCandidates: 1,
    });
  });

  it('calculates budget spending once per user and period during reconciliation', async () => {
    const firstBudget = {
      id: 'budget-1', userId: 'user', isActive: true, year: 2026, month: 7,
      categoryId: 'category-1', limitAmount: new Prisma.Decimal(100), warningPercentage: 80,
      category: { isActive: true, name: 'Food' },
    };
    const secondBudget = { ...firstBudget, id: 'budget-2', categoryId: 'category-2' };
    const { client, evaluator, spending } = createHarness();
    client.categoryBudget.findMany = async () => [{ id: firstBudget.id }, { id: secondBudget.id }];
    client.categoryBudget.findFirst = async ({ where }: any) =>
      [firstBudget, secondBudget].find((budget) => budget.id === where.id) ?? null;
    let spendingCalls = 0;
    spending.getSpendingByCategory = async () => {
      spendingCalls += 1;
      return new Map<string, any>();
    };

    await evaluator.evaluateUser('user', now, client);

    assert.equal(spendingCalls, 1);
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
