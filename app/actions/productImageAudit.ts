'use server'

import { requireVerifiedShop } from '@/app/utils/auth'
import { shopifyGraphQL } from '@/app/utils/shopifyClient'
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

const GENERIC_TITLE_PATTERNS = [
  /^new product$/i, /^untitled$/i, /^product \d+$/i, /^draft$/i,
  /^sample$/i, /^test$/i, /^example$/i, /^my product$/i,
]

function isGenericAlt(alt: string): boolean {
  return GENERIC_ALT_PATTERNS.some((p) => p.test(alt.trim()))
}

function isGenericTitle(title: string): boolean {
  return GENERIC_TITLE_PATTERNS.some((p) => p.test(title.trim()))
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

interface ProductData {
  id: string
  title: string
  handle: string
  descriptionHtml: string
  seo: { title: string; description: string }
  images: { id: string; mediaId: string; url: string; altText: string | null }[]
}

const PRODUCT_AUDIT_QUERY = `
  query ProductAudit($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        descriptionHtml
        seo { title description }
        images(first: 20) {
          nodes { id url altText }
        }
        media(first: 20) {
          nodes {
            ... on MediaImage {
              id
              image { url }
            }
          }
        }
      }
    }
  }
`

async function fetchAllProducts(shop: string): Promise<ProductData[]> {
  const products: ProductData[] = []
  let cursor: string | null = null
  let hasNextPage = true

  while (hasNextPage) {
    const data = await shopifyGraphQL(shop, PRODUCT_AUDIT_QUERY, { cursor })
    const page = data?.products
    if (!page) break

    for (const p of page.nodes) {
      // Build a URL → MediaImage GID lookup from the media nodes
      const mediaIdByUrl: Record<string, string> = {}
      for (const m of (p.media?.nodes || [])) {
        if (m.id && m.image?.url) {
          // Strip query params for matching
          const baseUrl = m.image.url.split('?')[0]
          mediaIdByUrl[baseUrl] = m.id
        }
      }

      products.push({
        id: p.id.replace('gid://shopify/Product/', ''),
        title: p.title,
        handle: p.handle,
        descriptionHtml: p.descriptionHtml || '',
        seo: { title: p.seo?.title || '', description: p.seo?.description || '' },
        images: p.images.nodes.map((img: any) => {
          const baseUrl = img.url.split('?')[0]
          return {
            id: img.id,
            mediaId: mediaIdByUrl[baseUrl] || img.id,
            url: img.url,
            altText: img.altText,
          }
        }),
      })
    }

    hasNextPage = page.pageInfo.hasNextPage
    cursor = page.pageInfo.endCursor
  }

  return products
}

export interface ProductAuditResult {
  violations: AuditViolation[]
  issueCount: number
}

export interface ProductAuditError {
  error: string
  details?: string
}

export async function runProductImageAudit(
  idToken?: string
): Promise<ProductAuditResult | ProductAuditError> {
  try {
    const shop = await requireVerifiedShop(idToken)

    const rateLimit = await checkRateLimit(`product-image-audit:${shop}`, RATE_LIMITS.audit)
    if (!rateLimit.allowed) {
      return {
        error: 'Rate limit exceeded',
        details: `Too many audits. Please try again after ${new Date(rateLimit.resetTime).toLocaleTimeString()}`,
      }
    }

    console.log(`[runProductImageAudit] Scanning all products for shop: ${shop}`)
    const products = await fetchAllProducts(shop)

    // Buckets for each violation type
    const missingImageAlt: AuditViolation['nodes'] = []
    const genericImageAlt: AuditViolation['nodes'] = []
    const missingSeoTitle: AuditViolation['nodes'] = []
    const missingDescription: AuditViolation['nodes'] = []
    const genericTitle: AuditViolation['nodes'] = []
    const missingSeoDescription: AuditViolation['nodes'] = []

    for (const product of products) {
      const productUrl = `https://${shop}/products/${product.handle}`
      const commonFields = {
        pageUrl: productUrl,
        _productId: product.id,
        _productHandle: product.handle,
        _productTitle: product.title,
        _seoTitle: product.seo.title,
        _seoDescription: product.seo.description,
        _description: stripHtml(product.descriptionHtml),
      }

      // --- Image alt text ---
      for (const image of product.images) {
        const filename = new URL(image.url).pathname.split('/').pop() || image.url
        const target = [`img[src*="${filename}"]`]

        if (!image.altText || image.altText.trim() === '') {
          missingImageAlt.push({
            html: `<img src="${image.url}" alt="">`,
            target,
            failureSummary: `Product "${product.title}" has an image with no alt text.`,
            _imageSrc: image.url,
            _imageId: image.mediaId,
            _fixType: 'image-alt',
            ...commonFields,
          })
        } else if (isGenericAlt(image.altText)) {
          genericImageAlt.push({
            html: `<img src="${image.url}" alt="${image.altText}">`,
            target,
            failureSummary: `Product "${product.title}" has generic image alt text: "${image.altText}".`,
            _imageSrc: image.url,
            _genericAlt: image.altText,
            _imageId: image.mediaId,
            _fixType: 'image-alt',
            ...commonFields,
          })
        }
      }

      // --- SEO title (page <title> tag) ---
      if (!product.seo.title || product.seo.title.trim() === '') {
        missingSeoTitle.push({
          html: `<title></title>`,
          target: ['head > title'],
          failureSummary: `Product "${product.title}" has no SEO title. The page <title> will be empty or fall back to a generic default.`,
          _fixType: 'seo-title',
          ...commonFields,
        })
      }

      // --- Product description ---
      const plainDescription = stripHtml(product.descriptionHtml)
      if (!plainDescription) {
        missingDescription.push({
          html: `<div class="product-description"></div>`,
          target: ['.product-description'],
          failureSummary: `Product "${product.title}" has no description. Screen readers will find no content about this product.`,
          _fixType: 'product-description',
          ...commonFields,
        })
      }

      // --- Generic product title ---
      if (isGenericTitle(product.title)) {
        genericTitle.push({
          html: `<h1>${product.title}</h1>`,
          target: ['h1'],
          failureSummary: `Product title "${product.title}" is generic and not meaningful to screen reader users.`,
          _fixType: 'product-title',
          ...commonFields,
        })
      }

      // --- SEO description ---
      if (!product.seo.description || product.seo.description.trim() === '') {
        missingSeoDescription.push({
          html: `<meta name="description" content="">`,
          target: ['meta[name="description"]'],
          failureSummary: `Product "${product.title}" has no SEO meta description.`,
          _fixType: 'seo-description',
          ...commonFields,
        })
      }
    }

    const violations: AuditViolation[] = []

    if (missingImageAlt.length > 0) {
      violations.push({
        id: 'product-image-missing-alt',
        impact: 'critical',
        description: 'Product images have no alt text. Screen readers cannot describe these images to visually impaired users.',
        help: 'All product images must have descriptive alt text',
        helpUrl: 'https://www.w3.org/WAI/tutorials/images/',
        nodes: missingImageAlt,
      })
    }

    if (genericImageAlt.length > 0) {
      violations.push({
        id: 'product-image-generic-alt',
        impact: 'serious',
        description: 'Product images have generic alt text that does not describe the image content.',
        help: 'Product images must have descriptive alt text',
        helpUrl: 'https://www.w3.org/WAI/tutorials/images/',
        nodes: genericImageAlt,
      })
    }

    if (missingSeoTitle.length > 0) {
      violations.push({
        id: 'product-missing-seo-title',
        impact: 'critical',
        description: 'Product pages have no SEO title. WCAG 2.4.2 requires pages to have a descriptive title. Screen readers announce the page title first.',
        help: 'Each page must have a descriptive <title> element',
        helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/page-titled.html',
        nodes: missingSeoTitle,
      })
    }

    if (missingDescription.length > 0) {
      violations.push({
        id: 'product-missing-description',
        impact: 'moderate',
        description: 'Product pages have no description. Users relying on screen readers will find no content describing the product.',
        help: 'Product pages should have descriptive content',
        helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
        nodes: missingDescription,
      })
    }

    if (genericTitle.length > 0) {
      violations.push({
        id: 'product-generic-title',
        impact: 'serious',
        description: 'Product titles are generic and not meaningful. Screen readers read the page heading first — a generic title provides no context.',
        help: 'Product titles must be descriptive and unique',
        helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/page-titled.html',
        nodes: genericTitle,
      })
    }

    if (missingSeoDescription.length > 0) {
      violations.push({
        id: 'product-missing-seo-description',
        impact: 'moderate',
        description: 'Product pages have no SEO meta description. This affects how assistive technologies and search engines summarize the page.',
        help: 'Pages should have a meta description',
        helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
        nodes: missingSeoDescription,
      })
    }

    const issueCount = violations.reduce((sum, v) => sum + v.nodes.length, 0)
    console.log(`[runProductImageAudit] Found ${issueCount} issues across ${products.length} products`)

    return { violations, issueCount }
  } catch (error) {
    console.error('[runProductImageAudit] Error:', error)
    return {
      error: 'Failed to audit products',
      details: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
