import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyWebhook } from '@/app/utils/webhookVerification'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

/**
 * app/uninstalled
 *
 * Fires immediately when a merchant uninstalls the app. We invalidate their
 * session token right away. The full data deletion happens 48 hours later
 * via the shop/redact GDPR webhook.
 *
 * https://shopify.dev/docs/apps/build/webhooks/mandatory-webhooks
 */
export async function POST(request: NextRequest) {
  const { valid, shop } = await verifyShopifyWebhook(request)

  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop header' }, { status: 400 })
  }

  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin()

    // Immediately revoke the session so the token can no longer be used.
    // Full data deletion comes via shop/redact 48 hours later.
    const { error } = await supabase
      .from('shopify_sessions')
      .delete()
      .eq('shop', shop)

    if (error) {
      console.error('[app/uninstalled] Failed to revoke session')
      // Return 200 anyway — Shopify won't retry uninstall webhooks
    }
  }

  return NextResponse.json({ acknowledged: true }, { status: 200 })
}
