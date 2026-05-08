import { IsString, IsNumber, IsDateString, IsOptional, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum ContractStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  TERMINATED = 'TERMINATED',
  EXPIRING = 'EXPIRING',
}

export class CreateContractDto {
  @IsString()
  tenantId: string;

  @IsString()
  unitId: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  rentAmount: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  charges: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  depositAmount: number;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  paymentDayOfMonth: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
