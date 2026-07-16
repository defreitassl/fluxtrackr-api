import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivitiesModule } from '../activities/activities.module';
import { FinancialGoalProgressService } from './financial-goal-progress.service';
import { FinancialGoalsController } from './financial-goals.controller';
import { FinancialGoalsService } from './financial-goals.service';

@Module({
  imports: [PrismaModule, ActivitiesModule],
  controllers: [FinancialGoalsController],
  providers: [FinancialGoalsService, FinancialGoalProgressService],
  exports: [FinancialGoalProgressService],
})
export class FinancialGoalsModule {}
