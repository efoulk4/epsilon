'use client'

import { useState, useCallback } from 'react'
import {
  BlockStack,
  Text,
  Badge,
  Collapsible,
  Link,
  Box,
  InlineStack,
  Button,
  Banner,
  Card,
} from '@shopify/polaris'
import dynamic from 'next/dynamic'
import { fixViolationWithAI } from '../services/remediation'
import { useIdToken } from '../hooks/useIdToken'
import type { AuditViolation, ImpactLevel } from '@/types/audit'

const AltTextFixModal = dynamic(
  () => import('./AltTextFixModal').then((m) => m.AltTextFixModal),
  { ssr: false }
)

const ProductContentFixModal = dynamic(
  () => import('./ProductContentFixModal').then((m) => m.ProductContentFixModal),
  { ssr: false }
)

interface ViolationListProps {
  violations: AuditViolation[]
  shop: string | null
  isEmbedded: boolean
}

type FixResult = {
  success: boolean
  message: string
  cssCode?: string
  appliedFix?: boolean
  detailedInstructions?: {
    steps: string[]
    themeFile?: string
    searchFor?: string
    replaceWith?: string
  }
}

const IMPACT_ORDER: ImpactLevel[] = ['critical', 'serious', 'moderate', 'minor']

function getImpactBadge(impact: ImpactLevel): 'critical' | 'warning' | 'attention' | 'info' {
  switch (impact) {
    case 'critical': return 'critical'
    case 'serious': return 'warning'
    case 'moderate': return 'attention'
    case 'minor': return 'info'
  }
}

function groupByImpact(violations: AuditViolation[]) {
  const grouped: Partial<Record<ImpactLevel, AuditViolation[]>> = {}
  for (const v of violations) {
    if (!grouped[v.impact]) grouped[v.impact] = []
    grouped[v.impact]!.push(v)
  }
  return grouped
}

function extractImageUrl(html: string): string | null {
  const m = html.match(/src="([^"]+)"/)
  return m ? m[1] : null
}

