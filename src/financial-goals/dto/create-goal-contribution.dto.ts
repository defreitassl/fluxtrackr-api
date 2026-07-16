import { GoalContributionType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export class CreateGoalContributionDto {
  @IsEnum(GoalContributionType) type!: GoalContributionType;
  @Matches(/^(?!0+\.00$)\d+\.\d{2}$/) amount!: string;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsString() note?: string | null;
}
