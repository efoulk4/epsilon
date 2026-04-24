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

const GENERIC_ALT_PATTERNS = [
  /^image$/i, /^photo$/i, /^picture$/i, /^img$/i, /^graphic$/i,
  /^icon$/i, /^logo$/i, /^banner$/i, /^thumbnail$/i, /^placeholder$/i,
  /^untitled$/i, /^image \d+$/i, /^photo \d+$/i, /^product image$/i,
  /^product photo$/i, /^product picture$/i, /^shop image$/i,
  /^store image$/i, /^\d+$/i, /^dsc\d+$/i, /^img\d+$/i,
  /^screenshot$/i, /^image \d+ of \d+$/i,
]

/**
 * Scan a single already-navigated Playwright page with Axe and generic alt detection.
 * Returns raw violation objects tagged with pageUrl.
 */
async function scanSinglePage(page: any, pageUrl: string): Promise<any[]> {
  // Inject axe-core from CDN
  await page.addScriptTag({
    url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js',
  })
  await page.waitForFunction(() => typeof (window as any).axe !== 'undefined')

  const axeResults = await page.evaluate(() => {
    return new Promise<any>((resolve) => {
      // @ts-ignore
      window.axe.run(
        { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } },
        (err: Error, results: any) => { if (err) throw err; resolve(results) }
      )
    })
  }) as any

  const violations = axeResults.violations

  // Tag every node with the page it came from
  violations.forEach((v: any) => {
    v.nodes.forEach((n: any) => { n._pageUrl = pageUrl })
  })

  // Detect generic alt text (Axe only catches missing alt, not bad alt)
  const genericAltImages = await page.evaluate(() => {
    const PATTERNS = [
      /^image$/i, /^photo$/i, /^picture$/i, /^img$/i, /^graphic$/i,
      /^icon$/i, /^logo$/i, /^banner$/i, /^thumbnail$/i, /^placeholder$/i,
      /^untitled$/i, /^image \d+$/i, /^photo \d+$/i, /^product image$/i,
      /^product photo$/i, /^product picture$/i, /^shop image$/i,
      /^store image$/i, /^\d+$/i, /^dsc\d+$/i, /^img\d+$/i,
      /^screenshot$/i, /^image \d+ of \d+$/i,
    ]
    const results: { html: string; target: string[]; alt: string; src: string }[] = []
    document.querySelectorAll('img[alt]').forEach((img, index) => {
      const alt = (img as HTMLImageElement).alt.trim()
      const src = (img as HTMLImageElement).src || ''
      if (!alt) return
      if (!PATTERNS.some((p) => p.test(alt))) return
      const id = img.id ? `#${img.id}` : ''
      const classes = img.className ? `.${img.className.trim().split(/\s+/).join('.')}` : ''
      results.push({
        html: img.outerHTML.slice(0, 300),
        target: [id || classes || `img:nth-of-type(${index + 1})`],
        alt,
        src,
      })
    })
    return results
  })

  if (genericAltImages.length > 0) {
    violations.push({
      id: 'generic-alt-text',
      impact: 'serious',
      description: 'Images have generic or non-descriptive alt text that does not convey the image content to screen reader users.',
      help: 'Images must have descriptive alt text',
      helpUrl: 'https://www.w3.org/WAI/tutorials/images/decorative/',
      nodes: genericAltImages.map((img: any) => ({
        html: img.html,
        target: img.target,
        failureSummary: `Image alt text is generic ("${img.alt}"). Replace with a description of what the image shows.`,
        _imageSrc: img.src,
        _genericAlt: img.alt,
        _pageUrl: pageUrl,
      })),
    })
  }

  return violations
}

/**
 * Navigate to a URL within an existing browser context, applying SSRF protection
 * on every request including redirects.
 */
async function navigatePage(context: any, url: string): Promise<any> {
  const page = await context.newPage()

  await page.route('**/*', async (route: any) => {
    const { validateURL } = await import('@/app/utils/ssrf-protection')
    const validation = await validateURL(route.request().url())
    if (!validation.allowed) {
      await route.abort('blockedbyclient')
    } else {
      await route.continue()
    }
  })

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2000)
  return page
}

/**
 * Merge per-page violation arrays into a single deduplicated list.
 * Violations with the same ID are merged — their nodes are combined.
 * Each node carries a pageUrl so the UI can show where it was found.
 */
function mergeViolations(allViolations: any[][]): any[] {
  const map = new Map<string, any>()

  for (const pageViolations of allViolations) {
    for (const violation of pageViolations) {
      if (map.has(violation.id)) {
        map.get(violation.id).nodes.push(...violation.nodes)
      } else {
        map.set(violation.id, { ...violation, nodes: [...violation.nodes] })
      }
    }
  }

  return Array.from(map.values())
}

/**
 * Parse a Shopify sitemap index and return one product URL and one collection URL.
 * Shopify always generates /sitemap.xml with child sitemaps named by type.
 * We filter to root-locale sitemaps only (no /xx/ locale prefix) to avoid duplicates.
 */
