'use server'

import { requireVerifiedShop } from '@/app/utils/auth'
import { getShopifyGraphQLClient } from '@/app/utils/shopifyClient'
import { checkRateLimit, RATE_LIMITS } from '@/app/utils/rateLimit'
import type { AuditViolation } from '@/types/audit'

const GENERIC_ALT_PATTERNS = [
  /^image$/i, /^photo$/i, /^picture$/i, /^img$/i, /^graphic$/i,
  /^icon$/i, /^logo$/i, /^banner$/i, /^thumbnail$/i, /^placeholder$/i,
  /^untitled$/i, /^image \d+$/i, /^photo \d+$/i, /^product image$/i,
  /^product photo$/i, /^product picture$/i, /^shop image$/i,
  /^store image$/i, /^\d+$/i, /^dsc\d+$/i, /^img\d+$/i,
  /^screenshot$/i, /^image \d+ of \d+$/i,
]

function isGenericAlt(alt: string): boolean {
  return GENERIC_ALT_PATTERNS.some((p) => p.test(alt.trim()))
}

interface ProductImageResult {
  productId: string
  productTitle: string
  productHandle: string
  imageId: string
  imageSrc: string
  altText: string | null
  issue: 'missing' | 'generic'
}

/**
 * Paginate through all products in the shop and collect images with
 * missing or generic alt text using the Admin GraphQL API.
 */
async function fetchAllProductImageIssues(shop: string): Promise<ProductImageResult[]> {
  const client = await getShopifyGraphQLClient(shop)
  const issues: ProductImageResult[] = []
  let cursor: string | null = null
  let hasNextPage = true

  while (hasNextPage) {
    const query = `
      query ProductImages($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            title
            handle
            images(first: 20) {
              nodes {
                id
                url
                altText
              }
            }
          }
        }
      }
    `

    const response = await client.query({
      data: { query, variables: { cursor } },
    })

    const data = (response.body as any)?.data?.products
    if (!data) break

    for (const product of data.nodes) {
      const productId = product.id.replace('gid://shopify/Product/', '')
      for (const image of product.images.nodes) {
        const alt = image.altText

        if (alt === null || alt === undefined || alt.trim() === '') {
          issues.push({
            productId,
            productTitle: product.title,
            productHandle: product.handle,
            imageId: image.id,
            imageSrc: image.url,
            altText: null,
            issue: 'missing',
          })
        } else if (isGenericAlt(alt)) {
          issues.push({
            productId,
            productTitle: product.title,
            productHandle: product.handle,
            imageId: image.id,
            imageSrc: image.url,
            altText: alt,
            issue: 'generic',
          })
        }
      }
    }

    hasNextPage = data.pageInfo.hasNextPage
    cursor = data.pageInfo.endCursor
  }

  return issues
}

export interface ProductImageAuditResult {
  violations: AuditViolation[]
  totalProducts: number
  totalImages: number
  issueCount: number
}

export interface ProductImageAuditError {
  error: string
  details?: string
}

/**
 * Scan all product images in the shop via Admin API for missing/generic alt text.
 * This is the embedded-only counterpart to the Playwright audit — covers every
 * product image in the catalog, not just what appears on scanned pages.
 */
export async function runProductImageAudit(
  idToken?: string
): Promise<ProductImageAuditResult | ProductImageAuditError> {
  try {
    const shop = await requireVerifiedShop(idToken)

    const rateLimit = await checkRateLimit(`product-image-audit:${shop}`, RATE_LIMITS.audit)
    if (!rateLimit.allowed) {
      return {
        error: 'Rate limit exceeded',
        details: `Too many audits. Please try again after ${new Date(rateLimit.resetTime).toLocaleTimeString()}`,
      }
    }

    console.log(`[runProductImageAudit] Scanning all product images for shop: ${shop}`)

    const issues = await fetchAllProductImageIssues(shop)

    // Group issues into two violations: missing alt and generic alt
    const missingAltNodes = issues
      .filter((i) => i.issue === 'missing')
      .map((i) => ({
        html: `<img src="${i.imageSrc}" alt="">`,
        target: [`img[src*="${new URL(i.imageSrc).pathname.split('/').pop()}"]`],
        failureSummary: `Product "${i.productTitle}" has an image with no alt text.`,
        pageUrl: `https://${shop}/products/${i.productHandle}`,
        _imageSrc: i.imageSrc,
        _productId: i.productId,
        _imageId: i.imageId,
      }))

    const genericAltNodes = issues
      .filter((i) => i.issue === 'generic')
      .map((i) => ({
        html: `<img src="${i.imageSrc}" alt="${i.altText}">`,
        target: [`img[src*="${new URL(i.imageSrc).pathname.split('/').pop()}"]`],
        failureSummary: `Product "${i.productTitle}" has generic alt text: "${i.altText}".`,
        pageUrl: `https://${shop}/products/${i.productHandle}`,
        _imageSrc: i.imageSrc,
        _genericAlt: i.altText ?? undefined,
        _productId: i.productId,
        _imageId: i.imageId,
      }))

    const violations: AuditViolation[] = []

    if (missingAltNodes.length > 0) {
      violations.push({
        id: 'product-image-missing-alt',
        impact: 'critical',
        description: 'Product images have no alt text. Screen readers cannot describe these images to visually impaired users.',
        help: 'All product images must have descriptive alt text',
        helpUrl: 'https://www.w3.org/WAI/tutorials/images/',
        nodes: missingAltNodes,
      })
    }

    if (genericAltNodes.length > 0) {
      violations.push({
        id: 'product-image-generic-alt',
        impact: 'serious',
        description: 'Product images have generic alt text that does not describe the image content.',
        help: 'Product images must have descriptive alt text',
        helpUrl: 'https://www.w3.org/WAI/tutorials/images/',
        nodes: genericAltNodes,
      })
    }

    console.log(`[runProductImageAudit] Found ${issues.length} issues across product images`)

    return {
      violations,
      totalProducts: 0, // populated below
      totalImages: issues.length,
      issueCount: issues.length,
    }
  } catch (error) {
    console.error('[runProductImageAudit] Error:', error)
    return {
      error: 'Failed to audit product images',
      details: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
