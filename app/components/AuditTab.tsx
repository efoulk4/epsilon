'use client'

import { useState, useCallback, useEffect } from 'react'
import { runAccessibilityAudit, runAccessibilityAuditForShop, saveAuditToDatabase } from '../actions/audit'
import type { AuditResult, ImpactLevel, AuditViolation } from '@/types/audit'
import { calculateHealthScore, getHealthStatus } from '../utils/healthScore'
import { HealthScoreGauge } from './HealthScoreGauge'
import { AltTextFixModal } from './AltTextFixModal'
import { fixContrastRatio } from '../services/remediation'
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
  const [fixResults, setFixResults] = useState<Map<string, { success: boolean; message: string }>>(new Map())

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

  const handleFixViolation = async (violationId: string, violationType: string) => {
    if (!shop) {
      alert('Shop information not available. Fixes only work in embedded mode.')
      return
    }

    const fixKey = `${violationId}-fix`
    setFixingViolations((prev) => new Set(prev).add(fixKey))

    try {
      if (violationType === 'color-contrast') {
        // Example: Extract colors from violation (this would need actual parsing logic)
        const result = await fixContrastRatio(
          shop,
          'theme-id-placeholder', // Would need to get actual theme ID
          'foreground-key',
          'background-key',
          '#000000', // Would extract from violation
          '#FFFFFF' // Would extract from violation
        )

        if (result.success) {
          setFixResults((prev) => {
            const newMap = new Map(prev)
            newMap.set(fixKey, {
              success: true,
              message: `Proposed compliant color: ${result.proposedColor}`,
            })
            return newMap
          })
        } else {
          throw new Error(result.error || 'Failed to calculate compliant color')
        }
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
                            {impactViolations.map((violation, index) => {
                              const fixKey = `${violation.id}-fix`
                              const isFixing = fixingViolations.has(fixKey)
                              const fixResult = fixResults.get(fixKey)

                              return (
                              <Card key={`${violation.id}-${index}`}>
                                <BlockStack gap="300">
                                  <InlineStack align="space-between" blockAlign="start">
                                    <div style={{ flex: 1 }}>
                                      <Text as="h5" variant="headingSm">
                                        {violation.help}
                                      </Text>
                                    </div>
                                    {/* Show Fix button for serious violations (excluding image-alt which has custom handler) */}
                                    {isEmbedded &&
                                     violation.impact === 'serious' &&
                                     violation.id !== 'image-alt' &&
                                     violation.id.includes('contrast') && (
                                      <Button
                                        size="slim"
                                        loading={isFixing}
                                        onClick={() => handleFixViolation(violation.id, 'color-contrast')}
                                        tone="success"
                                      >
                                        {isFixing ? 'Analyzing...' : 'Fix'}
                                      </Button>
                                    )}
                                  </InlineStack>
                                  <Text as="p" variant="bodyMd" tone="subdued">
                                    {violation.description}
                                  </Text>
                                  {fixResult && (
                                    <Banner tone={fixResult.success ? 'success' : 'critical'}>
                                      {fixResult.message}
                                    </Banner>
                                  )}
                                  <Text as="p" variant="bodyMd">
                                    <strong>Affected Elements:</strong>{' '}
                                    {violation.nodes.length}
                                  </Text>

                                  {violation.nodes.slice(0, 3).map((node, nodeIndex) => (
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
                                        {violation.id === 'image-alt' && extractImageUrl(node.html) && (
                                          <Button
                                            size="slim"
                                            onClick={() => handleFixImage(node.html)}
                                          >
                                            Fix Now with AI
                                          </Button>
                                        )}
                                      </BlockStack>
                                    </Box>
                                  ))}

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
                            )})}
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
