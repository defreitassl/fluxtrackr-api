import { NotificationCategory, NotificationSeverity, NotificationType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

const boolean = ({ value }: { value: unknown }) => value === true || value === 'true';
export class ListNotificationsDto {
  @IsOptional() @IsEnum(NotificationCategory) category?: NotificationCategory;
  @IsOptional() @IsEnum(NotificationType) type?: NotificationType;
  @IsOptional() @IsEnum(NotificationSeverity) severity?: NotificationSeverity;
  @IsOptional() @Transform(boolean) @IsBoolean() isRead?: boolean;
  @IsOptional() @Transform(boolean) @IsBoolean() includeResolved?: boolean;
  @IsOptional() @Transform(boolean) @IsBoolean() includeDismissed?: boolean;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsUUID() cursor?: string;
}
