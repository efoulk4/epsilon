import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyWebhook } from '@/app/utils/webhookVerification'
import { auditSingleProduct, saveProductNotification } from '@/app/utils/auditProduct'

export async function POST(request: NextRequest) {
  const { valid, body, shop } = await verifyShopifyWebhook(request)

  if (!valid || !shop) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: { id?: number; title?: string } = {}
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const productId = payload.id
  if (!productId) {
    return NextResponse.json({ acknowledged: true }, { status: 200 })
  }

  // Respond to Shopify immediately — audit runs in background
  runAuditInBackground(shop, productId).catch((err) =>
    console.error('[products/update] Background audit failed:', err instanceof Error ? err.message : err)
  )

  return NextResponse.json({ acknowledged: true }, { status: 200 })
}

async function runAuditInBackground(shop: string, productId: number) {
  const result = await auditSingleProduct(shop, productId)
  if (!result) {
    // Product is clean after update — no notification needed
    return
  }

  console.log(`[products/update] ${result.violations.length} issue(s) found for product ${productId} on ${shop}`)
  await saveProductNotification(shop, productId, result)
}
