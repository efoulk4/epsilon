import { NextRequest, NextResponse } from 'next/server'
import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api'
import '@shopify/shopify-api/adapters/node'
import { createClient } from '@supabase/supabase-js'

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: process.env.SHOPIFY_SCOPES?.split(',') || ['read_products', 'write_products'],
  hostName: process.env.SHOPIFY_APP_URL!.replace(/https?:\/\//, ''),
  hostScheme: 'https',
  apiVersion: ApiVersion.October24,
  isEmbeddedApp: true,
})

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const shop = searchParams.get('shop')
  const host = searchParams.get('host')

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 })
  }

  try {
    // Complete OAuth and get access token
    const callbackResponse = await shopify.auth.callback({
      rawRequest: request as any,
    })

    const { session } = callbackResponse

    // Store session in Supabase
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      const { error } = await supabase.from('shopify_sessions').upsert({
        shop: session.shop,
        access_token: session.accessToken,
        scope: session.scope,
        expires_at: session.expires ? new Date(session.expires).toISOString() : null,
        is_online: session.isOnline,
        updated_at: new Date().toISOString(),
      })

      if (error) {
        console.error('Failed to store session in Supabase:', error)
      }
    }

    // Redirect to app with shop and host params
    const redirectUrl = new URL('/', process.env.SHOPIFY_APP_URL!)
    redirectUrl.searchParams.set('shop', shop)
    if (host) {
      redirectUrl.searchParams.set('host', host)
    }

    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.json(
      { error: 'Failed to complete OAuth flow' },
      { status: 500 }
    )
  }
}
