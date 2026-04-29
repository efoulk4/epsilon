/**
 * EPS-003: Audit Protection Security Tests
 *
 * Tests that unauthenticated users cannot launch expensive browser audits
 * and that audits are properly scoped to verified tenants.
 */

import { runAccessibilityAuditForShop, getAuditHistory } from '@/app/actions/audit'

// Mock auth module
jest.mock('@/app/utils/auth', () => ({
  requireVerifiedShop: jest.fn(),
}))

// Mock SSRF protection
jest.mock('@/app/utils/ssrf-protection', () => ({
  validateShopifyStoreURL: jest.fn(),
  validateURL: jest.fn(),
}))

// Mock rate limiting
jest.mock('@/app/utils/rateLimit', () => ({
  checkRateLimit: jest.fn(),
  RATE_LIMITS: {
    audit: { maxRequests: 10, windowMs: 60000 },
    oauth: { maxRequests: 5, windowMs: 300000 },
  },
}))

// Mock Supabase
jest.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: jest.fn(),
  isSupabaseConfigured: true,
}))

// Mock Playwright (expensive operation we want to prevent)
jest.mock('playwright-core', () => ({
  chromium: {
    launch: jest.fn(),
  },
}))

const { requireVerifiedShop } = require('@/app/utils/auth')
const { validateShopifyStoreURL, validateURL } = require('@/app/utils/ssrf-protection')
const { checkRateLimit } = require('@/app/utils/rateLimit')
const { chromium } = require('playwright-core')

