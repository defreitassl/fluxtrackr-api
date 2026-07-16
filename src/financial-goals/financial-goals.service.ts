import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FinancialGoal, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFinancialGoalDto } from './dto/create-financial-goal.dto';
import { CreateGoalContributionDto } from './dto/create-goal-contribution.dto';
import { GetFinancialGoalsOverviewDto } from './dto/get-financial-goals-overview.dto';
import { ListFinancialGoalsDto, ListGoalContributionsDto } from './dto/list-financial-goals.dto';
import { UpdateFinancialGoalDto } from './dto/update-financial-goal.dto';
import { FinancialGoalProgressService } from './financial-goal-progress.service';
import { ActivityService } from '../activities/activity.service';
import { NotificationImpactService } from '../notifications/notification-impact.service';

const zero = () => new Prisma.Decimal(0);

@Injectable()
export class FinancialGoalsService {
  constructor(private readonly prisma: PrismaService, private readonly progress: FinancialGoalProgressService, private readonly activities: ActivityService, private readonly impacts: NotificationImpactService) {}

  async create(userId: string, dto: CreateFinancialGoalDto) {
    const created = await this.runSerializableTransaction(async (tx) => {
      const now = new Date();
      const data = this.createData(dto, now);
      const goal = await tx.financialGoal.create({ data: { userId, ...data } });
      const initial = dto.initialAmount === undefined ? zero() : new Prisma.Decimal(dto.initialAmount);
      if (initial.greaterThan(0)) await tx.goalContribution.create({ data: { userId, goalId: goal.id, type: 'contribution', amount: initial, occurredAt: now, note: null } });
      const updated = await this.progress.reconcileGoalStatus(tx, goal, initial, now);
      await this.activities.record(tx, { userId, type: 'financial_goal_created', entityType: 'financial_goal', entityId: goal.id, title: 'Meta financeira criada', description: goal.name, metadata: { targetAmount: goal.targetAmount.toFixed(2) }, occurredAt: now });
      if (updated.status === 'completed') await this.activities.record(tx, { userId, type: 'financial_goal_completed', entityType: 'financial_goal', entityId: goal.id, title: 'Meta financeira concluída', description: goal.name, metadata: { targetAmount: goal.targetAmount.toFixed(2) }, occurredAt: now });
      return this.serialize(updated, initial, now);
    });
    await this.impacts.evaluateGoal(userId, created.id);
    return created;
  }

  async findMany(userId: string, query: ListFinancialGoalsDto) {
    const where: Prisma.FinancialGoalWhereInput = {
      userId, status: query.status,
      targetDate: {
        ...(query.targetDateFrom ? { gte: this.date(query.targetDateFrom, 'targetDateFrom') } : {}),
        ...(query.targetDateTo ? { lte: this.date(query.targetDateTo, 'targetDateTo') } : {}),
      },
    };
    const goals = await this.prisma.financialGoal.findMany({ where });
    const progress = await this.progress.getGoalsProgress(this.prisma, goals);
    const now = new Date();
    return goals.map((goal) => this.serialize(goal, progress.get(goal.id)!.currentAmount, now))
      .sort((left: any, right: any) => this.goalRank(left, now) - this.goalRank(right, now)
        || (left.status === 'active' && left.targetDate && right.targetDate ? left.targetDate.localeCompare(right.targetDate) : 0)
        || (left.status === 'completed' && left.completedAt && right.completedAt ? right.completedAt.localeCompare(left.completedAt) : 0)
        || left.id.localeCompare(right.id));
  }

  async findOne(userId: string, id: string) {
    const goal = await this.requireGoal(this.prisma, userId, id);
    const [progress, recent, movementsCount] = await Promise.all([
      this.progress.getGoalProgress(this.prisma, goal),
      this.prisma.goalContribution.findMany({ where: { userId, goalId: id }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: 5 }),
      this.prisma.goalContribution.count({ where: { userId, goalId: id } }),
    ]);
    return { ...this.serialize(goal, progress.currentAmount, new Date()), recentContributions: recent.map((item) => this.serializeContribution(item)), contributionsCount: movementsCount };
  }

