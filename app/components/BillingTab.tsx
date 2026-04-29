'use client'

import { useState, useEffect } from 'react'
import { useIdToken } from '../hooks/useIdToken'
import { getPlanStatus, createSubscription, cancelSubscription, type PlanStatus } from '../actions/billing'
import {
  Card,
  Button,
  Banner,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Box,
  InlineGrid,
  Divider,
  Spinner,
} from '@shopify/polaris'

function TrialBanner({ daysLeft }: { daysLeft: number }) {
  return (
    <Banner
      title={`Your free trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}
      tone={daysLeft <= 2 ? 'warning' : 'info'}
    >
      <Text as="p" variant="bodyMd">
        After your trial, you'll need a subscription to continue running audits. Choose a plan below to keep your compliance history growing — it matters more than you might think.
      </Text>
    </Banner>
  )
}

function LegalValueProp() {
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          Why ongoing audits protect your business
        </Text>
        <Text as="p" variant="bodyMd">
          Under the ADA and WCAG guidelines, courts and regulators don't just look at whether your site is currently accessible — they look at whether you've made a <strong>genuine, documented effort</strong> to improve over time.
        </Text>
        <Text as="p" variant="bodyMd">
          A track record of regular audits and remediation attempts has been cited in multiple cases as evidence of good faith, leading to dismissed claims or significantly reduced settlements — even when violations were still present.
        </Text>
        <Text as="p" variant="bodyMd">
          Every audit you run is a timestamped record in your compliance history. The longer that history, the stronger your defense.
        </Text>
      </BlockStack>
    </Card>
  )
}

interface PlanCardProps {
  name: string
  price: string
  features: string[]
  planKey: 'basic' | 'pro'
  isCurrent: boolean
  isTrialing: boolean
  onUpgrade: (plan: 'basic' | 'pro') => void
  loading: boolean
}

function PlanCard({ name, price, features, planKey, isCurrent, isTrialing, onUpgrade, loading }: PlanCardProps) {
  const isPro = planKey === 'pro'
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h3" variant="headingMd">{name}</Text>
            <InlineStack gap="100" blockAlign="center">
              <Text as="p" variant="heading2xl">${price}</Text>
              <Text as="p" variant="bodyMd" tone="subdued">/month</Text>
            </InlineStack>
          </BlockStack>
          {isPro && (
            <Badge tone="success">Most Popular</Badge>
          )}
        </InlineStack>

        <Divider />

        <BlockStack gap="200">
          {features.map((f, i) => (
            <InlineStack key={i} gap="200" blockAlign="center">
              <Text as="span" variant="bodyMd">✓</Text>
              <Text as="p" variant="bodyMd">{f}</Text>
            </InlineStack>
          ))}
        </BlockStack>

        {isCurrent && !isTrialing ? (
          <Badge tone="success">Current Plan</Badge>
        ) : (
          <Button
            variant={isPro ? 'primary' : 'secondary'}
            onClick={() => onUpgrade(planKey)}
            loading={loading}
            fullWidth
          >
            {isTrialing ? `Subscribe to ${name}` : `Upgrade to ${name}`}
          </Button>
        )}
      </BlockStack>
    </Card>
  )
}

export function BillingTab() {
  const getIdToken = useIdToken()
  const [status, setStatus] = useState<PlanStatus | null>(null)
  const [loadingPlan, setLoadingPlan] = useState<'basic' | 'pro' | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    getIdToken().then((token) =>
      getPlanStatus(token).then(setStatus).catch(() => {})
    )
  }, [])

  const handleUpgrade = async (planKey: 'basic' | 'pro') => {
    setError(null)
    setLoadingPlan(planKey)
    try {
      const token = await getIdToken()
      const result = await createSubscription(planKey, token)
      if (!result.success) {
        setError(result.error || 'Failed to start subscription')
        return
      }
      // Redirect to Shopify billing confirmation
      if (result.confirmationUrl) {
        window.top!.location.href = result.confirmationUrl
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setLoadingPlan(null)
    }
  }

  const handleCancel = async () => {
    setError(null)
    setCancelling(true)
    try {
      const token = await getIdToken()
      const result = await cancelSubscription(token)
      if (!result.success) {
        setError(result.error || 'Failed to cancel subscription')
        return
      }
      setSuccessMessage('Subscription cancelled. You are now on the free plan.')
      const token2 = await getIdToken()
      const updated = await getPlanStatus(token2)
      setStatus(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setCancelling(false)
    }
  }

  if (!status) {
    return (
      <Box padding="800">
        <InlineStack align="center">
          <Spinner size="large" />
        </InlineStack>
      </Box>
    )
  }

  const { plan, trialActive, trialDaysLeft, effectivePlan } = status
  const isPaid = plan === 'basic' || plan === 'pro'

  return (
    <BlockStack gap="500">
      {/* Trial countdown banner */}
      {trialActive && trialDaysLeft !== null && (
        <TrialBanner daysLeft={trialDaysLeft} />
      )}

      {/* Billing success from callback redirect */}
      {typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('billing') === 'success' && (
        <Banner title="Subscription activated!" tone="success">
          <Text as="p" variant="bodyMd">Welcome to your plan. Your compliance history is now being built automatically.</Text>
        </Banner>
      )}

      {error && (
        <Banner title="Error" tone="critical" onDismiss={() => setError(null)}>
          <Text as="p" variant="bodyMd">{error}</Text>
        </Banner>
      )}

      {successMessage && (
        <Banner tone="success" onDismiss={() => setSuccessMessage(null)}>
          <Text as="p" variant="bodyMd">{successMessage}</Text>
        </Banner>
      )}

      {/* Current plan status */}
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Current Plan</Text>
          <InlineStack gap="300" blockAlign="center">
            {effectivePlan === 'trial' && <Badge tone="info">Free Trial</Badge>}
            {effectivePlan === 'free' && <Badge tone="attention">Free</Badge>}
            {effectivePlan === 'basic' && <Badge tone="success">Basic</Badge>}
            {effectivePlan === 'pro' && <Badge tone="success">Pro</Badge>}
            <Text as="p" variant="bodyMd" tone="subdued">
              {effectivePlan === 'trial' && `Full Pro access — ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} remaining`}
              {effectivePlan === 'free' && 'No scheduled audits — manual audits blocked'}
              {effectivePlan === 'basic' && 'Monthly scheduled audits, 1 manual audit/day'}
              {effectivePlan === 'pro' && 'Weekly scheduled audits, unlimited manual audits'}
            </Text>
          </InlineStack>

          {isPaid && (
            <Box>
              <Button
                variant="plain"
                tone="critical"
                onClick={handleCancel}
                loading={cancelling}
              >
                Cancel subscription
              </Button>
            </Box>
          )}
        </BlockStack>
      </Card>

      {/* Legal value prop — shown to everyone */}
      <LegalValueProp />

      {/* Plan cards — hide if already on pro and not trialing */}
      {!(plan === 'pro' && !trialActive) && (
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            {trialActive || plan === 'free' ? 'Choose a Plan' : 'Upgrade'}
          </Text>
          <InlineGrid columns={2} gap="400">
            <PlanCard
              name="Basic"
              price="9"
              planKey="basic"
              isCurrent={plan === 'basic'}
              isTrialing={trialActive}
              onUpgrade={handleUpgrade}
              loading={loadingPlan === 'basic'}
              features={[
                'Monthly automated full audit',
                '1 manual audit per day',
                'Full violation reports',
                'AI-powered fix suggestions',
                'Compliance history log',
              ]}
            />
            <PlanCard
              name="Pro"
              price="29"
              planKey="pro"
              isCurrent={plan === 'pro'}
              isTrialing={trialActive}
              onUpgrade={handleUpgrade}
              loading={loadingPlan === 'pro'}
              features={[
                'Weekly automated full audit',
                'Unlimited manual audits',
                'Full violation reports',
                'AI-powered fix suggestions',
                'Compliance history log',
                'Priority audit scheduling',
              ]}
            />
          </InlineGrid>
        </BlockStack>
      )}
    </BlockStack>
  )
}
