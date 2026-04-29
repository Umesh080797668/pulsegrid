import { Inject, Logger } from '@nestjs/common';
import { ClientGrpc } from '@nestjs/microservices';
import { Args, Context, ID, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import { Flow, FlowRun, EventData, EventPattern, Workspace } from './types';

@Resolver(() => Flow)
export class FlowResolver {
  private logger = new Logger('FlowResolver');

  constructor(@Inject('PULSECORE_PACKAGE') private client: ClientGrpc) {}

  @Query(() => [Flow])
  async flows(
    @Args('workspaceId', { type: () => ID }) workspaceId: string,
  ): Promise<Flow[]> {
    try {
      const flowService: any = this.client.getService('PulseCoreService');
      const response = await flowService.listFlows({ workspace_id: workspaceId }).toPromise?.();
      return response?.flows || [];
    } catch (error) {
      this.logger.error(`Error fetching flows for workspace ${workspaceId}:`, error);
      return [];
    }
  }

  @Query(() => Flow, { nullable: true })
  async flow(
    @Context('dataloaders') _dataloaders: any,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<Flow | null> {
    try {
      const flowService: any = this.client.getService('PulseCoreService');
      const response = await flowService.getFlow({ id }).toPromise?.();
      return response || null;
    } catch (error) {
      this.logger.error(`Error fetching flow ${id}:`, error);
      return null;
    }
  }

  @Query(() => [FlowRun])
  async flowRuns(
    @Args('flowId', { type: () => ID }) flowId: string,
  ): Promise<FlowRun[]> {
    try {
      const flowService: any = this.client.getService('PulseCoreService');
      const response = await flowService.getFlowRuns({ flow_id: flowId, limit: 10 }).toPromise?.();
      return response?.runs || [];
    } catch (error) {
      this.logger.error(`Error fetching flow runs for flow ${flowId}:`, error);
      return [];
    }
  }

  @Mutation(() => Flow)
  async createFlow(
    @Args('workspaceId', { type: () => ID }) workspaceId: string,
    @Args('name') name: string,
    @Args('description', { nullable: true }) description?: string,
  ): Promise<Flow> {
    try {
      const flowService: any = this.client.getService('PulseCoreService');
      const response = await flowService
        .createFlow({
          workspace_id: workspaceId,
          name,
          description: description || '',
          steps: [],
        })
        .toPromise?.();
      return response || ({} as Flow);
    } catch (error) {
      this.logger.error(`Error creating flow: ${name}`, error);
      throw error;
    }
  }

  @Mutation(() => Flow)
  async updateFlow(
    @Args('id', { type: () => ID }) id: string,
    @Args('name', { nullable: true }) name?: string,
    @Args('description', { nullable: true }) description?: string,
  ): Promise<Flow> {
    try {
      const flowService: any = this.client.getService('PulseCoreService');
      const payload: any = { id };
      if (name) payload.name = name;
      if (description) payload.description = description;

      const response = await flowService.updateFlow(payload).toPromise?.();
      return response || ({} as Flow);
    } catch (error) {
      this.logger.error(`Error updating flow ${id}:`, error);
      throw error;
    }
  }

  @Mutation(() => Boolean)
  async deleteFlow(@Args('id', { type: () => ID }) id: string): Promise<boolean> {
    try {
      const flowService: any = this.client.getService('PulseCoreService');
      await flowService.deleteFlow({ id }).toPromise?.();
      return true;
    } catch (error) {
      this.logger.error(`Error deleting flow ${id}:`, error);
      return false;
    }
  }

  @Subscription(() => FlowRun)
  flowRunUpdated(
    @Args('flowId', { type: () => ID }) flowId: string,
    @Context() context: any,
  ) {
    return context.pubSub.asyncIterator([`flowRunUpdated_${flowId}`]);
  }
}

@Resolver(() => EventData)
export class EventResolver {
  private logger = new Logger('EventResolver');

  constructor(@Inject('PULSECORE_PACKAGE') private client: ClientGrpc) {}

  @Query(() => [EventData])
  async events(
    @Args('workspaceId', { type: () => ID }) workspaceId: string,
    @Args('limit', { type: () => Number, defaultValue: 50 }) limit: number,
  ): Promise<EventData[]> {
    try {
      const eventService: any = this.client.getService('PulseCoreService');
      const response = await eventService.listEvents({ workspace_id: workspaceId, limit }).toPromise?.();
      return response?.events || [];
    } catch (error) {
      this.logger.error(`Error fetching events for workspace ${workspaceId}:`, error);
      return [];
    }
  }

  @Query(() => EventData, { nullable: true })
  async event(@Args('id', { type: () => ID }) id: string): Promise<EventData | null> {
    try {
      const eventService: any = this.client.getService('PulseCoreService');
      const response = await eventService.getEvent({ id }).toPromise?.();
      return response || null;
    } catch (error) {
      this.logger.error(`Error fetching event ${id}:`, error);
      return null;
    }
  }

  @Subscription(() => EventData)
  eventReceived(
    @Args('workspaceId', { type: () => ID }) workspaceId: string,
    @Context() context: any,
  ) {
    return context.pubSub.asyncIterator([`eventReceived_${workspaceId}`]);
  }
}

@Resolver(() => EventPattern)
export class PatternResolver {
  private logger = new Logger('PatternResolver');

  constructor(@Inject('PULSECORE_PACKAGE') private client: ClientGrpc) {}

  @Query(() => [EventPattern])
  async detectedPatterns(
    @Args('workspaceId', { type: () => ID }) workspaceId: string,
  ): Promise<EventPattern[]> {
    try {
      const patternService: any = this.client.getService('PulseCoreService');
      const response = await patternService.detectPatterns({ workspace_id: workspaceId }).toPromise?.();
      return response?.patterns || [];
    } catch (error) {
      this.logger.error(`Error detecting patterns for workspace ${workspaceId}:`, error);
      return [];
    }
  }

  @Mutation(() => Flow, { nullable: true })
  async suggestFlowFromPattern(
    @Args('patternId') patternId: string,
  ): Promise<Flow | null> {
    try {
      const patternService: any = this.client.getService('PulseCoreService');
      const patternResponse = await patternService.getPattern({ id: patternId }).toPromise?.();

      if (!patternResponse) {
        return null;
      }

      const suggestionService: any = this.client.getService('PulseCoreService');
      const flowResponse = await suggestionService.suggestFlow({ pattern: patternResponse }).toPromise?.();

      return flowResponse || null;
    } catch (error) {
      this.logger.error(`Error suggesting flow from pattern ${patternId}:`, error);
      return null;
    }
  }
}

@Resolver(() => Workspace)
export class WorkspaceResolver {
  private logger = new Logger('WorkspaceResolver');

  constructor(@Inject('PULSECORE_PACKAGE') private client: ClientGrpc) {}

  @Query(() => [Workspace])
  async workspaces(): Promise<Workspace[]> {
    try {
      const workspaceService: any = this.client.getService('PulseCoreService');
      const response = await workspaceService.listWorkspaces({}).toPromise?.();
      return response?.workspaces || [];
    } catch (error) {
      this.logger.error('Error fetching workspaces:', error);
      return [];
    }
  }

  @Query(() => Workspace, { nullable: true })
  async workspace(@Args('id', { type: () => ID }) id: string): Promise<Workspace | null> {
    try {
      const workspaceService: any = this.client.getService('PulseCoreService');
      const response = await workspaceService.getWorkspace({ id }).toPromise?.();
      return response || null;
    } catch (error) {
      this.logger.error(`Error fetching workspace ${id}:`, error);
      return null;
    }
  }

  @Mutation(() => Workspace)
  async createWorkspace(@Args('name') name: string): Promise<Workspace> {
    try {
      const workspaceService: any = this.client.getService('PulseCoreService');
      const response = await workspaceService.createWorkspace({ name }).toPromise?.();
      return response || ({} as Workspace);
    } catch (error) {
      this.logger.error(`Error creating workspace: ${name}`, error);
      throw error;
    }
  }
}
