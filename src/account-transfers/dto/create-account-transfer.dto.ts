import { IsDateString, IsDecimal, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAccountTransferDto {
  @IsUUID()
  sourceAccountId!: string;

  @IsUUID()
  destinationAccountId!: string;

  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  amount!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
