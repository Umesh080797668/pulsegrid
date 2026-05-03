CREATE TABLE IF NOT EXISTS tenant_events (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    event_type VARCHAR(128) NOT NULL,
    event_payload jsonb NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_events_workspace_id ON tenant_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tenant_events_created_at ON tenant_events(created_at);