import { NotificationCategory } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class NotificationPreferenceItemDto {
  @IsEnum(NotificationCategory) category!: NotificationCategory;
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(90) leadDays?: number | null;
}

export class UpdateNotificationPreferencesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => NotificationPreferenceItemDto)
  preferences!: NotificationPreferenceItemDto[];
}
