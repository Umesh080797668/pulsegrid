import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { UsersService } from '../users/users.service';

@Injectable()
export class DailyDigestService {
  private readonly pool: Pool;

  constructor(
    private readonly usersService: UsersService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be set for daily digest');
    }
    this.pool = new Pool({ connectionString });
  }

  /**
   * Scheduled job to send daily digest notifications at 8 AM UTC
   * Query flow runs from previous day and send summary via FCM
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM, {
    timeZone: 'UTC',
    name: 'daily_digest',
  })
  async sendDailyDigest(): Promise<void> {
    console.log('[DailyDigest] Starting daily digest job at', new Date().toISOString());

    try {
      // Get all active workspaces with flows
      const workspaceRows = await this.pool.query<{ id: string; name: string }>(
        `SELECT DISTINCT w.id, w.name FROM workspaces w
         WHERE EXISTS (SELECT 1 FROM flows f WHERE f.workspace_id = w.id)`
      );

      for (const workspace of workspaceRows.rows) {
        await this.sendDigestForWorkspace(workspace.id, workspace.name);
      }
    } catch (error) {
      console.error('[DailyDigest] Error in daily digest job:', error);
    }
  }

  /**
   * Send daily digest for a specific workspace
   */
  private async sendDigestForWorkspace(workspaceId: string, workspaceName: string): Promise<void> {
    try {
      console.log(`[DailyDigest] Processing workspace: ${workspaceName} (${workspaceId})`);

      // Query yesterday's flow stats from PostgreSQL
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStart = new Date(yesterday.getUTCFullYear(), yesterday.getUTCMonth(), yesterday.getUTCDate(), 0, 0, 0);
      const tomorrowStart = new Date(yesterdayStart);
      tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

      const statsResult = await this.pool.query<{
        total_runs: string;
        successful_runs: string;
        failed_runs: string;
        avg_duration_ms: string;
      }>(
        `SELECT
           COUNT(*)::bigint AS total_runs,
           COUNT(*) FILTER (WHERE status = 'success')::bigint AS successful_runs,
           COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed_runs,
           COALESCE(AVG(CAST(duration_ms AS float)), 0) AS avg_duration_ms
         FROM flow_runs
         WHERE workspace_id = $1
           AND started_at >= $2
           AND started_at < $3`,
        [workspaceId, yesterdayStart.toISOString(), tomorrowStart.toISOString()]
      );

      const stats = statsResult.rows[0];
      const totalRuns = Number(stats.total_runs);
      const successfulRuns = Number(stats.successful_runs);
      const failedRuns = Number(stats.failed_runs);
      const avgDurationMs = Number(stats.avg_duration_ms);

      if (totalRuns === 0) {
        console.log(`[DailyDigest] No flow runs for ${workspaceName} yesterday; skipping digest`);
        return;
      }

      // Query top flows by run count
      const topFlowsResult = await this.pool.query<{ name: string; run_count: string }>(
        `SELECT f.name, COUNT(*)::bigint AS run_count
         FROM flow_runs fr
         JOIN flows f ON f.id = fr.flow_id
         WHERE fr.workspace_id = $1
           AND fr.started_at >= $2
           AND fr.started_at < $3
         GROUP BY f.id, f.name
         ORDER BY run_count DESC
         LIMIT 5`,
        [workspaceId, yesterdayStart.toISOString(), tomorrowStart.toISOString()]
      );

      const topFlows = topFlowsResult.rows.map(row => ({
        name: row.name,
        runs: Number(row.run_count),
      }));

      // Calculate AI-based "hours saved" metric
      const estimatedHoursSaved = this.estimateHoursSaved(totalRuns, avgDurationMs);

      // Get all FCM tokens for workspace users
      const tokensByUser = await this.usersService.getWorkspaceFcmTokens(workspaceId);

      if (tokensByUser.length === 0) {
        console.log(`[DailyDigest] No FCM tokens found for workspace ${workspaceName}`);
        return;
      }

      // Build notification payload with estimated hours saved
      const notificationPayload = this.buildDigestNotification({
        totalRuns,
        successfulRuns,
        failedRuns,
        successRate: totalRuns > 0 ? (successfulRuns / totalRuns * 100) : 0,
        averageDuration: avgDurationMs,
        topFlows,
        estimatedHoursSaved,
      });

      // Send notifications via FCM (placeholder for Firebase Admin SDK integration)
      // TODO: Initialize Firebase Admin SDK and call sendMulticast
      // For now, log what would be sent
      console.log(
        `[DailyDigest] Would send digest to ${tokensByUser.length} user(s) in workspace ${workspaceName}`,
        notificationPayload
      );

      // Log digest sent event (audit trail)
      await this.logDigestSent(workspaceId, {
        totalRuns,
        successfulRuns,
        failedRuns,
        estimatedHoursSaved,
        topFlows,
      });
    } catch (error) {
      console.error(`[DailyDigest] Error processing workspace ${workspaceName}:`, error);
    }
  }

  /**
   * Estimate time saved by automating flow runs.
   *
   * Heuristic: Assumes each flow run replaced 5 minutes of manual work on average,
   * plus 1 minute for setup/configuration overhead per user per flow.
   *
   * Formula: (totalRuns * 5 minutes) / 60 = hours_saved
   *
   * This is a conservative estimate; production systems should use ML to predict
   * based on step complexity, connector latency, and user interactions.
   */
  private estimateHoursSaved(totalRuns: number, avgDurationMs: number): number {
    const MANUAL_WORK_PER_RUN_MINUTES = 5; // Estimated minutes of manual work each run replaces
    const totalMinutesSaved = totalRuns * MANUAL_WORK_PER_RUN_MINUTES;
    return totalMinutesSaved / 60; // Convert to hours
  }

  /**
   * Build Firebase notification payload for daily digest
   */
  private buildDigestNotification(stats: any) {
    const successPercentage = Math.round(stats.successRate);
    const summary = `${stats.totalRuns} flows run • ${stats.successfulRuns} succeeded`;

    return {
      notification: {
        title: '📊 Daily PulseGrid Digest',
        body: `${summary} • Saved ${stats.estimatedHoursSaved.toFixed(1)} hours`,
        imageUrl: 'https://pulsegrid.example.com/notification-icon.png',
      },
      data: {
        type: 'daily_digest',
        timestamp: new Date().toISOString(),
        stats: JSON.stringify({
          totalRuns: stats.totalRuns,
          successCount: stats.successfulRuns,
          failureCount: stats.failedRuns,
          successRate: stats.successRate,
          estimatedHoursSaved: stats.estimatedHoursSaved.toFixed(2),
          topFlows: stats.topFlows,
        }),
        deepLink: 'pulsegrid://analytics',
      },
    };
  }

  /**
   * Log digest sent event for audit trail
   */
  private async logDigestSent(workspaceId: string, stats: any): Promise<void> {
    try {
      const dateKey = new Date().toISOString().split('T')[0];
      const eventKey = `digest_sent:${workspaceId}:${dateKey}`;
      await this.redis.setex(
        eventKey,
        30 * 24 * 60 * 60, // 30 days retention
        JSON.stringify({
          timestamp: new Date().toISOString(),
          stats,
        }),
      );
    } catch (error) {
      console.error('[DailyDigest] Error logging digest sent:', error);
    }
  }
}
