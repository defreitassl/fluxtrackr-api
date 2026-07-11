import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountBalanceService } from './account-balance.service';

@Module({
  imports: [PrismaModule],
  providers: [AccountBalanceService],
  exports: [AccountBalanceService],
})
export class AccountBalancesModule {}
