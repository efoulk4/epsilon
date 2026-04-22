import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyWebhook } from '@/app/utils/webhookVerification'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

/**
 * GDPR: customers/data_request
 *
 * Shopify sends this when a customer requests their data under GDPR/CCPA.
 * We must respond within 30 days with what data we hold about them.
 *
 * This app stores no customer PII — audits record page-level violations,
 * not individual customer data. We log the request and respond 200.
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

  // Log the request for compliance audit trail
  if (isSupabaseConfigured) {
    const supabase = getSupabaseAdmin()
    await supabase.from('gdpr_requests').insert({
      shop,
      type: 'customers/data_request',
      payload,
      received_at: new Date().toISOString(),
    })
  }

  // This app holds no customer PII — audits are shop-level, not customer-level.
  // Acknowledge receipt; no data export needed.
  return NextResponse.json({ acknowledged: true }, { status: 200 })
}
