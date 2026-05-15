import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyWebhook } from '@/app/utils/webhookVerification'
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const { valid, body, shop } = await verifyShopifyWebhook(request)

  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const topic = request.headers.get('x-shopify-topic')

  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop header' }, { status: 400 })
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json({ acknowledged: true }, { status: 200 })
  }

  const supabase = getSupabaseAdmin()

  if (topic === 'customers/data_request' || topic === 'customers/redact') {
    await supabase.from('gdpr_requests').insert({
      shop,
      type: topic,
      payload,
      received_at: new Date().toISOString(),
    })
    // This app stores no customer PII — acknowledge immediately.
    return NextResponse.json({ acknowledged: true }, { status: 200 })
  }

  if (topic === 'shop/redact') {
    await supabase.from('gdpr_requests').insert({
      shop,
      type: 'shop/redact',
      payload,
      received_at: new Date().toISOString(),
    })

    await Promise.allSettled([
      supabase.from('proposed_fixes').delete().eq('shop', shop),
      supabase.from('audits').delete().eq('shop', shop),
      supabase.from('shopify_sessions').delete().eq('shop', shop),
    ])

    await supabase.from('gdpr_requests').delete().eq('shop', shop)

    return NextResponse.json({ acknowledged: true }, { status: 200 })
  }

  return NextResponse.json({ acknowledged: true }, { status: 200 })
}
