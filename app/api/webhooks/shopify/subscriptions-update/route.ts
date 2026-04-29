import { NextRequest, NextResponse } from 'next/server'
import { verifyShopifyWebhook } from '@/app/utils/webhookVerification'
import { getShopifySession, saveShopifySession } from '@/app/utils/shopifySession'

/**
 * app_subscriptions/update
 *
 * Shopify fires this when a subscription status changes — most importantly when
 * a recurring charge fails (status becomes 'declined' or 'expired').
 * We downgrade the shop to 'free' so they hit the upgrade wall on next audit.
 *
 * https://shopify.dev/docs/api/admin-rest/2024-10/resources/recurringapplicationcharge
 */
export async function POST(request: NextRequest) {
  const { valid, body, shop } = await verifyShopifyWebhook(request)

  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop header' }, { status: 400 })
  }

  let payload: Record<string, unknown> = {}
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const status = payload.status as string | undefined
  console.log(`[subscriptions/update] shop=${shop} status=${status}`)

  // Only act on terminal failure states — active/pending/frozen are not failures
  if (status === 'declined' || status === 'expired' || status === 'cancelled') {
    const session = await getShopifySession(shop)
    if (session) {
      await saveShopifySession({
        shop,
        accessToken: session.access_token,
        scope: session.scope ?? undefined,
        expiresAt: session.expires_at ? new Date(session.expires_at) : undefined,
        refreshToken: session.refresh_token ?? undefined,
        refreshTokenExpiresAt: session.refresh_token_expires_at
          ? new Date(session.refresh_token_expires_at)
          : undefined,
        isOnline: session.is_online,
        plan: 'free',
      })
      console.log(`[subscriptions/update] Downgraded ${shop} to free (subscription ${status})`)
    }
  }

  return NextResponse.json({ acknowledged: true }, { status: 200 })
}
