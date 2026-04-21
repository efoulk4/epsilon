'use server'

import { chromium } from 'playwright-core'
import chromiumPkg from '@sparticuz/chromium'
import type { AuditResult, AuditError, ImpactLevel } from '@/types/audit'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { calculateHealthScore } from '@/app/utils/healthScore'
import { getShopOnlineStoreUrl } from '@/app/utils/shopifyClient'

export async function runAccessibilityAuditForShop(
  shop: string
): Promise<AuditResult | AuditError> {
  try {
    // For now, construct the store URL directly from the shop domain
    // This works because Shopify stores are always at https://{shop}
    const storeUrl = `https://${shop}`

    console.log(`[runAccessibilityAuditForShop] Auditing shop: ${shop} at URL: ${storeUrl}`)

    // Run the standard audit on the shop's URL
    return await runAccessibilityAudit(storeUrl)
  } catch (error) {
    console.error('Error running audit for shop:', error)
    return {
      error: 'Failed to run audit for shop',
      details: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function runAccessibilityAudit(
  url: string
): Promise<AuditResult | AuditError> {
  let browser = null

  try {
    // Validate URL
    const parsedUrl = new URL(url)
    if (!parsedUrl.protocol.startsWith('http')) {
      return {
        error: 'Invalid URL',
        details: 'URL must start with http:// or https://',
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

export async function saveAuditToDatabase(
  auditResult: AuditResult
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!isSupabaseConfigured) {
    console.warn('Supabase not configured. Skipping database save.')
    return { success: false, error: 'Supabase not configured' }
  }

  try {
    const healthScore = calculateHealthScore(auditResult)

    const { data, error } = await supabase
      .from('audits')
      .insert({
        url: auditResult.url,
        timestamp: auditResult.timestamp,
        total_violations: auditResult.totalViolations,
        violations: auditResult.violations,
        violations_by_impact: auditResult.violationsByImpact,
        health_score: healthScore,
      })
      .select()

    if (error) {
      console.error('Error saving audit to database:', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: data[0]?.id }
  } catch (error) {
    console.error('Unexpected error saving audit:', error)
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
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const { data, error } = await supabase
      .from('audits')
      .select('*')
      .eq('url', url)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching audit history:', error)
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
    console.error('Unexpected error fetching audit history:', error)
    return []
  }
}
