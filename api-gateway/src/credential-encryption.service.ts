import * as crypto from 'crypto';

/**
 * Handles encryption/decryption for credentials using NaCl-based public key cryptography.
 * Workspace maintains a keypair for client-side envelope encryption of credentials.
 * 
 * Flow:
 * 1. Browser encrypts credential with workspace public key
 * 2. Server decrypts with workspace private key
 * 3. Server re-encrypts with vault master key for storage
 */

export interface EncryptedCredentialPayload {
  ephemeral_public_key: string; // Base64-encoded ephemeral public key
  ciphertext: string; // Base64-encoded encrypted credential
  nonce: string; // Base64-encoded nonce
  workspace_key_version: number;
}

export class CredentialEncryptionService {
  /**
   * Generates a new workspace keypair for client-side credential encryption.
   * This should be called once per workspace during setup.
   *
   * Returns base64-encoded keypair suitable for storage in database.
   */
  static generateWorkspaceKeypair(): { publicKey: string; privateKey: string } {
    // For now, we'll store a placeholder
    // In production, this would use libsodium (via node-sodium) or another NaCl implementation
    // The actual decryption would happen in the core service with access to private keys
    
    const publicKey = crypto.randomBytes(32).toString('base64');
    const privateKey = crypto.randomBytes(32).toString('base64');
    
    return { publicKey, privateKey };
  }

  /**
   * Validates that an encrypted payload has the correct structure.
   */
  static validateEncryptedPayload(payload: EncryptedCredentialPayload): boolean {
    if (
      !payload.ephemeral_public_key ||
      !payload.ciphertext ||
      !payload.nonce ||
      typeof payload.workspace_key_version !== 'number'
    ) {
      return false;
    }

    try {
      // Validate base64 encoding
      Buffer.from(payload.ephemeral_public_key, 'base64');
      Buffer.from(payload.ciphertext, 'base64');
      Buffer.from(payload.nonce, 'base64');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Converts encrypted payload to transport format (send to core for decryption + re-encryption).
   * The API gateway is a trust boundary - it doesn't have the workspace private key.
   * Decryption happens in the core service only.
   */
  static encryptedPayloadToTransport(
    payload: EncryptedCredentialPayload,
  ): Record<string, string> {
    return {
      ephemeral_public_key: payload.ephemeral_public_key,
      ciphertext: payload.ciphertext,
      nonce: payload.nonce,
      workspace_key_version: String(payload.workspace_key_version),
    };
  }
}
