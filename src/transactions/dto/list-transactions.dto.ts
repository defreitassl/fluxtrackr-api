import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { TransactionTypeDto } from './create-transaction.dto';

export class ListTransactionsDto {
  @IsOptional()
  @IsEnum(TransactionTypeDto)
  type?: TransactionTypeDto;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

