import { IsDateString, IsOptional } from 'class-validator';
export class SubscriptionsSummaryDto { @IsOptional() @IsDateString() asOf?: string; }
