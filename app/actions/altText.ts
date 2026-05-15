'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import Anthropic from '@anthropic-ai/sdk'
import { validateImageURL } from '@/app/utils/ssrf-protection'
import { requireVerifiedShop } from '@/app/utils/auth'
import { checkRateLimit, RATE_LIMITS } from '@/app/utils/rateLimit'
import { shopifyGraphQL } from '@/app/utils/shopifyClient'

const apiKey = process.env.GOOGLE_API_KEY || ''
const isGeminiConfigured = apiKey && apiKey !== 'your_google_gemini_api_key'

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return msg.includes('503') || msg.includes('unavailable') || msg.includes('high demand') || msg.includes('overloaded') || msg.includes('rate limit') || msg.includes('429')
}

export async function generateAltText(
  imageUrl: string,
  idToken?: string
): Promise<{ success: boolean; altText?: string; error?: string }> {
  // SECURITY: Require verified shop authentication
  const shop = await requireVerifiedShop(idToken)

  // SECURITY: Rate limiting - prevent alt-text generation spam
  const rateLimit = await checkRateLimit(`alt-text:${shop}`, RATE_LIMITS.aiFix)
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: `Rate limit exceeded. You can generate ${rateLimit.limit} alt texts per hour. Please try again after ${new Date(rateLimit.resetTime).toLocaleTimeString()}`,
    }
  }

  if (!isGeminiConfigured && !anthropic) {
    return {
      success: false,
      error: 'No AI provider configured — add GOOGLE_API_KEY or ANTHROPIC_API_KEY',
    }
  }

  // SECURITY: Validate image URL to prevent SSRF
  const validation = validateImageURL(imageUrl)
  if (!validation.allowed) {
    return {
      success: false,
      error: validation.error || 'Invalid image URL',
    }
  }

  try {
    // Fetch the image — redirect: 'error' prevents SSRF via open redirect
    const imageResponse = await fetch(imageUrl, { redirect: 'error' })
    if (!imageResponse.ok) {
      return { success: false, error: 'Failed to fetch image from URL' }
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const base64Image = Buffer.from(imageBuffer).toString('base64')
    const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg'

    const prompt = `You are writing alt text for a product image on an e-commerce store. Generate a concise, descriptive alt text that:
- Describes the product shown (type, color, key features)
- Is under 125 characters
- Does NOT start with "image of", "photo of", or "picture of"
- Is specific enough to distinguish this product from similar ones
- Reads naturally when announced by a screen reader

Provide ONLY the alt text, nothing else.`

    if (isGeminiConfigured) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
        const result = await model.generateContent([
          { inlineData: { mimeType, data: base64Image } },
          prompt,
        ])
        return { success: true, altText: result.response.text().trim() }
      } catch (err) {
        if (!isTransientError(err)) throw err
        console.warn('[generateAltText] Gemini transient error, falling back to Claude:', err instanceof Error ? err.message : err)
      }
    }

    if (anthropic) {
      const msg = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64Image } },
            { type: 'text', text: prompt },
          ],
        }],
      })
      const block = msg.content[0]
      if (block.type === 'text') return { success: true, altText: block.text.trim() }
    }

    return { success: false, error: 'No AI provider available' }
  } catch (error) {
    console.error('Error generating alt text:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

export async function applyAltText(
  imageId: string,
  productId: string,
  altText: string,
  idToken?: string
): Promise<{ success: boolean; error?: string }> {
  const shop = await requireVerifiedShop(idToken)

  const rateLimit = await checkRateLimit(`alt-text:${shop}`, RATE_LIMITS.aiFix)
  if (!rateLimit.allowed) {
    return { success: false, error: 'Rate limit exceeded. Please try again later.' }
  }

  try {
    const mutation = `
      mutation productUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
        productUpdateMedia(productId: $productId, media: $media) {
          media { ... on MediaImage { id alt } }
          mediaUserErrors { field message }
        }
      }
    `

    const data = await shopifyGraphQL(shop, mutation, {
      productId: `gid://shopify/Product/${productId}`,
      media: [{ id: imageId, alt: altText }],
    })

    const errors = data?.productUpdateMedia?.mediaUserErrors
    if (errors?.length > 0) {
      return { success: false, error: errors[0].message }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply alt text',
    }
  }
}

