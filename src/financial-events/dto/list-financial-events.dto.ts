import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { TransactionTypeDto } from '../../transactions/dto/create-transaction.dto';

export enum FinancialEventStatusDto {
  planned = 'planned',
  confirmed = 'confirmed',
  postponed = 'postponed',
  canceled = 'canceled',
  realized = 'realized',
}

export class ListFinancialEventsDto {
  @IsOptional() @IsEnum(TransactionTypeDto) type?: TransactionTypeDto;
  @IsOptional() @IsEnum(FinancialEventStatusDto) status?: FinancialEventStatusDto;
  @IsOptional() @IsISO8601() startDate?: string;
  @IsOptional() @IsISO8601() endDate?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() creditCardId?: string;
}
