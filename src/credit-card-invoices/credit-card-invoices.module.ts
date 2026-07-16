import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitiesModule } from '../activities/activities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CreditCardInvoicesController } from './credit-card-invoices.controller';
import { CreditCardInvoicesService } from './credit-card-invoices.service';
@Module({ imports: [PrismaModule, ActivitiesModule, NotificationsModule], controllers: [CreditCardInvoicesController], providers: [CreditCardInvoicesService] })
export class CreditCardInvoicesModule {}
