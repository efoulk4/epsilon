/**
 * SECURITY: Rate limiting to prevent abuse
 * Uses in-memory storage (suitable for single instance)
 * For production multi-instance deployments, use Redis or similar
 */

interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

export interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetTime: number
}

/**
 * Check if a request is allowed based on rate limits
 * @param identifier Unique identifier (shop domain, IP address, etc.)
 * @param config Rate limit configuration
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitStore.get(identifier)

  // No entry or expired entry - create new
  if (!entry || entry.resetTime < now) {
    const resetTime = now + config.windowMs
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime,
    })
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      resetTime,
    }
  }

  // Entry exists and not expired - increment count
  entry.count++

  // Check if limit exceeded
  if (entry.count > config.maxRequests) {
    return {
      allowed: false,
      limit: config.maxRequests,
      remaining: 0,
      resetTime: entry.resetTime,
    }
  }

  return {
    allowed: true,
    limit: config.maxRequests,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetTime,
  }
}

/**
 * Default rate limit configs for different endpoints
 */
export const RATE_LIMITS = {
  // API routes - 100 requests per minute per shop
  api: {
    windowMs: 60 * 1000,
    maxRequests: 100,
  },
  // OAuth - 10 requests per minute per shop (prevent OAuth abuse)
  oauth: {
    windowMs: 60 * 1000,
    maxRequests: 10,
  },
  // Audit execution - 10 audits per hour per shop (expensive operation)
  audit: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 10,
  },
  // AI fix generation - 30 fixes per hour per shop (expensive AI calls)
  aiFix: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 30,
  },
}
