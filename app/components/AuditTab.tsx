'use client'

import { useState, useEffect } from 'react'
import { useIdToken } from '../hooks/useIdToken'
import { useIsEmbedded } from '../hooks/useIsEmbedded'
import { runAccessibilityAuditForShop, runAccessibilityAuditForURL, getUnseenScheduledAudits, getScheduledAuditHistory, markAuditSeen, type ScheduledAuditNotification } from '../actions/audit'
import { getPlanStatus, type PlanStatus } from '../actions/billing'
import type { AuditResult } from '@/types/audit'
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
  Badge,
  Collapsible,
  Divider,
} from '@shopify/polaris'
import { StoreIcon } from '@shopify/polaris-icons'

function ScheduledAuditCard({
  audit,
  shop,
  isEmbedded,
  defaultOpen,
  onDismiss,
}: {
  audit: ScheduledAuditNotification
  shop: string | null
  isEmbedded: boolean
  defaultOpen: boolean
  onDismiss?: (id: string) => void
}) {
  const [open, setOpen] = useState(defaultOpen)
  const healthStatus = getHealthStatus(audit.healthScore)

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <InlineStack gap="200" blockAlign="center">
              <Text as="h3" variant="headingMd">Scheduled Audit</Text>
              {audit.isNew && <Badge tone="attention">New</Badge>}
            </InlineStack>
            <Text as="p" variant="bodySm" tone="subdued">
              {new Date(audit.timestamp).toLocaleString()}
            </Text>
          </BlockStack>
          <InlineStack gap="200">
            <Button size="slim" onClick={() => setOpen((o) => !o)}>
              {open ? 'Collapse' : 'View Results'}
            </Button>
            {audit.isNew && onDismiss && (
              <Button size="slim" variant="plain" onClick={() => onDismiss(audit.id)}>
                Dismiss
              </Button>
            )}
          </InlineStack>
        </InlineStack>

        <InlineStack gap="200">
          {audit.violationsByImpact.critical > 0 && (
            <Badge tone="critical">{`${audit.violationsByImpact.critical} Critical`}</Badge>
          )}
          {audit.violationsByImpact.serious > 0 && (
            <Badge tone="warning">{`${audit.violationsByImpact.serious} Serious`}</Badge>
          )}
          {audit.violationsByImpact.moderate > 0 && (
            <Badge tone="attention">{`${audit.violationsByImpact.moderate} Moderate`}</Badge>
          )}
          {audit.violationsByImpact.minor > 0 && (
            <Badge tone="info">{`${audit.violationsByImpact.minor} Minor`}</Badge>
          )}
          {audit.totalViolations === 0 && <Badge tone="success">No issues found</Badge>}
        </InlineStack>

        <Collapsible open={open} id={`scheduled-audit-${audit.id}`} transition={{ duration: '200ms', timingFunction: 'ease-in-out' }}>
          <BlockStack gap="400">
            <Divider />
            <InlineGrid columns={['oneThird', 'twoThirds']} gap="400">
              <Box>
                <HealthScoreGauge score={audit.healthScore} label={healthStatus.label} color={healthStatus.color} />
              </Box>
              <InlineGrid columns={2} gap="300">
                <Card background="bg-surface-secondary">
                  <BlockStack gap="100">
                    <Text as="p" variant="heading2xl">{audit.totalViolations}</Text>
                    <Text as="p" variant="bodyMd" tone="subdued">Total Issues</Text>
                  </BlockStack>
                </Card>
                <Card background="bg-surface-critical">
                  <BlockStack gap="100">
                    <Text as="p" variant="heading2xl">{audit.violationsByImpact.critical}</Text>
                    <Text as="p" variant="bodyMd">Critical</Text>
                  </BlockStack>
                </Card>
                <Card background="bg-surface-warning">
                  <BlockStack gap="100">
                    <Text as="p" variant="heading2xl">{audit.violationsByImpact.serious}</Text>
                    <Text as="p" variant="bodyMd">Serious</Text>
                  </BlockStack>
                </Card>
                <Card background="bg-surface-warning">
                  <BlockStack gap="100">
                    <Text as="p" variant="heading2xl">{audit.violationsByImpact.moderate}</Text>
                    <Text as="p" variant="bodyMd">Moderate</Text>
                  </BlockStack>
                </Card>
              </InlineGrid>
            </InlineGrid>

            {audit.violations.length > 0 ? (
              <ViolationList violations={audit.violations} shop={shop} isEmbedded={isEmbedded} />
            ) : (
              <Banner tone="success" title="No violations found">
                <p>Your store passed all WCAG 2.1 checks in this scan.</p>
              </Banner>
            )}
          </BlockStack>
        </Collapsible>
      </BlockStack>
    </Card>
  )
}

