CREATE TABLE IF NOT EXISTS enterprise_tenants (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL UNIQUE,
    tenant_schema VARCHAR(128) NOT NULL UNIQUE,
    plan VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_upgrade_history (
    id BIGSERIAL PRIMARY KEY,
    workspace_id UUID NOT NULL,
    from_plan VARCHAR(32) NOT NULL,
    to_plan VARCHAR(32) NOT NULL,
    migrated_schema VARCHAR(128) NOT NULL,
    migrated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    migration_version VARCHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_enterprise_tenants_workspace_id ON enterprise_tenants(workspace_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_tenants_schema ON enterprise_tenants(tenant_schema);
CREATE INDEX IF NOT EXISTS idx_tenant_upgrade_history_workspace_id ON tenant_upgrade_history(workspace_id);