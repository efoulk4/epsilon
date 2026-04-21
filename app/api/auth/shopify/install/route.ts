import { NextRequest, NextResponse } from 'next/server'
import { shopifyApi, ApiVersion } from '@shopify/shopify-api'
import '@shopify/shopify-api/adapters/node'

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: process.env.SHOPIFY_SCOPES?.split(',') || ['read_products', 'write_products'],
  hostName: process.env.SHOPIFY_APP_URL!.replace(/https?:\/\//, ''),
  hostScheme: 'https',
  apiVersion: ApiVersion.October24,
  isEmbeddedApp: true,
})

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const shop = searchParams.get('shop')

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 })
  }

  try {
    // Validate shop domain
    const sanitizedShop = shopify.utils.sanitizeShop(shop, true)

    if (!sanitizedShop) {
      return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 })
    }

    // Generate OAuth authorization URL
    const authUrl = await shopify.auth.begin({
      shop: sanitizedShop,
      callbackPath: '/api/auth/shopify/callback',
      isOnline: false, // Offline access for server-side API calls
      rawRequest: request as any,
    })

    // Redirect to Shopify OAuth with ngrok bypass header
    const response = NextResponse.redirect(authUrl)
    response.headers.set('ngrok-skip-browser-warning', 'true')

    return response
  } catch (error) {
    console.error('Error starting OAuth:', error)
    return NextResponse.json(
      { error: 'Failed to start OAuth flow' },
      { status: 500 }
    )
  }
}
