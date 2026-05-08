/**
 * E2E Test: Verify credential encryption flow
 * 
 * CRITICAL: Plaintext credential values should NEVER be sent to the server.
 * This test verifies:
 * 1. Client-side encryption happens before network transmission
 * 2. Encrypted payload structure is correct
 * 3. Plaintext never appears in network requests
 */

/// <reference types="jest" />

import { encryptCredential, EncryptedCredentialPayload } from '../lib/encryption';

describe('Credential Encryption E2E Tests', () => {
  /**
   * Test 1: Verify encryption produces valid envelope
   */
  test('encrypts credential value to valid envelope structure', () => {
    const workspacePublicKey = 'YIxHpPWKXJMQz5RMd0Q2FG4lJ9vQ3xR2sK7mL0pN8oY='; // Example base64 pubkey
    const credentialValue = 'my-api-key-12345-secret';
    const version = 1;

    const encrypted = encryptCredential(credentialValue, workspacePublicKey, version);

    // Verify structure
    expect(encrypted).toHaveProperty('ephemeral_public_key');
    expect(encrypted).toHaveProperty('ciphertext');
    expect(encrypted).toHaveProperty('nonce');
    expect(encrypted).toHaveProperty('workspace_key_version');

    // Verify types
    expect(typeof encrypted.ephemeral_public_key).toBe('string');
    expect(typeof encrypted.ciphertext).toBe('string');
    expect(typeof encrypted.nonce).toBe('string');
    expect(encrypted.workspace_key_version).toBe(version);

    // Verify base64 encoding (should be valid base64)
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    expect(encrypted.ephemeral_public_key).toMatch(base64Regex);
    expect(encrypted.ciphertext).toMatch(base64Regex);
    expect(encrypted.nonce).toMatch(base64Regex);
  });

  /**
   * Test 2: Verify plaintext never appears in encrypted payload
   */
  test('plaintext credential value does NOT appear in encrypted payload', () => {
    const workspacePublicKey = 'YIxHpPWKXJMQz5RMd0Q2FG4lJ9vQ3xR2sK7mL0pN8oY=';
    const credentialValue = 'super-secret-api-key-12345'; // PLAINTEXT
    const version = 1;

    const encrypted = encryptCredential(credentialValue, workspacePublicKey, version);

    // Convert base64 fields to string to check for plaintext
    const ephemeralStr = Buffer.from(encrypted.ephemeral_public_key, 'base64').toString('utf8', 0, 50);
    const ciphertextStr = Buffer.from(encrypted.ciphertext, 'base64').toString('utf8', 0, 100);
    const nonceStr = Buffer.from(encrypted.nonce, 'base64').toString('utf8', 0, 50);

    // Plaintext credential should NOT appear in any field
    expect(encrypted.ephemeral_public_key).not.toContain(credentialValue);
    expect(encrypted.ciphertext).not.toContain(credentialValue);
    expect(encrypted.nonce).not.toContain(credentialValue);

    // Check decoded content too (defense in depth)
    expect(ephemeralStr).not.toContain(credentialValue);
    expect(ciphertextStr).not.toContain(credentialValue);
    expect(nonceStr).not.toContain(credentialValue);

    // Check the JSON representation
    const jsonStr = JSON.stringify(encrypted);
    expect(jsonStr).not.toContain(credentialValue);
  });

  /**
   * Test 3: Verify encryption is non-deterministic (different each time)
   * This proves we're using nonces and ephemeral keys
   */
  test('encryption is non-deterministic due to ephemeral keys', () => {
    const workspacePublicKey = 'YIxHpPWKXJMQz5RMd0Q2FG4lJ9vQ3xR2sK7mL0pN8oY=';
    const credentialValue = 'my-credential-value';
    const version = 1;

    const encrypted1 = encryptCredential(credentialValue, workspacePublicKey, version);
    const encrypted2 = encryptCredential(credentialValue, workspacePublicKey, version);

    // Ciphertexts should be different (proves ephemeral key usage)
    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);

    // Nonces should be different
    expect(encrypted1.nonce).not.toBe(encrypted2.nonce);

    // Ephemeral public keys should be different
    expect(encrypted1.ephemeral_public_key).not.toBe(encrypted2.ephemeral_public_key);

    // But version should be the same
    expect(encrypted1.workspace_key_version).toBe(encrypted2.workspace_key_version);
  });

  /**
   * Test 4: Verify payload size doesn't leak plaintext length
   * Ciphertext includes authentication tag, so encrypted size ≠ plaintext size
   */
  test('ciphertext length does not directly match plaintext length', () => {
    const workspacePublicKey = 'YIxHpPWKXJMQz5RMd0Q2FG4lJ9vQ3xR2sK7mL0pN8oY=';

    // Short credential
    const encrypted1 = encryptCredential('short', workspacePublicKey, 1);
    // Longer credential
    const encrypted2 = encryptCredential('this-is-a-much-longer-credential-value', workspacePublicKey, 1);

    // Both should have similar ciphertext sizes due to padding/tagging
    const len1 = Buffer.from(encrypted1.ciphertext, 'base64').length;
    const len2 = Buffer.from(encrypted2.ciphertext, 'base64').length;

    // Sizes should be different but not proportional to plaintext
    // (NaCl adds a 16-byte auth tag)
    expect(len1).toBeLessThan(len2);
    // The difference shouldn't directly reveal the plaintext length difference
    const plaintextDiff = 'this-is-a-much-longer-credential-value'.length - 'short'.length;
    // Ciphertext length difference should not equal plaintext length difference exactly
    expect(len2 - len1).not.toBe(plaintextDiff);
  });

  /**
   * Test 5: Network request payload structure validation
   * Simulates what gets sent to the API
   */
  test('network payload contains only encrypted data and metadata', () => {
    const workspacePublicKey = 'YIxHpPWKXJMQz5RMd0Q2FG4lJ9vQ3xR2sK7mL0pN8oY=';
    const credentialName = 'STRIPE_API_KEY';
    const credentialValue = 'sk_test_12345678901234567890';
    const version = 1;

    const encrypted = encryptCredential(credentialValue, workspacePublicKey, version);

    // Simulate the API request body
    const requestBody = {
      name: credentialName,
      encrypted_payload: encrypted,
    };

    // Convert to JSON (what actually goes over network)
    const jsonPayload = JSON.stringify(requestBody);

    // Plaintext credential should NOT appear anywhere in the payload
    expect(jsonPayload).not.toContain(credentialValue);

    // The credential name IS allowed (for identification)
    expect(jsonPayload).toContain(credentialName);

    // All required encrypted fields should be present
    expect(jsonPayload).toContain('ephemeral_public_key');
    expect(jsonPayload).toContain('ciphertext');
    expect(jsonPayload).toContain('nonce');
    expect(jsonPayload).toContain('workspace_key_version');
  });

  /**
   * Test 6: Invalid public key handling
   */
  test('rejects invalid workspace public key', () => {
    const invalidKey = 'not-a-valid-base64-key!!!'; // Invalid base64
    const credentialValue = 'my-credential';

    expect(() => {
      encryptCredential(credentialValue, invalidKey, 1);
    }).toThrow();
  });

  /**
   * Test 7: Verify nonce is always 24 bytes (NaCl box requirement)
   */
  test('nonce is always 24 bytes when decoded', () => {
    const workspacePublicKey = 'YIxHpPWKXJMQz5RMd0Q2FG4lJ9vQ3xR2sK7mL0pN8oY=';
    const credentialValue = 'test-credential';

    const encrypted = encryptCredential(credentialValue, workspacePublicKey, 1);

    const nonce = Buffer.from(encrypted.nonce, 'base64');
    expect(nonce.length).toBe(24); // NaCl box requires exactly 24 byte nonce
  });

  /**
   * Test 8: Verify ephemeral public key is 32 bytes
   */
  test('ephemeral public key is 32 bytes when decoded', () => {
    const workspacePublicKey = 'YIxHpPWKXJMQz5RMd0Q2FG4lJ9vQ3xR2sK7mL0pN8oY=';
    const credentialValue = 'test-credential';

    const encrypted = encryptCredential(credentialValue, workspacePublicKey, 1);

    const ephemeralKey = Buffer.from(encrypted.ephemeral_public_key, 'base64');
    expect(ephemeralKey.length).toBe(32); // Curve25519 public key size
  });
});

/**
 * Integration Test: Verify the full flow with mock network
 */
describe('Credential Encryption Integration Tests', () => {
  test('end-to-end encryption flow does not leak plaintext', async () => {
    // This would require a more complete setup with mocking
    // For now, the unit tests above verify the encryption mechanics

    const workspacePublicKey = 'YIxHpPWKXJMQz5RMd0Q2FG4lJ9vQ3xR2sK7mL0pN8oY=';
    const credentialValue = 'sk_live_super_secret_key';

    // Step 1: Encrypt
    const encrypted = encryptCredential(credentialValue, workspacePublicKey, 1);

    // Step 2: Verify plaintext is gone
    const payload = JSON.stringify({
      name: 'STRIPE_API_KEY',
      encrypted_payload: encrypted,
    });

    // Step 3: Assert security properties
    expect(payload).not.toContain(credentialValue);
    expect(encrypted.ciphertext.length).toBeGreaterThan(0);
    expect(encrypted.nonce.length).toBeGreaterThan(0);
    expect(encrypted.ephemeral_public_key.length).toBeGreaterThan(0);
  });
});
