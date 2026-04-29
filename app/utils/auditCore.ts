/**
 * Core Playwright + Axe scanning logic shared between the manual audit
 * (runAccessibilityAudit in audit.ts) and the cron audit runner.
 * Not exported to the client.
 */

import type { AuditResult, ImpactLevel } from '@/types/audit'
import { validateURL } from '@/app/utils/ssrf-protection'

const GENERIC_ALT_PATTERNS = [
  /^image$/i, /^photo$/i, /^picture$/i, /^img$/i, /^graphic$/i,
  /^icon$/i, /^logo$/i, /^banner$/i, /^thumbnail$/i, /^placeholder$/i,
  /^untitled$/i, /^image \d+$/i, /^photo \d+$/i, /^product image$/i,
  /^product photo$/i, /^product picture$/i, /^shop image$/i,
  /^store image$/i, /^\d+$/i, /^dsc\d+$/i, /^img\d+$/i,
  /^screenshot$/i, /^image \d+ of \d+$/i,
]

export async function scanSinglePage(page: any, pageUrl: string): Promise<any[]> {
  await page.addScriptTag({
    url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js',
  })
  await page.waitForFunction(() => typeof (window as any).axe !== 'undefined')

  const axeResults = await page.evaluate(() => {
    return new Promise<any>((resolve) => {
      // @ts-ignore
      window.axe.run(
        { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } },
        (err: Error, results: any) => { if (err) throw err; resolve(results) }
      )
    })
  }) as any

  const violations = axeResults.violations

  violations.forEach((v: any) => {
    v.nodes.forEach((n: any) => { n._pageUrl = pageUrl })
  })

  const genericAltImages = await page.evaluate(() => {
    const PATTERNS = [
      /^image$/i, /^photo$/i, /^picture$/i, /^img$/i, /^graphic$/i,
      /^icon$/i, /^logo$/i, /^banner$/i, /^thumbnail$/i, /^placeholder$/i,
      /^untitled$/i, /^image \d+$/i, /^photo \d+$/i, /^product image$/i,
      /^product photo$/i, /^product picture$/i, /^shop image$/i,
      /^store image$/i, /^\d+$/i, /^dsc\d+$/i, /^img\d+$/i,
      /^screenshot$/i, /^image \d+ of \d+$/i,
    ]
    const results: { html: string; target: string[]; alt: string; src: string }[] = []
    document.querySelectorAll('img[alt]').forEach((img, index) => {
      const alt = (img as HTMLImageElement).alt.trim()
      const src = (img as HTMLImageElement).src || ''
      if (!alt) return
      if (!PATTERNS.some((p) => p.test(alt))) return
      const id = img.id ? `#${img.id}` : ''
      const classes = img.className ? `.${img.className.trim().split(/\s+/).join('.')}` : ''
      results.push({
        html: img.outerHTML.slice(0, 300),
        target: [id || classes || `img:nth-of-type(${index + 1})`],
        alt,
        src,
      })
    })
    return results
  })

  if (genericAltImages.length > 0) {
    violations.push({
      id: 'generic-alt-text',
      impact: 'serious',
      description: 'Images have generic or non-descriptive alt text that does not convey the image content to screen reader users.',
      help: 'Images must have descriptive alt text',
      helpUrl: 'https://www.w3.org/WAI/tutorials/images/decorative/',
      nodes: genericAltImages.map((img: any) => ({
        html: img.html,
        target: img.target,
        failureSummary: `Image alt text is generic ("${img.alt}"). Replace with a description of what the image shows.`,
        _imageSrc: img.src,
        _genericAlt: img.alt,
        _pageUrl: pageUrl,
      })),
    })
  }

  // --- Keyboard navigation checks ---

  // 1. Skip link: first focusable element should be a skip-to-main link
  const skipLinkResult = await page.evaluate(() => {
    const focusable = document.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0] as HTMLElement | undefined
    if (!first) return null
    const isSkipLink =
      first.tagName === 'A' &&
      (first.textContent?.toLowerCase().includes('skip') ||
        first.getAttribute('href')?.startsWith('#'))
    return isSkipLink ? null : { html: first.outerHTML.slice(0, 300), target: [first.id ? `#${first.id}` : first.tagName.toLowerCase()] }
  })

  if (skipLinkResult) {
    violations.push({
      id: 'missing-skip-link',
      impact: 'moderate',
      description: 'No skip-to-main-content link found. Keyboard users must tab through the entire navigation on every page.',
      help: 'Add a skip link as the first focusable element on the page',
      helpUrl: 'https://webaim.org/techniques/skipnav/',
      nodes: [{
        html: skipLinkResult.html,
        target: skipLinkResult.target,
        failureSummary: 'Add a "Skip to main content" link as the very first focusable element, linking to your main content anchor (e.g., <a href="#main-content" class="skip-link">Skip to main content</a>).',
        _pageUrl: pageUrl,
      }],
    })
  }

  // 2. Real Tab-keypress focus trap detection (cap at 40 presses)
  // Focus the body first so Tab starts from the top of the page
  await page.evaluate(() => { (document.body as HTMLElement).focus() })

  const TAB_LIMIT = 40
  type FocusSnapshot = { html: string; target: string; outerKey: string }
  const focusHistory: FocusSnapshot[] = []
  let focusTrapResult: { html: string; target: string[] } | null = null

  for (let i = 0; i < TAB_LIMIT; i++) {
    await page.keyboard.press('Tab')

    const snapshot = await page.evaluate((): FocusSnapshot | null => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body || el === document.documentElement) return null
      const id = el.id ? `#${el.id}` : ''
      const cls = el.className ? `.${String(el.className).trim().split(/\s+/).slice(0, 2).join('.')}` : ''
      const target = id || cls || el.tagName.toLowerCase()
      return {
        html: el.outerHTML.slice(0, 300),
        target,
        outerKey: target + '|' + (el.textContent?.trim().slice(0, 40) ?? ''),
      }
    })

    if (!snapshot) break

    // Detect if focus stopped moving (same element two presses in a row)
    const prev = focusHistory[focusHistory.length - 1]
    if (prev && prev.outerKey === snapshot.outerKey) {
      focusTrapResult = { html: snapshot.html, target: [snapshot.target] }
      break
    }
    focusHistory.push(snapshot)
  }

  if (focusTrapResult) {
    violations.push({
      id: 'keyboard-focus-trap',
      impact: 'serious',
      description: 'A keyboard focus trap was detected. Tab keypress did not advance focus, trapping keyboard users.',
      help: 'Ensure focus is not trapped in any component outside of intentional modal dialogs',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/no-keyboard-trap.html',
      nodes: [{
        html: focusTrapResult.html,
        target: focusTrapResult.target,
        failureSummary: 'Pressing Tab did not move focus away from this element. Check for tabindex misuse or JavaScript that calls .focus() in response to blur events.',
        _pageUrl: pageUrl,
      }],
    })
  }

  // 3. Visible focus indicator check via real Tab keypresses
  // Re-focus body and tab through up to 30 elements, checking computed styles after each press
  await page.evaluate(() => { (document.body as HTMLElement).focus() })

  const missingFocusStyles: { html: string; target: string[] }[] = []
  const seenFocusKeys = new Set<string>()

  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab')

    const result = await page.evaluate((): { html: string; target: string; key: string; hasIndicator: boolean } | null => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body || el === document.documentElement) return null

      const style = window.getComputedStyle(el)
      const outline = style.outline ?? ''
      const boxShadow = style.boxShadow ?? ''
      const outlineWidth = style.outlineWidth ?? ''

      const hasOutline = outline !== 'none' && outlineWidth !== '0px' && outlineWidth !== ''
      const hasShadow = boxShadow !== 'none' && boxShadow !== ''
      const hasIndicator = hasOutline || hasShadow

      const id = el.id ? `#${el.id}` : ''
      const cls = el.className ? `.${String(el.className).trim().split(/\s+/).slice(0, 2).join('.')}` : ''
      const target = id || cls || el.tagName.toLowerCase()
      const key = target + '|' + (el.textContent?.trim().slice(0, 40) ?? '')

      return { html: el.outerHTML.slice(0, 300), target, key, hasIndicator }
    })

    if (!result) break
    if (seenFocusKeys.has(result.key)) break // wrapped around
    seenFocusKeys.add(result.key)

    if (!result.hasIndicator) {
      missingFocusStyles.push({ html: result.html, target: [result.target] })
    }
  }

  if (missingFocusStyles.length > 0) {
    violations.push({
      id: 'missing-focus-indicator',
      impact: 'serious',
      description: 'Interactive elements have no visible focus indicator when navigated to by keyboard.',
      help: 'All interactive elements must have a visible focus style (outline or box-shadow)',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html',
      nodes: missingFocusStyles.map((el: { html: string; target: string[] }) => ({
        html: el.html,
        target: el.target,
        failureSummary: 'This element has no visible outline or box-shadow when focused via keyboard Tab. Add a CSS rule, e.g.: `:focus-visible { outline: 3px solid #005fcc; outline-offset: 2px; }`',
        _pageUrl: pageUrl,
      })),
    })
  }

  return violations
}

