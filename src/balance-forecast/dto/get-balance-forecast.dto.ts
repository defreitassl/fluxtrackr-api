import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

export class GetBalanceForecastDto {
  @IsOptional()
  @IsISO8601()
  asOf?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  horizonDays = 30;
}
