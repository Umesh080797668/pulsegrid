CREATE TABLE IF NOT EXISTS pending_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_run_id UUID NOT NULL REFERENCES flow_runs(id) ON DELETE CASCADE,
    step_id TEXT NOT NULL,
    approval_token UUID NOT NULL DEFAULT gen_random_uuid(),
    context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_approvals_token
    ON pending_approvals(approval_token);

CREATE INDEX IF NOT EXISTS idx_pending_approvals_flow_run
    ON pending_approvals(flow_run_id, status);
