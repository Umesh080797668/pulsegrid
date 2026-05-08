-- Workspace-level public key encryption for client-side credential encryption

CREATE TABLE IF NOT EXISTS workspace_encryption_keys (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    key_version INT NOT NULL DEFAULT 1,
    -- Base64-encoded Curve25519 public key (32 bytes, used for client-side encryption)
    public_key TEXT NOT NULL,
    -- Base64-encoded Curve25519 private key (32 bytes, sealed at rest if using HSM)
    private_key_sealed BYTEA,
    private_key_sealed_nonce BYTEA,
    -- For legacy or testing: plaintext private key (should be removed in production)
    private_key_plaintext TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_encryption_keys_workspace
    ON workspace_encryption_keys(workspace_id, key_version DESC);
