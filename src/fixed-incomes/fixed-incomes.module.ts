import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FixedIncomesController } from './fixed-incomes.controller';
import { FixedIncomesService } from './fixed-incomes.service';

@Module({
  imports: [PrismaModule],
  controllers: [FixedIncomesController],
  providers: [FixedIncomesService],
})
export class FixedIncomesModule {}

