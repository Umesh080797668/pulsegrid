import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

interface DbUserRow {
  id: string;
  email: string;
  password_hash: string | null;
  full_name: string | null;
  created_at: Date;
}

@Injectable()
export class AuthStore implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be set for auth persistence');
    }

    this.pool = new Pool({ connectionString });
    void this.ensureAuthSchema();
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async findUserByEmail(email: string): Promise<DbUserRow | null> {
    const result = await this.pool.query<DbUserRow>(
      `SELECT id, email, password_hash, full_name, created_at
       FROM users
       WHERE email = $1`,
      [email],
    );
    return result.rows[0] ?? null;
  }

  async findUserById(userId: string): Promise<DbUserRow | null> {
    const result = await this.pool.query<DbUserRow>(
      `SELECT id, email, password_hash, full_name, created_at
       FROM users
       WHERE id = $1`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async createUser(params: {
    id: string;
    email: string;
    passwordHash: string;
    fullName?: string;
  }): Promise<DbUserRow> {
    const result = await this.pool.query<DbUserRow>(
      `INSERT INTO users (id, email, password_hash, full_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, password_hash, full_name, created_at`,
      [params.id, params.email, params.passwordHash, params.fullName ?? null],
    );
    return result.rows[0]!;
  }

  async upsertSocialUser(params: {
    id: string;
    email: string;
    name?: string;
    passwordHash: string;
  }): Promise<DbUserRow> {
    const result = await this.pool.query<DbUserRow>(
      `INSERT INTO users (id, email, password_hash, full_name, email_verified)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (email)
       DO UPDATE SET
         full_name = COALESCE(EXCLUDED.full_name, users.full_name),
         email_verified = true
       RETURNING id, email, password_hash, full_name, created_at`,
      [params.id, params.email, params.passwordHash, params.name ?? null],
    );
    return result.rows[0]!;
  }

  async storeRefreshTokenHash(params: {
    tokenHash: string;
    userId: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_refresh_tokens (token_hash, user_id, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (token_hash)
       DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at, revoked_at = NULL`,
      [params.tokenHash, params.userId, params.expiresAt],
    );
  }

  async consumeRefreshTokenHash(tokenHash: string): Promise<string | null> {
    const result = await this.pool.query<{ user_id: string }>(
      `UPDATE auth_refresh_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       RETURNING user_id`,
      [tokenHash],
    );

    return result.rows[0]?.user_id ?? null;
  }

  async revokeRefreshTokenHash(tokenHash: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth_refresh_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash],
    );
  }

  async canAccessWorkspace(userId: string, workspaceId: string): Promise<boolean> {
    const result = await this.pool.query<{ allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM workspaces w
         LEFT JOIN workspace_members wm ON w.id = wm.workspace_id
         WHERE w.id = $1::uuid
           AND (w.owner_user_id = $2::uuid OR wm.user_id = $2::uuid)
       ) AS allowed`,
      [workspaceId, userId],
    );

    return result.rows[0]?.allowed === true;
  }

  private async ensureAuthSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
        token_hash VARCHAR(128) PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_id
      ON auth_refresh_tokens(user_id);
    `);
  }
}
