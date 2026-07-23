import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, Subscription, SubscriptionChargeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExclusiveJobRunner } from '../observability/exclusive-job-runner';
import { measureJob } from '../observability/resource-metrics';

type Db = PrismaService | Prisma.TransactionClient;

export type SubscriptionChargeMaterializationMetrics = {
  templatesProcessed: number;
  recordsRead: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsCanceled: number;
  recordsSkipped: number;
};

type ChargeSnapshot = {
  userId: string;
  subscriptionId: string;
  name: string;
  amount: Prisma.Decimal;
  chargeDate: Date;
  year: number;
  month: number;
  categoryId: string | null;
  accountId: string | null;
  creditCardId: string | null;
  paymentMethod: Subscription['paymentMethod'];
};

const emptyMetrics = (): SubscriptionChargeMaterializationMetrics => ({
  templatesProcessed: 0,
  recordsRead: 0,
  recordsCreated: 0,
  recordsUpdated: 0,
  recordsCanceled: 0,
  recordsSkipped: 0,
});

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
  private readonly jobs = new ExclusiveJobRunner();
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() { await this.runMaterialization('bootstrap'); }

  @Cron('0 10 0 * * *', { timeZone: 'UTC' })
  async materializeDaily() { await this.runMaterialization('cron'); }

  async materializeAll(reference = new Date()) {
    const subscriptions = await this.prisma.subscription.findMany({ where: { isActive: true } });
    const metrics = emptyMetrics();
    for (const subscription of subscriptions) {
      const result = await this.materializeSubscriptionWithMetrics(subscription, reference);
      this.addMetrics(metrics, result.metrics);
    }
    return metrics;
  }

  private runMaterialization(origin: 'bootstrap' | 'cron' | 'manual') {
    return measureJob(this.logger, 'subscription_charges_materializer', { origin }, () =>
      this.jobs.run('subscription_charges_materializer', () => this.materializeAll()),
    );
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
    return (await this.materializeSubscriptionWithMetrics(subscription, reference, db)).subscription;
  }

  private async materializeSubscriptionWithMetrics(
    subscription: Subscription,
    reference = new Date(),
    db: Db = this.prisma,
  ): Promise<{ subscription: Subscription; metrics: SubscriptionChargeMaterializationMetrics }> {
    const metrics = emptyMetrics();
    if (!subscription.isActive) return { subscription, metrics };
    metrics.templatesProcessed = 1;
    const nowDay = utcDayStart(reference);
    const dates = this.desiredChargeDates(subscription, reference);
    const desired = new Set(dates.map((date) => date.toISOString()));
    const snapshot = (chargeDate: Date): ChargeSnapshot => ({
      userId: subscription.userId, subscriptionId: subscription.id, name: subscription.name,
      amount: subscription.amount, chargeDate, year: chargeDate.getUTCFullYear(), month: chargeDate.getUTCMonth() + 1,
      categoryId: subscription.categoryId, accountId: subscription.accountId, creditCardId: subscription.creditCardId,
      paymentMethod: subscription.paymentMethod,
    });
    const snapshots = dates.map(snapshot);
    const [existing, pending] = await Promise.all([
      snapshots.length
        ? db.subscriptionCharge.findMany({
            where: { subscriptionId: subscription.id, OR: snapshots.map(({ chargeDate }) => ({ chargeDate })) },
            select: {
              id: true, status: true, name: true, amount: true, chargeDate: true,
              year: true, month: true, categoryId: true, accountId: true,
              creditCardId: true, paymentMethod: true,
            },
          })
        : Promise.resolve([]),
      db.subscriptionCharge.findMany({
        where: { subscriptionId: subscription.id, status: 'pending', chargeDate: { gte: nowDay } },
        select: { id: true, chargeDate: true },
      }),
    ]);
    metrics.recordsRead = existing.length + pending.length;
    const existingByDate = new Map(existing.map((charge) => [charge.chargeDate.toISOString(), charge]));
    const creates: ChargeSnapshot[] = [];
    const updates: Array<{ id: string; data: Omit<ChargeSnapshot, 'userId' | 'subscriptionId'> }> = [];
    for (const data of snapshots) {
      const charge = existingByDate.get(data.chargeDate.toISOString());
      if (!charge) {
        creates.push(data);
        continue;
      }
      if (charge.status !== SubscriptionChargeStatus.pending || this.matchesSnapshot(charge, data)) {
        metrics.recordsSkipped += 1;
        continue;
      }
      updates.push({ id: charge.id, data: this.updateData(data) });
    }
    if (creates.length) {
      const created = await db.subscriptionCharge.createMany({ data: creates, skipDuplicates: true });
      metrics.recordsCreated = created.count;
      metrics.recordsSkipped += creates.length - created.count;
    }
    const stale = pending.filter((charge) => !desired.has(charge.chargeDate.toISOString())).map((charge) => charge.id);
    const operations: Array<Prisma.PrismaPromise<unknown> | Promise<unknown>> = [
      ...updates.map(({ id, data }) => db.subscriptionCharge.update({ where: { id }, data })),
    ];
    if (stale.length) {
      operations.push(db.subscriptionCharge.updateMany({
        where: { id: { in: stale } },
        data: { status: SubscriptionChargeStatus.canceled, canceledAt: reference },
      }));
    }
    if (operations.length) {
      if (db === this.prisma) await this.prisma.$transaction(operations as Prisma.PrismaPromise<unknown>[]);
      else await Promise.all(operations);
      metrics.recordsUpdated = updates.length;
      metrics.recordsCanceled = stale.length;
    }
    return { subscription: await this.refreshNextCharge(subscription.id, reference, db), metrics };
  }

  async refreshNextCharge(subscriptionId: string, reference = new Date(), db: Db = this.prisma) {
    const subscription = await db.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    const next = await db.subscriptionCharge.findFirst({ where: { subscriptionId, status: 'pending' }, orderBy: [{ chargeDate: 'asc' }, { id: 'asc' }], select: { chargeDate: true } });
    const isActive = subscription.isActive && (subscription.autoRenew || !!next);
    const nextChargeDate = next?.chargeDate ?? subscription.nextChargeDate;
    if (subscription.isActive === isActive && subscription.nextChargeDate.getTime() === nextChargeDate.getTime()) {
      return subscription;
    }
    return db.subscription.update({ where: { id: subscriptionId }, data: { nextChargeDate, isActive } });
  }

  async archive(subscriptionId: string, reference = new Date(), db: Db = this.prisma) {
    await db.subscriptionCharge.updateMany({ where: { subscriptionId, status: 'pending', chargeDate: { gt: reference } }, data: { status: SubscriptionChargeStatus.canceled, canceledAt: reference } });
    return db.subscription.update({ where: { id: subscriptionId }, data: { isActive: false } });
  }

  private updateData(snapshot: ChargeSnapshot) {
    const { userId: _userId, subscriptionId: _subscriptionId, ...data } = snapshot;
    return data;
  }

  private matchesSnapshot(
    charge: {
      name: string;
      amount: Prisma.Decimal;
      chargeDate: Date;
      year: number;
      month: number;
      categoryId: string | null;
      accountId: string | null;
      creditCardId: string | null;
      paymentMethod: Subscription['paymentMethod'];
    },
    snapshot: ChargeSnapshot,
  ) {
    return charge.name === snapshot.name
      && new Prisma.Decimal(charge.amount).equals(snapshot.amount)
      && charge.chargeDate.getTime() === snapshot.chargeDate.getTime()
      && charge.year === snapshot.year
      && charge.month === snapshot.month
      && charge.categoryId === snapshot.categoryId
      && charge.accountId === snapshot.accountId
      && charge.creditCardId === snapshot.creditCardId
      && charge.paymentMethod === snapshot.paymentMethod;
  }

  private addMetrics(target: SubscriptionChargeMaterializationMetrics, source: SubscriptionChargeMaterializationMetrics) {
    target.templatesProcessed += source.templatesProcessed;
    target.recordsRead += source.recordsRead;
    target.recordsCreated += source.recordsCreated;
    target.recordsUpdated += source.recordsUpdated;
    target.recordsCanceled += source.recordsCanceled;
    target.recordsSkipped += source.recordsSkipped;
  }
}
