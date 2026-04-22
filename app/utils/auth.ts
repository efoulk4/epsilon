'use server'

import { headers } from 'next/headers'
import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api'
import '@shopify/shopify-api/adapters/node'
import { isValidShopDomain } from './validation'

// Initialize Shopify API for session token validation
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: process.env.SHOPIFY_SCOPES?.split(',') || ['read_products', 'write_products'],
  hostName: process.env.SHOPIFY_APP_URL!.replace(/https?:\/\//, ''),
  hostScheme: 'https',
  apiVersion: ApiVersion.October24,
  isEmbeddedApp: true,
})

/**
 * SECURITY CRITICAL: Extract and cryptographically verify shop from Shopify's signed session token
 * NEVER trust shop from query params, client state, form data, or unverified headers
 *
 * This function uses Shopify's official library to verify JWT signatures against Shopify's secret.
 * Fail-closed: returns null for any invalid, missing, or unverifiable tokens.
 */
export async function getVerifiedShop(): Promise<string | null> {
  try {
    const headersList = await headers()
    const authHeader = headersList.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[getVerifiedShop] No valid Authorization header')
      return null
    }

    const token = authHeader.substring(7)

    // SECURITY: Use Shopify's official session token validation
    // This cryptographically verifies the JWT signature using the app secret
    const sessionToken = await shopify.session.decodeSessionToken(token)

    // Verify token is not expired
    if (sessionToken.exp * 1000 < Date.now()) {
      console.error('[getVerifiedShop] Token expired')
      return null
    }

    // Extract shop from verified token
    const shop = sessionToken.dest.replace('https://', '')

    if (!isValidShopDomain(shop)) {
      console.error('[getVerifiedShop] Invalid shop domain format')
      return null
    }

    return shop
  } catch (error) {
    // SECURITY: Fail closed on any verification error
    console.error('[getVerifiedShop] Verification failed:', error instanceof Error ? error.message : 'Unknown error')
    return null
  }
}

/**
 * SECURITY CRITICAL: Require cryptographically verified shop or throw error
 * Use this in all server actions that need tenant authentication
 *
 * Throws immediately if authentication fails - no fallback paths
 */
export async function requireVerifiedShop(): Promise<string> {
  const shop = await getVerifiedShop()

  if (!shop) {
    throw new Error('Unauthorized: No verified shop session. Valid Shopify session token required.')
  }

  return shop
}

/**
 * Validate that a provided shop matches the cryptographically verified shop
 * Use this when a server action receives a shop parameter that must match auth
 */
export async function validateShopMatch(providedShop: string): Promise<string> {
  const verifiedShop = await requireVerifiedShop()

  if (providedShop !== verifiedShop) {
    throw new Error('Unauthorized: Shop mismatch. Provided shop does not match authenticated session.')
  }

  return verifiedShop
}
