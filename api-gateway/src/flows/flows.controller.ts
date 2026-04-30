import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Logger,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { CreateFlowDto, UpdateFlowDto } from '../dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FlowsService } from './flows.service';
import { Request as ExpressRequest } from 'express';

@Controller('flows')
@UseGuards(JwtAuthGuard)
export class FlowsController {
  private readonly logger = new Logger('FlowsController');

  constructor(private flowsService: FlowsService) {}

  /**
   * List all flows for the authenticated workspace
   * GET /flows
   */
  @Get()
  async listFlows(@Request() req: ExpressRequest) {
    try {
      const workspaceId = this.extractWorkspaceId(req);
      const flows = await this.flowsService.listFlows(workspaceId);
      return {
        statusCode: 200,
        data: flows,
      };
    } catch (error) {
      this.logger.error('Error listing flows:', error);
      throw error;
    }
  }

  /**
   * Get a specific flow by ID
   * GET /flows/:id
   */
  @Get(':id')
  async getFlow(@Param('id') id: string, @Request() req: ExpressRequest) {
    try {
      const workspaceId = this.extractWorkspaceId(req);
      const flow = await this.flowsService.getFlow(id, workspaceId);
      return {
        statusCode: 200,
        data: flow,
      };
    } catch (error) {
      this.logger.error(`Error getting flow ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new flow with validation
   * POST /flows
   * Body: CreateFlowDto
   *
   * Validation catches errors at NestJS layer BEFORE sending to Rust:
   * - Step ID uniqueness
   * - Dependency graph validity and circular dependencies
   * - Step type-specific required fields
   * - Condition expression syntax
   * - Error policy validation
   * - Input mapping source validation
   */
  @Post()
  async createFlow(
    @Body() createFlowDto: CreateFlowDto,
    @Request() req: ExpressRequest,
  ) {
    try {
      const workspaceId = this.extractWorkspaceId(req);
      // Ensure workspaceId matches JWT context (security check)
      if (createFlowDto.workspaceId !== workspaceId) {
        throw new BadRequestException(
          'Flow workspaceId does not match authenticated workspace',
        );
      }

      this.logger.log(
        `Creating flow "${createFlowDto.name}" with ${createFlowDto.definition.steps.length} steps`,
      );

      const flow = await this.flowsService.createFlow(createFlowDto);

      return {
        statusCode: 201,
        message: 'Flow created successfully',
        data: flow,
      };
    } catch (error) {
      this.logger.error('Error creating flow:', error);
      throw error;
    }
  }

  /**
   * Update an existing flow with validation
   * PUT /flows/:id
   * Body: UpdateFlowDto (name, description, definition, enabled)
   *
   * If definition is provided, validates with same rules as createFlow
   */
  @Put(':id')
  async updateFlow(
    @Param('id') id: string,
    @Body() updateFlowDto: UpdateFlowDto,
    @Request() req: ExpressRequest,
  ) {
    try {
      const workspaceId = this.extractWorkspaceId(req);
      this.logger.log(`Updating flow ${id}`);

      const flow = await this.flowsService.updateFlow(id, updateFlowDto, workspaceId);

      return {
        statusCode: 200,
        message: 'Flow updated successfully',
        data: flow,
      };
    } catch (error) {
      this.logger.error(`Error updating flow ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a flow
   * DELETE /flows/:id
   */
  @Delete(':id')
  async deleteFlow(@Param('id') id: string, @Request() req: ExpressRequest) {
    try {
      this.logger.log(`Deleting flow ${id}`);

      const workspaceId = this.extractWorkspaceId(req);
      await this.flowsService.deleteFlow(id, workspaceId);

      return {
        statusCode: 200,
        message: 'Flow deleted successfully',
      };
    } catch (error) {
      this.logger.error(`Error deleting flow ${id}:`, error);
      throw error;
    }
  }

  /**
   * Deploy a flow to a workspace
   * POST /flows/:id/deploy
   * Makes the flow active in the workspace
   */
  @Post(':id/deploy')
  async deployFlow(
    @Param('id') id: string,
    @Body() body: { workspaceId: string },
    @Request() req: ExpressRequest,
  ) {
    try {
      const workspaceId = this.extractWorkspaceId(req);
      // Verify workspace matches
      if (body.workspaceId !== workspaceId) {
        throw new BadRequestException(
          'Deploy workspace does not match authenticated workspace',
        );
      }

      this.logger.log(`Deploying flow ${id} to workspace ${workspaceId}`);

      const result = await this.flowsService.deployFlow(id, workspaceId);

      return {
        statusCode: 200,
        message: 'Flow deployed successfully',
        data: result,
      };
    } catch (error) {
      this.logger.error(`Error deploying flow ${id}:`, error);
      throw error;
    }
  }

  /**
   * Run a flow immediately
   * POST /flows/:id/run
   */
  @Post(':id/run')
  async runFlow(
    @Param('id') id: string,
    @Body() body: { workspaceId?: string; input?: Record<string, any> },
    @Request() req: ExpressRequest,
  ) {
    try {
      const workspaceId = this.extractWorkspaceId(req);
      if (body.workspaceId && body.workspaceId !== workspaceId) {
        throw new BadRequestException(
          'Run workspace does not match authenticated workspace',
        );
      }

      this.logger.log(`Running flow ${id} in workspace ${workspaceId}`);

      const result = await this.flowsService.runFlow(
        id,
        workspaceId,
        body.input || {},
      );

      return {
        statusCode: 200,
        message: 'Flow run started successfully',
        data: result,
      };
    } catch (error) {
      this.logger.error(`Error running flow ${id}:`, error);
      throw error;
    }
  }

  /**
   * Replay an event through a flow
   * POST /flows/:id/replay
   * Body: { eventPayload: Record<string, any> }
   *
   * Reads the event from Redis ring buffer and re-publishes it to the workspace stream
   * so the flow can process it with the current flow definition active
   */
  @Post(':id/replay')
  async replayEvent(
    @Param('id') id: string,
    @Body() body: { eventPayload: Record<string, any>; workspaceId?: string },
    @Request() req: ExpressRequest,
  ) {
    try {
      const workspaceId = this.extractWorkspaceId(req);
      if (body.workspaceId && body.workspaceId !== workspaceId) {
        throw new BadRequestException(
          'Replay workspace does not match authenticated workspace',
        );
      }

      this.logger.log(`Replaying event through flow ${id}`);

      const result = await this.flowsService.replayEvent(
        id,
        workspaceId,
        body.eventPayload,
      );

      return {
        statusCode: 200,
        message: 'Event replayed successfully',
        data: result,
      };
    } catch (error) {
      this.logger.error(`Error replaying event for flow ${id}:`, error);
      throw error;
    }
  }

  /**
   * List pending approvals for the authenticated workspace
   * GET /flows/pending-approvals
   */
  @Get('pending-approvals')
  async listPendingApprovals(@Request() req: ExpressRequest) {
    const workspaceId = this.extractWorkspaceId(req);
    const approvals = await this.flowsService.listPendingApprovals(workspaceId);
    return approvals.map((approval) => ({
      token: approval.token,
      flowRunId: approval.flowRunId,
      flowName: approval.flowName,
      stepName: approval.stepName,
      message: approval.message,
      createdAt: approval.createdAt.toISOString(),
      expiresAt: approval.expiresAt.toISOString(),
      status: approval.status,
    }));
  }

  /**
   * Approve a pending flow step
   * POST /flows/approval/:token/approve
   */
  @Post('approval/:token/approve')
  async approvePendingApproval(@Param('token') token: string, @Request() req: ExpressRequest) {
    const workspaceId = this.extractWorkspaceId(req);
    const approval = await this.flowsService.respondToApproval(token, 'approved', workspaceId);

    return {
      statusCode: 200,
      message: 'Approval accepted',
      data: approval,
    };
  }

  /**
   * Reject a pending flow step
   * POST /flows/approval/:token/reject
   */
  @Post('approval/:token/reject')
  async rejectPendingApproval(@Param('token') token: string, @Request() req: ExpressRequest) {
    const workspaceId = this.extractWorkspaceId(req);
    const approval = await this.flowsService.respondToApproval(token, 'rejected', workspaceId);

    return {
      statusCode: 200,
      message: 'Approval rejected',
      data: approval,
    };
  }

  /**
   * Extract workspace ID from JWT token in request
   * Throws BadRequestException if workspace not found in token
   */
  private extractWorkspaceId(req: ExpressRequest): string {
    const user = (req as ExpressRequest & { user?: any }).user;
    if (!user || !user.workspaceId) {
      throw new BadRequestException('Invalid or missing workspace in JWT token');
    }
    return user.workspaceId;
  }
}
