import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export interface ShopifySession {
  shop: string
  access_token: string
  scope: string | null
  expires_at: string | null
  is_online: boolean
}

export async function getShopifySession(shop: string): Promise<ShopifySession | null> {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[getShopifySession] Supabase not configured:', {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
    })
    return null
  }

  console.log('[getShopifySession] Creating Supabase client with service role key')
  console.log('[getShopifySession] Service key starts with:', supabaseServiceKey.substring(0, 15))

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

  console.log('[getShopifySession] Querying for shop:', shop)

  const { data, error } = await supabase
    .from('shopify_sessions')
    .select('*')
    .eq('shop', shop)
    .single()

  if (error) {
    console.error('[getShopifySession] Error fetching Shopify session:', error)
    return null
  }

  console.log('[getShopifySession] Session retrieved successfully for shop:', shop)
  return data as ShopifySession
}

export async function saveShopifySession(session: {
  shop: string
  accessToken: string
  scope?: string
  expires?: Date
  isOnline: boolean
}): Promise<boolean> {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Supabase not configured')
    return false
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { error } = await supabase.from('shopify_sessions').upsert({
    shop: session.shop,
    access_token: session.accessToken,
    scope: session.scope || null,
    expires_at: session.expires ? session.expires.toISOString() : null,
    is_online: session.isOnline,
    updated_at: new Date().toISOString(),
  })

  if (error) {
    console.error('Error saving Shopify session:', error)
    return false
  }

  return true
}
