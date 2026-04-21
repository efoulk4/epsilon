'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { runAccessibilityAudit, runAccessibilityAuditForShop, saveAuditToDatabase } from '../actions/audit'
import type { AuditResult, ImpactLevel, AuditViolation } from '@/types/audit'
import { calculateHealthScore, getHealthStatus } from '../utils/healthScore'
import { HealthScoreGauge } from './HealthScoreGauge'
import { AltTextFixModal } from './AltTextFixModal'
import { fixViolationWithAI } from '../services/remediation'
import { useSearchParams } from 'next/navigation'
import {
  Card,
  TextField,
  Button,
  Banner,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Collapsible,
  Link,
  Box,
  InlineGrid,
} from '@shopify/polaris'
import { SearchIcon, StoreIcon } from '@shopify/polaris-icons'

export function AuditTab() {
  const searchParams = useSearchParams()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AuditResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shop, setShop] = useState<string | null>(null)
  const [isEmbedded, setIsEmbedded] = useState(false)
  const [expandedImpact, setExpandedImpact] = useState<{
    [key in ImpactLevel]?: boolean
  }>({
    critical: true,
    serious: true,
    moderate: false,
    minor: false,
  })
  const [altTextModalOpen, setAltTextModalOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<{
    url: string
    html: string
  } | null>(null)
  const [fixingViolations, setFixingViolations] = useState<Set<string>>(new Set())
  const [fixResults, setFixResults] = useState<Map<string, { success: boolean; message: string; cssCode?: string; appliedFix?: boolean }>>(new Map())
  const [copiedKeys, setCopiedKeys] = useState<Set<string>>(new Set())

  // Detect if running in Shopify embedded context
  useEffect(() => {
    const shopParam = searchParams.get('shop')
    const hostParam = searchParams.get('host')

    if (shopParam) {
      setShop(shopParam)
      setIsEmbedded(true)
    } else if (typeof window !== 'undefined') {
      const storedShop = sessionStorage.getItem('shopify_shop')
      if (storedShop) {
        setShop(storedShop)
        setIsEmbedded(true)
      }
    }
  }, [searchParams])

  const handleAuditMyStore = async () => {
    if (!shop) {
      setError('Shop information not found')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const auditResult = await runAccessibilityAuditForShop(shop)

      if ('error' in auditResult) {
        setError(auditResult.details || auditResult.error)
      } else {
        setResult(auditResult)

        // Save audit to database
        const saveResult = await saveAuditToDatabase(auditResult)
        if (!saveResult.success && saveResult.error !== 'Supabase not configured') {
          console.error('Failed to save audit to database:', saveResult.error)
        }
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleAudit = async () => {
    if (!url.trim()) {
      setError('Please enter a valid URL')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const auditResult = await runAccessibilityAudit(url)

      if ('error' in auditResult) {
        setError(auditResult.details || auditResult.error)
      } else {
        setResult(auditResult)
        // Note: Manual URL audits are not saved to database
        // Only Shopify store audits (via handleAuditMyStore) are persisted
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getImpactBadge = (impact: ImpactLevel): 'critical' | 'warning' | 'attention' | 'info' => {
    switch (impact) {
      case 'critical':
        return 'critical'
      case 'serious':
        return 'warning'
      case 'moderate':
        return 'attention'
      case 'minor':
        return 'info'
    }
  }

  const toggleImpactSection = useCallback((impact: ImpactLevel) => {
    setExpandedImpact((prev) => ({
      ...prev,
      [impact]: !prev[impact],
    }))
  }, [])

  const groupViolationsByImpact = useCallback((violations: AuditViolation[]) => {
    const grouped: { [key in ImpactLevel]?: AuditViolation[] } = {}

    violations.forEach((violation) => {
      if (!grouped[violation.impact]) {
        grouped[violation.impact] = []
      }
      grouped[violation.impact]!.push(violation)
    })

    return grouped
  }, [])

  const extractImageUrl = (html: string): string | null => {
    const srcMatch = html.match(/src="([^"]+)"/)
    return srcMatch ? srcMatch[1] : null
  }

  const handleFixImage = (html: string) => {
    const imageUrl = extractImageUrl(html)
    if (imageUrl) {
      setSelectedImage({ url: imageUrl, html })
      setAltTextModalOpen(true)
    }
  }

  const handleCopyCSS = async (fixKey: string, cssCode: string) => {
    try {
      await navigator.clipboard.writeText(cssCode)
      setCopiedKeys((prev) => new Set(prev).add(fixKey))
      setTimeout(() => {
        setCopiedKeys((prev) => {
          const newSet = new Set(prev)
          newSet.delete(fixKey)
          return newSet
        })
      }, 2000)
    } catch (error) {
      alert('Failed to copy CSS. Please select and copy manually.')
    }
  }

  const handleDownloadCSS = (fixKey: string, cssCode: string, violationId: string) => {
    const blob = new Blob([cssCode], { type: 'text/css' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `accessibility-fix-${violationId}-${Date.now()}.css`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleFixViolation = async (
    violation: AuditViolation,
    nodeIndex: number
  ) => {
    if (!shop) {
      alert('Shop information not available. Fixes only work in embedded mode.')
      return
    }

    const fixKey = `${violation.id}-${nodeIndex}`
    setFixingViolations((prev) => new Set(prev).add(fixKey))

    try {
      // Use AI agent to analyze and generate fix
      const result = await fixViolationWithAI(shop, {
        id: violation.id,
        description: violation.description,
        help: violation.help,
        helpUrl: violation.helpUrl,
        node: violation.nodes[nodeIndex],
      })

      if (result.success) {
        setFixResults((prev) => {
          const newMap = new Map(prev)
          newMap.set(fixKey, {
            success: true,
            message: result.fixDescription || 'Fix generated successfully',
            cssCode: result.cssCode,
            appliedFix: result.appliedFix,
          })
          return newMap
        })
      } else {
        throw new Error(result.error || 'Failed to generate fix')
      }
    } catch (error) {
      setFixResults((prev) => {
        const newMap = new Map(prev)
        newMap.set(fixKey, {
          success: false,
          message: error instanceof Error ? error.message : 'Fix failed',
        })
        return newMap
      })
    } finally {
      setFixingViolations((prev) => {
        const newSet = new Set(prev)
        newSet.delete(fixKey)
        return newSet
      })
    }
  }

  const healthScore = result ? calculateHealthScore(result) : 0
  const healthStatus = result ? getHealthStatus(healthScore) : null

  return (
    <BlockStack gap="500">
      {/* Shopify Store Audit Card - Only shown in embedded mode */}
      {isEmbedded && shop && (
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Audit Your Store
            </Text>
            <InlineStack gap="300" align="space-between" blockAlign="center">
              <Box>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Run an accessibility audit on your online storefront
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Store: {shop}
                </Text>
              </Box>
              <Button
                variant="primary"
                onClick={handleAuditMyStore}
                loading={loading}
                icon={StoreIcon}
              >
                Audit My Store
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      )}

      {/* Manual URL Audit Card */}
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            {isEmbedded ? 'Audit Custom URL' : 'Run New Audit'}
          </Text>
          <InlineStack gap="300" align="end">
            <div style={{ flex: 1 }}>
              <TextField
                label=""
                type="url"
                value={url}
                onChange={setUrl}
                placeholder="https://example.com"
                disabled={loading}
                autoComplete="off"
              />
            </div>
            <Button
              variant={isEmbedded ? 'secondary' : 'primary'}
              onClick={handleAudit}
              loading={loading}
              icon={SearchIcon}
            >
              Run Audit
            </Button>
          </InlineStack>
          <Text as="p" variant="bodyMd" tone="subdued">
            Enter any publicly accessible URL to perform a WCAG 2.1 Level A/AA
            accessibility audit
          </Text>
        </BlockStack>
      </Card>

      {/* Error Display */}
      {error && (
        <Banner title="Audit Failed" tone="critical">
          <p>{error}</p>
        </Banner>
      )}

      {/* Results Display */}
      {result && healthStatus && (
        <BlockStack gap="500">
          {/* Summary Card with Health Score */}
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  Audit Results
                </Text>
                <Text as="span" variant="bodyMd" tone="subdued">
                  {new Date(result.timestamp).toLocaleString()}
                </Text>
              </InlineStack>

              <InlineStack gap="200" blockAlign="center">
                <Link url={result.url} target="_blank" removeUnderline>
                  {result.url}
                </Link>
              </InlineStack>

              <InlineGrid columns={['oneThird', 'twoThirds']} gap="400">
                {/* Health Score Gauge */}
                <Box>
                  <HealthScoreGauge
                    score={healthScore}
                    label={healthStatus.label}
                    color={healthStatus.color}
                  />
                </Box>

                {/* Stats Grid */}
                <InlineGrid columns={2} gap="400">
                  <Card background="bg-surface-secondary">
                    <BlockStack gap="200">
                      <Text as="p" variant="heading2xl">
                        {result.totalViolations}
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Total Issues
                      </Text>
                    </BlockStack>
                  </Card>
                  <Card background="bg-surface-critical">
                    <BlockStack gap="200">
                      <Text as="p" variant="heading2xl">
                        {result.violationsByImpact.critical}
                      </Text>
                      <Text as="p" variant="bodyMd">
                        Critical
                      </Text>
                    </BlockStack>
                  </Card>
                  <Card background="bg-surface-warning">
                    <BlockStack gap="200">
                      <Text as="p" variant="heading2xl">
                        {result.violationsByImpact.serious}
                      </Text>
                      <Text as="p" variant="bodyMd">
                        Serious
                      </Text>
                    </BlockStack>
                  </Card>
                  <Card background="bg-surface-warning">
                    <BlockStack gap="200">
                      <Text as="p" variant="heading2xl">
                        {result.violationsByImpact.moderate}
                      </Text>
                      <Text as="p" variant="bodyMd">
                        Moderate
                      </Text>
                    </BlockStack>
                  </Card>
                </InlineGrid>
              </InlineGrid>
            </BlockStack>
          </Card>

          {/* Violations List - Grouped by Impact */}
          {result.violations.length > 0 ? (
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  Accessibility Violations
                </Text>

                {(['critical', 'serious', 'moderate', 'minor'] as ImpactLevel[]).map((impact) => {
                  const grouped = groupViolationsByImpact(result.violations)
                  const impactViolations = grouped[impact] || []

                  if (impactViolations.length === 0) return null

                  return (
                    <Box key={impact}>
                      <BlockStack gap="300">
                        <button
                          onClick={() => toggleImpactSection(impact)}
                          style={{
                            all: 'unset',
                            cursor: 'pointer',
                            display: 'block',
                            width: '100%',
                          }}
                        >
                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="300" blockAlign="center">
                              <Badge tone={getImpactBadge(impact)}>
                                {impact.toUpperCase()}
                              </Badge>
                              <Text as="h4" variant="headingSm">
                                {impactViolations.length}{' '}
                                {impactViolations.length === 1 ? 'issue' : 'issues'}
                              </Text>
                            </InlineStack>
                            <Text as="span" variant="bodyMd">
                              {expandedImpact[impact] ? '−' : '+'}
                            </Text>
                          </InlineStack>
                        </button>

                        <Collapsible
                          open={expandedImpact[impact] || false}
                          id={`${impact}-violations`}
                          transition={{
                            duration: '200ms',
                            timingFunction: 'ease-in-out',
                          }}
                        >
                          <BlockStack gap="300">
                            {impactViolations.map((violation, index) => (
                              <Card key={`${violation.id}-${index}`}>
                                <BlockStack gap="300">
                                  <Text as="h5" variant="headingSm">
                                    {violation.help}
                                  </Text>
                                  <Text as="p" variant="bodyMd" tone="subdued">
                                    {violation.description}
                                  </Text>
                                  <Text as="p" variant="bodyMd">
                                    <strong>Affected Elements:</strong>{' '}
                                    {violation.nodes.length}
                                  </Text>

                                  {violation.nodes.slice(0, 3).map((node, nodeIndex) => {
                                    const fixKey = `${violation.id}-${nodeIndex}`
                                    const isFixing = fixingViolations.has(fixKey)
                                    const fixResult = fixResults.get(fixKey)

                                    return (
                                    <Box
                                      key={nodeIndex}
                                      background="bg-surface-secondary"
                                      padding="300"
                                      borderRadius="200"
                                    >
                                      <BlockStack gap="200">
                                        <code
                                          style={{
                                            fontSize: '12px',
                                            wordBreak: 'break-all',
                                          }}
                                        >
                                          {node.html}
                                        </code>
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          Selector: {node.target.join(' > ')}
                                        </Text>

                                        {/* Show AI-powered fix button for all violations in embedded mode */}
                                        {isEmbedded && (
                                          <Button
                                            size="slim"
                                            loading={isFixing}
                                            onClick={() => handleFixViolation(violation, nodeIndex)}
                                            tone="success"
                                          >
                                            {isFixing ? 'Analyzing with AI...' : 'Fix with AI'}
                                          </Button>
                                        )}

                                        {/* Show fix result */}
                                        {fixResult && (
                                          <Banner
                                            tone={
                                              fixResult.success && fixResult.appliedFix
                                                ? 'success'
                                                : fixResult.success
                                                  ? 'info'
                                                  : 'critical'
                                            }
                                          >
                                            <BlockStack gap="300">
                                              <div style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>
                                                {fixResult.message}
                                              </div>

                                              {/* Show CSS code if available (for manual application) */}
                                              {!fixResult.appliedFix && fixResult.cssCode && (
                                                <BlockStack gap="300">
                                                  <Box
                                                    background="bg-surface-warning"
                                                    padding="300"
                                                    borderRadius="200"
                                                  >
                                                    <BlockStack gap="200">
                                                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                                                        📋 Manual CSS Fix Required
                                                      </Text>
                                                      <Text as="p" variant="bodySm">
                                                        This fix requires theme-level changes. Follow the steps below to apply it to your store.
                                                      </Text>
                                                    </BlockStack>
                                                  </Box>

                                                  <BlockStack gap="200">
                                                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                                                      Generated CSS:
                                                    </Text>
                                                    <Box
                                                      background="bg-surface"
                                                      padding="300"
                                                      borderRadius="200"
                                                    >
                                                      <code
                                                        style={{
                                                          display: 'block',
                                                          fontSize: '11px',
                                                          fontFamily: 'SF Mono, Monaco, Consolas, monospace',
                                                          whiteSpace: 'pre-wrap',
                                                          wordBreak: 'break-word',
                                                          lineHeight: '1.5',
                                                          color: '#1a1a1a',
                                                        }}
                                                      >
                                                        {fixResult.cssCode}
                                                      </code>
                                                    </Box>

                                                    <InlineStack gap="200">
                                                      <Button
                                                        size="medium"
                                                        tone={copiedKeys.has(fixKey) ? 'success' : undefined}
                                                        onClick={() => handleCopyCSS(fixKey, fixResult.cssCode!)}
                                                      >
                                                        {copiedKeys.has(fixKey) ? '✓ Copied!' : 'Copy CSS'}
                                                      </Button>
                                                      <Button
                                                        size="medium"
                                                        variant="secondary"
                                                        onClick={() => handleDownloadCSS(fixKey, fixResult.cssCode!, violation.id)}
                                                      >
                                                        Download CSS File
                                                      </Button>
                                                    </InlineStack>
                                                  </BlockStack>

                                                  <Box
                                                    background="bg-surface-secondary"
                                                    padding="300"
                                                    borderRadius="200"
                                                  >
                                                    <BlockStack gap="200">
                                                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                                                        How to apply this fix:
                                                      </Text>
                                                      <ol style={{ paddingLeft: '20px', margin: 0 }}>
                                                        <li>
                                                          <Text as="span" variant="bodySm">
                                                            Go to <strong>Online Store → Themes</strong> in your Shopify admin
                                                          </Text>
                                                        </li>
                                                        <li>
                                                          <Text as="span" variant="bodySm">
                                                            Click <strong>Customize</strong> on your active theme
                                                          </Text>
                                                        </li>
                                                        <li>
                                                          <Text as="span" variant="bodySm">
                                                            Click <strong>Theme settings → Custom CSS</strong> (or edit theme.liquid)
                                                          </Text>
                                                        </li>
                                                        <li>
                                                          <Text as="span" variant="bodySm">
                                                            Paste the CSS code above
                                                          </Text>
                                                        </li>
                                                        <li>
                                                          <Text as="span" variant="bodySm">
                                                            Click <strong>Save</strong>
                                                          </Text>
                                                        </li>
                                                      </ol>
                                                      <Text as="p" variant="bodySm" tone="subdued">
                                                        💡 Tip: We don't auto-inject CSS for security reasons. This keeps your store safe from potential code injection vulnerabilities.
                                                      </Text>
                                                    </BlockStack>
                                                  </Box>
                                                </BlockStack>
                                              )}

                                              {/* Show success message if fix was applied automatically */}
                                              {fixResult.appliedFix && (
                                                <Text as="p" variant="bodyMd" fontWeight="semibold" tone="success">
                                                  🎉 No manual action needed - the fix has been applied to your store!
                                                </Text>
                                              )}
                                            </BlockStack>
                                          </Banner>
                                        )}
                                      </BlockStack>
                                    </Box>
                                  )})}

                                  {violation.nodes.length > 3 && (
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                      + {violation.nodes.length - 3} more affected elements
                                    </Text>
                                  )}

                                  <Link
                                    url={violation.helpUrl}
                                    target="_blank"
                                    removeUnderline
                                  >
                                    Learn more
                                  </Link>
                                </BlockStack>
                              </Card>
                            ))}
                          </BlockStack>
                        </Collapsible>
                      </BlockStack>
                    </Box>
                  )
                })}
              </BlockStack>
            </Card>
          ) : (
            <Banner tone="success" title="No Violations Found">
              <p>This page passed all WCAG 2.1 Level A/AA checks!</p>
            </Banner>
          )}
        </BlockStack>
      )}

      {/* Info Footer */}
      {!result && !error && !loading && (
        <Banner tone="info" title="About This Tool">
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">
              • Server-side auditing using Playwright and Axe-core
            </Text>
            <Text as="p" variant="bodyMd">
              • Zero client-side JavaScript overlays for better performance
            </Text>
            <Text as="p" variant="bodyMd">
              • WCAG 2.1 Level A and AA compliance checking
            </Text>
            <Text as="p" variant="bodyMd">
              • Detailed violation reports with actionable recommendations
            </Text>
          </BlockStack>
        </Banner>
      )}

      {/* Alt Text Fix Modal */}
      {selectedImage && (
        <AltTextFixModal
          open={altTextModalOpen}
          onClose={() => {
            setAltTextModalOpen(false)
            setSelectedImage(null)
          }}
          imageUrl={selectedImage.url}
          imageHtml={selectedImage.html}
        />
      )}
    </BlockStack>
  )
}
