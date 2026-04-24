import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

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
