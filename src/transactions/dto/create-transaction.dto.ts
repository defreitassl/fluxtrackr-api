import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export enum TransactionTypeDto {
  income = 'income',
  expense = 'expense',
}

export enum TransactionSourceDto {
  app = 'app',
  telegram = 'telegram',
}

export enum PaymentMethodDto {
  pix = 'pix',
  debit = 'debit',
  credit = 'credit',
  cash = 'cash',
  transfer = 'transfer',
  boleto = 'boleto',
}

export class CreateTransactionDto {
  @IsEnum(TransactionTypeDto)
  type!: TransactionTypeDto;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsEnum(PaymentMethodDto)
  paymentMethod?: PaymentMethodDto;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;

  @IsEnum(TransactionSourceDto)
  source!: TransactionSourceDto;
}
