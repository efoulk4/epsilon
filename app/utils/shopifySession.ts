import { createClient } from '@supabase/supabase-js'
import { encrypt, decrypt, isEncrypted } from './encryption'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export type ShopPlan = 'free' | 'basic' | 'pro'

export interface ShopifySession {
  shop: string
  access_token: string
  scope: string | null
  expires_at: string | null
  refresh_token: string | null
  refresh_token_expires_at: string | null
  is_online: boolean
  plan: ShopPlan
  trial_ends_at: string | null
}

function makeSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { apikey: supabaseServiceKey } },
  })
}

export async function getShopifySession(shop: string): Promise<ShopifySession | null> {
  const supabase = makeSupabaseClient()
  if (!supabase) {
    console.error('[getShopifySession] Supabase not configured')
    return null
  }

  const { data, error } = await supabase
    .from('shopify_sessions')
    .select('*')
    .eq('shop', shop)
    .single()

  if (error) {
    console.error('[getShopifySession] Session fetch failed', error.code, error.message)
    return null
  }

  try {
    if (data.access_token && isEncrypted(data.access_token)) {
      data.access_token = decrypt(data.access_token)
    } else {
      console.warn('[getShopifySession] Found unencrypted access token')
    }
    if (data.refresh_token && isEncrypted(data.refresh_token)) {
      data.refresh_token = decrypt(data.refresh_token)
    }
  } catch {
    console.error('[getShopifySession] Token decryption failed')
    return null
  }

  return data as ShopifySession
}

export async function saveShopifySession(session: {
  shop: string
  accessToken: string
  scope?: string
  expiresAt?: Date
  refreshToken?: string
  refreshTokenExpiresAt?: Date
  isOnline: boolean
  plan?: ShopPlan
  trialEndsAt?: Date | null
}): Promise<boolean> {
  const supabase = makeSupabaseClient()
  if (!supabase) {
    console.error('[saveShopifySession] Supabase not configured')
    return false
  }

  const encryptedToken = encrypt(session.accessToken)
  const encryptedRefresh = session.refreshToken ? encrypt(session.refreshToken) : null

  const upsertData: Record<string, unknown> = {
    shop: session.shop,
    access_token: encryptedToken,
    scope: session.scope || null,
    expires_at: session.expiresAt ? session.expiresAt.toISOString() : null,
    refresh_token: encryptedRefresh,
    refresh_token_expires_at: session.refreshTokenExpiresAt
      ? session.refreshTokenExpiresAt.toISOString()
      : null,
    is_online: session.isOnline,
    updated_at: new Date().toISOString(),
  }
  if (session.plan !== undefined) upsertData.plan = session.plan
  if (session.trialEndsAt !== undefined) {
    upsertData.trial_ends_at = session.trialEndsAt ? session.trialEndsAt.toISOString() : null
  }

  const { error } = await supabase.from('shopify_sessions').upsert(upsertData, { onConflict: 'shop' })

  if (error) {
    console.error('[saveShopifySession] Error:', error.code, error.message, error.details)
    return false
  }

  return true
}

/**
 * Refresh an expiring offline token using the stored refresh token.
 * Updates the session in Supabase and returns the new access token,
 * or null if the refresh fails (merchant must re-install).
 */
export async function refreshShopifyToken(shop: string): Promise<string | null> {
  const session = await getShopifySession(shop)
  if (!session?.refresh_token) {
    console.error('[refreshShopifyToken] No refresh token available for shop:', shop)
    return null
  }

  // Check if refresh token itself has expired — merchant must re-install
  if (session.refresh_token_expires_at) {
    const refreshExpiry = new Date(session.refresh_token_expires_at)
    if (refreshExpiry <= new Date()) {
      console.error('[refreshShopifyToken] Refresh token expired for shop:', shop)
      return null
    }
  }

  try {
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id: process.env.SHOPIFY_API_KEY!,
        client_secret: process.env.SHOPIFY_API_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: session.refresh_token,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[refreshShopifyToken] Refresh failed:', res.status, text.slice(0, 200))
      return null
    }

    const json = await res.json()
    const { access_token, expires_in, refresh_token, refresh_token_expires_in } = json

    if (!access_token || !refresh_token) {
      console.error('[refreshShopifyToken] Missing tokens in refresh response')
      return null
    }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + expires_in * 1000)
    const refreshExpiresAt = new Date(now.getTime() + refresh_token_expires_in * 1000)

    const saved = await saveShopifySession({
      shop,
      accessToken: access_token,
      scope: session.scope || undefined,
      expiresAt,
      refreshToken: refresh_token,
      refreshTokenExpiresAt: refreshExpiresAt,
      isOnline: false,
      plan: session.plan,
    })

    if (!saved) {
      console.error('[refreshShopifyToken] Failed to persist refreshed tokens for shop:', shop)
      return null
    }

    console.log('[refreshShopifyToken] Token refreshed successfully for shop:', shop)
    return access_token
  } catch (err) {
    console.error('[refreshShopifyToken] Error:', err instanceof Error ? err.message : err)
    return null
  }
}
