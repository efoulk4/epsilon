'use server'

import { requireVerifiedShop } from '@/app/utils/auth'
import { shopifyGraphQL } from '@/app/utils/shopifyClient'
import { checkRateLimit, RATE_LIMITS } from '@/app/utils/rateLimit'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = process.env.GOOGLE_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
  : null

interface FixContext {
  productId: string
  productTitle: string
  productHandle: string
  description: string
  seoTitle: string
  seoDescription: string
  fixType: 'seo-title' | 'seo-description' | 'product-title' | 'product-description'
}

interface FixResult {
  success: boolean
  generatedContent?: string
  applied?: boolean
  error?: string
}

/**
 * Generate content with Gemini for a specific product content field.
 */
async function generateContent(ctx: FixContext): Promise<string> {
  if (!genAI) throw new Error('Gemini API key not configured')

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const context = `
Product title: "${ctx.productTitle}"
Current description: "${ctx.description || 'None'}"
Current SEO title: "${ctx.seoTitle || 'None'}"
Current SEO description: "${ctx.seoDescription || 'None'}"
`.trim()

  const prompts: Record<FixContext['fixType'], string> = {
    'seo-title': `You are an e-commerce SEO and accessibility expert. Generate a descriptive, specific SEO page title for a Shopify product page.

${context}

Requirements:
- 50-60 characters maximum
- Describe what the product actually is
- Be specific, not generic
- Do not include the store name
- Output ONLY the title text, nothing else`,

    'seo-description': `You are an e-commerce SEO and accessibility expert. Generate a meta description for a Shopify product page.

${context}

Requirements:
- 150-160 characters maximum
- Summarize what the product is and its key benefit
- Be specific and informative
- Output ONLY the description text, nothing else`,

    'product-title': `You are an e-commerce expert. Generate a clear, descriptive product title for a Shopify store.

${context}

Requirements:
- 60 characters maximum
- Describe what the product actually is
- Be specific and meaningful
- Output ONLY the title text, nothing else`,

    'product-description': `You are an e-commerce content writer and accessibility expert. Generate a product description for a Shopify store product page.

${context}

Requirements:
- 2-4 sentences
- Describe what the product is, its key features, and who it's for
- Write in plain, clear language accessible to all users
- Do not use HTML tags
- Output ONLY the description text, nothing else`,
  }

  const result = await model.generateContent(prompts[ctx.fixType])
  return result.response.text().trim()
}

/**
 * Apply generated content back to Shopify via GraphQL mutation.
 */
async function applyContentFix(
  shop: string,
  ctx: FixContext,
  generatedContent: string
): Promise<{ success: boolean; error?: string }> {
  const productGid = `gid://shopify/Product/${ctx.productId}`

  let input: Record<string, any>

  switch (ctx.fixType) {
    case 'product-title':
      input = { id: productGid, title: generatedContent }
      break
    case 'product-description':
      input = { id: productGid, descriptionHtml: `<p>${generatedContent}</p>` }
      break
    case 'seo-title':
      input = { id: productGid, seo: { title: generatedContent } }
      break
    case 'seo-description':
      input = { id: productGid, seo: { description: generatedContent } }
      break
  }

  const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title seo { title description } }
        userErrors { field message }
      }
    }
  `

  const data = await shopifyGraphQL(shop, mutation, { input })
  const result = data?.productUpdate

  if (result?.userErrors?.length > 0) {
    return { success: false, error: result.userErrors[0].message }
  }

  return { success: true }
}

export async function fixProductContentWithAI(
  ctx: {
    productId: string
    productHandle: string
    productTitle: string
    description: string
    seoTitle: string
    seoDescription: string
    fixType: 'seo-title' | 'seo-description' | 'product-title' | 'product-description'
  },
  idToken?: string
): Promise<FixResult> {
  try {
    const shop = await requireVerifiedShop(idToken)

    const rateLimit = await checkRateLimit(`ai-fix:${shop}`, RATE_LIMITS.aiFix)
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Rate limit exceeded. Try again after ${new Date(rateLimit.resetTime).toLocaleTimeString()}`,
      }
    }

    if (!genAI) {
      return { success: false, error: 'Gemini API key not configured' }
    }

    const generatedContent = await generateContent(ctx)
    return { success: true, generatedContent, applied: false }
  } catch (error) {
    console.error('[fixProductContentWithAI] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export async function applyProductContent(
  ctx: {
    productId: string
    productHandle: string
    productTitle: string
    description: string
    seoTitle: string
    seoDescription: string
    fixType: 'seo-title' | 'seo-description' | 'product-title' | 'product-description'
  },
  content: string,
  idToken?: string
): Promise<FixResult> {
  try {
    const shop = await requireVerifiedShop(idToken)
    const applyResult = await applyContentFix(shop, ctx, content)
    if (!applyResult.success) {
      return { success: false, error: applyResult.error }
    }
    return { success: true, generatedContent: content, applied: true }
  } catch (error) {
    console.error('[applyProductContent] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
