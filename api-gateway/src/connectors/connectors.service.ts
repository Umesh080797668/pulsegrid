import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import axios from 'axios';
import { Redis } from 'ioredis';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';

export interface ConnectorTestResult {
  success: boolean;
  message: string;
  statusCode?: number;
  response?: any;
}

interface CredentialDependents {
  flows: Array<{ id: string; name: string }>;
}

@Injectable()
export class ConnectorsService implements OnModuleDestroy {
  private readonly logger = new Logger('ConnectorsService');
  private readonly pool: Pool | null;

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {
    const connectionString = process.env.DATABASE_URL;
    this.pool = connectionString ? new Pool({ connectionString }) : null;

    if (!this.pool) {
      this.logger.warn('DATABASE_URL not set; credential dependents lookup will return empty results');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  /**
   * Test a connector by making a test request
   * Supports: http, https, custom_http, custom_webhook
   */
  async testConnector(
    connector: string,
    config: Record<string, any>,
  ): Promise<ConnectorTestResult> {
    try {
      const { endpoint_url, method = 'GET', headers = {}, body, bearer_token, api_key_header, api_key_value } = config;

      if (!endpoint_url) {
        return {
          success: false,
          message: 'endpoint_url is required for connector test',
        };
      }

      // Build request headers
      const requestHeaders: Record<string, string> = { ...headers };

      if (bearer_token) {
        requestHeaders['Authorization'] = `Bearer ${bearer_token}`;
      }

      if (api_key_header && api_key_value) {
        requestHeaders[api_key_header] = api_key_value;
      }

      // Make test request
      this.logger.log(`Testing ${connector} connector at ${endpoint_url} with method ${method}`);

      const response = await axios({
        method: method.toUpperCase(),
        url: endpoint_url,
        headers: requestHeaders,
        data: body,
        timeout: 10000, // 10 second timeout
      });

      return {
        success: true,
        message: `Successfully connected to ${connector}`,
        statusCode: response.status,
        response: response.data,
      };
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message || String(error);
      const statusCode = error.response?.status;

      this.logger.warn(`Connector test failed for ${connector}:`, errorMsg);

      return {
        success: false,
        message: `Connector test failed: ${errorMsg}`,
        statusCode,
        response: error.response?.data,
      };
    }
  }

  /**
   * Get all flows that depend on a credential
   * Looks up credential's connector_id and queries flows that use it
   * Results are cached in Redis for 1 hour
   */
  async getCredentialDependents(
    credentialId: string,
    workspaceId: string,
  ): Promise<CredentialDependents> {
    try {
      // Check Redis cache first
      const cacheKey = `credentials:${workspaceId}:${credentialId}:dependents`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        this.logger.log(`Cache hit for credential ${credentialId} dependents`);
        return JSON.parse(cached);
      }

      if (!this.pool) {
        const emptyResult: CredentialDependents = { flows: [] };
        await this.redis.setex(cacheKey, 300, JSON.stringify(emptyResult));
        return emptyResult;
      }

      // Validate credential belongs to workspace (if missing, return empty set).
      const credentialCheck = await this.pool.query<{ id: string }>(
        `SELECT id FROM credentials WHERE id = $1::uuid AND workspace_id = $2::uuid LIMIT 1`,
        [credentialId, workspaceId],
      );

      if (credentialCheck.rowCount === 0) {
        const emptyResult: CredentialDependents = { flows: [] };
        await this.redis.setex(cacheKey, 600, JSON.stringify(emptyResult));
        return emptyResult;
      }

      const flowRows = await this.pool.query<{
        id: string;
        name: string;
        definition: any;
      }>(
        `
        SELECT id::text, name, definition
        FROM flows
        WHERE workspace_id = $1::uuid
        `,
        [workspaceId],
      );

      const dependentFlows = flowRows.rows
        .filter((row) => this.definitionReferencesCredential(row.definition, credentialId))
        .map((row) => ({ id: row.id, name: row.name }));

      const result: CredentialDependents = { flows: dependentFlows };

      // Cache the result for 1 hour
      await this.redis.setex(cacheKey, 3600, JSON.stringify(result));

      this.logger.log(`Cached dependents for credential ${credentialId}`);
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to get dependents for credential ${credentialId}:`, error);
      throw error;
    }
  }

  /**
   * Invalidate credentials dependents cache
   * Called after flow is saved to clear stale cache
   */
  async invalidateCredentialDependentsCache(credentialIds: string[]): Promise<void> {
    try {
      if (credentialIds.length === 0) {
        return;
      }

      let deleted = 0;
      for (const credentialId of credentialIds) {
        const pattern = `credentials:*:${credentialId}:dependents`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          deleted += await this.redis.del(...keys);
        }
      }

      this.logger.log(`Invalidated ${deleted} credential dependents cache key(s)`);
    } catch (error: any) {
      this.logger.warn(`Failed to invalidate credential cache:`, error);
      // Don't throw - cache invalidation failure shouldn't break flow save
    }
  }

  private definitionReferencesCredential(definition: unknown, credentialId: string): boolean {
    if (!definition) {
      return false;
    }

    const stack: unknown[] = [definition];

    while (stack.length > 0) {
      const current = stack.pop();
      if (current == null) {
        continue;
      }

      if (typeof current === 'string') {
        if (current === credentialId || current.includes(credentialId)) {
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
          const normalizedKey = key.toLowerCase();
          if (
            (normalizedKey === 'credential_id' ||
              normalizedKey === 'credentialid' ||
              normalizedKey === 'credential') &&
            typeof value === 'string' &&
            value === credentialId
          ) {
            return true;
          }
          stack.push(value);
        }
      }
    }

    return false;
  }
}
