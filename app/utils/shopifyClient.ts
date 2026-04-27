import { shopifyApi, ApiVersion } from '@shopify/shopify-api'
import '@shopify/shopify-api/adapters/node'
import { getShopifySession, refreshShopifyToken } from './shopifySession'

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: process.env.SHOPIFY_SCOPES?.split(',') || ['read_products', 'write_products'],
  hostName: process.env.SHOPIFY_APP_URL!.replace(/https?:\/\//, ''),
  hostScheme: 'https',
  apiVersion: ApiVersion.October24,
  isEmbeddedApp: true,
})

function makeSession(session: { shop: string; access_token: string; is_online: boolean; scope: string | null }) {
  return {
    id: `offline_${session.shop}`,
    shop: session.shop,
    accessToken: session.access_token,
    state: 'authenticated',
    isOnline: session.is_online,
    scope: session.scope || '',
  } as any
}

/**
 * Resolve a valid access token for the shop, refreshing it if expired.
 * Returns null if no session exists or the refresh token has also expired.
 */
async function getValidAccessToken(shop: string): Promise<string | null> {
  const session = await getShopifySession(shop)
  if (!session) return null

  // Non-expiring token or no expiry set — use as-is
  if (!session.expires_at) return session.access_token

  // Refresh proactively 5 minutes before expiry
  const expiresAt = new Date(session.expires_at)
  const refreshThreshold = new Date(expiresAt.getTime() - 5 * 60 * 1000)

  if (new Date() >= refreshThreshold) {
    console.log('[getValidAccessToken] Token expiring soon, refreshing for shop:', shop)
    return await refreshShopifyToken(shop)
  }

  return session.access_token
}

export async function shopifyGraphQL(shop: string, query: string, variables?: Record<string, any>): Promise<any> {
  const accessToken = await getValidAccessToken(shop)
  if (!accessToken) throw new Error('No valid session found for shop')

  const res = await fetch(`https://${shop}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[shopifyGraphQL] ${res.status} from ${shop}:`, text.slice(0, 200))
    throw new Error(`Shopify GraphQL ${res.status}: ${res.statusText}`)
  }

  const json = await res.json()
  if (json.errors) {
    console.error('[shopifyGraphQL] GraphQL errors:', JSON.stringify(json.errors).slice(0, 200))
    throw new Error(json.errors[0]?.message || 'GraphQL error')
  }

  return json.data
}

export async function getShopifyGraphQLClient(shop: string) {
  const session = await getShopifySession(shop)
  if (!session) throw new Error('No valid session found for shop')
  return new shopify.clients.Graphql({ session: makeSession(session) })
}

export async function getShopifyRestClient(shop: string) {
  const session = await getShopifySession(shop)
  if (!session) throw new Error('No valid session found for shop')
  return new shopify.clients.Rest({ session: makeSession(session) })
}

export async function getShopOnlineStoreUrl(shop: string): Promise<string | null> {
  try {
    const data = await shopifyGraphQL(shop, `{ shop { primaryDomain { url } } }`)
    return data?.shop?.primaryDomain?.url || null
  } catch (error) {
    console.error('[getShopOnlineStoreUrl] Error:', error instanceof Error ? error.message : error)
    return null
  }
}
