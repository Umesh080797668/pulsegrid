import { Controller, Get, Inject, OnModuleInit, Post, Body, Param, Headers, Req, RawBodyRequest, UnauthorizedException, BadRequestException, ParseUUIDPipe, UseGuards, InternalServerErrorException, Delete, Put, Query } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import { Redis } from 'ioredis';
import { Request } from 'express';
import * as crypto from 'crypto';
import {
  TriggerFlowDto,
  SetSecretDto,
  UpsertWorkspaceCredentialDto,
  CreateFlowDto,
  UpdateFlowDto,
  CustomConnectorContractDto,
} from './dto';
import { ManagementApiKeyGuard } from './management-api-key.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RateLimitService } from './rate-limit.service';

interface PulseCoreService {
  triggerFlow(data: { workspaceId: string; flowId: string; payloadJson: string }): Observable<any>;
  setWorkspaceSecret(data: { workspaceId: string; secretName: string; secretValue: string }): Observable<any>;
  verifyWebhookSignature(data: { workspaceId: string; rawPayload: string; providedSignature: string }): Observable<{ isValid: boolean }>;
}

interface ConnectorCatalogItem {
  connector: string;
  action: string;
  category: string;
  auth: 'none' | 'bearer' | 'api_key' | 'oauth2' | 'mixed';
  required_input_fields: string[];
  optional_input_fields: string[];
  notes?: string[];
}

const CONNECTOR_CATALOG: ConnectorCatalogItem[] = [
  {
    connector: 'http',
    action: 'request',
    category: 'custom',
    auth: 'mixed',
    required_input_fields: ['url'],
    optional_input_fields: ['method', 'json_body', 'headers'],
  },
  {
    connector: 'slack',
    action: 'send_message',
    category: 'communication',
    auth: 'none',
    required_input_fields: ['webhook_url', 'text'],
    optional_input_fields: [],
  },
  {
    connector: 'gmail',
    action: 'send_email',
    category: 'communication',
    auth: 'oauth2',
    required_input_fields: ['access_token', 'from', 'to', 'subject', 'body'],
    optional_input_fields: [],
  },
  {
    connector: 'github',
    action: 'create_issue',
    category: 'developer',
    auth: 'oauth2',
    required_input_fields: ['access_token', 'owner', 'repo', 'title'],
    optional_input_fields: ['body'],
  },
  {
    connector: 'telegram',
    action: 'send_message',
    category: 'communication',
    auth: 'api_key',
    required_input_fields: ['bot_token', 'chat_id', 'text'],
    optional_input_fields: [],
  },
  {
    connector: 'google_sheets',
    action: 'append_rows',
    category: 'productivity',
    auth: 'oauth2',
    required_input_fields: ['access_token', 'spreadsheet_id', 'range', 'values'],
    optional_input_fields: [],
  },
  {
    connector: 'notion',
    action: 'create_page',
    category: 'productivity',
    auth: 'oauth2',
    required_input_fields: ['access_token', 'database_id', 'properties'],
    optional_input_fields: [],
  },
  {
    connector: 'discord',
    action: 'send_message',
    category: 'communication',
    auth: 'none',
    required_input_fields: ['webhook_url', 'content'],
    optional_input_fields: [],
  },
  {
    connector: 'schedule',
    action: 'next_run',
    category: 'core',
    auth: 'none',
    required_input_fields: ['cron'],
    optional_input_fields: ['from'],
  },
  {
    connector: 'webhook',
    action: 'verify_signature',
    category: 'core',
    auth: 'api_key',
    required_input_fields: ['secret', 'raw_payload', 'provided_signature'],
    optional_input_fields: [],
  },
  {
    connector: 'custom',
    action: 'call_api',
    category: 'custom',
    auth: 'mixed',
    required_input_fields: ['endpoint_url'],
    optional_input_fields: ['method', 'body', 'headers', 'bearer_token', 'api_key_header', 'api_key_value'],
    notes: ['Use connector=custom or connector=custom_app for generic API actions.'],
  },
  {
    connector: 'resend',
    action: 'send_email',
    category: 'communication',
    auth: 'bearer',
    required_input_fields: ['api_key', 'from', 'to', 'subject', 'html'],
    optional_input_fields: [],
  },
  {
    connector: 'openai',
    action: 'chat_completion',
    category: 'ai',
    auth: 'bearer',
    required_input_fields: ['api_key', 'messages'],
    optional_input_fields: ['model', 'temperature', 'endpoint_url'],
  },
  {
    connector: 'anthropic',
    action: 'messages',
    category: 'ai',
    auth: 'api_key',
    required_input_fields: ['api_key', 'messages'],
    optional_input_fields: ['model', 'max_tokens', 'endpoint_url'],
  },
  {
    connector: 'airtable',
    action: 'create_record',
    category: 'business',
    auth: 'bearer',
    required_input_fields: ['api_key', 'base_id', 'table', 'fields'],
    optional_input_fields: [],
  },
  {
    connector: 'hubspot',
    action: 'create_contact',
    category: 'business',
    auth: 'bearer',
    required_input_fields: ['access_token', 'properties'],
    optional_input_fields: [],
  },
  {
    connector: 'jira',
    action: 'create_issue',
    category: 'developer',
    auth: 'bearer',
    required_input_fields: ['domain', 'access_token', 'fields'],
    optional_input_fields: [],
  },
  {
    connector: 'linear',
    action: 'graphql',
    category: 'developer',
    auth: 'bearer',
    required_input_fields: ['api_key', 'query'],
    optional_input_fields: ['variables'],
  },
  {
    connector: 'asana',
    action: 'create_task',
    category: 'business',
    auth: 'bearer',
    required_input_fields: ['access_token', 'data'],
    optional_input_fields: [],
  },
  {
    connector: 'clickup',
    action: 'create_task',
    category: 'business',
    auth: 'api_key',
    required_input_fields: ['api_key', 'list_id', 'name'],
    optional_input_fields: ['description', 'assignees', 'tags'],
  },
  {
    connector: 'trello',
    action: 'create_card',
    category: 'productivity',
    auth: 'api_key',
    required_input_fields: ['key', 'token', 'list_id', 'name'],
    optional_input_fields: ['desc'],
  },
  {
    connector: 'zendesk',
    action: 'create_ticket',
    category: 'business',
    auth: 'bearer',
    required_input_fields: ['subdomain', 'access_token', 'ticket'],
    optional_input_fields: [],
  },
  {
    connector: 'pagerduty',
    action: 'enqueue_event',
    category: 'developer',
    auth: 'api_key',
    required_input_fields: ['routing_key', 'payload'],
    optional_input_fields: ['event_action'],
  },
  {
    connector: 'stripe',
    action: 'request',
    category: 'finance',
    auth: 'api_key',
    required_input_fields: ['api_key'],
    optional_input_fields: ['endpoint_url', 'method', 'body', 'headers'],
  },
];

