'use client'

import { useState } from 'react'
import { Page, BlockStack, Tabs } from '@shopify/polaris'
import { AuditTab } from './components/AuditTab'
import { HistoryTab } from './components/HistoryTab'

export default function Dashboard() {
  const [selectedTabIndex, setSelectedTabIndex] = useState(0)

  const tabs = [
    {
      id: 'audit',
      content: 'Run Audit',
    },
    {
      id: 'history',
      content: 'History',
    },
  ]

  return (
    <Page
      title="Accessibility Auditor"
      subtitle="Zero-Footprint WCAG 2.1 Compliance Checker"
    >
      <BlockStack gap="500">
        <Tabs tabs={tabs} selected={selectedTabIndex} onSelect={setSelectedTabIndex}>
          {selectedTabIndex === 0 ? <AuditTab /> : <HistoryTab />}
        </Tabs>
      </BlockStack>
    </Page>
  )
}
