CREATE TABLE IF NOT EXISTS usage_counters (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    usage_month DATE NOT NULL,
    event_count BIGINT NOT NULL DEFAULT 0,
    flow_run_count BIGINT NOT NULL DEFAULT 0,
    connector_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, usage_month)
);

CREATE TABLE IF NOT EXISTS ai_detected_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    pattern_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    confidence REAL NOT NULL,
    frequency VARCHAR(100) NOT NULL,
    events_involved JSONB NOT NULL DEFAULT '[]'::jsonb,
    suggested_trigger TEXT,
    suggested_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    suggested_flow JSONB NOT NULL DEFAULT '{}'::jsonb,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_detected_patterns_workspace
    ON ai_detected_patterns(workspace_id, detected_at DESC);

ALTER TABLE billing_subscriptions
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
