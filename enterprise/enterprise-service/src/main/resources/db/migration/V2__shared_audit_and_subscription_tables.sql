CREATE TABLE IF NOT EXISTS enterprise_subscriptions (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    stripe_customer_id VARCHAR(255) NOT NULL,
    stripe_subscription_id VARCHAR(255) NOT NULL,
    plan VARCHAR(64) NOT NULL,
    status VARCHAR(64) NOT NULL,
    current_period_start TIMESTAMP NULL,
    current_period_end TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS enterprise_audit_logs (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    user_id UUID NOT NULL,
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(255) NULL,
    resource_id VARCHAR(255) NULL,
    details jsonb NULL,
    ip_address VARCHAR(64) NOT NULL,
    user_agent VARCHAR(512) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workspace_id ON enterprise_audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_user_id ON enterprise_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON enterprise_audit_logs(created_at);