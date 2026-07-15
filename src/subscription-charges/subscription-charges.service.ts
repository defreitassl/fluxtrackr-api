import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreditCardPurchaseDomainService } from '../credit-card-purchases/credit-card-purchase-domain.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionChargesMaterializerService } from '../subscriptions/subscription-charges-materializer.service';
import { ListSubscriptionChargesDto } from './dto/list-subscription-charges.dto';
import { RealizeSubscriptionChargeDto } from './dto/realize-subscription-charge.dto';

@Injectable()
export class SubscriptionChargesService {
  constructor(private readonly prisma: PrismaService, private readonly purchases: CreditCardPurchaseDomainService, private readonly materializer: SubscriptionChargesMaterializerService) {}
  findMany(userId: string, query: ListSubscriptionChargesDto) { return this.prisma.subscriptionCharge.findMany({ where: { userId, subscriptionId: query.subscriptionId, status: query.status, accountId: query.accountId, creditCardId: query.creditCardId, chargeDate: query.startDate || query.endDate ? { gte: query.startDate ? new Date(query.startDate) : undefined, lte: query.endDate ? new Date(query.endDate) : undefined } : undefined }, orderBy: [{ chargeDate: 'asc' }, { id: 'asc' }] }); }
  async findOne(userId: string, id: string) { const charge = await this.prisma.subscriptionCharge.findFirst({ where: { id, userId } }); if (!charge) throw new NotFoundException('Subscription charge not found'); return charge; }
  realize(userId: string, id: string, dto: RealizeSubscriptionChargeDto) {
    return this.runSerializableTransaction(async (tx) => {
      const charge = await tx.subscriptionCharge.findFirst({ where: { id, userId }, include: { subscription: true } });
      if (!charge) throw new NotFoundException('Subscription charge not found');
      if (charge.status !== 'pending') throw new ConflictException('Only pending subscription charges can be realized');
      const accountId = dto.accountId ?? charge.accountId ?? charge.subscription.accountId;
      const creditCardId = dto.creditCardId ?? charge.creditCardId ?? charge.subscription.creditCardId;
      const categoryId = dto.categoryId ?? charge.categoryId ?? charge.subscription.categoryId;
      const paymentMethod = dto.paymentMethod ?? charge.paymentMethod ?? charge.subscription.paymentMethod;
      await this.validateResolved(tx, userId, accountId, creditCardId, categoryId, paymentMethod);
      const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
      const realizedAt = new Date();
      if (accountId) {
        const transaction = await tx.transaction.create({ data: { userId, type: 'expense', amount: charge.amount, description: charge.name, categoryId, accountId, paymentMethod: paymentMethod!, occurredAt, source: 'app' } });
        await tx.subscriptionCharge.update({ where: { id }, data: { status: 'realized', realizedTransactionId: transaction.id, realizedAt } });
        await this.refreshAfterTransition(tx, charge.subscription, realizedAt);
        return { charge: await tx.subscriptionCharge.findUniqueOrThrow({ where: { id } }), transaction, creditCardPurchase: null };
      }
      const creditCardPurchase = await this.purchases.create(tx, userId, { creditCardId: creditCardId!, categoryId, description: charge.name, totalAmount: charge.amount, purchaseDate: occurredAt, installmentCount: 1 });
      await tx.subscriptionCharge.update({ where: { id }, data: { status: 'realized', realizedCreditCardPurchaseId: creditCardPurchase.id, realizedAt } });
      await this.refreshAfterTransition(tx, charge.subscription, realizedAt);
      return { charge: await tx.subscriptionCharge.findUniqueOrThrow({ where: { id } }), transaction: null, creditCardPurchase };
    });
  }
  cancel(userId: string, id: string) { return this.runSerializableTransaction(async (tx) => { const charge = await tx.subscriptionCharge.findFirst({ where: { id, userId }, include: { subscription: true } }); if (!charge) throw new NotFoundException('Subscription charge not found'); if (charge.status !== 'pending') throw new ConflictException('Only pending subscription charges can be canceled'); const canceledAt = new Date(); const updated = await tx.subscriptionCharge.update({ where: { id }, data: { status: 'canceled', canceledAt } }); await this.refreshAfterTransition(tx, charge.subscription, canceledAt); return updated; }); }
  private async refreshAfterTransition(tx: Prisma.TransactionClient, subscription: any, reference: Date) { if (subscription.autoRenew && subscription.isActive) await this.materializer.materializeSubscription(subscription, reference, tx); else await this.materializer.refreshNextCharge(subscription.id, reference, tx); }
  private async validateResolved(tx: Prisma.TransactionClient, userId: string, accountId: string | null | undefined, creditCardId: string | null | undefined, categoryId: string | null | undefined, paymentMethod: any) {
    if (!!accountId === !!creditCardId) throw new BadRequestException('Subscription charge requires exactly one accountId or creditCardId');
    if (categoryId && !await tx.category.findFirst({ where: { id: categoryId, userId, type: { in: ['expense', 'both'] } }, select: { id: true } })) throw new BadRequestException('Invalid categoryId');
    if (accountId) { if (!paymentMethod) throw new BadRequestException('Account subscription charge requires paymentMethod'); if (paymentMethod === 'credit') throw new BadRequestException('Account subscription charge does not accept credit paymentMethod'); if (!await tx.account.findFirst({ where: { id: accountId, userId, isActive: true }, select: { id: true } })) throw new BadRequestException('Invalid accountId'); }
    if (creditCardId) { if (paymentMethod) throw new BadRequestException('Credit card subscription charge does not accept paymentMethod'); if (!await tx.creditCard.findFirst({ where: { id: creditCardId, userId, isActive: true }, select: { id: true } })) throw new BadRequestException('Invalid creditCardId'); }
  }
  private async runSerializableTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) { for (let attempt = 1; attempt <= 3; attempt += 1) { try { return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') { if (attempt < 3) continue; throw new ConflictException('Subscription charge state transition conflict'); } throw error; } } throw new ConflictException('Subscription charge state transition conflict'); }
}
