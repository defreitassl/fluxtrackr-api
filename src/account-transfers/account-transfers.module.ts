import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitiesModule } from '../activities/activities.module';
import { AccountTransfersController } from './account-transfers.controller';
import { AccountTransfersService } from './account-transfers.service';

@Module({
  imports: [PrismaModule, ActivitiesModule],
  controllers: [AccountTransfersController],
  providers: [AccountTransfersService],
})
export class AccountTransfersModule {}