@Controller()
export class AppController implements OnModuleInit {
  private pulseCoreService!: PulseCoreService;
  private readonly coreHttpBaseUrl = process.env.CORE_ENGINE_HTTP_URL || 'http://127.0.0.1:8000';

  constructor(
    @Inject('PULSECORE_PACKAGE') private client: ClientGrpc,
    @Inject('REDIS_CLIENT') private redis: Redis,
    private readonly rateLimitService: RateLimitService,
  ) {}

  onModuleInit() {
    this.pulseCoreService = this.client.getService<PulseCoreService>('PulseCoreService');
  }

  @UseGuards(JwtAuthGuard)
  @Post('trigger')
  async triggerFlow(@Body() body: TriggerFlowDto, @Req() req: Request) {
    await this.rateLimitService.check(
      `ratelimit:trigger:${this.getClientIdentifier(req)}`,
      Number(process.env.RATE_LIMIT_TRIGGER_PER_MINUTE || 120),
      60,
    );

    console.log('Sending trigger request to Core Engine over gRPC...', body);
    return this.pulseCoreService.triggerFlow({
      workspaceId: body.workspaceId,
      flowId: body.flowId,
      payloadJson: JSON.stringify(body.payload),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('flows')
  async createFlow(@Body() body: CreateFlowDto) {
    return this.coreRequest('/api/v1/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: body.workspaceId,
        name: body.name,
        description: body.description ?? null,
        definition: body.definition,
      }),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('flows')
  async listFlows(
    @Query('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
  ) {
    return this.coreRequest(`/api/v1/flows/${workspaceId}`, {
      method: 'GET',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('flows/:flowId')
  async getFlow(@Param('flowId', new ParseUUIDPipe({ version: '4' })) flowId: string) {
    return this.coreRequest(`/api/v1/flow/${flowId}`, {
      method: 'GET',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Put('flows/:flowId')
  async updateFlow(
    @Param('flowId', new ParseUUIDPipe({ version: '4' })) flowId: string,
    @Body() body: UpdateFlowDto,
  ) {
    return this.coreRequest(`/api/v1/flow/${flowId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: body.name,
        description: body.description,
        definition: body.definition,
        enabled: body.enabled,
      }),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Delete('flows/:flowId')
  async deleteFlow(@Param('flowId', new ParseUUIDPipe({ version: '4' })) flowId: string) {
    return this.coreRequest(`/api/v1/flow/${flowId}`, {
      method: 'DELETE',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('connectors/custom/schema')
  getCustomConnectorSchema() {
    const custom = CONNECTOR_CATALOG.find((item) => item.connector === 'custom');
    const supportedAliases = CONNECTOR_CATALOG
      .filter((item) => item.connector !== 'custom')
      .map((item) => item.connector);

    return {
      connector: 'custom',
      action: 'call_api',
      required_input_fields: ['endpoint_url'],
      optional_input_fields: [
        'method',
        'body',
        'headers',
        'bearer_token',
        'api_key_header',
        'api_key_value',
      ],
      contract_example: {
        endpoint_url: 'https://api.example.com/v1/items',
        method: 'POST',
        body: { name: 'PulseGrid' },
        headers: { 'X-App-Source': 'pulsegrid' },
      } satisfies CustomConnectorContractDto,
      notes: [
        'Use connector=custom or connector=custom_app in flow steps.',
        'For bearer auth, set bearer_token.',
        'For API-key auth, set both api_key_header and api_key_value.',
        ...(custom?.notes ?? []),
      ],
      supported_connector_aliases: supportedAliases,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('connectors/catalog')
  getConnectorCatalog() {
    return {
      count: CONNECTOR_CATALOG.length,
      generatedAt: new Date().toISOString(),
      items: CONNECTOR_CATALOG,
    };
  }

  @UseGuards(JwtAuthGuard, ManagementApiKeyGuard)
  @Post('workspaces/:workspaceId/secrets')
  async setSecret(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Body() body: SetSecretDto,
    @Req() req: Request,
  ) {
    await this.rateLimitService.check(
      `ratelimit:secret-upsert:${this.getClientIdentifier(req)}`,
      Number(process.env.RATE_LIMIT_SECRET_WRITES_PER_MINUTE || 30),
      60,
    );

    if (!body?.value) {
      throw new BadRequestException('Missing secret value');
    }

    const secretName = (body?.name?.trim() || 'WEBHOOK_SECRET').toUpperCase();
    console.log(`Setting secret ${secretName} for workspace ${workspaceId}...`);
    return this.pulseCoreService.setWorkspaceSecret({
      workspaceId,
      secretName,
      secretValue: body.value,
    });
  }

  @UseGuards(JwtAuthGuard, ManagementApiKeyGuard)
  @Post('workspaces/:workspaceId/credentials')
  async upsertWorkspaceCredential(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Body() body: UpsertWorkspaceCredentialDto,
    @Req() req: Request,
  ) {
    await this.rateLimitService.check(
      `ratelimit:credential-upsert:${this.getClientIdentifier(req)}`,
      Number(process.env.RATE_LIMIT_SECRET_WRITES_PER_MINUTE || 30),
      60,
    );

    return this.coreRequest(`/api/v1/workspaces/${workspaceId}/secrets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: body.name,
        value: body.value,
      }),
    });
  }

  @UseGuards(JwtAuthGuard, ManagementApiKeyGuard)
  @Get('workspaces/:workspaceId/credentials')
  async listWorkspaceCredentials(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
  ) {
    return this.coreRequest(`/api/v1/workspaces/${workspaceId}/secrets`, {
      method: 'GET',
    });
  }

  @UseGuards(JwtAuthGuard, ManagementApiKeyGuard)
  @Delete('workspaces/:workspaceId/credentials/:name')
  async deleteWorkspaceCredential(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Param('name') name: string,
  ) {
    const encodedName = encodeURIComponent(name);
    return this.coreRequest(`/api/v1/workspaces/${workspaceId}/secrets/${encodedName}`, {
      method: 'DELETE',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('flow-runs')
  async listFlowRuns(@Query('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string) {
    return this.coreRequest(`/api/v1/flow-runs/${workspaceId}`, {
      method: 'GET',
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('flow-runs/:runId')
  async getFlowRun(@Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string) {
    return this.coreRequest(`/api/v1/flow-run/${runId}`, {
      method: 'GET',
    });
  }

  @Post('webhook/:tenantId')
  async handleWebhook(
    @Param('tenantId', new ParseUUIDPipe({ version: '4' })) tenantId: string,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-timestamp') webhookTimestamp: string,
    @Headers('x-webhook-nonce') webhookNonce: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    await this.rateLimitService.check(
      `ratelimit:webhook:${tenantId}:${webhookNonce.slice(0, 8)}`,
      Number(process.env.RATE_LIMIT_WEBHOOK_PER_MINUTE || 300),
      60,
    );

    if (!signature) {
      throw new UnauthorizedException('Missing x-webhook-signature header');
    }

    if (!webhookTimestamp || !/^\d+$/.test(webhookTimestamp)) {
      throw new UnauthorizedException('Missing or invalid x-webhook-timestamp header');
    }

    if (!webhookNonce || webhookNonce.length < 16) {
      throw new UnauthorizedException('Missing or invalid x-webhook-nonce header');
    }

    const allowedSkewSeconds = Number.parseInt(process.env.WEBHOOK_MAX_SKEW_SECONDS || '300', 10);
    const timestampSeconds = Number.parseInt(webhookTimestamp, 10);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - timestampSeconds) > allowedSkewSeconds) {
      throw new UnauthorizedException('Webhook request expired or not yet valid');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Raw request body is missing');
    }

    // Call Core Engine to securely validate the HMAC
    const validationResponse = await firstValueFrom(
      this.pulseCoreService.verifyWebhookSignature({
        workspaceId: tenantId,
        rawPayload: rawBody.toString('utf8'),
        providedSignature: signature
      })
    );

    if (!validationResponse.isValid) {
      throw new UnauthorizedException('Invalid Webhook Signature');
    }

    const nonceKey = `webhook:nonce:${tenantId}:${webhookNonce}`;
    const nonceTtlSeconds = Math.max(allowedSkewSeconds * 2, 600);
    const nonceSetResult = await this.redis.set(nonceKey, '1', 'EX', nonceTtlSeconds, 'NX');
    if (nonceSetResult !== 'OK') {
      throw new UnauthorizedException('Replay detected');
    }

    // Process the webhook safely
    const payload = req.body;
    const eventId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const normalizedEvent = {
      id: eventId,
      tenant_id: tenantId,
      source: req.headers['user-agent'] ?? null,
      event_type: 'webhook',
      data: payload,
      timestamp,
      schema_version: '1.0',
      security: {
        webhook_timestamp: webhookTimestamp,
        webhook_nonce: webhookNonce,
      },
    };

    try {
      await this.redis.xadd(
        'stream:events:global',
        '*',
        'payload', JSON.stringify(normalizedEvent)
      );
    } catch {
      throw new InternalServerErrorException('Failed to publish event');
    }

    console.log(`Webhook published to Redis for tenant ${tenantId}`);
    return { status: 'success', tenantId, eventId };
  }

  @Get('health')
  health() {
    return 'API Gateway OK';
  }

  private async coreRequest(path: string, options: RequestInit) {
    let response: Response;
    try {
      response = await fetch(`${this.coreHttpBaseUrl}${path}`, options);
    } catch {
      throw new InternalServerErrorException('Core engine is unreachable');
    }

    const text = await response.text();
    const maybeJson = text ? (() => {
      try { return JSON.parse(text); } catch { return text; }
    })() : null;

    if (!response.ok) {
      if (response.status === 400) throw new BadRequestException(maybeJson || 'Invalid request');
      if (response.status === 401) throw new UnauthorizedException(maybeJson || 'Unauthorized');
      throw new InternalServerErrorException(typeof maybeJson === 'string' ? maybeJson : 'Core request failed');
    }

    return maybeJson;
  }

  private getClientIdentifier(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
      return forwardedFor.split(',')[0]!.trim();
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0]!.split(',')[0]!.trim();
    }

    return req.ip || 'unknown';
  }
}
