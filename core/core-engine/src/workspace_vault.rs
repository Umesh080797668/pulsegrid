use core_vault::Vault;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use std::sync::Arc;
use std::io::Read;
use uuid::Uuid;

const DEFAULT_KEY_VERSION: i32 = 1;

#[allow(dead_code)]
#[derive(Debug)]
pub enum WorkspaceVaultError {
    MissingEscrowConfig,
    EscrowUnavailable(String),
    Database(String),
    Crypto(String),
}

#[derive(Clone)]
pub struct WorkspaceVaultService {
    backend: Arc<WorkspaceVaultBackend>,
}

#[derive(Clone)]
enum WorkspaceVaultBackend {
    Legacy {
        vault: Arc<Vault>,
    },
    Escrowed {
        pool: PgPool,
        hsm: HsmEscrowClient,
    },
}

#[derive(Clone)]
struct HsmEscrowClient {
    http: reqwest::Client,
    base_url: String,
    auth_token: Option<String>,
}

#[derive(Debug, Serialize)]
struct SealWorkspaceKeyRequest {
    workspace_id: String,
    key_version: i32,
    workspace_key: String,
}

#[derive(Debug, Deserialize)]
struct SealWorkspaceKeyResponse {
    sealed_key: String,
    sealed_nonce: String,
}

#[derive(Debug, Serialize)]
struct UnsealWorkspaceKeyRequest {
    workspace_id: String,
    key_version: i32,
    sealed_key: String,
    sealed_nonce: String,
}

#[derive(Debug, Deserialize)]
struct UnsealWorkspaceKeyResponse {
    workspace_key: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct WorkspaceKeyEnvelope {
    pub workspace_id: Uuid,
    pub key_version: i32,
    pub sealed_key: Vec<u8>,
    pub sealed_nonce: Vec<u8>,
}

impl WorkspaceVaultService {
    pub fn legacy(vault: Arc<Vault>) -> Self {
        Self {
            backend: Arc::new(WorkspaceVaultBackend::Legacy { vault }),
        }
    }

    pub fn from_env(pool: PgPool) -> Result<Self, WorkspaceVaultError> {
        let base_url = std::env::var("PULSE_HSM_ESCROW_URL")
            .map_err(|_| WorkspaceVaultError::MissingEscrowConfig)?;
        let auth_token = std::env::var("PULSE_HSM_ESCROW_TOKEN").ok().filter(|value| !value.trim().is_empty());
        Ok(Self {
            backend: Arc::new(WorkspaceVaultBackend::Escrowed {
                pool,
                hsm: HsmEscrowClient {
                    http: reqwest::Client::new(),
                    base_url,
                    auth_token,
                },
            }),
        })
    }

    pub async fn ensure_workspace_key(
        &self,
        workspace_id: Uuid,
        owner_user_id: Option<Uuid>,
    ) -> Result<i32, WorkspaceVaultError> {
        match self.backend.as_ref() {
            WorkspaceVaultBackend::Legacy { .. } => Ok(DEFAULT_KEY_VERSION),
            WorkspaceVaultBackend::Escrowed { pool, hsm } => {
                if let Some(row) = sqlx::query(
                    r#"
                    SELECT key_version
                    FROM workspace_key_escrows
                    WHERE workspace_id = $1
                    ORDER BY key_version DESC
                    LIMIT 1
                    "#,
                )
                .bind(workspace_id)
                .fetch_optional(pool)
                .await
                .map_err(|e| WorkspaceVaultError::Database(e.to_string()))?
                {
                    let key_version: i32 = row
                        .try_get("key_version")
                        .map_err(|e| WorkspaceVaultError::Database(e.to_string()))?;
                    return Ok(key_version);
                }

                let mut workspace_key = [0u8; 32];
                std::fs::File::open("/dev/urandom")
                    .and_then(|mut file| file.read_exact(&mut workspace_key))
                    .map_err(|e| WorkspaceVaultError::Crypto(format!("failed to generate workspace key: {e}")))?;

                let sealed = hsm
                    .seal_workspace_key(workspace_id, DEFAULT_KEY_VERSION, &workspace_key)
                    .await?;

                sqlx::query(
                    r#"
                    INSERT INTO workspace_key_escrows (
                        workspace_id,
                        key_version,
                        sealed_key,
                        sealed_nonce
                    ) VALUES ($1, $2, $3, $4)
                    ON CONFLICT (workspace_id) DO UPDATE SET
                        key_version = EXCLUDED.key_version,
                        sealed_key = EXCLUDED.sealed_key,
                        sealed_nonce = EXCLUDED.sealed_nonce,
                        updated_at = NOW()
                    "#,
                )
                .bind(workspace_id)
                .bind(DEFAULT_KEY_VERSION)
                .bind(&sealed.sealed_key)
                .bind(&sealed.sealed_nonce)
                .execute(pool)
                .await
                .map_err(|e| WorkspaceVaultError::Database(e.to_string()))?;

                if let Some(owner_user_id) = owner_user_id {
                    self.persist_user_wrapper(workspace_id, owner_user_id, DEFAULT_KEY_VERSION, &workspace_key)
                        .await?;
                }

                Ok(DEFAULT_KEY_VERSION)
            }
        }
    }

