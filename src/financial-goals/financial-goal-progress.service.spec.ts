import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FinancialGoalStatus, Prisma } from '@prisma/client';
import { FinancialGoalProgressService } from './financial-goal-progress.service';

const decimal = (value: string) => new Prisma.Decimal(value);
const goal = (overrides: any = {}) => ({
  id: 'goal', userId: 'owner', name: 'Reserva', description: null, targetAmount: decimal('100.00'), targetDate: new Date('2026-10-01T00:00:00.000Z'),
  status: FinancialGoalStatus.active, completedAt: null, canceledAt: null, createdAt: new Date(), updatedAt: new Date(), ...overrides,
});

function db(sums: any[]) { return { goalContribution: { groupBy: async (args: any) => sums.filter((item) => args.where.goalId.in.includes(item.goalId)) } }; }

describe('FinancialGoalProgressService', () => {
  it('derives contributions minus withdrawals with decimal precision, capped percentage and nonnegative remaining', async () => {
    const service = new FinancialGoalProgressService();
    const progress = await service.getGoalProgress(db([
      { goalId: 'goal', type: 'contribution', _sum: { amount: decimal('100.10') } },
      { goalId: 'goal', type: 'withdrawal', _sum: { amount: decimal('0.20') } },
    ]) as any, goal());
    assert.equal(progress.currentAmount.toFixed(2), '99.90');
    assert.equal(progress.remainingAmount.toFixed(2), '0.10');
    assert.equal(progress.progressPercentage.toFixed(2), '99.90');

    const over = await service.getGoalProgress(db([{ goalId: 'goal', type: 'contribution', _sum: { amount: decimal('250.00') } }]) as any, goal());
    assert.equal(over.remainingAmount.toFixed(2), '0.00');
    assert.equal(over.progressPercentage.toFixed(2), '100.00');
  });

  it('uses UTC deadline formulas and excludes canceled goals from money totals', async () => {
    const service = new FinancialGoalProgressService();
    const asOf = new Date('2026-07-15T14:00:00.000Z');
    const active = goal();
    const canceled = goal({ id: 'canceled', status: FinancialGoalStatus.canceled, canceledAt: asOf, targetAmount: decimal('50.00') });
    const progress = new Map([
      ['goal', { currentAmount: decimal('40'), remainingAmount: decimal('60'), progressPercentage: decimal('40') }],
      ['canceled', { currentAmount: decimal('50'), remainingAmount: decimal('0'), progressPercentage: decimal('100') }],
    ]);
    const result = service.buildGoalOverview([active, canceled] as any, progress, asOf);
    assert.equal(result.summary.totalTargetAmount, '100.00');
    assert.equal(result.summary.averageProgressPercentage, '40.00');
    assert.equal((result.goals[0] as any).daysRemaining, 78);
    assert.equal((result.goals[0] as any).monthsRemaining, 4);
    assert.equal((result.goals[0] as any).requiredMonthlyContribution, '15.00');
  });

  it('marks past active deadlines overdue and leaves required contribution null', () => {
    const service = new FinancialGoalProgressService();
    const result: any = service.buildGoalOverview([goal({ targetDate: new Date('2026-02-28T00:00:00.000Z') })] as any, new Map([
      ['goal', { currentAmount: decimal('1'), remainingAmount: decimal('99'), progressPercentage: decimal('1') }],
    ]), new Date('2026-03-01T00:00:00.000Z'));
    assert.equal(result.goals[0].isOverdue, true);
    assert.equal(result.goals[0].daysRemaining, 0);
    assert.equal(result.goals[0].requiredMonthlyContribution, null);
  });
});
