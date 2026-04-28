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
} from '@nestjs/common';
import { CreateFlowDto, UpdateFlowDto } from '../dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FlowsService } from './flows.service';

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
  async listFlows() {
    try {
      // In a real implementation, extract workspaceId from JWT token
      const workspaceId = 'default'; // TODO: Extract from JWT context
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
  async getFlow(@Param('id') id: string) {
    try {
      const workspaceId = 'default'; // TODO: Extract from JWT context
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
  async createFlow(@Body() createFlowDto: CreateFlowDto) {
    try {
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
  ) {
    try {
      this.logger.log(`Updating flow ${id}`);

      const flow = await this.flowsService.updateFlow(id, updateFlowDto);

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
  async deleteFlow(@Param('id') id: string) {
    try {
      this.logger.log(`Deleting flow ${id}`);

      const workspaceId = 'default'; // TODO: Extract from JWT context
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
}
