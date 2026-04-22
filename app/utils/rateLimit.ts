/**
 * SECURITY: Rate limiting to prevent abuse.
 *
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * are set (required for Vercel serverless where each invocation has its own
 * process — an in-memory store resets on every cold start and can be trivially
 * bypassed by distributing requests across Lambda instances).
 *
 * Falls back to in-memory when Redis is not configured (local dev / CI).
 */

import { Redis } from '@upstash/redis'

export interface RateLimitConfig {
  windowMs: number   // Time window in milliseconds
  maxRequests: number // Maximum requests per window
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetTime: number
}

// ---------------------------------------------------------------------------
// Redis backend (production)
// ---------------------------------------------------------------------------

let redis: Redis | null = null

if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
}

async function checkRateLimitRedis(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const key = `rl:${identifier}`
  const windowSec = Math.ceil(config.windowMs / 1000)
  const now = Date.now()

  // Atomic increment + set expiry if new key
  const count = await redis!.incr(key)
  if (count === 1) {
    await redis!.expire(key, windowSec)
  }

  // Approximate reset time (may be off by up to 1s — acceptable)
  const ttl = await redis!.ttl(key)
  const resetTime = now + (ttl > 0 ? ttl * 1000 : config.windowMs)

  if (count > config.maxRequests) {
    return {
      allowed: false,
      limit: config.maxRequests,
      remaining: 0,
      resetTime,
    }
  }

  return {
    allowed: true,
    limit: config.maxRequests,
    remaining: config.maxRequests - count,
    resetTime,
  }
}

// ---------------------------------------------------------------------------
// In-memory backend (local dev / CI — single process only)
// ---------------------------------------------------------------------------

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

function checkRateLimitMemory(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitStore.get(identifier)

  if (!entry || entry.resetTime < now) {
    const resetTime = now + config.windowMs
    rateLimitStore.set(identifier, { count: 1, resetTime })
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      resetTime,
    }
  }

  entry.count++

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  if (redis) {
    return checkRateLimitRedis(identifier, config)
  }
  return checkRateLimitMemory(identifier, config)
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