    pub async fn bootstrap_workspace(
        &self,
        workspace_id: Uuid,
        owner_user_id: Option<Uuid>,
    ) -> Result<i32, WorkspaceVaultError> {
        self.ensure_workspace_key(workspace_id, owner_user_id).await
    }

    pub async fn encrypt_workspace_secret(
        &self,
        workspace_id: Uuid,
        plain_text: &str,
    ) -> Result<(Vec<u8>, Vec<u8>, i32), WorkspaceVaultError> {
        let key_version = self.current_key_version(workspace_id).await?;
        let (vault, key_version) = self.load_workspace_vault_with_version(workspace_id, key_version).await?;
        let (encrypted_blob, nonce) = vault
            .encrypt(plain_text)
            .map_err(|e| WorkspaceVaultError::Crypto(format!("{:?}", e)))?;
        Ok((encrypted_blob, nonce, key_version))
    }

    pub async fn decrypt_workspace_secret(
        &self,
        workspace_id: Uuid,
        key_version: i32,
        encrypted_blob: &[u8],
        nonce: &[u8],
    ) -> Result<String, WorkspaceVaultError> {
        let (vault, loaded_version) = self.load_workspace_vault_with_version(workspace_id, key_version).await?;
        if loaded_version != key_version {
            return Err(WorkspaceVaultError::Crypto(format!(
                "workspace key version mismatch: requested {key_version}, loaded {loaded_version}"
            )));
        }
        vault
            .decrypt(encrypted_blob, nonce)
            .map_err(|e| WorkspaceVaultError::Crypto(format!("{:?}", e)))
    }

    pub async fn current_key_version(&self, workspace_id: Uuid) -> Result<i32, WorkspaceVaultError> {
        match self.backend.as_ref() {
            WorkspaceVaultBackend::Legacy { .. } => Ok(DEFAULT_KEY_VERSION),
            WorkspaceVaultBackend::Escrowed { pool, .. } => {
                let row = sqlx::query(
                    r#"
                    SELECT key_version
                    FROM workspace_key_escrows
                    WHERE workspace_id = $1
                    ORDER BY key_version DESC
                    LIMIT 1
                    "#,
                )
                .bind(workspace_id)
                .fetch_optional(pool)
                .await
                .map_err(|e| WorkspaceVaultError::Database(e.to_string()))?;

                Ok(row
                    .and_then(|row| row.try_get::<i32, _>("key_version").ok())
                    .unwrap_or(DEFAULT_KEY_VERSION))
            }
        }
    }

    #[allow(dead_code)]
    async fn load_workspace_vault(&self, workspace_id: Uuid) -> Result<(Vault, i32), WorkspaceVaultError> {
        self.load_workspace_vault_with_version(workspace_id, DEFAULT_KEY_VERSION).await
    }

    async fn load_workspace_vault_with_version(
        &self,
        workspace_id: Uuid,
        key_version: i32,
    ) -> Result<(Vault, i32), WorkspaceVaultError> {
        match self.backend.as_ref() {
            WorkspaceVaultBackend::Legacy { vault } => Ok((vault.as_ref().clone(), DEFAULT_KEY_VERSION)),
            WorkspaceVaultBackend::Escrowed { pool, hsm } => {
                let row = sqlx::query(
                    r#"
                    SELECT sealed_key, sealed_nonce, key_version
                    FROM workspace_key_escrows
                    WHERE workspace_id = $1 AND key_version = $2
                    LIMIT 1
                    "#,
                )
                .bind(workspace_id)
                .bind(key_version)
                .fetch_optional(pool)
                .await
                .map_err(|e| WorkspaceVaultError::Database(e.to_string()))?
                .ok_or_else(|| WorkspaceVaultError::Database("workspace key escrow not found".to_string()))?;

                let sealed_key: Vec<u8> = row
                    .try_get("sealed_key")
                    .map_err(|e| WorkspaceVaultError::Database(e.to_string()))?;
                let sealed_nonce: Vec<u8> = row
                    .try_get("sealed_nonce")
                    .map_err(|e| WorkspaceVaultError::Database(e.to_string()))?;
                let loaded_version: i32 = row
                    .try_get("key_version")
                    .map_err(|e| WorkspaceVaultError::Database(e.to_string()))?;

                let key_material = hsm
                    .unseal_workspace_key(workspace_id, loaded_version, &sealed_key, &sealed_nonce)
                    .await?;
                if key_material.len() != 32 {
                    return Err(WorkspaceVaultError::Crypto(
                        "unsealed workspace key must be 32 bytes".to_string(),
                    ));
                }
                let mut key_bytes = [0u8; 32];
                key_bytes.copy_from_slice(&key_material);
                let vault = Vault::from_key_material(key_bytes)
                    .map_err(|e| WorkspaceVaultError::Crypto(format!("{:?}", e)))?;
                Ok((vault, loaded_version))
            }
        }
    }

