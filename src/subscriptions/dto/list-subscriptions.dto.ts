import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ListSubscriptionsDto {
  @IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() isActive?: boolean;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() creditCardId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
}
