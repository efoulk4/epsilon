'use client'

import { useState, useCallback, useEffect } from 'react'
import { useIdToken } from '../hooks/useIdToken'
import { useIsEmbedded } from '../hooks/useIsEmbedded'
import { runAccessibilityAuditForShop, runAccessibilityAuditForURL } from '../actions/audit'
import { getPlanStatus, type PlanStatus } from '../actions/billing'
import type { AuditResult, ImpactLevel, AuditViolation } from '@/types/audit'
import { calculateHealthScore, getHealthStatus } from '../utils/healthScore'
import { HealthScoreGauge } from './HealthScoreGauge'
import { ViolationList } from './ViolationList'
import {
  Card,
  Button,
  Banner,
  Text,
  BlockStack,
  InlineStack,
  Box,
  InlineGrid,
  TextField,
  Link,
} from '@shopify/polaris'
import { StoreIcon } from '@shopify/polaris-icons'

export function AuditTab() {
  const { isEmbedded, shop } = useIsEmbedded()
  const getIdToken = useIdToken()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AuditResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null)
  const [auditUsedToday, setAuditUsedToday] = useState(false)
  const [urlInput, setUrlInput] = useState('')

  useEffect(() => {
    if (!isEmbedded) return
    getIdToken().then((token) =>
      getPlanStatus(token).then(setPlanStatus).catch(() => {})
    )
  }, [isEmbedded])

  const handleAuditMyStore = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const idToken = await getIdToken()
      const auditResult = await runAccessibilityAuditForShop(idToken)

      if ('error' in auditResult) {
        setError(auditResult.details || auditResult.error)
        return
      }

      setResult(auditResult)
      // Mark quota as used for Basic plan display
      if (planStatus?.effectivePlan === 'basic') setAuditUsedToday(true)
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }


  const handleAuditURL = async () => {
    if (!urlInput.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const auditResult = await runAccessibilityAuditForURL(urlInput.trim())
      if ('error' in auditResult) {
        setError(auditResult.details || auditResult.error)
      } else {
        setResult(auditResult)
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const healthScore = result ? calculateHealthScore(result) : 0
  const healthStatus = result ? getHealthStatus(healthScore) : null

  const effectivePlan = planStatus?.effectivePlan
  const trialExpired = isEmbedded && planStatus && !planStatus.trialActive && planStatus.plan === 'free'
  const trialEndingSoon = planStatus?.trialActive && (planStatus.trialDaysLeft ?? 99) <= 2
  const isFirstVisit = isEmbedded && !result && !loading && !error

  return (
    <BlockStack gap="500">
      {/* Trial expired — show upgrade prompt before anything else */}
      {trialExpired && (
        <Banner title="Your free trial has ended" tone="warning">
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">
              Upgrade to continue running audits and keep building your compliance history.
              A documented record of ongoing accessibility work is one of the strongest defenses in ADA litigation.
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Go to the <strong>Billing</strong> tab to choose a plan.
            </Text>
          </BlockStack>
        </Banner>
      )}

      {/* Trial ending soon */}
      {trialEndingSoon && (
        <Banner
          title={`Trial ends in ${planStatus!.trialDaysLeft} day${planStatus!.trialDaysLeft === 1 ? '' : 's'}`}
          tone="warning"
        >
          <Text as="p" variant="bodyMd">
            Subscribe before your trial ends to keep your audit history and scheduled scans running.
            Visit the <strong>Billing</strong> tab to upgrade.
          </Text>
        </Banner>
      )}

      {/* Onboarding card — first visit, embedded, no results yet */}
      {isFirstVisit && effectivePlan && effectivePlan !== 'free' && (
        <Banner tone="info" title="Welcome to Accessibility Auditor">
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">
              This app scans your storefront for WCAG 2.1 accessibility violations and generates AI-powered fixes.
              Every audit is saved to your compliance history — a timestamped record that demonstrates genuine effort to improve accessibility, which can be critical in ADA disputes.
            </Text>
            <Text as="p" variant="bodyMd">
              Click <strong>Audit My Store</strong> below to run your first scan. It takes 30–60 seconds.
            </Text>
          </BlockStack>
        </Banner>
      )}

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
                {/* Quota indicator for Basic plan */}
                {effectivePlan === 'basic' && (
                  <Text as="p" variant="bodySm" tone={auditUsedToday ? 'critical' : 'subdued'}>
                    {auditUsedToday ? 'Daily audit used — resets at midnight' : '1 manual audit remaining today'}
                  </Text>
                )}
                {effectivePlan === 'trial' && planStatus?.trialDaysLeft !== null && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Free trial — {planStatus!.trialDaysLeft} day{planStatus!.trialDaysLeft === 1 ? '' : 's'} remaining
                  </Text>
                )}
              </Box>
              <Button
                variant="primary"
                onClick={handleAuditMyStore}
                loading={loading}
                icon={StoreIcon}
                disabled={!!trialExpired}
              >
                Audit My Store
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      )}


      {/* URL Audit Card — shown in standalone (non-embedded) mode */}
      {!isEmbedded && (
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Audit a URL
            </Text>
            <form onSubmit={(e) => { e.preventDefault(); handleAuditURL() }}>
              <TextField
                label="Website URL"
                value={urlInput}
                onChange={setUrlInput}
                placeholder="https://example.com"
                autoComplete="url"
                connectedRight={
                  <Button
                    variant="primary"
                    submit
                    loading={loading}
                  >
                    Run Audit
                  </Button>
                }
              />
            </form>
          </BlockStack>
        </Card>
      )}

      {/* Scanning progress message */}
      {loading && (
        <Banner tone="info">
          <p>Running accessibility scan... This may take up to 60 seconds for busy stores.</p>
        </Banner>
      )}

      {/* Error Display */}
      {error && (
        <Banner title="Audit Failed" tone="critical" onDismiss={() => setError(null)}>
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

              {result.pagesScanned && result.pagesScanned.length > 1 ? (
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {result.pagesScanned.length} pages scanned:
                  </Text>
                  {result.pagesScanned.map((p) => (
                    <Link key={p} url={p} target="_blank" removeUnderline>
                      <Text as="span" variant="bodySm">{p}</Text>
                    </Link>
                  ))}
                </BlockStack>
              ) : (
                <InlineStack gap="200" blockAlign="center">
                  <Link url={result.url} target="_blank" removeUnderline>
                    {result.url}
                  </Link>
                </InlineStack>
              )}

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

          {/* Violations List */}
          {result.violations.length > 0 ? (
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">Accessibility Violations</Text>
                <ViolationList violations={result.violations} shop={shop} isEmbedded={isEmbedded} />
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

    </BlockStack>
  )
}
