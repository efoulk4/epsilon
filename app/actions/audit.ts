'use server'

import { chromium } from 'playwright-core'
import chromiumPkg from '@sparticuz/chromium'
import type { AuditResult, AuditError } from '@/types/audit'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { calculateHealthScore } from '@/app/utils/healthScore'
import { requireVerifiedShop } from '@/app/utils/auth'
import { validateShopifyStoreURL } from '@/app/utils/ssrf-protection'
import { checkRateLimit } from '@/app/utils/rateLimit'
import { getShopifySession } from '@/app/utils/shopifySession'
import { discoverAndScan } from '@/app/utils/auditCore'
import type { ImpactLevel } from '@/types/audit'

const BASIC_AUDIT_LIMIT = { windowMs: 24 * 60 * 60 * 1000, maxRequests: 1 }

export async function runAccessibilityAuditForShop(idToken?: string): Promise<AuditResult | AuditError> {
  try {
    const shop = await requireVerifiedShop(idToken)

    // Check plan — honour trial period as Pro access
    const session = await getShopifySession(shop)
    const plan = session?.plan ?? 'free'
    const trialActive = session?.trial_ends_at
      ? new Date(session.trial_ends_at) > new Date()
      : false
    const effectivePlan = trialActive ? 'pro' : plan

    if (effectivePlan === 'free') {
      return {
        error: 'Upgrade required',
        details: 'Manual audits require a Basic or Pro subscription. Upgrade in the Billing tab.',
      }
    }

    // Basic: 1 per day. Pro (and trial): unlimited.
    if (effectivePlan === 'basic') {
      const rateLimit = await checkRateLimit(`audit:${shop}`, BASIC_AUDIT_LIMIT)
      if (!rateLimit.allowed) {
        return {
          error: 'Rate limit exceeded',
          details: `Basic plan allows 1 manual audit per day. Next audit available after ${new Date(rateLimit.resetTime).toLocaleTimeString()}.`,
        }
      }
    }

    const validation = await validateShopifyStoreURL(shop)
    if (!validation.allowed) {
      return {
        error: 'Invalid shop URL',
        details: validation.error || 'URL validation failed',
      }
    }

    const storeUrl = `https://${shop}`
    console.log(`[runAccessibilityAuditForShop] Auditing ${storeUrl} (plan: ${plan})`)

    // Run Playwright structural audit and API product image audit in parallel
    const [playwrightResult, productImageResult] = await Promise.all([
      runAccessibilityAudit(storeUrl),
      runProductImageAuditInternal(shop, idToken),
    ])

    if ('error' in playwrightResult) return playwrightResult

    // Merge product image violations into the structural result
    const merged = mergeProductImageViolations(playwrightResult, productImageResult)

    // Save the fully merged result so history matches what the UI shows
    await saveAuditToDatabase(merged, shop)

    return merged
  } catch (error) {
    console.error('Error running audit for shop:', error)
    return {
      error: 'Failed to run audit for shop',
      details: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function runAccessibilityAuditForURL(url: string): Promise<AuditResult | AuditError> {
  if (!url || typeof url !== 'string') {
    return { error: 'Invalid URL', details: 'A URL is required' }
  }

  const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`

  let domain = 'unknown'
  try {
    domain = new URL(normalized).hostname
  } catch {
    return { error: 'Invalid URL', details: 'Could not parse URL' }
  }

  const rateLimit = await checkRateLimit(`public-audit:${domain}`, {
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
  })

  if (!rateLimit.allowed) {
    return {
      error: 'Rate limit exceeded',
      details: `Too many audits for this URL. Please try again after ${new Date(rateLimit.resetTime).toLocaleTimeString()}`,
    }
  }

  return runAccessibilityAudit(normalized)
}

async function runAccessibilityAudit(url: string): Promise<AuditResult | AuditError> {
  let browser = null

  try {
    const { validateURL } = await import('@/app/utils/ssrf-protection')
    const rootValidation = await validateURL(url)
    if (!rootValidation.allowed) {
      return { error: 'URL validation failed', details: rootValidation.error || 'Invalid or blocked URL' }
    }

    const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

    browser = await chromium.launch({
      args: isProduction ? chromiumPkg.args : ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: isProduction ? await chromiumPkg.executablePath() : undefined,
      headless: true,
    })

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })

    return await discoverAndScan(context, url)
  } catch (error) {
    console.error('Audit error:', error)
    return error instanceof Error
      ? { error: 'Audit failed', details: error.message }
      : { error: 'Unknown error occurred during audit' }
  } finally {
    if (browser) await browser.close()
  }
}

async function runProductImageAuditInternal(
  shop: string,
  idToken?: string
): Promise<import('@/app/actions/productImageAudit').ProductAuditResult | null> {
  try {
    const { runProductImageAudit } = await import('@/app/actions/productImageAudit')
    const result = await runProductImageAudit(idToken)
    return 'error' in result ? null : result
  } catch {
    return null
  }
}

function mergeProductImageViolations(
  base: AuditResult,
  productResult: import('@/app/actions/productImageAudit').ProductAuditResult | null
): AuditResult {
  if (!productResult || productResult.violations.length === 0) return base

  const merged = { ...base }
  merged.violations = [...base.violations, ...productResult.violations]
  merged.violationsByImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  merged.violations.forEach((v) => {
    const impact = v.impact as ImpactLevel
    if (merged.violationsByImpact[impact] !== undefined) merged.violationsByImpact[impact]++
  })
  merged.totalViolations = merged.violations.length
  return merged
}

async function saveAuditToDatabase(
  auditResult: AuditResult,
  shop: string
): Promise<void> {
  if (!isSupabaseConfigured) return

  try {
    const healthScore = calculateHealthScore(auditResult)
    const supabaseAdmin = getSupabaseAdmin()

    const { error } = await supabaseAdmin.from('audits').insert({
      shop,
      url: auditResult.url,
      timestamp: auditResult.timestamp,
      total_violations: auditResult.totalViolations,
      violations: auditResult.violations,
      violations_by_impact: auditResult.violationsByImpact,
      health_score: healthScore,
    })

    if (error) {
      console.error('[saveAuditToDatabase] Error:', error.message)
    }
  } catch (error) {
    console.error('[saveAuditToDatabase] Unexpected error:', error)
  }
}

export async function getAuditHistory(
  url: string,
  days: number = 30,
  idToken?: string
): Promise<AuditResult[]> {
  if (!isSupabaseConfigured) return []

  try {
    const shop = await requireVerifiedShop(idToken)

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const supabaseAdmin = getSupabaseAdmin()

    const { data, error } = await supabaseAdmin
      .from('audits')
      .select('*')
      .eq('shop', shop)
      .eq('url', url)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[getAuditHistory] Database error:', error.message)
      return []
    }

    return (
      data?.map((row) => ({
        url: row.url,
        timestamp: row.timestamp,
        totalViolations: row.total_violations,
        violations: row.violations,
        violationsByImpact: row.violations_by_impact,
      })) || []
    )
  } catch (error) {
    console.error('[getAuditHistory] Error:', error)
    return []
  }
}

export interface ScheduledAuditNotification {
  id: string
  timestamp: string
  totalViolations: number
  violationsByImpact: { critical: number; serious: number; moderate: number; minor: number }
  violations: AuditResult['violations']
  url: string
  healthScore: number
  isNew: boolean
}

export async function getUnseenScheduledAudits(
  idToken?: string
): Promise<ScheduledAuditNotification[]> {
  if (!isSupabaseConfigured) return []

  try {
    const shop = await requireVerifiedShop(idToken)
    const supabaseAdmin = getSupabaseAdmin()

    const { data, error } = await supabaseAdmin
      .from('audits')
      .select('*')
      .eq('shop', shop)
      .eq('source', 'scheduled')
      .eq('seen', false)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[getUnseenScheduledAudits] Database error:', error.message)
      return []
    }

    return (
      data?.map((row) => ({
        id: row.id,
        url: row.url,
        timestamp: row.timestamp,
        totalViolations: row.total_violations,
        violations: row.violations,
        violationsByImpact: row.violations_by_impact,
        healthScore: row.health_score,
        isNew: true,
      })) || []
    )
  } catch (error) {
    console.error('[getUnseenScheduledAudits] Error:', error)
    return []
  }
}

export async function getScheduledAuditHistory(
  idToken?: string
): Promise<ScheduledAuditNotification[]> {
  if (!isSupabaseConfigured) return []

  try {
    const shop = await requireVerifiedShop(idToken)
    const supabaseAdmin = getSupabaseAdmin()

    const { data, error } = await supabaseAdmin
      .from('audits')
      .select('*')
      .eq('shop', shop)
      .eq('source', 'scheduled')
      .eq('seen', true)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('[getScheduledAuditHistory] Database error:', error.message)
      return []
    }

    return (
      data?.map((row) => ({
        id: row.id,
        url: row.url,
        timestamp: row.timestamp,
        totalViolations: row.total_violations,
        violations: row.violations,
        violationsByImpact: row.violations_by_impact,
        healthScore: row.health_score,
        isNew: false,
      })) || []
    )
  } catch (error) {
    console.error('[getScheduledAuditHistory] Error:', error)
    return []
  }
}

export async function markAuditSeen(auditId: string, idToken?: string): Promise<void> {
  if (!isSupabaseConfigured) return

  try {
    const shop = await requireVerifiedShop(idToken)
    const supabaseAdmin = getSupabaseAdmin()

    await supabaseAdmin
      .from('audits')
      .update({ seen: true })
      .eq('id', auditId)
      .eq('shop', shop)
  } catch (error) {
    console.error('[markAuditSeen] Error:', error)
  }
}
