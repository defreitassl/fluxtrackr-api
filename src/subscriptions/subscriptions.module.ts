import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionChargesMaterializerService } from './subscription-charges-materializer.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
@Module({ imports: [PrismaModule], controllers: [SubscriptionsController], providers: [SubscriptionsService, SubscriptionChargesMaterializerService], exports: [SubscriptionsService, SubscriptionChargesMaterializerService] })
export class SubscriptionsModule {}