  async update(userId: string, id: string, dto: UpdateFinancialGoalDto) {
    const updated = await this.runSerializableTransaction(async (tx) => {
      const current = await this.requireGoal(tx, userId, id);
      if (dto.status === 'completed') throw new BadRequestException('Financial goal status completed is derived from progress');
      const now = new Date();
      const targetAmount = dto.targetAmount === undefined ? current.targetAmount : this.money(dto.targetAmount, 'targetAmount');
      const targetDate = dto.targetDate === undefined ? current.targetDate : dto.targetDate === null ? null : this.validDate(dto.targetDate, 'targetDate');
      this.validateName(dto.name ?? current.name);
      if (dto.targetDate !== undefined && targetDate && this.utcDay(targetDate).getTime() < this.utcDay(now).getTime()) {
        throw new BadRequestException('targetDate cannot be in the past');
      }
      const cancel = dto.status === 'canceled';
      const reactivate = dto.status === 'active' && current.status === 'canceled';
      let goal = await tx.financialGoal.update({ where: { id }, data: {
        name: dto.name ?? current.name, description: dto.description === undefined ? current.description : dto.description,
        targetAmount, targetDate,
        status: cancel ? 'canceled' : reactivate ? 'active' : current.status,
        canceledAt: cancel ? now : reactivate ? null : current.canceledAt,
        completedAt: cancel ? null : reactivate ? null : current.completedAt,
      } });
      if (!cancel) goal = await this.progress.reconcileGoalStatus(tx, goal, undefined, now);
      const amount = (await this.progress.getGoalProgress(tx, goal)).currentAmount;
      await this.activities.record(tx, { userId, type: cancel ? 'financial_goal_canceled' : 'financial_goal_updated', entityType: 'financial_goal', entityId: goal.id, title: cancel ? 'Meta financeira cancelada' : 'Meta financeira atualizada', description: goal.name, metadata: { targetAmount: goal.targetAmount.toFixed(2) }, occurredAt: now });
      if (reactivate || (!cancel && current.status === 'completed' && goal.status === 'active')) await this.activities.record(tx, { userId, type: 'financial_goal_reopened', entityType: 'financial_goal', entityId: goal.id, title: 'Meta financeira reaberta', description: goal.name, metadata: { targetAmount: goal.targetAmount.toFixed(2) }, occurredAt: now });
      if (!cancel && current.status !== 'completed' && goal.status === 'completed') await this.activities.record(tx, { userId, type: 'financial_goal_completed', entityType: 'financial_goal', entityId: goal.id, title: 'Meta financeira concluída', description: goal.name, metadata: { targetAmount: goal.targetAmount.toFixed(2) }, occurredAt: now });
      return this.serialize(goal, amount, now);
    });
    await this.impacts.evaluateGoal(userId, id);
    return updated;
  }

  async remove(userId: string, id: string) {
    const result = await this.runSerializableTransaction(async (tx) => {
      const goal = await this.requireGoal(tx, userId, id);
      if (goal.status !== 'canceled') {
        const now = new Date();
        await tx.financialGoal.update({ where: { id }, data: { status: 'canceled', canceledAt: now, completedAt: null } });
        await this.activities.record(tx, { userId, type: 'financial_goal_canceled', entityType: 'financial_goal', entityId: id, title: 'Meta financeira cancelada', description: goal.name, metadata: { targetAmount: goal.targetAmount.toFixed(2) }, occurredAt: now });
      }
      return { canceled: true };
    });
    await this.impacts.evaluateGoal(userId, id);
    return result;
  }

  async addContribution(userId: string, goalId: string, dto: CreateGoalContributionDto) {
    const contribution = await this.runSerializableTransaction(async (tx) => {
      const goal = await this.requireGoal(tx, userId, goalId);
      if (goal.status === 'canceled') throw new BadRequestException('Canceled financial goals do not accept contributions');
      const amount = this.money(dto.amount, 'amount');
      const occurredAt = dto.occurredAt ? this.validDate(dto.occurredAt, 'occurredAt') : new Date();
      const now = new Date();
      if (occurredAt.getTime() > now.getTime()) throw new BadRequestException('occurredAt cannot be in the future');
      const before = await this.progress.getGoalProgress(tx, goal);
      if (dto.type === 'withdrawal') await this.assertWithdrawalKeepsHistoricalBalance(tx, goalId, amount, occurredAt);
      const contribution = await tx.goalContribution.create({ data: { userId, goalId, type: dto.type, amount, occurredAt, note: dto.note ?? null } });
      const current = dto.type === 'contribution' ? before.currentAmount.plus(amount) : before.currentAmount.minus(amount);
      const updated = await this.progress.reconcileGoalStatus(tx, goal, current, now);
      await this.activities.record(tx, { userId, type: dto.type === 'contribution' ? 'goal_contribution_added' : 'goal_withdrawal_added', entityType: 'goal_contribution', entityId: contribution.id, title: dto.type === 'contribution' ? 'Aporte realizado' : 'Retirada realizada', description: goal.name, metadata: { amount: amount.toFixed(2), goalId, effectiveDate: occurredAt.toISOString() }, occurredAt: now });
      if (goal.status !== updated.status && updated.status === 'completed') await this.activities.record(tx, { userId, type: 'financial_goal_completed', entityType: 'financial_goal', entityId: goalId, title: 'Meta financeira concluída', description: goal.name, metadata: { targetAmount: goal.targetAmount.toFixed(2) }, occurredAt: now });
      if (goal.status === 'completed' && updated.status === 'active') await this.activities.record(tx, { userId, type: 'financial_goal_reopened', entityType: 'financial_goal', entityId: goalId, title: 'Meta financeira reaberta', description: goal.name, metadata: { targetAmount: goal.targetAmount.toFixed(2) }, occurredAt: now });
      return this.serializeContribution(contribution);
    });
    await this.impacts.evaluateGoal(userId, goalId);
    return contribution;
  }

