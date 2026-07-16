import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CategoryTypeDto } from './create-category.dto';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(CategoryTypeDto)
  type?: CategoryTypeDto;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
