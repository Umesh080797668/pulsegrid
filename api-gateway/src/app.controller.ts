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
      ],
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
