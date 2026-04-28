import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface ConnectorTestResult {
  success: boolean;
  message: string;
  statusCode?: number;
  response?: any;
}

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger('ConnectorsService');

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
}
