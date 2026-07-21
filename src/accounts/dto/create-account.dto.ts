import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  Max,
  Min,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export enum AccountTypeDto {
  checking = 'checking',
  savings = 'savings',
  wallet = 'wallet',
  cash = 'cash',
  investment = 'investment',
  other = 'other',
}

export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  bank?: string;

  @IsEnum(AccountTypeDto)
  type!: AccountTypeDto;

  @IsOptional()
  @IsString()
  @MinLength(1)
  color?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  icon?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-9_999_999_999.99)
  @Max(9_999_999_999.99)
  initialBalance!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
