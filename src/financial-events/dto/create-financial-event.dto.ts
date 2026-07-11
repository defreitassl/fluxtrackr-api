import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { PaymentMethodDto, TransactionTypeDto } from '../../transactions/dto/create-transaction.dto';

export enum FinancialEventRecurrenceDto {
  once = 'once',
  monthly = 'monthly',
  semiannual = 'semiannual',
  yearly = 'yearly',
}

export class CreateFinancialEventDto {
  @IsEnum(TransactionTypeDto)
  type!: TransactionTypeDto;

  @IsString()
  @MinLength(1)
  name!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  expectedAmount!: number;

  @IsISO8601()
  date!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  creditCardId?: string;

  @IsOptional()
  @IsEnum(PaymentMethodDto)
  paymentMethod?: PaymentMethodDto;

  @IsOptional()
  @IsEnum(FinancialEventRecurrenceDto)
  recurrence?: FinancialEventRecurrenceDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  installmentCount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