export function ViolationList({ violations, shop, isEmbedded }: ViolationListProps) {
  const getIdToken = useIdToken()

  const [expandedImpact, setExpandedImpact] = useState<Partial<Record<ImpactLevel, boolean>>>({
    critical: true,
    serious: true,
    moderate: false,
    minor: false,
  })
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [fixingViolations, setFixingViolations] = useState<Set<string>>(new Set())
  const [fixResults, setFixResults] = useState<Map<string, FixResult>>(new Map())
  const [copiedKeys, setCopiedKeys] = useState<Set<string>>(new Set())
  const [copyError, setCopyError] = useState<string | null>(null)

  const [altTextModal, setAltTextModal] = useState<{
    url: string; html: string; currentAlt?: string; imageId?: string; productId?: string
  } | null>(null)

  const [productContentModal, setProductContentModal] = useState<{
    fixType: 'seo-title' | 'seo-description' | 'product-title' | 'product-description'
    productId: string; productHandle: string; productTitle: string
    currentValue: string; description: string; seoTitle: string; seoDescription: string
  } | null>(null)

  const toggleImpact = useCallback((impact: ImpactLevel) => {
    setExpandedImpact((prev) => ({ ...prev, [impact]: !prev[impact] }))
  }, [])

  const toggleNodes = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const handleFixViolation = async (violation: AuditViolation, nodeIndex: number) => {
    if (!shop) return
    const fixKey = `${violation.id}-${nodeIndex}`
    setFixingViolations((prev) => new Set(prev).add(fixKey))
    try {
      const idToken = await getIdToken()
      const result = await fixViolationWithAI({
        id: violation.id,
        description: violation.description,
        help: violation.help,
        helpUrl: violation.helpUrl,
        node: violation.nodes[nodeIndex],
      }, idToken)
      setFixResults((prev) => {
        const m = new Map(prev)
        m.set(fixKey, result.success
          ? { success: true, message: result.fixDescription || 'Fix generated', cssCode: result.cssCode, appliedFix: result.appliedFix, detailedInstructions: result.detailedInstructions }
          : { success: false, message: result.error || 'Fix failed' }
        )
        return m
      })
    } catch (err) {
      setFixResults((prev) => {
        const m = new Map(prev)
        m.set(fixKey, { success: false, message: err instanceof Error ? err.message : 'Fix failed' })
        return m
      })
    } finally {
      setFixingViolations((prev) => { const s = new Set(prev); s.delete(fixKey); return s })
    }
  }

  const handleCopyCSS = async (fixKey: string, css: string) => {
    try {
      await navigator.clipboard.writeText(css)
      setCopiedKeys((prev) => new Set(prev).add(fixKey))
      setTimeout(() => setCopiedKeys((prev) => { const s = new Set(prev); s.delete(fixKey); return s }), 2000)
    } catch {
      setCopyError('Failed to copy. Please select and copy manually.')
    }
  }

  const handleDownloadCSS = (css: string, violationId: string) => {
    const blob = new Blob([css], { type: 'text/css' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `accessibility-fix-${violationId}-${Date.now()}.css`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const grouped = groupByImpact(violations)

  return (
    <BlockStack gap="300">
      {copyError && (
        <Banner tone="warning" onDismiss={() => setCopyError(null)}><p>{copyError}</p></Banner>
      )}

      {IMPACT_ORDER.map((impact) => {
        const group = grouped[impact]
        if (!group?.length) return null
        return (
          <Box key={impact}>
            <BlockStack gap="300">
              <button
                onClick={() => toggleImpact(impact)}
                style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
              >
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    <Badge tone={getImpactBadge(impact)}>{impact.toUpperCase()}</Badge>
                    <Text as="h4" variant="headingSm">
                      {group.length} {group.length === 1 ? 'issue' : 'issues'}
                    </Text>
                  </InlineStack>
                  <Text as="span" variant="bodyMd">{expandedImpact[impact] ? '−' : '+'}</Text>
                </InlineStack>
              </button>

              <Collapsible open={!!expandedImpact[impact]} id={`${impact}-violations`} transition={{ duration: '200ms', timingFunction: 'ease-in-out' }}>
                <BlockStack gap="300">
                  {group.map((violation, vIdx) => {
                    const showAll = expandedNodes.has(violation.id)
                    const visibleNodes = showAll ? violation.nodes : violation.nodes.slice(0, 3)
                    const hiddenCount = violation.nodes.length - 3

                    return (
                      <Card key={`${violation.id}-${vIdx}`}>
                        <BlockStack gap="300">
                          <Text as="h5" variant="headingSm">{violation.help}</Text>
                          <Text as="p" variant="bodyMd" tone="subdued">{violation.description}</Text>
                          <Text as="p" variant="bodyMd">
                            <strong>Affected Elements:</strong> {violation.nodes.length}
                          </Text>

                          {visibleNodes.map((node, nodeIndex) => {
                            const fixKey = `${violation.id}-${nodeIndex}`
                            const isFixing = fixingViolations.has(fixKey)
                            const fixResult = fixResults.get(fixKey)
                            const isImageAlt = ['image-alt', 'generic-alt-text', 'product-image-missing-alt', 'product-image-generic-alt'].includes(violation.id)
                            const imageSrc = node._imageSrc || (isImageAlt ? extractImageUrl(node.html) ?? undefined : undefined)

                            return (
                              <Box key={nodeIndex} background="bg-surface-secondary" padding="300" borderRadius="200">
                                <BlockStack gap="200">
                                  <code style={{ fontSize: '12px', wordBreak: 'break-all' }}>{node.html}</code>
                                  <Text as="p" variant="bodySm" tone="subdued">Selector: {node.target.join(' > ')}</Text>
                                  {node.pageUrl && (
                                    <Text as="p" variant="bodySm" tone="subdued">
                                      Found on: <Link url={node.pageUrl} target="_blank" removeUnderline>{node.pageUrl}</Link>
                                    </Text>
                                  )}

                                  {isImageAlt && imageSrc && (
                                    isEmbedded ? (
                                      <Button size="slim" tone="success" onClick={() => setAltTextModal({ url: imageSrc, html: node.html, currentAlt: node._genericAlt, imageId: node._imageId, productId: node._productId })}>
                                        Fix Alt Text with AI
                                      </Button>
                                    ) : (
                                      <Text as="p" variant="bodySm" tone="subdued">Install the Shopify app to fix with AI</Text>
                                    )
                                  )}

                                  {!isImageAlt && node._fixType && node._fixType !== 'image-alt' && node._productId && (
                                    isEmbedded ? (
                                      <Button size="slim" tone="success" onClick={() => setProductContentModal({
                                        fixType: node._fixType as 'seo-title' | 'seo-description' | 'product-title' | 'product-description',
                                        productId: node._productId!,
                                        productHandle: node._productHandle || '',
                                        productTitle: node._productTitle || '',
                                        currentValue: node._fixType === 'seo-title' ? (node._seoTitle || '') : node._fixType === 'seo-description' ? (node._seoDescription || '') : node._fixType === 'product-title' ? (node._productTitle || '') : (node._description || ''),
                                        description: node._description || '',
                                        seoTitle: node._seoTitle || '',
                                        seoDescription: node._seoDescription || '',
                                      })}>
                                        Fix with AI
                                      </Button>
                                    ) : (
                                      <Text as="p" variant="bodySm" tone="subdued">Install the Shopify app to fix with AI</Text>
                                    )
                                  )}

                                  {!isImageAlt && !(node._fixType && node._fixType !== 'image-alt' && node._productId) && (
                                    isEmbedded ? (
                                      <Button size="slim" loading={isFixing} tone="success" onClick={() => handleFixViolation(violation, nodeIndex)}>
                                        {isFixing ? 'Analyzing with AI...' : 'Fix with AI'}
                                      </Button>
                                    ) : (
                                      <Text as="p" variant="bodySm" tone="subdued">Install the Shopify app to fix with AI</Text>
                                    )
                                  )}

                                  {fixResult && (
                                    <Banner tone={fixResult.success && fixResult.appliedFix ? 'success' : fixResult.success ? 'info' : 'critical'}>
                                      <BlockStack gap="300">
                                        <div style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>{fixResult.message}</div>

                                        {!fixResult.appliedFix && fixResult.cssCode && (
                                          <BlockStack gap="300">
                                            <Box background="bg-surface-warning" padding="300" borderRadius="200">
                                              <Text as="p" variant="bodyMd" fontWeight="semibold">Manual CSS Fix Required</Text>
                                            </Box>
                                            <Box background="bg-surface" padding="300" borderRadius="200">
                                              <code style={{ display: 'block', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                {fixResult.cssCode}
                                              </code>
                                            </Box>
                                            <InlineStack gap="200">
                                              <Button size="medium" tone={copiedKeys.has(fixKey) ? 'success' : undefined} onClick={() => handleCopyCSS(fixKey, fixResult.cssCode!)}>
                                                {copiedKeys.has(fixKey) ? '✓ Copied!' : 'Copy CSS'}
                                              </Button>
                                              <Button size="medium" variant="secondary" onClick={() => handleDownloadCSS(fixResult.cssCode!, violation.id)}>
                                                Download CSS File
                                              </Button>
                                            </InlineStack>
                                            {fixResult.detailedInstructions?.steps && (
                                              <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                                                <BlockStack gap="200">
                                                  <Text as="p" variant="bodyMd" fontWeight="semibold">Fix Instructions:</Text>
                                                  <ol style={{ paddingLeft: '20px', margin: 0 }}>
                                                    {fixResult.detailedInstructions.steps.map((step, i) => (
                                                      <li key={i}><Text as="span" variant="bodySm">{step}</Text></li>
                                                    ))}
                                                  </ol>
                                                </BlockStack>
                                              </Box>
                                            )}
                                          </BlockStack>
                                        )}

                                        {fixResult.appliedFix && (
                                          <Text as="p" variant="bodyMd" fontWeight="semibold" tone="success">Fix applied to your store!</Text>
                                        )}
                                      </BlockStack>
                                    </Banner>
                                  )}
                                </BlockStack>
                              </Box>
                            )
                          })}

                          {hiddenCount > 0 && (
                            <button onClick={() => toggleNodes(violation.id)} style={{ all: 'unset', cursor: 'pointer', color: '#2C6ECB', fontSize: '14px' }}>
                              {showAll ? 'Show fewer elements' : `+ ${hiddenCount} more affected element${hiddenCount === 1 ? '' : 's'} — show all`}
                            </button>
                          )}

                          <Link url={violation.helpUrl} target="_blank" removeUnderline>Learn more</Link>
                        </BlockStack>
                      </Card>
                    )
                  })}
                </BlockStack>
              </Collapsible>
            </BlockStack>
          </Box>
        )
      })}

      {altTextModal && (
        <AltTextFixModal
          open={!!altTextModal}
          onClose={() => setAltTextModal(null)}
          imageUrl={altTextModal.url}
          imageHtml={altTextModal.html}
          currentAlt={altTextModal.currentAlt}
          imageId={altTextModal.imageId}
          productId={altTextModal.productId}
        />
      )}

      {productContentModal && (
        <ProductContentFixModal
          open={!!productContentModal}
          onClose={() => setProductContentModal(null)}
          fixType={productContentModal.fixType}
          productId={productContentModal.productId}
          productHandle={productContentModal.productHandle}
          productTitle={productContentModal.productTitle}
          currentValue={productContentModal.currentValue}
          description={productContentModal.description}
          seoTitle={productContentModal.seoTitle}
          seoDescription={productContentModal.seoDescription}
        />
      )}
    </BlockStack>
  )
}
