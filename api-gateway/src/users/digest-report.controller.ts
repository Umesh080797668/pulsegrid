import { Controller, Get, Query, UseGuards, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DigestReportService, WeeklyDigestSummary } from './digest-report.service';

@Controller('users/digest')
@UseGuards(JwtAuthGuard)
export class DigestReportController {
  private readonly logger = new Logger(DigestReportController.name);

  constructor(private readonly digestReportService: DigestReportService) {}

  /**
   * GET /users/digest/weekly-summary
   * Get weekly digest summary for a workspace
   * Includes hours saved, top flows, success rate, and widget snapshot
   */
  @Get('weekly-summary')
  async getWeeklySummary(
    @Query('workspaceId') workspaceId?: string,
  ): Promise<WeeklyDigestSummary | null> {
    this.logger.log(
      `Fetching weekly digest summary for workspace: ${workspaceId || 'all'}`,
    );

    try {
      return await this.digestReportService.getLatestWeeklyDigest(workspaceId);
    } catch (error) {
      this.logger.error(`Error fetching weekly digest summary: ${error}`);
      return null;
    }
  }

  /**
   * GET /users/digest/weekly-summaries
   * Get weekly digest summaries for all workspaces
   * Sorted by hours saved (descending)
   */
  @Get('weekly-summaries')
  async getAllWeeklySummaries(): Promise<WeeklyDigestSummary[]> {
    this.logger.log('Fetching all weekly digest summaries');

    try {
      return await this.digestReportService.getWeeklyDigestSummaries();
    } catch (error) {
      this.logger.error(`Error fetching all weekly digest summaries: ${error}`);
      return [];
    }
  }

  /**
   * GET /users/digest/widget-snapshot
   * Get widget snapshot data for current week
   * Returns key-value pairs suitable for home screen widget display
   */
  @Get('widget-snapshot')
  async getWidgetSnapshot(
    @Query('workspaceId') workspaceId?: string,
  ): Promise<Record<string, string> | null> {
    this.logger.log(`Fetching widget snapshot for workspace: ${workspaceId || 'all'}`);

    try {
      const summary = await this.digestReportService.getLatestWeeklyDigest(
        workspaceId,
      );

      if (!summary) {
        return null;
      }

      return this.digestReportService.buildWidgetSnapshot(summary);
    } catch (error) {
      this.logger.error(`Error fetching widget snapshot: ${error}`);
      return null;
    }
  }
}
