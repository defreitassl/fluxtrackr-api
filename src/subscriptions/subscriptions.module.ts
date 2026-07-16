import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitiesModule } from '../activities/activities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionChargesMaterializerService } from './subscription-charges-materializer.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
@Module({ imports: [PrismaModule, ActivitiesModule, NotificationsModule], controllers: [SubscriptionsController], providers: [SubscriptionsService, SubscriptionChargesMaterializerService], exports: [SubscriptionsService, SubscriptionChargesMaterializerService] })
export class SubscriptionsModule {}
