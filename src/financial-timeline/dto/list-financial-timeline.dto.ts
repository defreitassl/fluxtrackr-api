import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsISO8601, IsOptional } from 'class-validator';

export enum FinancialTimelineTypeDto {
  income = 'income',
  expense = 'expense',
  transfer = 'transfer',
  adjustment = 'adjustment',
}

export enum FinancialTimelineSourceTypeDto {
  transaction = 'transaction',
  financial_event = 'financial_event',
  credit_card_invoice = 'credit_card_invoice',
  fixed_expense = 'fixed_expense',
  fixed_income = 'fixed_income',
  account_transfer = 'account_transfer',
  account_balance_adjustment = 'account_balance_adjustment',
}

export class ListFinancialTimelineDto {
  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;

  @IsOptional()
  @IsEnum(FinancialTimelineTypeDto)
  type?: FinancialTimelineTypeDto;

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
