import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

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

export class UpsertWorkspaceCredentialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  value!: string;
}

export class FilterConditionDto {
  @IsString()
  @IsNotEmpty()
  field!: string;

  @IsString()
  @IsNotEmpty()
  op!: string;

  @IsOptional()
  value?: unknown;
}

export class TriggerDefinitionDto {
  @IsString()
  @IsNotEmpty()
  connector!: string;

  @IsString()
  @IsNotEmpty()
  event!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterConditionDto)
  filters?: FilterConditionDto[];
}

export class RetryPolicyDto {
  @IsOptional()
  max_retries?: number;

  @IsOptional()
  initial_backoff_ms?: number;
}

export class FlowStepDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  @IsString()
  connector?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsObject()
  input_mapping?: Record<string, string>;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  depends_on!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => RetryPolicyDto)
  retry_policy?: RetryPolicyDto;

  @IsOptional()
  @IsString()
  condition?: string;
}

export class ErrorPolicyDto {
  @IsString()
  @IsNotEmpty()
  on_failure!: string;

  @IsOptional()
  @IsString()
  notify_email?: string;
}

export class FlowDefinitionDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @ValidateNested()
  @Type(() => TriggerDefinitionDto)
  trigger!: TriggerDefinitionDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlowStepDto)
  steps!: FlowStepDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ErrorPolicyDto)
  error_policy?: ErrorPolicyDto;
}

export class CustomConnectorContractDto {
  @IsString()
  @IsNotEmpty()
  endpoint_url!: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  body?: unknown;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  @IsString()
  bearer_token?: string;

  @IsOptional()
  @IsString()
  api_key_header?: string;

  @IsOptional()
  @IsString()
  api_key_value?: string;
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

  @ValidateNested()
  @Type(() => FlowDefinitionDto)
  definition!: FlowDefinitionDto;
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
  @ValidateNested()
  @Type(() => FlowDefinitionDto)
  definition?: FlowDefinitionDto;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
