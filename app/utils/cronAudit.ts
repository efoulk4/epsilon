/**
 * Internal-only helper for the cron audit runner.
 * Skips JWT auth because the cron endpoint is already gated by CRON_SECRET.
 * Never export from a client bundle or call from user-facing server actions.
 */

import { chromium } from 'playwright-core'
import chromiumPkg from '@sparticuz/chromium'
import type { AuditResult, AuditError, ImpactLevel } from '@/types/audit'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { calculateHealthScore } from '@/app/utils/healthScore'
import { validateURL } from '@/app/utils/ssrf-protection'

export async function runCronAudit(shop: string): Promise<boolean> {
  const storeUrl = `https://${shop}`

  const rootValidation = await validateURL(storeUrl)
  if (!rootValidation.allowed) {
    console.error(`[cronAudit] URL blocked for ${shop}:`, rootValidation.error)
    return false
  }

  let browser = null
  try {
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

    const { discoverAndScan } = await import('@/app/utils/auditCore')
    const result = await discoverAndScan(context, storeUrl)

    await browser.close()
    browser = null

    if (!isSupabaseConfigured) return true

    const healthScore = calculateHealthScore(result)
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from('audits').insert({
      shop,
      url: storeUrl,
      timestamp: result.timestamp,
      total_violations: result.totalViolations,
      violations: result.violations,
      violations_by_impact: result.violationsByImpact,
      health_score: healthScore,
    })

    if (error) {
      console.error(`[cronAudit] Failed to save audit for ${shop}:`, error.message)
      return false
    }

    console.log(`[cronAudit] Audit saved for ${shop}: ${result.totalViolations} violations`)
    return true
  } catch (err) {
    console.error(`[cronAudit] Failed for ${shop}:`, err instanceof Error ? err.message : err)
    return false
  } finally {
    if (browser) await browser.close()
  }
}
