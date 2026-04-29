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
