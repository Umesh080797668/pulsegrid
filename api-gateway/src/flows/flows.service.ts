import { Injectable, Inject, Logger, NotFoundException, BadRequestException, OnModuleDestroy } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { CreateFlowDto, UpdateFlowDto } from '../dto';
import { FlowValidationService } from './flow-validation.service';
import { ConnectorsService } from '../connectors/connectors.service';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

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

interface PendingApprovalRecord {
  token: string;
  flowRunId: string;
  flowName: string;
  stepId: string;
  stepName: string;
  message: string;
  createdAt: Date;
  expiresAt: Date;
  status: string;
  workspaceId: string;
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
export class FlowsService implements OnModuleDestroy {
  private flowService: FlowServiceClient;
  private readonly logger = new Logger('FlowsService');
  private readonly pool: Pool;

  constructor(
    @Inject('PULSECORE_PACKAGE') private client: ClientGrpc,
    private validationService: FlowValidationService,
    private connectorsService: ConnectorsService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be set for approval management');
    }

    this.pool = new Pool({ connectionString });
    this.flowService = this.client.getService<FlowServiceClient>('PulseCoreService');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
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

      // Extract credential IDs from flow definition and invalidate their dependents cache
      if (dto.definition && dto.definition.steps) {
        const credentialIds = this.extractCredentialIdsFromFlow(dto.definition);
        if (credentialIds.length > 0) {
          await this.connectorsService.invalidateCredentialDependentsCache(credentialIds);
        }
      }

