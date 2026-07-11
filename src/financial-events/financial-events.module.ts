import { Module } from '@nestjs/common';
import { CreditCardPurchasesModule } from '../credit-card-purchases/credit-card-purchases.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FinancialEventsController } from './financial-events.controller';
import { FinancialEventsService } from './financial-events.service';

@Module({
  imports: [PrismaModule, CreditCardPurchasesModule],
  controllers: [FinancialEventsController],
  providers: [FinancialEventsService],
})
export class FinancialEventsModule {}
