import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ListAccountTransfersDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  sourceAccountId?: string;

  @IsOptional()
  @IsUUID()
  destinationAccountId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
