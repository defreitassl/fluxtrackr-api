import { IsDecimal, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAccountBalanceAdjustmentDto {
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  newBalance!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}
