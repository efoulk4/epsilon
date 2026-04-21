'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  BlockStack,
  Text,
  TextField,
  Button,
  Banner,
  InlineStack,
} from '@shopify/polaris'
import { SearchIcon } from '@shopify/polaris-icons'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { getAuditHistory } from '../actions/audit'
import { calculateHealthScore } from '../utils/healthScore'
import type { AuditResult } from '@/types/audit'
import { isSupabaseConfigured } from '@/lib/supabase'

export function HistoryTab() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<AuditResult[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleFetchHistory = async () => {
    if (!url.trim()) {
      setError('Please enter a URL')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const results = await getAuditHistory(url, 30)
      setHistory(results)

      if (results.length === 0) {
        setError('No audit history found for this URL in the last 30 days')
      }
    } catch (err) {
      setError('Failed to fetch audit history')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Prepare chart data
  const chartData = history.map((audit) => ({
    date: new Date(audit.timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    healthScore: calculateHealthScore(audit),
    critical: audit.violationsByImpact.critical,
    serious: audit.violationsByImpact.serious,
    moderate: audit.violationsByImpact.moderate,
    minor: audit.violationsByImpact.minor,
  }))

  // Calculate stats
  const stats = history.length > 0 ? {
    latest: calculateHealthScore(history[history.length - 1]),
    average: Math.round(
      history.reduce((sum, audit) => sum + calculateHealthScore(audit), 0) / history.length
    ),
    trend:
      history.length > 1
        ? calculateHealthScore(history[history.length - 1]) -
          calculateHealthScore(history[0])
        : 0,
  } : null

  return (
    <BlockStack gap="500">
      {!isSupabaseConfigured && (
        <Banner tone="warning" title="Supabase Not Configured">
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd">
              To use the History feature, you need to set up Supabase. Follow these steps:
            </Text>
            <Text as="p" variant="bodyMd">
              1. Create a Supabase project at supabase.com
            </Text>
            <Text as="p" variant="bodyMd">
              2. Run the database migration from supabase/migrations/001_create_audits_table.sql
            </Text>
            <Text as="p" variant="bodyMd">
              3. Update .env.local with your Supabase URL and anon key
            </Text>
            <Text as="p" variant="bodyMd">
              4. Restart the dev server
            </Text>
            <Text as="p" variant="bodyMd">
              See SUPABASE_SETUP.md for detailed instructions.
            </Text>
          </BlockStack>
        </Banner>
      )}

      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            View Audit History
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
              variant="primary"
              onClick={handleFetchHistory}
              loading={loading}
              icon={SearchIcon}
            >
              View History
            </Button>
          </InlineStack>
          <Text as="p" variant="bodyMd" tone="subdued">
            View the health score trend for any URL over the last 30 days
          </Text>
        </BlockStack>
      </Card>

      {error && (
        <Banner tone="warning">
          <p>{error}</p>
        </Banner>
      )}

      {history.length > 0 && stats && (
        <BlockStack gap="500">
          {/* Stats Cards */}
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                Performance Summary
              </Text>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text as="p" variant="heading2xl">
                      {stats.latest}
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Latest Score
                    </Text>
                  </BlockStack>
                </Card>
                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text as="p" variant="heading2xl">
                      {stats.average}
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Average Score
                    </Text>
                  </BlockStack>
                </Card>
                <Card background={stats.trend >= 0 ? 'bg-surface-success' : 'bg-surface-critical'}>
                  <BlockStack gap="200">
                    <Text as="p" variant="heading2xl">
                      {stats.trend > 0 ? '+' : ''}{stats.trend}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      Trend
                    </Text>
                  </BlockStack>
                </Card>
              </div>
            </BlockStack>
          </Card>

          {/* Health Score Chart */}
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                Health Score Over Time
              </Text>
              <div style={{ width: '100%', height: 400 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      style={{ fontSize: '12px' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e1e3e5',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="healthScore"
                      stroke="#008060"
                      strokeWidth={3}
                      name="Health Score"
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </BlockStack>
          </Card>

          {/* Violations Breakdown Chart */}
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                Violations Breakdown
              </Text>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      style={{ fontSize: '12px' }}
                    />
                    <YAxis style={{ fontSize: '12px' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e1e3e5',
                        borderRadius: '8px',
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="critical"
                      stroke="#D72C0D"
                      strokeWidth={2}
                      name="Critical"
                    />
                    <Line
                      type="monotone"
                      dataKey="serious"
                      stroke="#FFC453"
                      strokeWidth={2}
                      name="Serious"
                    />
                    <Line
                      type="monotone"
                      dataKey="moderate"
                      stroke="#2C6ECB"
                      strokeWidth={2}
                      name="Moderate"
                    />
                    <Line
                      type="monotone"
                      dataKey="minor"
                      stroke="#8C9196"
                      strokeWidth={2}
                      name="Minor"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </BlockStack>
          </Card>
        </BlockStack>
      )}

      {!error && history.length === 0 && !loading && (
        <Banner tone="info" title="No Data Yet">
          <p>Enter a URL above to view its accessibility audit history over the last 30 days.</p>
        </Banner>
      )}
    </BlockStack>
  )
}
