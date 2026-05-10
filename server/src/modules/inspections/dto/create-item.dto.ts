import { IsString, IsEnum, IsOptional, IsInt, IsNumber, Min } from 'class-validator';
import { EquipmentCategory, ItemCondition } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateItemDto {
  @IsString() name: string;
  @IsEnum(EquipmentCategory) category: EquipmentCategory;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() estimatedValue?: number;
  @IsEnum(ItemCondition) condition: ItemCondition;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
