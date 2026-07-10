import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { AccountTypeDto } from './create-account.dto';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  bank?: string | null;

  @IsOptional()
  @IsEnum(AccountTypeDto)
  type?: AccountTypeDto;

  @IsOptional()
  @IsString()
  @MinLength(1)
  color?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  icon?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  initialBalance?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