  async listContributions(userId: string, goalId: string, query: ListGoalContributionsDto) {
    await this.requireGoal(this.prisma, userId, goalId);
    return (await this.prisma.goalContribution.findMany({
      where: { userId, goalId, type: query.type, occurredAt: {
        ...(query.startDate ? { gte: this.date(query.startDate, 'startDate') } : {}),
        ...(query.endDate ? { lte: this.date(query.endDate, 'endDate') } : {}),
      } }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    })).map((item) => this.serializeContribution(item));
  }

  async overview(userId: string, dto: GetFinancialGoalsOverviewDto) {
    const asOf = dto.asOf ? this.validDate(dto.asOf, 'asOf') : new Date();
    const goals = await this.prisma.financialGoal.findMany({ where: { userId, createdAt: { lte: asOf } } });
    const progress = await this.progress.getGoalsProgress(this.prisma, goals, asOf);
    return this.progress.buildGoalOverview(goals, progress, asOf);
  }

  private async requireGoal(db: PrismaService | Prisma.TransactionClient, userId: string, id: string) {
    const goal = await db.financialGoal.findFirst({ where: { id, userId } });
    if (!goal) throw new NotFoundException('Financial goal not found');
    return goal;
  }

  private createData(dto: CreateFinancialGoalDto, now: Date) {
    this.validateName(dto.name);
    const targetAmount = this.money(dto.targetAmount, 'targetAmount');
    const targetDate = dto.targetDate ? this.validDate(dto.targetDate, 'targetDate') : null;
    if (targetDate && this.utcDay(targetDate).getTime() < this.utcDay(now).getTime()) throw new BadRequestException('targetDate cannot be in the past for an active goal');
    if (dto.initialAmount !== undefined && new Prisma.Decimal(dto.initialAmount).lessThan(0)) throw new BadRequestException('initialAmount must be zero or greater');
    return { name: dto.name.trim(), description: dto.description ?? null, targetAmount, targetDate };
  }

  private serialize(goal: FinancialGoal, current: Prisma.Decimal, asOf: Date) {
    const value: any = this.progress.serialize(goal, {
      currentAmount: current,
      remainingAmount: Prisma.Decimal.max(goal.targetAmount.minus(current), zero()),
      progressPercentage: Prisma.Decimal.min(current.dividedBy(goal.targetAmount).times(100), new Prisma.Decimal(100)),
    }, asOf);
    const { targetDecimal, currentDecimal, remainingDecimal, progressDecimal, ...result } = value;
    return result;
  }

  private serializeContribution(item: any) { return { ...item, amount: item.amount.toFixed(2), occurredAt: item.occurredAt.toISOString(), createdAt: item.createdAt.toISOString() }; }
  private validateName(name: string) { if (!name.trim()) throw new BadRequestException('Financial goal name is required'); }
  private money(value: string, field: string) { const amount = new Prisma.Decimal(value); if (amount.lessThanOrEqualTo(0)) throw new BadRequestException(`${field} must be greater than zero`); return amount; }
  private validDate(value: string, field: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} must be a valid ISO date`); return date; }
  private date(value: string, field: string) { return this.validDate(value, field); }
  private goalRank(goal: any, now: Date) { if (goal.status === 'active') return goal.isOverdue ? 0 : goal.targetDate ? 1 : 2; if (goal.status === 'completed') return 3; return 4; }

  private async assertWithdrawalKeepsHistoricalBalance(tx: Prisma.TransactionClient, goalId: string, amount: Prisma.Decimal, occurredAt: Date) {
    const movements = await tx.goalContribution.findMany({ where: { goalId }, select: { type: true, amount: true, occurredAt: true } });
    const byInstant = new Map<number, Prisma.Decimal>();
    for (const movement of movements) {
      const value = movement.type === 'contribution' ? movement.amount : movement.amount.negated();
      byInstant.set(movement.occurredAt.getTime(), (byInstant.get(movement.occurredAt.getTime()) ?? zero()).plus(value));
    }
    byInstant.set(occurredAt.getTime(), (byInstant.get(occurredAt.getTime()) ?? zero()).minus(amount));
    let balance = zero();
    for (const [, change] of [...byInstant.entries()].sort(([left], [right]) => left - right)) {
      balance = balance.plus(change);
      if (balance.lessThan(0)) throw new BadRequestException('Withdrawal would make historical goal balance negative');
    }
  }

  private utcDay(value: Date) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())); }

  private async runSerializableTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try { return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < 3) continue;
          throw new ConflictException('Financial goal update conflict');
        }
        throw error;
      }
    }
    throw new ConflictException('Financial goal update conflict');
  }
}
