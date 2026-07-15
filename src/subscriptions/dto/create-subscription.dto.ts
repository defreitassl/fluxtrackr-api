import { PaymentMethod, RecurrenceType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString() @MinLength(1) name!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsDateString() nextChargeDate!: string;
  @IsEnum(RecurrenceType) recurrence!: RecurrenceType;
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsOptional() @IsUUID() accountId?: string | null;
  @IsOptional() @IsUUID() creditCardId?: string | null;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod | null;
  @IsOptional() @IsBoolean() autoRenew?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
