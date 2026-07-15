import { PaymentMethod } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
export class RealizeSubscriptionChargeDto {
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() creditCardId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
}
