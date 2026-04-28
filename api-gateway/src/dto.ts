import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  Min,
  Max,
  Matches,
  ValidateNested,
  IsIn
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
  @MinLength(1)
  name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  @MinLength(1)
  value!: string;
}

export class UpsertWorkspaceCredentialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @MinLength(1)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  @MinLength(1)
  value!: string;
}

export class CreateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @MinLength(1)
  @Matches(/^[a-z0-9_-]+$/, { message: 'slug must contain only lowercase letters, numbers, hyphens, and underscores' })
  slug?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class FilterConditionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  field!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @IsIn(['eq', 'ne', 'lt', 'le', 'gt', 'ge', 'contains', 'starts_with', 'ends_with', 'in', 'nin', 'regex'])
  op!: string;

  @IsOptional()
  value?: unknown;
}

export class TriggerDefinitionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  connector!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  event!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterConditionDto)
  filters?: FilterConditionDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  debounce_ms?: number;

  @IsOptional()
  @IsBoolean()
  replay_on_deploy?: boolean;
}

export class RetryPolicyDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  max_retries?: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(60000)
  initial_backoff_ms?: number;
}

export class FlowStepDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @IsIn([
    'action',
    'trigger',
    'condition',
    'loop',
    'parallel',
    'sub_flow',
    'filter',
    'transform',
    'delay',
    'fork',
  ])
  type!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  connector?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
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
  @MinLength(1)
  condition?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  timeout_ms?: number;
}

export class ErrorPolicyDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @IsIn(['retry', 'fail', 'skip', 'fallback'])
  on_failure!: string;

  @IsOptional()
  @IsEmail()
  notify_email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  fallback_step_id?: string;
}

export class FlowDefinitionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @MinLength(1)
  name!: string;

  @ValidateNested()
  @Type(() => TriggerDefinitionDto)
  trigger!: TriggerDefinitionDto;

  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => FlowStepDto)
  steps!: FlowStepDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ErrorPolicyDto)
  error_policy?: ErrorPolicyDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  timeout_ms?: number;

  @IsOptional()
  @IsString()
  version?: string;
}

export class CustomConnectorContractDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  endpoint_url!: string;

  @IsOptional()
  @IsString()
  @Matches(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/, { message: 'method must be a valid HTTP method' })
  method?: string;

  @IsOptional()
  body?: unknown;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MinLength(1)
  bearer_token?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  api_key_header?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  api_key_value?: string;
}

export class CreateFlowDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  workspaceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @MinLength(1)
  description?: string;

  @ValidateNested()
  @Type(() => FlowDefinitionDto)
  definition!: FlowDefinitionDto;
}

export class UpdateFlowDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @MinLength(1)
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FlowDefinitionDto)
  definition?: FlowDefinitionDto;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class InstallTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  templateId!: string;
}

export class TemplateResponseDto {
  id!: string;
  creator_workspace_id!: string;
  title!: string;
  description!: string;
  price_cents!: number;
  category!: string;
  published!: boolean;
}

export class SendVerificationEmailDto {
  @IsEmail()
  email!: string;
}

export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  token!: string;
}
