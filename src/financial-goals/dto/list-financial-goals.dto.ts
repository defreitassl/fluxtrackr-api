import { FinancialGoalStatus, GoalContributionType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class ListFinancialGoalsDto {
  @IsOptional() @IsEnum(FinancialGoalStatus) status?: FinancialGoalStatus;
  @IsOptional() @IsDateString() targetDateFrom?: string;
  @IsOptional() @IsDateString() targetDateTo?: string;
}

export class ListGoalContributionsDto {
  @IsOptional() @IsEnum(GoalContributionType) type?: GoalContributionType;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}
