'use client'

import { useState } from 'react'
import { runAccessibilityAudit } from './actions/audit'
import type { AuditResult, AuditError, ImpactLevel } from '@/types/audit'
import {
  AlertCircle,
  CheckCircle,
  Search,
  ExternalLink,
  AlertTriangle,
  Info,
  XCircle,
} from 'lucide-react'

export default function Dashboard() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AuditResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAudit = async () => {
    if (!url.trim()) {
      setError('Please enter a valid URL')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const auditResult = await runAccessibilityAudit(url)

      if ('error' in auditResult) {
        setError(auditResult.details || auditResult.error)
      } else {
        setResult(auditResult)
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getImpactColor = (impact: ImpactLevel) => {
    switch (impact) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'serious':
        return 'bg-orange-100 text-orange-800 border-orange-300'
      case 'moderate':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'minor':
        return 'bg-blue-100 text-blue-800 border-blue-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getImpactIcon = (impact: ImpactLevel) => {
    switch (impact) {
      case 'critical':
        return <XCircle className="w-5 h-5" />
      case 'serious':
        return <AlertCircle className="w-5 h-5" />
      case 'moderate':
        return <AlertTriangle className="w-5 h-5" />
      case 'minor':
        return <Info className="w-5 h-5" />
    }
  }

  return (
    <div className="min-h-screen bg-polaris-surface">
      {/* Header */}
      <header className="bg-white border-b border-polaris-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-polaris-primary rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-polaris-text">
                Accessibility Auditor
              </h1>
              <p className="text-sm text-polaris-textSubdued">
                Zero-Footprint WCAG 2.1 Compliance Checker
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Audit Input Card */}
        <div className="bg-white rounded-lg shadow-sm border border-polaris-border p-6 mb-6">
          <h2 className="text-lg font-semibold text-polaris-text mb-4">
            Run New Audit
          </h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAudit()}
                placeholder="https://example.com"
                className="w-full px-4 py-2.5 border border-polaris-border rounded-lg focus:outline-none focus:ring-2 focus:ring-polaris-primary focus:border-transparent"
                disabled={loading}
              />
            </div>
            <button
              onClick={handleAudit}
              disabled={loading}
              className="px-6 py-2.5 bg-polaris-primary text-white font-medium rounded-lg hover:bg-polaris-primaryDark focus:outline-none focus:ring-2 focus:ring-polaris-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Run Audit
                </>
              )}
            </button>
          </div>
          <p className="text-sm text-polaris-textSubdued mt-2">
            Enter any publicly accessible URL to perform a WCAG 2.1 Level A/AA
            accessibility audit
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-red-900">Audit Failed</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Results Display */}
        {result && (
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="bg-white rounded-lg shadow-sm border border-polaris-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-polaris-text">
                  Audit Results
                </h2>
                <span className="text-sm text-polaris-textSubdued">
                  {new Date(result.timestamp).toLocaleString()}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-4 text-polaris-textSubdued">
                <ExternalLink className="w-4 h-4" />
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm hover:text-polaris-primary underline"
                >
                  {result.url}
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                <div className="bg-polaris-surface rounded-lg p-4 border border-polaris-border">
                  <div className="text-2xl font-bold text-polaris-text">
                    {result.totalViolations}
                  </div>
                  <div className="text-sm text-polaris-textSubdued mt-1">
                    Total Issues
                  </div>
                </div>
                <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                  <div className="text-2xl font-bold text-red-900">
                    {result.violationsByImpact.critical}
                  </div>
                  <div className="text-sm text-red-700 mt-1">Critical</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                  <div className="text-2xl font-bold text-orange-900">
                    {result.violationsByImpact.serious}
                  </div>
                  <div className="text-sm text-orange-700 mt-1">Serious</div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                  <div className="text-2xl font-bold text-yellow-900">
                    {result.violationsByImpact.moderate}
                  </div>
                  <div className="text-sm text-yellow-700 mt-1">Moderate</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="text-2xl font-bold text-blue-900">
                    {result.violationsByImpact.minor}
                  </div>
                  <div className="text-sm text-blue-700 mt-1">Minor</div>
                </div>
              </div>
            </div>

            {/* Violations List */}
            {result.violations.length > 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-polaris-border p-6">
                <h3 className="text-lg font-semibold text-polaris-text mb-4">
                  Accessibility Violations
                </h3>
                <div className="space-y-4">
                  {result.violations.map((violation, index) => (
                    <div
                      key={`${violation.id}-${index}`}
                      className={`border rounded-lg p-4 ${getImpactColor(
                        violation.impact
                      )}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {getImpactIcon(violation.impact)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold uppercase text-xs px-2 py-1 rounded bg-white bg-opacity-50">
                              {violation.impact}
                            </span>
                            <h4 className="font-semibold">{violation.help}</h4>
                          </div>
                          <p className="text-sm mb-3">{violation.description}</p>
                          <div className="text-sm mb-3">
                            <strong>Affected Elements:</strong>{' '}
                            {violation.nodes.length}
                          </div>
                          {violation.nodes.slice(0, 3).map((node, nodeIndex) => (
                            <div
                              key={nodeIndex}
                              className="bg-white bg-opacity-50 rounded p-3 mb-2 text-sm"
                            >
                              <div className="font-mono text-xs mb-2 overflow-x-auto">
                                {node.html}
                              </div>
                              <div className="text-xs text-polaris-textSubdued">
                                Selector: {node.target.join(' > ')}
                              </div>
                            </div>
                          ))}
                          {violation.nodes.length > 3 && (
                            <p className="text-sm italic">
                              + {violation.nodes.length - 3} more affected
                              elements
                            </p>
                          )}
                          <a
                            href={violation.helpUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm font-medium hover:underline mt-2"
                          >
                            Learn more <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-green-900">
                    No Violations Found
                  </h3>
                  <p className="text-sm text-green-700 mt-1">
                    This page passed all WCAG 2.1 Level A/AA checks!
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Info Footer */}
        {!result && !error && !loading && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-blue-900 mb-2">
                  About This Tool
                </h3>
                <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                  <li>
                    Server-side auditing using Playwright and Axe-core
                  </li>
                  <li>
                    Zero client-side JavaScript overlays for better performance
                  </li>
                  <li>WCAG 2.1 Level A and AA compliance checking</li>
                  <li>
                    Detailed violation reports with actionable recommendations
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
