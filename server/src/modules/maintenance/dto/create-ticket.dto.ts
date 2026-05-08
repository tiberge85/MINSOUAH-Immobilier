import { IsString, IsEnum, IsOptional } from 'class-validator';

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum TicketCategory {
  PLUMBING = 'PLUMBING',
  ELECTRICAL = 'ELECTRICAL',
  HVAC = 'HVAC',
  APPLIANCE = 'APPLIANCE',
  STRUCTURAL = 'STRUCTURAL',
  CLEANING = 'CLEANING',
  OTHER = 'OTHER',
}

export class CreateTicketDto {
  @IsString()
  unitId: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(TicketPriority)
  priority: TicketPriority;

  @IsEnum(TicketCategory)
  category: TicketCategory;

  @IsOptional()
  @IsString()
  assignedTo?: string;
}
