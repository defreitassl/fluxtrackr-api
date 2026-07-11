import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountTransfersController } from './account-transfers.controller';
import { AccountTransfersService } from './account-transfers.service';

@Module({
  imports: [PrismaModule],
  controllers: [AccountTransfersController],
  providers: [AccountTransfersService],
})
export class AccountTransfersModule {}
