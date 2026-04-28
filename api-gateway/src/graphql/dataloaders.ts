import * as DataLoader from 'dataloader';

/**
 * DataLoader instances for preventing N+1 query problems in GraphQL
 * Each loader batches database queries within a single request
 */

export class DataLoaders {
  flowLoader: DataLoader<string, any>;
  eventLoader: DataLoader<string, any>;
  flowRunsLoader: DataLoader<string, any[]>;
  workspaceLoader: DataLoader<string, any>;

  constructor(private db: any) {
    // Batch load flows by ID
    this.flowLoader = new DataLoader(async (flowIds: string[]) => {
      const query = `
        SELECT id, workspace_id, name, description, steps, created_at, updated_at, is_active
        FROM flows
        WHERE id = ANY($1)
      `;
      const result = await this.db.query(query, [flowIds]);
      const flowMap = new Map(result.rows.map((r: any) => [r.id, r]));
      return flowIds.map((id) => flowMap.get(id));
    });

    // Batch load events by ID
    this.eventLoader = new DataLoader(async (eventIds: string[]) => {
      const query = `
        SELECT id, tenant_id, source, event_type, data, created_at
        FROM events
        WHERE id = ANY($1)
      `;
      const result = await this.db.query(query, [eventIds]);
      const eventMap = new Map(result.rows.map((r: any) => [r.id, r]));
      return eventIds.map((id) => eventMap.get(id));
    });

    // Batch load flow runs by flow ID
    this.flowRunsLoader = new DataLoader(async (flowIds: string[]) => {
      const query = `
        SELECT id, flow_id, status, duration_ms, error, started_at, completed_at
        FROM flow_runs
        WHERE flow_id = ANY($1)
        ORDER BY completed_at DESC
        LIMIT 10
      `;
      const result = await this.db.query(query, [flowIds]);
      const runsMap = new Map<string, any[]>();
      flowIds.forEach((id) => runsMap.set(id, []));
      result.rows.forEach((row: any) => {
        const runs = runsMap.get(row.flow_id) || [];
        runs.push(row);
        runsMap.set(row.flow_id, runs);
      });
      return flowIds.map((id) => runsMap.get(id) || []);
    });

    // Batch load workspaces by ID
    this.workspaceLoader = new DataLoader(async (workspaceIds: string[]) => {
      const query = `
        SELECT id, name, created_at, updated_at
        FROM workspaces
        WHERE id = ANY($1)
      `;
      const result = await this.db.query(query, [workspaceIds]);
      const wsMap = new Map(result.rows.map((r: any) => [r.id, r]));
      return workspaceIds.map((id) => wsMap.get(id));
    });
  }
}