export async function navigatePage(context: any, url: string): Promise<any> {
  const page = await context.newPage()

  await page.route('**/*', async (route: any) => {
    const validation = await validateURL(route.request().url())
    if (!validation.allowed) {
      await route.abort('blockedbyclient')
    } else {
      await route.continue()
    }
  })

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2000)
  return page
}

export function mergeViolations(allViolations: any[][]): any[] {
  const map = new Map<string, any>()

  for (const pageViolations of allViolations) {
    for (const violation of pageViolations) {
      if (map.has(violation.id)) {
        map.get(violation.id).nodes.push(...violation.nodes)
      } else {
        map.set(violation.id, { ...violation, nodes: [...violation.nodes] })
      }
    }
  }

  return Array.from(map.values())
}

async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return []
    const xml = await res.text()
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
  } catch {
    return []
  }
}

export async function discoverAllPages(origin: string): Promise<string[]> {
  const discovered = new Set<string>()
  discovered.add(origin)

  try {
    const rootUrls = await fetchSitemapUrls(`${origin}/sitemap.xml`)

    // Shopify sitemap.xml contains sub-sitemap URLs, not page URLs directly
    const subSitemaps = rootUrls.filter((u) => {
      try { return new URL(u).pathname.startsWith('/sitemap_') } catch { return false }
    })

    // If no sub-sitemaps, treat root urls as page urls
    const urlSources = subSitemaps.length > 0 ? subSitemaps : rootUrls

    await Promise.all(
      urlSources.map(async (sitemapUrl) => {
        const urls = await fetchSitemapUrls(sitemapUrl)
        urls.forEach((u) => {
          try {
            const parsed = new URL(u)
            if (parsed.origin === origin) discovered.add(u)
          } catch {}
        })
      })
    )
  } catch (err) {
    console.error('[discoverAllPages] Failed:', err instanceof Error ? err.message : err)
  }

  return Array.from(discovered)
}

