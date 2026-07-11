import { IsISO8601, IsOptional } from 'class-validator';

export class GetDashboardOverviewDto {
  @IsOptional()
  @IsISO8601()
  asOf?: string;
}
