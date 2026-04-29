export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'
import { getShopifySession } from '@/app/utils/shopifySession'
import { validateShopifyStoreURL } from '@/app/utils/ssrf-protection'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * GET /api/cron/audit?plan=basic|pro
 *
 * Called by Vercel Cron:
 *   - basic plan: monthly  (0 2 1 * *)
 *   - pro plan:   weekly   (0 2 * * 1)
 *
 * Vercel automatically sets Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const plan = request.nextUrl.searchParams.get('plan')
  if (plan !== 'basic' && plan !== 'pro') {
    return NextResponse.json({ error: 'Invalid plan parameter' }, { status: 400 })
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const supabase = getSupabaseAdmin()

  // Fetch all shops on this plan
  const { data: sessions, error } = await supabase
    .from('shopify_sessions')
    .select('shop')
    .eq('plan', plan)
    .eq('is_online', false)

  if (error) {
    console.error('[cron/audit] Failed to fetch sessions:', error.message)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const shops: string[] = (sessions ?? []).map((s: { shop: string }) => s.shop)
  console.log(`[cron/audit] Starting scheduled audits for ${shops.length} ${plan} shops`)

  const results: { shop: string; status: string }[] = []

  for (const shop of shops) {
    try {
      const session = await getShopifySession(shop)
      if (!session) {
        results.push({ shop, status: 'no_session' })
        continue
      }

      // Validate store URL before launching Chromium
      const validation = await validateShopifyStoreURL(shop)
      if (!validation.allowed) {
        results.push({ shop, status: 'url_blocked' })
        continue
      }

      // Dynamically import audit to avoid pulling Playwright into the module graph
      // at cold-start time for every cron tick
      const { runAccessibilityAuditForShop: _audit } = await import('@/app/actions/audit')

      // runAccessibilityAuditForShop requires a JWT idToken — for cron we bypass
      // auth and call the internal helper directly via a thin wrapper.
      const { runCronAudit } = await import('@/app/utils/cronAudit')
      const auditResult = await runCronAudit(shop)

      results.push({ shop, status: auditResult ? 'ok' : 'failed' })
    } catch (err) {
      console.error(`[cron/audit] Error auditing ${shop}:`, err instanceof Error ? err.message : err)
      results.push({ shop, status: 'error' })
    }
  }

  console.log('[cron/audit] Done:', results)
  return NextResponse.json({ audited: results.length, results })
}
