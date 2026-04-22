import crypto from 'crypto'

/**
 * SECURITY: Encrypt/decrypt utilities for sensitive data at rest
 * Uses AES-256-GCM for authenticated encryption
 */

// Fail loudly at module load time rather than silently mid-request.
// This surfaces misconfiguration immediately on startup / first import.
if (typeof process !== 'undefined' && !process.env.ENCRYPTION_KEY) {
  throw new Error(
    'ENCRYPTION_KEY environment variable is required. ' +
    'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
  )
}

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // For GCM mode
const AUTH_TAG_LENGTH = 16
const KEY_LENGTH = 32 // 256 bits

/**
 * Get encryption key from environment
 * CRITICAL: This must be a secure random key, not exposed to clients
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY

  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required for token encryption')
  }

  // Key should be base64-encoded 256-bit key
  try {
    const keyBuffer = Buffer.from(key, 'base64')
    if (keyBuffer.length !== KEY_LENGTH) {
      throw new Error(`ENCRYPTION_KEY must be ${KEY_LENGTH} bytes (256 bits) when decoded`)
    }
    return keyBuffer
  } catch (error) {
    throw new Error('ENCRYPTION_KEY must be a valid base64-encoded 256-bit key')
  }
}

/**
 * Encrypt sensitive data (e.g., access tokens)
 * Returns base64-encoded ciphertext with IV and auth tag
 */
export function encrypt(plaintext: string): string {
  try {
    const key = getEncryptionKey()
    const iv = crypto.randomBytes(IV_LENGTH)

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    let encrypted = cipher.update(plaintext, 'utf8', 'base64')
    encrypted += cipher.final('base64')

    const authTag = cipher.getAuthTag()

    // Format: iv:authTag:ciphertext (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
  } catch (error) {
    console.error('[encrypt] Encryption failed:', error instanceof Error ? error.message : 'Unknown error')
    throw new Error('Failed to encrypt data')
  }
}

/**
 * Decrypt data encrypted with encrypt()
 * Returns original plaintext
 */
export function decrypt(ciphertext: string): string {
  try {
    const key = getEncryptionKey()

    const parts = ciphertext.split(':')
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format')
    }

    const iv = Buffer.from(parts[0], 'base64')
    const authTag = Buffer.from(parts[1], 'base64')
    const encrypted = parts[2]

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encrypted, 'base64', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  } catch (error) {
    console.error('[decrypt] Decryption failed:', error instanceof Error ? error.message : 'Unknown error')
    throw new Error('Failed to decrypt data - may be corrupted or tampered with')
  }
}

/**
 * Check if a value looks like encrypted data (has our format)
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  return parts.length === 3 &&
         parts.every(part => /^[A-Za-z0-9+/]+=*$/.test(part)) // base64 pattern
}

/**
 * Generate a new encryption key (for setup/rotation)
 * Print this to console and add to .env as ENCRYPTION_KEY
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('base64')
}
