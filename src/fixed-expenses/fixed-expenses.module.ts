import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FixedExpensesController } from './fixed-expenses.controller';
import { FixedExpensesService } from './fixed-expenses.service';

@Module({
  imports: [PrismaModule],
  controllers: [FixedExpensesController],
  providers: [FixedExpensesService],
})
export class FixedExpensesModule {}

