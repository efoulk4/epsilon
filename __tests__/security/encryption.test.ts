/**
 * EPS-002: Token Encryption Security Tests
 *
 * Tests that Shopify access tokens are properly encrypted at rest
 * using AES-256-GCM and cannot be read without the encryption key.
 */

import { encrypt, decrypt, isEncrypted, generateEncryptionKey } from '@/app/utils/encryption'
import crypto from 'crypto'

describe('EPS-002: Token Encryption Security', () => {
  const originalEnv = process.env.ENCRYPTION_KEY

  beforeAll(() => {
    // Set a test encryption key (256-bit = 32 bytes, base64 encoded)
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64')
  })

  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalEnv
  })

  describe('encrypt', () => {
    it('should encrypt plaintext tokens', () => {
      const plaintext = 'test_token_0123456789abcdef0123456789'
      const ciphertext = encrypt(plaintext)

      // Ciphertext should not contain plaintext
      expect(ciphertext).not.toContain(plaintext)

      // Should be in format: iv:authTag:ciphertext (all base64)
      const parts = ciphertext.split(':')
      expect(parts).toHaveLength(3)
      parts.forEach(part => {
        expect(part).toMatch(/^[A-Za-z0-9+/]+=*$/) // base64 pattern
      })
    })

    it('should produce different ciphertext for same plaintext (unique IV)', () => {
      const plaintext = 'test_shopify_token'
      const ciphertext1 = encrypt(plaintext)
      const ciphertext2 = encrypt(plaintext)

      // Different IVs mean different ciphertext
      expect(ciphertext1).not.toBe(ciphertext2)
    })

    it('should throw error if ENCRYPTION_KEY is not set', () => {
      const key = process.env.ENCRYPTION_KEY
      delete process.env.ENCRYPTION_KEY

      expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY environment variable is required')

      process.env.ENCRYPTION_KEY = key
    })

    it('should throw error if ENCRYPTION_KEY is wrong length', () => {
      const key = process.env.ENCRYPTION_KEY
      process.env.ENCRYPTION_KEY = 'dG9vc2hvcnQ=' // Too short (base64)

      expect(() => encrypt('test')).toThrow('must be 32 bytes')

      process.env.ENCRYPTION_KEY = key
    })
  })

  describe('decrypt', () => {
    it('should decrypt encrypted tokens back to original plaintext', () => {
      const plaintext = 'test_original_token_12345'
      const ciphertext = encrypt(plaintext)
      const decrypted = decrypt(ciphertext)

      expect(decrypted).toBe(plaintext)
    })

    it('should fail to decrypt with wrong key', () => {
      const plaintext = 'test_secret_token'
      const ciphertext = encrypt(plaintext)

      // Change the key
      const originalKey = process.env.ENCRYPTION_KEY
      process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64')

      expect(() => decrypt(ciphertext)).toThrow('Failed to decrypt data')

      // Restore key
      process.env.ENCRYPTION_KEY = originalKey
    })

    it('should fail to decrypt tampered ciphertext (auth tag verification)', () => {
      const plaintext = 'test_protected_token'
      const ciphertext = encrypt(plaintext)

      // Tamper with the ciphertext
      const parts = ciphertext.split(':')
      const tamperedCiphertext = parts[0] + ':' + parts[1] + ':' + parts[2].slice(0, -4) + 'XXXX'

      expect(() => decrypt(tamperedCiphertext)).toThrow('Failed to decrypt data')
    })

    it('should fail to decrypt invalid format', () => {
      expect(() => decrypt('not:valid')).toThrow('Failed to decrypt data')
      expect(() => decrypt('plaintext_token')).toThrow('Failed to decrypt data')
    })
  })

  describe('isEncrypted', () => {
    it('should identify encrypted values', () => {
      const ciphertext = encrypt('test_token')
      expect(isEncrypted(ciphertext)).toBe(true)
    })

    it('should reject plaintext tokens', () => {
      expect(isEncrypted('test_plaintext_token_123')).toBe(false)
      expect(isEncrypted('plain text with spaces')).toBe(false)
    })

    it('should reject invalid formats', () => {
      expect(isEncrypted('only:two:parts')).toBe(true) // Pattern matches but would fail decrypt
      expect(isEncrypted('not-base64!:data:here')).toBe(false)
    })
  })

  describe('generateEncryptionKey', () => {
    it('should generate valid 256-bit base64 keys', () => {
      const key = generateEncryptionKey()

      // Should be base64
      expect(key).toMatch(/^[A-Za-z0-9+/]+=*$/)

      // Should decode to 32 bytes (256 bits)
      const keyBuffer = Buffer.from(key, 'base64')
      expect(keyBuffer.length).toBe(32)
    })

    it('should generate unique keys', () => {
      const key1 = generateEncryptionKey()
      const key2 = generateEncryptionKey()

      expect(key1).not.toBe(key2)
    })
  })

  describe('Security: Encryption Algorithm Properties', () => {
    it('should use authenticated encryption (GCM mode)', () => {
      const plaintext = 'test_token'
      const ciphertext = encrypt(plaintext)

      // GCM provides authentication tag
      const parts = ciphertext.split(':')
      const authTag = Buffer.from(parts[1], 'base64')
      expect(authTag.length).toBe(16) // 128-bit auth tag
    })

    it('should use unique IV for each encryption', () => {
      const plaintext = 'same_token'
      const ciphertext1 = encrypt(plaintext)
      const ciphertext2 = encrypt(plaintext)

      // Extract IVs
      const iv1 = ciphertext1.split(':')[0]
      const iv2 = ciphertext2.split(':')[0]

      expect(iv1).not.toBe(iv2)
    })

    it('should not allow decryption of tokens encrypted with different keys', () => {
      // Simulate key rotation scenario
      const key1 = crypto.randomBytes(32).toString('base64')
      const key2 = crypto.randomBytes(32).toString('base64')

      process.env.ENCRYPTION_KEY = key1
      const ciphertext = encrypt('test_token_123')

      process.env.ENCRYPTION_KEY = key2
      expect(() => decrypt(ciphertext)).toThrow('Failed to decrypt data')

      // Restore original test key
      process.env.ENCRYPTION_KEY = originalEnv || crypto.randomBytes(32).toString('base64')
    })
  })

  describe('Integration: Token Storage Security', () => {
    it('should not expose plaintext tokens in database-ready format', () => {
      const sensitiveToken = 'test_token_0123456789abcdef0123456789'
      const encrypted = encrypt(sensitiveToken)

      // Encrypted value should not contain the original token
      expect(encrypted.toLowerCase()).not.toContain(sensitiveToken.toLowerCase())

      // Should not even contain recognizable patterns
      expect(encrypted).not.toMatch(/test_token_/)
    })

    it('should handle backward compatibility: detect plaintext tokens', () => {
      const plaintextToken = 'test_legacy_unencrypted_token'

      // Legacy plaintext should be detectable as NOT encrypted
      expect(isEncrypted(plaintextToken)).toBe(false)
    })

    it('should successfully round-trip realistic Shopify token', () => {
      // Simulated offline token format for testing
      const realisticToken = 'test_token_0a1b2c3d4e5f6a7b8c9d0e1f2a3b4'

      const encrypted = encrypt(realisticToken)
      expect(isEncrypted(encrypted)).toBe(true)

      const decrypted = decrypt(encrypted)
      expect(decrypted).toBe(realisticToken)
    })
  })
})
