import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export enum CreditCardInvoiceStatusDto { open = 'open', closed = 'closed', paid = 'paid', overdue = 'overdue', canceled = 'canceled' }

export class ListCreditCardInvoicesDto {
  @IsOptional() @IsUUID() creditCardId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) year?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) month?: number;
  @IsOptional() @IsEnum(CreditCardInvoiceStatusDto) status?: CreditCardInvoiceStatusDto;
}
