CREATE TABLE IF NOT EXISTS flow_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    definition JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    note TEXT
);

CREATE INDEX IF NOT EXISTS idx_flow_versions_flow_created_at
ON flow_versions(flow_id, created_at DESC);

CREATE TABLE IF NOT EXISTS flow_environments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    environment VARCHAR(32) NOT NULL,
    definition JSONB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deployed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(flow_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_flow_env_flow_environment
ON flow_environments(flow_id, environment);

ALTER TABLE flow_runs
ADD COLUMN IF NOT EXISTS environment VARCHAR(32) NOT NULL DEFAULT 'production';

CREATE INDEX IF NOT EXISTS idx_flow_runs_workspace_env_started
ON flow_runs(workspace_id, environment, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_flow_runs_flow_env_started
ON flow_runs(flow_id, environment, started_at DESC);
