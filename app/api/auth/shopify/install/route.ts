import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!
const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES || 'read_products,write_products'
const SHOPIFY_APP_URL = process.env.SHOPIFY_APP_URL!

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get('shop')

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 })
  }

  // Validate shop domain format
  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop)) {
    return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 })
  }

  try {
    // Generate a random nonce for CSRF protection
    const state = crypto.randomBytes(16).toString('hex')

    const redirectUri = `${SHOPIFY_APP_URL}/api/auth/shopify/callback`

    const authUrl = new URL(`https://${shop}/admin/oauth/authorize`)
    authUrl.searchParams.set('client_id', SHOPIFY_API_KEY)
    authUrl.searchParams.set('scope', SHOPIFY_SCOPES)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('grant_options[]', 'per-user')

    // Store state in a cookie for CSRF verification in the callback
    const response = NextResponse.redirect(authUrl.toString())
    response.cookies.set('shopify_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes
      path: '/',
    })

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error starting OAuth:', message)
    return NextResponse.json(
      { error: 'Failed to start OAuth flow', details: message },
      { status: 500 }
    )
  }
}
