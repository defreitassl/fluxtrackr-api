import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

export class CreateCategoryBudgetDto {
  @IsUUID()
  categoryId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @Matches(/^(?!0+\.00$)\d+\.\d{2}$/)
  limitAmount!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  warningPercentage?: number;
}
