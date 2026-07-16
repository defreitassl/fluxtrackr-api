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
    const effectiveStatus = this.effectiveStatus(goal, progress, asOf);
    const targetDate = goal.targetDate?.toISOString() ?? null;
    const isOverdue = effectiveStatus === 'active' && !!goal.targetDate
      && this.utcDay(goal.targetDate).getTime() < this.utcDay(asOf).getTime();
    const deadline = this.deadline(goal, progress, asOf, isOverdue, effectiveStatus);
    return {
      id: goal.id, name: goal.name, description: goal.description,
      targetAmount: goal.targetAmount.toFixed(2), currentAmount: progress.currentAmount.toFixed(2),
      remainingAmount: progress.remainingAmount.toFixed(2), progressPercentage: progress.progressPercentage.toFixed(2),
      targetDate, status: effectiveStatus,
      completedAt: effectiveStatus === 'completed' && goal.completedAt && goal.completedAt <= asOf ? goal.completedAt.toISOString() : null,
      canceledAt: effectiveStatus === 'canceled' && goal.canceledAt && goal.canceledAt <= asOf ? goal.canceledAt.toISOString() : null,
      isOverdue,
      ...deadline,
      targetDecimal: goal.targetAmount, currentDecimal: progress.currentAmount,
      remainingDecimal: progress.remainingAmount, progressDecimal: progress.progressPercentage,
    };
  }

  private calculate(targetAmount: Prisma.Decimal, currentAmount: Prisma.Decimal): GoalProgress {
    return {
      currentAmount,
      remainingAmount: Prisma.Decimal.max(targetAmount.minus(currentAmount), zero()),
      progressPercentage: Prisma.Decimal.min(currentAmount.dividedBy(targetAmount).times(100), new Prisma.Decimal(100)),
    };
  }

  private effectiveStatus(goal: FinancialGoal, progress: GoalProgress, asOf: Date) {
    if (goal.canceledAt && goal.canceledAt <= asOf) return 'canceled' as const;
    return progress.currentAmount.greaterThanOrEqualTo(goal.targetAmount) ? 'completed' as const : 'active' as const;
  }

  private deadline(goal: FinancialGoal, progress: GoalProgress, asOf: Date, isOverdue: boolean, status: 'active' | 'completed' | 'canceled') {
    if (status !== 'active' || !goal.targetDate) {
      return { daysRemaining: null, monthsRemaining: null, requiredMonthlyContribution: null };
    }
    const targetDay = this.utcDay(goal.targetDate);
    const currentDay = this.utcDay(asOf);
    const daysRemaining = isOverdue ? 0 : Math.max(0, Math.round((targetDay.getTime() - currentDay.getTime()) / 86_400_000));
    const monthsRemaining = isOverdue ? null : Math.max(1, (goal.targetDate.getUTCFullYear() - asOf.getUTCFullYear()) * 12 + goal.targetDate.getUTCMonth() - asOf.getUTCMonth() + 1);
    return {
      daysRemaining,
      monthsRemaining,
      requiredMonthlyContribution: !isOverdue && progress.remainingAmount.greaterThan(0) && monthsRemaining
        ? progress.remainingAmount.dividedBy(monthsRemaining).toFixed(2) : null,
    };
  }

  private utcDay(value: Date) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())); }
}
