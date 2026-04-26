import re

content = open("grpc.rs").read()

bad_insert1 = """        let res = sqlx::query!(
            r#"
            INSERT INTO credentials (workspace_id, connector_id, encrypted_blob)
            VALUES ($1, $2, $3)
            ON CONFLICT (workspace_id, connector_id) DO UPDATE SET encrypted_blob = EXCLUDED.encrypted_blob, updated_at = NOW()
            "#,
            ws_id,
            connector_id,
            encrypted_blob
        )"""

good_insert1 = """        let (encrypted_blob, nonce) = self.vault.encrypt(&req.secret_value).map_err(|e| {
            Status::internal(format!("Encryption error: {:?}", e))
        })?;

        let res = sqlx::query!(
            r#"
            INSERT INTO credentials (workspace_id, connector_id, encrypted_blob, nonce)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (workspace_id, connector_id) DO UPDATE SET encrypted_blob = EXCLUDED.encrypted_blob, nonce = EXCLUDED.nonce, updated_at = NOW()
            "#,
            ws_id,
            connector_id,
            encrypted_blob,
            nonce
        )"""

content = content.replace(bad_insert1, good_insert1)

# fix the Let (encrypted_blob, nonce) being duplicated if it was
content = content.replace("""        let (encrypted_blob, nonce) = self.vault.encrypt(&req.secret_value).map_err(|e| {
            Status::internal(format!("Encryption error: {:?}", e))
        })?;

        let (encrypted_blob, nonce) = self.vault.encrypt(&req.secret_value).map_err(|e| {""", """        let (encrypted_blob, nonce) = self.vault.encrypt(&req.secret_value).map_err(|e| {""")

open("grpc.rs", "w").write(content)
