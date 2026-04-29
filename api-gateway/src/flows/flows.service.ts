import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { CreateFlowDto, UpdateFlowDto } from '../dto';
import { FlowValidationService } from './flow-validation.service';

interface Flow {
  id: string;
  name: string;
  description?: string;
  definition: any;
  workspaceId: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  version?: string;
}

interface ListFlowsRequest {
  workspaceId: string;
}

interface ListFlowsResponse {
  flows: Flow[];
  total: number;
}

interface GetFlowRequest {
  id: string;
  workspaceId: string;
}

interface CreateFlowRequest {
  workspaceId: string;
  name: string;
  description?: string;
  definition: any;
}

interface UpdateFlowRequest {
  id: string;
  workspaceId: string;
  name?: string;
  description?: string;
  definition?: any;
  enabled?: boolean;
}

interface DeleteFlowRequest {
  id: string;
  workspaceId: string;
}

interface RunFlowRequest {
  id: string;
  workspaceId: string;
  input?: Record<string, any>;
}

interface FlowServiceClient {
  listFlows(request: ListFlowsRequest): any;
  getFlow(request: GetFlowRequest): any;
  createFlow(request: CreateFlowRequest): any;
  updateFlow(request: UpdateFlowRequest): any;
  deleteFlow(request: DeleteFlowRequest): any;
  triggerFlow(request: RunFlowRequest): any;
}

@Injectable()
export class FlowsService {
  private flowService: FlowServiceClient;
  private readonly logger = new Logger('FlowsService');

  constructor(
    @Inject('PULSECORE_PACKAGE') private client: ClientGrpc,
    private validationService: FlowValidationService,
  ) {
    this.flowService = this.client.getService<FlowServiceClient>('FlowService');
  }

  /**
   * List all flows for a workspace
   */
  async listFlows(workspaceId: string): Promise<Flow[]> {
    try {
      const response = await firstValueFrom(
        this.flowService.listFlows({ workspaceId }),
      ) as any;
      return response.flows || [];
    } catch (error) {
      this.logger.error(
        `Failed to list flows for workspace ${workspaceId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get a single flow by ID
   */
  async getFlow(id: string, workspaceId: string): Promise<Flow> {
    try {
      const flow = (await firstValueFrom(
        this.flowService.getFlow({ id, workspaceId }),
      )) as Flow;
      if (!flow) {
        throw new NotFoundException(`Flow ${id} not found`);
      }
      return flow;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to get flow ${id}:`, error);
      throw error;
    }
  }

  /**
   * Create a new flow with comprehensive validation
   */
  async createFlow(dto: CreateFlowDto): Promise<Flow> {
    try {
      // Validate flow definition at NestJS layer before sending to Rust
      this.validationService.validateFlowDefinitionOrThrow(dto.definition);

      this.logger.log(
        `Creating flow "${dto.name}" in workspace ${dto.workspaceId}`,
      );

      const flow = await firstValueFrom(
        this.flowService.createFlow({
          workspaceId: dto.workspaceId,
          name: dto.name,
          description: dto.description,
          definition: dto.definition,
        }),
      ) as Flow;

      return flow;
    } catch (error) {
      this.logger.error(
        `Failed to create flow "${dto.name}":`,
        error,
      );
      throw error;
    }
  }

  /**
   * Update an existing flow with comprehensive validation
   */
  async updateFlow(id: string, dto: UpdateFlowDto, workspaceId: string): Promise<Flow> {
    try {
      // Validate new definition if provided
      if (dto.definition) {
        this.validationService.validateFlowDefinitionOrThrow(dto.definition);
      }

      this.logger.log(`Updating flow ${id}`);

      const updateRequest: UpdateFlowRequest = {
        id,
        workspaceId,
        ...dto,
      };

      const updatedFlow = (await firstValueFrom(
        this.flowService.updateFlow(updateRequest),
      )) as Flow;

      return updatedFlow;
    } catch (error) {
      this.logger.error(`Failed to update flow ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete a flow
   */
  async deleteFlow(id: string, workspaceId: string): Promise<{ success: boolean }> {
    try {
      this.logger.log(`Deleting flow ${id}`);
      await firstValueFrom(
        this.flowService.deleteFlow({ id, workspaceId }),
      );
      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to delete flow ${id}:`, error);
      throw error;
    }
  }

  /**
   * Deploy a flow (enable it in workspace)
   */
  async deployFlow(id: string, workspaceId: string): Promise<Flow> {
    try {
      // Get current flow
      const flow = await this.getFlow(id, workspaceId);

      // Update flow to enabled state
      const updateRequest: UpdateFlowRequest = {
        id,
        workspaceId,
        enabled: true,
      };

      const deployedFlow = (await firstValueFrom(
        this.flowService.updateFlow(updateRequest),
      )) as Flow;

      this.logger.log(`Flow ${id} deployed and enabled`);
      return deployedFlow;
    } catch (error) {
      this.logger.error(`Failed to deploy flow ${id}:`, error);
      throw error;
    }
  }

  /**
   * Run a flow immediately
   */
  async runFlow(
    id: string,
    workspaceId: string,
    input: Record<string, any> = {},
  ): Promise<any> {
    try {
      this.logger.log(`Running flow ${id}`);
      const response = await firstValueFrom(
        this.flowService.triggerFlow({ id, workspaceId, input }),
      );
      return response;
    } catch (error) {
      this.logger.error(`Failed to run flow ${id}:`, error);
      throw error;
    }
  }
}
