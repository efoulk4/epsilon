import { shopifyGraphQL } from './shopifyClient'

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

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim()
}

const SINGLE_PRODUCT_QUERY = `
  query SingleProduct($id: ID!) {
    product(id: $id) {
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
`

export interface ProductViolationSummary {
  productTitle: string
  productHandle: string
  violations: { type: string; description: string }[]
}

/**
 * Audit a single product by its numeric Shopify ID.
 * Returns a summary of violations found, or null if the product is clean.
 */
export async function auditSingleProduct(
  shop: string,
  productId: string | number
): Promise<ProductViolationSummary | null> {
  const gid = `gid://shopify/Product/${productId}`

  const data = await shopifyGraphQL(shop, SINGLE_PRODUCT_QUERY, { id: gid })
  const p = data?.product
  if (!p) return null

  const violations: { type: string; description: string }[] = []

  // Build URL → MediaImage GID lookup
  const mediaIdByUrl: Record<string, string> = {}
  for (const m of (p.media?.nodes || [])) {
    if (m.id && m.image?.url) {
      mediaIdByUrl[m.image.url.split('?')[0]] = m.id
    }
  }

  // Image alt text
  for (const img of (p.images?.nodes || [])) {
    if (!img.altText || img.altText.trim() === '') {
      violations.push({
        type: 'missing-alt',
        description: `Image is missing alt text`,
      })
    } else if (isGenericAlt(img.altText)) {
      violations.push({
        type: 'generic-alt',
        description: `Image has generic alt text: "${img.altText}"`,
      })
    }
  }

  // SEO title
  if (!p.seo?.title || p.seo.title.trim() === '') {
    violations.push({
      type: 'missing-seo-title',
      description: 'Product is missing an SEO title',
    })
  }

  // SEO description
  if (!p.seo?.description || p.seo.description.trim() === '') {
    violations.push({
      type: 'missing-seo-description',
      description: 'Product is missing an SEO meta description',
    })
  }

  // Product description
  if (!stripHtml(p.descriptionHtml || '')) {
    violations.push({
      type: 'missing-description',
      description: 'Product has no description',
    })
  }

  if (violations.length === 0) return null

  return {
    productTitle: p.title,
    productHandle: p.handle,
    violations,
  }
}

/**
 * Persist a product violation notification to Supabase.
 * The merchant sees it as a banner the next time they open the app.
 */
export async function saveProductNotification(
  shop: string,
  productId: string | number,
  summary: ProductViolationSummary
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) return

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await supabase.from('product_notifications').insert({
    shop,
    product_id: String(productId),
    product_title: summary.productTitle,
    product_handle: summary.productHandle,
    violations: summary.violations,
  })

  if (error) {
    console.error('[saveProductNotification] Failed:', error.message)
  }
}
