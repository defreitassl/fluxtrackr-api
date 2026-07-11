import { Module } from '@nestjs/common';
import { AccountBalancesModule } from '../account-balances/account-balances.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountBalanceAdjustmentsController } from './account-balance-adjustments.controller';
import { AccountBalanceAdjustmentsService } from './account-balance-adjustments.service';

@Module({
  imports: [PrismaModule, AccountBalancesModule],
  controllers: [AccountBalanceAdjustmentsController],
  providers: [AccountBalanceAdjustmentsService],
})
export class AccountBalanceAdjustmentsModule {}
