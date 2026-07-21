import { Transform } from 'class-transformer';
import { IsDecimal, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { IsDecimal12_2 } from '../../common/validators/is-decimal-12-2';

export class CreateAccountTransferDto {
  @IsUUID()
  sourceAccountId!: string;

  @IsUUID()
  destinationAccountId!: string;

  @IsDecimal({ decimal_digits: '0,2', force_decimal: false })
  @IsDecimal12_2()
  amount!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MinLength(1)
  description?: string;
}
