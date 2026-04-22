/**
 * EPS-001: Tenant Authentication Security Tests
 *
 * Tests that the authentication system properly validates JWT signatures
 * and rejects forged tokens and spoofed headers.
 */

import { getVerifiedShop, requireVerifiedShop } from '@/app/utils/auth'
import { isValidShopDomain } from '@/app/utils/validation'

// Mock Next.js headers
jest.mock('next/headers', () => ({
  headers: jest.fn(),
}))

// Mock Shopify API
jest.mock('@shopify/shopify-api', () => ({
  shopifyApi: jest.fn(() => ({
    session: {
      decodeSessionToken: jest.fn(),
    },
  })),
  ApiVersion: {
    October24: '2024-10',
  },
}))

const { headers } = require('next/headers')
const { shopifyApi } = require('@shopify/shopify-api')

describe('EPS-001: Authentication Security', () => {
  let mockShopifyInstance: any

  beforeEach(() => {
    jest.clearAllMocks()
    mockShopifyInstance = shopifyApi()
  })

  describe('getVerifiedShop', () => {
    it('should reject requests with no Authorization header', async () => {
      headers.mockResolvedValue({
        get: jest.fn().mockReturnValue(null),
      })

      const shop = await getVerifiedShop()
      expect(shop).toBeNull()
    })

    it('should reject requests with malformed Authorization header', async () => {
      headers.mockResolvedValue({
        get: jest.fn().mockReturnValue('InvalidFormat'),
      })

      const shop = await getVerifiedShop()
      expect(shop).toBeNull()
    })

    it('should reject forged JWTs with invalid signatures', async () => {
      const forgedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkZXN0IjoiaHR0cHM6Ly9ldmlsLm15c2hvcGlmeS5jb20iLCJleHAiOjk5OTk5OTk5OTl9.FORGED_SIGNATURE'

      headers.mockResolvedValue({
        get: jest.fn().mockReturnValue(`Bearer ${forgedToken}`),
      })

      // Shopify's decodeSessionToken throws on invalid signature
      mockShopifyInstance.session.decodeSessionToken.mockRejectedValue(
        new Error('JWT signature verification failed')
      )

      const shop = await getVerifiedShop()
      expect(shop).toBeNull()
      expect(mockShopifyInstance.session.decodeSessionToken).toHaveBeenCalledWith(forgedToken)
    })

    it('should reject expired tokens', async () => {
      const expiredToken = 'valid.jwt.token'

      headers.mockResolvedValue({
        get: jest.fn().mockReturnValue(`Bearer ${expiredToken}`),
      })

      // Token with expired timestamp
      mockShopifyInstance.session.decodeSessionToken.mockResolvedValue({
        dest: 'https://test-shop.myshopify.com',
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      })

      const shop = await getVerifiedShop()
      expect(shop).toBeNull()
    })

    it('should reject tokens with invalid shop domain format', async () => {
      const validToken = 'valid.jwt.token'

      headers.mockResolvedValue({
        get: jest.fn().mockReturnValue(`Bearer ${validToken}`),
      })

      mockShopifyInstance.session.decodeSessionToken.mockResolvedValue({
        dest: 'https://not-a-shopify-domain.com', // Invalid domain
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      const shop = await getVerifiedShop()
      expect(shop).toBeNull()
    })

    it('should accept valid tokens with correct signature and expiry', async () => {
      const validToken = 'valid.jwt.token'
      const expectedShop = 'test-shop.myshopify.com'

      headers.mockResolvedValue({
        get: jest.fn().mockReturnValue(`Bearer ${validToken}`),
      })

      mockShopifyInstance.session.decodeSessionToken.mockResolvedValue({
        dest: `https://${expectedShop}`,
        exp: Math.floor(Date.now() / 1000) + 3600, // Valid for 1 hour
      })

      const shop = await getVerifiedShop()
      expect(shop).toBe(expectedShop)
      expect(mockShopifyInstance.session.decodeSessionToken).toHaveBeenCalledWith(validToken)
    })

    it('should NOT accept x-shopify-shop-domain header as fallback', async () => {
      // This test ensures the vulnerability is fixed - no header fallback
      headers.mockResolvedValue({
        get: jest.fn((headerName: string) => {
          if (headerName === 'authorization') return null
          if (headerName === 'x-shopify-shop-domain') return 'attacker-shop.myshopify.com'
          return null
        }),
      })

      const shop = await getVerifiedShop()
      expect(shop).toBeNull()

      // Verify JWT verification was NOT bypassed
      expect(mockShopifyInstance.session.decodeSessionToken).not.toHaveBeenCalled()
    })
  })

  describe('requireVerifiedShop', () => {
    it('should throw error when shop verification fails', async () => {
      headers.mockResolvedValue({
        get: jest.fn().mockReturnValue(null),
      })

      await expect(requireVerifiedShop()).rejects.toThrow('Unauthorized')
    })

    it('should return shop when verification succeeds', async () => {
      const expectedShop = 'verified-shop.myshopify.com'

      headers.mockResolvedValue({
        get: jest.fn().mockReturnValue('Bearer valid.token'),
      })

      mockShopifyInstance.session.decodeSessionToken.mockResolvedValue({
        dest: `https://${expectedShop}`,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })

      const shop = await requireVerifiedShop()
      expect(shop).toBe(expectedShop)
    })
  })

  describe('isValidShopDomain', () => {
    it('should accept valid .myshopify.com domains', () => {
      expect(isValidShopDomain('test-shop.myshopify.com')).toBe(true)
      expect(isValidShopDomain('another-store.myshopify.com')).toBe(true)
    })

    it('should reject non-Shopify domains', () => {
      expect(isValidShopDomain('evil.com')).toBe(false)
      expect(isValidShopDomain('fake-myshopify.com')).toBe(false)
      expect(isValidShopDomain('myshopify.com.evil.com')).toBe(false)
    })

    it('should reject domains with path traversal attempts', () => {
      expect(isValidShopDomain('../../../etc/passwd')).toBe(false)
      expect(isValidShopDomain('shop/../attacker.com')).toBe(false)
    })
  })

  describe('Security: Fail-Closed Behavior', () => {
    it('should return null on any unexpected error during verification', async () => {
      headers.mockResolvedValue({
        get: jest.fn().mockReturnValue('Bearer valid.token'),
      })

      // Simulate unexpected error
      mockShopifyInstance.session.decodeSessionToken.mockRejectedValue(
        new Error('Network error')
      )

      const shop = await getVerifiedShop()
      expect(shop).toBeNull() // Fail closed, not throwing
    })

    it('should not expose error details in logs (no sensitive data leakage)', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      headers.mockResolvedValue({
        get: jest.fn().mockReturnValue('Bearer sensitive.token'),
      })

      mockShopifyInstance.session.decodeSessionToken.mockRejectedValue(
        new Error('Signature mismatch')
      )

      await getVerifiedShop()

      // Verify error was logged but token itself was not
      expect(consoleSpy).toHaveBeenCalled()
      const loggedMessages = consoleSpy.mock.calls.map(call => call.join(' '))
      expect(loggedMessages.some(msg => msg.includes('sensitive.token'))).toBe(false)

      consoleSpy.mockRestore()
    })
  })
})
