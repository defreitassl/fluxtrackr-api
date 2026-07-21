import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { CategoryTypeDto } from './create-category.dto';

export class ListCategoriesDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  isActive?: boolean;

  /** Inclui ativas e arquivadas quando nenhum status específico foi escolhido. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  includeArchived?: boolean;

  @IsOptional()
  @IsEnum(CategoryTypeDto)
  type?: CategoryTypeDto;
}
