import { IsDateString, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateFinancialGoalDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() description?: string | null;
  @Matches(/^(?!0+\.00$)\d+\.\d{2}$/) targetAmount!: string;
  @IsOptional() @IsDateString() targetDate?: string | null;
  @IsOptional() @Matches(/^\d+\.\d{2}$/) initialAmount?: string;
}
