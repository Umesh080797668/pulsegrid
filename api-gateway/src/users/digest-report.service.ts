import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';

export interface WeeklyDigestFlowSummary {
  name: string;
  runs: number;
}

export interface WeeklyDigestSummary {
  workspaceId: string;
  workspaceName: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  avgDurationMs: number;
  estimatedHoursSaved: number;
  successRate: number;
  mostRunFlowName: string;
  mostRunCount: number;
  topFlows: WeeklyDigestFlowSummary[];
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
}

type WeeklyDigestRow = {
  workspace_id: string;
  workspace_name: string;
  total_runs: string | number | null;
  successful_runs: string | number | null;
  failed_runs: string | number | null;
  avg_duration_ms: string | number | null;
  top_flows: Array<{ name: string; runs: string | number }> | null;
};

@Injectable()
export class DigestReportService {
  private readonly logger = new Logger(DigestReportService.name);
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be set for digest reporting');
    }

    this.pool = new Pool({ connectionString });
  }

  async getWeeklyDigestSummaries(workspaceId?: string): Promise<WeeklyDigestSummary[]> {
    const workspaceFilter = workspaceId?.trim() || null;
    const result = await this.pool.query<WeeklyDigestRow>(
      `
      SELECT
        w.id AS workspace_id,
        w.name AS workspace_name,
        COUNT(fr.id)::bigint AS total_runs,
        COUNT(fr.id) FILTER (WHERE fr.status = 'success')::bigint AS successful_runs,
        COUNT(fr.id) FILTER (WHERE fr.status = 'failed')::bigint AS failed_runs,
        COALESCE(AVG(fr.duration_ms), 0) AS avg_duration_ms,
        COALESCE(flow_counts.top_flows, '[]'::json) AS top_flows
      FROM workspaces w
      LEFT JOIN flows f ON f.workspace_id = w.id AND f.enabled = true
      LEFT JOIN flow_runs fr ON fr.workspace_id = w.id AND fr.started_at >= NOW() - INTERVAL '7 days'
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object('name', ranked.flow_name, 'runs', ranked.run_count)
          ORDER BY ranked.run_count DESC, ranked.flow_name ASC
        ) AS top_flows
        FROM (
          SELECT f2.name AS flow_name, COUNT(*)::bigint AS run_count
          FROM flow_runs fr2
          JOIN flows f2 ON f2.id = fr2.flow_id
          WHERE fr2.workspace_id = w.id
            AND fr2.started_at >= NOW() - INTERVAL '7 days'
          GROUP BY f2.name
          ORDER BY COUNT(*) DESC, f2.name ASC
          LIMIT 5
        ) ranked
      ) AS flow_counts ON true
      WHERE EXISTS (
        SELECT 1
        FROM flows f3
        WHERE f3.workspace_id = w.id AND f3.enabled = true
      )
        AND ($1::uuid IS NULL OR w.id = $1::uuid)
      GROUP BY w.id, w.name, flow_counts.top_flows
      ORDER BY w.name ASC
      `,
      [workspaceFilter],
    );

    const generatedAt = new Date().toISOString();
    const periodEnd = generatedAt;
    const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    return result.rows
      .map((row) => this.mapRowToSummary(row, generatedAt, periodStart, periodEnd))
      .filter((summary): summary is WeeklyDigestSummary => summary !== null)
      .sort((left, right) => {
        if (right.estimatedHoursSaved !== left.estimatedHoursSaved) {
          return right.estimatedHoursSaved - left.estimatedHoursSaved;
        }

        if (right.totalRuns !== left.totalRuns) {
          return right.totalRuns - left.totalRuns;
        }

        return left.workspaceName.localeCompare(right.workspaceName);
      });
  }

  async getLatestWeeklyDigest(workspaceId?: string): Promise<WeeklyDigestSummary | null> {
    const summaries = await this.getWeeklyDigestSummaries(workspaceId);
    return summaries[0] ?? null;
  }

  buildWidgetSnapshot(summary: WeeklyDigestSummary): Record<string, string> {
    return {
      title: `PulseGrid • ${summary.workspaceName}`,
      message: `You saved ${summary.estimatedHoursSaved.toFixed(1)} hours across ${summary.totalRuns} runs`,
      status: `Top flow: ${summary.mostRunFlowName} • ${summary.mostRunCount} runs`,
      updatedAt: summary.generatedAt,
      hoursSaved: summary.estimatedHoursSaved.toFixed(2),
      totalRuns: String(summary.totalRuns),
      successfulRuns: String(summary.successfulRuns),
      failedRuns: String(summary.failedRuns),
      successRate: summary.successRate.toFixed(1),
      topFlow: summary.mostRunFlowName,
      topFlowRuns: String(summary.mostRunCount),
      periodLabel: 'Last 7 days',
    };
  }

  buildNotificationSnapshot(summary: WeeklyDigestSummary): Record<string, unknown> {
    const widget = this.buildWidgetSnapshot(summary);
    return {
      notification: {
        title: `Weekly digest • ${summary.workspaceName}`,
        body: `You saved ${summary.estimatedHoursSaved.toFixed(1)} hours across ${summary.totalRuns} runs`,
      },
      data: {
        type: 'weekly_digest',
        workspaceId: summary.workspaceId,
        workspaceName: summary.workspaceName,
        timestamp: summary.generatedAt,
        widget,
        stats: JSON.stringify({
          workspaceId: summary.workspaceId,
          workspaceName: summary.workspaceName,
          totalRuns: summary.totalRuns,
          successfulRuns: summary.successfulRuns,
          failedRuns: summary.failedRuns,
          successRate: summary.successRate,
          avgDurationMs: summary.avgDurationMs,
          estimatedHoursSaved: summary.estimatedHoursSaved.toFixed(2),
          topFlows: summary.topFlows,
          mostRunFlowName: summary.mostRunFlowName,
          mostRunCount: summary.mostRunCount,
          periodStart: summary.periodStart,
          periodEnd: summary.periodEnd,
        }),
        deepLink: 'pulsegrid://analytics',
      },
    };
  }

  private mapRowToSummary(
    row: WeeklyDigestRow,
    generatedAt: string,
    periodStart: string,
    periodEnd: string,
  ): WeeklyDigestSummary | null {
    const totalRuns = Number(row.total_runs ?? 0);
    const successfulRuns = Number(row.successful_runs ?? 0);
    const failedRuns = Number(row.failed_runs ?? 0);
    const avgDurationMs = Number(row.avg_duration_ms ?? 0);
    const topFlows = (row.top_flows ?? []).map((flow) => ({
      name: flow.name,
      runs: Number(flow.runs ?? 0),
    }));

    if (totalRuns <= 0) {
      return null;
    }

    const estimatedHoursSaved = this.estimateHoursSaved(totalRuns, avgDurationMs);
    const successRate = totalRuns === 0 ? 0 : (successfulRuns / totalRuns) * 100;
    const mostRunFlow = topFlows[0];

    return {
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      totalRuns,
      successfulRuns,
      failedRuns,
      avgDurationMs,
      estimatedHoursSaved,
      successRate,
      mostRunFlowName: mostRunFlow?.name ?? 'No runs yet',
      mostRunCount: mostRunFlow?.runs ?? 0,
      topFlows,
      generatedAt,
      periodStart,
      periodEnd,
    };
  }

  private estimateHoursSaved(totalRuns: number, avgDurationMs: number): number {
    const manualWorkPerRunMinutes = 5;
    const automatedDurationMinutes = avgDurationMs / 60_000;
    const minutesSavedPerRun = Math.max(manualWorkPerRunMinutes - automatedDurationMinutes, 1);
    return (totalRuns * minutesSavedPerRun) / 60;
  }
}
