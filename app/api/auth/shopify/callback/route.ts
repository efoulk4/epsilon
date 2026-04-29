import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { saveShopifySession, getShopifySession } from '@/app/utils/shopifySession'
import { checkRateLimit, RATE_LIMITS } from '@/app/utils/rateLimit'
import { encrypt } from '@/app/utils/encryption'

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!
const SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL!

function verifyHmac(params: URLSearchParams, secret: string): boolean {
  const hmac = params.get('hmac')
  if (!hmac) return false

  const pairs: string[] = []
  params.forEach((value, key) => {
    if (key !== 'hmac') {
      pairs.push(`${key}=${value}`)
    }
  })
  pairs.sort()
  const message = pairs.join('&')

  const digest = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex')

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))
}

async function registerWebhooks(shop: string, accessToken: string): Promise<void> {
  const webhooks = [
    { topic: 'app/uninstalled',        address: `${SHOPIFY_APP_URL}/api/webhooks/shopify/app-uninstalled` },
    { topic: 'customers/data_request', address: `${SHOPIFY_APP_URL}/api/webhooks/shopify/customers-data-request` },
    { topic: 'customers/redact',       address: `${SHOPIFY_APP_URL}/api/webhooks/shopify/customers-redact` },
    { topic: 'shop/redact',            address: `${SHOPIFY_APP_URL}/api/webhooks/shopify/shop-redact` },
  ]

  for (const webhook of webhooks) {
    try {
      const res = await fetch(`https://${shop}/admin/api/2024-10/webhooks.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ webhook: { topic: webhook.topic, address: webhook.address, format: 'json' } }),
      })
      if (!res.ok && res.status !== 422) {
        console.error(`[registerWebhooks] Failed to register ${webhook.topic}: ${res.status}`)
      }
    } catch (err) {
      console.error(`[registerWebhooks] Error registering ${webhook.topic}:`, err instanceof Error ? err.message : err)
    }
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const shop = searchParams.get('shop')
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const host = searchParams.get('host')

  if (!shop || !code || !state) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
  }

  // SECURITY: Rate limiting
  const rateLimit = await checkRateLimit(`oauth:${shop}`, RATE_LIMITS.oauth)
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  // SECURITY: Verify HMAC
  if (!verifyHmac(searchParams, SHOPIFY_API_SECRET)) {
    console.error('[OAuth Callback] HMAC verification failed for shop:', shop)
    return NextResponse.json({ error: 'HMAC verification failed' }, { status: 400 })
  }

  // SECURITY: Verify state cookie matches to prevent CSRF
  const storedState = request.cookies.get('shopify_oauth_state')?.value
  if (!storedState || storedState !== state) {
    console.error('[OAuth Callback] State mismatch — possible CSRF attack')
    return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 })
  }

  // SECURITY: Validate shop domain
  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop)) {
    return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 })
  }

  try {
    // Exchange code for expiring offline access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
        expiring: '1',
      }),
    })

    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      console.error('[OAuth Callback] Token exchange failed:', tokenRes.status, body)
      return NextResponse.json({ error: 'Token exchange failed' }, { status: 500 })
    }

    const {
      access_token,
      scope,
      expires_in,
      refresh_token,
      refresh_token_expires_in,
    } = await tokenRes.json()

    if (!access_token) {
      console.error('[OAuth Callback] No access token in response')
      return NextResponse.json({ error: 'No access token received' }, { status: 500 })
    }

    console.log('[OAuth Callback] Token received for shop:', shop, '| expiring:', !!refresh_token)

    const now = new Date()

    // Only set a trial on first install — preserve plan/trial for reinstalls
    const existingSession = await getShopifySession(shop)
    const isFirstInstall = !existingSession
    const trialEndsAt = isFirstInstall
      ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      : undefined

    if (isFirstInstall) {
      console.log('[OAuth Callback] First install — starting 7-day trial for shop:', shop)
    }

    const saved = await saveShopifySession({
      shop,
      accessToken: access_token,
      scope,
      expiresAt: expires_in ? new Date(now.getTime() + expires_in * 1000) : undefined,
      refreshToken: refresh_token || undefined,
      refreshTokenExpiresAt: refresh_token_expires_in
        ? new Date(now.getTime() + refresh_token_expires_in * 1000)
        : undefined,
      isOnline: false,
      trialEndsAt,
    })

    if (!saved) {
      console.error('[OAuth Callback] Failed to save session for shop:', shop)
      return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
    }

    console.log('[OAuth Callback] Session saved successfully for shop:', shop)

    // Register webhooks
    await registerWebhooks(shop, access_token)

    // Clear state cookie and redirect to app
    const redirectUrl = new URL('/', SHOPIFY_APP_URL)
    redirectUrl.searchParams.set('shop', shop)
    if (host) redirectUrl.searchParams.set('host', host)

    const response = NextResponse.redirect(redirectUrl.toString())
    response.cookies.delete('shopify_oauth_state')

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[OAuth Callback] Error:', message)
    return NextResponse.json({ error: 'OAuth callback failed', details: message }, { status: 500 })
  }
}
