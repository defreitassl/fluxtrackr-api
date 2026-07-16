import { Module } from '@nestjs/common';
import { FinancialAnalyticsModule } from '../financial-analytics/financial-analytics.module';
import { NotificationPreferencesModule } from '../notification-preferences/notification-preferences.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationEvaluatorService } from './notification-evaluator.service';
import { NotificationImpactService } from './notification-impact.service';
import { NotificationsService } from './notifications.service';
@Module({ imports: [PrismaModule, NotificationPreferencesModule, FinancialAnalyticsModule], controllers: [NotificationsController], providers: [NotificationsService, NotificationEvaluatorService, NotificationImpactService], exports: [NotificationsService, NotificationEvaluatorService, NotificationImpactService] })
export class NotificationsModule {}
