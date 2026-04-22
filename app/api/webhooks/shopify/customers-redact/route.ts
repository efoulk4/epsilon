import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyWebhook } from '@/app/utils/webhookVerification'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

/**
 * GDPR: customers/redact
 *
 * Shopify sends this when a customer requests deletion of their data.
 * Must be actioned within 30 days.
 *
 * This app stores no customer PII, so there is nothing to delete.
 * We log the request for the compliance audit trail and acknowledge.
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

  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin()
    await supabase.from('gdpr_requests').insert({
      shop,
      type: 'customers/redact',
      payload,
      received_at: new Date().toISOString(),
    })
  }

  // No customer PII to redact — acknowledge immediately.
  return NextResponse.json({ acknowledged: true }, { status: 200 })
}
