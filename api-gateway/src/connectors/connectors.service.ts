import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Redis } from 'ioredis';
import { Inject } from '@nestjs/common';

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
export class ConnectorsService {
  private readonly logger = new Logger('ConnectorsService');

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

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
      const cacheKey = `credentials:${credentialId}:dependents`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        this.logger.log(`Cache hit for credential ${credentialId} dependents`);
        return JSON.parse(cached);
      }

      // TODO: Query PostgreSQL to get credential details and flows
      // This requires access to the database through gRPC or direct connection
      // For now, return empty result - will be implemented with DB layer
      const result: CredentialDependents = {
        flows: [],
      };

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
      const keys = credentialIds.map((id) => `credentials:${id}:dependents`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.log(`Invalidated cache for ${keys.length} credential dependents`);
      }
    } catch (error: any) {
      this.logger.warn(`Failed to invalidate credential cache:`, error);
      // Don't throw - cache invalidation failure shouldn't break flow save
    }
  }
}
