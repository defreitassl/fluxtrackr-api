import { ActivityEntityType, ActivityType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
export class ListActivitiesDto {
  @IsOptional() @IsEnum(ActivityType) type?: ActivityType;
  @IsOptional() @IsEnum(ActivityEntityType) entityType?: ActivityEntityType;
  @IsOptional() @IsUUID() entityId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsUUID() cursor?: string;
}
