import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, Subscription, SubscriptionChargeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

function utcDayStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function getRecurringDate(anchorDate: Date, monthOffset: number): Date {
  const target = new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth() + monthOffset, 1));
  const day = Math.min(anchorDate.getUTCDate(), new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate());
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day, anchorDate.getUTCHours(), anchorDate.getUTCMinutes(), anchorDate.getUTCSeconds(), anchorDate.getUTCMilliseconds()));
}

function recurrenceMonths(recurrence: Subscription['recurrence']) {
  return recurrence === 'monthly' ? 1 : recurrence === 'semiannual' ? 6 : recurrence === 'yearly' ? 12 : 0;
}

@Injectable()
export class SubscriptionChargesMaterializerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SubscriptionChargesMaterializerService.name);
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() { await this.materializeAll(); }

  @Cron('0 10 0 * * *', { timeZone: 'UTC' })
  async materializeDaily() { await this.materializeAll(); }

  async materializeAll(reference = new Date()) {
    const subscriptions = await this.prisma.subscription.findMany({ where: { isActive: true } });
    for (const subscription of subscriptions) await this.materializeSubscription(subscription, reference);
  }

  desiredChargeDates(subscription: Subscription, reference = new Date()) {
    const anchor = subscription.recurrenceAnchorDate;
    if (!subscription.autoRenew) return [anchor];
    const monthStart = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
    const horizonEnd = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 14, 1));
    const step = recurrenceMonths(subscription.recurrence);
    const dates: Date[] = [];
    if (!step) return dates;
    let offset = 0;
    let date = anchor;
    while (date < monthStart) { offset += step; date = getRecurringDate(anchor, offset); }
    while (date < horizonEnd) { dates.push(date); offset += step; date = getRecurringDate(anchor, offset); }
    return dates;
  }

  async materializeSubscription(subscription: Subscription, reference = new Date(), db: Db = this.prisma) {
    if (!subscription.isActive) return subscription;
    const nowDay = utcDayStart(reference);
    const dates = this.desiredChargeDates(subscription, reference);
    const desired = new Set(dates.map((date) => date.toISOString()));
    const snapshot = (chargeDate: Date) => ({
      userId: subscription.userId, subscriptionId: subscription.id, name: subscription.name,
      amount: subscription.amount, chargeDate, year: chargeDate.getUTCFullYear(), month: chargeDate.getUTCMonth() + 1,
      categoryId: subscription.categoryId, accountId: subscription.accountId, creditCardId: subscription.creditCardId,
      paymentMethod: subscription.paymentMethod,
    });
    for (const chargeDate of dates) {
      const data = snapshot(chargeDate);
      const updated = await db.subscriptionCharge.updateMany({
        where: { subscriptionId: subscription.id, chargeDate, status: 'pending', AND: [{ chargeDate: { gte: nowDay } }] }, data,
      });
      if (updated.count) continue;
      try { await db.subscriptionCharge.create({ data }); }
      catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      }
    }
    const pending = await db.subscriptionCharge.findMany({
      where: { subscriptionId: subscription.id, status: 'pending', chargeDate: { gte: nowDay } }, select: { id: true, chargeDate: true },
    });
    const stale = pending.filter((charge) => !desired.has(charge.chargeDate.toISOString())).map((charge) => charge.id);
    if (stale.length) await db.subscriptionCharge.updateMany({ where: { id: { in: stale } }, data: { status: 'canceled', canceledAt: reference } });
    return this.refreshNextCharge(subscription.id, reference, db);
  }

  async refreshNextCharge(subscriptionId: string, reference = new Date(), db: Db = this.prisma) {
    const subscription = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    const next = await db.subscriptionCharge.findFirst({ where: { subscriptionId, status: 'pending' }, orderBy: [{ chargeDate: 'asc' }, { id: 'asc' }], select: { chargeDate: true } });
    const isActive = subscription.isActive && (subscription.autoRenew || !!next);
    return db.subscription.update({ where: { id: subscriptionId }, data: { nextChargeDate: next?.chargeDate ?? subscription.nextChargeDate, isActive } });
  }

  async archive(subscriptionId: string, reference = new Date(), db: Db = this.prisma) {
    await db.subscriptionCharge.updateMany({ where: { subscriptionId, status: 'pending', chargeDate: { gt: reference } }, data: { status: SubscriptionChargeStatus.canceled, canceledAt: reference } });
    return db.subscription.update({ where: { id: subscriptionId }, data: { isActive: false } });
  }
}
