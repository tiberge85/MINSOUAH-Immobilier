import { IsString, IsEnum, IsOptional, IsBoolean, IsNumber, IsArray } from 'class-validator';
import { DamageSeverity } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateDamageDto {
  @IsString() description: string;
  @IsEnum(DamageSeverity) severity: DamageSeverity;
  @IsOptional() @Type(() => Number) @IsNumber() repairCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() replacementCost?: number;
  @IsOptional() @IsBoolean() tenantResponsibility?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() depositDeduction?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) photoUrls?: string[];
}
