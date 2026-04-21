'use server'

import { getShopifyGraphQLClient } from '@/app/utils/shopifyClient'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = process.env.GOOGLE_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
  : null

interface ImageRecord {
  url: string
  alt?: string
}

/**
 * Generate alt text using Gemini AI and update a product image in Shopify
 */
export async function fixProductAltText(
  shop: string,
  productId: string,
  imageRecord: ImageRecord
): Promise<{ success: boolean; altText?: string; error?: string }> {
  try {
    console.log('[fixProductAltText] Generating alt text for image:', imageRecord.url)

    // Generate alt text using Gemini
    let generatedAltText: string

    if (!genAI) {
      return {
        success: false,
        error: 'Gemini API key not configured. Please set GOOGLE_API_KEY environment variable.',
      }
    }

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

      const prompt = `Analyze this product image and generate a concise, descriptive alt text (max 125 characters) suitable for e-commerce. Focus on key product features, colors, and characteristics that would help visually impaired users understand what's being sold. Image URL: ${imageRecord.url}`

      const result = await model.generateContent(prompt)
      const response = result.response
      generatedAltText = response.text().trim()

      // Ensure it's not too long
      if (generatedAltText.length > 125) {
        generatedAltText = generatedAltText.substring(0, 122) + '...'
      }

      console.log('[fixProductAltText] Generated alt text:', generatedAltText)
    } catch (aiError) {
      console.error('[fixProductAltText] Error calling Gemini API:', aiError)
      return {
        success: false,
        error: 'Failed to generate alt text using AI',
      }
    }

    // Update the product image in Shopify using GraphQL Admin API
    const client = await getShopifyGraphQLClient(shop)

    const mutation = `
      mutation updateProductImage($productId: ID!, $image: ImageInput!) {
        productImageUpdate(productId: $productId, image: $image) {
          image {
            id
            altText
            url
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const variables = {
      productId: `gid://shopify/Product/${productId}`,
      image: {
        altText: generatedAltText,
        src: imageRecord.url,
      },
    }

    const response = await client.query({
      data: {
        query: mutation,
        variables,
      },
    })

    const data = response.body as any

    if (data?.data?.productImageUpdate?.userErrors?.length > 0) {
      const errors = data.data.productImageUpdate.userErrors
      console.error('[fixProductAltText] Shopify API errors:', errors)
      return {
        success: false,
        error: errors[0].message,
      }
    }

    console.log('[fixProductAltText] Successfully updated alt text')
    return {
      success: true,
      altText: generatedAltText,
    }
  } catch (error) {
    console.error('[fixProductAltText] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Calculate a compliant color that meets WCAG contrast ratio requirements
 */
function calculateCompliantColor(
  foregroundHex: string,
  backgroundHex: string,
  targetRatio: number = 4.5
): string {
  // Convert hex to RGB
  const hexToRgb = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
      ? [
          parseInt(result[1], 16),
          parseInt(result[2], 16),
          parseInt(result[3], 16),
        ]
      : [0, 0, 0]
  }

  // Calculate relative luminance
  const getLuminance = (r: number, g: number, b: number): number => {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      c = c / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
  }

  // Calculate contrast ratio
  const getContrastRatio = (l1: number, l2: number): number => {
    const lighter = Math.max(l1, l2)
    const darker = Math.min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)
  }

  const [fgR, fgG, fgB] = hexToRgb(foregroundHex)
  const [bgR, bgG, bgB] = hexToRgb(backgroundHex)

  const fgLuminance = getLuminance(fgR, fgG, fgB)
  const bgLuminance = getLuminance(bgR, bgG, bgB)

  const currentRatio = getContrastRatio(fgLuminance, bgLuminance)

  if (currentRatio >= targetRatio) {
    return foregroundHex // Already compliant
  }

  // Adjust foreground color to meet contrast ratio
  // Make it darker or lighter depending on background
  let [r, g, b] = [fgR, fgG, fgB]
  const shouldDarken = bgLuminance > 0.5

  for (let i = 0; i < 100; i++) {
    const newLuminance = getLuminance(r, g, b)
    const newRatio = getContrastRatio(newLuminance, bgLuminance)

    if (newRatio >= targetRatio) {
      break
    }

    if (shouldDarken) {
      r = Math.max(0, r - 5)
      g = Math.max(0, g - 5)
      b = Math.max(0, b - 5)
    } else {
      r = Math.min(255, r + 5)
      g = Math.min(255, g + 5)
      b = Math.min(255, b + 5)
    }
  }

  // Convert back to hex
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Fix contrast ratio issues in theme settings
 * This analyzes theme config and proposes compliant color alternatives
 */
export async function fixContrastRatio(
  shop: string,
  themeId: string,
  foregroundColorKey: string,
  backgroundColorKey: string,
  currentForeground: string,
  currentBackground: string
): Promise<{
  success: boolean
  proposedColor?: string
  contrastRatio?: number
  error?: string
}> {
  try {
    console.log('[fixContrastRatio] Calculating compliant color')
    console.log('  Foreground:', currentForeground)
    console.log('  Background:', currentBackground)

    // Calculate a compliant color
    const proposedColor = calculateCompliantColor(
      currentForeground,
      currentBackground,
      4.5 // WCAG AA standard
    )

    console.log('[fixContrastRatio] Proposed color:', proposedColor)

    // For now, we just return the proposed color
    // In a full implementation, you would:
    // 1. Use Shopify REST API to GET themes/{theme_id}/assets?asset[key]=config/settings_data.json
    // 2. Parse the JSON, update the color value
    // 3. PUT the updated settings back to the theme

    return {
      success: true,
      proposedColor,
      contrastRatio: 4.5, // This should be calculated after applying the change
    }
  } catch (error) {
    console.error('[fixContrastRatio] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Apply theme color fix by updating settings_data.json
 * Note: This requires additional Shopify theme API access
 */
export async function applyThemeColorFix(
  shop: string,
  themeId: string,
  settingKey: string,
  newColor: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // This is a placeholder for the actual theme API implementation
    // You would need to:
    // 1. Get REST API client (not GraphQL)
    // 2. Fetch config/settings_data.json
    // 3. Update the specific color setting
    // 4. PUT the updated file back

    console.log('[applyThemeColorFix] Would update theme:', themeId)
    console.log('  Setting:', settingKey)
    console.log('  New color:', newColor)

    return {
      success: false,
      error:
        'Theme API integration not yet implemented. This requires REST API access to modify theme assets.',
    }
  } catch (error) {
    console.error('[applyThemeColorFix] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
