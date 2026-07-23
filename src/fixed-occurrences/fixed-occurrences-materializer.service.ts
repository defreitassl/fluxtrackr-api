import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma, FixedOccurrenceStatus, FixedOccurrenceType, PaymentMethod } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ExclusiveJobRunner } from '../observability/exclusive-job-runner';
import { measureJob } from '../observability/resource-metrics';

type FixedTemplate = {
  id: string;
  userId: string;
  name: string;
  amount: Prisma.Decimal;
  categoryId: string | null;
  accountId: string | null;
  paymentMethod: PaymentMethod | null;
  isActive: boolean;
  dueDay?: number | null;
  receiveDay?: number | null;
};

type FixedOccurrenceSnapshot = {
  userId: string;
  type: FixedOccurrenceType;
  name: string;
  amount: Prisma.Decimal;
  occurrenceDate: Date;
  year: number;
  month: number;
  categoryId: string | null;
  accountId: string | null;
  paymentMethod: PaymentMethod | null;
  fixedExpenseId: string | null;
  fixedIncomeId: string | null;
};

export type FixedOccurrenceMaterializationMetrics = {
  templatesProcessed: number;
  recordsRead: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsCanceled: number;
  recordsSkipped: number;
};

const emptyMetrics = (): FixedOccurrenceMaterializationMetrics => ({
  templatesProcessed: 0,
  recordsRead: 0,
  recordsCreated: 0,
  recordsUpdated: 0,
  recordsCanceled: 0,
  recordsSkipped: 0,
});

