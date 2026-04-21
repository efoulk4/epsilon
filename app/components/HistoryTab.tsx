'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  BlockStack,
  Text,
  Banner,
  Spinner,
} from '@shopify/polaris'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { getAuditHistory } from '../actions/audit'
import { calculateHealthScore } from '../utils/healthScore'
import type { AuditResult } from '@/types/audit'
import { isSupabaseConfigured } from '@/lib/supabase'

interface HistoryTabProps {
  shop: string | null
}

export function HistoryTab({ shop }: HistoryTabProps) {
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<AuditResult[]>([])
  const [error, setError] = useState<string | null>(null)

  // Auto-load history for the shop
  useEffect(() => {
    const loadHistory = async () => {
      if (!shop) {
        setError('Shop information not available')
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        // Construct the shop URL
        const shopUrl = `https://${shop}`
        const results = await getAuditHistory(shopUrl, 30)
        setHistory(results)

        if (results.length === 0) {
          setError('No audit history found for your store yet. Run an audit to get started!')
        }
      } catch (err) {
        setError('Failed to load audit history')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    loadHistory()
  }, [shop])

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
      {loading && (
        <Card>
          <BlockStack gap="400" inlineAlign="center">
            <Spinner size="large" />
            <Text as="p" variant="bodyMd" tone="subdued">
              Loading audit history for your store...
            </Text>
          </BlockStack>
        </Card>
      )}

      {error && (
        <Banner tone="info">
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

    </BlockStack>
  )
}
