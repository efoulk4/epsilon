import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyWebhook } from '@/app/utils/webhookVerification'
import { getShopifySession } from '@/app/utils/shopifySession'
import { auditSingleProduct, sendShopifyNotification } from '@/app/utils/auditProduct'

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
  const session = await getShopifySession(shop)
  if (!session) {
    console.error(`[products/update] No session for shop: ${shop}`)
    return
  }

  const result = await auditSingleProduct(shop, productId)
  if (!result) {
    // Product is clean after update — no notification needed
    return
  }

  const violationCount = result.violations.length
  const issueWord = violationCount === 1 ? 'issue' : 'issues'
  const title = `Accessibility ${issueWord} detected in "${result.productTitle}"`
  const message = result.violations.map((v) => `• ${v.description}`).join('\n')
  const actionUrl = `https://${shop}/admin/apps/epsilon`

  console.log(`[products/update] ${violationCount} ${issueWord} found for product ${productId} on ${shop}`)
  await sendShopifyNotification(shop, session.access_token, title, message, actionUrl)
}
