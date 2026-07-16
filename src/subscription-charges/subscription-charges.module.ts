import { Module } from '@nestjs/common';
import { CreditCardPurchasesModule } from '../credit-card-purchases/credit-card-purchases.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitiesModule } from '../activities/activities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SubscriptionChargesController } from './subscription-charges.controller';
import { SubscriptionChargesService } from './subscription-charges.service';
@Module({ imports: [PrismaModule, CreditCardPurchasesModule, SubscriptionsModule, ActivitiesModule, NotificationsModule], controllers: [SubscriptionChargesController], providers: [SubscriptionChargesService] }) export class SubscriptionChargesModule {}