      return updatedFlow;
    } catch (error) {
      this.logger.error(`Failed to update flow ${id}:`, error);
      throw error;
    }
  }

  /**
   * Extract all credential IDs referenced in a flow definition
   */
  private extractCredentialIdsFromFlow(definition: any): string[] {
    const credentialIds: Set<string> = new Set();

    if (!definition.steps || !Array.isArray(definition.steps)) {
      return [];
    }

    for (const step of definition.steps) {
      // Check if step has credential reference in various fields
      if (step.credential_id) {
        credentialIds.add(step.credential_id);
      }
      if (step.config?.credential_id) {
        credentialIds.add(step.config.credential_id);
      }
      if (step.input_mapping) {
        // Look for credential references in input mappings
        Object.values(step.input_mapping).forEach((mapping: any) => {
          if (typeof mapping === 'string' && mapping.includes('credential')) {
            // Try to extract credential ID from template
            const match = mapping.match(/credential[_:]([a-f0-9\-]+)/i);
            if (match && match[1]) {
              credentialIds.add(match[1]);
            }
          }
        });
      }
    }

    return Array.from(credentialIds);
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

  /**
   * Replay an event through a flow
   * Reads the event payload and re-publishes it to the workspace's Redis stream
   * so the flow can process it with the current flow definition active
   */
  async replayEvent(
    flowId: string,
    workspaceId: string,
    eventPayload: Record<string, any>,
  ): Promise<any> {
    try {
      this.logger.log(`Replaying event through flow ${flowId} in workspace ${workspaceId}`);

      // Re-publish event to workspace Redis stream for processing
      const workspaceStream = `workspace:${workspaceId}:stream`;
      const eventJson = JSON.stringify(eventPayload);
      
      // XADD pushes to the stream for the event listener to pick up
      const messageId = await this.redis.xadd(
        workspaceStream,
        '*',
        'payload',
        eventJson,
      );

      this.logger.log(`Event replayed and added to stream ${workspaceStream} with ID ${messageId}`);

      return {
        messageId,
        workspaceStream,
        eventPayload,
      };
    } catch (error) {
      this.logger.error(`Failed to replay event for flow ${flowId}:`, error);
      throw error;
    }
  }

  async listPendingApprovals(workspaceId: string): Promise<PendingApprovalRecord[]> {
    const result = await this.pool.query<{
      approval_token: string;
      flow_run_id: string;
      flow_name: string | null;
      step_id: string;
      context_json: any;
      expires_at: Date;
      status: string;
      created_at: Date;
    }>(
      `
      SELECT
        pa.approval_token,
        pa.flow_run_id,
        COALESCE(f.name, pa.context_json->>'flow_name', 'Unknown flow') AS flow_name,
        pa.step_id,
        pa.context_json,
        pa.expires_at,
        pa.status,
        COALESCE(pa.context_json->>'step_name', pa.step_id) AS step_name,
        COALESCE(pa.context_json->>'message', 'Approval required') AS message,
        COALESCE(pa.context_json->>'workspace_id', fr.workspace_id::text) AS workspace_id,
        pa.created_at
      FROM pending_approvals pa
      JOIN flow_runs fr ON fr.id = pa.flow_run_id
      LEFT JOIN flows f ON f.id = fr.flow_id
      WHERE fr.workspace_id = $1
      ORDER BY pa.created_at DESC
      `,
      [workspaceId],
    );

    return result.rows.map((row) => ({
      token: row.approval_token,
      flowRunId: row.flow_run_id,
      flowName: row.flow_name ?? 'Unknown flow',
      stepId: row.step_id,
      stepName: row.context_json?.step_name ?? row.step_id,
      message: row.context_json?.message ?? 'Approval required',
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      status: row.status,
      workspaceId: row.context_json?.workspace_id ?? workspaceId,
    }));
  }

  async respondToApproval(token: string, decision: 'approved' | 'rejected', workspaceId: string): Promise<PendingApprovalRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const approvalResult = await client.query<{
        approval_token: string;
        flow_run_id: string;
        flow_name: string | null;
        step_id: string;
        context_json: any;
        expires_at: Date;
        status: string;
        created_at: Date;
        workspace_id: string;
      }>(
        `
        SELECT
          pa.approval_token,
          pa.flow_run_id,
          COALESCE(f.name, pa.context_json->>'flow_name', 'Unknown flow') AS flow_name,
          pa.step_id,
          pa.context_json,
          pa.expires_at,
          pa.status,
          pa.created_at,
          COALESCE(pa.context_json->>'workspace_id', fr.workspace_id::text) AS workspace_id
        FROM pending_approvals pa
        JOIN flow_runs fr ON fr.id = pa.flow_run_id
        LEFT JOIN flows f ON f.id = fr.flow_id
        WHERE pa.approval_token = $1
          AND fr.workspace_id = $2::uuid
        FOR UPDATE
        `,
        [token, workspaceId],
      );

      const approval = approvalResult.rows[0];
      if (!approval) {
        throw new BadRequestException('Approval token not found');
      }

      if (approval.status !== 'pending') {
        throw new BadRequestException(`Approval has already been ${approval.status}`);
      }

      const nextStatus = decision === 'approved' ? 'approved' : 'rejected';
      await client.query(
        `
        UPDATE pending_approvals
        SET status = $1
        WHERE approval_token = $2
        `,
        [nextStatus, token],
      );

      await client.query('COMMIT');

      const resolvedWorkspaceId = approval.workspace_id;
      const workspaceStream = `workspace:${resolvedWorkspaceId}:stream`;
      await this.redis.xadd(
        workspaceStream,
        '*',
        'payload',
        JSON.stringify({
          event_type: 'approval.response',
          tenant_id: resolvedWorkspaceId,
          approval_token: token,
          flow_run_id: approval.flow_run_id,
          decision,
          step_id: approval.step_id,
          context_json: approval.context_json,
          approved_at: new Date().toISOString(),
        }),
      );

      return {
        token: approval.approval_token,
        flowRunId: approval.flow_run_id,
        flowName: approval.flow_name ?? 'Unknown flow',
        stepId: approval.step_id,
        stepName: approval.context_json?.step_name ?? approval.step_id,
        message: approval.context_json?.message ?? 'Approval required',
        createdAt: approval.created_at,
        expiresAt: approval.expires_at,
        status: nextStatus,
        workspaceId: resolvedWorkspaceId,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      this.logger.error(`Failed to respond to approval ${token}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }
}
