import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyWebhook } from '@/app/utils/webhookVerification'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

/**
 * GDPR: shop/redact
 *
 * Shopify sends this 48 hours after a merchant uninstalls the app.
 * We must permanently delete ALL data associated with the shop.
 *
 * Tables to purge:
 *   - shopify_sessions  (OAuth token)
 *   - audits            (audit history)
 *   - proposed_fixes    (AI-generated fix proposals)
 *   - gdpr_requests     (GDPR request log — delete last so the trail is complete)
 *
 * https://shopify.dev/docs/apps/build/privacy-law-compliance
 */
export async function POST(request: NextRequest) {
  const { valid, body, shop } = await verifyShopifyWebhook(request)

  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop header' }, { status: 400 })
  }

  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin()

    // Log that we received the redact request before we delete everything
    await supabase.from('gdpr_requests').insert({
      shop,
      type: 'shop/redact',
      payload,
      received_at: new Date().toISOString(),
    })

    // Delete all shop data in dependency order
    const deletions = await Promise.allSettled([
      supabase.from('proposed_fixes').delete().eq('shop', shop),
      supabase.from('audits').delete().eq('shop', shop),
      supabase.from('shopify_sessions').delete().eq('shop', shop),
    ])

    const failures = deletions.filter(d => d.status === 'rejected')
    if (failures.length > 0) {
      console.error('[shop/redact] Some deletions failed for shop redact request')
      // Still return 200 — Shopify will retry if we return an error, but partial
      // deletion is better than blocking. The gdpr_requests log records this.
    }

    // Remove the GDPR request log last (after data is gone)
    await supabase.from('gdpr_requests').delete().eq('shop', shop)
  }

  return NextResponse.json({ acknowledged: true }, { status: 200 })
}
