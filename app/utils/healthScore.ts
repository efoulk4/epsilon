import type { AuditResult } from '@/types/audit'

/**
 * Calculate a health score (0-100) based on accessibility violations
 *
 * Scoring logic:
 * - Start at 100
 * - Critical: -10 points each
 * - Serious: -5 points each
 * - Moderate: -2 points each
 * - Minor: -1 point each
 * - Minimum score: 0
 */
export function calculateHealthScore(result: AuditResult): number {
  const { violationsByImpact } = result

  let score = 100

  score -= violationsByImpact.critical * 10
  score -= violationsByImpact.serious * 5
  score -= violationsByImpact.moderate * 2
  score -= violationsByImpact.minor * 1

  return Math.max(0, score)
}

/**
 * Get the status and color based on health score
 */
export function getHealthStatus(score: number): {
  status: 'critical' | 'warning' | 'attention' | 'success'
  label: string
  color: string
} {
  if (score >= 90) {
    return { status: 'success', label: 'Excellent', color: '#008060' }
  } else if (score >= 70) {
    return { status: 'attention', label: 'Good', color: '#2C6ECB' }
  } else if (score >= 50) {
    return { status: 'warning', label: 'Needs Improvement', color: '#FFC453' }
  } else {
    return { status: 'critical', label: 'Poor', color: '#D72C0D' }
  }
}