async function scanWithConcurrency(
  context: any,
  urls: string[],
  concurrency: number = 3
): Promise<any[][]> {
  const results: any[][] = []
  const queue = [...urls]

  async function worker() {
    while (queue.length > 0) {
      const pageUrl = queue.shift()!
      try {
        const page = await navigatePage(context, pageUrl)
        results.push(await scanSinglePage(page, pageUrl))
        await page.close()
      } catch (err) {
        console.error(`[discoverAndScan] Failed to scan ${pageUrl}:`, err instanceof Error ? err.message : err)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

/**
 * Discover all pages from sitemap and scan every one with Axe.
 * Shared between manual audit and cron audit.
 */
export async function discoverAndScan(context: any, url: string): Promise<AuditResult> {
  const origin = new URL(url).origin

  const allDiscovered = await discoverAllPages(origin)

  // Validate all URLs for SSRF before scanning
  const validated = (
    await Promise.all(
      allDiscovered.map(async (u) => ({ u, ok: (await validateURL(u)).allowed }))
    )
  ).filter((x) => x.ok).map((x) => x.u)

  const urlsToScan = validated.length > 0 ? validated : [url]

  console.log(`[discoverAndScan] Scanning ${urlsToScan.length} pages`)

  const allViolations = await scanWithConcurrency(context, urlsToScan, 3)

  const violations = mergeViolations(allViolations)

  const violationsByImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  violations.forEach((v: any) => {
    const impact = v.impact as ImpactLevel
    if (impact && violationsByImpact[impact] !== undefined) violationsByImpact[impact]++
  })

  const impactOrder: Record<ImpactLevel, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 }

  const transformedViolations = violations
    .map((v: any) => ({
      id: v.id,
      impact: (v.impact || 'minor') as ImpactLevel,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.map((n: any) => ({
        html: n.html,
        target: n.target,
        failureSummary: n.failureSummary || 'No summary available',
        ...(n._pageUrl ? { pageUrl: n._pageUrl } : {}),
        ...(n._imageSrc ? { _imageSrc: n._imageSrc } : {}),
        ...(n._genericAlt ? { _genericAlt: n._genericAlt } : {}),
      })),
    }))
    .sort((a: any, b: any) => impactOrder[a.impact as ImpactLevel] - impactOrder[b.impact as ImpactLevel])

  return {
    url,
    timestamp: new Date().toISOString(),
    totalViolations: violations.length,
    violations: transformedViolations,
    violationsByImpact,
    pagesScanned: urlsToScan,
  }
}
