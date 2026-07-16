import { Injectable } from '@nestjs/common';
import { FinancialGoal, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;
const zero = () => new Prisma.Decimal(0);

export type GoalProgress = {
  currentAmount: Prisma.Decimal;
  remainingAmount: Prisma.Decimal;
  progressPercentage: Prisma.Decimal;
};

@Injectable()
export class FinancialGoalProgressService {
  async getGoalProgress(db: Db, goal: Pick<FinancialGoal, 'id' | 'targetAmount'>, asOf?: Date) {
    const all = await this.getGoalsProgress(db, [goal], asOf);
    return all.get(goal.id) ?? this.calculate(goal.targetAmount, zero());
  }

  async getGoalsProgress(
    db: Db,
    goals: Array<Pick<FinancialGoal, 'id' | 'targetAmount'>>,
    asOf?: Date,
  ): Promise<Map<string, GoalProgress>> {
    if (!goals.length) return new Map();
    const sums = await db.goalContribution.groupBy({
      by: ['goalId', 'type'],
      where: { goalId: { in: goals.map((goal) => goal.id) }, ...(asOf ? { occurredAt: { lte: asOf } } : {}) },
      _sum: { amount: true },
    });
    const values = new Map<string, Prisma.Decimal>();
    for (const sum of sums) {
      const current = values.get(sum.goalId) ?? zero();
      const amount = sum._sum.amount ?? zero();
      values.set(sum.goalId, sum.type === 'contribution' ? current.plus(amount) : current.minus(amount));
    }
    return new Map(goals.map((goal) => [goal.id, this.calculate(goal.targetAmount, values.get(goal.id) ?? zero())]));
  }

  async reconcileGoalStatus(db: Db, goal: FinancialGoal, currentAmount?: Prisma.Decimal, now = new Date()) {
    if (goal.status === 'canceled') return goal;
    const progress = currentAmount === undefined
      ? await this.getGoalProgress(db, goal)
      : this.calculate(goal.targetAmount, currentAmount);
    const completed = progress.currentAmount.greaterThanOrEqualTo(goal.targetAmount);
    const status = completed ? 'completed' : 'active';
    const needsUpdate = goal.status !== status || (completed && !goal.completedAt) || (!completed && goal.completedAt);
    if (!needsUpdate) return goal;
    return db.financialGoal.update({
      where: { id: goal.id },
      data: { status, completedAt: completed ? now : null, canceledAt: null },
    });
  }

  buildGoalOverview(goals: FinancialGoal[], progress: Map<string, GoalProgress>, asOf: Date) {
    const withValues = goals.map((goal) => this.serialize(goal, progress.get(goal.id) ?? this.calculate(goal.targetAmount, zero()), asOf));
    const active = withValues.filter((goal) => goal.status === 'active');
    const included = withValues.filter((goal) => goal.status !== 'canceled');
    const totals = included.reduce((total, goal) => ({
      target: total.target.plus(goal.targetAmount), current: total.current.plus(goal.currentDecimal), remaining: total.remaining.plus(goal.remainingDecimal), progress: total.progress.plus(goal.progressDecimal),
    }), { target: zero(), current: zero(), remaining: zero(), progress: zero() });
    const next = active.filter((goal) => goal.targetDate && !goal.isOverdue)
      .sort((a, b) => a.targetDate!.localeCompare(b.targetDate!) || a.id.localeCompare(b.id))[0] ?? null;
    return {
      asOf: asOf.toISOString(),
      summary: {
        activeGoals: active.length,
        completedGoals: withValues.filter((goal) => goal.status === 'completed').length,
        canceledGoals: withValues.filter((goal) => goal.status === 'canceled').length,
        totalTargetAmount: totals.target.toFixed(2), totalCurrentAmount: totals.current.toFixed(2),
        totalRemainingAmount: totals.remaining.toFixed(2),
        averageProgressPercentage: included.length ? totals.progress.dividedBy(included.length).toFixed(2) : '0.00',
        overdueGoals: active.filter((goal) => goal.isOverdue).length,
      },
      nextDeadline: next ? { id: next.id, name: next.name, targetDate: next.targetDate, currentAmount: next.currentAmount, remainingAmount: next.remainingAmount } : null,
      goals: withValues.map(({ targetDecimal, currentDecimal, remainingDecimal, progressDecimal, ...goal }) => goal),
    };
  }

  serialize(goal: FinancialGoal, progress: GoalProgress, asOf: Date) {
    const targetDate = goal.targetDate?.toISOString() ?? null;
    const isOverdue = goal.status === 'active' && !!goal.targetDate && goal.targetDate.getTime() < asOf.getTime();
    const deadline = this.deadline(goal, progress, asOf, isOverdue);
    return {
      id: goal.id, name: goal.name, description: goal.description,
      targetAmount: goal.targetAmount.toFixed(2), currentAmount: progress.currentAmount.toFixed(2),
      remainingAmount: progress.remainingAmount.toFixed(2), progressPercentage: progress.progressPercentage.toFixed(2),
      targetDate, status: goal.status, completedAt: goal.completedAt?.toISOString() ?? null,
      canceledAt: goal.canceledAt?.toISOString() ?? null, isOverdue,
      ...deadline,
      targetDecimal: goal.targetAmount, currentDecimal: progress.currentAmount,
      remainingDecimal: progress.remainingAmount, progressDecimal: progress.progressPercentage,
    };
  }

  private calculate(targetAmount: Prisma.Decimal, currentAmount: Prisma.Decimal): GoalProgress {
    const current = currentAmount.lessThan(0) ? zero() : currentAmount;
    return {
      currentAmount: current,
      remainingAmount: Prisma.Decimal.max(targetAmount.minus(current), zero()),
      progressPercentage: Prisma.Decimal.min(current.dividedBy(targetAmount).times(100), new Prisma.Decimal(100)),
    };
  }

  private deadline(goal: FinancialGoal, progress: GoalProgress, asOf: Date, isOverdue: boolean) {
    if (!goal.targetDate) return {};
    const daysRemaining = isOverdue ? 0 : Math.max(0, Math.ceil((Date.UTC(goal.targetDate.getUTCFullYear(), goal.targetDate.getUTCMonth(), goal.targetDate.getUTCDate()) - Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())) / 86_400_000));
    const monthsRemaining = isOverdue ? null : Math.max(1, (goal.targetDate.getUTCFullYear() - asOf.getUTCFullYear()) * 12 + goal.targetDate.getUTCMonth() - asOf.getUTCMonth() + 1);
    return {
      daysRemaining,
      monthsRemaining,
      requiredMonthlyContribution: goal.status === 'active' && !isOverdue && progress.remainingAmount.greaterThan(0) && monthsRemaining
        ? progress.remainingAmount.dividedBy(monthsRemaining).toFixed(2) : null,
    };
  }
}
