import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { GuardGithubActionService } from './actions/github-action.service';

@Controller('guard')
export class GuardController implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('GuardController');
  private redis: Redis | null = null;
  private pool: Pool | null = null;

  constructor(private readonly githubActionService: GuardGithubActionService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    this.redis = new Redis(redisUrl);

    if (process.env.DATABASE_URL) {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    } else {
      this.logger.warn('DATABASE_URL not set; guard alert/index endpoints will be degraded');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
    }
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  @Get('health')
  health() {
    return { status: 'ok', service: 'guard' };
  }

  @Get('alerts')
  async listAlerts(
    @Query('tenant_id') tenantId?: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!this.pool) {
      return { alerts: [], total: 0, limit: 0, offset: 0 };
    }

    const normalizedLimit = Math.min(Math.max(Number(limit ?? '50') || 50, 1), 200);
    const normalizedOffset = Math.max(Number(offset ?? '0') || 0, 0);
    const values: any[] = [];
    const where: string[] = [];

    if (tenantId) {
      values.push(tenantId);
      where.push(`tenant_id = $${values.length}::uuid`);
    }
    if (status) {
      values.push(status);
      where.push(`status = $${values.length}`);
    }
    if (severity) {
      values.push(severity);
      where.push(`severity = $${values.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::bigint AS total FROM guard.alerts ${whereSql}`,
      values,
    );

    values.push(normalizedLimit);
    const limitIdx = values.length;
    values.push(normalizedOffset);
    const offsetIdx = values.length;

    const alertsResult = await this.pool.query(
      `
      SELECT id, tenant_id, guard_event_id, severity, source, status,
             ai_diagnosis, ai_confidence, web_sources, code_suggestion,
             maintenance_scope, github_issue_url, resolved_by, created_at, resolved_at
      FROM guard.alerts
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${limitIdx}
      OFFSET $${offsetIdx}
      `,
      values,
    );

    return {
      alerts: alertsResult.rows,
      total: Number(countResult.rows[0]?.total ?? 0),
      limit: normalizedLimit,
      offset: normalizedOffset,
    };
  }

  @Get('alerts/:id')
  async getAlert(@Param('id') id: string) {
    if (!this.pool) {
      throw new BadRequestException('Database unavailable');
    }

    this.logger.debug(`Fetching alert ${id}`);
    const result = await this.pool.query(
      `
      SELECT id, tenant_id, guard_event_id, severity, source, status,
             ai_diagnosis, ai_confidence, web_sources, code_suggestion,
             maintenance_scope, github_issue_url, resolved_by, created_at, resolved_at
      FROM guard.alerts
      WHERE id = $1::uuid
      LIMIT 1
      `,
      [id],
    );

    const alert = result.rows[0];
    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    return alert;
  }

  @Patch('alerts/:id/acknowledge')
  async acknowledgeAlert(@Param('id') id: string, @Body() body: { actor_user_id?: string }) {
    return this.updateAlertStatus(id, 'acknowledged', body?.actor_user_id);
  }

  @Patch('alerts/:id/resolve')
  async resolveAlert(@Param('id') id: string, @Body() body: { actor_user_id?: string }) {
    return this.updateAlertStatus(id, 'resolved', body?.actor_user_id);
  }

  @Patch('alerts/:id/dismiss')
  async dismissAlert(@Param('id') id: string, @Body() body: { actor_user_id?: string }) {
    return this.updateAlertStatus(id, 'dismissed', body?.actor_user_id);
  }

  @Post('alerts/:id/github')
  async createGithubIssueAndBranch(
    @Param('id') id: string,
    @Body()
    body?: {
      owner?: string;
      repo?: string;
      base_branch?: string;
    },
  ) {
    const result = await this.githubActionService.createIssueAndBranchFromAlert(
      id,
      body?.owner,
      body?.repo,
      body?.base_branch,
    );

    return {
      status: 'ok',
      ...result,
    };
  }

  @Get('maintenance')
  async getMaintenanceState(@Query('tenant_id') tenantId?: string) {
    if (!this.redis) {
      return { maintenance_active: false, states: [] };
    }

    const keys = tenantId
      ? [`guard:maintenance:${tenantId}`, `guard:maintenance:${tenantId}:flows`]
      : await this.redis.keys('guard:maintenance:*');

    if (keys.length === 0) {
      return { maintenance_active: false, states: [] };
    }

    const values = await this.redis.mget(...keys);
    const states = keys
      .map((key, idx) => ({ key, value: values[idx] }))
      .filter((entry) => !!entry.value)
      .map((entry) => {
        try {
          return { key: entry.key, state: JSON.parse(entry.value as string) };
        } catch {
          return { key: entry.key, state: entry.value };
        }
      });

    return {
      maintenance_active: states.length > 0,
      states,
    };
  }

  @Delete('maintenance')
  async clearMaintenance(
    @Body()
    body: {
      tenant_id?: string;
      actor_user_id?: string;
      reason?: string;
    },
  ) {
    if (!this.redis) {
      return { status: 'cleared', cleared_keys: 0 };
    }

    const keys = body?.tenant_id
      ? [`guard:maintenance:${body.tenant_id}`, `guard:maintenance:${body.tenant_id}:flows`]
      : await this.redis.keys('guard:maintenance:*');

    const deleted = keys.length > 0 ? await this.redis.del(...keys) : 0;

    const auditEntry = {
      timestamp: new Date().toISOString(),
      tenant_id: body?.tenant_id ?? null,
      actor_user_id: body?.actor_user_id ?? null,
      reason: body?.reason ?? 'manual_clear',
      cleared_keys: deleted,
      keys,
    };
    await this.redis.lpush('guard:maintenance:audit', JSON.stringify(auditEntry));
    await this.redis.ltrim('guard:maintenance:audit', 0, 499);

    return { status: 'cleared', cleared_keys: deleted };
  }

  @Get('index/status')
  async getIndexStatus() {
    if (!this.pool) {
      return { status: 'degraded', last_rebuilt: null, file_count: 0 };
    }

    const result = await this.pool.query<{
      file_count: string;
      last_indexed_at: string | null;
    }>(
      `
      SELECT COUNT(*)::bigint AS file_count,
             MAX(last_indexed_at)::text AS last_indexed_at
      FROM guard.codebase_index
      `,
    );

    const row = result.rows[0] ?? { file_count: '0', last_indexed_at: null };
    return {
      status: 'ok',
      last_rebuilt: row.last_indexed_at,
      file_count: Number(row.file_count ?? 0),
    };
  }

  @Post('index/rebuild')
  async rebuildIndex(@Body() body?: { requested_by?: string; reason?: string }) {
    if (this.redis) {
      await this.redis.set(
        'guard:index:rebuild:requested_at',
        new Date().toISOString(),
      );
      await this.redis.lpush(
        'guard:index:rebuild:audit',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          requested_by: body?.requested_by ?? null,
          reason: body?.reason ?? 'manual_rebuild',
        }),
      );
      await this.redis.ltrim('guard:index:rebuild:audit', 0, 499);
    }

    this.logger.log('Codebase index rebuild triggered');
    return { status: 'scheduled', requested_at: new Date().toISOString() };
  }

  private async updateAlertStatus(
    id: string,
    status: 'acknowledged' | 'resolved' | 'dismissed',
    actorUserId?: string,
  ) {
    if (!this.pool) {
      throw new BadRequestException('Database unavailable');
    }

    const shouldSetResolvedAt = status === 'resolved' || status === 'dismissed';
    const result = await this.pool.query(
      `
      UPDATE guard.alerts
      SET status = $2,
          resolved_by = CASE WHEN $3::uuid IS NULL THEN resolved_by ELSE $3::uuid END,
          resolved_at = CASE WHEN $4::boolean THEN NOW() ELSE resolved_at END
      WHERE id = $1::uuid
      RETURNING id, status, resolved_by, resolved_at
      `,
      [id, status, actorUserId ?? null, shouldSetResolvedAt],
    );

    const updated = result.rows[0];
    if (!updated) {
      throw new NotFoundException('Alert not found');
    }

    return updated;
  }
}
