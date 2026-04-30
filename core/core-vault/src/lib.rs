use hmac::{Hmac, KeyInit, Mac};
use ring::{aead, rand};
use sha2::Sha256;
use argon2::{Argon2, Algorithm, Params, Version};

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug)]
pub enum VaultError {
    EncryptionFailed,
    DecryptionFailed,
    InvalidSignature,
}

pub struct Vault {
    key: aead::LessSafeKey,
}

impl Vault {
    pub fn new(master_password: &str, salt: &[u8]) -> Self {
        let mut key_bytes = [0u8; 32];
        // Use Argon2id per blueprint: time=2, mem=65536 KiB, parallelism=2
        let params = Params::new(65536, 2, 2, None).expect("invalid argon2 params");
        let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
        argon2
            .hash_password_into(master_password.as_bytes(), salt, &mut key_bytes)
            .expect("argon2 key derivation failed");

        let unbound_key = aead::UnboundKey::new(&aead::AES_256_GCM, &key_bytes).unwrap();
        Self {
            key: aead::LessSafeKey::new(unbound_key),
        }
    }

    pub fn encrypt(&self, plain_text: &str) -> Result<(Vec<u8>, Vec<u8>), VaultError> {
        let rng = rand::SystemRandom::new();
        let mut nonce_bytes = [0u8; 12];
        rand::SecureRandom::fill(&rng, &mut nonce_bytes)
            .map_err(|_| VaultError::EncryptionFailed)?;
        let mut in_out = plain_text.as_bytes().to_vec();
        
        let nonce = aead::Nonce::assume_unique_for_key(nonce_bytes);
        self.key
            .seal_in_place_append_tag(nonce, aead::Aad::empty(), &mut in_out)
            .map_err(|_| VaultError::EncryptionFailed)?;
        
        Ok((in_out, nonce_bytes.to_vec()))
    }

    pub fn decrypt(&self, encrypted_blob: &[u8], nonce_bytes: &[u8]) -> Result<String, VaultError> {
        if nonce_bytes.len() != 12 {
            return Err(VaultError::DecryptionFailed);
        }
        let mut nonce_arr = [0u8; 12];
        nonce_arr.copy_from_slice(nonce_bytes);
        let nonce = aead::Nonce::assume_unique_for_key(nonce_arr);
        
        let mut in_out = encrypted_blob.to_vec();
        let decrypted_data = self
            .key
            .open_in_place(nonce, aead::Aad::empty(), &mut in_out)
            .map_err(|_| VaultError::DecryptionFailed)?;
            
        String::from_utf8(decrypted_data.to_vec()).map_err(|_| VaultError::DecryptionFailed)
    }

    pub fn verify_webhook_signature(
        &self,
        payload: &str,
        signature: &str,
        plain_secret: &str,
    ) -> bool {
        let mut mac = match HmacSha256::new_from_slice(plain_secret.as_bytes()) {
            Ok(m) => m,
            Err(_) => return false,
        };
        mac.update(payload.as_bytes());

        let provided = signature
            .trim()
            .strip_prefix("sha256=")
            .unwrap_or(signature.trim());
        let provided_bytes = match hex::decode(provided) {
            Ok(v) => v,
            Err(_) => return false,
        };

        mac.verify_slice(&provided_bytes).is_ok()
    }

    pub fn hmac_sha256_hex(
        &self,
        message: &str,
        plain_secret: &str,
    ) -> Result<String, VaultError> {
        let mut mac = HmacSha256::new_from_slice(plain_secret.as_bytes())
            .map_err(|_| VaultError::InvalidSignature)?;
        mac.update(message.as_bytes());

        Ok(hex::encode(mac.finalize().into_bytes()))
    }
}
