import { createClient } from '@supabase/supabase-js'
import { encrypt, decrypt, isEncrypted } from './encryption'

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
    console.error('[getShopifySession] Supabase not configured')
    return null
  }

  // SECURITY: Do not log service keys or tokens
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

  const { data, error } = await supabase
    .from('shopify_sessions')
    .select('*')
    .eq('shop', shop)
    .single()

  if (error) {
    console.error('[getShopifySession] Session fetch failed')
    return null
  }

  // SECURITY: Decrypt access token if encrypted
  // Backward compatibility: handle both encrypted and legacy plaintext tokens
  try {
    if (data.access_token && isEncrypted(data.access_token)) {
      data.access_token = decrypt(data.access_token)
    } else {
      // Legacy plaintext token - log warning and re-encrypt on next save
      console.warn('[getShopifySession] Found unencrypted token for shop:', shop, '- should be re-encrypted')
    }
  } catch (decryptError) {
    console.error('[getShopifySession] Token decryption failed for shop:', shop)
    return null
  }

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

  // SECURITY: Encrypt access token before storing
  const encryptedToken = encrypt(session.accessToken)

  const { error } = await supabase.from('shopify_sessions').upsert({
    shop: session.shop,
    access_token: encryptedToken, // Store encrypted, not plaintext
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
