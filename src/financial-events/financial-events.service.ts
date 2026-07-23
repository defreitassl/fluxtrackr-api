import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreditCardPurchaseDomainService } from '../credit-card-purchases/credit-card-purchase-domain.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activities/activity.service';
import { NotificationImpactService } from '../notifications/notification-impact.service';
import { CreateFinancialEventDto } from './dto/create-financial-event.dto';
import { ListFinancialEventsDto } from './dto/list-financial-events.dto';
import { PostponeFinancialEventDto } from './dto/postpone-financial-event.dto';
import { UpdateFinancialEventDto } from './dto/update-financial-event.dto';
import {
  getNextFinancialEventDate,
  SupportedRecurrence,
} from './financial-event-recurrence';

type EventData = {
  type: 'income' | 'expense';
  name: string;
  expectedAmount: number | Prisma.Decimal;
  date: Date;
  categoryId?: string | null;
  accountId?: string | null;
  creditCardId?: string | null;
  paymentMethod?:
    | 'pix'
    | 'debit'
    | 'credit'
    | 'cash'
    | 'transfer'
    | 'boleto'
    | null;
  recurrence: SupportedRecurrence;
  installmentCount: number;
  notes?: string | null;
};

@Injectable()
export class FinancialEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchaseDomain: CreditCardPurchaseDomainService,
    private readonly activities?: ActivityService,
    private readonly impacts?: NotificationImpactService,
  ) {}

  async create(userId: string, dto: CreateFinancialEventDto) {
    const event = await this.prisma.$transaction(async (tx) => {
      const data: EventData = {
        ...dto,
        date: new Date(dto.date),
        recurrence: dto.recurrence ?? 'once',
        installmentCount: dto.installmentCount ?? 1,
      };
      await this.validateEventData(tx, userId, data);
      return tx.financialEvent.create({ data: { userId, ...data } });
    });
    await this.impacts?.evaluateFinancialEvent(userId, event.id);
    return event;
  }

  findMany(userId: string, filters: ListFinancialEventsDto) {
    return this.prisma.financialEvent.findMany({
      where: {
        userId,
        type: filters.type,
        status: filters.status,
        accountId: filters.accountId,
        creditCardId: filters.creditCardId,
        date:
          filters.startDate || filters.endDate
            ? {
                gte: filters.startDate ? new Date(filters.startDate) : undefined,
                lte: filters.endDate ? new Date(filters.endDate) : undefined,
              }
            : undefined,
      },
      orderBy: { date: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    const event = await this.prisma.financialEvent.findFirst({
      where: { id, userId },
      include: {
        confirmedTransaction: true,
        confirmedCreditCardPurchase: true,
      },
    });
    if (!event) throw new NotFoundException('Financial event not found');
    return event;
  }

  async update(userId: string, id: string, dto: UpdateFinancialEventDto) {
    const event = await this.prisma.$transaction(async (tx) => {
      const event = await this.findOwnedEvent(tx, userId, id);
      this.ensureEditable(event.status);
      const data: EventData = {
        type: dto.type ?? event.type,
        name: dto.name ?? event.name,
        expectedAmount: dto.expectedAmount ?? event.expectedAmount,
        date: dto.date ? new Date(dto.date) : event.date,
        categoryId:
          dto.categoryId === undefined ? event.categoryId : dto.categoryId,
        accountId: dto.accountId === undefined ? event.accountId : dto.accountId,
        creditCardId:
          dto.creditCardId === undefined
            ? event.creditCardId
            : dto.creditCardId,
        paymentMethod:
          dto.paymentMethod === undefined
            ? event.paymentMethod
            : dto.paymentMethod,
        recurrence: (dto.recurrence ?? event.recurrence) as SupportedRecurrence,
        installmentCount: dto.installmentCount ?? event.installmentCount,
        notes: dto.notes === undefined ? event.notes : dto.notes,
      };
      await this.validateEventData(tx, userId, data);
      return tx.financialEvent.update({ where: { id }, data });
    });
    await this.impacts?.evaluateFinancialEvent(userId, id);
    return event;
  }

  async remove(userId: string, id: string) {
    const event = await this.prisma.$transaction(async (tx) => {
      const event = await this.findOwnedEvent(tx, userId, id);
      if (event.status === 'realized' || event.status === 'canceled') {
        throw new BadRequestException(
          'Canceled or realized financial event cannot be changed',
        );
      }
      const updated = await tx.financialEvent.update({
        where: { id },
        data: { status: 'canceled' },
      });
      await this.activities?.record(tx, { userId, type: 'financial_event_canceled', entityType: 'financial_event', entityId: id, title: 'Evento financeiro cancelado', description: event.name, metadata: { amount: event.expectedAmount.toFixed(2), eventType: event.type, effectiveDate: event.date.toISOString() }, occurredAt: new Date() });
      return updated;
    });
    await this.impacts?.evaluateFinancialEvent(userId, id);
    return event;
  }

  async postpone(userId: string, id: string, dto: PostponeFinancialEventDto) {
    const event = await this.prisma.$transaction(async (tx) => {
      const event = await this.findOwnedEvent(tx, userId, id);
      if (!['planned', 'postponed', 'confirmed'].includes(event.status)) {
        throw new BadRequestException(
          'Canceled or realized financial event cannot be changed',
        );
      }
      const updated = await tx.financialEvent.update({
        where: { id },
        data: { date: new Date(dto.date), status: 'postponed' },
      });
      await this.activities?.record(tx, { userId, type: 'financial_event_postponed', entityType: 'financial_event', entityId: id, title: 'Evento financeiro adiado', description: event.name, metadata: { amount: event.expectedAmount.toFixed(2), eventType: event.type, previousEffectiveDate: event.date.toISOString(), effectiveDate: updated.date.toISOString() }, occurredAt: new Date() });
      return updated;
    });
    await this.impacts?.evaluateFinancialEvent(userId, id);
    return event;
  }

  async confirm(userId: string, id: string) {
    const event = await this.runSerializableTransaction(async (tx) => {
      const event = await this.findOwnedEvent(tx, userId, id);
      if (event.status === 'confirmed' || event.status === 'realized') {
        throw new ConflictException('Financial event already confirmed');
      }
      if (event.status === 'canceled') {
        throw new BadRequestException('Canceled financial event cannot be confirmed');
      }
      if (!['planned', 'postponed'].includes(event.status)) {
        throw new BadRequestException('Financial event cannot be confirmed');
      }

      const data: EventData = {
        type: event.type,
        name: event.name,
        expectedAmount: event.expectedAmount,
        date: event.date,
        categoryId: event.categoryId,
        accountId: event.accountId,
        creditCardId: event.creditCardId,
        paymentMethod: event.paymentMethod,
        recurrence: event.recurrence as SupportedRecurrence,
        installmentCount: event.installmentCount,
        notes: event.notes,
      };
      await this.validateEventData(tx, userId, data);

      const updated = await tx.financialEvent.update({
        where: { id },
        data: { status: 'confirmed' },
      });
      await this.activities?.record(tx, { userId, type: 'financial_event_confirmed', entityType: 'financial_event', entityId: id, title: 'Evento financeiro confirmado', description: event.name, metadata: { amount: event.expectedAmount.toFixed(2), eventType: event.type, effectiveDate: event.date.toISOString() }, occurredAt: new Date() });
      return updated;
    });
    await this.impacts?.evaluateFinancialEvent(userId, id);
    return event;
  }

  async realize(userId: string, id: string) {
    const result = await this.runSerializableTransaction(async (tx) => {
      const event = await this.findOwnedEvent(tx, userId, id);
      if (
        event.status === 'realized' ||
        event.confirmedTransactionId ||
        event.confirmedCreditCardPurchaseId
      ) {
        throw new ConflictException('Financial event already realized');
      }
      if (event.status !== 'confirmed') {
        throw new BadRequestException('Only confirmed financial events can be realized');
      }

      const data: EventData = {
        type: event.type,
        name: event.name,
        expectedAmount: event.expectedAmount,
        date: event.date,
        categoryId: event.categoryId,
        accountId: event.accountId,
        creditCardId: event.creditCardId,
        paymentMethod: event.paymentMethod,
        recurrence: event.recurrence as SupportedRecurrence,
        installmentCount: event.installmentCount,
        notes: event.notes,
      };
      await this.validateEventData(tx, userId, data);

      let transaction: any;
      let creditCardPurchase: any;
      if (event.accountId) {
        if (!event.paymentMethod) {
          throw new BadRequestException(
            'Account financial event requires paymentMethod to be realized',
          );
        }
        transaction = await tx.transaction.create({
          data: {
            userId,
            type: event.type,
            amount: event.expectedAmount,
            description: event.name,
            categoryId: event.categoryId,
            accountId: event.accountId,
            paymentMethod: event.paymentMethod,
            occurredAt: event.date,
            source: 'app',
          },
        });
      } else if (event.creditCardId) {
        creditCardPurchase = await this.purchaseDomain.create(tx, userId, {
          creditCardId: event.creditCardId,
          categoryId: event.categoryId,
          description: event.name,
          totalAmount: event.expectedAmount,
          purchaseDate: event.date,
          installmentCount: event.installmentCount,
        });
      }

      const realizedEvent = await tx.financialEvent.update({
        where: { id },
        data: {
          status: 'realized',
          confirmedTransactionId: transaction?.id,
          confirmedCreditCardPurchaseId: creditCardPurchase?.id,
        },
      });
      const nextDate = getNextFinancialEventDate(
        event.date,
        event.recurrence as SupportedRecurrence,
      );
      const nextEvent = nextDate
        ? await tx.financialEvent.create({
            data: {
              userId,
              type: event.type,
              name: event.name,
              expectedAmount: event.expectedAmount,
              date: nextDate,
              categoryId: event.categoryId,
              accountId: event.accountId,
              creditCardId: event.creditCardId,
              paymentMethod: event.paymentMethod,
              recurrence: event.recurrence,
              installmentCount: event.installmentCount,
              notes: event.notes,
              status: 'planned',
            },
          })
        : null;
      await this.activities?.record(tx, { userId, type: 'financial_event_realized', entityType: 'financial_event', entityId: id, title: 'Evento financeiro realizado', description: event.name, metadata: { amount: event.expectedAmount.toFixed(2), eventType: event.type, effectiveDate: event.date.toISOString() }, occurredAt: new Date() });

      return {
        event: realizedEvent,
        transaction,
        creditCardPurchase,
        nextEvent,
      };
    });
    await this.impacts?.evaluateFinancialEvent(userId, id);
    if (result.nextEvent) await this.impacts?.evaluateFinancialEvent(userId, result.nextEvent.id);
    if (result.transaction) {
      await this.impacts?.evaluateBudgetsForCategoryMonth(
        userId,
        result.transaction.categoryId,
        result.transaction.occurredAt.getUTCFullYear(),
        result.transaction.occurredAt.getUTCMonth() + 1,
      );
    }
    await this.evaluateCreditCardPurchaseImpacts(userId, result.creditCardPurchase);
    return result;
  }

  private async evaluateCreditCardPurchaseImpacts(userId: string, purchase: any) {
    if (!this.impacts || !purchase) return;
    for (const installment of purchase.installments ?? []) {
      const invoice = installment.invoice;
      if (!invoice) continue;
      await this.impacts.evaluateInvoice(userId, invoice.id);
      await this.impacts.evaluateBudgetsForCategoryMonth(
        userId,
        installment.categoryId,
        invoice.year,
        invoice.month,
      );
    }
  }

  private async validateEventData(
    tx: Prisma.TransactionClient,
    userId: string,
    data: EventData,
  ) {
    if (new Prisma.Decimal(data.expectedAmount).lessThanOrEqualTo(0)) {
      throw new BadRequestException('Expected amount must be greater than zero');
    }
    if (data.installmentCount < 1 || data.installmentCount > 120) {
      throw new BadRequestException('Installment count must be between 1 and 120');
    }
    if (!['once', 'monthly', 'semiannual', 'yearly'].includes(data.recurrence)) {
      throw new BadRequestException('Unsupported recurrence');
    }
    if (data.type === 'income') {
      if (!data.accountId || data.creditCardId) {
        throw new BadRequestException(
          'Income financial event requires accountId and does not accept creditCardId',
        );
      }
    } else if (!!data.accountId === !!data.creditCardId) {
      throw new BadRequestException(
        'Expense financial event requires either accountId or creditCardId',
      );
    }
    if (data.creditCardId && data.paymentMethod) {
      throw new BadRequestException(
        'Credit card financial event does not accept paymentMethod',
      );
    }
    if (data.accountId && data.paymentMethod === 'credit') {
      throw new BadRequestException(
        'Account financial event does not accept credit paymentMethod',
      );
    }
    if (
      data.installmentCount !== 1 &&
      !(data.type === 'expense' && data.creditCardId)
    ) {
      throw new BadRequestException(
        'Installments are only allowed for credit card expenses',
      );
    }

    if (data.categoryId) {
      const category = await tx.category.findFirst({
        where: {
          id: data.categoryId,
          userId,
          type: {
            in: data.type === 'income' ? ['income', 'both'] : ['expense', 'both'],
          },
        },
        select: { id: true },
      });
      if (!category) throw new BadRequestException('Invalid categoryId');
    }
    if (data.accountId) {
      const account = await tx.account.findFirst({
        where: { id: data.accountId, userId, isActive: true },
        select: { id: true },
      });
      if (!account) throw new BadRequestException('Invalid accountId');
    }
    if (data.creditCardId) {
      const card = await tx.creditCard.findFirst({
        where: { id: data.creditCardId, userId, isActive: true },
        select: { id: true, closingDay: true },
      });
      if (!card || card.closingDay === null) {
        throw new BadRequestException('Invalid creditCardId');
      }
    }
  }

  private async findOwnedEvent(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    const event = await tx.financialEvent.findFirst({
      where: { id, userId },
    });
    if (!event) throw new NotFoundException('Financial event not found');
    return event;
  }

  private ensureEditable(status: string) {
    if (!['planned', 'postponed'].includes(status)) {
      throw new BadRequestException(
        'Only planned or postponed financial events can be edited',
      );
    }
  }

  private async runSerializableTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          if (attempt < 3) continue;
          throw new ConflictException('Financial event state transition conflict');
        }
        throw error;
      }
    }
    throw new ConflictException('Financial event state transition conflict');
  }
}
