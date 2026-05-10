import { IsString, IsEnum, IsDateString, IsOptional, IsUUID } from 'class-validator';
import { InspectionType } from '@prisma/client';

export class CreateInspectionDto {
  @IsUUID() contractId: string;
  @IsUUID() unitId: string;
  @IsUUID() tenantId: string;
  @IsEnum(InspectionType) type: InspectionType;
  @IsDateString() scheduledDate: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() entryInspectionId?: string;
}
