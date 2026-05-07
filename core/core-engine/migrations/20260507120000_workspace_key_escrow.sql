-- VaultGuard workspace key hierarchy and HSM escrow support

ALTER TABLE credentials
    ADD COLUMN IF NOT EXISTS workspace_key_version INT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS workspace_key_escrows (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    key_version INT NOT NULL DEFAULT 1,
    sealed_key BYTEA NOT NULL,
    sealed_nonce BYTEA NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_key_user_wrappers (
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_version INT NOT NULL DEFAULT 1,
    wrapped_key BYTEA NOT NULL,
    wrapped_nonce BYTEA NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id, key_version)
);

CREATE INDEX IF NOT EXISTS idx_workspace_key_escrows_workspace_version
    ON workspace_key_escrows (workspace_id, key_version DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_key_user_wrappers_workspace_user
    ON workspace_key_user_wrappers (workspace_id, user_id, key_version DESC);
