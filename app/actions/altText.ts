'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import { validateImageURL } from '@/app/utils/ssrf-protection'
import { requireVerifiedShop } from '@/app/utils/auth'
import { checkRateLimit, RATE_LIMITS } from '@/app/utils/rateLimit'

const apiKey = process.env.GOOGLE_API_KEY || ''
const isGeminiConfigured = apiKey && apiKey !== 'your_google_gemini_api_key'

export async function generateAltText(
  imageUrl: string
): Promise<{ success: boolean; altText?: string; error?: string }> {
  // SECURITY: Require verified shop authentication
  const shop = await requireVerifiedShop()

  // SECURITY: Rate limiting - prevent alt-text generation spam
  const rateLimit = await checkRateLimit(`alt-text:${shop}`, RATE_LIMITS.aiFix)
  if (!rateLimit.allowed) {
    return {
      success: false,
      error: `Rate limit exceeded. You can generate ${rateLimit.limit} alt texts per hour. Please try again after ${new Date(rateLimit.resetTime).toLocaleTimeString()}`,
    }
  }

  if (!isGeminiConfigured) {
    return {
      success: false,
      error: 'Gemini API key not configured. Please add GOOGLE_API_KEY to .env.local',
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
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    // Fetch the image
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      return {
        success: false,
        error: 'Failed to fetch image from URL',
      }
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const base64Image = Buffer.from(imageBuffer).toString('base64')
    const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg'

    const prompt = `Generate a concise, descriptive alt text for this image. The alt text should:
- Be descriptive and specific (describe what's in the image)
- Be concise (under 125 characters if possible)
- Focus on the content and context that's relevant for accessibility
- Not include phrases like "image of" or "picture of"
- Be written in a natural, readable way

Provide ONLY the alt text, nothing else.`

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: base64Image,
        },
      },
      prompt,
    ])

    const response = result.response
    const altText = response.text().trim()

    return {
      success: true,
      altText,
    }
  } catch (error) {
    console.error('Error generating alt text:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}

