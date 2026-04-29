'use client'

import { useState } from 'react'
import { Page, BlockStack, Tabs, Spinner } from '@shopify/polaris'
import { AuditTab } from './components/AuditTab'
import { useIsEmbedded } from './hooks/useIsEmbedded'
import dynamic from 'next/dynamic'

const HistoryTab = dynamic(
  () => import('./components/HistoryTab').then((m) => m.HistoryTab),
  { ssr: false, loading: () => <Spinner size="large" /> }
)

const BillingTab = dynamic(
  () => import('./components/BillingTab').then((m) => m.BillingTab),
  { ssr: false, loading: () => <Spinner size="large" /> }
)

export default function Dashboard() {
  const { isEmbedded, shop } = useIsEmbedded()
  const [selectedTabIndex, setSelectedTabIndex] = useState(0)
  const [historyVisited, setHistoryVisited] = useState(false)
  const [billingVisited, setBillingVisited] = useState(false)

  function handleTabSelect(index: number) {
    if (index === 1) setHistoryVisited(true)
    if (index === 2) setBillingVisited(true)
    setSelectedTabIndex(index)
  }

  const tabs = isEmbedded
    ? [
        { id: 'audit',   content: 'Run Audit' },
        { id: 'history', content: 'History' },
        { id: 'billing', content: 'Billing' },
      ]
    : [
        { id: 'audit', content: 'Run Audit' },
      ]

  return (
    <Page
      title="Accessibility Auditor"
      subtitle="Zero-Footprint WCAG 2.1 Compliance Checker"
    >
      <BlockStack gap="500">
        <Tabs tabs={tabs} selected={selectedTabIndex} onSelect={handleTabSelect}>
          <div style={{ display: selectedTabIndex === 0 ? 'block' : 'none' }}>
            <AuditTab />
          </div>
          <div style={{ display: isEmbedded && selectedTabIndex === 1 ? 'block' : 'none' }}>
            {isEmbedded && historyVisited && <HistoryTab shop={shop} />}
          </div>
          <div style={{ display: isEmbedded && selectedTabIndex === 2 ? 'block' : 'none' }}>
            {isEmbedded && billingVisited && <BillingTab />}
          </div>
        </Tabs>
      </BlockStack>
    </Page>
  )
}
