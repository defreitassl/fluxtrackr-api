import { FixedOccurrenceStatus, FixedOccurrenceType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ListFixedOccurrencesDto {
  @IsOptional()
  @IsEnum(FixedOccurrenceType)
  type?: FixedOccurrenceType;

  @IsOptional()
  @IsEnum(FixedOccurrenceStatus)
  status?: FixedOccurrenceStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsUUID()
  fixedExpenseId?: string;

  @IsOptional()
  @IsUUID()
  fixedIncomeId?: string;
}
