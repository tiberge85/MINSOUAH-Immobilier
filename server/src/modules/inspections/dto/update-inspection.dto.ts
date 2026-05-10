import { IsString, IsEnum, IsDateString, IsOptional } from 'class-validator';
import { InspectionStatus } from '@prisma/client';

export class UpdateInspectionDto {
  @IsOptional() @IsDateString() scheduledDate?: string;
  @IsOptional() @IsDateString() conductedDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() generalCondition?: string;
  @IsOptional() @IsEnum(InspectionStatus) status?: InspectionStatus;
}
