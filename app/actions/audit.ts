'use server'

import { chromium } from 'playwright-core'
import chromiumPkg from '@sparticuz/chromium'
import type { AuditResult, AuditError, ImpactLevel } from '@/types/audit'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { calculateHealthScore } from '@/app/utils/healthScore'
import { requireVerifiedShop } from '@/app/utils/auth'
import { validateShopifyStoreURL } from '@/app/utils/ssrf-protection'
import { checkRateLimit, RATE_LIMITS } from '@/app/utils/rateLimit'

export async function runAccessibilityAuditForShop(): Promise<AuditResult | AuditError> {
  try {
    // SECURITY: Get verified shop from server-side auth, not client params
    const shop = await requireVerifiedShop()

    // SECURITY: Rate limiting - prevent audit spam (expensive operation)
    const rateLimit = checkRateLimit(`audit:${shop}`, RATE_LIMITS.audit)
    if (!rateLimit.allowed) {
      return {
        error: 'Rate limit exceeded',
        details: `Too many audits. Please try again after ${new Date(rateLimit.resetTime).toLocaleTimeString()}`,
      }
    }

    // SECURITY: Validate the shop URL before making outbound request
    const validation = await validateShopifyStoreURL(shop)
    if (!validation.allowed) {
      return {
        error: 'Invalid shop URL',
        details: validation.error || 'URL validation failed',
      }
    }

    const storeUrl = `https://${shop}`

    console.log(`[runAccessibilityAuditForShop] Auditing verified shop at URL: ${storeUrl}`)

    // Run the audit and bind it to the verified shop
    const result = await runAccessibilityAudit(storeUrl, shop)
    return result
  } catch (error) {
    console.error('Error running audit for shop:', error)
    return {
      error: 'Failed to run audit for shop',
      details: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function runAccessibilityAudit(
  url: string,
  shop?: string
): Promise<AuditResult | AuditError> {
  let browser = null

  try {
    // SECURITY: Validate URL to prevent SSRF
    const { validateURL } = await import('@/app/utils/ssrf-protection')
    const validation = await validateURL(url)

    if (!validation.allowed) {
      return {
        error: 'URL validation failed',
        details: validation.error || 'Invalid or blocked URL',
      }
    }

    // Launch headless Chromium browser
    // Use serverless-optimized chromium in production
    const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

    browser = await chromium.launch({
      args: isProduction ? chromiumPkg.args : [
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
      executablePath: isProduction ? await chromiumPkg.executablePath() : undefined,
      headless: true,
    })

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })

    const page = await context.newPage()

    // SECURITY: Intercept requests to prevent SSRF via redirects
    await page.route('**/*', async (route) => {
      const requestUrl = route.request().url()

      // Validate every request (including redirects)
      const { validateURL } = await import('@/app/utils/ssrf-protection')
      const validation = await validateURL(requestUrl)

      if (!validation.allowed) {
        console.error('[SSRF Protection] Blocked request to:', requestUrl)
        await route.abort('blockedbyclient')
      } else {
        await route.continue()
      }
    })

    // Navigate to the URL with timeout
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    // Inject axe-core from CDN
    await page.addScriptTag({
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js',
    })

    // Wait for axe to be available
    await page.waitForFunction(() => typeof (window as any).axe !== 'undefined')

    // Run Axe accessibility scan targeting WCAG 2.1 Level A and AA
    const axeResults = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        // @ts-ignore - axe is injected into the page
        window.axe.run(
          {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
            },
          },
          (err: Error, results: any) => {
            if (err) throw err
            resolve(results)
          }
        )
      })
    }) as any

    const violations = axeResults.violations

    // Count violations by impact level
    const violationsByImpact = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    }

    violations.forEach((violation: any) => {
      const impact = violation.impact as ImpactLevel
      if (impact && violationsByImpact[impact] !== undefined) {
        violationsByImpact[impact]++
      }
    })

    // Transform violations to match our type structure
    const transformedViolations = violations.map((violation: any) => ({
      id: violation.id,
      impact: (violation.impact || 'minor') as ImpactLevel,
      description: violation.description,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node: any) => ({
        html: node.html,
        target: node.target,
        failureSummary: node.failureSummary || 'No summary available',
      })),
    }))

    // Sort violations by impact (critical first)
    const impactOrder: Record<ImpactLevel, number> = {
      critical: 0,
      serious: 1,
      moderate: 2,
      minor: 3,
    }

    transformedViolations.sort(
      (a: any, b: any) => impactOrder[a.impact as ImpactLevel] - impactOrder[b.impact as ImpactLevel]
    )

    // Build the audit result
    const result: AuditResult = {
      url,
      timestamp: new Date().toISOString(),
      totalViolations: violations.length,
      violations: transformedViolations,
      violationsByImpact,
    }

    // SECURITY: Auto-save with tenant binding if shop is provided
    if (shop) {
      await saveAuditToDatabase(result, shop)
    }

    return result
  } catch (error) {
    console.error('Audit error:', error)

    if (error instanceof Error) {
      return {
        error: 'Audit failed',
        details: error.message,
      }
    }

    return {
      error: 'Unknown error occurred during audit',
    }
  } finally {
    // CRITICAL: Always close the browser to prevent memory leaks
    if (browser) {
      await browser.close()
    }
  }
}

/**
 * SECURITY: Internal-only function - NOT exported to client
 * Saves audit with verified shop binding
 * Shop parameter comes from verified server-side auth only
 */
async function saveAuditToDatabase(
  auditResult: AuditResult,
  shop: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!isSupabaseConfigured) {
    console.warn('Supabase not configured. Skipping database save.')
    return { success: false, error: 'Supabase not configured' }
  }

  try {
    const healthScore = calculateHealthScore(auditResult)
    const supabaseAdmin = getSupabaseAdmin()

    // SECURITY: Always bind audit to shop for tenant isolation
    const { data, error} = await supabaseAdmin
      .from('audits')
      .insert({
        shop, // CRITICAL: Tenant binding
        url: auditResult.url,
        timestamp: auditResult.timestamp,
        total_violations: auditResult.totalViolations,
        violations: auditResult.violations,
        violations_by_impact: auditResult.violationsByImpact,
        health_score: healthScore,
      })
      .select()

    if (error) {
      console.error('[saveAuditToDatabase] Database error')
      return { success: false, error: error.message }
    }

    console.log('[saveAuditToDatabase] Audit saved successfully')
    return { success: true, id: data[0]?.id }
  } catch (error) {
    console.error('[saveAuditToDatabase] Unexpected error')
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function getAuditHistory(
  url: string,
  days: number = 30
): Promise<AuditResult[]> {
  if (!isSupabaseConfigured) {
    console.warn('Supabase not configured. Cannot fetch audit history.')
    return []
  }

  try {
    // SECURITY: Get verified shop - only show audits for this tenant
    const shop = await requireVerifiedShop()

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const supabaseAdmin = getSupabaseAdmin()

    // SECURITY: Filter by shop FIRST, then by URL
    // This prevents cross-tenant data exposure
    const { data, error } = await supabaseAdmin
      .from('audits')
      .select('*')
      .eq('shop', shop) // CRITICAL: Tenant isolation
      .eq('url', url)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[getAuditHistory] Database error')
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
    console.error('[getAuditHistory] Unauthorized or error:', error)
    return []
  }
}
