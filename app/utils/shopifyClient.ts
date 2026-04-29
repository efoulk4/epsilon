import { getShopifySession, refreshShopifyToken } from './shopifySession'

async function getValidAccessToken(shop: string): Promise<string | null> {
  const session = await getShopifySession(shop)
  if (!session) return null

  if (!session.expires_at) return session.access_token

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
