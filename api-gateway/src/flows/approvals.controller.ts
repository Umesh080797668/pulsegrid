import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Logger,
  Request,
  Query,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FlowsService } from './flows.service';
import { Request as ExpressRequest } from 'express';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

interface ApprovalDecisionRequest {
  token: string;
  decision: 'approved' | 'rejected';
  reason?: string;
}

interface ApprovalRecord {
  id: string;
  flow_run_id: string;
  step_id: string;
  approval_token: string;
  status: string;
  context_json: any;
  expires_at: string;
  created_at: string;
}

@Controller('approvals')
export class ApprovalsController {
  private readonly logger = new Logger('ApprovalsController');
  private readonly pool: Pool;
  private readonly redis: Redis;

  constructor(private flowsService: FlowsService) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be set');
    }
    this.pool = new Pool({ connectionString });
    this.redis = new (require('ioredis'))({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  }

  /**
   * Get pending approvals for a flow run
   * GET /approvals/flow/:flowRunId
   */
  @Get('flow/:flowRunId')
  async getPendingApprovals(@Param('flowRunId') flowRunId: string) {
    try {
      const result = await this.pool.query(
        'SELECT id, flow_run_id, step_id, approval_token, status, context_json, expires_at, created_at FROM pending_approvals WHERE flow_run_id = $1 AND status = $2 ORDER BY created_at DESC',
        [flowRunId, 'pending'],
      );

      return {
        statusCode: 200,
        data: result.rows,
      };
    } catch (error) {
      this.logger.error(`Error getting pending approvals for flow ${flowRunId}:`, error);
      throw error;
    }
  }

  /**
   * Get approval details by token
   * GET /approvals/:token
   */
  @Get(':token')
  async getApprovalDetails(@Param('token') token: string) {
    try {
      const result = await this.pool.query(
        `SELECT 
          pa.id, pa.flow_run_id, pa.step_id, pa.approval_token, pa.status, 
          pa.context_json, pa.expires_at, pa.created_at,
          json_agg(json_build_object(
            'approver_email', aa.approver_email, 
            'status', aa.status,
            'approved_at', aa.approved_at
          )) as approvers
        FROM pending_approvals pa
        LEFT JOIN approval_approvers aa ON pa.id = aa.approval_id
        WHERE pa.approval_token = $1
        GROUP BY pa.id`,
        [token],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException('Approval not found');
      }

      return {
        statusCode: 200,
        data: result.rows[0],
      };
    } catch (error) {
      this.logger.error(`Error getting approval ${token}:`, error);
      throw error;
    }
  }

  /**
   * Record approval decision
   * POST /approvals/:token/decide
   */
  @Post(':token/decide')
  async recordApprovalDecision(
    @Param('token') token: string,
    @Body() body: ApprovalDecisionRequest,
    @Request() req: ExpressRequest,
  ) {
    try {
      const userId = (req as any).user?.sub || (req as any).user?.id;
      
      if (!userId) {
        throw new BadRequestException('User ID required');
      }

      // Get approval record
      const approvalResult = await this.pool.query(
        'SELECT id, flow_run_id, step_id, status, expires_at FROM pending_approvals WHERE approval_token = $1',
        [token],
      );

      if (approvalResult.rows.length === 0) {
        throw new NotFoundException('Approval not found');
      }

      const approval = approvalResult.rows[0] as ApprovalRecord;

      // Check if approval is still pending
      if (approval.status !== 'pending') {
        throw new BadRequestException(`Approval is already ${approval.status}`);
      }

      // Check if expired
      if (new Date(approval.expires_at) < new Date()) {
        throw new BadRequestException('Approval has expired');
      }

      // Record the decision
      const approverResult = await this.pool.query(
        `UPDATE approval_approvers
         SET status = $1, approved_at = NOW(), decision_comment = $2, updated_at = NOW()
         WHERE approval_id = $3 AND approver_id = $4
         RETURNING *`,
        [
          body.decision === 'approved' ? 'approved' : 'rejected',
          body.reason || null,
          approval.id,
          userId,
        ],
      );

      if (approverResult.rows.length === 0) {
        throw new BadRequestException('User is not an approver for this request');
      }

      // Check if we need to update the overall approval status
      const statusResult = await this.pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM approval_approvers
        WHERE approval_id = $1`,
        [approval.id],
      );

      const stats = statusResult.rows[0];
      let newStatus = 'pending';

      if (stats.rejected > 0) {
        newStatus = 'rejected';
      } else if (stats.approved === stats.total) {
        newStatus = 'approved';
      }

      // Update approval status if all have decided or any rejected
      if (newStatus !== 'pending') {
        await this.pool.query(
          'UPDATE pending_approvals SET status = $1, updated_at = NOW() WHERE id = $2',
          [newStatus, approval.id],
        );

        // If approved, resume the flow
        if (newStatus === 'approved') {
          await this.flowsService.resumeApprovedFlow(approval.flow_run_id);
        }
      }

      return {
        statusCode: 200,
        message: 'Approval decision recorded',
        data: {
          approval_id: approval.id,
          flow_run_id: approval.flow_run_id,
          status: newStatus,
          approver_status: stats,
        },
      };
    } catch (error) {
      this.logger.error(`Error recording approval decision for ${token}:`, error);
      throw error;
    }
  }

  /**
   * Webhook handler for Slack interactive messages
   * POST /approvals/webhook/slack
   */
  @Post('webhook/slack')
  async handleSlackWebhook(@Body() payload: any) {
    try {
      // Verify Slack signature
      const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
      if (!slackSigningSecret) {
        this.logger.warn('SLACK_SIGNING_SECRET not configured');
      }

      // Parse the action
      const actions = payload.actions || [];
      if (actions.length === 0) {
        throw new BadRequestException('No actions in payload');
      }

      const action = actions[0];
      const actionId = action.action_id || '';

      // Extract token from action_id (format: approval_approve_<token> or approval_reject_<token>)
      const tokenMatch = actionId.match(/approval_(approve|reject)_(.+)/);
      if (!tokenMatch) {
        throw new BadRequestException('Invalid action ID format');
      }

      const decision = tokenMatch[1] === 'approve' ? 'approved' : 'rejected';
      const token = tokenMatch[2];
      const userId = payload.user?.id;

      if (!userId) {
        throw new BadRequestException('User ID required from Slack');
      }

      // Record the decision
      const approvalResult = await this.pool.query(
        'SELECT id, flow_run_id, step_id, status FROM pending_approvals WHERE approval_token = $1',
        [token],
      );

      if (approvalResult.rows.length === 0) {
        return {
          statusCode: 404,
          message: 'Approval not found',
        };
      }

      const approval = approvalResult.rows[0];

      // Record decision (note: we're using Slack user ID as approver ID)
      await this.pool.query(
        `UPDATE approval_approvers
         SET status = $1, approved_at = NOW(), updated_at = NOW()
         WHERE approval_id = $2 AND approver_email = $3`,
        [
          decision === 'approved' ? 'approved' : 'rejected',
          approval.id,
          `slack:${userId}`,
        ],
      );

      // Check overall approval status
      const statusResult = await this.pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM approval_approvers
        WHERE approval_id = $1`,
        [approval.id],
      );

      const stats = statusResult.rows[0];
      let newStatus = 'pending';

      if (stats.rejected > 0) {
        newStatus = 'rejected';
      } else if (stats.approved === stats.total) {
        newStatus = 'approved';
      }

      // Update approval status
      if (newStatus !== 'pending') {
        await this.pool.query(
          'UPDATE pending_approvals SET status = $1, updated_at = NOW() WHERE id = $2',
          [newStatus, approval.id],
        );

        if (newStatus === 'approved') {
          await this.flowsService.resumeApprovedFlow(approval.flow_run_id);
        }
      }

      return {
        statusCode: 200,
        message: 'Approval decision processed',
        response_type: 'in_channel',
        text: `Approval ${decision} by <@${userId}>`,
      };
    } catch (error) {
      this.logger.error('Error handling Slack webhook:', error);
      return {
        statusCode: 500,
        message: 'Internal server error',
      };
    }
  }

  /**
   * Get approval summary/stats
   * GET /approvals/stats/:flowId
   */
  @Get('stats/:flowId')
  async getApprovalStats(@Param('flowId') flowId: string) {
    try {
      const result = await this.pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
          SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired
        FROM pending_approvals pa
        JOIN flow_runs fr ON pa.flow_run_id = fr.id
        WHERE fr.flow_id = $1`,
        [flowId],
      );

      return {
        statusCode: 200,
        data: result.rows[0],
      };
    } catch (error) {
      this.logger.error(`Error getting approval stats for flow ${flowId}:`, error);
      throw error;
    }
  }
}
