-- Create api_keys table for Pro users to generate and manage API keys for programmatic access
-- Keys are hashed for security and can be revoked/expired

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    
    -- Key identifier (prefix like "pk_live_" for easy identification in logs/UI)
    key_prefix VARCHAR(16) NOT NULL,
    -- SHA256 hash of the full key for secure comparison without storing plaintext
    key_hash VARCHAR(64) NOT NULL,
    
    -- Metadata
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Lifecycle
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    
    -- Scopes (JSON array of permissions like ["flows:read", "connectors:read"])
    scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    CONSTRAINT api_keys_unique_prefix_hash UNIQUE(workspace_id, key_prefix)
);

-- Index for fast lookups by workspace
CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id);
-- Index for querying active keys
CREATE INDEX idx_api_keys_active ON api_keys(workspace_id) WHERE is_active = true;
-- Index for expired keys cleanup
CREATE INDEX idx_api_keys_expires ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

