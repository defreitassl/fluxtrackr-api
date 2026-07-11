import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class ListCreditCardPurchasesDto {
  @IsOptional()
  @IsUUID()
  creditCardId?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}
