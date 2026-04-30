-- Keep a compact replay buffer for recent events per workspace.
CREATE INDEX IF NOT EXISTS idx_flow_runs_workspace_started_at
    ON flow_runs(workspace_id, started_at DESC);
