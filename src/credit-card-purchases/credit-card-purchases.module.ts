import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CreditCardPurchasesController } from './credit-card-purchases.controller';
import { CreditCardPurchasesService } from './credit-card-purchases.service';
import { CreditCardPurchaseDomainService } from './credit-card-purchase-domain.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [CreditCardPurchasesController],
  providers: [CreditCardPurchasesService, CreditCardPurchaseDomainService],
  exports: [CreditCardPurchaseDomainService],
})
export class CreditCardPurchasesModule {}
