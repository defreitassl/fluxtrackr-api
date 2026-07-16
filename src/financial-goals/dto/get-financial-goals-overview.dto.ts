import { IsDateString, IsOptional } from 'class-validator';

export class GetFinancialGoalsOverviewDto {
  @IsOptional() @IsDateString() asOf?: string;
}
