'use server'

import { getShopifyGraphQLClient } from '@/app/utils/shopifyClient'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AuditViolation } from '@/types/audit'

const genAI = process.env.GOOGLE_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
  : null

interface ImageRecord {
  url: string
  alt?: string
}

interface ViolationNode {
  html: string
  target: string[]
  failureSummary: string
}

/**
 * Generate CSS override fix that can be injected into the theme
 * This creates a CSS rule that targets the specific element and applies the fix
 */
function generateCSSFix(
  node: ViolationNode,
  correctedCode: string,
  fixData: any
): string | null {
  // Generate a CSS selector from the target path
  const cssSelector = node.target.join(' ')

  // Extract style properties from corrected code if it's an inline style fix
  if (correctedCode.includes('style=')) {
    const styleMatch = correctedCode.match(/style="([^"]+)"/)
    if (styleMatch) {
      const styles = styleMatch[1]
      return `/* Accessibility Fix: ${fixData.explanation} */\n${cssSelector} {\n  ${styles.replace(/;/g, ';\n  ')}\n}`
    }
  }

  // For color contrast fixes, extract the color
  if (fixData.fixType === 'color' && correctedCode.includes('color:')) {
    const colorMatch = correctedCode.match(/color:\s*([^;'"]+)/)
    if (colorMatch) {
      return `/* Accessibility Fix: ${fixData.explanation} */\n${cssSelector} {\n  color: ${colorMatch[1]};\n}`
    }
  }

  return null
}

/**
 * Extract product ID from HTML or selector
 */
function extractProductId(html: string, selector: string[]): string | null {
  // Try to find data-product-id attribute
  const dataIdMatch = html.match(/data-product-id="?(\d+)"?/)
  if (dataIdMatch) return dataIdMatch[1]

  // Try to find in selector path
  const selectorStr = selector.join(' ')
  const selectorIdMatch = selectorStr.match(/product-(\d+)/)
  if (selectorIdMatch) return selectorIdMatch[1]

  return null
}

/**
 * Extract page ID from HTML or selector
 */
function extractPageId(html: string, selector: string[]): string | null {
  const dataIdMatch = html.match(/data-page-id="?(\d+)"?/)
  if (dataIdMatch) return dataIdMatch[1]

  const selectorStr = selector.join(' ')
  const selectorIdMatch = selectorStr.match(/page-(\d+)/)
  if (selectorIdMatch) return selectorIdMatch[1]

  return null
}

/**
 * Apply fix to product content via Shopify GraphQL API
 */
async function applyProductContentFix(
  shop: string,
  productId: string,
  correctedHtml: string,
  field: 'title' | 'descriptionHtml' = 'descriptionHtml'
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await getShopifyGraphQLClient(shop)

    const mutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            ${field}
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const variables = {
      input: {
        id: `gid://shopify/Product/${productId}`,
        [field]: correctedHtml,
      },
    }

    const response = await client.query({
      data: {
        query: mutation,
        variables,
      },
    })

    const data = response.body as any

    if (data?.data?.productUpdate?.userErrors?.length > 0) {
      const errors = data.data.productUpdate.userErrors
      return {
        success: false,
        error: errors[0].message,
      }
    }

    return { success: true }
  } catch (error) {
    console.error('[applyProductContentFix] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update product',
    }
  }
}

/**
 * Apply fix to page content via Shopify GraphQL API
 */
async function applyPageContentFix(
  shop: string,
  pageId: string,
  correctedHtml: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = await getShopifyGraphQLClient(shop)

    const mutation = `
      mutation pageUpdate($id: ID!, $page: PageInput!) {
        pageUpdate(id: $id, page: $page) {
          page {
            id
            body
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    const variables = {
      id: `gid://shopify/OnlinePage/${pageId}`,
      page: {
        body: correctedHtml,
      },
    }

    const response = await client.query({
      data: {
        query: mutation,
        variables,
      },
    })

    const data = response.body as any

    if (data?.data?.pageUpdate?.userErrors?.length > 0) {
      const errors = data.data.pageUpdate.userErrors
      return {
        success: false,
        error: errors[0].message,
      }
    }

    return { success: true }
  } catch (error) {
    console.error('[applyPageContentFix] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update page',
    }
  }
}

/**
 * Apply a code fix by updating content via Shopify APIs
 * This intelligently routes to the right API based on the fix data
 */
async function applyCodeFix(
  shop: string,
  node: ViolationNode,
  fixData: any
): Promise<{ success: boolean; error?: string; appliedFix?: boolean }> {
  try {
    console.log('[applyCodeFix] Attempting to apply fix')
    console.log('  Location:', fixData.location)
    console.log('  Apply method:', fixData.applyMethod)

    // If the fix can be applied via API
    if (fixData.applyMethod === 'api' && fixData.correctedCode) {
      if (fixData.location === 'product') {
        // Extract product ID
        const productId =
          fixData.shopifyResourceId ||
          extractProductId(node.html, node.target)

        if (!productId) {
          return {
            success: false,
            error: 'Could not identify product ID from violation',
          }
        }

        // Apply product fix
        const result = await applyProductContentFix(
          shop,
          productId,
          fixData.correctedCode,
          fixData.apiDetails?.field || 'descriptionHtml'
        )

        if (result.success) {
          return {
            success: true,
            appliedFix: true,
          }
        }

        return result
      } else if (fixData.location === 'page') {
        // Extract page ID
        const pageId =
          fixData.shopifyResourceId || extractPageId(node.html, node.target)

        if (!pageId) {
          return {
            success: false,
            error: 'Could not identify page ID from violation',
          }
        }

        // Apply page fix
        const result = await applyPageContentFix(shop, pageId, fixData.correctedCode)

        if (result.success) {
          return {
            success: true,
            appliedFix: true,
          }
        }

        return result
      }
    }

    // If we can't apply via API, note that it needs Theme App Extension or manual fix
    return {
      success: false,
      error:
        'This fix requires a Theme App Extension to apply automatically. CSS has been generated for manual application.',
    }
  } catch (error) {
    console.error('[applyCodeFix] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply fix',
    }
  }
}

