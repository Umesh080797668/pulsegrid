CREATE TABLE IF NOT EXISTS tenant_settings (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    setting_key VARCHAR(255) NOT NULL,
    setting_value TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_settings_key UNIQUE (workspace_id, setting_key)
);

CREATE TABLE IF NOT EXISTS tenant_users (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_users_user UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_settings_workspace_id ON tenant_settings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_workspace_id ON tenant_users(workspace_id);