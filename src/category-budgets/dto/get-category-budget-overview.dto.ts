import { Type } from 'class-transformer';
import { IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetCategoryBudgetOverviewDto {
  @Type(() => Number) @IsInt() @Min(1) year!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) month!: number;
  @IsOptional() @IsISO8601() asOf?: string;
}
