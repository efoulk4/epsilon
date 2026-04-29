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
import { useIdToken } from '../hooks/useIdToken'
import { calculateHealthScore } from '../utils/healthScore'
import type { AuditResult } from '@/types/audit'

interface HistoryTabProps {
  shop: string | null
}

export function HistoryTab({ shop }: HistoryTabProps) {
  const getIdToken = useIdToken()
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<AuditResult[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!shop) {
        setError('Shop information not available')
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const idToken = await getIdToken()
        const results = await getAuditHistory(`https://${shop}`, 30, idToken)
        setHistory(results)
        if (results.length === 0) {
          setError('No audit history yet. Run an audit to get started!')
        }
      } catch {
        setError('Failed to load audit history')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [shop])

  const chartData = history.map((audit) => ({
    date: new Date(audit.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    healthScore: calculateHealthScore(audit),
    critical: audit.violationsByImpact.critical,
    serious: audit.violationsByImpact.serious,
    moderate: audit.violationsByImpact.moderate,
    minor: audit.violationsByImpact.minor,
  }))

  const stats = history.length > 0 ? {
    latest: calculateHealthScore(history[history.length - 1]),
    average: Math.round(history.reduce((sum, a) => sum + calculateHealthScore(a), 0) / history.length),
    trend: history.length > 1
      ? calculateHealthScore(history[history.length - 1]) - calculateHealthScore(history[0])
      : 0,
  } : null

  return (
    <BlockStack gap="500">
      {loading && (
        <Card>
          <BlockStack gap="400" inlineAlign="center">
            <Spinner size="large" />
            <Text as="p" variant="bodyMd" tone="subdued">Loading audit history...</Text>
          </BlockStack>
        </Card>
      )}

      {error && <Banner tone="info"><p>{error}</p></Banner>}

      {history.length > 0 && stats && (
        <BlockStack gap="500">
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">Performance Summary</Text>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text as="p" variant="heading2xl">{stats.latest}</Text>
                    <Text as="p" variant="bodyMd" tone="subdued">Latest Score</Text>
                  </BlockStack>
                </Card>
                <Card background="bg-surface-secondary">
                  <BlockStack gap="200">
                    <Text as="p" variant="heading2xl">{stats.average}</Text>
                    <Text as="p" variant="bodyMd" tone="subdued">Average Score</Text>
                  </BlockStack>
                </Card>
                <Card background={stats.trend >= 0 ? 'bg-surface-success' : 'bg-surface-critical'}>
                  <BlockStack gap="200">
                    <Text as="p" variant="heading2xl">{stats.trend > 0 ? '+' : ''}{stats.trend}</Text>
                    <Text as="p" variant="bodyMd">Trend</Text>
                  </BlockStack>
                </Card>
              </div>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">Health Score Over Time</Text>
              <div style={{ width: '100%', height: 400 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" style={{ fontSize: '12px' }} />
                    <YAxis domain={[0, 100]} style={{ fontSize: '12px' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e1e3e5', borderRadius: '8px' }} />
                    <Legend />
                    <Line type="monotone" dataKey="healthScore" stroke="#008060" strokeWidth={3} name="Health Score" dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">Violations Breakdown</Text>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" style={{ fontSize: '12px' }} />
                    <YAxis style={{ fontSize: '12px' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e1e3e5', borderRadius: '8px' }} />
                    <Legend />
                    <Line type="monotone" dataKey="critical" stroke="#D72C0D" strokeWidth={2} name="Critical" />
                    <Line type="monotone" dataKey="serious" stroke="#FFC453" strokeWidth={2} name="Serious" />
                    <Line type="monotone" dataKey="moderate" stroke="#2C6ECB" strokeWidth={2} name="Moderate" />
                    <Line type="monotone" dataKey="minor" stroke="#8C9196" strokeWidth={2} name="Minor" />
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
