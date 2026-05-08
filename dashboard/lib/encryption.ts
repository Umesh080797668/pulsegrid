import * as nacl from 'tweetnacl';

/**
 * Envelope encryption scheme: public-key encryption for credential values
 * Uses NaCl box (Curve25519, Salsa20, Poly1305)
 * 
 * Flow:
 * 1. Browser fetches workspace's public key
 * 2. Browser generates ephemeral keypair
 * 3. Browser encrypts credential value with workspace public key
 * 4. Browser sends encrypted payload + ephemeral public key + nonce to server
 * 5. Server decrypts with its private key (workspace key)
 * 6. Server re-encrypts with vault master key and stores
 */

export interface EncryptedCredentialPayload {
  /** Base64-encoded ephemeral public key (32 bytes) */
  ephemeral_public_key: string;
  /** Base64-encoded encrypted credential value + tag (variable length) */
  ciphertext: string;
  /** Base64-encoded nonce (24 bytes) */
  nonce: string;
  /** Metadata: which workspace key version was used */
  workspace_key_version: number;
}

/**
 * Encodes bytes to base64 (safe for JSON transport)
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decodes base64 to bytes
 */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypts a credential value using the workspace's public key.
 * Uses ephemeral keypair for each encryption to ensure perfect forward secrecy.
 *
 * @param credentialValue The plaintext credential value
 * @param workspacePublicKeyBase64 Base64-encoded workspace public key
 * @param workspaceKeyVersion Version of the workspace key being used
 * @returns Encrypted payload ready for transport
 */
export function encryptCredential(
  credentialValue: string,
  workspacePublicKeyBase64: string,
  workspaceKeyVersion: number = 1,
): EncryptedCredentialPayload {
  // Decode workspace public key
  const workspacePublicKey = base64ToBytes(workspacePublicKeyBase64);
  if (workspacePublicKey.length !== 32) {
    throw new Error('Invalid workspace public key length');
  }

  // Generate ephemeral keypair for this encryption
  const ephemeralKeypair = nacl.box.keyPair();

  // Prepare plaintext
  const plaintext = new TextEncoder().encode(credentialValue);

  // Generate nonce (24 random bytes)
  const nonce = nacl.randomBytes(24);

  // Encrypt: box(plaintext, nonce, ephemeralPrivateKey, workspacePublicKey)
  const ciphertext = nacl.box(
    plaintext,
    nonce,
    workspacePublicKey as Uint8Array,
    ephemeralKeypair.secretKey,
  );

  // Return encrypted payload
  return {
    ephemeral_public_key: bytesToBase64(ephemeralKeypair.publicKey),
    ciphertext: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
    workspace_key_version: workspaceKeyVersion,
  };
}

/**
 * Decrypts a credential value (for testing/verification only).
 * This is only used on the server-side, included here for testing.
 *
 * @param payload Encrypted payload
 * @param workspacePrivateKeyBase64 Base64-encoded workspace private key (server-side only)
 * @returns Decrypted plaintext credential value
 */
export function decryptCredential(
  payload: EncryptedCredentialPayload,
  workspacePrivateKeyBase64: string,
): string {
  const workspacePrivateKey = base64ToBytes(workspacePrivateKeyBase64);
  const ephemeralPublicKey = base64ToBytes(payload.ephemeral_public_key);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const nonce = base64ToBytes(payload.nonce);

  if (workspacePrivateKey.length !== 32) {
    throw new Error('Invalid workspace private key length');
  }
  if (ephemeralPublicKey.length !== 32) {
    throw new Error('Invalid ephemeral public key length');
  }
  if (nonce.length !== 24) {
    throw new Error('Invalid nonce length');
  }

  const plaintext = nacl.box.open(
    ciphertext,
    nonce,
    ephemeralPublicKey,
    workspacePrivateKey,
  );

  if (!plaintext) {
    throw new Error('Decryption failed: invalid ciphertext or nonce');
  }

  return new TextDecoder().decode(plaintext);
}

/**
 * Generates a new workspace keypair for server-side use.
 * This is a helper for testing/setup only.
 */
export function generateWorkspaceKeypair() {
  const keypair = nacl.box.keyPair();
  return {
    publicKey: bytesToBase64(keypair.publicKey),
    secretKey: bytesToBase64(keypair.secretKey),
  };
}
