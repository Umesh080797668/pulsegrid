import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class TriggerFlowDto {
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;

  @IsString()
  @IsNotEmpty()
  flowId!: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class SetSecretDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  value!: string;
}

export class CreateFlowDto {
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsObject()
  definition!: Record<string, unknown>;
}

export class UpdateFlowDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