describe('EPS-003: Audit Protection Security', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Setup default mocks
    validateURL.mockResolvedValue({ allowed: true })
  })

  describe('runAccessibilityAuditForShop', () => {
    it('should require authenticated shop before launching audit', async () => {
      // Simulate unauthenticated request
      requireVerifiedShop.mockRejectedValue(new Error('Unauthorized'))

      const result = await runAccessibilityAuditForShop()

      expect(result).toHaveProperty('error')
      expect((result as any).error).toContain('Failed to run audit for shop')

      // CRITICAL: Verify expensive browser was NOT launched
      expect(chromium.launch).not.toHaveBeenCalled()
    })

    it('should enforce rate limiting to prevent audit spam', async () => {
      const verifiedShop = 'test-shop.myshopify.com'
      requireVerifiedShop.mockResolvedValue(verifiedShop)

      // Simulate rate limit exceeded
      checkRateLimit.mockReturnValue({
        allowed: false,
        resetTime: Date.now() + 60000,
      })

      const result = await runAccessibilityAuditForShop()

      expect(result).toHaveProperty('error', 'Rate limit exceeded')
      expect((result as any).details).toContain('Too many audits')

      // CRITICAL: Verify expensive browser was NOT launched
      expect(chromium.launch).not.toHaveBeenCalled()
    })

    it('should validate shop URL before making outbound request', async () => {
      const verifiedShop = 'test-shop.myshopify.com'
      requireVerifiedShop.mockResolvedValue(verifiedShop)
      checkRateLimit.mockReturnValue({ allowed: true })

      // Simulate SSRF protection blocking the URL
      validateShopifyStoreURL.mockResolvedValue({
        allowed: false,
        error: 'Invalid shop domain',
      })

      const result = await runAccessibilityAuditForShop()

      expect(result).toHaveProperty('error', 'Invalid shop URL')

      // CRITICAL: Verify expensive browser was NOT launched
      expect(chromium.launch).not.toHaveBeenCalled()
    })

    it('should only allow audits for verified shop, not arbitrary URLs', async () => {
      const verifiedShop = 'verified-shop.myshopify.com'
      requireVerifiedShop.mockResolvedValue(verifiedShop)
      checkRateLimit.mockReturnValue({ allowed: true })
      validateShopifyStoreURL.mockResolvedValue({ allowed: true })

      // The audit should be for the VERIFIED shop, not any user-supplied URL
      // This is tested by verifying the shop passed to validation matches the verified shop

      await runAccessibilityAuditForShop()

      expect(validateShopifyStoreURL).toHaveBeenCalledWith(verifiedShop)
    })
  })

  describe('getAuditHistory', () => {
    it('should require authenticated shop before returning history', async () => {
      requireVerifiedShop.mockRejectedValue(new Error('Unauthorized'))

      const history = await getAuditHistory('https://any-url.com')

      // Should return empty array, not throw or leak data
      expect(history).toEqual([])
    })

    it('should only return audits for the verified shop (tenant isolation)', async () => {
      const verifiedShop = 'tenant-a.myshopify.com'
      requireVerifiedShop.mockResolvedValue(verifiedShop)

      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({
          data: [
            {
              url: 'https://tenant-a.myshopify.com',
              timestamp: '2024-01-01T00:00:00Z',
              total_violations: 5,
              violations: [],
              violations_by_impact: {},
            },
          ],
          error: null,
        }),
      }

      const { getSupabaseAdmin } = require('@/lib/supabase')
      getSupabaseAdmin.mockReturnValue(mockSupabase)

      await getAuditHistory('https://tenant-a.myshopify.com')

      // CRITICAL: Verify shop filter is applied BEFORE url filter
      const eqCalls = mockSupabase.eq.mock.calls
      expect(eqCalls[0]).toEqual(['shop', verifiedShop]) // Shop filter FIRST
      expect(eqCalls[1][0]).toBe('url') // URL filter SECOND
    })
  })

  describe('Security: Arbitrary URL Audit Prevention', () => {
    it('should NOT export runAccessibilityAudit function to client', () => {
      // The internal runAccessibilityAudit function should not be exported
      const auditModule = require('@/app/actions/audit')

      // Only runAccessibilityAuditForShop should be exported
      expect(auditModule.runAccessibilityAuditForShop).toBeDefined()
      expect(auditModule.runAccessibilityAudit).toBeUndefined()
    })

    it('should prevent unauthenticated users from launching Chromium instances', async () => {
      requireVerifiedShop.mockRejectedValue(new Error('Unauthorized'))

      await runAccessibilityAuditForShop()

      // CRITICAL: Chromium should NEVER be launched without authentication
      expect(chromium.launch).not.toHaveBeenCalled()
    })

    it('should bind all audits to verified shop for tenant isolation', async () => {
      const verifiedShop = 'secure-shop.myshopify.com'
      requireVerifiedShop.mockResolvedValue(verifiedShop)
      checkRateLimit.mockReturnValue({ allowed: true })
      validateShopifyStoreURL.mockResolvedValue({ allowed: true })

      // Mock Playwright browser
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue({
          newPage: jest.fn().mockResolvedValue({
            route: jest.fn(),
            goto: jest.fn(),
            addScriptTag: jest.fn(),
            waitForFunction: jest.fn(),
            evaluate: jest.fn().mockResolvedValue({
              violations: [],
            }),
          }),
        }),
        close: jest.fn(),
      }
      chromium.launch.mockResolvedValue(mockBrowser)

      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: [{ id: '123' }],
          error: null,
        }),
      }

      const { getSupabaseAdmin } = require('@/lib/supabase')
      getSupabaseAdmin.mockReturnValue(mockSupabase)

      await runAccessibilityAuditForShop()

      // Verify audit was saved with shop binding
      expect(mockSupabase.insert).toHaveBeenCalled()
      const insertedData = mockSupabase.insert.mock.calls[0][0]
      expect(insertedData).toHaveProperty('shop', verifiedShop)
    })
  })

  describe('Security: Rate Limiting Defense', () => {
    it('should prevent audit spam from single shop', async () => {
      const verifiedShop = 'spam-shop.myshopify.com'
      requireVerifiedShop.mockResolvedValue(verifiedShop)

      checkRateLimit.mockReturnValue({
        allowed: false,
        resetTime: Date.now() + 30000,
      })

      const result = await runAccessibilityAuditForShop()

      expect((result as any).error).toBe('Rate limit exceeded')

      // Verify rate limit key includes the shop (tenant-specific)
      expect(checkRateLimit).toHaveBeenCalledWith(
        `audit:${verifiedShop}`,
        expect.any(Object)
      )
    })

    it('should allow audits after rate limit window expires', async () => {
      const verifiedShop = 'legitimate-shop.myshopify.com'
      requireVerifiedShop.mockResolvedValue(verifiedShop)
      validateShopifyStoreURL.mockResolvedValue({ allowed: true })

      // First call: rate limit allows
      checkRateLimit.mockReturnValueOnce({ allowed: true })

      // Subsequent calls would be blocked, but this test verifies the allowed case
      const mockBrowser = {
        newContext: jest.fn().mockResolvedValue({
          newPage: jest.fn().mockResolvedValue({
            route: jest.fn(),
            goto: jest.fn(),
            addScriptTag: jest.fn(),
            waitForFunction: jest.fn(),
            evaluate: jest.fn().mockResolvedValue({ violations: [] }),
          }),
        }),
        close: jest.fn(),
      }
      chromium.launch.mockResolvedValue(mockBrowser)

      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({ data: [{ id: '123' }], error: null }),
      }

      const { getSupabaseAdmin } = require('@/lib/supabase')
      getSupabaseAdmin.mockReturnValue(mockSupabase)

      const result = await runAccessibilityAuditForShop()

      // Audit should succeed when rate limit allows
      expect(result).not.toHaveProperty('error')
      expect(chromium.launch).toHaveBeenCalled()
    })
  })
})
