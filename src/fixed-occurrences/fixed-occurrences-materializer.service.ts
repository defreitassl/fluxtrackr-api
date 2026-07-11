import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma, FixedOccurrenceType, PaymentMethod } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class FixedOccurrencesMaterializerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FixedOccurrencesMaterializerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.materializeAll();
  }

  @Cron('0 5 0 * * *', { timeZone: 'UTC' })
  async materializeDaily() {
    await this.materializeAll();
  }

  async materializeAll(reference = new Date()) {
    const [expenses, incomes] = await Promise.all([
      this.prisma.fixedExpense.findMany({ where: { isActive: true } }),
      this.prisma.fixedIncome.findMany({ where: { isActive: true } }),
    ]);
    for (const expense of expenses) await this.materializeExpense(expense, reference);
    for (const income of incomes) await this.materializeIncome(income, reference);
  }

  materializeExpense(template: FixedTemplate, reference = new Date()) {
    return this.materializeTemplate(template, 'expense', template.dueDay, reference);
  }

  materializeIncome(template: FixedTemplate, reference = new Date()) {
    return this.materializeTemplate(template, 'income', template.receiveDay, reference);
  }

  private async materializeTemplate(
    template: FixedTemplate,
    type: FixedOccurrenceType,
    configuredDay: number | null | undefined,
    reference: Date,
  ) {
    if (!template.isActive || !configuredDay) return;
    const startYear = reference.getUTCFullYear();
    const startMonth = reference.getUTCMonth();
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
      const snapshot = {
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
      };
      const where = type === 'expense'
        ? { fixedExpenseId: template.id, year, month, status: 'pending' as const }
        : { fixedIncomeId: template.id, year, month, status: 'pending' as const };
      const updated = await this.prisma.fixedOccurrence.updateMany({ where, data: snapshot });
      if (updated.count > 0) continue;
      try {
        await this.prisma.fixedOccurrence.create({ data: snapshot });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        this.logger.error(`Failed to materialize ${type} template ${template.id}`);
        throw error;
      }
    }
  }
}
