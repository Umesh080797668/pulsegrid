import { Controller, Get, Inject, OnModuleInit, Post, Body, Param, Headers, Req, RawBodyRequest, UnauthorizedException, BadRequestException, ParseUUIDPipe, UseGuards, InternalServerErrorException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable, firstValueFrom } from 'rxjs';
import { Redis } from 'ioredis';
import { Request } from 'express';
import * as crypto from 'crypto';
import { TriggerFlowDto, SetSecretDto } from './dto';
import { ManagementApiKeyGuard } from './management-api-key.guard';

interface PulseCoreService {
  triggerFlow(data: { workspaceId: string; flowId: string; payloadJson: string }): Observable<any>;
  setWorkspaceSecret(data: { workspaceId: string; secretName: string; secretValue: string }): Observable<any>;
  verifyWebhookSignature(data: { workspaceId: string; rawPayload: string; providedSignature: string }): Observable<{ isValid: boolean }>;
}

@Controller()
export class AppController implements OnModuleInit {
  private pulseCoreService!: PulseCoreService;

  constructor(
    @Inject('PULSECORE_PACKAGE') private client: ClientGrpc,
    @Inject('REDIS_CLIENT') private redis: Redis
  ) {}

  onModuleInit() {
    this.pulseCoreService = this.client.getService<PulseCoreService>('PulseCoreService');
  }

  @Post('trigger')
  triggerFlow(@Body() body: TriggerFlowDto) {
    console.log('Sending trigger request to Core Engine over gRPC...', body);
    return this.pulseCoreService.triggerFlow({
      workspaceId: body.workspaceId,
      flowId: body.flowId,
      payloadJson: JSON.stringify(body.payload),
    });
  }

  @UseGuards(ManagementApiKeyGuard)
  @Post('workspaces/:workspaceId/secrets')
  setSecret(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Body() body: SetSecretDto
  ) {
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

  @Post('webhook/:tenantId')
  async handleWebhook(
    @Param('tenantId', new ParseUUIDPipe({ version: '4' })) tenantId: string,
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-timestamp') webhookTimestamp: string,
    @Headers('x-webhook-nonce') webhookNonce: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
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
}