async function discoverPagesFromSitemap(origin: string): Promise<{
  productUrl: string | null
  collectionUrl: string | null
}> {
  const result = { productUrl: null as string | null, collectionUrl: null as string | null }

  try {
    const sitemapRes = await fetch(`${origin}/sitemap.xml`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    })
    if (!sitemapRes.ok) return result

    const sitemapXml = await sitemapRes.text()

    // Extract all <loc> entries from the sitemap index
    const locMatches = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    const subSitemapUrls = locMatches.map((m) => m[1].trim())

    // Filter to root-locale sitemaps only — locale sitemaps look like /es/sitemap_products_1.xml
    // Root sitemaps look like /sitemap_products_1.xml (path starts directly with /sitemap_)
    const rootSitemaps = subSitemapUrls.filter((u) => {
      try {
        const path = new URL(u).pathname
        return path.startsWith('/sitemap_')
      } catch {
        return false
      }
    })

    // Find the products and collections sub-sitemaps
    const productsSitemap = rootSitemaps.find((u) => new URL(u).pathname.includes('sitemap_products'))
    const collectionsSitemap = rootSitemaps.find((u) => new URL(u).pathname.includes('sitemap_collections'))

    // Fetch each sub-sitemap and grab the first real page URL
    async function getFirstUrl(sitemapUrl: string, pathPrefix: string): Promise<string | null> {
      try {
        const res = await fetch(sitemapUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) return null
        const xml = await res.text()
        const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
        // Skip the homepage entry that Shopify includes in the products sitemap
        return urls.find((u) => new URL(u).pathname.startsWith(pathPrefix)) || null
      } catch {
        return null
      }
    }

    if (productsSitemap) {
      result.productUrl = await getFirstUrl(productsSitemap, '/products/')
    }
    if (collectionsSitemap) {
      result.collectionUrl = await getFirstUrl(collectionsSitemap, '/collections/')
    }
  } catch (err) {
    console.error('[discoverPagesFromSitemap] Failed:', err instanceof Error ? err.message : err)
  }

  return result
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
    // SECURITY: Validate root URL to prevent SSRF
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

    // --- Discover pages to scan via sitemap ---
    // Shopify generates /sitemap.xml on every store regardless of theme.
    // This is far more reliable than scraping the DOM for links.
    const origin = new URL(url).origin
    const { productUrl, collectionUrl } = await discoverPagesFromSitemap(origin)

    const urlsToScan: string[] = [url]

    // Validate and add discovered URLs
    const { validateURL: v } = await import('@/app/utils/ssrf-protection')
    if (productUrl && (await v(productUrl)).allowed) {
      urlsToScan.push(productUrl)
    }
    if (collectionUrl && (await v(collectionUrl)).allowed && !urlsToScan.includes(collectionUrl)) {
      urlsToScan.push(collectionUrl)
    }

    console.log(`[runAccessibilityAudit] Scanning ${urlsToScan.length} pages:`, urlsToScan)

    // --- Scan each page ---
    const allViolations: any[][] = []

    for (const pageUrl of urlsToScan) {
      try {
        const page = await navigatePage(context, pageUrl)
        allViolations.push(await scanSinglePage(page, pageUrl))
        await page.close()
      } catch (err) {
        console.error(`[runAccessibilityAudit] Failed to scan ${pageUrl}:`, err instanceof Error ? err.message : err)
      }
    }

    // --- Merge and deduplicate ---
    const violations = mergeViolations(allViolations)

    // Count violations by impact level
    const violationsByImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 }
    violations.forEach((violation: any) => {
      const impact = violation.impact as ImpactLevel
      if (impact && violationsByImpact[impact] !== undefined) violationsByImpact[impact]++
    })

    // Transform to our type — carry pageUrl through on each node
    const impactOrder: Record<ImpactLevel, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 }

    const transformedViolations = violations
      .map((violation: any) => ({
        id: violation.id,
        impact: (violation.impact || 'minor') as ImpactLevel,
        description: violation.description,
        help: violation.help,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.map((node: any) => ({
          html: node.html,
          target: node.target,
          failureSummary: node.failureSummary || 'No summary available',
          ...(node._pageUrl ? { pageUrl: node._pageUrl } : {}),
          ...(node._imageSrc ? { _imageSrc: node._imageSrc } : {}),
          ...(node._genericAlt ? { _genericAlt: node._genericAlt } : {}),
        })),
      }))
      .sort((a: any, b: any) => impactOrder[a.impact as ImpactLevel] - impactOrder[b.impact as ImpactLevel])

    const result: AuditResult = {
      url,
      timestamp: new Date().toISOString(),
      totalViolations: violations.length,
      violations: transformedViolations,
      violationsByImpact,
      pagesScanned: urlsToScan,
    }

    if (shop) {
      await saveAuditToDatabase(result, shop)
    }

    return result
  } catch (error) {
    console.error('Audit error:', error)
    return error instanceof Error
      ? { error: 'Audit failed', details: error.message }
      : { error: 'Unknown error occurred during audit' }
  } finally {
    if (browser) await browser.close()
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
