import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class FlowVersionsService {
  private readonly pool: Pool;
  private readonly logger = new Logger('FlowVersionsService');

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be set for flow versioning');
    }
    this.pool = new Pool({ connectionString });
  }

  async createVersion(flowId: string, definition: any, createdBy?: string | null, note?: string | null) {
    const client = await this.pool.connect();
    try {
      const res = await client.query(
        `INSERT INTO flow_versions(flow_id, definition, created_by, note) VALUES ($1, $2::jsonb, $3::uuid, $4) RETURNING id, flow_id, definition, created_at, created_by, note`,
        [flowId, definition, createdBy || null, note || null],
      );
      return res.rows[0];
    } catch (err) {
      this.logger.error('Failed to create flow version', err);
      throw err;
    } finally {
      client.release();
    }
  }

  async listVersions(flowId: string) {
    const res = await this.pool.query(
      `SELECT id, flow_id, definition, created_at, created_by, note FROM flow_versions WHERE flow_id = $1 ORDER BY created_at DESC`,
      [flowId],
    );
    return res.rows;
  }

  async getVersionById(versionId: string) {
    const res = await this.pool.query(
      `SELECT id, flow_id, definition, created_at, created_by, note FROM flow_versions WHERE id = $1`,
      [versionId],
    );
    return res.rows[0];
  }
}

export default FlowVersionsService;
