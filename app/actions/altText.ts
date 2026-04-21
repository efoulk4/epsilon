'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = process.env.GEMINI_API_KEY || ''
const isGeminiConfigured = apiKey && apiKey !== 'your_gemini_api_key_here'

export async function generateAltText(
  imageUrl: string
): Promise<{ success: boolean; altText?: string; error?: string }> {
  if (!isGeminiConfigured) {
    return {
      success: false,
      error: 'Gemini API key not configured. Please add GEMINI_API_KEY to .env.local',
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

export async function saveAltTextToShopify(
  imageId: string,
  altText: string
): Promise<{ success: boolean; error?: string }> {
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN

  if (
    !accessToken ||
    !storeDomain ||
    accessToken === 'your_shopify_access_token_here' ||
    storeDomain === 'your-store.myshopify.com'
  ) {
    return {
      success: false,
      error: 'Shopify API not configured. Please add SHOPIFY_ACCESS_TOKEN and SHOPIFY_STORE_DOMAIN to .env.local',
    }
  }

  try {
    // This is a placeholder for Shopify API integration
    // In a real implementation, you would use the Shopify Admin API to update the image
    const response = await fetch(
      `https://${storeDomain}/admin/api/2024-01/products/images/${imageId}.json`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          image: {
            id: imageId,
            alt: altText,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        error: errorData.errors || 'Failed to update image in Shopify',
      }
    }

    return { success: true }
  } catch (error) {
    console.error('Error saving alt text to Shopify:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}
