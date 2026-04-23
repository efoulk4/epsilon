import type { Metadata } from 'next'
import './globals.css'
import { PolarisProvider } from './providers/PolarisProvider'
import { AppBridgeProvider } from './components/providers/AppBridgeProvider'
import { WebVitals } from './components/WebVitals'
import { Suspense } from 'react'

export const metadata: Metadata = {
  title: 'Accessibility Auditor - Zero-Footprint WCAG Checker',
  description: 'Server-side accessibility auditing for Shopify stores using Axe-core and Playwright',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <WebVitals />
        <Suspense fallback={<div>Loading...</div>}>
          <AppBridgeProvider>
            <PolarisProvider>{children}</PolarisProvider>
          </AppBridgeProvider>
        </Suspense>
      </body>
    </html>
  )
}
