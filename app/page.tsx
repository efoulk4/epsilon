'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Page, BlockStack, Tabs } from '@shopify/polaris'
import { AuditTab } from './components/AuditTab'
import { HistoryTab } from './components/HistoryTab'

export default function Dashboard() {
  const searchParams = useSearchParams()
  const [selectedTabIndex, setSelectedTabIndex] = useState(0)
  const [isEmbedded, setIsEmbedded] = useState(false)
  const [shop, setShop] = useState<string | null>(null)

  // Detect if running in Shopify embedded context
  useEffect(() => {
    const shopParam = searchParams.get('shop')
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
          {/* Keep both tabs mounted so audit results survive a tab switch */}
          <div style={{ display: selectedTabIndex === 0 ? 'block' : 'none' }}>
            <AuditTab />
          </div>
          {isEmbedded && (
            <div style={{ display: selectedTabIndex === 1 ? 'block' : 'none' }}>
              <HistoryTab shop={shop} />
            </div>
          )}
        </Tabs>
      </BlockStack>
    </Page>
  )
}
