import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Pool } from 'pg';
import * as admin from 'firebase-admin';
import { UsersService } from './users.service';

type WorkspaceDigestRow = {
  workspace_id: string;
  workspace_name: string;
  total_runs: string | number | null;
  avg_duration_ms: string | number | null;
  most_run_flow_name: string | null;
  most_run_count: string | number | null;
};

@Injectable()
export class DigestScheduler {
  private readonly logger = new Logger(DigestScheduler.name);
  private readonly pool: Pool;
  private firebaseInitialized = false;

  constructor(private readonly usersService: UsersService) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be set for digest scheduling');
    }

    this.pool = new Pool({ connectionString });
    void this.ensureFirebaseInitialized();
  }

  private async ensureFirebaseInitialized(): Promise<void> {
    if (this.firebaseInitialized) {
      return;
    }

    if (admin.apps.length > 0) {
      this.firebaseInitialized = true;
      return;
    }

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON is not set; digest pushes will be skipped');
      return;
    }

    const serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    this.firebaseInitialized = true;
  }

  @Cron('0 8 * * 1', { timeZone: 'UTC', name: 'weekly_digest' })
  async sendWeeklyDigest(): Promise<void> {
    await this.ensureFirebaseInitialized();

    const workspaces = await this.pool.query<WorkspaceDigestRow>(
      `
      SELECT
        w.id AS workspace_id,
        w.name AS workspace_name,
        COUNT(fr.id)::bigint AS total_runs,
        COALESCE(AVG(fr.duration_ms), 0) AS avg_duration_ms,
        COALESCE(flow_counts.flow_name, 'No runs yet') AS most_run_flow_name,
        COALESCE(flow_counts.run_count, 0) AS most_run_count
      FROM workspaces w
      LEFT JOIN flows f ON f.workspace_id = w.id AND f.enabled = true
      LEFT JOIN flow_runs fr ON fr.workspace_id = w.id AND fr.started_at >= NOW() - INTERVAL '7 days'
      LEFT JOIN LATERAL (
        SELECT f2.name AS flow_name, COUNT(*)::bigint AS run_count
        FROM flow_runs fr2
        JOIN flows f2 ON f2.id = fr2.flow_id
        WHERE fr2.workspace_id = w.id
          AND fr2.started_at >= NOW() - INTERVAL '7 days'
        GROUP BY f2.name
        ORDER BY COUNT(*) DESC, f2.name ASC
        LIMIT 1
      ) AS flow_counts ON true
      WHERE EXISTS (
        SELECT 1
        FROM flows f3
        WHERE f3.workspace_id = w.id AND f3.enabled = true
      )
      GROUP BY w.id, w.name, flow_counts.flow_name, flow_counts.run_count
      ORDER BY w.name ASC
      `,
    );

    for (const workspace of workspaces.rows) {
      const totalRuns = Number(workspace.total_runs ?? 0);
      if (totalRuns <= 0) {
        continue;
      }

      const avgDurationMs = Number(workspace.avg_duration_ms ?? 0);
      const estimatedHoursSaved = (avgDurationMs * totalRuns) / 3600000;
      const tokensByUser = await this.usersService.getWorkspaceFcmTokens(workspace.workspace_id);
      const tokens = tokensByUser.flatMap((entry) => entry.tokens.map((token) => token.token));

      if (tokens.length === 0) {
        continue;
      }

      const result = await (admin.messaging() as any).sendMulticast({
        tokens,
        notification: {
          title: 'Weekly digest',
          body: `Your flows saved ${estimatedHoursSaved.toFixed(1)} hours this week`,
        },
        data: {
          workspaceId: workspace.workspace_id,
          workspaceName: workspace.workspace_name,
          totalRuns: String(totalRuns),
          estimatedHoursSaved: estimatedHoursSaved.toFixed(2),
          mostRunFlow: workspace.most_run_flow_name ?? 'Unknown flow',
          mostRunCount: String(Number(workspace.most_run_count ?? 0)),
        },
      });

      this.logger.log(
        `Sent weekly digest to workspace ${workspace.workspace_name} (${workspace.workspace_id}) with ${result.successCount} successes`,
      );
    }
  }
}
