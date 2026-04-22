import { NextRequest, NextResponse } from 'next/server'
import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api'
import '@shopify/shopify-api/adapters/node'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, RATE_LIMITS } from '@/app/utils/rateLimit'
import { encrypt } from '@/app/utils/encryption'

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

  // SECURITY: Rate limiting - prevent OAuth callback abuse
  const rateLimit = await checkRateLimit(`oauth:${shop}`, RATE_LIMITS.oauth)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        details: 'Too many OAuth attempts. Please try again later.',
      },
      { status: 429 }
    )
  }

  try {
    // SECURITY: Complete OAuth with automatic state and HMAC verification
    // shopify.auth.callback() validates:
    // - State parameter matches (CSRF protection)
    // - HMAC signature is valid (request authenticity)
    // - Shop domain is valid
    const callbackResponse = await shopify.auth.callback({
      rawRequest: request as any,
    })

    const { session } = callbackResponse

    // SECURITY: Additional validation - ensure session shop matches query param
    if (session.shop !== shop) {
      console.error('[OAuth Callback] Shop mismatch - session:', session.shop, 'query:', shop)
      return NextResponse.json(
        { error: 'OAuth session mismatch' },
        { status: 400 }
      )
    }

    // Store session in Supabase
    if (supabaseUrl && supabaseServiceKey) {
      console.log('[OAuth Callback] Storing session for shop:', session.shop)

      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        },
        db: {
          schema: 'public'
        },
        global: {
          headers: {
            'apikey': supabaseServiceKey
          }
        }
      })

      // SECURITY: Encrypt access token before storing
      if (!session.accessToken) {
        console.error('[OAuth Callback] Missing access token in session')
        return NextResponse.json(
          { error: 'OAuth flow incomplete - missing access token' },
          { status: 500 }
        )
      }

      const encryptedToken = encrypt(session.accessToken)

      const { data, error } = await supabase.from('shopify_sessions').upsert({
        shop: session.shop,
        access_token: encryptedToken, // Store encrypted, not plaintext
        scope: session.scope,
        expires_at: session.expires ? new Date(session.expires).toISOString() : null,
        is_online: session.isOnline,
        updated_at: new Date().toISOString(),
      }).select()

      if (error) {
        console.error('[OAuth Callback] Failed to store session in Supabase')
        // SECURITY: Do not log error details which may contain sensitive data
      } else {
        console.log('[OAuth Callback] Session stored successfully for shop:', session.shop)
        // SECURITY: Do not log session data (contains access tokens)
      }
    } else {
      console.error('[OAuth Callback] Supabase credentials missing')
    }

    // SECURITY: Use verified session shop for redirect, not query params
    // This prevents attacker-controlled values from influencing post-auth state
    const redirectUrl = new URL('/', process.env.SHOPIFY_APP_URL!)
    redirectUrl.searchParams.set('shop', session.shop) // Use verified shop from session

    // SECURITY: Validate host parameter if present
    // Shopify host format: base64(shop/admin)
    if (host) {
      try {
        const decodedHost = Buffer.from(host, 'base64').toString('utf-8')
        // Verify host contains the verified shop domain
        if (decodedHost.includes(session.shop)) {
          redirectUrl.searchParams.set('host', host)
        } else {
          console.error('[OAuth Callback] Host parameter does not match verified shop')
        }
      } catch (error) {
        console.error('[OAuth Callback] Invalid host parameter')
      }
    }

    const response = NextResponse.redirect(redirectUrl)
    response.headers.set('ngrok-skip-browser-warning', 'true')

    return response
  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.json(
      { error: 'Failed to complete OAuth flow' },
      { status: 500 }
    )
  }
}
