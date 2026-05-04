import { Injectable, Logger } from '@nestjs/common';
import { GuardEvent, TriageResult, MaintenanceResult } from '../types';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

@Injectable()
export class MaintenanceOrchestratorService {
  private readonly logger = new Logger('MaintenanceOrchestratorService');
  private redis: Redis | null = null;
  private pgPool: Pool | null = null;

  constructor() {
    this.initializeConnections();
  }

  private async initializeConnections() {
    if (!this.redis) {
      const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
      this.redis = new Redis(redisUrl);
    }

    if (!this.pgPool) {
      const { Pool: PgPool } = require('pg');
      this.pgPool = new PgPool({
        connectionString: process.env.DATABASE_URL,
      });
    }
  }

  async execute(
    event: GuardEvent,
    triage: TriageResult,
  ): Promise<MaintenanceResult> {
    await this.initializeConnections();

    switch (triage.maintenance_scope) {
      case 'none':
        this.logger.log(
          `Event ${event.id}: no maintenance action (warning level)`,
        );
        return { scope: 'none', pausedFlows: [] };

      case 'flows_only':
        return await this.pauseAffectedFlows(event, triage);

      case 'full':
        return await this.triggerFullMaintenance(event, triage);

      default:
        return { scope: 'none', pausedFlows: [] };
    }
  }

  private async pauseAffectedFlows(
    event: GuardEvent,
    triage: TriageResult,
  ): Promise<MaintenanceResult> {
    try {
      const targetFlowIds = await this.resolveScopedFlowIds(event);
      const pausedFlows: string[] = [];

      for (const flowId of targetFlowIds) {
        if (this.pgPool) {
          const result = await this.pgPool.query(
            `
            UPDATE flows
            SET enabled = false, updated_at = NOW()
            WHERE id = $1::uuid AND workspace_id = $2::uuid AND enabled = true
            `,
            [flowId, event.tenant_id],
          );

          if (result.rowCount && result.rowCount > 0) {
            pausedFlows.push(flowId);
            this.logger.log(`Paused flow ${flowId} due to event ${event.id}`);
          } else {
            this.logger.warn(
              `Flow ${flowId} was not paused (not found, wrong workspace, or already disabled)`,
            );
          }
        } else {
          pausedFlows.push(flowId);
          this.logger.warn(
            `Database pool unavailable; recorded pause intent for flow ${flowId}`,
          );
        }
      }

      // Store maintenance state in Redis
      if (this.redis) {
        const maintenanceKey = `guard:maintenance:${event.tenant_id}:flows`;
        await this.redis.setex(
          maintenanceKey,
          86400, // 24 hours
          JSON.stringify({
            pausedFlows,
            reason: triage.root_cause,
            since: new Date().toISOString(),
            eventId: event.id,
          }),
        );
      }

      return { scope: 'flows_only', pausedFlows };
    } catch (err) {
      this.logger.error('Failed to pause affected flows', err);
      return { scope: 'flows_only', pausedFlows: [] };
    }
  }

  private async resolveScopedFlowIds(event: GuardEvent): Promise<string[]> {
    const flowSet = new Set<string>(event.affected_flow_ids || []);

    if (!this.pgPool || !event.affected_connector) {
      return Array.from(flowSet);
    }

    try {
      const rows = await this.pgPool.query<{
        id: string;
        definition: any;
      }>(
        `
        SELECT id::text, definition
        FROM flows
        WHERE workspace_id = $1::uuid
          AND enabled = true
        `,
        [event.tenant_id],
      );

      for (const row of rows.rows) {
        if (this.definitionUsesConnector(row.definition, event.affected_connector)) {
          flowSet.add(row.id);
        }
      }
    } catch (err) {
      this.logger.warn(
        `Failed to resolve connector-scoped flows for connector ${event.affected_connector}`,
        err,
      );
    }

    return Array.from(flowSet);
  }

  private definitionUsesConnector(definition: unknown, connector: string): boolean {
    if (!definition || !connector) {
      return false;
    }

    const normalized = connector.toLowerCase();
    const stack: unknown[] = [definition];

    while (stack.length > 0) {
      const current = stack.pop();
      if (current == null) {
        continue;
      }

      if (typeof current === 'string') {
        if (current.toLowerCase() === normalized) {
          return true;
        }
        continue;
      }

      if (Array.isArray(current)) {
        stack.push(...current);
        continue;
      }

      if (typeof current === 'object') {
        const obj = current as Record<string, unknown>;
        for (const [key, value] of Object.entries(obj)) {
          if (
            key.toLowerCase() === 'connector' &&
            typeof value === 'string' &&
            value.toLowerCase() === normalized
          ) {
            return true;
          }
          stack.push(value);
        }
      }
    }

    return false;
  }

  private async triggerFullMaintenance(
    event: GuardEvent,
    triage: TriageResult,
  ): Promise<MaintenanceResult> {
    try {
      // Set full maintenance mode in Redis
      if (this.redis) {
        const maintenanceKey = `guard:maintenance:${event.tenant_id}`;
        await this.redis.setex(
          maintenanceKey,
          86400, // 24 hours
          JSON.stringify({
            reason: triage.root_cause,
            since: new Date().toISOString(),
            eventId: event.id,
            severity: 'critical',
          }),
        );

        this.logger.warn(
          `Triggered FULL maintenance mode for tenant ${event.tenant_id} due to event ${event.id}`,
        );
      }

      return { scope: 'full', pausedFlows: [] };
    } catch (err) {
      this.logger.error('Failed to trigger full maintenance', err);
      return { scope: 'full', pausedFlows: [] };
    }
  }
}
