import { IsString, IsOptional } from 'class-validator';

export class SignInspectionDto {
  @IsString() signatureData: string; // base64 PNG
  @IsOptional() @IsString() consentText?: string;
}