@Injectable()
export class FixedOccurrencesMaterializerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FixedOccurrencesMaterializerService.name);
  private readonly jobs = new ExclusiveJobRunner();

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.runMaterialization('bootstrap');
  }

  @Cron('0 5 0 * * *', { timeZone: 'UTC' })
  async materializeDaily() {
    await this.runMaterialization('cron');
  }

  async materializeAll(reference = new Date()) {
    const [expenses, incomes] = await Promise.all([
      this.prisma.fixedExpense.findMany({ where: { isActive: true } }),
      this.prisma.fixedIncome.findMany({ where: { isActive: true } }),
    ]);
    const metrics = emptyMetrics();
    for (const expense of expenses) this.addMetrics(metrics, await this.materializeExpense(expense, reference));
    for (const income of incomes) this.addMetrics(metrics, await this.materializeIncome(income, reference));
    return metrics;
  }

  materializeExpense(template: FixedTemplate, reference = new Date()) {
    return this.materializeTemplate(template, 'expense', template.dueDay, reference);
  }

  materializeIncome(template: FixedTemplate, reference = new Date()) {
    return this.materializeTemplate(template, 'income', template.receiveDay, reference);
  }

  private runMaterialization(origin: 'bootstrap' | 'cron' | 'manual') {
    return measureJob(this.logger, 'fixed_occurrences_materializer', { origin }, () =>
      this.jobs.run('fixed_occurrences_materializer', () => this.materializeAll()),
    );
  }

  private async materializeTemplate(
    template: FixedTemplate,
    type: FixedOccurrenceType,
    configuredDay: number | null | undefined,
    reference: Date,
  ): Promise<FixedOccurrenceMaterializationMetrics> {
    const metrics = emptyMetrics();
    if (!template.isActive || !configuredDay) return metrics;
    metrics.templatesProcessed = 1;
    const startYear = reference.getUTCFullYear();
    const startMonth = reference.getUTCMonth();
    const snapshots: FixedOccurrenceSnapshot[] = [];
    for (let offset = 0; offset < 14; offset += 1) {
      const base = new Date(Date.UTC(startYear, startMonth + offset, 1));
      const year = base.getUTCFullYear();
      const monthIndex = base.getUTCMonth();
      const month = monthIndex + 1;
      const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
      const occurrenceDate = new Date(Date.UTC(year, monthIndex, Math.min(configuredDay, lastDay)));
      const source = type === 'expense'
        ? { fixedExpenseId: template.id, fixedIncomeId: null }
        : { fixedExpenseId: null, fixedIncomeId: template.id };
      snapshots.push({
        userId: template.userId,
        type,
        name: template.name,
        amount: template.amount,
        occurrenceDate,
        year,
        month,
        categoryId: template.categoryId,
        accountId: template.accountId,
        paymentMethod: template.paymentMethod,
        ...source,
      });
    }

    const source = type === 'expense'
      ? { fixedExpenseId: template.id }
      : { fixedIncomeId: template.id };
    const existing = await this.prisma.fixedOccurrence.findMany({
      where: {
        ...source,
        OR: snapshots.map(({ year, month }) => ({ year, month })),
      },
      select: {
        id: true,
        status: true,
        name: true,
        amount: true,
        occurrenceDate: true,
        year: true,
        month: true,
        categoryId: true,
        accountId: true,
        paymentMethod: true,
      },
    });
    metrics.recordsRead = existing.length;
    const byPeriod = new Map(existing.map((occurrence) => [this.periodKey(occurrence.year, occurrence.month), occurrence]));
    const creates: FixedOccurrenceSnapshot[] = [];
    const updates: Array<{ id: string; data: Omit<FixedOccurrenceSnapshot, 'userId' | 'type' | 'fixedExpenseId' | 'fixedIncomeId'> }> = [];

    for (const snapshot of snapshots) {
      const occurrence = byPeriod.get(this.periodKey(snapshot.year, snapshot.month));
      if (!occurrence) {
        creates.push(snapshot);
        continue;
      }
      if (occurrence.status !== FixedOccurrenceStatus.pending || this.matchesSnapshot(occurrence, snapshot)) {
        metrics.recordsSkipped += 1;
        continue;
      }
      updates.push({ id: occurrence.id, data: this.updateData(snapshot) });
    }

    if (creates.length) {
      const created = await this.prisma.fixedOccurrence.createMany({
        data: creates,
        skipDuplicates: true,
      });
      metrics.recordsCreated = created.count;
      metrics.recordsSkipped += creates.length - created.count;
    }
    if (updates.length) {
      await this.prisma.$transaction(
        updates.map(({ id, data }) => this.prisma.fixedOccurrence.update({ where: { id }, data })),
      );
      metrics.recordsUpdated = updates.length;
    }
    return metrics;
  }

  private updateData(snapshot: FixedOccurrenceSnapshot) {
    const { userId: _userId, type: _type, fixedExpenseId: _fixedExpenseId, fixedIncomeId: _fixedIncomeId, ...data } = snapshot;
    return data;
  }

  private matchesSnapshot(
    occurrence: {
      name: string;
      amount: Prisma.Decimal;
      occurrenceDate: Date;
      year: number;
      month: number;
      categoryId: string | null;
      accountId: string | null;
      paymentMethod: PaymentMethod | null;
    },
    snapshot: FixedOccurrenceSnapshot,
  ) {
    return occurrence.name === snapshot.name
      && new Prisma.Decimal(occurrence.amount).equals(snapshot.amount)
      && occurrence.occurrenceDate.getTime() === snapshot.occurrenceDate.getTime()
      && occurrence.year === snapshot.year
      && occurrence.month === snapshot.month
      && occurrence.categoryId === snapshot.categoryId
      && occurrence.accountId === snapshot.accountId
      && occurrence.paymentMethod === snapshot.paymentMethod;
  }

  private periodKey(year: number, month: number) {
    return `${year}-${month}`;
  }

  private addMetrics(
    target: FixedOccurrenceMaterializationMetrics,
    source: FixedOccurrenceMaterializationMetrics,
  ) {
    target.templatesProcessed += source.templatesProcessed;
    target.recordsRead += source.recordsRead;
    target.recordsCreated += source.recordsCreated;
    target.recordsUpdated += source.recordsUpdated;
    target.recordsCanceled += source.recordsCanceled;
    target.recordsSkipped += source.recordsSkipped;
  }
}
