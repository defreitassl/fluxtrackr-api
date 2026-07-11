import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { TransactionTypeDto } from '../../transactions/dto/create-transaction.dto';

export enum FinancialTimelineSourceTypeDto {
  transaction = 'transaction',
  financial_event = 'financial_event',
  credit_card_invoice = 'credit_card_invoice',
  fixed_expense = 'fixed_expense',
  fixed_income = 'fixed_income',
}

export class ListFinancialTimelineDto {
  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;

  @IsOptional()
  @IsEnum(TransactionTypeDto)
  type?: TransactionTypeDto;

  @IsOptional()
  @IsEnum(FinancialTimelineSourceTypeDto)
  sourceType?: FinancialTimelineSourceTypeDto;

  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includeCanceled = false;
}