/**
 * AI-powered agent that analyzes violations and generates code fixes
 * This is the main entry point for fixing any accessibility violation
 */
export async function fixViolationWithAI(
  shop: string,
  violation: {
    id: string
    description: string
    help: string
    helpUrl: string
    node: ViolationNode
  }
): Promise<{
  success: boolean
  fixDescription?: string
  appliedFix?: boolean
  cssCode?: string
  error?: string
  detailedInstructions?: {
    steps: string[]
    themeFile?: string
    searchFor?: string
    replaceWith?: string
  }
}> {
  try {
    if (!genAI) {
      return {
        success: false,
        error: 'Gemini API key not configured',
      }
    }

    console.log('[fixViolationWithAI] Analyzing violation:', violation.id)

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    // Create a detailed prompt for the AI agent
    const prompt = `You are an accessibility expert helping fix WCAG violations in a Shopify store.

VIOLATION DETAILS:
- Type: ${violation.id}
- Description: ${violation.description}
- Guidance: ${violation.help}
- Affected HTML: ${violation.node.html}
- CSS Selector: ${violation.node.target.join(' > ')}
- Failure Summary: ${violation.node.failureSummary}

TASK:
Analyze this violation and provide:
1. A clear explanation of what's wrong (2-3 sentences)
2. The specific fix needed (be concrete and actionable)
3. If it's a code change: the exact corrected HTML/CSS
4. Priority level (critical/high/medium/low)
5. WHERE the violation exists (determine from HTML/selector)
6. DETAILED STEP-BY-STEP INSTRUCTIONS for how to fix it in Shopify

IMPORTANT - Determine the violation location:
- If HTML contains product-related elements (product cards, titles, descriptions, images): location = "product"
- If HTML contains page content markers or static page elements: location = "page"
- If HTML is from theme template (header, footer, navigation, layout, forms): location = "theme"
- Extract any product IDs, page IDs from the HTML/selector if present

For THEME violations, provide detailed Shopify admin navigation:
- Exact path in Shopify admin (e.g., "Online Store > Themes > Customize > Theme settings")
- Which file to edit (e.g., "theme.liquid", "password.liquid", "base.css")
- Where in the file to make changes (line numbers if possible, or search terms)
- Specific code to find and replace

Focus on solutions that can be implemented via Shopify's Admin API or manual theme editing.

Format your response as JSON:
{
  "explanation": "Clear description of the issue",
  "fixDescription": "What needs to be done",
  "fixType": "html" | "css" | "attribute" | "content" | "color",
  "correctedCode": "The fixed code if applicable",
  "priority": "critical" | "high" | "medium" | "low",
  "canAutoFix": true/false,
  "location": "product" | "page" | "theme",
  "shopifyResourceId": "Extract product/page ID if found in HTML, otherwise null",
  "applyMethod": "api" | "theme-extension" | "manual",
  "apiDetails": {
    "mutation": "productUpdate | pageUpdate | fileUpdate | etc",
    "field": "descriptionHtml | body | alt | etc"
  },
  "detailedInstructions": {
    "steps": [
      "Step 1: Navigate to...",
      "Step 2: Click on...",
      "Step 3: Find the code...",
      "Step 4: Replace with..."
    ],
    "themeFile": "password.liquid | theme.liquid | base.css | etc",
    "searchFor": "Code snippet to search for in the file",
    "replaceWith": "Code snippet to replace it with"
  }
}`

    const result = await model.generateContent(prompt)
    const response = result.response.text()

    console.log('[fixViolationWithAI] AI Response:', response)

    // Parse the AI response
    let fixData
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        fixData = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('No JSON found in response')
      }
    } catch (parseError) {
      console.error('[fixViolationWithAI] Failed to parse AI response:', parseError)
      return {
        success: true,
        fixDescription: response, // Return raw response if parsing fails
        appliedFix: false,
      }
    }

    // Try to apply the fix automatically
    let appliedFix = false
    let applyError: string | undefined

    if (fixData.canAutoFix && fixData.correctedCode) {
      const applyResult = await applyCodeFix(shop, violation.node, fixData)

      if (applyResult.success && applyResult.appliedFix) {
        appliedFix = true
        console.log('[fixViolationWithAI] Fix applied successfully via API')
      } else {
        applyError = applyResult.error
        console.log('[fixViolationWithAI] Could not apply via API:', applyError)
      }
    }

    // Generate CSS fix if applicable (for theme-level fixes)
    const cssCode = !appliedFix ? generateCSSFix(violation.node, fixData.correctedCode || '', fixData) : null

    return {
      success: true,
      fixDescription: appliedFix
        ? `✅ Fix Applied Successfully!\n\n${fixData.explanation}\n\nThe accessibility issue has been automatically corrected in your Shopify ${fixData.location || 'content'}.`
        : `${fixData.explanation}\n\nFix: ${fixData.fixDescription}${fixData.correctedCode ? `\n\nCorrected Code:\n${fixData.correctedCode}` : ''}${applyError ? `\n\nNote: ${applyError}` : ''}`,
      appliedFix,
      cssCode: cssCode || undefined,
      detailedInstructions: fixData.detailedInstructions,
    }
  } catch (error) {
    console.error('[fixViolationWithAI] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
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
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

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
