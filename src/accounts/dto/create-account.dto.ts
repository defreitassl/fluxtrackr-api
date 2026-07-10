import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
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
  initialBalance!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
