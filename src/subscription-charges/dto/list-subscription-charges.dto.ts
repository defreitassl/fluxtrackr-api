import { SubscriptionChargeStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
export class ListSubscriptionChargesDto {
  @IsOptional() @IsUUID() subscriptionId?: string;
  @IsOptional() @IsEnum(SubscriptionChargeStatus) status?: SubscriptionChargeStatus;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() creditCardId?: string;
}
