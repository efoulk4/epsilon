import { NextRequest, NextResponse } from 'next/server'
import { getShopifySession, saveShopifySession, type ShopPlan } from '@/app/utils/shopifySession'

const SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL!
const VALID_PLANS: ShopPlan[] = ['basic', 'pro']

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const shop = searchParams.get('shop')
  const planKey = searchParams.get('plan') as ShopPlan | null
  const chargeId = searchParams.get('charge_id')

  if (!shop || !planKey || !chargeId || !VALID_PLANS.includes(planKey)) {
    return NextResponse.json({ error: 'Invalid callback parameters' }, { status: 400 })
  }

  // Validate shop domain
  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop)) {
    return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 })
  }

  const session = await getShopifySession(shop)
  if (!session) {
    return NextResponse.json({ error: 'No session found for shop' }, { status: 400 })
  }

  // Verify the charge is actually active with Shopify
  const verifyRes = await fetch(
    `https://${shop}/admin/api/2024-10/recurring_application_charges/${chargeId}.json`,
    { headers: { 'X-Shopify-Access-Token': session.access_token } }
  )

  if (!verifyRes.ok) {
    console.error('[billing/callback] Charge verification failed:', verifyRes.status)
    return NextResponse.redirect(new URL('/?billing=failed', SHOPIFY_APP_URL))
  }

  const { recurring_application_charge: charge } = await verifyRes.json()

  if (charge?.status !== 'active') {
    console.warn('[billing/callback] Charge not active, status:', charge?.status)
    return NextResponse.redirect(new URL('/?billing=declined', SHOPIFY_APP_URL))
  }

  // Persist the new plan
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
