-- Add approval and circuit breaker state tracking
-- Update flow_runs with approval and circuit breaker states
ALTER TABLE flow_runs 
ADD COLUMN IF NOT EXISTS approval_state VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS current_step_index INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS paused_reason VARCHAR(100) DEFAULT NULL;

-- Add constraint for valid approval states
ALTER TABLE flow_runs 
ADD CONSTRAINT valid_approval_state CHECK (
    approval_state IS NULL OR approval_state IN ('pending_approval', 'approval_timeout', 'none')
);

-- Create multi-approver table
CREATE TABLE IF NOT EXISTS approval_approvers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id UUID NOT NULL REFERENCES pending_approvals(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL,
    approver_email VARCHAR(320) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    approved_at TIMESTAMPTZ DEFAULT NULL,
    decision_comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_approvers_approval_id 
    ON approval_approvers(approval_id);

CREATE INDEX IF NOT EXISTS idx_approval_approvers_status 
    ON approval_approvers(approval_id, status);

-- Create connector health metrics table
CREATE TABLE IF NOT EXISTS connector_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_id VARCHAR(255) NOT NULL,
    workspace_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'degraded', 'circuit_open')),
    error_rate NUMERIC(5, 2) DEFAULT 0,
    call_count INT DEFAULT 0,
    error_count INT DEFAULT 0,
    last_error_at TIMESTAMPTZ DEFAULT NULL,
    last_error_message TEXT,
    circuit_open_at TIMESTAMPTZ DEFAULT NULL,
    healthy_check_passed_at TIMESTAMPTZ DEFAULT NULL,
    p95_latency_ms INT DEFAULT 0,
    uptime_percentage NUMERIC(5, 2) DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connector_health_unique 
    ON connector_health(connector_id, workspace_id);

-- Create flow health impact table (tracks which flows are affected by circuit opens)
CREATE TABLE IF NOT EXISTS flow_connector_impact (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    connector_id VARCHAR(255) NOT NULL,
    workspace_id UUID NOT NULL,
    paused_at TIMESTAMPTZ DEFAULT NULL,
    pause_reason VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_connector_impact_flow 
    ON flow_connector_impact(flow_id);

CREATE INDEX IF NOT EXISTS idx_flow_connector_impact_connector 
    ON flow_connector_impact(connector_id, workspace_id);

-- Track connector call latency for p95 calculation
CREATE TABLE IF NOT EXISTS connector_call_latencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_id VARCHAR(255) NOT NULL,
    workspace_id UUID NOT NULL,
    flow_run_id UUID NOT NULL REFERENCES flow_runs(id) ON DELETE CASCADE,
    latency_ms INT NOT NULL,
    success BOOLEAN NOT NULL,
    error_code VARCHAR(50),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connector_call_latencies_connector_time 
    ON connector_call_latencies(connector_id, workspace_id, recorded_at DESC);
