/**
 * Validation utilities - can be used on client or server
 */

/**
 * Validate that a shop domain follows Shopify's format
 * Only allow .myshopify.com domains
 */
export function isValidShopDomain(shop: string): boolean {
  const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/
  return shopRegex.test(shop) && !shop.includes('..')
}