export function AuditTab() {
  const { isEmbedded, shop } = useIsEmbedded()
  const getIdToken = useIdToken()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AuditResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null)
  const [auditUsedToday, setAuditUsedToday] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [scheduledAudits, setScheduledAudits] = useState<ScheduledAuditNotification[]>([])
  const [pastAudits, setPastAudits] = useState<ScheduledAuditNotification[]>([])
  const [showPastAudits, setShowPastAudits] = useState(false)

  useEffect(() => {
    if (!isEmbedded) return
    const init = async () => {
      const token = await getIdToken()
      const [status, unseen, past] = await Promise.all([
        getPlanStatus(token).catch(() => null),
        getUnseenScheduledAudits(token).catch(() => [] as ScheduledAuditNotification[]),
        getScheduledAuditHistory(token).catch(() => [] as ScheduledAuditNotification[]),
      ])
      if (status) setPlanStatus(status)
      setScheduledAudits(unseen)
      setPastAudits(past.filter((a) => !unseen.find((u) => u.id === a.id)))
    }
    init()
  }, [isEmbedded])

  const handleDismiss = async (id: string) => {
    try {
      const token = await getIdToken()
      await markAuditSeen(id, token)
    } catch { /* best-effort */ }
    setScheduledAudits((prev) => {
      const dismissed = prev.find((a) => a.id === id)
      if (dismissed) setPastAudits((p) => [{ ...dismissed, isNew: false }, ...p])
      return prev.filter((a) => a.id !== id)
    })
  }

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

      {trialEndingSoon && (
        <Banner title={`Trial ends in ${planStatus!.trialDaysLeft} day${planStatus!.trialDaysLeft === 1 ? '' : 's'}`} tone="warning">
          <Text as="p" variant="bodyMd">
            Subscribe before your trial ends to keep your audit history and scheduled scans running.
            Visit the <strong>Billing</strong> tab to upgrade.
          </Text>
        </Banner>
      )}

      {/* New scheduled audit results */}
      {scheduledAudits.map((audit) => (
        <ScheduledAuditCard
          key={audit.id}
          audit={audit}
          shop={shop}
          isEmbedded={isEmbedded}
          defaultOpen={true}
          onDismiss={handleDismiss}
        />
      ))}

      {isFirstVisit && effectivePlan && effectivePlan !== 'free' && scheduledAudits.length === 0 && (
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

      {isEmbedded && shop && (
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Audit Your Store</Text>
            <InlineStack gap="300" align="space-between" blockAlign="center">
              <Box>
                <Text as="p" variant="bodyMd" tone="subdued">Run an accessibility audit on your online storefront</Text>
                <Text as="p" variant="bodySm" tone="subdued">Store: {shop}</Text>
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
              <Button variant="primary" onClick={handleAuditMyStore} loading={loading} icon={StoreIcon} disabled={!!trialExpired}>
                Audit My Store
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      )}

      {!isEmbedded && (
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Audit a URL</Text>
            <form onSubmit={(e) => { e.preventDefault(); handleAuditURL() }}>
              <TextField
                label="Website URL"
                value={urlInput}
                onChange={setUrlInput}
                placeholder="https://example.com"
                autoComplete="url"
                connectedRight={
                  <Button variant="primary" submit loading={loading}>Run Audit</Button>
                }
              />
            </form>
          </BlockStack>
        </Card>
      )}

      {loading && (
        <Banner tone="info">
          <p>Running accessibility scan... This may take up to 60 seconds for busy stores.</p>
        </Banner>
      )}

      {error && (
        <Banner title="Audit Failed" tone="critical" onDismiss={() => setError(null)}>
          <BlockStack gap="200">
            <p>{error}</p>
            {isEmbedded && (
              <Box>
                <Button size="slim" onClick={handleAuditMyStore}>Try Again</Button>
              </Box>
            )}
          </BlockStack>
        </Banner>
      )}

      {result && healthStatus && (
        <BlockStack gap="500">
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">Audit Results</Text>
                <Text as="span" variant="bodyMd" tone="subdued">{new Date(result.timestamp).toLocaleString()}</Text>
              </InlineStack>

              {result.pagesScanned && result.pagesScanned.length > 1 ? (
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">{result.pagesScanned.length} pages scanned:</Text>
                  {result.pagesScanned.map((p) => (
                    <Link key={p} url={p} target="_blank" removeUnderline>
                      <Text as="span" variant="bodySm">{p}</Text>
                    </Link>
                  ))}
                </BlockStack>
              ) : (
                <InlineStack gap="200" blockAlign="center">
                  <Link url={result.url} target="_blank" removeUnderline>{result.url}</Link>
                </InlineStack>
              )}

              <InlineGrid columns={['oneThird', 'twoThirds']} gap="400">
                <Box>
                  <HealthScoreGauge score={healthScore} label={healthStatus.label} color={healthStatus.color} />
                </Box>
                <InlineGrid columns={2} gap="400">
                  <Card background="bg-surface-secondary">
                    <BlockStack gap="200">
                      <Text as="p" variant="heading2xl">{result.totalViolations}</Text>
                      <Text as="p" variant="bodyMd" tone="subdued">Total Issues</Text>
                    </BlockStack>
                  </Card>
                  <Card background="bg-surface-critical">
                    <BlockStack gap="200">
                      <Text as="p" variant="heading2xl">{result.violationsByImpact.critical}</Text>
                      <Text as="p" variant="bodyMd">Critical</Text>
                    </BlockStack>
                  </Card>
                  <Card background="bg-surface-warning">
                    <BlockStack gap="200">
                      <Text as="p" variant="heading2xl">{result.violationsByImpact.serious}</Text>
                      <Text as="p" variant="bodyMd">Serious</Text>
                    </BlockStack>
                  </Card>
                  <Card background="bg-surface-warning">
                    <BlockStack gap="200">
                      <Text as="p" variant="heading2xl">{result.violationsByImpact.moderate}</Text>
                      <Text as="p" variant="bodyMd">Moderate</Text>
                    </BlockStack>
                  </Card>
                </InlineGrid>
              </InlineGrid>
            </BlockStack>
          </Card>

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

      {/* Past scheduled audits — always accessible */}
      {pastAudits.length > 0 && (
        <Card>
          <BlockStack gap="300">
            <button
              onClick={() => setShowPastAudits((o) => !o)}
              style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
            >
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingMd">Previous Scheduled Audits</Text>
                <Text as="span" variant="bodyMd">{showPastAudits ? '−' : '+'}</Text>
              </InlineStack>
            </button>
            <Collapsible open={showPastAudits} id="past-scheduled-audits" transition={{ duration: '200ms', timingFunction: 'ease-in-out' }}>
              <BlockStack gap="400">
                {pastAudits.map((audit) => (
                  <ScheduledAuditCard key={audit.id} audit={audit} shop={shop} isEmbedded={isEmbedded} defaultOpen={false} />
                ))}
              </BlockStack>
            </Collapsible>
          </BlockStack>
        </Card>
      )}

      {!result && !error && !loading && scheduledAudits.length === 0 && (
        <Banner tone="info" title="About This Tool">
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">• Server-side auditing using Playwright and Axe-core</Text>
            <Text as="p" variant="bodyMd">• Zero client-side JavaScript overlays for better performance</Text>
            <Text as="p" variant="bodyMd">• WCAG 2.1 Level A and AA compliance checking</Text>
            <Text as="p" variant="bodyMd">• Detailed violation reports with actionable recommendations</Text>
          </BlockStack>
        </Banner>
      )}
    </BlockStack>
  )
}
