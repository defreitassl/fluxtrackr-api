import { Transform } from 'class-transformer';
import { IsDecimal, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAccountBalanceAdjustmentDto {
  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  newBalance!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MinLength(1)
  reason?: string;
}
