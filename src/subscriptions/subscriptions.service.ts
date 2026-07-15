import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma, RecurrenceType, Subscription } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { ListSubscriptionsDto } from './dto/list-subscriptions.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionChargesMaterializerService } from './subscription-charges-materializer.service';

type SubscriptionData = {
  name: string; amount: Prisma.Decimal; nextChargeDate: Date; recurrence: RecurrenceType;
  categoryId: string | null; accountId: string | null; creditCardId: string | null;
  paymentMethod: PaymentMethod | null; autoRenew: boolean; isActive: boolean;
};

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService, private readonly materializer: SubscriptionChargesMaterializerService) {}

  create(userId: string, dto: CreateSubscriptionDto) {
    return this.runSerializableTransaction(async (tx) => {
      const data = this.fromDto(dto);
      await this.validate(tx, userId, data);
      const subscription = await tx.subscription.create({ data: { userId, ...data } });
      await this.materializer.materializeSubscription(subscription, new Date(), tx);
      return tx.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    });
  }

  findMany(userId: string, query: ListSubscriptionsDto) {
    return this.prisma.subscription.findMany({
      where: { userId, isActive: query.isActive ?? true, accountId: query.accountId, creditCardId: query.creditCardId, categoryId: query.categoryId },
      orderBy: [{ nextChargeDate: 'asc' }, { id: 'asc' }],
    });
  }

  async findOne(userId: string, id: string) {
    const subscription = await this.prisma.subscription.findFirst({ where: { id, userId } });
    if (!subscription) throw new NotFoundException('Subscription not found');
    return subscription;
  }

  update(userId: string, id: string, dto: UpdateSubscriptionDto) {
    return this.runSerializableTransaction(async (tx) => {
      const current = await tx.subscription.findFirst({ where: { id, userId } });
      if (!current) throw new NotFoundException('Subscription not found');
      const data = this.merge(current, dto);
      await this.validate(tx, userId, data);
      const subscription = await tx.subscription.update({ where: { id }, data });
      if (!subscription.isActive) return this.materializer.archive(id, new Date(), tx);
      await this.materializer.materializeSubscription(subscription, new Date(), tx);
      return tx.subscription.findUniqueOrThrow({ where: { id } });
    });
  }

  remove(userId: string, id: string) {
    return this.runSerializableTransaction(async (tx) => {
      const subscription = await tx.subscription.findFirst({ where: { id, userId } });
      if (!subscription) throw new NotFoundException('Subscription not found');
      await this.materializer.archive(id, new Date(), tx);
      return { archived: true };
    });
  }

  async summary(userId: string, asOf = new Date()) {
    const monthEnd = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 1) - 1);
    const [subscriptions, charges, nextCharge] = await Promise.all([
      this.prisma.subscription.findMany({ where: { userId, isActive: true }, select: { amount: true, recurrence: true } }),
      this.prisma.subscriptionCharge.findMany({ where: { userId, status: 'pending', chargeDate: { lte: monthEnd } }, select: { amount: true } }),
      this.prisma.subscriptionCharge.findFirst({ where: { userId, status: 'pending' }, orderBy: [{ chargeDate: 'asc' }, { id: 'asc' }], select: { id: true, subscriptionId: true, name: true, amount: true, chargeDate: true, accountId: true, creditCardId: true } }),
    ]);
    const monthlyEquivalent = subscriptions.reduce((total, item) => total.plus(item.recurrence === 'monthly' ? item.amount : item.recurrence === 'semiannual' ? item.amount.div(6) : item.amount.div(12)), new Prisma.Decimal(0));
    const pendingThisMonth = charges.reduce((total, item) => total.plus(item.amount), new Prisma.Decimal(0));
    return { asOf: asOf.toISOString(), activeSubscriptions: subscriptions.length, monthlyEquivalent: monthlyEquivalent.toFixed(2), pendingThisMonth: pendingThisMonth.toFixed(2), nextCharge: nextCharge ? { subscriptionId: nextCharge.subscriptionId, subscriptionChargeId: nextCharge.id, name: nextCharge.name, amount: nextCharge.amount.toFixed(2), chargeDate: nextCharge.chargeDate.toISOString(), accountId: nextCharge.accountId, creditCardId: nextCharge.creditCardId } : null };
  }

  private fromDto(dto: CreateSubscriptionDto): SubscriptionData {
    return { name: dto.name, amount: new Prisma.Decimal(dto.amount), nextChargeDate: new Date(dto.nextChargeDate), recurrence: dto.recurrence, categoryId: dto.categoryId ?? null, accountId: dto.accountId ?? null, creditCardId: dto.creditCardId ?? null, paymentMethod: dto.paymentMethod ?? null, autoRenew: dto.autoRenew ?? true, isActive: dto.isActive ?? true };
  }

  private merge(current: Subscription, dto: UpdateSubscriptionDto): SubscriptionData {
    return { name: dto.name ?? current.name, amount: dto.amount === undefined ? current.amount : new Prisma.Decimal(dto.amount), nextChargeDate: dto.nextChargeDate ? new Date(dto.nextChargeDate) : current.nextChargeDate, recurrence: dto.recurrence ?? current.recurrence, categoryId: dto.categoryId === undefined ? current.categoryId : dto.categoryId, accountId: dto.accountId === undefined ? current.accountId : dto.accountId, creditCardId: dto.creditCardId === undefined ? current.creditCardId : dto.creditCardId, paymentMethod: dto.paymentMethod === undefined ? current.paymentMethod : dto.paymentMethod, autoRenew: dto.autoRenew ?? current.autoRenew, isActive: dto.isActive ?? current.isActive };
  }

  private async validate(tx: Prisma.TransactionClient, userId: string, data: SubscriptionData) {
    if (!data.name.trim()) throw new BadRequestException('Subscription name is required');
    if (new Prisma.Decimal(data.amount).lessThanOrEqualTo(0)) throw new BadRequestException('Subscription amount must be greater than zero');
    if (Number.isNaN(data.nextChargeDate.getTime())) throw new BadRequestException('nextChargeDate must be a valid ISO date');
    if (!['monthly', 'semiannual', 'yearly'].includes(data.recurrence)) throw new BadRequestException('Subscription recurrence must be monthly, semiannual, or yearly');
    if (!!data.accountId === !!data.creditCardId) throw new BadRequestException('Subscription requires exactly one accountId or creditCardId');
    if (data.categoryId) {
      const category = await tx.category.findFirst({ where: { id: data.categoryId, userId, type: { in: ['expense', 'both'] } }, select: { id: true } });
      if (!category) throw new BadRequestException('Invalid categoryId');
    }
    if (data.accountId) {
      if (!data.paymentMethod) throw new BadRequestException('Account subscription requires paymentMethod');
      if (data.paymentMethod === 'credit') throw new BadRequestException('Account subscription does not accept credit paymentMethod');
      const account = await tx.account.findFirst({ where: { id: data.accountId, userId, isActive: true }, select: { id: true } });
      if (!account) throw new BadRequestException('Invalid accountId');
    }
    if (data.creditCardId) {
      if (data.paymentMethod) throw new BadRequestException('Credit card subscription does not accept paymentMethod');
      const card = await tx.creditCard.findFirst({ where: { id: data.creditCardId, userId, isActive: true }, select: { id: true } });
      if (!card) throw new BadRequestException('Invalid creditCardId');
    }
  }

  private async runSerializableTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try { return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < 3) continue;
          throw new ConflictException('Subscription update conflict');
        }
        throw error;
      }
    }
    throw new ConflictException('Subscription update conflict');
  }
}
