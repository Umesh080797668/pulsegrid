-- Migration: create guard schema and alerts table

CREATE SCHEMA IF NOT EXISTS guard;

-- Main GuardAlert table
CREATE TABLE IF NOT EXISTS guard.alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    guard_event_id  UUID NOT NULL,
    severity        VARCHAR(20) NOT NULL,
    source          VARCHAR(50) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'open',
    ai_diagnosis    TEXT,
    ai_confidence   DECIMAL(4,3),
    web_sources     JSONB,
    code_suggestion JSONB,
    maintenance_scope JSONB,
    github_issue_url TEXT,
    resolved_by     UUID,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);

-- Codebase index table for parsed function signatures and error patterns
CREATE TABLE IF NOT EXISTS guard.codebase_index (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path       TEXT NOT NULL UNIQUE,
    language        VARCHAR(20) NOT NULL,
    function_sigs   JSONB,
    error_patterns  TEXT[],
    last_indexed_at TIMESTAMPTZ DEFAULT NOW(),
    git_sha         VARCHAR(40) NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS guard_alerts_tenant_id_idx ON guard.alerts (tenant_id);
CREATE INDEX IF NOT EXISTS guard_alerts_severity_idx ON guard.alerts (severity);
CREATE INDEX IF NOT EXISTS guard_alerts_status_idx ON guard.alerts (status);
CREATE INDEX IF NOT EXISTS guard_alerts_created_at_idx ON guard.alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS guard_alerts_tenant_created_idx ON guard.alerts (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS guard_codebase_index_file_idx ON guard.codebase_index (file_path);
CREATE INDEX IF NOT EXISTS guard_codebase_index_patterns_idx ON guard.codebase_index USING GIN (error_patterns);
CREATE INDEX IF NOT EXISTS guard_codebase_index_language_idx ON guard.codebase_index (language);
