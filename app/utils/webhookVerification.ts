import crypto from 'crypto'

/**
 * Verify a Shopify webhook request using HMAC-SHA256.
 *
 * Shopify signs every webhook with the app secret. We must verify this
 * signature before trusting any webhook payload — an unverified webhook
 * could contain attacker-controlled data.
 *
 * https://shopify.dev/docs/apps/build/webhooks/secure/validate-webhooks
 */
export async function verifyShopifyWebhook(request: Request): Promise<{
  valid: boolean
  body: string
  shop: string | null
}> {
  const hmacHeader = request.headers.get('x-shopify-hmac-sha256')
  const shopHeader = request.headers.get('x-shopify-shop-domain')
  const secret = process.env.SHOPIFY_API_SECRET

  if (!hmacHeader || !secret) {
    return { valid: false, body: '', shop: null }
  }

  const body = await request.text()

  const digest = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64')

  // Constant-time comparison to prevent timing attacks
  const valid =
    digest.length === hmacHeader.length &&
    crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader))

  return { valid, body, shop: shopHeader }
}
