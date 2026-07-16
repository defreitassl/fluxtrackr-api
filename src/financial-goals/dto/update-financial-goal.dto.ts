import { FinancialGoalStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateFinancialGoalDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @Matches(/^(?!0+\.00$)\d+\.\d{2}$/) targetAmount?: string;
  @IsOptional() @IsDateString() targetDate?: string | null;
  @IsOptional() @IsEnum(FinancialGoalStatus) status?: FinancialGoalStatus;
}
