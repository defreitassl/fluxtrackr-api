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
import { FinancialEventRecurrenceDto } from './create-financial-event.dto';

export class UpdateFinancialEventDto {
  @IsOptional() @IsEnum(TransactionTypeDto) type?: TransactionTypeDto;
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) expectedAmount?: number;
  @IsOptional() @IsISO8601() date?: string;
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsOptional() @IsUUID() accountId?: string | null;
  @IsOptional() @IsUUID() creditCardId?: string | null;
  @IsOptional() @IsEnum(PaymentMethodDto) paymentMethod?: PaymentMethodDto | null;
  @IsOptional() @IsEnum(FinancialEventRecurrenceDto) recurrence?: FinancialEventRecurrenceDto;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(120) installmentCount?: number;
  @IsOptional() @IsString() notes?: string | null;
}
