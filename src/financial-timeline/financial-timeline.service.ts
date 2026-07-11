import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { calculateCreditCardInvoiceTotal } from '../credit-card-invoices/credit-card-invoice-total';
import { PrismaService } from '../prisma/prisma.service';
import {
  FinancialTimelineSourceTypeDto,
  ListFinancialTimelineDto,
} from './dto/list-financial-timeline.dto';

type TimelineType = 'income' | 'expense';
type BalanceImpact = 'realized' | 'projected' | 'informational' | 'none';

export type TimelineItem = {
  id: string;
  sourceType: FinancialTimelineSourceTypeDto;
  sourceId: string;
  type: TimelineType;
  title: string;
  amount: string;
  date: string;
  status: string;
  balanceImpact: BalanceImpact;
  accountId: string | null;
  creditCardId: string | null;
  categoryId: string | null;
  metadata: Record<string, unknown>;
};

export type FinancialTimelineOptions = {
  referenceDate?: Date;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class FinancialTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    userId: string,
    query: ListFinancialTimelineDto,
    options?: FinancialTimelineOptions,
  ) {
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);
    this.validateRange(startDate, endDate);

    const includes = (sourceType: FinancialTimelineSourceTypeDto) =>
      !query.sourceType || query.sourceType === sourceType;
    const includesExpense = !query.type || query.type === 'expense';
    const includesIncome = !query.type || query.type === 'income';
    const dateRange = { gte: startDate, lte: endDate };

    const [transactions, events, invoices, fixedExpenses, fixedIncomes] =
      await Promise.all([
        includes(FinancialTimelineSourceTypeDto.transaction)
          ? this.prisma.transaction.findMany({
              where: { userId, type: query.type, occurredAt: dateRange },
            })
          : Promise.resolve([]),
        includes(FinancialTimelineSourceTypeDto.financial_event)
          ? this.prisma.financialEvent.findMany({
              where: {
                userId,
                type: query.type,
                date: dateRange,
                status: {
                  in: query.includeCanceled
                    ? ['planned', 'confirmed', 'postponed', 'canceled']
                    : ['planned', 'confirmed', 'postponed'],
                },
                confirmedTransactionId: null,
                confirmedCreditCardPurchaseId: null,
              },
            })
          : Promise.resolve([]),
        includesExpense &&
        includes(FinancialTimelineSourceTypeDto.credit_card_invoice)
          ? this.prisma.creditCardInvoice.findMany({
              where: {
                userId,
                dueDate: dateRange,
                status: query.includeCanceled
                  ? undefined
                  : { not: 'canceled' },
              },
              include: {
                creditCard: {
                  select: {
                    id: true,
                    name: true,
                    bankName: true,
                    brand: true,
                    lastFourDigits: true,
                  },
                },
                installments: {
                  select: { installmentAmount: true, status: true },
                },
              },
            })
          : Promise.resolve([]),
        includesExpense && includes(FinancialTimelineSourceTypeDto.fixed_expense)
          ? this.prisma.fixedExpense.findMany({
              where: { userId, isActive: true, dueDay: { not: null } },
            })
          : Promise.resolve([]),
        includesIncome && includes(FinancialTimelineSourceTypeDto.fixed_income)
          ? this.prisma.fixedIncome.findMany({
              where: { userId, isActive: true, receiveDay: { not: null } },
            })
          : Promise.resolve([]),
      ]);

    const items: TimelineItem[] = [
      ...transactions.map((transaction) => ({
        id: transaction.id,
        sourceType: FinancialTimelineSourceTypeDto.transaction,
        sourceId: transaction.id,
        type: transaction.type,
        title: transaction.description,
        amount: transaction.amount.toFixed(2),
        date: transaction.occurredAt.toISOString(),
        status: 'realized',
        balanceImpact: 'realized' as const,
        accountId: transaction.accountId,
        creditCardId: null,
        categoryId: transaction.categoryId,
        metadata: { paymentMethod: transaction.paymentMethod, source: transaction.source },
      })),
      ...events.map((event) => ({
        id: event.id,
        sourceType: FinancialTimelineSourceTypeDto.financial_event,
        sourceId: event.id,
        type: event.type,
        title: event.name,
        amount: event.expectedAmount.toFixed(2),
        date: event.date.toISOString(),
        status: event.status,
        balanceImpact: event.status === 'canceled' ? ('none' as const) : ('projected' as const),
        accountId: event.accountId,
        creditCardId: event.creditCardId,
        categoryId: event.categoryId,
        metadata: { recurrence: event.recurrence, installmentCount: event.installmentCount },
      })),
      ...invoices.map((invoice) => {
        const total = calculateCreditCardInvoiceTotal(invoice.installments);
        const installmentCount = invoice.installments.filter(
          (installment) => installment.status !== 'canceled',
        ).length;
        return {
          id: invoice.id,
          sourceType: FinancialTimelineSourceTypeDto.credit_card_invoice,
          sourceId: invoice.id,
          type: 'expense' as const,
          title: `Fatura ${invoice.creditCard.name} - ${String(invoice.month).padStart(2, '0')}/${invoice.year}`,
          amount: total.toFixed(2),
          date: invoice.dueDate.toISOString(),
          status: invoice.status,
          balanceImpact:
            invoice.status === 'paid'
              ? ('informational' as const)
              : invoice.status === 'canceled'
                ? ('none' as const)
                : ('projected' as const),
          accountId: invoice.accountId,
          creditCardId: invoice.creditCardId,
          categoryId: null,
          metadata: { installmentCount, creditCard: invoice.creditCard },
        };
      }),
      ...this.fixedItems(
        fixedExpenses,
        'expense',
        FinancialTimelineSourceTypeDto.fixed_expense,
        'dueDay',
        startDate,
        endDate,
        options?.referenceDate,
      ),
      ...this.fixedItems(
        fixedIncomes,
        'income',
        FinancialTimelineSourceTypeDto.fixed_income,
        'receiveDay',
        startDate,
        endDate,
        options?.referenceDate,
      ),
    ];

    items.sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.sourceType.localeCompare(right.sourceType) ||
        left.id.localeCompare(right.id),
    );

    const summary = {
      realizedIncome: new Prisma.Decimal(0),
      realizedExpense: new Prisma.Decimal(0),
      projectedIncome: new Prisma.Decimal(0),
      projectedExpense: new Prisma.Decimal(0),
    };
    for (const item of items) {
      if (item.balanceImpact !== 'realized' && item.balanceImpact !== 'projected') continue;
      const key = `${item.balanceImpact}${item.type === 'income' ? 'Income' : 'Expense'}` as keyof typeof summary;
      summary[key] = summary[key].plus(item.amount);
    }

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      items,
      summary: Object.fromEntries(
        Object.entries(summary).map(([key, value]) => [key, value.toFixed(2)]),
      ),
    };
  }

  private validateRange(startDate: Date, endDate: Date) {
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }
    if (endDate.getTime() - startDate.getTime() > 366 * DAY_IN_MS) {
      throw new BadRequestException('Timeline range cannot exceed 366 days');
    }
  }

  private fixedItems<
    T extends {
      id: string;
      name: string;
      amount: Prisma.Decimal;
      dueDay?: number | null;
      receiveDay?: number | null;
    },
  >(
    records: T[],
    type: TimelineType,
    sourceType: FinancialTimelineSourceTypeDto,
    dayField: 'dueDay' | 'receiveDay',
    startDate: Date,
    endDate: Date,
    referenceDate?: Date,
  ): TimelineItem[] {
    const reference = referenceDate ?? new Date();
    const referenceDayUtc = new Date(Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate(),
    ));
    const effectiveStart = startDate > referenceDayUtc ? startDate : referenceDayUtc;
    const items: TimelineItem[] = [];

    for (const record of records) {
      const configuredDay = record[dayField];
      if (!configuredDay) continue;
      let year = effectiveStart.getUTCFullYear();
      let month = effectiveStart.getUTCMonth();
      const lastYear = endDate.getUTCFullYear();
      const lastMonth = endDate.getUTCMonth();
      while (year < lastYear || (year === lastYear && month <= lastMonth)) {
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const date = new Date(Date.UTC(year, month, Math.min(configuredDay, lastDay)));
        if (date >= effectiveStart && date <= endDate) {
          const isoDate = date.toISOString();
          items.push({
            id: `${record.id}:${isoDate.slice(0, 10)}`,
            sourceType,
            sourceId: record.id,
            type,
            title: record.name,
            amount: record.amount.toFixed(2),
            date: isoDate,
            status: 'planned',
            balanceImpact: 'projected',
            accountId: null,
            creditCardId: null,
            categoryId: null,
            metadata: { configuredDay },
          });
        }
        month += 1;
        if (month === 12) {
          month = 0;
          year += 1;
        }
      }
    }
    return items;
  }
}
