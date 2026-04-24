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

export default function Dashboard() {
  const { isEmbedded, shop } = useIsEmbedded()
  const [selectedTabIndex, setSelectedTabIndex] = useState(0)

  // Only show History tab when embedded
  const tabs = isEmbedded
    ? [
        {
          id: 'audit',
          content: 'Run Audit',
        },
        {
          id: 'history',
          content: 'History',
        },
      ]
    : [
        {
          id: 'audit',
          content: 'Run Audit',
        },
      ]

  return (
    <Page
      title="Accessibility Auditor"
      subtitle="Zero-Footprint WCAG 2.1 Compliance Checker"
    >
      <BlockStack gap="500">
        <Tabs tabs={tabs} selected={selectedTabIndex} onSelect={setSelectedTabIndex}>
          {/* Both tabs stay mounted — display:none preserves state across tab switches */}
          <div style={{ display: selectedTabIndex === 0 ? 'block' : 'none' }}>
            <AuditTab />
          </div>
          <div style={{ display: isEmbedded && selectedTabIndex === 1 ? 'block' : 'none' }}>
            {isEmbedded && <HistoryTab shop={shop} />}
          </div>
        </Tabs>
      </BlockStack>
    </Page>
  )
}
