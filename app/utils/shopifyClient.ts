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

export async function getShopifyGraphQLClient(shop: string) {
  console.log('[getShopifyGraphQLClient] Getting session for shop:', shop)
  const session = await getShopifySession(shop)

  if (!session) {
    console.error('[getShopifyGraphQLClient] No session found for shop:', shop)
    throw new Error('No valid session found for shop')
  }

  // SECURITY: Do not log session details (tokens, scopes)

  const client = new shopify.clients.Graphql({
    session: {
      id: `offline_${session.shop}`,
      shop: session.shop,
      accessToken: session.access_token,
      state: 'authenticated',
      isOnline: session.is_online,
      scope: session.scope || '',
    } as any,
  })

  return client
}

export async function getShopifyRestClient(shop: string) {
  const session = await getShopifySession(shop)

  if (!session) {
    throw new Error('No valid session found for shop')
  }

  const client = new shopify.clients.Rest({
    session: {
      id: `offline_${session.shop}`,
      shop: session.shop,
      accessToken: session.access_token,
      state: 'authenticated',
      isOnline: session.is_online,
      scope: session.scope || '',
    } as any,
  })

  return client
}

// Helper function to get shop's online store URL
export async function getShopOnlineStoreUrl(shop: string): Promise<string | null> {
  try {
    console.log('[getShopOnlineStoreUrl] Attempting to get URL for shop:', shop)

    const client = await getShopifyGraphQLClient(shop)
    console.log('[getShopOnlineStoreUrl] GraphQL client created successfully')

    const response = await client.query({
      data: {
        query: `{
          shop {
            primaryDomain {
              url
            }
          }
        }`,
      },
    })

    console.log('[getShopOnlineStoreUrl] GraphQL response:', JSON.stringify(response.body))
    const data = response.body as any

    const url = data?.data?.shop?.primaryDomain?.url || null
    console.log('[getShopOnlineStoreUrl] Extracted URL:', url)

    return url
  } catch (error) {
    console.error('[getShopOnlineStoreUrl] Error fetching shop online store URL:', error)
    if (error instanceof Error) {
      console.error('[getShopOnlineStoreUrl] Error message:', error.message)
      console.error('[getShopOnlineStoreUrl] Error stack:', error.stack)
    }
    return null
  }
}
