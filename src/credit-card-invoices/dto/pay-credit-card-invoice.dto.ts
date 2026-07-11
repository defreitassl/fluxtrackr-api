import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class PayCreditCardInvoiceDto {
  @IsUUID()
  accountId!: string;

  @IsOptional()
  @IsISO8601()
  paidAt?: string;
}
