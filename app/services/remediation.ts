'use server'

import { shopifyGraphQL } from '@/app/utils/shopifyClient'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AuditViolation } from '@/types/audit'
import { requireVerifiedShop } from '@/app/utils/auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { checkRateLimit, RATE_LIMITS } from '@/app/utils/rateLimit'

const genAI = process.env.GOOGLE_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
  : null

interface ViolationNode {
  html: string
  target: string[]
  failureSummary: string
}

async function saveProposedFix(
  shop: string,
  violation: {
    id: string
    description: string
    node: ViolationNode
  },
  fixData: any
): Promise<{ success: boolean; proposalId?: string; error?: string }> {
  try {
    const supabase = getSupabaseAdmin()

    const { data, error } = await supabase
      .from('proposed_fixes')
      .insert({
        shop,
        violation_id: violation.id,
        violation_description: violation.description,
        affected_resource_type: fixData.location || 'unknown',
        affected_resource_id: fixData.shopifyResourceId || null,
        ai_explanation: fixData.explanation,
        original_code: violation.node.html,
        proposed_code: fixData.correctedCode,
        fix_type: fixData.fixType,
        confidence_score: fixData.confidence || null,
        status: 'pending',
      })
      .select()

    if (error) {
      console.error('[saveProposedFix] Database error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, proposalId: data[0]?.id }
  } catch (error) {
    console.error('[saveProposedFix] Unexpected error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

function generateCSSFix(
  node: ViolationNode,
  correctedCode: string,
  fixData: any
): string | null {
  const cssSelector = node.target.join(' ')

  if (correctedCode.includes('style=')) {
    const styleMatch = correctedCode.match(/style="([^"]+)"/)
    if (styleMatch) {
      const styles = styleMatch[1]
      return `/* Accessibility Fix: ${fixData.explanation} */\n${cssSelector} {\n  ${styles.replace(/;/g, ';\n  ')}\n}`
    }
  }

  if (fixData.fixType === 'color' && correctedCode.includes('color:')) {
    const colorMatch = correctedCode.match(/color:\s*([^;'"]+)/)
    if (colorMatch) {
      return `/* Accessibility Fix: ${fixData.explanation} */\n${cssSelector} {\n  color: ${colorMatch[1]};\n}`
    }
  }

  return null
}

export async function fixViolationWithAI(
  violation: {
    id: string
    description: string
    help: string
    helpUrl: string
    node: ViolationNode
  },
  idToken?: string
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
    const shop = await requireVerifiedShop(idToken)

    const rateLimit = await checkRateLimit(`ai-fix:${shop}`, RATE_LIMITS.aiFix)
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `Rate limit exceeded. You can generate ${rateLimit.limit} AI fixes per hour. Please try again after ${new Date(rateLimit.resetTime).toLocaleTimeString()}`,
      }
    }

    if (!genAI) {
      return {
        success: false,
        error: 'Gemini API key not configured',
      }
    }

    console.log('[fixViolationWithAI] Analyzing violation:', violation.id)

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    // Sanitize user-controlled fields to prevent prompt injection.
    // These values may come from attacker-controlled page content scanned by Axe.
    const sanitizeForPrompt = (s: string) =>
      s.replace(/[<>]/g, '').replace(/\n{3,}/g, '\n\n').slice(0, 2000)

    const safeId = sanitizeForPrompt(String(violation.id))
    const safeDescription = sanitizeForPrompt(String(violation.description))
    const safeHelp = sanitizeForPrompt(String(violation.help))
    const safeHtml = sanitizeForPrompt(String(violation.node.html))
    const safeSelector = sanitizeForPrompt(violation.node.target.map(String).join(' > '))
    const safeSummary = sanitizeForPrompt(String(violation.node.failureSummary))

    const prompt = `You are an accessibility expert helping fix WCAG violations in a Shopify store.

VIOLATION DETAILS:
- Type: ${safeId}
- Description: ${safeDescription}
- Guidance: ${safeHelp}
- Affected HTML: <VIOLATION_HTML>${safeHtml}</VIOLATION_HTML>
- CSS Selector: <VIOLATION_SELECTOR>${safeSelector}</VIOLATION_SELECTOR>
- Failure Summary: <VIOLATION_SUMMARY>${safeSummary}</VIOLATION_SUMMARY>

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

    // SECURITY: Do not log AI response — may contain reflected attacker-controlled content

    let fixData
    try {
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
        fixDescription: response,
        appliedFix: false,
      }
    }

    let proposalId: string | undefined
    let saveError: string | undefined

    if (fixData.correctedCode) {
      const saveResult = await saveProposedFix(shop, violation, fixData)

      if (saveResult.success) {
        proposalId = saveResult.proposalId
        console.log('[fixViolationWithAI] Fix proposal saved for review:', proposalId)
      } else {
        saveError = saveResult.error
        console.log('[fixViolationWithAI] Failed to save proposal:', saveError)
      }
    }

    const cssCode = generateCSSFix(violation.node, fixData.correctedCode || '', fixData)

    return {
      success: true,
      fixDescription: proposalId
        ? `Fix Proposal Generated\n\n${fixData.explanation}\n\nFix: ${fixData.fixDescription}\n\nThis fix has been saved for review and will NOT be automatically applied to your store.\n\nProposal ID: ${proposalId}`
        : `${fixData.explanation}\n\nFix: ${fixData.fixDescription}${fixData.correctedCode ? `\n\nCorrected Code:\n${fixData.correctedCode}` : ''}${saveError ? `\n\nNote: Could not save proposal - ${saveError}` : ''}`,
      appliedFix: false,
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
