import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCreditCardPurchaseDto {
  @IsUUID()
  creditCardId!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  totalAmount!: number;

  @IsISO8601()
  purchaseDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  installmentCount!: number;
}
