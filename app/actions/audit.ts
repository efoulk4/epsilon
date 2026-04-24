'use server'

import { chromium } from 'playwright-core'
import chromiumPkg from '@sparticuz/chromium'
import type { AuditResult, AuditError, ImpactLevel } from '@/types/audit'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { calculateHealthScore } from '@/app/utils/healthScore'
import { requireVerifiedShop } from '@/app/utils/auth'
import { validateShopifyStoreURL } from '@/app/utils/ssrf-protection'
import { checkRateLimit, RATE_LIMITS } from '@/app/utils/rateLimit'

export async function runAccessibilityAuditForShop(idToken?: string): Promise<AuditResult | AuditError> {
  try {
    // SECURITY: Get verified shop from server-side auth, not client params
    const shop = await requireVerifiedShop(idToken)

    // SECURITY: Rate limiting - prevent audit spam (expensive operation)
    const rateLimit = await checkRateLimit(`audit:${shop}`, RATE_LIMITS.audit)
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

/**
 * Audit any public URL — for use in the non-embedded (standalone) version.
 * SSRF protection validates the URL before any outbound request is made.
 * Not bound to a Shopify shop, so results are not persisted to history.
 */
export async function runAccessibilityAuditForURL(url: string): Promise<AuditResult | AuditError> {
  if (!url || typeof url !== 'string') {
    return { error: 'Invalid URL', details: 'A URL is required' }
  }

  const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`

  // Rate limit by target domain — prevents hammering Chromium from the public endpoint.
  // Uses the same shared store as the embedded audit limiter.
  let domain = 'unknown'
  try {
    domain = new URL(normalized).hostname
  } catch {
    return { error: 'Invalid URL', details: 'Could not parse URL' }
  }

  const rateLimit = await checkRateLimit(`public-audit:${domain}`, {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5,            // 5 audits per domain per hour
  })

  if (!rateLimit.allowed) {
    return {
      error: 'Rate limit exceeded',
      details: `Too many audits for this URL. Please try again after ${new Date(rateLimit.resetTime).toLocaleTimeString()}`,
    }
  }

  return runAccessibilityAudit(normalized)
}

/**
 * SECURITY CRITICAL: Internal-only function - NOT exported to client
 * This function launches expensive Chromium browser instances
 * ONLY callable from verified server-side code paths
 */
async function runAccessibilityAudit(
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

    // Navigate to the URL with timeout.
    // Use 'domcontentloaded' rather than 'networkidle' — many stores never reach
    // networkidle due to analytics, chat widgets, and other persistent connections.
    // Axe only needs the DOM to be ready, not all network activity to cease.
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    })

    // Give JS-rendered content a moment to settle after DOM load
    await page.waitForTimeout(2000)

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

    // Detect images with generic/non-descriptive alt text
    // Axe only flags missing alt text — it doesn't catch "product image", "photo", etc.
    const genericAltImages = await page.evaluate(() => {
      const GENERIC_PATTERNS = [
        /^image$/i,
        /^photo$/i,
        /^picture$/i,
        /^img$/i,
        /^graphic$/i,
        /^icon$/i,
        /^logo$/i,
        /^banner$/i,
        /^thumbnail$/i,
        /^placeholder$/i,
        /^untitled$/i,
        /^image \d+$/i,
        /^photo \d+$/i,
        /^product image$/i,
        /^product photo$/i,
        /^product picture$/i,
        /^shop image$/i,
        /^store image$/i,
        /^\d+$/,
        /^dsc\d+$/i,
        /^img\d+$/i,
        /^screenshot$/i,
        /^image \d+ of \d+$/i,
      ]

      const results: { html: string; target: string[]; alt: string; src: string }[] = []
      const imgs = document.querySelectorAll('img[alt]')

      imgs.forEach((img, index) => {
        const alt = (img as HTMLImageElement).alt.trim()
        const src = (img as HTMLImageElement).src || ''

        if (!alt) return // Axe already catches missing alt

        const isGeneric = GENERIC_PATTERNS.some((pattern) => pattern.test(alt))
        if (!isGeneric) return

        // Build a CSS selector for this element
        const id = img.id ? `#${img.id}` : ''
        const classes = img.className ? `.${img.className.trim().split(/\s+/).join('.')}` : ''
        const selector = id || classes || `img:nth-of-type(${index + 1})`

        results.push({
          html: img.outerHTML.slice(0, 300),
          target: [selector],
          alt,
          src,
        })
      })

      return results
    })

    // Inject generic alt text findings as a synthetic violation
    if (genericAltImages.length > 0) {
      violations.push({
        id: 'generic-alt-text',
        impact: 'serious',
        description: 'Images have generic or non-descriptive alt text that does not convey the image content to screen reader users.',
        help: 'Images must have descriptive alt text',
        helpUrl: 'https://www.w3.org/WAI/tutorials/images/decorative/',
        nodes: genericAltImages.map((img) => ({
          html: img.html,
          target: img.target,
          failureSummary: `Fix any of the following: Image alt text is generic ("${img.alt}"). Replace with a description of what the image shows.`,
          // Carry src through for AI generation — stripped later when saving to DB
          _imageSrc: img.src,
          _genericAlt: img.alt,
        })),
      })
    }

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
        ...(node._imageSrc ? { _imageSrc: node._imageSrc } : {}),
        ...(node._genericAlt ? { _genericAlt: node._genericAlt } : {}),
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
      console.error('[saveAuditToDatabase] Database error:', error.message, error.code, error.details, error.hint)
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
  days: number = 30,
  idToken?: string
): Promise<AuditResult[]> {
  if (!isSupabaseConfigured) {
    console.warn('Supabase not configured. Cannot fetch audit history.')
    return []
  }

  try {
    // SECURITY: Get verified shop - only show audits for this tenant
    const shop = await requireVerifiedShop(idToken)

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
      console.error('[getAuditHistory] Database error:', error.message, error.code, error.details, error.hint)
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
