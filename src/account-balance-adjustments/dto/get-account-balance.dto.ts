import { IsISO8601, IsOptional } from 'class-validator';

export class GetAccountBalanceDto {
  @IsOptional()
  @IsISO8601()
  asOf?: string;
}
