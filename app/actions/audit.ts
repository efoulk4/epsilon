'use server'

import { chromium } from 'playwright'
import type { AuditResult, AuditError, ImpactLevel } from '@/types/audit'

export async function runAccessibilityAudit(
  url: string
): Promise<AuditResult | AuditError> {
  let browser = null

  try {
    // Validate URL
    const parsedUrl = new URL(url)
    if (!parsedUrl.protocol.startsWith('http')) {
      return {
        error: 'Invalid URL',
        details: 'URL must start with http:// or https://',
      }
    }

    // Launch headless Chromium browser
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })

    const page = await context.newPage()

    // Navigate to the URL with timeout
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    // Inject axe-core from CDN
    await page.addScriptTag({
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js',
    })

    // Wait for axe to be available
    await page.waitForFunction(() => typeof (window as any).axe !== 'undefined')

    // Run Axe accessibility scan targeting WCAG 2.1 Level A and AA
    const axeResults = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        // @ts-ignore - axe is injected into the page
        window.axe.run(
          {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
            },
          },
          (err: Error, results: any) => {
            if (err) throw err
            resolve(results)
          }
        )
      })
    }) as any

    const violations = axeResults.violations

    // Count violations by impact level
    const violationsByImpact = {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0,
    }

    violations.forEach((violation: any) => {
      const impact = violation.impact as ImpactLevel
      if (impact && violationsByImpact[impact] !== undefined) {
        violationsByImpact[impact]++
      }
    })

    // Transform violations to match our type structure
    const transformedViolations = violations.map((violation: any) => ({
      id: violation.id,
      impact: (violation.impact || 'minor') as ImpactLevel,
      description: violation.description,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node: any) => ({
        html: node.html,
        target: node.target,
        failureSummary: node.failureSummary || 'No summary available',
      })),
    }))

    // Sort violations by impact (critical first)
    const impactOrder: Record<ImpactLevel, number> = {
      critical: 0,
      serious: 1,
      moderate: 2,
      minor: 3,
    }

    transformedViolations.sort(
      (a: any, b: any) => impactOrder[a.impact as ImpactLevel] - impactOrder[b.impact as ImpactLevel]
    )

    // Build the audit result
    const result: AuditResult = {
      url,
      timestamp: new Date().toISOString(),
      totalViolations: violations.length,
      violations: transformedViolations,
      violationsByImpact,
    }

    return result
  } catch (error) {
    console.error('Audit error:', error)

    if (error instanceof Error) {
      return {
        error: 'Audit failed',
        details: error.message,
      }
    }

    return {
      error: 'Unknown error occurred during audit',
    }
  } finally {
    // CRITICAL: Always close the browser to prevent memory leaks
    if (browser) {
      await browser.close()
    }
  }
}

// Placeholder for future Supabase integration
export async function saveAuditToDatabase(
  auditResult: AuditResult
): Promise<{ success: boolean; id?: string }> {
  // TODO: Implement Supabase integration
  // Example:
  // const { data, error } = await supabase
  //   .from('audits')
  //   .insert({
  //     url: auditResult.url,
  //     timestamp: auditResult.timestamp,
  //     total_violations: auditResult.totalViolations,
  //     violations: auditResult.violations,
  //     violations_by_impact: auditResult.violationsByImpact,
  //   })
  //   .select()

  console.log('Audit result ready for database save:', {
    url: auditResult.url,
    totalViolations: auditResult.totalViolations,
  })

  return { success: true }
}
