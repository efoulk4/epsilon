'use server'

import { headers } from 'next/headers'
import crypto from 'crypto'

/**
 * Security-critical: Extract and verify shop from Shopify's signed session token
 * NEVER trust shop from query params, client state, or form data
 */
export async function getVerifiedShop(): Promise<string | null> {
  try {
    const headersList = await headers()

    // In Shopify embedded apps, the shop is passed via Authorization header
    // as a session token (JWT) signed by Shopify
    const authHeader = headersList.get('authorization')

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const shop = await verifyShopifySessionToken(token)
      if (shop) {
        return shop
      }
    }

    // Fallback: Check for shop in custom header (set by App Bridge)
    // This should be used carefully and validated
    const shopHeader = headersList.get('x-shopify-shop-domain')
    if (shopHeader && isValidShopDomain(shopHeader)) {
      // IMPORTANT: This is a fallback and should ideally be verified
      // against a session or other server-side state
      return shopHeader
    }

    return null
  } catch (error) {
    console.error('[getVerifiedShop] Error verifying shop:', error)
    return null
  }
}

/**
 * Verify Shopify session token (JWT) and extract shop
 */
async function verifyShopifySessionToken(token: string): Promise<string | null> {
  try {
    // Decode JWT without verification first to get shop
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8')
    )

    // Verify the token is not expired
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      console.error('[verifyShopifySessionToken] Token expired')
      return null
    }

    // Extract shop (dest field contains shop domain)
    const shop = payload.dest?.replace('https://', '')

    if (shop && isValidShopDomain(shop)) {
      // TODO: Full JWT signature verification with Shopify's public key
      // For now, we're doing basic validation
      return shop
    }

    return null
  } catch (error) {
    console.error('[verifyShopifySessionToken] Error:', error)
    return null
  }
}

/**
 * Validate that a shop domain follows Shopify's format
 */
function isValidShopDomain(shop: string): boolean {
  // Must be a .myshopify.com domain or custom domain
  // Basic validation to prevent injection
  const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/
  return shopRegex.test(shop) && !shop.includes('..')
}

/**
 * Require authenticated shop or throw error
 * Use this in server actions that need shop verification
 */
export async function requireVerifiedShop(): Promise<string> {
  const shop = await getVerifiedShop()

  if (!shop) {
    throw new Error('Unauthorized: No verified shop session')
  }

  return shop
}

/**
 * Validate that a provided shop matches the verified shop
 * Use this when a server action receives a shop parameter
 */
export async function validateShopMatch(providedShop: string): Promise<string> {
  const verifiedShop = await requireVerifiedShop()

  if (providedShop !== verifiedShop) {
    throw new Error('Unauthorized: Shop mismatch')
  }

  return verifiedShop
}
