import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

export class UpdateCategoryBudgetDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) year?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) month?: number;
  @IsOptional() @Matches(/^(?!0+\.00$)\d+\.\d{2}$/) limitAmount?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) warningPercentage?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
