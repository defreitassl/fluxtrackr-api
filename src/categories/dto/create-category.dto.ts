import { IsEnum, IsString, MinLength } from 'class-validator';

export enum CategoryTypeDto {
  income = 'income',
  expense = 'expense',
  both = 'both',
}

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(CategoryTypeDto)
  type!: CategoryTypeDto;
}

