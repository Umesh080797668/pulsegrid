import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import {
  GuardEvent,
  TriageContext,
  CodebaseIndexRow,
  DeploymentInfo,
  ConnectorHealthSnapshot,
} from '../types';
import { Redis } from 'ioredis';

@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger('ContextBuilderService');
  private pgPool: Pool | null = null;
  private redis: Redis | null = null;

  constructor() {
    this.initializeConnections();
  }

  private async initializeConnections() {
    if (!this.pgPool) {
      const { Pool } = require('pg');
      this.pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
      });
    }

    if (!this.redis) {
      const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
      this.redis = new Redis(redisUrl);
    }
  }

  async buildContext(event: GuardEvent): Promise<TriageContext> {
    await this.initializeConnections();

    const [relevantFiles, recentDeploys, connectorHealth] = await Promise.all([
      this.findRelevantFiles(event),
      this.getRecentDeployments(3),
      event.affected_connector
        ? this.getConnectorHealthSnapshot(event.affected_connector)
        : Promise.resolve(null),
    ]);

    return {
      event,
      relevantFiles,
      recentDeploys,
      connectorHealth,
      surroundingLogs: event.surrounding_logs,
    };
  }

  private async findRelevantFiles(event: GuardEvent): Promise<CodebaseIndexRow[]> {
    try {
      if (!this.pgPool) return [];

      // Extract error keywords from message and stack trace
      const errorKeywords = this.extractErrorKeywords(event);

      if (errorKeywords.length === 0) {
        return [];
      }

      const query = `
        SELECT file_path, language, function_sigs, error_patterns
        FROM guard.codebase_index
        WHERE error_patterns && $1
        LIMIT 5
      `;

      const result = await this.pgPool.query(query, [errorKeywords]);

      return result.rows as CodebaseIndexRow[];
    } catch (err) {
      this.logger.warn('Failed to find relevant files', err);
      return [];
    }
  }

  private extractErrorKeywords(event: GuardEvent): string[] {
    const keywords: Set<string> = new Set();

    // Extract from message
    const messageTokens = event.message.split(/[\s:()[\]{}]+/).slice(0, 5);
    messageTokens.forEach((t) => {
      if (t.length > 3) keywords.add(t.toLowerCase());
    });

    // Extract from stack trace
    if (event.stack_trace) {
      const stackLines = event.stack_trace.split('\n').slice(0, 3);
      stackLines.forEach((line) => {
        const match = line.match(/at\s+(\w+)/);
        if (match) keywords.add(match[1]);
      });
    }

    return Array.from(keywords).slice(0, 10);
  }

  private async getRecentDeployments(limit: number): Promise<DeploymentInfo[]> {
    try {
      if (!this.pgPool) return [];

      const query = `
        SELECT sha, message, deployed_at
        FROM deployments
        WHERE deployed_at > NOW() - INTERVAL '7 days'
        ORDER BY deployed_at DESC
        LIMIT $1
      `;

      const result = await this.pgPool.query(query, [limit]);

      return result.rows.map((row) => ({
        sha: row.sha,
        message: row.message,
        deployedAt: row.deployed_at.toISOString(),
      }));
    } catch (err) {
      this.logger.warn('Failed to get recent deployments', err);
      return [];
    }
  }

  private async getConnectorHealthSnapshot(
    connector: string,
  ): Promise<ConnectorHealthSnapshot | null> {
    try {
      if (!this.redis) return null;

      const window = Math.floor(Date.now() / 300000); // 5-minute window
      const callsKey = `connector:calls:${connector}:${window}`;
      const errorsKey = `connector:errors:${connector}:${window}`;

      const [calls, errors] = await Promise.all([
        this.redis.get(callsKey),
        this.redis.get(errorsKey),
      ]);

      const callsCount = parseInt(calls || '0', 10);
      const errorsCount = parseInt(errors || '0', 10);

      const errorRate =
        callsCount > 0 ? errorsCount / callsCount : 0;
      const uptime = callsCount > 0 ? 1 - errorRate : 1;

      return {
        connector,
        errorRate,
        uptime,
      };
    } catch (err) {
      this.logger.warn(`Failed to get health for connector ${connector}`, err);
      return null;
    }
  }
}
