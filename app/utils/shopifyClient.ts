import { shopifyApi, ApiVersion } from '@shopify/shopify-api'
import '@shopify/shopify-api/adapters/node'
import { getShopifySession } from './shopifySession'

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

export async function shopifyGraphQL(shop: string, query: string, variables?: Record<string, any>): Promise<any> {
  const session = await getShopifySession(shop)
  if (!session) throw new Error('No valid session found for shop')

  const client = new shopify.clients.Graphql({ session: makeSession(session) })
  const response = await client.request(query, { variables })
  return response.data
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
