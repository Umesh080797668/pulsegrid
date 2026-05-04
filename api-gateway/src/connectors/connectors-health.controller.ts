import { Controller, Get, Param, Logger, BadRequestException } from '@nestjs/common';
import { ConnectorsService } from './connectors.service';
import { Pool } from 'pg';

interface ConnectorHealthMetrics {
  connector_id: string;
  workspace_id: string;
  status: string;
  error_rate: number;
  call_count: number;
  error_count: number;
  last_error_at: string | null;
  last_error_message: string | null;
  p95_latency_ms: number;
  uptime_percentage: number;
  circuit_open_at: string | null;
}

@Controller('connectors')
export class ConnectorsHealthController {
  private readonly logger = new Logger('ConnectorsHealthController');
  private readonly pool: Pool;

  constructor(private connectorsService: ConnectorsService) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be set');
    }
    this.pool = new Pool({ connectionString });
  }

  /**
   * Get health status of all connectors
   * GET /connectors/health
   */
  @Get('health')
  async getConnectorHealth() {
    try {
      const result = await this.pool.query(
        `SELECT 
          connector_id,
          status,
          error_rate,
          call_count,
          error_count,
          last_error_at,
          last_error_message,
          p95_latency_ms,
          uptime_percentage,
          circuit_open_at
         FROM connector_health
         ORDER BY status DESC, updated_at DESC`,
      );

      return {
        statusCode: 200,
        data: result.rows,
      };
    } catch (error) {
      this.logger.error('Error fetching connector health:', error);
      throw error;
    }
  }

  /**
   * Get health status of a specific connector
   * GET /connectors/:id/health
   */
  @Get(':id/health')
  async getConnectorHealthById(@Param('id') connectorId: string) {
    try {
      if (!connectorId) {
        throw new BadRequestException('Connector ID required');
      }

      const result = await this.pool.query(
        `SELECT 
          connector_id,
          status,
          error_rate,
          call_count,
          error_count,
          last_error_at,
          last_error_message,
          p95_latency_ms,
          uptime_percentage,
          circuit_open_at
         FROM connector_health
         WHERE connector_id = $1
         LIMIT 1`,
        [connectorId],
      );

      if (result.rows.length === 0) {
        return {
          statusCode: 404,
          message: 'Connector health data not found',
        };
      }

      return {
        statusCode: 200,
        data: result.rows[0],
      };
    } catch (error) {
      this.logger.error(`Error fetching connector health for ${connectorId}:`, error);
      throw error;
    }
  }

  /**
   * Get flows affected by circuit breaker
   * GET /connectors/:id/circuit-open-flows
   */
  @Get(':id/circuit-open-flows')
  async getAffectedFlows(@Param('id') connectorId: string) {
    try {
      if (!connectorId) {
        throw new BadRequestException('Connector ID required');
      }

      const result = await this.pool.query(
        `SELECT DISTINCT
          f.id,
          f.name,
          COUNT(DISTINCT fr.id) as paused_runs,
          MAX(fci.paused_at) as paused_at
         FROM flows f
         JOIN flow_connector_impact fci ON f.id = fci.flow_id
         LEFT JOIN flow_runs fr ON f.id = fr.flow_id AND fr.approval_state = 'paused_circuit_open'
         WHERE fci.connector_id = $1 AND fci.paused_at IS NOT NULL
         GROUP BY f.id, f.name
         ORDER BY paused_at DESC`,
        [connectorId],
      );

      return {
        statusCode: 200,
        data: result.rows,
      };
    } catch (error) {
      this.logger.error(`Error fetching affected flows for connector ${connectorId}:`, error);
      throw error;
    }
  }

  /**
   * Get connector latency percentiles over a time window
   * GET /connectors/:id/latency-percentiles
   */
  @Get(':id/latency-percentiles')
  async getLatencyPercentiles(@Param('id') connectorId: string) {
    try {
      if (!connectorId) {
        throw new BadRequestException('Connector ID required');
      }

      const result = await this.pool.query(
        `SELECT 
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99,
          MIN(latency_ms) as min,
          MAX(latency_ms) as max,
          AVG(latency_ms)::int as avg,
          COUNT(*) as total_calls,
          SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_calls,
          SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed_calls
         FROM connector_call_latencies
         WHERE connector_id = $1
         AND recorded_at > NOW() - INTERVAL '24 hours'`,
        [connectorId],
      );

      if (result.rows.length === 0) {
        return {
          statusCode: 200,
          data: {
            message: 'No latency data available',
            p50: null,
            p95: null,
            p99: null,
            min: null,
            max: null,
            avg: null,
            total_calls: 0,
            successful_calls: 0,
            failed_calls: 0,
          },
        };
      }

      return {
        statusCode: 200,
        data: result.rows[0],
      };
    } catch (error) {
      this.logger.error(`Error fetching latency percentiles for connector ${connectorId}:`, error);
      throw error;
    }
  }

  /**
   * Get connector error summary
   * GET /connectors/:id/error-summary
   */
  @Get(':id/error-summary')
  async getErrorSummary(@Param('id') connectorId: string) {
    try {
      if (!connectorId) {
        throw new BadRequestException('Connector ID required');
      }

      const result = await this.pool.query(
        `SELECT 
          error_code,
          COUNT(*) as count,
          MAX(recorded_at) as last_occurrence
         FROM connector_call_latencies
         WHERE connector_id = $1
         AND success = false
         AND recorded_at > NOW() - INTERVAL '24 hours'
         AND error_code IS NOT NULL
         GROUP BY error_code
         ORDER BY count DESC`,
        [connectorId],
      );

      return {
        statusCode: 200,
        data: result.rows,
      };
    } catch (error) {
      this.logger.error(`Error fetching error summary for connector ${connectorId}:`, error);
      throw error;
    }
  }
}