    async fn persist_user_wrapper(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
        key_version: i32,
        workspace_key: &[u8; 32],
    ) -> Result<(), WorkspaceVaultError> {
        match self.backend.as_ref() {
            WorkspaceVaultBackend::Legacy { .. } => Ok(()),
            WorkspaceVaultBackend::Escrowed { pool, .. } => {
                let mut salt = Vec::with_capacity(32);
                salt.extend_from_slice(workspace_id.as_bytes());
                salt.extend_from_slice(user_id.as_bytes());
                let user_key_bytes = Vault::derive_key_material(user_id.as_bytes(), &salt)
                    .map_err(|e| WorkspaceVaultError::Crypto(format!("{:?}", e)))?;
                let user_vault = Vault::from_key_material(user_key_bytes)
                    .map_err(|e| WorkspaceVaultError::Crypto(format!("{:?}", e)))?;
                let (wrapped_key, wrapped_nonce) = user_vault
                    .encrypt_bytes(workspace_key)
                    .map_err(|e| WorkspaceVaultError::Crypto(format!("{:?}", e)))?;

                sqlx::query(
                    r#"
                    INSERT INTO workspace_key_user_wrappers (
                        workspace_id,
                        user_id,
                        key_version,
                        wrapped_key,
                        wrapped_nonce
                    ) VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (workspace_id, user_id, key_version) DO UPDATE SET
                        wrapped_key = EXCLUDED.wrapped_key,
                        wrapped_nonce = EXCLUDED.wrapped_nonce,
                        updated_at = NOW()
                    "#,
                )
                .bind(workspace_id)
                .bind(user_id)
                .bind(key_version)
                .bind(wrapped_key)
                .bind(wrapped_nonce)
                .execute(pool)
                .await
                .map_err(|e| WorkspaceVaultError::Database(e.to_string()))?;

                Ok(())
            }
        }
    }
}

impl HsmEscrowClient {
    async fn seal_workspace_key(
        &self,
        workspace_id: Uuid,
        key_version: i32,
        workspace_key: &[u8; 32],
    ) -> Result<WorkspaceKeyEnvelope, WorkspaceVaultError> {
        let payload = SealWorkspaceKeyRequest {
            workspace_id: workspace_id.to_string(),
            key_version,
            workspace_key: base64::engine::general_purpose::STANDARD.encode(workspace_key),
        };

        let response: SealWorkspaceKeyResponse = self
            .post_json(&format!("{}/workspaces/{workspace_id}/seal", self.base_url), &payload)
            .await?;

        Ok(WorkspaceKeyEnvelope {
            workspace_id,
            key_version,
            sealed_key: base64::engine::general_purpose::STANDARD
                .decode(response.sealed_key)
                .map_err(|e| WorkspaceVaultError::EscrowUnavailable(e.to_string()))?,
            sealed_nonce: base64::engine::general_purpose::STANDARD
                .decode(response.sealed_nonce)
                .map_err(|e| WorkspaceVaultError::EscrowUnavailable(e.to_string()))?,
        })
    }

    async fn unseal_workspace_key(
        &self,
        workspace_id: Uuid,
        key_version: i32,
        sealed_key: &[u8],
        sealed_nonce: &[u8],
    ) -> Result<Vec<u8>, WorkspaceVaultError> {
        let payload = UnsealWorkspaceKeyRequest {
            workspace_id: workspace_id.to_string(),
            key_version,
            sealed_key: base64::engine::general_purpose::STANDARD.encode(sealed_key),
            sealed_nonce: base64::engine::general_purpose::STANDARD.encode(sealed_nonce),
        };

        let response: UnsealWorkspaceKeyResponse = self
            .post_json(&format!("{}/workspaces/{workspace_id}/unseal", self.base_url), &payload)
            .await?;

        base64::engine::general_purpose::STANDARD
            .decode(response.workspace_key)
            .map_err(|e| WorkspaceVaultError::EscrowUnavailable(e.to_string()))
    }

    async fn post_json<T, R>(&self, url: &str, payload: &T) -> Result<R, WorkspaceVaultError>
    where
        T: Serialize + ?Sized,
        R: for<'de> Deserialize<'de>,
    {
        let mut request = self.http.post(url).json(payload);
        if let Some(token) = &self.auth_token {
            if !token.trim().is_empty() {
                request = request.bearer_auth(token.trim());
            }
        }

        let response = request
            .send()
            .await
            .map_err(|e| WorkspaceVaultError::EscrowUnavailable(e.to_string()))?;

        if !response.status().is_success() {
            return Err(WorkspaceVaultError::EscrowUnavailable(format!(
                "escrow service returned {}",
                response.status()
            )));
        }

        response
            .json::<R>()
            .await
            .map_err(|e| WorkspaceVaultError::EscrowUnavailable(e.to_string()))
    }
}
