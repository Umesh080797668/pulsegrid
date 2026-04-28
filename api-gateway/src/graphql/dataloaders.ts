import DataLoader from 'dataloader';
import { ClientGrpc } from '@nestjs/microservices';

/**
 * DataLoader instances for preventing N+1 query problems in GraphQL
 * Each loader batches gRPC calls to PULSECORE within a single request
 */

export class DataLoaders {
  flowLoader: DataLoader<string, any>;
  eventLoader: DataLoader<string, any>;
  flowRunsLoader: DataLoader<string, any[]>;
  workspaceLoader: DataLoader<string, any>;

  constructor(private client: ClientGrpc) {
    // Batch load flows by ID via gRPC
    this.flowLoader = new DataLoader(async (flowIds: readonly string[]) => {
      try {
        const flowService: any = this.client.getService('FlowService');
        const result = await flowService.getFlows({ ids: Array.from(flowIds) }).toPromise?.();
        
        const flowMap = new Map(result?.flows?.map((f: any) => [f.id, f]) || []);
        return Array.from(flowIds).map((id) => flowMap.get(id) || null);
      } catch (error) {
        console.error('Error batching flows:', error);
        return Array.from(flowIds).map(() => null);
      }
    });

    // Batch load events by ID via gRPC
    this.eventLoader = new DataLoader(async (eventIds: readonly string[]) => {
      try {
        const eventService: any = this.client.getService('EventService');
        const result = await eventService.getEvents({ ids: Array.from(eventIds) }).toPromise?.();
        
        const eventMap = new Map(result?.events?.map((e: any) => [e.id, e]) || []);
        return Array.from(eventIds).map((id) => eventMap.get(id) || null);
      } catch (error) {
        console.error('Error batching events:', error);
        return Array.from(eventIds).map(() => null);
      }
    });

    // Batch load flow runs by flow ID via gRPC
    this.flowRunsLoader = new DataLoader(async (flowIds: readonly string[]) => {
      try {
        const flowService: any = this.client.getService('FlowService');
        const result = await flowService
          .getFlowRuns({ 
            flow_ids: Array.from(flowIds),
            limit: 10 
          })
          .toPromise?.();
        
        const runsMap = new Map<string, any[]>();
        Array.from(flowIds).forEach((id) => runsMap.set(id, []));
        
        result?.runs?.forEach((run: any) => {
          const runs = runsMap.get(run.flow_id) || [];
          runs.push(run);
          runsMap.set(run.flow_id, runs);
        });
        
        return Array.from(flowIds).map((id) => runsMap.get(id) || []);
      } catch (error) {
        console.error('Error batching flow runs:', error);
        return Array.from(flowIds).map(() => []);
      }
    });

    // Batch load workspaces by ID via gRPC
    this.workspaceLoader = new DataLoader(async (workspaceIds: readonly string[]) => {
      try {
        const workspaceService: any = this.client.getService('WorkspaceService');
        const result = await workspaceService
          .getWorkspaces({ ids: Array.from(workspaceIds) })
          .toPromise?.();
        
        const wsMap = new Map(result?.workspaces?.map((w: any) => [w.id, w]) || []);
        return Array.from(workspaceIds).map((id) => wsMap.get(id) || null);
      } catch (error) {
        console.error('Error batching workspaces:', error);
        return Array.from(workspaceIds).map(() => null);
      }
    });
  }
}
