'use client'

import { useEffect } from 'react'
import { onCLS, onINP, onLCP } from 'web-vitals'
import type { Metric } from 'web-vitals'

function reportMetric(metric: Metric) {
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    const status =
      metric.name === 'LCP' ? (metric.value < 2500 ? 'PASS' : 'FAIL') :
      metric.name === 'CLS' ? (metric.value < 0.1 ? 'PASS' : 'FAIL') :
      metric.name === 'INP' ? (metric.value < 200 ? 'PASS' : 'FAIL') : '?'
    console.log(`[Web Vitals] ${metric.name}: ${metric.value.toFixed(2)} — ${status}`)
  }

  // Send to your analytics endpoint when ready
  // Example:
  // navigator.sendBeacon('/api/vitals', JSON.stringify({
  //   name: metric.name,
  //   value: metric.value,
  //   rating: metric.rating,
  //   id: metric.id,
  // }))
}

export function WebVitals() {
  useEffect(() => {
    onCLS(reportMetric)
    onINP(reportMetric)
    onLCP(reportMetric)
  }, [])

  return null
}
