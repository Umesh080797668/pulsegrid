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

      const tenantId = this.extractTenantId(request);
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

  private extractTenantId(request: Request): string {
    const req = request as Request & {
      tenantId?: string;
      user?: {
        workspaceId?: string;
        tenantId?: string;
      };
    };

    if (req.tenantId) {
      return req.tenantId;
    }

    if (req.user?.workspaceId) {
      return req.user.workspaceId;
    }

    if (req.user?.tenantId) {
      return req.user.tenantId;
    }

    const authHeader = request.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      const payload = this.decodeJwtPayload(token);
      const tenantFromToken = payload?.workspaceId || payload?.tenant_id || payload?.tenantId;
      if (typeof tenantFromToken === 'string' && tenantFromToken.length > 0) {
        return tenantFromToken;
      }
    }

    return uuidv4();
  }

  private decodeJwtPayload(token: string): Record<string, any> | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
      const decoded = Buffer.from(padded, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }
}
