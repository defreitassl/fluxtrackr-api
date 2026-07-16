import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { CategoryTypeDto } from './create-category.dto';

export class ListCategoriesDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(CategoryTypeDto)
  type?: CategoryTypeDto;
}
