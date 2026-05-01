import {
  Controller,
  Post,
  Body,
  Inject,
  Logger,
  Req,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Request } from 'express';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

export class GuardEventDto {
  source!: 'dashboard' | 'api_gateway' | 'spring_boot' | 'pulsecore';
  severity?: 'warning' | 'error' | 'critical';
  category?: string;
  message!: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  affectedConnector?: string;
  affectedFlowIds?: string[];
  metadata?: Record<string, any>;
}

@Controller('api/guard')
export class GuardIngestController {
  private readonly logger = new Logger('GuardIngestController');

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  @Post('ingest')
  async ingest(@Body() body: GuardEventDto, @Req() request: Request) {
    try {
      // Validate required fields
      if (!body.message) {
        throw new BadRequestException('message is required');
      }

      if (!body.source) {
        throw new BadRequestException('source is required');
      }

      // Extract tenant from request (would come from JWT in real scenario)
      const tenantId = (request as any).tenantId || uuidv4();
      const deploymentSha = process.env.DEPLOYMENT_SHA || 'unknown';
      const receivedAt = new Date().toISOString();

      // Build GuardEvent structure matching blueprint
      const guardEvent = {
        id: uuidv4(),
        tenant_id: tenantId,
        source: body.source,
        severity: body.severity || 'error',
        category: body.category || 'UnhandledException',
        message: body.message,
        stack_trace: body.stack || null,
        surrounding_logs: [], // Will be enriched by triage service
        affected_connector: body.affectedConnector || null,
        affected_flow_ids: body.affectedFlowIds || [],
        deployment_sha: deploymentSha,
        received_at: receivedAt,
        metadata: {
          url: body.url,
          userAgent: body.userAgent,
          ...body.metadata,
        },
      };

      // Write to Redis stream with proper structure
      const streamId = await this.redis.xadd(
        'guard:events',
        '*',
        'payload',
        JSON.stringify(guardEvent),
      );

      this.logger.log(
        `Ingested guard event id=${guardEvent.id} stream_id=${streamId} source=${body.source}`,
      );

      return {
        status: 'ok',
        id: guardEvent.id,
        streamId,
      };
    } catch (err) {
      this.logger.error('Failed to ingest guard event', err as any);
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new InternalServerErrorException('Failed to ingest guard event');
    }
  }
}
