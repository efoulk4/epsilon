import { NextRequest, NextResponse } from 'next/server'
import { getShopifySession, saveShopifySession, type ShopPlan } from '@/app/utils/shopifySession'

const SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL!
const VALID_PLANS: ShopPlan[] = ['basic', 'pro']

async function getActiveSubscriptionStatus(shop: string, accessToken: string): Promise<string | null> {
  const query = `
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          status
        }
      }
    }
  `
  const res = await fetch(`https://${shop}/admin/api/2025-04/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query }),
  })

  if (!res.ok) return null

  const json = await res.json()
  const subs = json?.data?.currentAppInstallation?.activeSubscriptions ?? []
  return subs.length > 0 ? subs[0].status : null
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const shop = searchParams.get('shop')
  const planKey = searchParams.get('plan') as ShopPlan | null

  if (!shop || !planKey || !VALID_PLANS.includes(planKey)) {
    return NextResponse.json({ error: 'Invalid callback parameters' }, { status: 400 })
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop)) {
    return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 })
  }

  const session = await getShopifySession(shop)
  if (!session) {
    return NextResponse.json({ error: 'No session found for shop' }, { status: 400 })
  }

  const status = await getActiveSubscriptionStatus(shop, session.access_token)

  if (!status) {
    console.error('[billing/callback] Subscription verification failed for shop:', shop)
    return NextResponse.redirect(new URL('/?billing=failed', SHOPIFY_APP_URL))
  }

  if (status !== 'ACTIVE') {
    console.warn('[billing/callback] Subscription not active, status:', status)
    return NextResponse.redirect(new URL('/?billing=declined', SHOPIFY_APP_URL))
  }

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
    plan: planKey,
  })

  console.log(`[billing/callback] Plan '${planKey}' activated for shop: ${shop}`)

  const redirectUrl = new URL('/', SHOPIFY_APP_URL)
  redirectUrl.searchParams.set('shop', shop)
  redirectUrl.searchParams.set('billing', 'success')
  return NextResponse.redirect(redirectUrl.toString())
}
