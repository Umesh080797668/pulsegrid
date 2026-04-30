import { Injectable, BadRequestException, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

interface FcmToken {
  token: string;
  platform: 'ios' | 'android';
  deviceName?: string;
  registeredAt: number;
}

@Injectable()
export class UsersService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be set for push token persistence');
    }

    this.pool = new Pool({ connectionString });
    void this.ensurePushTokenSchema();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  private async ensurePushTokenSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS user_push_tokens (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
        device_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, token)
      )
    `);

    await this.pool.query(
      `CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user ON user_push_tokens(user_id)`,
    );
  }

  /**
   * Save FCM token for a user
   * Stores in PostgreSQL so scheduler jobs can look up workspace tokens.
   */
  async saveFcmToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android',
    deviceName?: string,
  ): Promise<void> {
    if (!token || !token.trim()) {
      throw new BadRequestException('FCM token is required');
    }

    if (!platform || !['ios', 'android'].includes(platform)) {
      throw new BadRequestException('Platform must be "ios" or "android"');
    }

    const fcmToken: FcmToken = {
      token: token.trim(),
      platform,
      deviceName: deviceName || 'Unknown Device',
      registeredAt: Date.now(),
    };

    await this.pool.query(
      `
      INSERT INTO user_push_tokens (user_id, token, platform, device_name, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (user_id, token)
      DO UPDATE SET
        platform = EXCLUDED.platform,
        device_name = EXCLUDED.device_name,
        updated_at = NOW()
      `,
      [userId, fcmToken.token, platform, fcmToken.deviceName ?? null],
    );
  }

  /**
   * Get all FCM tokens for a user
   */
  async getUserFcmTokens(userId: string): Promise<FcmToken[]> {
    const result = await this.pool.query<{
      token: string;
      platform: 'ios' | 'android';
      device_name: string | null;
      created_at: Date;
    }>(
      `
      SELECT token, platform, device_name, created_at
      FROM user_push_tokens
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId],
    );

    return result.rows.map((row) => ({
      token: row.token,
      platform: row.platform,
      deviceName: row.device_name ?? undefined,
      registeredAt: row.created_at.getTime(),
    }));
  }

  /**
   * Remove FCM token
   */
  async removeFcmToken(userId: string, token: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM user_push_tokens WHERE user_id = $1 AND token = $2`,
      [userId, token],
    );
  }

  /**
   * Get all FCM tokens for a workspace (admin only)
   * Used by scheduler for sending daily digest notifications
   */
  async getWorkspaceFcmTokens(workspaceId: string): Promise<
    Array<{
      userId: string;
      tokens: FcmToken[];
    }>
  > {
    const result = await this.pool.query<{
      user_id: string;
      token: string;
      platform: 'ios' | 'android';
      device_name: string | null;
      created_at: Date;
    }>(
      `
      WITH workspace_users AS (
        SELECT owner_user_id AS user_id
        FROM workspaces
        WHERE id = $1
        UNION
        SELECT user_id
        FROM workspace_members
        WHERE workspace_id = $1
      )
      SELECT DISTINCT
        wu.user_id,
        upt.token,
        upt.platform,
        upt.device_name,
        upt.created_at
      FROM workspace_users wu
      JOIN user_push_tokens upt ON upt.user_id = wu.user_id
      ORDER BY wu.user_id, upt.created_at DESC
      `,
      [workspaceId],
    );

    const grouped = new Map<string, FcmToken[]>();
    for (const row of result.rows) {
      const tokens = grouped.get(row.user_id) ?? [];
      tokens.push({
        token: row.token,
        platform: row.platform,
        deviceName: row.device_name ?? undefined,
        registeredAt: row.created_at.getTime(),
      });
      grouped.set(row.user_id, tokens);
    }

    return Array.from(grouped.entries()).map(([userId, tokens]) => ({ userId, tokens }));
  }
}
